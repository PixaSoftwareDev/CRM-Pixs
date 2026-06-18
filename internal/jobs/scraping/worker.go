// Package scrapingjobs implements the River worker that runs the scraping
// pipeline: Chrome search → Chrome fetch → deterministic extract → persist leads.
package scrapingjobs

import (
	"context"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/scraping/browser"
	"pixs/internal/scraping/extractor"
)

// alreadyScraped returns true if a lead with this exact website URL already
// exists for this company. Checked before visiting so we avoid wasting time
// re-opening sites we have already processed.
func alreadyScraped(ctx context.Context, db *pgxpool.Pool, companyID uuid.UUID, siteURL string) bool {
	var count int
	_ = db.QueryRow(ctx,
		`SELECT COUNT(*) FROM leads WHERE company_id = $1 AND website = $2 AND deleted_at IS NULL`,
		companyID, siteURL).Scan(&count)
	return count > 0
}

// ScrapingJobArgs is the River job payload.
// Either Query or URLs must be set.
type ScrapingJobArgs struct {
	CompanyID   string   `json:"company_id"`
	UserID      string   `json:"user_id"`
	JobID       string   `json:"job_id"`
	Query       string   `json:"query,omitempty"`        // keyword search mode
	URLs        []string `json:"urls,omitempty"`         // manual URL mode
	Country     string   `json:"country,omitempty"`
	ResultCount int      `json:"result_count,omitempty"` // how many results to fetch
}

// Kind identifies the job type for River.
func (ScrapingJobArgs) Kind() string { return "scraping_job" }

// ScrapingWorker executes the scraping pipeline using a real Chrome browser.
type ScrapingWorker struct {
	river.WorkerDefaults[ScrapingJobArgs]
	db       *pgxpool.Pool
	q        *sqlcgen.Queries
	headless bool
	logger   *slog.Logger
}

// NewScrapingWorker constructs a ScrapingWorker.
// headless=false shows the Chrome window while scraping (useful for debugging).
func NewScrapingWorker(db *pgxpool.Pool, headless bool, logger *slog.Logger) *ScrapingWorker {
	if logger == nil {
		logger = slog.Default()
	}
	return &ScrapingWorker{
		db:       db,
		q:        sqlcgen.New(db),
		headless: headless,
		logger:   logger,
	}
}

// Timeout overrides River's default 60-second job timeout.
// Scraping jobs can take several minutes: one Chrome navigation per URL,
// plus contact sub-pages and popup dismissal on each one.
func (w *ScrapingWorker) Timeout(*river.Job[ScrapingJobArgs]) time.Duration {
	return 30 * time.Minute
}

// Work is the River entry point.
func (w *ScrapingWorker) Work(ctx context.Context, job *river.Job[ScrapingJobArgs]) error {
	return w.RunPipeline(ctx, job.Args)
}

// RunPipeline: open Chrome → search Google (if query) → visit each site → extract → persist.
func (w *ScrapingWorker) RunPipeline(ctx context.Context, args ScrapingJobArgs) error {
	companyID, err := uuid.Parse(args.CompanyID)
	if err != nil {
		return errors.Wrap(err, "parsing company_id")
	}
	jobID, err := uuid.Parse(args.JobID)
	if err != nil {
		return errors.Wrap(err, "parsing job_id")
	}

	started := time.Now()

	if _, err := w.q.UpdateScrapingJobStatus(ctx, sqlcgen.UpdateScrapingJobStatusParams{
		ID:        jobID,
		CompanyID: companyID,
		Status:    "running",
		StartedAt: pgtype.Timestamptz{Time: started, Valid: true},
	}); err != nil {
		return errors.Wrap(err, "marking job running")
	}

	// Start a Chrome browser for this job.
	chrome, err := browser.New(w.headless, w.logger)
	if err != nil {
		summary := "no se pudo iniciar Chrome: " + err.Error()
		w.failJob(ctx, jobID, companyID, started, 0, 0, summary)
		return errors.Wrap(err, "starting browser")
	}
	// Use a closure so the defer always closes whichever browser instance is
	// current — even if chrome was replaced after a crash.
	defer func() { chrome.Close() }()

	// Resolve the list of URLs to scrape.
	var targetURLs []string

	if args.Query != "" {
		limit := args.ResultCount
		if limit <= 0 {
			limit = 10
		}
		targetURLs, err = chrome.Search(ctx, args.Query, limit)
		if err != nil {
			w.failJob(ctx, jobID, companyID, started, 0, 0, "búsqueda fallida: "+err.Error())
			return errors.Wrap(err, "google search")
		}
		if len(targetURLs) == 0 {
			w.failJob(ctx, jobID, companyID, started, 0, 0, "la búsqueda no devolvió resultados — intentá con otras palabras clave")
			return nil
		}
		w.logger.Info("urls to scrape", "count", len(targetURLs), "urls", targetURLs)
	} else {
		targetURLs = args.URLs
	}

	leadsFound := 0
	urlsProcessed := 0

	for i, rawURL := range targetURLs {
		if ctx.Err() != nil {
			break
		}

		// Skip if we already have this site in the database.
		if alreadyScraped(ctx, w.db, companyID, rawURL) {
			w.logger.Info("skipping duplicate", "url", rawURL, "index", i+1, "total", len(targetURLs))
			urlsProcessed++
			_, _ = w.q.UpdateScrapingJobStatus(ctx, sqlcgen.UpdateScrapingJobStatusParams{
				ID:            jobID,
				CompanyID:     companyID,
				Status:        "running",
				StartedAt:     pgtype.Timestamptz{Time: started, Valid: true},
				UrlsProcessed: int32(urlsProcessed),
				LeadsFound:    int32(leadsFound),
			})
			continue
		}

		urlsProcessed++
		w.logger.Info("scraping site", "url", rawURL, "index", urlsProcessed, "total", len(targetURLs))

		// Update progress before fetch so the UI shows the current URL.
		_, _ = w.q.UpdateScrapingJobStatus(ctx, sqlcgen.UpdateScrapingJobStatusParams{
			ID:            jobID,
			CompanyID:     companyID,
			Status:        "running",
			StartedAt:     pgtype.Timestamptz{Time: started, Valid: true},
			UrlsProcessed: int32(urlsProcessed - 1),
			LeadsFound:    int32(leadsFound),
		})

		// Recover from a browser crash: recreate Chrome and keep going.
		if chrome.IsDead() {
			w.logger.Warn("browser crashed, recreating", "url", rawURL)
			chrome.Close()
			chrome, err = browser.New(w.headless, w.logger)
			if err != nil {
				w.logger.Error("could not recreate browser, stopping job", "err", err)
				break
			}
		}

		htmlPages, fetchErr := chrome.FetchSite(ctx, rawURL)
		if fetchErr != nil {
			w.logger.Warn("fetch site failed", "url", rawURL, "err", fetchErr)
			continue
		}

		extracted := extractor.Extract(ctx, htmlPages, args.Country)
		w.logger.Info("extracted data", "url", rawURL,
			"emails", len(extracted.Emails),
			"phones", len(extracted.Phones),
			"socials", len(extracted.Socials))

		created, persistErr := w.persistLead(ctx, companyID, jobID, rawURL, extracted)
		if persistErr != nil {
			w.logger.Warn("persisting lead failed", "url", rawURL, "err", persistErr)
			continue
		}
		if created {
			leadsFound++
			w.logger.Info("lead saved", "url", rawURL, "total_leads", leadsFound)
		}
	}

	if _, err := w.q.UpdateScrapingJobStatus(ctx, sqlcgen.UpdateScrapingJobStatusParams{
		ID:            jobID,
		CompanyID:     companyID,
		Status:        "completed",
		StartedAt:     pgtype.Timestamptz{Time: started, Valid: true},
		FinishedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UrlsProcessed: int32(urlsProcessed),
		LeadsFound:    int32(leadsFound),
	}); err != nil {
		return errors.Wrap(err, "marking job completed")
	}

	w.logger.Info("scraping job completed",
		"job_id", jobID,
		"urls_processed", urlsProcessed,
		"leads_found", leadsFound,
	)
	return nil
}

func (w *ScrapingWorker) persistLead(
	ctx context.Context,
	companyID, jobID uuid.UUID,
	rawURL string,
	extracted extractor.Result,
) (bool, error) {
	companyName := ""
	if extracted.SchemaOrg != nil && extracted.SchemaOrg.Name != "" {
		companyName = extracted.SchemaOrg.Name
	}
	if companyName == "" {
		if u, err := url.Parse(rawURL); err == nil {
			companyName = strings.TrimPrefix(u.Host, "www.")
		}
	}
	if strings.TrimSpace(companyName) == "" {
		companyName = rawURL
	}

	website := rawURL

	// Skip duplicates.
	if _, err := w.q.CheckLeadDuplicate(ctx, sqlcgen.CheckLeadDuplicateParams{
		CompanyID: companyID,
		Website:   &website,
		Lower:     companyName,
	}); err == nil {
		return false, nil
	}

	tx, err := w.db.Begin(ctx)
	if err != nil {
		return false, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := w.q.WithTx(tx)

	params := sqlcgen.CreateLeadParams{
		CompanyID:     companyID,
		CompanyName:   companyName,
		SourceUrl:     &rawURL,
		Website:       &website,
		Status:        "new",
		ScrapingJobID: pgtype.UUID{Bytes: jobID, Valid: true},
	}
	if extracted.SchemaOrg != nil {
		params.Description = strPtr(extracted.SchemaOrg.Description)
	}

	lead, err := qtx.CreateLead(ctx, params)
	if err != nil {
		return false, errors.Wrap(err, "creating lead")
	}

	for _, e := range extracted.Emails {
		if _, err := qtx.CreateLeadEmail(ctx, sqlcgen.CreateLeadEmailParams{
			LeadID: lead.ID, Email: e.Email, Context: strPtr(e.Context),
		}); err != nil {
			return false, errors.Wrap(err, "creating lead email")
		}
	}
	for _, p := range extracted.Phones {
		if _, err := qtx.CreateLeadPhone(ctx, sqlcgen.CreateLeadPhoneParams{
			LeadID: lead.ID, Phone: p.E164, Type: p.Type,
			Country: isoCode(p.Country, 2), Context: strPtr(p.Context),
		}); err != nil {
			return false, errors.Wrap(err, "creating lead phone")
		}
	}
	for _, s := range extracted.Socials {
		if _, err := qtx.CreateLeadSocial(ctx, sqlcgen.CreateLeadSocialParams{
			LeadID: lead.ID, Platform: s.Platform, Handle: strPtr(s.Handle), Url: strPtr(s.URL),
		}); err != nil {
			return false, errors.Wrap(err, "creating lead social")
		}
	}

	detail := "lead generado por scraping"
	if _, err := qtx.CreateLeadActivity(ctx, sqlcgen.CreateLeadActivityParams{
		LeadID: lead.ID, ActivityType: "created", Detail: &detail,
	}); err != nil {
		return false, errors.Wrap(err, "creating lead activity")
	}

	if err := tx.Commit(ctx); err != nil {
		return false, errors.Wrap(err, "commit lead tx")
	}
	return true, nil
}

func (w *ScrapingWorker) failJob(ctx context.Context, jobID, companyID uuid.UUID, started time.Time, urls, leads int, summary string) {
	_, _ = w.q.UpdateScrapingJobStatus(ctx, sqlcgen.UpdateScrapingJobStatusParams{
		ID:            jobID,
		CompanyID:     companyID,
		Status:        "failed",
		StartedAt:     pgtype.Timestamptz{Time: started, Valid: true},
		FinishedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UrlsProcessed: int32(urls),
		LeadsFound:    int32(leads),
		ErrorSummary:  &summary,
	})
}

func strPtr(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}

func isoCode(s string, maxLen int) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if len(s) > maxLen {
		s = s[:maxLen]
	}
	return &s
}
