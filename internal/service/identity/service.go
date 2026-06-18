// Package identity implements the application-layer services for authentication,
// session management, user management, and RBAC.
package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net/netip"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"pixs/internal/auth/argon2"
	"pixs/internal/auth/encrypt"
	"pixs/internal/auth/rbac"
	"pixs/internal/auth/session"
	"pixs/internal/auth/totp"
	"pixs/internal/domain/identity"
	sqlcgen "pixs/internal/repository/sqlc"
)

// AuthService handles login, logout, 2FA, and password reset.
type AuthService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	sess   *session.Store
	cipher *encrypt.Cipher
	policy *rbac.Policy
	logger *slog.Logger
}

// NewAuthService constructs an AuthService.
func NewAuthService(
	db *pgxpool.Pool,
	sessStore *session.Store,
	cipher *encrypt.Cipher,
	policy *rbac.Policy,
	logger *slog.Logger,
) *AuthService {
	return &AuthService{
		q:      sqlcgen.New(db),
		db:     db,
		sess:   sessStore,
		cipher: cipher,
		policy: policy,
		logger: logger,
	}
}

// Login authenticates a user by email+password.
// If the user has TOTP enabled, it returns ErrTOTPRequired and the caller
// must follow up with LoginTOTP.
func (s *AuthService) Login(ctx context.Context, email, password, ip, userAgent string) (uuid.UUID, *identity.User, error) {
	dbUser, err := s.q.GetUserByEmailAnyCompany(ctx, email)
	if err != nil {
		return uuid.Nil, nil, identity.ErrInvalidCredentials
	}
	if dbUser.DeletedAt.Valid {
		return uuid.Nil, nil, identity.ErrUserDeleted
	}
	if !dbUser.IsActive {
		return uuid.Nil, nil, identity.ErrUserInactive
	}

	ok, err := argon2.Verify(password, dbUser.PasswordHash)
	if err != nil || !ok {
		return uuid.Nil, nil, identity.ErrInvalidCredentials
	}

	user := userFromRow(dbUser)
	if dbUser.TotpEnabled {
		return uuid.Nil, user, identity.ErrTOTPRequired
	}

	sessionID, err := s.createSession(ctx, user, ip, userAgent)
	if err != nil {
		return uuid.Nil, nil, err
	}
	_ = s.q.UpdateUserLastLogin(ctx, user.ID)
	s.auditLog(ctx, user.CompanyID, pgtype.UUID{Bytes: user.ID, Valid: true}, ip, "users", user.ID, "login", nil, nil)
	return sessionID, user, nil
}

// LoginTOTP completes a TOTP-gated login by validating the OTP code (or a backup code).
func (s *AuthService) LoginTOTP(ctx context.Context, userID uuid.UUID, code, ip, userAgent string) (uuid.UUID, error) {
	dbUser, err := s.q.GetUserByIDAnyCompany(ctx, userID)
	if err != nil {
		return uuid.Nil, identity.ErrUserNotFound
	}
	if !dbUser.TotpEnabled || len(dbUser.TotpSecretEncrypted) == 0 {
		return uuid.Nil, identity.ErrTOTPNotEnabled
	}

	secret, err := s.decryptTOTPSecret(dbUser.TotpSecretEncrypted)
	if err != nil {
		return uuid.Nil, errors.Wrap(err, "decrypting totp secret")
	}

	// Try TOTP code first, then backup codes.
	if !totp.ValidateCode(code, secret) {
		if err := s.validateAndConsumeBackupCode(ctx, userID, code); err != nil {
			return uuid.Nil, identity.ErrTOTPInvalid
		}
	}

	user := userFromRow(dbUser)
	sessionID, err := s.createSession(ctx, user, ip, userAgent)
	if err != nil {
		return uuid.Nil, err
	}
	_ = s.q.UpdateUserLastLogin(ctx, user.ID)
	return sessionID, nil
}

// Logout revokes a specific session.
func (s *AuthService) Logout(ctx context.Context, sessionID uuid.UUID) error {
	return s.sess.Revoke(ctx, sessionID)
}

// LogoutAll revokes all sessions for a user.
func (s *AuthService) LogoutAll(ctx context.Context, userID uuid.UUID) error {
	return s.sess.RevokeAll(ctx, userID)
}

// GetSession retrieves live session data from the store.
func (s *AuthService) GetSession(ctx context.Context, sessionID uuid.UUID) (*session.Data, error) {
	return s.sess.Get(ctx, sessionID)
}

// ListSessions returns all active sessions for a user.
func (s *AuthService) ListSessions(ctx context.Context, userID uuid.UUID) ([]identity.Session, error) {
	return s.sess.ListActive(ctx, userID)
}

// RevokeSession revokes a specific session, ensuring it belongs to the given user.
func (s *AuthService) RevokeSession(ctx context.Context, userID, sessionID uuid.UUID) error {
	dbSess, err := s.q.GetSessionByID(ctx, sessionID)
	if err != nil {
		return identity.ErrSessionNotFound
	}
	if dbSess.UserID != userID {
		return identity.ErrPermissionDenied
	}
	return s.sess.Revoke(ctx, sessionID)
}

// RequestPasswordReset creates a password reset token for a user.
// Always returns nil to avoid leaking whether the email exists.
func (s *AuthService) RequestPasswordReset(ctx context.Context, email string) error {
	dbUser, err := s.q.GetUserByEmailAnyCompany(ctx, email)
	if err != nil {
		return nil // silent — don't leak user existence
	}

	rawToken := make([]byte, 32)
	if _, err := rand.Read(rawToken); err != nil {
		return errors.Wrap(err, "generating reset token")
	}
	tokenHex := hex.EncodeToString(rawToken)
	hash := sha256.Sum256(rawToken)
	tokenHash := hex.EncodeToString(hash[:])

	_, err = s.q.CreatePasswordResetToken(ctx, sqlcgen.CreatePasswordResetTokenParams{
		UserID:    dbUser.ID,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	if err != nil {
		return errors.Wrap(err, "creating password reset token")
	}

	// TODO: send email — for now log the token for dev use.
	s.logger.Info("password reset token generated (dev)", "token", tokenHex, "user_id", dbUser.ID)
	return nil
}

// ConfirmPasswordReset validates the token and updates the password.
func (s *AuthService) ConfirmPasswordReset(ctx context.Context, rawToken, newPassword string) error {
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	// Validate token.
	prt, err := s.q.GetPasswordResetToken(ctx, tokenHash)
	if err != nil {
		return identity.ErrInvalidCredentials
	}

	pwd, err := identity.NewPassword(newPassword)
	if err != nil {
		return err
	}
	hashed, err := argon2.Hash(pwd.Raw())
	if err != nil {
		return errors.Wrap(err, "hashing password")
	}

	if err := s.q.UpdateUserPassword(ctx, sqlcgen.UpdateUserPasswordParams{
		ID:           prt.UserID,
		PasswordHash: hashed,
	}); err != nil {
		return errors.Wrap(err, "updating password")
	}

	_ = s.q.MarkPasswordResetTokenUsed(ctx, prt.ID)
	_ = s.sess.RevokeAll(ctx, prt.UserID) // invalidate all sessions on password change
	return nil
}

// EnableTOTP generates a new TOTP secret for a user. Returns QR URI and backup codes.
// The secret is not activated until VerifyTOTP confirms the user can produce a valid code.
func (s *AuthService) EnableTOTP(ctx context.Context, userID uuid.UUID, userEmail, issuer string) (uri string, backupCodes []string, err error) {
	dbUser, err := s.q.GetUserByIDAnyCompany(ctx, userID)
	if err != nil {
		return "", nil, identity.ErrUserNotFound
	}
	if dbUser.TotpEnabled {
		return "", nil, identity.ErrTOTPAlreadyEnabled
	}

	secret, uri, err := totp.GenerateSecret(issuer, userEmail)
	if err != nil {
		return "", nil, errors.Wrap(err, "generating totp secret")
	}

	encrypted, err := s.cipher.Encrypt([]byte(secret))
	if err != nil {
		return "", nil, errors.Wrap(err, "encrypting totp secret")
	}

	// Store encrypted secret but leave totp_enabled=false until verified.
	if err := s.q.UpdateUserTOTP(ctx, sqlcgen.UpdateUserTOTPParams{
		ID:                  userID,
		TotpSecretEncrypted: encrypted,
		TotpEnabled:         false,
	}); err != nil {
		return "", nil, errors.Wrap(err, "storing totp secret")
	}

	_, backupCodes, err = totp.GenerateBackupCodes(8)
	if err != nil {
		return "", nil, errors.Wrap(err, "generating backup codes")
	}

	return uri, backupCodes, nil
}

// VerifyTOTP confirms a TOTP code against the pending secret and activates 2FA.
func (s *AuthService) VerifyTOTP(ctx context.Context, userID uuid.UUID, code string, backupCodeHashes []string) error {
	dbUser, err := s.q.GetUserByIDAnyCompany(ctx, userID)
	if err != nil {
		return identity.ErrUserNotFound
	}
	if len(dbUser.TotpSecretEncrypted) == 0 {
		return identity.ErrTOTPNotEnabled
	}

	secret, err := s.decryptTOTPSecret(dbUser.TotpSecretEncrypted)
	if err != nil {
		return errors.Wrap(err, "decrypting totp secret")
	}
	if !totp.ValidateCode(code, secret) {
		return identity.ErrTOTPInvalid
	}

	if err := s.q.UpdateUserTOTP(ctx, sqlcgen.UpdateUserTOTPParams{
		ID:                  userID,
		TotpSecretEncrypted: dbUser.TotpSecretEncrypted,
		TotpEnabled:         true,
	}); err != nil {
		return errors.Wrap(err, "activating totp")
	}

	// Persist hashed backup codes.
	params := make([]sqlcgen.CreateTOTPBackupCodesParams, len(backupCodeHashes))
	for i, h := range backupCodeHashes {
		params[i] = sqlcgen.CreateTOTPBackupCodesParams{UserID: userID, CodeHash: h}
	}
	if _, err := s.q.CreateTOTPBackupCodes(ctx, params); err != nil {
		return errors.Wrap(err, "storing backup codes")
	}
	return nil
}

// DisableTOTP removes 2FA from a user after verifying their current code.
func (s *AuthService) DisableTOTP(ctx context.Context, userID uuid.UUID, code string) error {
	dbUser, err := s.q.GetUserByIDAnyCompany(ctx, userID)
	if err != nil {
		return identity.ErrUserNotFound
	}
	if !dbUser.TotpEnabled {
		return identity.ErrTOTPNotEnabled
	}

	secret, err := s.decryptTOTPSecret(dbUser.TotpSecretEncrypted)
	if err != nil {
		return errors.Wrap(err, "decrypting totp secret")
	}
	if !totp.ValidateCode(code, secret) {
		return identity.ErrTOTPInvalid
	}

	if err := s.q.UpdateUserTOTP(ctx, sqlcgen.UpdateUserTOTPParams{
		ID:                  userID,
		TotpSecretEncrypted: nil,
		TotpEnabled:         false,
	}); err != nil {
		return errors.Wrap(err, "disabling totp")
	}
	_ = s.q.DeleteUserTOTPBackupCodes(ctx, userID)
	return nil
}

// LoadPolicy fetches all role permissions from DB and builds a fresh RBAC Policy.
func LoadPolicy(ctx context.Context, q *sqlcgen.Queries, roles []sqlcgen.Role) (*rbac.Policy, error) {
	var entries []rbac.PolicyEntry
	for _, role := range roles {
		perms, err := q.GetRolePermissions(ctx, role.ID)
		if err != nil {
			return nil, errors.Wrapf(err, "loading permissions for role %s", role.Name)
		}
		for _, p := range perms {
			entries = append(entries, rbac.PolicyEntry{
				RoleID:          role.ID.String(),
				Module:          p.Module,
				Action:          p.Action,
				RestrictedToOwn: p.RestrictedToOwn,
			})
		}
	}
	return rbac.NewPolicy(entries), nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (s *AuthService) createSession(ctx context.Context, user *identity.User, ip, userAgent string) (uuid.UUID, error) {
	roles, err := s.q.GetUserRoles(ctx, user.ID)
	if err != nil {
		return uuid.Nil, errors.Wrap(err, "fetching user roles")
	}
	roleIDs := make([]string, len(roles))
	for i, r := range roles {
		roleIDs[i] = r.ID.String()
	}
	return s.sess.Create(ctx, user, roleIDs, ip, userAgent)
}

func (s *AuthService) decryptTOTPSecret(encrypted []byte) (string, error) {
	plain, err := s.cipher.Decrypt(encrypted)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func (s *AuthService) validateAndConsumeBackupCode(ctx context.Context, userID uuid.UUID, code string) error {
	rows, err := s.q.GetUnusedTOTPBackupCodes(ctx, userID)
	if err != nil {
		return errors.Wrap(err, "fetching backup codes")
	}
	hashes := make([]string, len(rows))
	for i, r := range rows {
		hashes[i] = r.CodeHash
	}
	idx := totp.ValidateBackupCode(code, hashes)
	if idx < 0 {
		return identity.ErrTOTPInvalid
	}
	return s.q.MarkTOTPBackupCodeUsed(ctx, rows[idx].ID)
}

func (s *AuthService) auditLog(ctx context.Context, companyID uuid.UUID, userID pgtype.UUID, ip, entityType string, entityID uuid.UUID, action string, before, after []byte) {
	var ipAddr *netip.Addr
	if ip != "" {
		addr, err := netip.ParseAddr(ip)
		if err == nil {
			ipAddr = &addr
		}
	}
	_ = s.q.InsertAuditLog(ctx, sqlcgen.InsertAuditLogParams{
		CompanyID:   companyID,
		UserID:      userID,
		IpAddress:   ipAddr,
		EntityType:  entityType,
		EntityID:    entityID,
		Action:      action,
		BeforeState: before,
		AfterState:  after,
	})
}

// ─── domain mappers ──────────────────────────────────────────────────────────

func userFromRow(r sqlcgen.User) *identity.User {
	email, _ := identity.NewEmail(r.Email)
	u := &identity.User{
		ID:          r.ID,
		CompanyID:   r.CompanyID,
		Email:       email,
		FullName:    r.FullName,
		IsActive:    r.IsActive,
		TOTPEnabled: r.TotpEnabled,
		CreatedAt:   r.CreatedAt.Time,
		UpdatedAt:   r.UpdatedAt.Time,
	}
	if r.LastLoginAt.Valid {
		t := r.LastLoginAt.Time
		u.LastLoginAt = &t
	}
	return u
}
