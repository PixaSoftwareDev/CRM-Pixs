-- ─── Accounts receivable (CtaCte / cash flow) ──────────────────────────────────

-- name: GetArReceivables :many
SELECT
    i.id, i.contact_id, c.fantasy_name AS contact_name,
    i.invoice_type, i.number, i.issue_date, i.due_date, i.currency,
    i.total_amount, i.paid_amount,
    (i.total_amount - i.paid_amount)::numeric AS remaining,
    i.status
FROM invoices_issued i
JOIN contacts c ON c.id = i.contact_id
WHERE i.company_id = $1
  AND i.deleted_at IS NULL
  AND i.status IN ('issued','partially_paid','overdue')
  AND (sqlc.narg('currency')::text IS NULL OR i.currency = sqlc.narg('currency'))
ORDER BY i.due_date NULLS LAST;

-- name: GetArPayables :many
SELECT
    ir.id, ir.supplier_id, c.fantasy_name AS supplier_name,
    ir.invoice_type, ir.number, ir.issue_date, ir.due_date, ir.currency,
    ir.total_amount, ir.paid_amount,
    (ir.total_amount - ir.paid_amount)::numeric AS remaining,
    ir.status
FROM invoices_received ir
JOIN contacts c ON c.id = ir.supplier_id
WHERE ir.company_id = $1
  AND ir.deleted_at IS NULL
  AND ir.status IN ('pending','partially_paid')
  AND (sqlc.narg('currency')::text IS NULL OR ir.currency = sqlc.narg('currency'))
ORDER BY ir.due_date NULLS LAST;

-- name: GetCashFlowProjection :many
SELECT due_date, currency, direction, SUM(amount)::numeric AS amount
FROM (
    SELECT i.due_date AS due_date, i.currency AS currency, 'in' AS direction,
           (i.total_amount - i.paid_amount) AS amount
    FROM invoices_issued i
    WHERE i.company_id = $1 AND i.deleted_at IS NULL
      AND i.status IN ('issued','partially_paid','overdue')
      AND i.due_date IS NOT NULL
    UNION ALL
    SELECT o.due_date AS due_date, o.currency AS currency, 'out' AS direction,
           o.amount AS amount
    FROM payment_obligations o
    WHERE o.company_id = $1 AND o.deleted_at IS NULL AND o.status = 'pending'
) flows
WHERE (sqlc.narg('currency')::text IS NULL OR currency = sqlc.narg('currency'))
GROUP BY due_date, currency, direction
ORDER BY due_date;

-- name: GetConsolidatedBalance :many
SELECT currency, SUM(balance)::numeric AS balance
FROM (
    SELECT cr.currency,
           COALESCE(SUM(CASE WHEN cm.type IN ('income','transfer_in') THEN cm.amount ELSE -cm.amount END), 0) AS balance
    FROM cash_registers cr
    LEFT JOIN cash_movements cm ON cm.cash_register_id = cr.id AND cm.deleted_at IS NULL
    WHERE cr.company_id = $1 AND cr.deleted_at IS NULL
    GROUP BY cr.currency
    UNION ALL
    SELECT ba.currency, COALESCE(SUM(ba.book_balance), 0) AS balance
    FROM bank_accounts_finance ba
    WHERE ba.company_id = $1 AND ba.deleted_at IS NULL
    GROUP BY ba.currency
) sources
GROUP BY currency
ORDER BY currency;

-- ─── Account statement (CtaCte for a single contact) ───────────────────────────

-- name: GetContactInvoicesIssued :many
SELECT i.id, i.invoice_type, i.number, i.issue_date, i.due_date, i.currency,
       i.total_amount, i.paid_amount, i.status
FROM invoices_issued i
WHERE i.company_id = $1 AND i.contact_id = $2 AND i.deleted_at IS NULL
  AND i.status <> 'draft'
  AND (sqlc.narg('currency')::text IS NULL OR i.currency = sqlc.narg('currency'))
ORDER BY i.issue_date;

-- name: GetContactReceipts :many
SELECT r.id, r.date, r.number, r.currency, r.total_amount
FROM receipts r
WHERE r.company_id = $1 AND r.contact_id = $2 AND r.deleted_at IS NULL
  AND (sqlc.narg('currency')::text IS NULL OR r.currency = sqlc.narg('currency'))
ORDER BY r.date;
