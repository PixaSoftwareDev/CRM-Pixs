-- name: CreateQuote :one
INSERT INTO quotes (
    company_id, number, contact_id, opportunity_id, user_id,
    date, valid_until, currency, exchange_rate, status, version, parent_id, notes,
    subtotal, tax_total, total
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
RETURNING *;

-- name: GetQuoteByID :one
SELECT * FROM quotes WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetQuoteByNumber :one
SELECT * FROM quotes WHERE company_id = $1 AND number = $2 AND deleted_at IS NULL;

-- name: ListQuotes :many
SELECT * FROM quotes
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('contact_id')::uuid IS NULL OR contact_id = sqlc.narg('contact_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('opportunity_id')::uuid IS NULL OR opportunity_id = sqlc.narg('opportunity_id'))
ORDER BY created_at DESC;

-- name: UpdateQuote :one
UPDATE quotes SET
    contact_id = $3, opportunity_id = $4, user_id = $5,
    date = $6, valid_until = $7, currency = $8, exchange_rate = $9,
    notes = $10, subtotal = $11, tax_total = $12, total = $13, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateQuoteStatus :one
UPDATE quotes SET status = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteQuote :exec
UPDATE quotes SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetQuoteVersions :many
SELECT * FROM quotes
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (id = $2 OR parent_id = $2)
ORDER BY version ASC;

-- name: GetMaxQuoteNumber :one
SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM '[0-9]+$') AS INTEGER)), 0)::int
FROM quotes WHERE company_id = $1;

-- name: CreateQuoteItem :one
INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, discount_pct, vat_rate_pct, line_subtotal, line_tax, line_total, order_pos)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: ListQuoteItems :many
SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY order_pos NULLS LAST, id;

-- name: DeleteQuoteItems :exec
DELETE FROM quote_items WHERE quote_id = $1;
