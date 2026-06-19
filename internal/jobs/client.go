// Package jobs provides the River job client and worker registry.
//
// To add a new job type:
//  1. Define a struct for job args implementing river.JobArgs (with Kind() string).
//  2. Implement a worker struct embedding river.WorkerDefaults[YourArgs] with
//     a Work(ctx, *river.Job[YourArgs]) error method.
//  3. Register it with river.AddWorker(workers, &YourWorker{}) in cmd/worker.
//  4. Enqueue with client.Insert(ctx, args, &river.InsertOpts{Queue: "..."}).
package jobs

import (
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

// QueueScraping is the dedicated queue for scraping jobs.
const QueueScraping = "scraping"

// NewWorkerClient creates a River client with workers registered (use in cmd/worker).
func NewWorkerClient(pool *pgxpool.Pool, workers *river.Workers) (*river.Client[pgx.Tx], error) {
	return river.NewClient(riverpgxv5.New(pool), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 10},
			QueueScraping:      {MaxWorkers: 3},
		},
		Workers:   workers,
		Logger:    slog.Default(),
		JobTimeout: 30 * time.Minute,
	})
}

// NewEnqueueClient creates a River client for enqueueing only (no workers,
// used by the API process).
func NewEnqueueClient(pool *pgxpool.Pool) (*river.Client[pgx.Tx], error) {
	return river.NewClient(riverpgxv5.New(pool), &river.Config{
		Logger: slog.Default(),
	})
}
