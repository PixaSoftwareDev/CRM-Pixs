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
	"strings"
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
	"pixs/internal/jobs"
	sqlcgen "pixs/internal/repository/sqlc"
	svccalendar "pixs/internal/service/calendar"
	svccontact "pixs/internal/service/contact"
	svcdocument "pixs/internal/service/document"
	svcfinance "pixs/internal/service/finance"
	svcidentity "pixs/internal/service/identity"
	svclead "pixs/internal/service/lead"
	svcproject "pixs/internal/service/project"
	svcsales "pixs/internal/service/sales"
	svctask "pixs/internal/service/task"
	svctimetracking "pixs/internal/service/timetracking"
	svcvault "pixs/internal/service/vault"
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

	// Cap request bodies a bit above the max upload size to allow multipart overhead.
	e.Use(middleware.BodyLimit(fmt.Sprintf("%dM", cfg.MaxUploadSizeMB+5)))

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

	financeServices := &financeServices{
		invoices:  svcfinance.NewInvoiceService(db, logger),
		received:  svcfinance.NewInvoiceReceivedService(db, logger),
		receipts:  svcfinance.NewReceiptService(db, logger),
		orders:    svcfinance.NewPaymentOrderService(db, logger),
		cash:      svcfinance.NewCashService(db, logger),
		banks:     svcfinance.NewBankService(db, logger),
		expenses:  svcfinance.NewExpenseService(db, logger),
		recurring: svcfinance.NewRecurringService(db, logger),
		cashflow:  svcfinance.NewCashFlowService(db, logger),
		ctacte:    svcfinance.NewCtaCteService(db, logger),
		catalog:   svcfinance.NewCatalogService(db, logger),
	}

	// River enqueue client (no workers — the worker process runs them).
	riverClient, err := jobs.NewEnqueueClient(db)
	if err != nil {
		return fmt.Errorf("creating river enqueue client: %w", err)
	}

	leadServices := &leadServices{
		leads:        svclead.NewLeadService(db, logger),
		conversion:   svclead.NewConversionService(db, logger),
		metrics:      svclead.NewMetricsService(db, logger),
		orchestrator: svclead.NewScrapingOrchestrator(db, riverClient, svclead.ScrapingConfig{DailyQuota: cfg.ScrapingDailyQuota}, logger),
	}

	vaultSvc := svcvault.New(db, cipher, logger)
	documentSvc := svcdocument.NewDocumentService(db, cfg.StorageDir, cfg.MaxUploadSizeMB, logger)

	registerRoutes(e, db, rdb, sessStore, q, policy, authSvc, contactSvc, calendarSvc, salesProjectTask, financeServices, leadServices, vaultSvc, documentSvc, logger)

	// --- SPA static serving (must come after all API routes) ---
	// The compiled frontend lives at web/dist relative to the working directory
	// (the systemd unit sets WorkingDirectory to the project root). Assets are
	// served directly; any other non-API path falls back to index.html so the
	// client-side router can handle it.
	registerSPA(e, "web/dist")

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
	fin *financeServices,
	leads *leadServices,
	vaultSvc *svcvault.VaultService,
	documentSvc *svcdocument.DocumentService,
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
		Limit:  20,
		Window: 15 * time.Minute,
		Prefix: "login:ip",
	})
	pwdResetLimit := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  3,
		Window: time.Hour,
		Prefix: "pwdreset:ip",
	})

	authHandler := handler.NewAuthHandler(authSvc, policy)

	// Effective-permissions endpoint for the SPA, under the protected /api/v1 group.
	apiAuth := e.Group("/api/v1", authMiddleware)
	apiAuth.GET("/me/permissions", authHandler.MePermissions)

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
	registerFinanceRoutes(e, authMiddleware, policy, fin)
	registerLeadRoutes(e, authMiddleware, policy, leads)
	registerVaultRoutes(e, authMiddleware, policy, vaultSvc)
	registerDocumentRoutes(e, authMiddleware, policy, documentSvc)
	registerAdminRoutes(e, authMiddleware, policy, q)
}

func registerDocumentRoutes(e *echo.Echo, authMiddleware echo.MiddlewareFunc, policy *rbac.Policy, documentSvc *svcdocument.DocumentService) {
	h := handler.NewDocumentHandler(documentSvc)

	canView := mw.RequirePermission(policy, "documents", "view")
	canUpload := mw.RequirePermission(policy, "documents", "upload")
	canDelete := mw.RequirePermission(policy, "documents", "delete")

	docs := e.Group("/api/v1/documents", authMiddleware)
	docs.GET("", h.ListDocuments, canView)
	docs.POST("", h.UploadDocument, canUpload)
	docs.GET("/:id/download", h.DownloadDocument, canView)
	docs.DELETE("/:id", h.DeleteDocument, canDelete)
}

func registerAdminRoutes(e *echo.Echo, authMiddleware echo.MiddlewareFunc, policy *rbac.Policy, q *sqlcgen.Queries) {
	h := handler.NewAdminHandler(q, policy)

	canManageUsers := mw.RequirePermission(policy, "users", "manage")
	canViewUsers   := canManageUsers // users/view is not seeded; manage implies view
	canManageRoles := mw.RequirePermission(policy, "settings", "manage") // roles/manage not seeded; settings/manage covers it

	admin := e.Group("/api/v1/admin", authMiddleware)

	// Users
	admin.GET("/users", h.ListUsers, canViewUsers)
	admin.POST("/users", h.CreateUser, canManageUsers)
	admin.PATCH("/users/:id", h.UpdateUser, canManageUsers)
	admin.PATCH("/users/:id/active", h.ToggleUserActive, canManageUsers)
	admin.GET("/users/:id/roles", h.GetUserRoles, canViewUsers)
	admin.POST("/users/:id/roles", h.AssignRole, canManageUsers)
	admin.DELETE("/users/:id/roles/:role_id", h.RemoveRole, canManageUsers)

	// Roles & Permissions
	admin.GET("/roles", h.ListRoles, canViewUsers)
	admin.POST("/roles", h.CreateRole, canManageRoles)
	admin.PUT("/roles/:id", h.UpdateRole, canManageRoles)
	admin.DELETE("/roles/:id", h.DeleteRole, canManageRoles)
	admin.GET("/permissions", h.ListPermissions, canViewUsers)
	admin.GET("/roles/:id/permissions", h.GetRolePermissions, canViewUsers)
	admin.PUT("/roles/:id/permissions/:perm_id", h.UpsertRolePermission, canManageRoles)
	admin.DELETE("/roles/:id/permissions/:perm_id", h.DeleteRolePermission, canManageRoles)

	// Company
	admin.GET("/company", h.GetCompany, canViewUsers)
	admin.PUT("/company", h.UpdateCompany, canManageUsers)

	// Audit log
	admin.GET("/audit-logs", h.ListAuditLogs, canViewUsers)

	// Exchange rates
	admin.POST("/exchange-rates", h.CreateExchangeRate, canManageUsers)
	admin.GET("/exchange-rates/latest", h.GetLatestExchangeRate, canViewUsers)

	// Catalogs — ABM for configurable lookups
	admin.GET("/catalogs/event-types", h.ListEventTypes, canViewUsers)
	admin.POST("/catalogs/event-types", h.CreateEventType, canManageUsers)
	admin.GET("/catalogs/pipeline-stages", h.ListPipelineStages, canViewUsers)
	admin.POST("/catalogs/pipeline-stages", h.CreatePipelineStage, canManageUsers)
	admin.GET("/catalogs/lost-reasons", h.ListLostReasons, canViewUsers)
	admin.POST("/catalogs/lost-reasons", h.CreateLostReason, canManageUsers)
	admin.GET("/catalogs/tags", h.ListTagsCatalog, canViewUsers)
	admin.POST("/catalogs/tags", h.CreateTagCatalog, canManageUsers)
	admin.GET("/catalogs/vat-rates", h.ListVATRates, canViewUsers)
	admin.GET("/catalogs/payment-conditions", h.ListPaymentConditions, canViewUsers)
	admin.GET("/catalogs/expense-categories", h.ListExpenseCategories, canViewUsers)
	admin.GET("/catalogs/currencies", h.ListCurrencies, canViewUsers)

	// Self-service endpoints (all authenticated users)
	me := e.Group("/api/v1/me", authMiddleware)
	me.POST("/change-password", h.ChangePassword)

	// Global search (all authenticated users)
	e.Group("/api/v1", authMiddleware).GET("/search", h.Search)
}

// leadServices bundles the services for the leads + scraping bounded context.
type leadServices struct {
	leads        *svclead.LeadService
	conversion   *svclead.ConversionService
	metrics      *svclead.MetricsService
	orchestrator *svclead.ScrapingOrchestrator
}

func registerLeadRoutes(
	e *echo.Echo,
	authMiddleware echo.MiddlewareFunc,
	policy *rbac.Policy,
	leads *leadServices,
) {
	leadH := handler.NewLeadHandler(leads.leads, leads.conversion, leads.metrics)
	scrapingH := handler.NewScrapingHandler(leads.orchestrator)

	api := e.Group("/api/v1", authMiddleware)

	canView := mw.RequirePermission(policy, "leads", "view")
	canCreate := mw.RequirePermission(policy, "leads", "create")
	canEdit := mw.RequirePermission(policy, "leads", "edit")
	canAssign := mw.RequirePermission(policy, "leads", "assign")
	canConvert := mw.RequirePermission(policy, "leads", "convert")

	leadsGroup := api.Group("/leads")
	leadsGroup.GET("", leadH.ListLeads, canView)
	leadsGroup.POST("", leadH.CreateLead, canCreate)
	leadsGroup.GET("/metrics", leadH.GetLeadMetrics, canView)
	leadsGroup.GET("/:id", leadH.GetLead, canView)
	leadsGroup.PATCH("/:id", leadH.UpdateLead, canEdit)
	leadsGroup.POST("/:id/status", leadH.ChangeLeadStatus, canEdit)
	leadsGroup.POST("/:id/assign", leadH.AssignLead, canAssign)
	leadsGroup.POST("/:id/note", leadH.AddNote, canView)
	leadsGroup.POST("/:id/convert", leadH.ConvertToContact, canConvert)
	leadsGroup.POST("/:id/send-to-opportunity", leadH.SendToOpportunity, canConvert)
	leadsGroup.GET("/:id/activities", leadH.ListLeadActivities, canView)

	// ─── Scraping ──────────────────────────────────────────────────────────────
	canRun := mw.RequirePermission(policy, "scraping", "run")
	canViewScraping := mw.RequirePermission(policy, "scraping", "view")

	scraping := api.Group("/scraping-jobs")
	scraping.POST("", scrapingH.EnqueueScrapingJob, canRun)
	scraping.GET("", scrapingH.ListScrapingJobs, canViewScraping)
	scraping.GET("/:id", scrapingH.GetScrapingJob, canViewScraping)
	scraping.DELETE("/:id", scrapingH.DeleteScrapingJob, canRun)
}

// financeServices bundles the finance bounded-context services.
type financeServices struct {
	invoices  *svcfinance.InvoiceService
	received  *svcfinance.InvoiceReceivedService
	receipts  *svcfinance.ReceiptService
	orders    *svcfinance.PaymentOrderService
	cash      *svcfinance.CashService
	banks     *svcfinance.BankService
	expenses  *svcfinance.ExpenseService
	recurring *svcfinance.RecurringService
	cashflow  *svcfinance.CashFlowService
	ctacte    *svcfinance.CtaCteService
	catalog   *svcfinance.CatalogService
}

func registerFinanceRoutes(
	e *echo.Echo,
	authMiddleware echo.MiddlewareFunc,
	policy *rbac.Policy,
	fin *financeServices,
) {
	h := handler.NewFinanceHandler(
		fin.invoices, fin.received, fin.receipts, fin.orders, fin.cash, fin.banks,
		fin.expenses, fin.recurring, fin.cashflow, fin.ctacte, fin.catalog,
	)

	api := e.Group("/api/v1", authMiddleware)

	// ─── Invoices issued ───────────────────────────────────────────────────────
	canViewInv := mw.RequirePermission(policy, "invoices_issued", "view")
	canCreateInv := mw.RequirePermission(policy, "invoices_issued", "create")
	canEditInv := mw.RequirePermission(policy, "invoices_issued", "edit")
	canEmitInv := mw.RequirePermission(policy, "invoices_issued", "emit")
	canVoidInv := mw.RequirePermission(policy, "invoices_issued", "void")

	invoices := api.Group("/invoices")
	invoices.POST("", h.CreateInvoiceDraft, canCreateInv)
	invoices.GET("", h.ListInvoices, canViewInv)
	invoices.GET("/:id", h.GetInvoice, canViewInv)
	invoices.PUT("/:id", h.UpdateInvoiceDraft, canEditInv)
	invoices.POST("/:id/issue", h.IssueInvoice, canEmitInv)
	invoices.POST("/:id/void", h.VoidInvoice, canVoidInv)
	invoices.DELETE("/:id", h.DeleteInvoiceDraft, canEditInv)
	invoices.GET("/:id/items", h.ListInvoiceItems, canViewInv)
	invoices.GET("/:id/taxes", h.ListInvoiceTaxes, canViewInv)

	// ─── Invoices received ─────────────────────────────────────────────────────
	canViewRecv := mw.RequirePermission(policy, "invoices_received", "view")
	canCreateRecv := mw.RequirePermission(policy, "invoices_received", "create")
	canEditRecv := mw.RequirePermission(policy, "invoices_received", "edit")

	recv := api.Group("/invoices-received")
	recv.POST("", h.CreateInvoiceReceived, canCreateRecv)
	recv.GET("", h.ListInvoicesReceived, canViewRecv)
	recv.GET("/:id", h.GetInvoiceReceived, canViewRecv)
	recv.PUT("/:id", h.UpdateInvoiceReceived, canEditRecv)
	recv.DELETE("/:id", h.SoftDeleteInvoiceReceived, canEditRecv)

	// ─── Receipts ──────────────────────────────────────────────────────────────
	canViewRcpt := mw.RequirePermission(policy, "receipts", "view")
	canCreateRcpt := mw.RequirePermission(policy, "receipts", "create")
	canVoidRcpt := mw.RequirePermission(policy, "receipts", "void")

	receipts := api.Group("/receipts")
	receipts.POST("", h.CreateReceipt, canCreateRcpt)
	receipts.GET("", h.ListReceipts, canViewRcpt)
	receipts.GET("/:id", h.GetReceipt, canViewRcpt)
	receipts.DELETE("/:id", h.VoidReceipt, canVoidRcpt)

	// ─── Payment orders ────────────────────────────────────────────────────────
	canViewPO := mw.RequirePermission(policy, "payment_orders", "view")
	canCreatePO := mw.RequirePermission(policy, "payment_orders", "create")
	canVoidPO := mw.RequirePermission(policy, "payment_orders", "void")

	orders := api.Group("/payment-orders")
	orders.POST("", h.CreatePaymentOrder, canCreatePO)
	orders.GET("", h.ListPaymentOrders, canViewPO)
	orders.GET("/:id", h.GetPaymentOrder, canViewPO)
	orders.DELETE("/:id", h.VoidPaymentOrder, canVoidPO)

	// ─── Cash registers ────────────────────────────────────────────────────────
	canViewCash := mw.RequirePermission(policy, "cash_registers", "view")
	canMoveCash := mw.RequirePermission(policy, "cash_registers", "create_movement")
	canReconcileCash := mw.RequirePermission(policy, "cash_registers", "reconcile")

	cash := api.Group("/cash-registers")
	cash.POST("", h.CreateCashRegister, canReconcileCash)
	cash.GET("", h.ListCashRegisters, canViewCash)
	cash.POST("/transfer", h.TransferBetweenCashes, canMoveCash)
	cash.GET("/:id", h.GetCashRegister, canViewCash)
	cash.PUT("/:id", h.UpdateCashRegister, canReconcileCash)
	cash.POST("/:id/open", h.OpenSession, canReconcileCash)
	cash.POST("/:id/close", h.CloseSession, canReconcileCash)
	cash.GET("/:id/movements", h.ListCashMovements, canViewCash)
	cash.POST("/:id/movements", h.CreateCashMovement, canMoveCash)

	// ─── Bank accounts ─────────────────────────────────────────────────────────
	canViewBank := mw.RequirePermission(policy, "banks", "view")
	canReconcileBank := mw.RequirePermission(policy, "banks", "reconcile")

	banks := api.Group("/bank-accounts")
	banks.POST("", h.CreateBankAccount, canReconcileBank)
	banks.GET("", h.ListBankAccounts, canViewBank)
	banks.GET("/:id", h.GetBankAccount, canViewBank)
	banks.PUT("/:id", h.UpdateBankAccount, canReconcileBank)
	banks.GET("/:id/movements", h.ListBankMovements, canViewBank)
	banks.POST("/:id/movements", h.CreateBankMovement, canReconcileBank)
	banks.POST("/:id/reconcile", h.ReconcileMovements, canReconcileBank)

	// ─── Expenses ──────────────────────────────────────────────────────────────
	canViewExp := mw.RequirePermission(policy, "expenses", "view")
	canCreateExp := mw.RequirePermission(policy, "expenses", "create")
	canApproveExp := mw.RequirePermission(policy, "expenses", "approve")

	expenses := api.Group("/expenses")
	expenses.POST("", h.CreateExpense, canCreateExp)
	expenses.GET("", h.ListExpenses, canViewExp)
	expenses.GET("/:id", h.GetExpense, canViewExp)
	expenses.PUT("/:id", h.UpdateExpense, canCreateExp)
	expenses.POST("/:id/approve", h.ApproveExpense, canApproveExp)
	expenses.POST("/:id/reject", h.RejectExpense, canApproveExp)
	expenses.DELETE("/:id", h.SoftDeleteExpense, canApproveExp)

	// ─── Recurring payments ────────────────────────────────────────────────────
	canViewRec := mw.RequirePermission(policy, "recurring_payments", "view")
	canManageRec := mw.RequirePermission(policy, "recurring_payments", "manage")

	rec := api.Group("/recurring-payments")
	rec.POST("", h.CreateRecurringPayment, canManageRec)
	rec.GET("", h.ListRecurringPayments, canViewRec)
	rec.GET("/:id", h.GetRecurringPayment, canViewRec)
	rec.PUT("/:id", h.UpdateRecurringPayment, canManageRec)
	rec.DELETE("/:id", h.SoftDeleteRecurringPayment, canManageRec)

	// ─── Payment calendar ──────────────────────────────────────────────────────
	canViewCal := mw.RequirePermission(policy, "payment_calendar", "view")
	cal := api.Group("/payment-calendar")
	cal.GET("", h.ListPaymentObligations, canViewCal)
	cal.POST("/:id/pay", h.MarkObligationPaid, canCreatePO)

	// ─── Reports ───────────────────────────────────────────────────────────────
	canViewFlow := mw.RequirePermission(policy, "cash_flow", "view")
	canViewCtaCte := mw.RequirePermission(policy, "cta_cte", "view")
	api.GET("/cash-flow", h.GetCashFlowProjection, canViewFlow)
	api.GET("/contacts/:id/account-statement", h.GetAccountStatement, canViewCtaCte)
	api.GET("/consolidated-balance", h.GetConsolidatedBalance, canViewFlow)
	api.GET("/alerts", h.GetAlerts, canViewFlow)

	// ─── Catalogs (any invoices viewer) ────────────────────────────────────────
	finCatalog := api.Group("/finance", canViewInv)
	finCatalog.GET("/vat-rates", h.ListVATRates)
	finCatalog.GET("/payment-conditions", h.ListPaymentConditions)
	finCatalog.GET("/expense-categories", h.ListExpenseCategories)
	finCatalog.GET("/currencies", h.ListCurrencies)
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

	contacts.GET("/:id/comments", contactH.ListComments, canViewContacts)
	contacts.POST("/:id/comments", contactH.CreateComment, canViewContacts) // any viewer can comment
	contacts.PUT("/:id/comments/:comment_id", contactH.UpdateComment, canEditContacts)
	contacts.DELETE("/:id/comments/:comment_id", contactH.DeleteComment, canEditContacts)

	contacts.GET("/:id/tags", contactH.ListContactTags, canViewContacts)
	contacts.POST("/:id/tags", contactH.AddContactTag, canEditContacts)
	contacts.DELETE("/:id/tags/:tag_id", contactH.RemoveContactTag, canEditContacts)

	// ─── Tags ──────────────────────────────────────────────────────────────────
	tags := api.Group("/tags", canViewContacts)
	tags.GET("", contactH.ListTags)
	tags.POST("", contactH.CreateTag, canEditContacts)

	// ─── Industries (rubros) ─────────────────────────────────────────────────────
	industries := api.Group("/industries", canViewContacts)
	industries.GET("", contactH.ListIndustries)
	industries.POST("", contactH.CreateIndustry, canEditContacts)

	// ─── Postal codes (reference lookup) ─────────────────────────────────────────
	api.GET("/postal-codes/:cp", contactH.LookupPostalCode, canViewContacts)

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

// registerSPA serves the compiled single-page app from distPath, if it exists.
// Assets are served from distPath/assets; every other GET that is not an API
// route falls back to index.html for client-side routing.
func registerSPA(e *echo.Echo, distPath string) {
	info, err := os.Stat(distPath)
	if err != nil || !info.IsDir() {
		slog.Warn("SPA dist directory not found; frontend will not be served", "path", distPath)
		return
	}

	e.Static("/assets", distPath+"/assets")
	e.File("/favicon.svg", distPath+"/favicon.svg")

	indexPath := distPath + "/index.html"
	e.GET("/*", func(c echo.Context) error {
		// Never let the SPA fallback swallow API or health routes.
		p := c.Param("*")
		if strings.HasPrefix(p, "api/") || strings.HasPrefix(p, "auth/") || p == "health" {
			return echo.NewHTTPError(http.StatusNotFound)
		}
		return c.File(indexPath)
	})
	slog.Info("SPA serving enabled", "path", distPath)
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

func registerVaultRoutes(
	e *echo.Echo,
	authMiddleware echo.MiddlewareFunc,
	policy *rbac.Policy,
	vaultSvc *svcvault.VaultService,
) {
	vaultH := handler.NewVaultHandler(vaultSvc)
	api := e.Group("/api/v1", authMiddleware)
	vault := api.Group("/vault")
	canView := mw.RequirePermission(policy, "vault", "view")
	canManage := mw.RequirePermission(policy, "vault", "manage")

	vault.GET("", vaultH.ListVaultEntries, canView)
	vault.POST("", vaultH.CreateVaultEntry, canManage)
	vault.GET("/:id", vaultH.GetVaultEntry, canManage) // manage = can decrypt
	vault.PUT("/:id", vaultH.UpdateVaultEntry, canManage)
	vault.DELETE("/:id", vaultH.DeleteVaultEntry, canManage)
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
