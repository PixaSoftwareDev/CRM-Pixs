-- ─── Cash registers ────────────────────────────────────────────────────────────

-- name: CreateCashRegister :one
INSERT INTO cash_registers (company_id, name, currency, responsible_id, is_active)
VALUES ($1, $2, $3, $4, true)
RETURNING *;

-- name: GetCashRegisterByID :one
SELECT * FROM cash_registers
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListCashRegisters :many
SELECT * FROM cash_registers
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY name;

-- name: UpdateCashRegister :one
UPDATE cash_registers SET
    name = $3, currency = $4, responsible_id = $5, is_active = $6, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteCashRegister :exec
UPDATE cash_registers SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- ─── Cash sessions ─────────────────────────────────────────────────────────────

-- name: OpenCashSession :one
INSERT INTO cash_register_sessions (cash_register_id, opened_by, opening_balance, status)
VALUES ($1, $2, $3, 'open')
RETURNING *;

-- name: GetOpenSession :one
SELECT * FROM cash_register_sessions
WHERE cash_register_id = $1 AND status = 'open'
ORDER BY opened_at DESC
LIMIT 1;

-- name: CloseSession :one
UPDATE cash_register_sessions SET
    closed_by = $2, closed_at = now(),
    declared_closing_balance = $3, calculated_closing_balance = $4,
    difference = $5, status = 'closed'
WHERE id = $1 AND status = 'open'
RETURNING *;

-- ─── Cash movements ────────────────────────────────────────────────────────────

-- name: CreateCashMovement :one
INSERT INTO cash_movements (
    company_id, cash_register_id, session_id, type, amount, currency,
    description, reference_type, reference_id, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: ListCashMovements :many
SELECT * FROM cash_movements
WHERE cash_register_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('from_date')::timestamptz IS NULL OR created_at >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::timestamptz IS NULL OR created_at <= sqlc.narg('to_date'))
ORDER BY created_at DESC;

-- name: GetCashBalance :one
SELECT COALESCE(SUM(CASE WHEN type IN ('income','transfer_in') THEN amount ELSE -amount END), 0)::numeric AS balance
FROM cash_movements
WHERE cash_register_id = $1 AND deleted_at IS NULL;

-- ─── Bank accounts ─────────────────────────────────────────────────────────────

-- name: CreateBankAccountFinance :one
INSERT INTO bank_accounts_finance (
    company_id, bank_name, account_number, cbu, alias, currency,
    account_holder, book_balance, is_active
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
RETURNING *;

-- name: GetBankAccountFinanceByID :one
SELECT * FROM bank_accounts_finance
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListBankAccountsFinance :many
SELECT * FROM bank_accounts_finance
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY bank_name;

-- name: UpdateBankAccountFinance :one
UPDATE bank_accounts_finance SET
    bank_name = $3, account_number = $4, cbu = $5, alias = $6,
    currency = $7, account_holder = $8, is_active = $9, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateBankAccountBalance :one
UPDATE bank_accounts_finance SET book_balance = $3, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- ─── Bank movements ────────────────────────────────────────────────────────────

-- name: CreateBankMovement :one
INSERT INTO bank_movements (
    company_id, bank_account_id, type, amount, currency, description,
    reference_type, reference_id, value_date, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: ListBankMovements :many
SELECT * FROM bank_movements
WHERE bank_account_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('from_date')::date IS NULL OR value_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR value_date <= sqlc.narg('to_date'))
ORDER BY value_date DESC, created_at DESC;

-- name: ReconcileBankMovement :one
UPDATE bank_movements SET reconciled = true, reconciled_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;
