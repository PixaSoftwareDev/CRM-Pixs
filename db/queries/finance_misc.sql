-- ─── Expenses ──────────────────────────────────────────────────────────────────

-- name: CreateExpense :one
INSERT INTO expenses (
    company_id, date, category_id, description, amount, currency,
    paid_by_user_id, paid_by_cash_id, paid_by_bank_id, file_key, project_id,
    status, reimbursement_status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetExpenseByID :one
SELECT * FROM expenses
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListExpenses :many
SELECT * FROM expenses
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('category_id')::uuid IS NULL OR category_id = sqlc.narg('category_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('from_date')::date IS NULL OR date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR date <= sqlc.narg('to_date'))
ORDER BY date DESC, created_at DESC;

-- name: UpdateExpenseStatus :one
UPDATE expenses SET
    status = $3, approver_id = $4, approved_at = $5,
    reimbursement_status = $6, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteExpense :exec
UPDATE expenses SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- ─── Recurring payments ────────────────────────────────────────────────────────

-- name: CreateRecurringPayment :one
INSERT INTO recurring_payments (
    company_id, supplier_id, description, amount, currency, frequency,
    due_day, next_due_date, payment_method, category_id, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
RETURNING *;

-- name: GetRecurringPaymentByID :one
SELECT * FROM recurring_payments
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListRecurringPayments :many
SELECT * FROM recurring_payments
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY next_due_date NULLS LAST;

-- name: ListActiveRecurringDue :many
SELECT * FROM recurring_payments
WHERE company_id = $1 AND deleted_at IS NULL AND status = 'active'
  AND next_due_date IS NOT NULL AND next_due_date <= $2;

-- name: UpdateRecurringPayment :one
UPDATE recurring_payments SET
    supplier_id = $3, description = $4, amount = $5, currency = $6,
    frequency = $7, due_day = $8, next_due_date = $9, payment_method = $10,
    category_id = $11, status = $12, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: AdvanceRecurringNextDue :one
UPDATE recurring_payments SET next_due_date = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteRecurringPayment :exec
UPDATE recurring_payments SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- ─── Payment obligations ───────────────────────────────────────────────────────

-- name: CreatePaymentObligation :one
INSERT INTO payment_obligations (
    company_id, source_type, source_id, description, amount, currency, due_date, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
RETURNING *;

-- name: GetPaymentObligationByID :one
SELECT * FROM payment_obligations
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListPaymentObligations :many
SELECT * FROM payment_obligations
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('source_type')::text IS NULL OR source_type = sqlc.narg('source_type'))
  AND (sqlc.narg('from_date')::date IS NULL OR due_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR due_date <= sqlc.narg('to_date'))
ORDER BY due_date;

-- name: MarkObligationPaid :one
UPDATE payment_obligations SET
    status = 'paid', paid_at = now(), payment_order_id = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL AND status = 'pending'
RETURNING *;

-- ─── Contact balances ──────────────────────────────────────────────────────────

-- name: GetFinanceContactBalance :one
SELECT * FROM contact_balances WHERE contact_id = $1 AND currency = $2;

-- name: UpsertFinanceContactBalance :exec
INSERT INTO contact_balances (contact_id, currency, balance)
VALUES ($1, $2, $3)
ON CONFLICT (contact_id, currency) DO UPDATE
SET balance = contact_balances.balance + EXCLUDED.balance, updated_at = now();

-- ─── Catalogs ──────────────────────────────────────────────────────────────────

-- name: ListVATRates :many
SELECT * FROM vat_rates WHERE company_id = $1 AND is_active = true ORDER BY rate_pct;

-- name: GetVATRateByID :one
SELECT * FROM vat_rates WHERE id = $1 AND company_id = $2;

-- name: ListPaymentConditions :many
SELECT * FROM payment_conditions WHERE company_id = $1 AND is_active = true ORDER BY days;

-- name: ListExpenseCategories :many
SELECT * FROM expense_categories WHERE company_id = $1 AND is_active = true ORDER BY name;

-- name: ListCurrencies :many
SELECT * FROM currencies ORDER BY code;

-- name: CreateExchangeRate :one
INSERT INTO exchange_rates (company_id, from_currency, to_currency, rate, date, source)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (company_id, from_currency, to_currency, date)
DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
RETURNING *;

-- name: GetLatestExchangeRate :one
SELECT * FROM exchange_rates
WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3
ORDER BY date DESC
LIMIT 1;
