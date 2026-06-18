-- name: CreateOpportunity :one
INSERT INTO opportunities (
    company_id, contact_id, stage_id, title, amount, currency,
    probability_pct, expected_close_date, assigned_user_id, source
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetOpportunityByID :one
SELECT * FROM opportunities WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListOpportunities :many
SELECT * FROM opportunities
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('stage_id')::uuid IS NULL OR stage_id = sqlc.narg('stage_id'))
  AND (sqlc.narg('assigned_user_id')::uuid IS NULL OR assigned_user_id = sqlc.narg('assigned_user_id'))
  AND (sqlc.narg('contact_id')::uuid IS NULL OR contact_id = sqlc.narg('contact_id'))
ORDER BY created_at DESC;

-- name: UpdateOpportunity :one
UPDATE opportunities SET
    contact_id = $3, stage_id = $4, title = $5, amount = $6, currency = $7,
    probability_pct = $8, expected_close_date = $9, assigned_user_id = $10,
    source = $11, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: MoveOpportunityStage :one
UPDATE opportunities SET stage_id = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: WinOpportunity :one
UPDATE opportunities SET stage_id = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: LoseOpportunity :one
UPDATE opportunities SET
    stage_id = $3, lost_reason_id = $4, lost_notes = $5, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteOpportunity :exec
UPDATE opportunities SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListPipelineStages :many
SELECT * FROM pipeline_stages WHERE company_id = $1 ORDER BY order_pos;

-- name: GetPipelineStageByID :one
SELECT * FROM pipeline_stages WHERE id = $1 AND company_id = $2;

-- name: GetWinStage :one
SELECT * FROM pipeline_stages WHERE company_id = $1 AND is_win = true LIMIT 1;

-- name: GetLossStage :one
SELECT * FROM pipeline_stages WHERE company_id = $1 AND is_loss = true LIMIT 1;

-- name: CreatePipelineStage :one
INSERT INTO pipeline_stages (company_id, name, order_pos, color, is_win, is_loss, is_default)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePipelineStage :one
UPDATE pipeline_stages SET name = $3, order_pos = $4, color = $5, is_win = $6, is_loss = $7, is_default = $8
WHERE id = $1 AND company_id = $2
RETURNING *;

-- name: ListOpportunitiesForForecast :many
SELECT id, amount, probability_pct, currency FROM opportunities
WHERE company_id = $1 AND deleted_at IS NULL
  AND amount IS NOT NULL AND probability_pct IS NOT NULL;

-- name: ListLostReasons :many
SELECT * FROM lost_reasons WHERE company_id = $1 ORDER BY name;

-- name: CreateLostReason :one
INSERT INTO lost_reasons (company_id, name) VALUES ($1, $2) RETURNING *;
