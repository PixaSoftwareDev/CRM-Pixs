-- name: CreateVaultEntry :one
INSERT INTO vault_entries (company_id, created_by, category, label, username, secret, url, notes, tags)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListVaultEntries :many
SELECT * FROM vault_entries
WHERE company_id = $1 AND deleted_at IS NULL
  AND (sqlc.narg('category')::text IS NULL OR category = sqlc.narg('category'))
ORDER BY category, label;

-- name: GetVaultEntry :one
SELECT * FROM vault_entries
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: UpdateVaultEntry :one
UPDATE vault_entries
SET category = $3, label = $4, username = $5, secret = $6, url = $7, notes = $8, tags = $9, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteVaultEntry :exec
UPDATE vault_entries SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;
