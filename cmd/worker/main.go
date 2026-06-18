// Package main is the entry point for the PIXS background job worker.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"pixs/internal/config"
	"pixs/internal/jobs"
	scrapingjobs "pixs/internal/jobs/scraping"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "worker: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("db pool: %w", err)
	}
	defer pool.Close()

	// River owns its own migration system, separate from Atlas.
	if err := runRiverMigrations(context.Background(), pool); err != nil {
		return fmt.Errorf("river migrate: %w", err)
	}
	slog.Info("river migrations applied")

	// PIXS_SCRAPING_HEADLESS=true hides the browser window (for servers).
	// Default: false — show the browser so the operator can watch the scraping.
	headless := false
	if v := os.Getenv("PIXS_SCRAPING_HEADLESS"); v != "" {
		headless, _ = strconv.ParseBool(v)
	}

	// Register workers.
	workers := river.NewWorkers()
	river.AddWorker(workers, scrapingjobs.NewScrapingWorker(pool, headless, logger))

	client, err := jobs.NewWorkerClient(pool, workers)
	if err != nil {
		return fmt.Errorf("river client: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := client.Start(ctx); err != nil {
		return fmt.Errorf("starting river: %w", err)
	}
	slog.Info("worker started", "headless", headless)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("worker shutting down...")
	if err := client.Stop(context.Background()); err != nil {
		slog.Error("river stop error", "err", err)
	}
	return nil
}

func runRiverMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}
