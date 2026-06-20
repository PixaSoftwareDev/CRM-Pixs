-- Industry (rubro) queries for sqlc generation.

-- name: CreateIndustry :one
INSERT INTO industries (company_id, name)
VALUES ($1, $2)
RETURNING *;

-- name: ListIndustries :many
SELECT * FROM industries
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY name;

-- name: GetIndustryByID :one
SELECT * FROM industries
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;
