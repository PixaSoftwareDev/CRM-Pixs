-- Identity queries for sqlc generation.
-- All queries filter by company_id to enforce multi-tenancy.

-- ─── Companies ─────────────────────────────────────────────────────────────────

-- name: GetCompanyByID :one
SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL;

-- name: UpdateCompany :one
UPDATE companies
SET legal_name = $2, fantasy_name = $3, cuit = $4, vat_condition = $5,
    fiscal_address = $6, city = $7, province = $8, postal_code = $9,
    logo_key = $10, gross_income = $11, activity_start_date = $12,
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- ─── Users ─────────────────────────────────────────────────────────────────────

-- name: CreateUser :one
INSERT INTO users (company_id, email, password_hash, full_name, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: GetUserByEmailAnyCompany :one
-- Used during login before company is known (single-company context).
SELECT * FROM users
WHERE email = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: GetUserByIDAnyCompany :one
-- Used when company_id is not available (e.g. TOTP verification mid-login).
SELECT * FROM users
WHERE id = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: UpdateUserLastLogin :exec
UPDATE users SET last_login_at = now(), updated_at = now()
WHERE id = $1;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2, updated_at = now()
WHERE id = $1;

-- name: UpdateUserTOTP :exec
UPDATE users
SET totp_secret_encrypted = $2, totp_enabled = $3, updated_at = now()
WHERE id = $1;

-- name: UpdateUserIsActive :exec
UPDATE users SET is_active = $2, updated_at = now()
WHERE id = $1 AND company_id = $3;

-- name: SoftDeleteUser :exec
UPDATE users SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2;

-- name: ListUsers :many
SELECT * FROM users
WHERE company_id = $1 AND deleted_at IS NULL
ORDER BY full_name;

-- ─── Roles ─────────────────────────────────────────────────────────────────────

-- name: GetRoleByID :one
SELECT * FROM roles WHERE id = $1 AND company_id = $2;

-- name: ListRoles :many
SELECT * FROM roles WHERE company_id = $1 ORDER BY name;

-- name: GetRoleByName :one
SELECT * FROM roles WHERE name = $1 AND company_id = $2;

-- name: CreateRole :one
INSERT INTO roles (company_id, name, description, is_system)
VALUES ($1, $2, $3, false)
RETURNING *;

-- name: DeleteRole :exec
DELETE FROM roles WHERE id = $1 AND company_id = $2 AND is_system = false;

-- ─── Permissions ───────────────────────────────────────────────────────────────

-- name: ListPermissions :many
SELECT * FROM permissions ORDER BY module, action;

-- name: GetPermissionByModuleAction :one
SELECT * FROM permissions WHERE module = $1 AND action = $2;

-- ─── Role Permissions ──────────────────────────────────────────────────────────

-- name: GetRolePermissions :many
SELECT p.module, p.action, rp.restricted_to_own
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role_id = $1;

-- name: UpsertRolePermission :exec
INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
VALUES ($1, $2, $3)
ON CONFLICT (role_id, permission_id) DO UPDATE SET restricted_to_own = EXCLUDED.restricted_to_own;

-- name: DeleteRolePermission :exec
DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2;

-- ─── User Roles ────────────────────────────────────────────────────────────────

-- name: GetUserRoles :many
SELECT r.id, r.name, r.description, r.is_system
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = $1;

-- name: AssignRoleToUser :exec
INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveRoleFromUser :exec
DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2;

-- name: GetUserPermissions :many
-- Returns all effective permissions for a user across all their roles.
-- restricted_to_own is true only when ALL roles that grant this permission restrict it.
SELECT p.module, p.action,
    bool_and(rp.restricted_to_own) AS restricted_to_own
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE ur.user_id = $1
GROUP BY p.module, p.action;

-- ─── Sessions ──────────────────────────────────────────────────────────────────

-- name: CreateSession :one
INSERT INTO sessions (user_id, company_id, ip_address, user_agent, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetSessionByID :one
SELECT * FROM sessions WHERE id = $1 AND revoked_at IS NULL;

-- name: UpdateSessionLastSeen :exec
UPDATE sessions SET last_seen_at = now()
WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeSession :exec
UPDATE sessions SET revoked_at = now()
WHERE id = $1;

-- name: RevokeAllUserSessions :exec
UPDATE sessions SET revoked_at = now()
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: ListActiveSessions :many
SELECT * FROM sessions
WHERE user_id = $1 AND revoked_at IS NULL
ORDER BY created_at DESC;

-- name: CountActiveSessions :one
SELECT COUNT(*)::int FROM sessions
WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now();

-- name: GetOldestActiveSession :one
SELECT * FROM sessions
WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
ORDER BY created_at ASC
LIMIT 1;

-- ─── Password Reset Tokens ─────────────────────────────────────────────────────

-- name: CreatePasswordResetToken :one
INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetPasswordResetToken :one
SELECT * FROM password_reset_tokens
WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now();

-- name: MarkPasswordResetTokenUsed :exec
UPDATE password_reset_tokens SET used_at = now() WHERE id = $1;

-- name: DeleteExpiredPasswordResetTokens :exec
DELETE FROM password_reset_tokens WHERE expires_at < now() OR used_at IS NOT NULL;

-- ─── TOTP Backup Codes ─────────────────────────────────────────────────────────

-- name: CreateTOTPBackupCodes :copyfrom
INSERT INTO totp_backup_codes (user_id, code_hash) VALUES ($1, $2);

-- name: GetUnusedTOTPBackupCodes :many
SELECT * FROM totp_backup_codes
WHERE user_id = $1 AND used_at IS NULL;

-- name: MarkTOTPBackupCodeUsed :exec
UPDATE totp_backup_codes SET used_at = now() WHERE id = $1;

-- name: DeleteUserTOTPBackupCodes :exec
DELETE FROM totp_backup_codes WHERE user_id = $1;

-- ─── Audit Logs ────────────────────────────────────────────────────────────────

-- name: InsertAuditLog :exec
INSERT INTO audit_logs (company_id, user_id, ip_address, entity_type, entity_id, action, before_state, after_state)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ListAuditLogs :many
SELECT * FROM audit_logs
WHERE company_id = $1
  AND ($2::text = '' OR entity_type = $2)
  AND ($3::uuid IS NULL OR entity_id = $3)
ORDER BY timestamp DESC
LIMIT $4 OFFSET $5;
