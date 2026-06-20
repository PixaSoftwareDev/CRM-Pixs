-- Contact queries for sqlc generation.
-- NOTE: contacts has a generated tsvector column (search_vector). All queries
-- use explicit column lists to exclude it from result structs where needed,
-- or rely on the tsvector→string override in sqlc.yaml.

-- ─── Contacts ─────────────────────────────────────────────────────────────────

-- name: CreateContact :one
INSERT INTO contacts (
    company_id, kind, fantasy_name, legal_name, cuit_cuil, vat_condition,
    fiscal_address, city, province, postal_code, email, phone, website,
    industry, source, default_payment_condition_id, credit_limit,
    usual_discount_pct, assigned_user_id, lifecycle_status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
    $14, $15, $16, $17, $18, $19, $20
)
RETURNING id, company_id, kind, fantasy_name, legal_name, cuit_cuil, vat_condition,
    fiscal_address, city, province, postal_code, email, phone, website,
    industry, source, default_payment_condition_id, credit_limit,
    usual_discount_pct, assigned_user_id, lifecycle_status,
    created_at, updated_at, deleted_at;

-- name: GetContactByID :one
SELECT id, company_id, kind, fantasy_name, legal_name, cuit_cuil, vat_condition,
    fiscal_address, city, province, postal_code, email, phone, website,
    industry, source, default_payment_condition_id, credit_limit,
    usual_discount_pct, assigned_user_id, lifecycle_status,
    created_at, updated_at, deleted_at
FROM contacts
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListContacts :many
SELECT id, company_id, kind, fantasy_name, legal_name, cuit_cuil, vat_condition,
    fiscal_address, city, province, postal_code, email, phone, website,
    industry, source, default_payment_condition_id, credit_limit,
    usual_discount_pct, assigned_user_id, lifecycle_status,
    created_at, updated_at, deleted_at
FROM contacts
WHERE company_id = $1
  AND deleted_at IS NULL
  AND ($2::text = '' OR search_vector @@ plainto_tsquery('simple', $2))
  AND ($3::text = '' OR $3 = ANY(kind))
  AND (sqlc.narg('assigned_user_id')::uuid IS NULL OR assigned_user_id = sqlc.narg('assigned_user_id'))
  AND (sqlc.narg('industry')::text IS NULL OR industry = sqlc.narg('industry'))
ORDER BY fantasy_name
LIMIT $4 OFFSET $5;

-- name: UpdateContact :one
UPDATE contacts SET
    kind                         = $3,
    fantasy_name                 = $4,
    legal_name                   = $5,
    cuit_cuil                    = $6,
    vat_condition                = $7,
    fiscal_address               = $8,
    city                         = $9,
    province                     = $10,
    postal_code                  = $11,
    email                        = $12,
    phone                        = $13,
    website                      = $14,
    industry                     = $15,
    source                       = $16,
    default_payment_condition_id = $17,
    credit_limit                 = $18,
    usual_discount_pct           = $19,
    assigned_user_id             = $20,
    lifecycle_status             = $21,
    updated_at                   = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING id, company_id, kind, fantasy_name, legal_name, cuit_cuil, vat_condition,
    fiscal_address, city, province, postal_code, email, phone, website,
    industry, source, default_payment_condition_id, credit_limit,
    usual_discount_pct, assigned_user_id, lifecycle_status,
    created_at, updated_at, deleted_at;

-- name: SoftDeleteContact :exec
UPDATE contacts SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- ─── Contact Persons ────────────────────────────────────────────────────────────

-- name: CreateContactPerson :one
INSERT INTO contact_persons (contact_id, name, role, email, phone, notes, birthday, is_primary)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetContactPersonByID :one
SELECT * FROM contact_persons WHERE id = $1 AND deleted_at IS NULL;

-- name: GetContactPersonForContact :one
SELECT * FROM contact_persons
WHERE id = $1 AND contact_id = $2 AND deleted_at IS NULL;

-- name: ListContactPersons :many
SELECT * FROM contact_persons
WHERE contact_id = $1 AND deleted_at IS NULL
ORDER BY is_primary DESC, name;

-- name: UpdateContactPerson :one
UPDATE contact_persons SET
    name       = $3,
    role       = $4,
    email      = $5,
    phone      = $6,
    notes      = $7,
    birthday   = $8,
    is_primary = $9,
    updated_at = now()
WHERE id = $1 AND contact_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteContactPerson :exec
UPDATE contact_persons SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: ClearPrimaryContactPerson :exec
UPDATE contact_persons SET is_primary = false, updated_at = now()
WHERE contact_id = $1 AND is_primary = true AND deleted_at IS NULL;

-- ─── Contact Bank Accounts ─────────────────────────────────────────────────────

-- name: CreateContactBankAccount :one
INSERT INTO contact_bank_accounts (contact_id, cbu_cvu, alias, bank_name, account_holder, currency, encrypted_cbu)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetContactBankAccountByID :one
SELECT * FROM contact_bank_accounts WHERE id = $1 AND deleted_at IS NULL;

-- name: GetContactBankAccountForContact :one
SELECT * FROM contact_bank_accounts
WHERE id = $1 AND contact_id = $2 AND deleted_at IS NULL;

-- name: ListContactBankAccounts :many
SELECT * FROM contact_bank_accounts
WHERE contact_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC;

-- name: SoftDeleteContactBankAccount :exec
UPDATE contact_bank_accounts SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- ─── Contact Notes (append-only) ───────────────────────────────────────────────

-- name: CreateContactNote :one
INSERT INTO contact_notes (contact_id, user_id, body)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListContactNotes :many
SELECT * FROM contact_notes
WHERE contact_id = $1
ORDER BY created_at DESC;

-- ─── Contact Comments (editable, soft-delete) ─────────────────────────────────

-- name: CreateContactComment :one
INSERT INTO contact_comments (contact_id, user_id, body)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListContactComments :many
SELECT * FROM contact_comments
WHERE contact_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC;

-- name: GetContactCommentByID :one
SELECT * FROM contact_comments
WHERE id = $1 AND deleted_at IS NULL;

-- name: UpdateContactComment :one
UPDATE contact_comments
SET body = $2, updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteContactComment :exec
UPDATE contact_comments
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- ─── Contact Balances ──────────────────────────────────────────────────────────

-- name: GetContactBalance :one
SELECT * FROM contact_balances WHERE contact_id = $1 AND currency = $2;

-- name: UpsertContactBalance :exec
INSERT INTO contact_balances (contact_id, currency, balance)
VALUES ($1, $2, $3)
ON CONFLICT (contact_id, currency) DO UPDATE
SET balance = EXCLUDED.balance, updated_at = now();

-- ─── Tags ─────────────────────────────────────────────────────────────────────

-- name: CreateTag :one
INSERT INTO tags (company_id, name, color, area)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetTagByID :one
SELECT * FROM tags WHERE id = $1 AND company_id = $2;

-- name: ListTags :many
SELECT * FROM tags
WHERE company_id = $1
  AND ($2::text = '' OR area = $2)
ORDER BY name;

-- ─── Contact Tags ──────────────────────────────────────────────────────────────

-- name: AddContactTag :exec
INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveContactTag :exec
DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2;

-- name: ListContactTags :many
SELECT t.id, t.company_id, t.name, t.color, t.area, t.created_at
FROM contact_tags ct
JOIN tags t ON t.id = ct.tag_id
WHERE ct.contact_id = $1
ORDER BY t.name;
