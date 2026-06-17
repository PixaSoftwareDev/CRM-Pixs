// Package middleware provides Echo middleware for PIXS HTTP handlers.
package middleware

import (
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"pixs/internal/auth/rbac"
	"pixs/internal/auth/session"
	"pixs/internal/domain/identity"
	sqlcgen "pixs/internal/repository/sqlc"
)

// contextKey is unexported to avoid collisions with other packages.
type contextKey string

const (
	ctxSessionID   contextKey = "session_id"
	ctxSessionData contextKey = "session_data"
	ctxUser        contextKey = "user"
)

// SessionStore is the interface the auth middleware needs.
type SessionStore interface {
	Get(c echo.Context, sessionID uuid.UUID) (*session.Data, error)
	Touch(c echo.Context, sessionID uuid.UUID) error
}

// AuthDeps holds the dependencies injected into auth middleware.
type AuthDeps struct {
	Sessions *session.Store
	Queries  *sqlcgen.Queries
	Logger   *slog.Logger
}

// RequireAuth is an Echo middleware that validates the session cookie,
// loads user data from Redis/DB, and stores it in the request context.
func RequireAuth(deps AuthDeps) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie("session_id")
			if err != nil || cookie.Value == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "autenticación requerida")
			}

			sessionID, err := uuid.Parse(cookie.Value)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "sesión inválida")
			}

			data, err := deps.Sessions.Get(c.Request().Context(), sessionID)
			if err != nil {
				switch err {
				case identity.ErrSessionExpired, identity.ErrSessionRevoked:
					return echo.NewHTTPError(http.StatusUnauthorized, "sesión expirada")
				default:
					return echo.NewHTTPError(http.StatusUnauthorized, "sesión no encontrada")
				}
			}

			// Reload full user from DB if role IDs are missing (Redis cache miss path).
			if len(data.RoleIDs) == 0 {
				dbUser, dbErr := deps.Queries.GetUserByIDAnyCompany(c.Request().Context(), data.UserID)
				if dbErr != nil {
					return echo.NewHTTPError(http.StatusUnauthorized, "usuario no encontrado")
				}
				roles, dbErr := deps.Queries.GetUserRoles(c.Request().Context(), data.UserID)
				if dbErr == nil {
					roleIDs := make([]string, len(roles))
					for i, r := range roles {
						roleIDs[i] = r.ID.String()
					}
					data.RoleIDs = roleIDs
				}
				data.Email = dbUser.Email
				data.FullName = dbUser.FullName
			}

			// Slide the session TTL.
			_ = deps.Sessions.Touch(c.Request().Context(), sessionID)

			c.Set(string(ctxSessionID), sessionID)
			c.Set(string(ctxSessionData), data)
			return next(c)
		}
	}
}

// RequirePermission returns middleware that checks whether the authenticated
// user has the given module+action permission according to the RBAC policy.
// Sets ctxRestrictedToOwn in the context so handlers can apply row-level filtering.
func RequirePermission(policy *rbac.Policy, module, action string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			data, ok := c.Get(string(ctxSessionData)).(*session.Data)
			if !ok || data == nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "autenticación requerida")
			}
			permitted, restrictedToOwn := policy.Check(data.RoleIDs, module, action)
			if !permitted {
				return echo.NewHTTPError(http.StatusForbidden, "permiso denegado")
			}
			c.Set("restricted_to_own", restrictedToOwn)
			return next(c)
		}
	}
}

// SessionFromContext extracts the session Data from an Echo context.
// Panics if RequireAuth middleware was not applied — callers must be behind RequireAuth.
func SessionFromContext(c echo.Context) *session.Data {
	return c.Get(string(ctxSessionData)).(*session.Data)
}

// SessionIDFromContext extracts the session UUID from an Echo context.
func SessionIDFromContext(c echo.Context) uuid.UUID {
	return c.Get(string(ctxSessionID)).(uuid.UUID)
}

// IsRestrictedToOwn returns whether the handler should filter to the user's own records.
func IsRestrictedToOwn(c echo.Context) bool {
	v, _ := c.Get("restricted_to_own").(bool)
	return v
}
