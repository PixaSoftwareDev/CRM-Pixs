package lead

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	domain "pixs/internal/domain/lead"
	"pixs/internal/jobs"
	scrapingjobs "pixs/internal/jobs/scraping"
	sqlcgen "pixs/internal/repository/sqlc"
)

// Per-operation cost estimates (USD).
const (
	estSearchCostPerCall = 0.0003 // Serper
	estLLMCostPerURL     = 0.001  // ~1 Haiku call per URL
)

// ScrapingConfig tunes the orchestrator.
type ScrapingConfig struct {
	DailyQuota int // max URLs a user may request per day
}

// EstimatedCost is the pre-run cost estimate returned to the caller.
type EstimatedCost struct {
	SearchAPICostUSD float64 `json:"search_api_cost_usd"`
	LLMCostUSD       float64 `json:"llm_cost_usd"`
	TotalCostUSD     float64 `json:"total_cost_usd"`
	URLsToProcess    int     `json:"urls_to_process"`
}

// EnqueueJobInput holds the request to start a scraping job.
type EnqueueJobInput struct {
	Query       string
	Country     string
	Language    string
	ResultCount int
}

// ScrapingOrchestrator validates quota, persists the job row, and enqueues the
// River job.
type ScrapingOrchestrator struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	client *river.Client[pgx.Tx]
	cfg    ScrapingConfig
	logger *slog.Logger
}

// NewScrapingOrchestrator constructs a ScrapingOrchestrator.
func NewScrapingOrchestrator(db *pgxpool.Pool, client *river.Client[pgx.Tx], cfg ScrapingConfig, logger *slog.Logger) *ScrapingOrchestrator {
	if cfg.DailyQuota <= 0 {
		cfg.DailyQuota = 200
	}
	return &ScrapingOrchestrator{q: sqlcgen.New(db), db: db, client: client, cfg: cfg, logger: logger}
}

// EnqueueResult bundles the persisted job, the cost estimate, and the polling channel.
type EnqueueResult struct {
	Job     sqlcgen.ScrapingJob
	Cost    EstimatedCost
	Channel string
}

// EnqueueJob validates the daily quota, creates the scraping_job row, and
// enqueues the River job. When the search API key is missing the job is still
// enqueued — the worker fails it gracefully with an error_summary.
func (o *ScrapingOrchestrator) EnqueueJob(ctx context.Context, companyID, userID uuid.UUID, in EnqueueJobInput) (*EnqueueResult, error) {
	if in.ResultCount <= 0 {
		in.ResultCount = 10
	}

	usedToday, err := o.q.CountScrapingJobsToday(ctx, sqlcgen.CountScrapingJobsTodayParams{
		CompanyID: companyID, UserID: userID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "checking daily quota")
	}
	if int(usedToday)+in.ResultCount > o.cfg.DailyQuota {
		return nil, errors.WithStack(domain.ErrQuotaExceeded)
	}

	cost := EstimatedCost{
		SearchAPICostUSD: estSearchCostPerCall,
		LLMCostUSD:       float64(in.ResultCount) * estLLMCostPerURL,
		URLsToProcess:    in.ResultCount,
	}
	cost.TotalCostUSD = cost.SearchAPICostUSD + cost.LLMCostUSD

	jobParams := sqlcgen.CreateScrapingJobParams{
		CompanyID:            companyID,
		UserID:               userID,
		Query:                in.Query,
		ResultCountRequested: int32(in.ResultCount),
	}
	if in.Country != "" {
		jobParams.Country = &in.Country
	}
	if in.Language != "" {
		jobParams.Language = &in.Language
	}
	job, err := o.q.CreateScrapingJob(ctx, jobParams)
	if err != nil {
		return nil, errors.Wrap(err, "creating scraping job")
	}

	if _, err := o.client.Insert(ctx, scrapingjobs.ScrapingJobArgs{
		CompanyID:   companyID.String(),
		UserID:      userID.String(),
		JobID:       job.ID.String(),
		Query:       in.Query,
		Country:     in.Country,
		Language:    in.Language,
		ResultCount: in.ResultCount,
	}, &river.InsertOpts{Queue: jobs.QueueScraping}); err != nil {
		return nil, errors.Wrap(err, "enqueueing scraping job")
	}

	return &EnqueueResult{
		Job:     job,
		Cost:    cost,
		Channel: fmt.Sprintf("scraping:job:%s", job.ID),
	}, nil
}

// GetJob returns a scraping job for polling progress.
func (o *ScrapingOrchestrator) GetJob(ctx context.Context, companyID, id uuid.UUID) (*sqlcgen.ScrapingJob, error) {
	job, err := o.q.GetScrapingJobByID(ctx, sqlcgen.GetScrapingJobByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	return &job, nil
}

// ListJobs returns recent scraping jobs for the company.
func (o *ScrapingOrchestrator) ListJobs(ctx context.Context, companyID uuid.UUID) ([]sqlcgen.ScrapingJob, error) {
	jobsList, err := o.q.ListScrapingJobs(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing scraping jobs")
	}
	return jobsList, nil
}
