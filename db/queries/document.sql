-- Document (attachment) queries for sqlc generation.
-- Metadata only; bytes live on disk under PIXS_STORAGE_DIR at storage_key.

-- name: CreateDocument :one
INSERT INTO documents (
    company_id, entity_type, entity_id, file_name, content_type,
    size_bytes, storage_key, uploaded_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListDocuments :many
SELECT * FROM documents
WHERE company_id = $1
  AND entity_type = $2
  AND entity_id = $3
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- name: GetDocumentByID :one
SELECT * FROM documents
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: SoftDeleteDocument :exec
UPDATE documents
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;
