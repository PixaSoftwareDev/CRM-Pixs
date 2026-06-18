// Package main is the entry point for the PIXS HTTP API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"

	"pixs/internal/auth/encrypt"
	"pixs/internal/auth/rbac"
	"pixs/internal/auth/session"
	"pixs/internal/config"
	sqlcgen "pixs/internal/repository/sqlc"
	svccalendar "pixs/internal/service/calendar"
	svccontact "pixs/internal/service/contact"
	svcidentity "pixs/internal/service/identity"
	svcproject "pixs/internal/service/project"
	svcsales "pixs/internal/service/sales"
	svctask "pixs/internal/service/task"
	svctimetracking "pixs/internal/service/timetracking"
	"pixs/internal/transport/http/handler"
	mw "pixs/internal/transport/http/middleware"
	"pixs/internal/transport/http/validator"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	logger := buildLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	slog.Info("starting PIXS API", "env", cfg.Environment, "port", cfg.HTTPPort)

	// --- Postgres ---
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("parsing DATABASE_URL: %w", err)
	}
	poolCfg.MinConns = 10
	poolCfg.MaxConns = 25

	db, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		return fmt.Errorf("creating postgres pool: %w", err)
	}
	defer db.Close()

	if err := db.Ping(context.Background()); err != nil {
		return fmt.Errorf("postgres ping: %w", err)
	}
	slog.Info("postgres connected")

	// --- Redis ---
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("parsing REDIS_URL: %w", err)
	}
	rdb := redis.NewClient(redisOpts)
	defer func() {
		if closeErr := rdb.Close(); closeErr != nil {
			slog.Warn("redis close error", "err", closeErr)
		}
	}()

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return fmt.Errorf("redis ping: %w", err)
	}
	slog.Info("redis connected")

	// --- Auth infrastructure ---
	cipher, err := encrypt.New(cfg.EncryptionKey)
	if err != nil {
		return fmt.Errorf("initializing encryption: %w", err)
	}

	sessStore := session.New(rdb, db, cfg.SessionTTLHours, cfg.MaxSessionsPerUser)

	q := sqlcgen.New(db)
	roles, err := q.ListRoles(context.Background(), seedCompanyID())
	if err != nil {
		return fmt.Errorf("loading roles: %w", err)
	}
	policy, err := svcidentity.LoadPolicy(context.Background(), q, roles)
	if err != nil {
		return fmt.Errorf("loading rbac policy: %w", err)
	}

	authSvc := svcidentity.NewAuthService(db, sessStore, cipher, policy, logger)

	// --- Echo ---
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Validator = validator.New()

	e.Use(middleware.RequestID())
	e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogStatus:    true,
		LogURI:       true,
		LogMethod:    true,
		LogLatency:   true,
		LogRequestID: true,
		LogError:     true,
		HandleError:  true,
		LogValuesFunc: func(_ echo.Context, v middleware.RequestLoggerValues) error {
			attrs := []any{
				"method", v.Method,
				"uri", v.URI,
				"status", v.Status,
				"latency_ms", v.Latency.Milliseconds(),
				"request_id", v.RequestID,
			}
			if v.Error != nil {
				attrs = append(attrs, "err", v.Error)
				slog.Error("request", attrs...)
			} else {
				slog.Info("request", attrs...)
			}
			return nil
		},
	}))
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: cfg.CORSAllowedOrigins,
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
			"X-Request-ID",
			"X-Idempotency-Key",
		},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete},
		AllowCredentials: true,
	}))

	contactSvc := svccontact.NewContactService(db, cipher, logger)
	calendarSvc := svccalendar.NewCalendarService(db, logger)

	salesProjectTask := &salesProjectTaskServices{
		products:      svcsales.NewProductService(db, logger),
		opportunities: svcsales.NewOpportunityService(db, logger),
		quotes:        svcsales.NewQuoteService(db, logger),
		projects:      svcproject.NewProjectService(db, logger),
		profitability: svcproject.NewProfitabilityService(db, logger),
		tasks:         svctask.NewTaskService(db, logger),
		timers:        svctask.NewTimerService(db, logger),
		timeTracking:  svctimetracking.NewTimeTrackingService(db, logger),
	}

	registerRoutes(e, db, rdb, sessStore, q, policy, authSvc, contactSvc, calendarSvc, salesProjectTask, logger)

	// --- Graceful shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		addr := ":" + cfg.HTTPPort
		slog.Info("server listening", "addr", addr)
		if err := e.Start(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
		}
	}()

	<-quit
	slog.Info("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		slog.Error("echo shutdown error", "err", err)
	}

	slog.Info("server stopped")
	return nil
}

func registerRoutes(
	e *echo.Echo,
	db *pgxpool.Pool,
	rdb *redis.Client,
	sessStore *session.Store,
	q *sqlcgen.Queries,
	policy *rbac.Policy,
	authSvc *svcidentity.AuthService,
	contactSvc *svccontact.ContactService,
	calendarSvc *svccalendar.CalendarService,
	spt *salesProjectTaskServices,
	logger *slog.Logger,
) {
	e.GET("/health", healthHandler(db, rdb))

	authDeps := mw.AuthDeps{
		Sessions: sessStore,
		Queries:  q,
		Logger:   logger,
	}
	authMiddleware := mw.RequireAuth(authDeps)

	// Rate limiters for login and password reset.
	loginIPLimit := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  5,
		Window: 15 * time.Minute,
		Prefix: "login:ip",
	})
	pwdResetLimit := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  3,
		Window: time.Hour,
		Prefix: "pwdreset:ip",
	})

	authHandler := handler.NewAuthHandler(authSvc)

	// Mount /auth group — apply rate limits selectively per handler.
	auth := e.Group("/auth")

	// Rate-limited public endpoints.
	auth.POST("/login", authHandler.Login, loginIPLimit)
	auth.POST("/login/totp", authHandler.LoginTOTP, loginIPLimit)
	auth.POST("/password-reset/request", authHandler.RequestPasswordReset, pwdResetLimit)
	auth.POST("/password-reset/confirm", authHandler.ConfirmPasswordReset, pwdResetLimit)

	// Protected endpoints (session required).
	protected := auth.Group("", authMiddleware)
	protected.POST("/logout", authHandler.Logout)
	protected.GET("/me", authHandler.Me)
	protected.GET("/sessions", authHandler.ListSessions)
	protected.DELETE("/sessions/:id", authHandler.RevokeSession)
	protected.POST("/2fa/enable", authHandler.Enable2FA)
	protected.POST("/2fa/verify", authHandler.Verify2FA)
	protected.POST("/2fa/disable", authHandler.Disable2FA)

	registerCRMRoutes(e, authMiddleware, policy, contactSvc, calendarSvc)
	registerSalesProjectTaskRoutes(e, authMiddleware, policy, spt)
}

// salesProjectTaskServices bundles the services for the sales, projects,
// tasks, and time-tracking bounded contexts.
type salesProjectTaskServices struct {
	products      *svcsales.ProductService
	opportunities *svcsales.OpportunityService
	quotes        *svcsales.QuoteService
	projects      *svcproject.ProjectService
	profitability *svcproject.ProfitabilityService
	tasks         *svctask.TaskService
	timers        *svctask.TimerService
	timeTracking  *svctimetracking.TimeTrackingService
}

func registerSalesProjectTaskRoutes(
	e *echo.Echo,
	authMiddleware echo.MiddlewareFunc,
	policy *rbac.Policy,
	spt *salesProjectTaskServices,
) {
	salesH := handler.NewSalesHandler(spt.products, spt.opportunities, spt.quotes)
	projectH := handler.NewProjectHandler(spt.projects, spt.profitability)
	taskH := handler.NewTaskHandler(spt.tasks, spt.timers, spt.timeTracking)

	api := e.Group("/api/v1", authMiddleware)

	// ─── Products ────────────────────────────────────────────────────────────────
	canViewProducts := mw.RequirePermission(policy, "products", "view")
	canManageProducts := mw.RequirePermission(policy, "products", "manage")
	products := api.Group("/products")
	products.GET("", salesH.ListProducts, canViewProducts)
	products.POST("", salesH.CreateProduct, canManageProducts)
	products.GET("/:id", salesH.GetProduct, canViewProducts)
	products.PUT("/:id", salesH.UpdateProduct, canManageProducts)
	products.DELETE("/:id", salesH.DeleteProduct, canManageProducts)

	// ─── Pipeline / Opportunities ──────────────────────────────────────────────────
	canViewPipeline := mw.RequirePermission(policy, "pipeline", "view")
	canCreatePipeline := mw.RequirePermission(policy, "pipeline", "create")
	canEditPipeline := mw.RequirePermission(policy, "pipeline", "edit")

	pipeline := api.Group("/pipeline")
	pipeline.GET("/stages", salesH.ListStages, canViewPipeline)
	pipeline.GET("/lost-reasons", salesH.ListLostReasons, canViewPipeline)
	pipeline.GET("/forecast", salesH.GetForecast, canViewPipeline)

	opportunities := api.Group("/opportunities")
	opportunities.GET("", salesH.ListOpportunities, canViewPipeline)
	opportunities.POST("", salesH.CreateOpportunity, canCreatePipeline)
	opportunities.GET("/:id", salesH.GetOpportunity, canViewPipeline)
	opportunities.PUT("/:id", salesH.UpdateOpportunity, canEditPipeline)
	opportunities.DELETE("/:id", salesH.DeleteOpportunity, canEditPipeline)
	opportunities.POST("/:id/move", salesH.MoveOpportunityStage, canEditPipeline)
	opportunities.POST("/:id/win", salesH.WinOpportunity, canEditPipeline)
	opportunities.POST("/:id/lose", salesH.LoseOpportunity, canEditPipeline)

	// ─── Quotes ────────────────────────────────────────────────────────────────────
	canViewQuotes := mw.RequirePermission(policy, "quotes", "view")
	canCreateQuotes := mw.RequirePermission(policy, "quotes", "create")
	canEditQuotes := mw.RequirePermission(policy, "quotes", "edit")

	quotes := api.Group("/quotes")
	quotes.GET("", salesH.ListQuotes, canViewQuotes)
	quotes.POST("", salesH.CreateQuote, canCreateQuotes)
	quotes.GET("/:id", salesH.GetQuote, canViewQuotes)
	quotes.PUT("/:id", salesH.UpdateQuote, canEditQuotes)
	quotes.DELETE("/:id", salesH.DeleteQuote, canEditQuotes)
	quotes.POST("/:id/status", salesH.ChangeQuoteStatus, canEditQuotes)
	quotes.GET("/:id/versions", salesH.ListQuoteVersions, canViewQuotes)

	// ─── Projects ──────────────────────────────────────────────────────────────────
	canViewProjects := mw.RequirePermission(policy, "projects", "view")
	canCreateProjects := mw.RequirePermission(policy, "projects", "create")
	canEditProjects := mw.RequirePermission(policy, "projects", "edit")
	canViewProfitability := mw.RequirePermission(policy, "projects", "view_profitability")

	projects := api.Group("/projects")
	projects.GET("", projectH.ListProjects, canViewProjects)
	projects.POST("", projectH.CreateProject, canCreateProjects)
	projects.GET("/:id", projectH.GetProject, canViewProjects)
	projects.PUT("/:id", projectH.UpdateProject, canEditProjects)
	projects.DELETE("/:id", projectH.DeleteProject, canEditProjects)
	projects.GET("/:id/profitability", projectH.GetProfitability, canViewProfitability)

	projects.GET("/:id/milestones", projectH.ListMilestones, canViewProjects)
	projects.POST("/:id/milestones", projectH.CreateMilestone, canEditProjects)
	projects.PUT("/:id/milestones/:milestone_id", projectH.UpdateMilestone, canEditProjects)
	projects.DELETE("/:id/milestones/:milestone_id", projectH.DeleteMilestone, canEditProjects)

	projects.GET("/:id/members", projectH.ListMembers, canViewProjects)
	projects.POST("/:id/members", projectH.AddMember, canEditProjects)
	projects.DELETE("/:id/members/:user_id", projectH.RemoveMember, canEditProjects)

	// ─── Tasks ─────────────────────────────────────────────────────────────────────
	canViewTasks := mw.RequirePermission(policy, "tasks", "view")
	canCreateTasks := mw.RequirePermission(policy, "tasks", "create")
	canEditTasks := mw.RequirePermission(policy, "tasks", "edit")
	canAssignTasks := mw.RequirePermission(policy, "tasks", "assign")

	tasks := api.Group("/tasks")
	tasks.GET("", taskH.ListTasks, canViewTasks)
	tasks.POST("", taskH.CreateTask, canCreateTasks)
	tasks.GET("/:id", taskH.GetTask, canViewTasks)
	tasks.PUT("/:id", taskH.UpdateTask, canEditTasks)
	tasks.DELETE("/:id", taskH.DeleteTask, canEditTasks)
	tasks.POST("/:id/status", taskH.ChangeTaskStatus, canEditTasks)
	tasks.POST("/:id/assign", taskH.ReassignTask, canAssignTasks)
	tasks.GET("/:id/comments", taskH.ListComments, canViewTasks)
	tasks.POST("/:id/comments", taskH.AddComment, canViewTasks)
	tasks.GET("/:id/history", taskH.GetHistory, canViewTasks)
	tasks.POST("/:id/timer/start", taskH.StartTimer, canEditTasks)
	tasks.POST("/:id/timer/stop", taskH.StopTimer, canEditTasks)

	// ─── Time tracking ─────────────────────────────────────────────────────────────
	canViewOwnTime := mw.RequirePermission(policy, "time_tracking", "view_own")
	timeEntries := api.Group("/time-entries")
	timeEntries.GET("", taskH.ListTimeEntries, canViewOwnTime)
	timeEntries.POST("", taskH.CreateTimeEntry, canViewOwnTime)
	timeEntries.GET("/timesheet", taskH.GetTimesheet, canViewOwnTime)
	timeEntries.GET("/utilization", taskH.GetUtilization, canViewOwnTime)
}

func registerCRMRoutes(
	e *echo.Echo,
	authMiddleware echo.MiddlewareFunc,
	policy *rbac.Policy,
	contactSvc *svccontact.ContactService,
	calendarSvc *svccalendar.CalendarService,
) {
	contactH := handler.NewContactHandler(contactSvc)
	calendarH := handler.NewCalendarHandler(calendarSvc)

	// All CRM routes require authentication.
	api := e.Group("/api/v1", authMiddleware)

	// ─── Contacts ──────────────────────────────────────────────────────────────
	contacts := api.Group("/contacts")
	canViewContacts := mw.RequirePermission(policy, "contacts", "view")
	canCreateContacts := mw.RequirePermission(policy, "contacts", "create")
	canEditContacts := mw.RequirePermission(policy, "contacts", "edit")
	canDeleteContacts := mw.RequirePermission(policy, "contacts", "delete")

	contacts.GET("", contactH.ListContacts, canViewContacts)
	contacts.POST("", contactH.CreateContact, canCreateContacts)
	contacts.GET("/:id", contactH.GetContact, canViewContacts)
	contacts.PUT("/:id", contactH.UpdateContact, canEditContacts)
	contacts.DELETE("/:id", contactH.DeleteContact, canDeleteContacts)
	contacts.GET("/:id/timeline", contactH.GetTimeline, canViewContacts)

	contacts.GET("/:id/persons", contactH.ListPersons, canViewContacts)
	contacts.POST("/:id/persons", contactH.CreatePerson, canEditContacts)
	contacts.PUT("/:id/persons/:person_id", contactH.UpdatePerson, canEditContacts)
	contacts.DELETE("/:id/persons/:person_id", contactH.DeletePerson, canEditContacts)

	contacts.GET("/:id/bank-accounts", contactH.ListBankAccounts, canViewContacts)
	contacts.POST("/:id/bank-accounts", contactH.CreateBankAccount, canEditContacts)
	contacts.DELETE("/:id/bank-accounts/:account_id", contactH.DeleteBankAccount, canEditContacts)

	contacts.GET("/:id/notes", contactH.ListNotes, canViewContacts)
	contacts.POST("/:id/notes", contactH.CreateNote, canViewContacts) // any viewer can add notes

	contacts.GET("/:id/tags", contactH.ListContactTags, canViewContacts)
	contacts.POST("/:id/tags", contactH.AddContactTag, canEditContacts)
	contacts.DELETE("/:id/tags/:tag_id", contactH.RemoveContactTag, canEditContacts)

	// ─── Tags ──────────────────────────────────────────────────────────────────
	tags := api.Group("/tags", canViewContacts)
	tags.GET("", contactH.ListTags)
	tags.POST("", contactH.CreateTag, canEditContacts)

	// ─── Calendar ──────────────────────────────────────────────────────────────
	canViewCalendar := mw.RequirePermission(policy, "calendar", "view")
	canManageCalendar := mw.RequirePermission(policy, "calendar", "manage")

	calendar := api.Group("/calendar")
	calendar.GET("/event-types", calendarH.ListEventTypes, canViewCalendar)
	calendar.POST("/event-types", calendarH.CreateEventType, canManageCalendar)

	calendar.GET("/events", calendarH.ListEvents, canViewCalendar)
	calendar.POST("/events", calendarH.CreateEvent, canManageCalendar)
	calendar.GET("/events/:id", calendarH.GetEvent, canViewCalendar)
	calendar.PUT("/events/:id", calendarH.UpdateEvent, canManageCalendar)
	calendar.DELETE("/events/:id", calendarH.DeleteEvent, canManageCalendar)
}

func healthHandler(db *pgxpool.Pool, rdb *redis.Client) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		dbErr := db.Ping(ctx)
		redisErr := rdb.Ping(ctx).Err()

		if dbErr != nil || redisErr != nil {
			resp := map[string]any{"status": "degraded"}
			if dbErr != nil {
				resp["postgres"] = dbErr.Error()
			}
			if redisErr != nil {
				resp["redis"] = redisErr.Error()
			}
			return c.JSON(http.StatusServiceUnavailable, resp)
		}

		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}
}

func buildLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}

// seedCompanyID returns the UUID of the seeded dev company.
// In a multi-company setup this would be resolved from the request domain/header.
func seedCompanyID() [16]byte {
	// c0000000-0000-4000-8000-000000000001
	return [16]byte{0xc0, 0, 0, 0, 0, 0, 0x40, 0, 0x80, 0, 0, 0, 0, 0, 0, 0x01}
}
