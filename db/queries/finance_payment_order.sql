-- ─── Payment orders ────────────────────────────────────────────────────────────

-- name: CreatePaymentOrder :one
INSERT INTO payment_orders (
    company_id, idempotency_key, supplier_id, date, number, currency,
    exchange_rate, total_amount, notes, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetPaymentOrderByID :one
SELECT * FROM payment_orders
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetPaymentOrderByIdempotencyKey :one
SELECT * FROM payment_orders
WHERE company_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL;

-- name: ListPaymentOrders :many
SELECT * FROM payment_orders
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('supplier_id')::uuid IS NULL OR supplier_id = sqlc.narg('supplier_id'))
  AND (sqlc.narg('from_date')::date IS NULL OR date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR date <= sqlc.narg('to_date'))
ORDER BY date DESC, created_at DESC;

-- name: SoftDeletePaymentOrder :exec
UPDATE payment_orders SET deleted_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- ─── Payment order methods ─────────────────────────────────────────────────────

-- name: CreatePaymentOrderMethod :one
INSERT INTO payment_order_methods (
    payment_order_id, method_type, cash_register_id, bank_account_id,
    amount, currency, check_number, check_date
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListPaymentOrderMethods :many
SELECT * FROM payment_order_methods WHERE payment_order_id = $1;

-- ─── Payment order applications ────────────────────────────────────────────────

-- name: CreatePaymentOrderApplication :one
INSERT INTO payment_order_applications (payment_order_id, invoice_received_id, amount)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListPaymentOrderApplications :many
SELECT * FROM payment_order_applications WHERE payment_order_id = $1;

-- name: GetInvoiceReceivedApplicationSum :one
SELECT COALESCE(SUM(amount), 0)::numeric AS total
FROM payment_order_applications
WHERE invoice_received_id = $1;
