-- name: CreateTimeEntry :one
INSERT INTO time_entries (
    company_id, user_id, date, started_at, ended_at, duration_minutes,
    description, task_id, project_id, contact_id, is_billable, hourly_rate, currency
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetTimeEntryByID :one
SELECT * FROM time_entries WHERE id = $1 AND company_id = $2;

-- name: ListTimeEntries :many
SELECT * FROM time_entries
WHERE company_id = $1
  AND (sqlc.narg('user_id')::uuid IS NULL OR user_id = sqlc.narg('user_id'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('task_id')::uuid IS NULL OR task_id = sqlc.narg('task_id'))
  AND (sqlc.narg('from_date')::date IS NULL OR date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR date <= sqlc.narg('to_date'))
  AND (sqlc.narg('is_billable')::boolean IS NULL OR is_billable = sqlc.narg('is_billable'))
ORDER BY date DESC, created_at DESC;

-- name: GetTimesheetWeek :many
SELECT * FROM time_entries
WHERE user_id = $1
  AND date >= $2 AND date < $2 + INTERVAL '7 days'
ORDER BY date, created_at;

-- name: GetUtilizationStats :one
SELECT
    COALESCE(SUM(duration_minutes), 0)::bigint AS total_minutes,
    COALESCE(SUM(CASE WHEN is_billable THEN duration_minutes ELSE 0 END), 0)::bigint AS billable_minutes
FROM time_entries
WHERE user_id = $1
  AND date >= $2 AND date <= $3
  AND company_id = $4;
