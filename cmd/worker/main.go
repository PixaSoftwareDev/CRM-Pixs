// Package main is the entry point for the PIXS background job worker.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"pixs/internal/config"
	"pixs/internal/jobs"
	scrapingjobs "pixs/internal/jobs/scraping"
	"pixs/internal/scraping/llm"
	"pixs/internal/scraping/search"
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

	// River owns its own migration system, separate from Atlas. Apply it at
	// startup so the river_* tables exist before the client starts.
	if err := runRiverMigrations(context.Background(), pool); err != nil {
		return fmt.Errorf("river migrate: %w", err)
	}
	slog.Info("river migrations applied")

	// Build the search provider.
	var searchProvider search.Provider
	if cfg.SerperAPIKey != "" {
		searchProvider = search.NewSerperProvider(cfg.SerperAPIKey)
	} else {
		slog.Warn("PIXS_SERPER_API_KEY not set; scraping jobs will fail at the search step")
		searchProvider = &search.MockProvider{}
	}

	// Build the LLM extractor.
	var llmExt llm.Extractor
	if cfg.AnthropicAPIKey != "" {
		llmExt = llm.NewAnthropicExtractor(cfg.AnthropicAPIKey)
	} else {
		slog.Warn("PIXS_ANTHROPIC_API_KEY not set; LLM extraction will be skipped")
		llmExt = &llm.MockExtractor{}
	}

	// Register workers.
	workers := river.NewWorkers()
	river.AddWorker(workers, scrapingjobs.NewScrapingWorker(pool, searchProvider, llmExt, logger))

	client, err := jobs.NewWorkerClient(pool, workers)
	if err != nil {
		return fmt.Errorf("river client: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := client.Start(ctx); err != nil {
		return fmt.Errorf("starting river: %w", err)
	}
	slog.Info("worker started")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("worker shutting down...")
	if err := client.Stop(context.Background()); err != nil {
		slog.Error("river stop error", "err", err)
	}
	return nil
}

// runRiverMigrations applies River's own schema migrations to the pool.
func runRiverMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}
