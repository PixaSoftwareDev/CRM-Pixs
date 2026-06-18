-- ─── Invoices received ─────────────────────────────────────────────────────────

-- name: CreateInvoiceReceived :one
INSERT INTO invoices_received (
    company_id, supplier_id, invoice_type, sale_point, number, issue_date,
    due_date, currency, exchange_rate, exchange_rate_date,
    net_amount, tax_amount, total_amount, status, project_id, file_key, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, $15, $16
)
RETURNING *;

-- name: GetInvoiceReceivedByID :one
SELECT * FROM invoices_received
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetInvoiceReceivedForUpdate :one
SELECT * FROM invoices_received
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
FOR UPDATE;

-- name: ListInvoicesReceived :many
SELECT * FROM invoices_received
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('supplier_id')::uuid IS NULL OR supplier_id = sqlc.narg('supplier_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY issue_date DESC NULLS LAST, created_at DESC;

-- name: UpdateInvoiceReceived :one
UPDATE invoices_received SET
    supplier_id = $3, invoice_type = $4, sale_point = $5, number = $6,
    issue_date = $7, due_date = $8, currency = $9, exchange_rate = $10,
    exchange_rate_date = $11, net_amount = $12, tax_amount = $13,
    total_amount = $14, project_id = $15, file_key = $16, notes = $17, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateInvoiceReceivedPaidAmount :one
UPDATE invoices_received SET paid_amount = $3, status = $4, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: VoidInvoiceReceived :one
UPDATE invoices_received SET status = 'void', updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteInvoiceReceived :exec
UPDATE invoices_received SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;
