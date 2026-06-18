-- ─── Receipts ──────────────────────────────────────────────────────────────────

-- name: CreateReceipt :one
INSERT INTO receipts (
    company_id, idempotency_key, contact_id, date, number, currency,
    exchange_rate, total_amount, on_account_amount, notes, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: GetReceiptByID :one
SELECT r.*, c.fantasy_name AS contact_name
FROM receipts r
JOIN contacts c ON c.id = r.contact_id
WHERE r.id = $1 AND r.company_id = $2 AND r.deleted_at IS NULL;

-- name: GetReceiptByIdempotencyKey :one
SELECT * FROM receipts
WHERE company_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL;

-- name: ListReceipts :many
SELECT * FROM receipts
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('contact_id')::uuid IS NULL OR contact_id = sqlc.narg('contact_id'))
  AND (sqlc.narg('from_date')::date IS NULL OR date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR date <= sqlc.narg('to_date'))
ORDER BY date DESC, created_at DESC;

-- name: SoftDeleteReceipt :exec
UPDATE receipts SET deleted_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- ─── Receipt payment methods ───────────────────────────────────────────────────

-- name: CreateReceiptPaymentMethod :one
INSERT INTO receipt_payment_methods (
    receipt_id, method_type, cash_register_id, bank_account_id,
    amount, currency, check_number, check_date
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListReceiptPaymentMethods :many
SELECT * FROM receipt_payment_methods WHERE receipt_id = $1;

-- ─── Receipt applications ──────────────────────────────────────────────────────

-- name: CreateReceiptApplication :one
INSERT INTO receipt_invoice_applications (receipt_id, invoice_id, amount)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListReceiptApplications :many
SELECT * FROM receipt_invoice_applications WHERE receipt_id = $1;

-- name: GetInvoiceApplicationSum :one
SELECT COALESCE(SUM(amount), 0)::numeric AS total
FROM receipt_invoice_applications
WHERE invoice_id = $1;
