// Package scrapingjobs implements the River worker that runs the scraping
// pipeline: search → fetch → deterministic extract → LLM extract → persist.
package scrapingjobs

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/shopspring/decimal"

	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/scraping/extractor"
	"pixs/internal/scraping/fetcher"
	"pixs/internal/scraping/llm"
	"pixs/internal/scraping/search"
)

// decimalToNumeric converts a decimal.Decimal to a valid pgtype.Numeric.
func decimalToNumeric(d decimal.Decimal) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(d.String())
	return n
}

// ScrapingJobArgs is the River job payload for a scraping run.
type ScrapingJobArgs struct {
	CompanyID   string `json:"company_id"`
	UserID      string `json:"user_id"`
	JobID       string `json:"job_id"`
	Query       string `json:"query"`
	Country     string `json:"country"`
	Language    string `json:"language"`
	ResultCount int    `json:"result_count"`
}

// Kind identifies the job type for River.
func (ScrapingJobArgs) Kind() string { return "scraping_job" }

// ScrapingWorker executes the scraping pipeline.
type ScrapingWorker struct {
	river.WorkerDefaults[ScrapingJobArgs]
	db           *pgxpool.Pool
	q            *sqlcgen.Queries
	search       search.Provider
	llmExtractor llm.Extractor
	fetcher      *fetcher.Fetcher
	logger       *slog.Logger
}

// NewScrapingWorker constructs a ScrapingWorker with the default fetcher config.
func NewScrapingWorker(db *pgxpool.Pool, searchProvider search.Provider, llmExt llm.Extractor, logger *slog.Logger) *ScrapingWorker {
	if logger == nil {
		logger = slog.Default()
	}
	return &ScrapingWorker{
		db:           db,
		q:            sqlcgen.New(db),
		search:       searchProvider,
		llmExtractor: llmExt,
		fetcher:      fetcher.New(fetcher.DefaultConfig(), logger),
		logger:       logger,
	}
}

// SetFetcher overrides the fetcher (used by tests to lower rate limits and crawl depth).
func (w *ScrapingWorker) SetFetcher(f *fetcher.Fetcher) { w.fetcher = f }

// Work is the River entry point.
func (w *ScrapingWorker) Work(ctx context.Context, job *river.Job[ScrapingJobArgs]) error {
	return w.RunPipeline(ctx, job.Args)
}

// RunPipeline executes the full scraping pipeline. Exported so integration
// tests can drive it directly without going through River's queue.
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

	// 1. Mark the job running.
	if _, err := w.q.UpdateScrapingJobStatus(ctx, sqlcgen.UpdateScrapingJobStatusParams{
		ID:        jobID,
		CompanyID: companyID,
		Status:    "running",
		StartedAt: pgtype.Timestamptz{Time: started, Valid: true},
	}); err != nil {
		return errors.Wrap(err, "marking job running")
	}

	// 2. Search for candidate URLs.
	results, searchCost, err := w.search.Search(ctx, args.Query, args.Country, args.Language, args.ResultCount)
	if err != nil {
		w.failJob(ctx, jobID, companyID, started, 0, 0, fmt.Sprintf("búsqueda fallida: %v", err))
		return errors.Wrap(err, "search step")
	}
	if len(results) > args.ResultCount && args.ResultCount > 0 {
		results = results[:args.ResultCount]
	}

	var llmTokensIn, llmTokensOut int
	llmCost := decimal.Zero
	leadsFound := 0
	urlsProcessed := 0

	// 3-6. Process each URL.
	for _, res := range results {
		urlsProcessed++
		if err := ctx.Err(); err != nil {
			break
		}

		pages := w.fetcher.FetchAll(ctx, []string{res.URL})
		htmlPages := make([]string, 0, len(pages))
		for _, p := range pages {
			if p.Error == nil && p.HTML != "" {
				htmlPages = append(htmlPages, p.HTML)
			}
		}

		// Deterministic extraction (emails, phones, socials).
		extracted := extractor.Extract(ctx, htmlPages, args.Country)

		// LLM extraction (best-effort, with one retry).
		var company *llm.ExtractedCompany
		llmFailed := false
		if len(htmlPages) > 0 {
			combined := strings.Join(htmlPages, "\n")
			c, usage, lerr := w.llmExtractor.ExtractCompanyInfo(ctx, combined, res.URL)
			if lerr != nil {
				c, usage, lerr = w.llmExtractor.ExtractCompanyInfo(ctx, combined, res.URL)
			}
			if lerr != nil || c == nil {
				llmFailed = true
				w.logger.Warn("llm extraction failed", "url", res.URL, "err", lerr)
			} else {
				company = c
				llmTokensIn += usage.InputTokens
				llmTokensOut += usage.OutputTokens
				llmCost = llmCost.Add(decimal.NewFromFloat(usage.CostUSD))
			}
		}

		created, err := w.persistLead(ctx, companyID, jobID, res, extracted, company, llmFailed)
		if err != nil {
			w.logger.Warn("persisting lead failed", "url", res.URL, "err", err)
			continue
		}
		if created {
			leadsFound++
		}
	}

	// 7. Record costs.
	searchCostDec := decimal.NewFromFloat(searchCost)
	totalCost := searchCostDec.Add(llmCost)
	tokIn := int32(llmTokensIn)
	tokOut := int32(llmTokensOut)
	if _, err := w.q.UpdateScrapingJobCosts(ctx, sqlcgen.UpdateScrapingJobCostsParams{
		ID:               jobID,
		CompanyID:        companyID,
		SearchApiCostUsd: decimalToNumeric(searchCostDec),
		LlmTokensInput:   &tokIn,
		LlmTokensOutput:  &tokOut,
		LlmCostUsd:       decimalToNumeric(llmCost),
		TotalCostUsd:     decimalToNumeric(totalCost),
	}); err != nil {
		w.logger.Warn("recording job costs failed", "err", err)
	}

	// Mark completed.
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
		"job_id", jobID, "urls_processed", urlsProcessed, "leads_found", leadsFound,
		"total_cost_usd", totalCost.String())
	return nil
}

// persistLead inserts a lead and its child rows in a transaction.
// Returns false (without error) when the lead is a duplicate.
func (w *ScrapingWorker) persistLead(
	ctx context.Context,
	companyID, jobID uuid.UUID,
	res search.Result,
	extracted extractor.Result,
	company *llm.ExtractedCompany,
	llmFailed bool,
) (bool, error) {
	companyName := res.Title
	if company != nil && company.CompanyName != "" {
		companyName = company.CompanyName
	}
	if extracted.SchemaOrg != nil && extracted.SchemaOrg.Name != "" && companyName == "" {
		companyName = extracted.SchemaOrg.Name
	}
	if strings.TrimSpace(companyName) == "" {
		companyName = res.URL
	}

	website := res.URL

	// Duplicate check (website or name).
	if _, err := w.q.CheckLeadDuplicate(ctx, sqlcgen.CheckLeadDuplicateParams{
		CompanyID: companyID,
		Website:   &website,
		Lower:     companyName,
	}); err == nil {
		return false, nil // duplicate exists
	}

	tx, err := w.db.Begin(ctx)
	if err != nil {
		return false, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := w.q.WithTx(tx)

	params := sqlcgen.CreateLeadParams{
		CompanyID:           companyID,
		CompanyName:         companyName,
		SourceUrl:           &res.URL,
		Website:             &website,
		Status:              "new",
		ScrapingJobID:       pgtype.UUID{Bytes: jobID, Valid: true},
		LlmExtractionFailed: llmFailed,
	}
	if company != nil {
		params.Description = strPtr(company.ShortDescription)
		params.WhatTheyDo = strPtr(company.WhatTheyDo)
		params.Industry = strPtr(company.Industry)
		params.ApproximateSize = strPtr(company.ApproximateSize)
		params.Language = isoCode(company.SiteLanguage, 5)
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

// isoCode returns a pointer to s truncated to maxLen chars, or nil if empty.
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
