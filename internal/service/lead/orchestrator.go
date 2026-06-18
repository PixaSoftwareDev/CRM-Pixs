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

// ScrapingConfig tunes the orchestrator.
type ScrapingConfig struct {
	DailyQuota int // max URLs a user may request per day
}

// EnqueueJobInput holds the request to start a scraping job.
// Either Query or URLs must be set.
type EnqueueJobInput struct {
	Query       string   // keyword search mode (e.g. "queserías Argentina")
	ResultCount int      // how many results to fetch (search mode)
	URLs        []string // manual list of URLs to scrape
	Country     string
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

// EnqueueResult bundles the persisted job and the polling channel.
type EnqueueResult struct {
	Job     sqlcgen.ScrapingJob
	Channel string
}

// EnqueueJob validates the quota, creates the scraping_job row, and enqueues
// the River job. Supports search mode (Query) or manual mode (URLs).
func (o *ScrapingOrchestrator) EnqueueJob(ctx context.Context, companyID, userID uuid.UUID, in EnqueueJobInput) (*EnqueueResult, error) {
	if in.Query == "" && len(in.URLs) == 0 {
		return nil, errors.New("se requiere una búsqueda o al menos una URL")
	}

	count := in.ResultCount
	if in.Query != "" {
		if count <= 0 {
			count = 10
		}
	} else {
		count = len(in.URLs)
	}

	usedToday, err := o.q.CountScrapingJobsToday(ctx, sqlcgen.CountScrapingJobsTodayParams{
		CompanyID: companyID, UserID: userID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "checking daily quota")
	}
	if int(usedToday)+count > o.cfg.DailyQuota {
		return nil, errors.WithStack(domain.ErrQuotaExceeded)
	}

	label := in.Query
	if label == "" {
		label = fmt.Sprintf("Manual (%d URLs)", len(in.URLs))
	}

	jobParams := sqlcgen.CreateScrapingJobParams{
		CompanyID:            companyID,
		UserID:               userID,
		Query:                label,
		ResultCountRequested: int32(count),
	}
	if in.Country != "" {
		jobParams.Country = &in.Country
	}
	job, err := o.q.CreateScrapingJob(ctx, jobParams)
	if err != nil {
		return nil, errors.Wrap(err, "creating scraping job")
	}

	riverArgs := scrapingjobs.ScrapingJobArgs{
		CompanyID:   companyID.String(),
		UserID:      userID.String(),
		JobID:       job.ID.String(),
		Country:     in.Country,
		ResultCount: count,
	}
	if in.Query != "" {
		riverArgs.Query = in.Query
	} else {
		riverArgs.URLs = in.URLs
	}

	if _, err := o.client.Insert(ctx, riverArgs, &river.InsertOpts{Queue: jobs.QueueScraping}); err != nil {
		return nil, errors.Wrap(err, "enqueueing scraping job")
	}

	return &EnqueueResult{
		Job:     job,
		Channel: fmt.Sprintf("scraping:job:%s", job.ID),
	}, nil
}

// DeleteJob removes a scraping job from the history.
func (o *ScrapingOrchestrator) DeleteJob(ctx context.Context, companyID, id uuid.UUID) error {
	if err := o.q.DeleteScrapingJob(ctx, sqlcgen.DeleteScrapingJobParams{
		ID:        id,
		CompanyID: companyID,
	}); err != nil {
		return errors.Wrap(err, "deleting scraping job")
	}
	return nil
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
