// Package handler contains Echo HTTP handlers for PIXS endpoints.
package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"pixs/internal/auth/rbac"
	"pixs/internal/domain/identity"
	svcidentity "pixs/internal/service/identity"
	mw "pixs/internal/transport/http/middleware"
)

// AuthHandler handles all authentication-related routes.
type AuthHandler struct {
	svc    *svcidentity.AuthService
	policy *rbac.Policy
}

// NewAuthHandler constructs an AuthHandler.
func NewAuthHandler(svc *svcidentity.AuthService, policy *rbac.Policy) *AuthHandler {
	return &AuthHandler{svc: svc, policy: policy}
}

// ─── request / response DTOs ─────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type loginTOTPRequest struct {
	UserID string `json:"user_id" validate:"required,uuid"`
	Code   string `json:"code"    validate:"required"`
}

type passwordResetRequest struct {
	Email string `json:"email" validate:"required,email"`
}

type passwordResetConfirm struct {
	Token    string `json:"token"    validate:"required"`
	Password string `json:"password" validate:"required"`
}

type enable2FAResponse struct {
	URI string `json:"uri"`
}

type verify2FARequest struct {
	Code             string   `json:"code"            validate:"required"`
	BackupCodeHashes []string `json:"backup_code_hashes" validate:"required"`
}

type disable2FARequest struct {
	Code string `json:"code" validate:"required"`
}

type sessionResponse struct {
	ID         string `json:"id"`
	IPAddress  string `json:"ip_address"`
	UserAgent  string `json:"user_agent"`
	CreatedAt  string `json:"created_at"`
	LastSeenAt string `json:"last_seen_at"`
	ExpiresAt  string `json:"expires_at"`
}

// ─── handlers ────────────────────────────────────────────────────────────────

// Login godoc POST /auth/login
func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	ip := c.RealIP()
	ua := c.Request().UserAgent()

	sessionID, user, err := h.svc.Login(c.Request().Context(), req.Email, req.Password, ip, ua)
	if err != nil {
		switch err {
		case identity.ErrTOTPRequired:
			return c.JSON(http.StatusOK, map[string]any{
				"totp_required": true,
				"user_id":       user.ID.String(),
			})
		case identity.ErrInvalidCredentials, identity.ErrUserNotFound:
			return echo.NewHTTPError(http.StatusUnauthorized, "credenciales inválidas")
		case identity.ErrUserInactive:
			return echo.NewHTTPError(http.StatusForbidden, "usuario inactivo")
		case identity.ErrUserDeleted:
			return echo.NewHTTPError(http.StatusUnauthorized, "credenciales inválidas")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
		}
	}

	setSessionCookie(c, sessionID)
	return c.JSON(http.StatusOK, map[string]any{
		"session_id": sessionID.String(),
		"user": map[string]any{
			"id":        user.ID.String(),
			"email":     user.Email.String(),
			"full_name": user.FullName,
		},
	})
}

// LoginTOTP godoc POST /auth/login/totp
func (h *AuthHandler) LoginTOTP(c echo.Context) error {
	var req loginTOTPRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id inválido")
	}

	ip := c.RealIP()
	ua := c.Request().UserAgent()

	sessionID, err := h.svc.LoginTOTP(c.Request().Context(), userID, req.Code, ip, ua)
	if err != nil {
		switch err {
		case identity.ErrTOTPInvalid:
			return echo.NewHTTPError(http.StatusUnauthorized, "código TOTP inválido")
		default:
			return echo.NewHTTPError(http.StatusUnauthorized, "autenticación fallida")
		}
	}

	setSessionCookie(c, sessionID)
	return c.JSON(http.StatusOK, map[string]any{"session_id": sessionID.String()})
}

// Logout godoc POST /auth/logout
func (h *AuthHandler) Logout(c echo.Context) error {
	sessionID := mw.SessionIDFromContext(c)
	if err := h.svc.Logout(c.Request().Context(), sessionID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al cerrar sesión")
	}
	clearSessionCookie(c)
	return c.JSON(http.StatusOK, map[string]string{"message": "sesión cerrada"})
}

// Me godoc GET /auth/me
func (h *AuthHandler) Me(c echo.Context) error {
	data := mw.SessionFromContext(c)
	return c.JSON(http.StatusOK, map[string]any{
		"user_id":    data.UserID.String(),
		"company_id": data.CompanyID.String(),
		"email":      data.Email,
		"full_name":  data.FullName,
		"role_ids":   data.RoleIDs,
	})
}

// MePermissions godoc GET /api/v1/me/permissions — returns the caller's effective permissions.
func (h *AuthHandler) MePermissions(c echo.Context) error {
	data := mw.SessionFromContext(c)
	entries := h.policy.Entries(data.RoleIDs)
	type permEntry struct {
		Module          string `json:"module"`
		Action          string `json:"action"`
		RestrictedToOwn bool   `json:"restricted_to_own"`
	}
	perms := make([]permEntry, len(entries))
	for i, e := range entries {
		perms[i] = permEntry{Module: e.Module, Action: e.Action, RestrictedToOwn: e.RestrictedToOwn}
	}
	return c.JSON(http.StatusOK, map[string]any{"permissions": perms})
}

// ListSessions godoc GET /auth/sessions
func (h *AuthHandler) ListSessions(c echo.Context) error {
	data := mw.SessionFromContext(c)
	sessions, err := h.svc.ListSessions(c.Request().Context(), data.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
	}
	resp := make([]sessionResponse, 0, len(sessions))
	for _, s := range sessions {
		resp = append(resp, sessionResponse{
			ID:         s.ID.String(),
			IPAddress:  s.IPAddress,
			UserAgent:  s.UserAgent,
			CreatedAt:  s.CreatedAt.Format(time.RFC3339),
			LastSeenAt: s.LastSeenAt.Format(time.RFC3339),
			ExpiresAt:  s.ExpiresAt.Format(time.RFC3339),
		})
	}
	return c.JSON(http.StatusOK, resp)
}

// RevokeSession godoc DELETE /auth/sessions/:id
func (h *AuthHandler) RevokeSession(c echo.Context) error {
	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id de sesión inválido")
	}
	data := mw.SessionFromContext(c)
	if err := h.svc.RevokeSession(c.Request().Context(), data.UserID, sessionID); err != nil {
		switch err {
		case identity.ErrPermissionDenied:
			return echo.NewHTTPError(http.StatusForbidden, "permiso denegado")
		case identity.ErrSessionNotFound:
			return echo.NewHTTPError(http.StatusNotFound, "sesión no encontrada")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "sesión revocada"})
}

// Enable2FA godoc POST /auth/2fa/enable
func (h *AuthHandler) Enable2FA(c echo.Context) error {
	data := mw.SessionFromContext(c)
	uri, _, err := h.svc.EnableTOTP(c.Request().Context(), data.UserID, data.Email, "PIXS")
	if err != nil {
		switch err {
		case identity.ErrTOTPAlreadyEnabled:
			return echo.NewHTTPError(http.StatusConflict, "2FA ya está habilitado")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
		}
	}
	return c.JSON(http.StatusOK, enable2FAResponse{URI: uri})
}

// Verify2FA godoc POST /auth/2fa/verify — activates 2FA after confirming the first code.
func (h *AuthHandler) Verify2FA(c echo.Context) error {
	var req verify2FARequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	data := mw.SessionFromContext(c)
	if err := h.svc.VerifyTOTP(c.Request().Context(), data.UserID, req.Code, req.BackupCodeHashes); err != nil {
		switch err {
		case identity.ErrTOTPInvalid:
			return echo.NewHTTPError(http.StatusUnauthorized, "código TOTP inválido")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "2FA habilitado"})
}

// Disable2FA godoc POST /auth/2fa/disable
func (h *AuthHandler) Disable2FA(c echo.Context) error {
	var req disable2FARequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	data := mw.SessionFromContext(c)
	if err := h.svc.DisableTOTP(c.Request().Context(), data.UserID, req.Code); err != nil {
		switch err {
		case identity.ErrTOTPInvalid:
			return echo.NewHTTPError(http.StatusUnauthorized, "código TOTP inválido")
		case identity.ErrTOTPNotEnabled:
			return echo.NewHTTPError(http.StatusConflict, "2FA no está habilitado")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "2FA deshabilitado"})
}

// RequestPasswordReset godoc POST /auth/password-reset/request
func (h *AuthHandler) RequestPasswordReset(c echo.Context) error {
	var req passwordResetRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	// Always return 200 to avoid leaking whether the email exists.
	_ = h.svc.RequestPasswordReset(c.Request().Context(), req.Email)
	return c.JSON(http.StatusOK, map[string]string{
		"message": "si el email existe, recibirás un enlace de recuperación",
	})
}

// ConfirmPasswordReset godoc POST /auth/password-reset/confirm
func (h *AuthHandler) ConfirmPasswordReset(c echo.Context) error {
	var req passwordResetConfirm
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := h.svc.ConfirmPasswordReset(c.Request().Context(), req.Token, req.Password); err != nil {
		switch err {
		case identity.ErrInvalidCredentials:
			return echo.NewHTTPError(http.StatusBadRequest, "token inválido o expirado")
		case identity.ErrPasswordTooWeak:
			return echo.NewHTTPError(http.StatusBadRequest, "la contraseña no cumple los requisitos")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "error interno")
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "contraseña actualizada"})
}

// ─── cookie helpers ───────────────────────────────────────────────────────────

func setSessionCookie(c echo.Context, sessionID uuid.UUID) {
	c.SetCookie(&http.Cookie{
		Name:     "session_id",
		Value:    sessionID.String(),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int((8 * time.Hour).Seconds()),
	})
}

func clearSessionCookie(c echo.Context) {
	c.SetCookie(&http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}
