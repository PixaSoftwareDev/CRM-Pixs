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
	svcidentity "pixs/internal/service/identity"
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

	registerRoutes(e, db, rdb, sessStore, q, policy, authSvc, logger)

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

	_ = policy // will be used by feature route groups
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
