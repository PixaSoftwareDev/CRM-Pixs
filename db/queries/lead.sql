-- name: CreateLead :one
INSERT INTO leads (company_id, company_name, description, what_they_do, source_url, website,
    industry, approximate_size, city, country, language, assigned_to, status, scraping_job_id,
    follow_up_date, llm_extraction_failed)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
RETURNING *;

-- name: GetLeadByID :one
SELECT * FROM leads WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetLeadForUpdate :one
SELECT * FROM leads WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL FOR UPDATE;

-- name: ListLeads :many
SELECT * FROM leads
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('assigned_to')::uuid IS NULL OR assigned_to = sqlc.narg('assigned_to'))
  AND (sqlc.narg('industry')::text IS NULL OR industry = sqlc.narg('industry'))
  AND (sqlc.narg('from_date')::date IS NULL OR created_at::date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR created_at::date <= sqlc.narg('to_date'))
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountLeads :one
SELECT COUNT(*) FROM leads
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('assigned_to')::uuid IS NULL OR assigned_to = sqlc.narg('assigned_to'));

-- name: UpdateLead :one
UPDATE leads SET
    company_name = $3, description = $4, what_they_do = $5, website = $6,
    industry = $7, approximate_size = $8, city = $9, country = $10,
    language = $11, follow_up_date = $12, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateLeadStatus :one
UPDATE leads SET status = $3, rejection_reason = $4, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: AssignLead :one
UPDATE leads SET assigned_to = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: ConvertLead :one
UPDATE leads SET status = 'converted', converted_contact_id = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: MarkLeadExtractionFailed :exec
UPDATE leads SET llm_extraction_failed = true, updated_at = now()
WHERE id = $1 AND company_id = $2;

-- name: SoftDeleteLead :exec
UPDATE leads SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: CheckLeadDuplicate :one
SELECT id FROM leads
WHERE company_id = $1 AND deleted_at IS NULL
  AND (
    (website IS NOT NULL AND website = $2) OR
    (lower(company_name) = lower($3))
  )
LIMIT 1;

-- name: CreateLeadEmail :one
INSERT INTO lead_emails (lead_id, email, context) VALUES ($1, $2, $3) RETURNING *;

-- name: ListLeadEmails :many
SELECT * FROM lead_emails WHERE lead_id = $1 ORDER BY created_at;

-- name: CreateLeadPhone :one
INSERT INTO lead_phones (lead_id, phone, type, country, context) VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListLeadPhones :many
SELECT * FROM lead_phones WHERE lead_id = $1 ORDER BY created_at;

-- name: CreateLeadSocial :one
INSERT INTO lead_socials (lead_id, platform, handle, url) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: ListLeadSocials :many
SELECT * FROM lead_socials WHERE lead_id = $1 ORDER BY created_at;

-- name: CreateLeadActivity :one
INSERT INTO lead_activities (lead_id, user_id, activity_type, detail) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: ListLeadActivities :many
SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100;

-- name: CreateLeadOpportunity :one
INSERT INTO opportunities (
    company_id, contact_id, stage_id, title, currency, assigned_user_id, source, lead_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetLeadMetrics :one
SELECT
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS leads_this_month,
    COUNT(*) FILTER (WHERE status = 'converted') AS total_converted,
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE status NOT IN ('rejected','converted')) AS active_leads
FROM leads
WHERE company_id = $1 AND deleted_at IS NULL;

-- name: GetLeadConversionByUser :many
SELECT
    assigned_to,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'converted') AS converted
FROM leads
WHERE company_id = $1 AND deleted_at IS NULL AND assigned_to IS NOT NULL
GROUP BY assigned_to;
