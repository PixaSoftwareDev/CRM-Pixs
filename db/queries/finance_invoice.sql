-- ─── Sequence numbering ────────────────────────────────────────────────────────

-- name: NextSequenceNumber :one
-- Allocates the next document number atomically. The UPDATE acquires a
-- row-level lock on the matching sequence_numbers row, so concurrent
-- transactions are serialized and numbers are unique and gap-free.
UPDATE sequence_numbers SET last_number = last_number + 1
WHERE company_id = $1 AND document_type = $2 AND sale_point = $3
RETURNING last_number;

-- ─── Invoices issued ───────────────────────────────────────────────────────────

-- name: CreateInvoiceDraft :one
INSERT INTO invoices_issued (
    company_id, idempotency_key, invoice_type, sale_point, contact_id,
    issue_date, due_date, payment_condition_id, currency, exchange_rate,
    exchange_rate_date, status, net_amount, tax_amount, total_amount,
    project_id, quote_id, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12, $13, $14, $15, $16, $17
)
RETURNING *;

-- name: GetInvoiceByID :one
SELECT * FROM invoices_issued
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetInvoiceForUpdate :one
SELECT * FROM invoices_issued
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
FOR UPDATE;

-- name: GetInvoiceByIdempotencyKey :one
SELECT * FROM invoices_issued
WHERE company_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL;

-- name: ListInvoices :many
SELECT * FROM invoices_issued
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('contact_id')::uuid IS NULL OR contact_id = sqlc.narg('contact_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('from_date')::date IS NULL OR issue_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR issue_date <= sqlc.narg('to_date'))
ORDER BY issue_date DESC, created_at DESC;

-- name: UpdateInvoiceDraft :one
UPDATE invoices_issued SET
    contact_id = $3, issue_date = $4, due_date = $5, payment_condition_id = $6,
    currency = $7, exchange_rate = $8, exchange_rate_date = $9,
    net_amount = $10, tax_amount = $11, total_amount = $12,
    project_id = $13, quote_id = $14, notes = $15, updated_at = now()
WHERE id = $1 AND company_id = $2 AND status = 'draft' AND deleted_at IS NULL
RETURNING *;

-- name: IssueInvoice :one
UPDATE invoices_issued SET status = 'issued', number = $3, idempotency_key = $4, updated_at = now()
WHERE id = $1 AND company_id = $2 AND status = 'draft' AND deleted_at IS NULL
RETURNING *;

-- name: UpdateInvoicePaidAmount :one
UPDATE invoices_issued SET
    paid_amount = $3,
    status = $4,
    updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: VoidInvoice :one
UPDATE invoices_issued SET status = 'void', updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
  AND status NOT IN ('void')
RETURNING *;

-- name: SoftDeleteInvoice :exec
UPDATE invoices_issued SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND status = 'draft' AND deleted_at IS NULL;

-- ─── Invoice items ─────────────────────────────────────────────────────────────

-- name: CreateInvoiceItem :one
INSERT INTO invoice_items (
    invoice_id, product_id, description, quantity, unit_price, discount_pct,
    vat_rate_id, line_net, line_tax, line_total, order_pos
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: ListInvoiceItems :many
SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY order_pos;

-- name: DeleteInvoiceItems :exec
DELETE FROM invoice_items WHERE invoice_id = $1;

-- ─── Invoice taxes ─────────────────────────────────────────────────────────────

-- name: CreateInvoiceTax :one
INSERT INTO invoice_taxes (invoice_id, tax_type, rate_pct, base_amount, tax_amount)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListInvoiceTaxes :many
SELECT * FROM invoice_taxes WHERE invoice_id = $1;

-- name: DeleteInvoiceTaxes :exec
DELETE FROM invoice_taxes WHERE invoice_id = $1;
