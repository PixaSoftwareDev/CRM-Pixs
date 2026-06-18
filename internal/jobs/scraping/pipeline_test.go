//go:build integration

package scrapingjobs_test

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	sqlcgen "pixs/internal/repository/sqlc"
	scrapingjobs "pixs/internal/jobs/scraping"
	"pixs/internal/scraping/fetcher"
	"pixs/internal/scraping/llm"
	"pixs/internal/scraping/search"
)

// fixtureHTMLFor builds a distinct company page per slug so the dedup check
// (which collapses identical company names) does not merge the three leads.
func fixtureHTMLFor(slug string) string {
	return `<!DOCTYPE html>
<html lang="es"><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Estudio ` + slug + ` SA","description":"Agencia"}
</script>
</head><body>
<h1>Estudio ` + slug + ` SA</h1>
<p>Somos una agencia creativa con sede en Buenos Aires. Más de 20 años de experiencia.</p>
<p>Contacto: hola@estudio` + slug + `.com.ar — Tel: +54 11 4555-1234</p>
<a href="https://www.instagram.com/estudio` + slug + `">Instagram</a>
<a href="https://linkedin.com/company/estudio-` + slug + `">LinkedIn</a>
<p>Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit.</p>
</body></html>`
}

func startPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("pixstest"),
		tcpostgres.WithUsername("pixs"),
		tcpostgres.WithPassword("pixs"),
		tcpostgres.BasicWaitStrategies(),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ctr.Terminate(context.Background()) })

	connStr, err := ctr.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	pool, err := pgxpool.New(ctx, connStr)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	applyMigrations(t, pool)
	applyRiverMigrations(t, pool)
	return pool
}

func applyMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "db", "migrations")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	files := make([]string, 0, len(entries))
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	for _, f := range files {
		sql, err := os.ReadFile(filepath.Join(dir, f))
		require.NoError(t, err, "reading %s", f)
		_, err = pool.Exec(context.Background(), string(sql))
		require.NoError(t, err, "applying %s", f)
	}
}

func applyRiverMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	require.NoError(t, err)
	_, err = migrator.Migrate(context.Background(), rivermigrate.DirectionUp, nil)
	require.NoError(t, err)
}

// TestScrapingPipeline runs the full pipeline with mocked search/LLM and a
// local HTTP server, asserting leads + child rows are persisted and the job
// finishes "completed".
func TestScrapingPipeline(t *testing.T) {
	ctx := context.Background()
	pool := startPostgres(t)
	q := sqlcgen.New(pool)

	companyID := uuid.MustParse("c0000000-0000-4000-8000-000000000001")
	userID := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO companies (id, legal_name, fantasy_name) VALUES ($1,'Test Co','Test') ON CONFLICT (id) DO NOTHING`, companyID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO users (id, company_id, email, password_hash, full_name) VALUES ($1,$2,'u@test.local','x','U') ON CONFLICT (id) DO NOTHING`, userID, companyID)
	require.NoError(t, err)

	// Local HTTP server serving a distinct fixture per path (slug = first path segment).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slug := r.URL.Path[1:]
		_, _ = w.Write([]byte(fixtureHTMLFor(slug)))
	}))
	t.Cleanup(srv.Close)

	urls := []string{srv.URL + "/Alfa", srv.URL + "/Beta", srv.URL + "/Gama"}
	mockSearch := &search.MockProvider{
		Results: []search.Result{
			{URL: urls[0], Title: "Estudio Alfa SA"},
			{URL: urls[1], Title: "Estudio Beta SA"},
			{URL: urls[2], Title: "Estudio Gama SA"},
		},
		Cost: 0.0003,
	}
	// LLM mock leaves CompanyName empty so the per-page title/schema name is kept
	// (and the three leads stay distinct); it still supplies industry/description.
	mockLLM := &llm.MockExtractor{
		Data: &llm.ExtractedCompany{
			ShortDescription: "Agencia creativa", WhatTheyDo: "Diseño y branding",
			Industry: "services", ApproximateSize: "small", SiteLanguage: "es",
		},
		Usage: llm.Usage{InputTokens: 500, OutputTokens: 100, CostUSD: 0.001},
	}

	worker := scrapingjobs.NewScrapingWorker(pool, mockSearch, mockLLM, slog.Default())
	// Fast fetcher: no crawl, no rate-limit delay.
	worker.SetFetcher(fetcher.New(fetcher.Config{CrawlDepth: 1, DomainRateLimitMs: 0, TimeoutSec: 10}, slog.Default()))

	job, err := q.CreateScrapingJob(ctx, sqlcgen.CreateScrapingJobParams{
		CompanyID: companyID, UserID: userID, Query: "agencias buenos aires", ResultCountRequested: 3,
	})
	require.NoError(t, err)

	runCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	require.NoError(t, worker.RunPipeline(runCtx, scrapingjobs.ScrapingJobArgs{
		CompanyID: companyID.String(), UserID: userID.String(), JobID: job.ID.String(),
		Query: "agencias buenos aires", Country: "AR", Language: "es", ResultCount: 3,
	}))

	// Job finished completed with 3 leads.
	finished, err := q.GetScrapingJobByID(ctx, sqlcgen.GetScrapingJobByIDParams{ID: job.ID, CompanyID: companyID})
	require.NoError(t, err)
	require.Equal(t, "completed", finished.Status)
	require.Equal(t, int32(3), finished.LeadsFound)
	require.Equal(t, int32(3), finished.UrlsProcessed)

	// 3 leads persisted with deterministic email/phone/socials.
	var leadCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM leads WHERE scraping_job_id = $1`, job.ID).Scan(&leadCount))
	require.Equal(t, 3, leadCount)

	var leadID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM leads WHERE scraping_job_id = $1 LIMIT 1`, job.ID).Scan(&leadID))

	var emailCount, phoneCount, socialCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM lead_emails WHERE lead_id = $1`, leadID).Scan(&emailCount))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM lead_phones WHERE lead_id = $1`, leadID).Scan(&phoneCount))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM lead_socials WHERE lead_id = $1`, leadID).Scan(&socialCount))
	require.GreaterOrEqual(t, emailCount, 1, "expected at least one email")
	require.GreaterOrEqual(t, phoneCount, 1, "expected at least one phone")
	require.GreaterOrEqual(t, socialCount, 1, "expected at least one social")

	// LLM data landed on the lead.
	var industry string
	require.NoError(t, pool.QueryRow(ctx, `SELECT industry FROM leads WHERE id = $1`, leadID).Scan(&industry))
	require.Equal(t, "services", industry)
}
