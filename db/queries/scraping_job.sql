-- name: CreateScrapingJob :one
INSERT INTO scraping_jobs (company_id, user_id, query, result_count_requested, country, language, status)
VALUES ($1, $2, $3, $4, $5, $6, 'pending')
RETURNING *;

-- name: GetScrapingJobByID :one
SELECT * FROM scraping_jobs WHERE id = $1 AND company_id = $2;

-- name: ListScrapingJobs :many
SELECT * FROM scraping_jobs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50;

-- name: UpdateScrapingJobStatus :one
UPDATE scraping_jobs SET status = $3, started_at = $4, finished_at = $5,
    urls_processed = $6, leads_found = $7, error_summary = $8
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: UpdateScrapingJobCosts :one
UPDATE scraping_jobs SET
    search_api_cost_usd = $3, llm_tokens_input = $4, llm_tokens_output = $5,
    llm_cost_usd = $6, total_cost_usd = $7
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: DeleteScrapingJob :exec
DELETE FROM scraping_jobs WHERE id = $1 AND company_id = $2;

-- name: CountScrapingJobsToday :one
SELECT COALESCE(SUM(result_count_requested), 0)::int
FROM scraping_jobs
WHERE company_id = $1
  AND user_id = $2
  AND created_at >= date_trunc('day', now());
