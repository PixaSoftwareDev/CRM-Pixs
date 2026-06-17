// Package identity defines the core domain types, value objects, and sentinel
// errors for the Identity & Auth bounded context. It has no infrastructure imports.
package identity

import "github.com/cockroachdb/errors"

// User errors.
var (
	// ErrUserNotFound is returned when a user lookup yields no result.
	ErrUserNotFound = errors.New("usuario no encontrado")

	// ErrInvalidCredentials is returned when email/password do not match.
	ErrInvalidCredentials = errors.New("credenciales inválidas")

	// ErrUserInactive is returned when the user account is disabled.
	ErrUserInactive = errors.New("la cuenta de usuario está desactivada")

	// ErrUserDeleted is returned when the user account has been soft-deleted.
	ErrUserDeleted = errors.New("la cuenta de usuario fue eliminada")
)

// Session errors.
var (
	// ErrSessionNotFound is returned when a session token does not match any stored session.
	ErrSessionNotFound = errors.New("sesión no encontrada")

	// ErrSessionExpired is returned when a valid session has passed its expiry time.
	ErrSessionExpired = errors.New("la sesión expiró")

	// ErrSessionRevoked is returned when a session was explicitly revoked.
	ErrSessionRevoked = errors.New("la sesión fue revocada")
)

// TOTP errors.
var (
	// ErrTOTPRequired is returned when a login attempt succeeds on credentials but TOTP is needed.
	ErrTOTPRequired = errors.New("se requiere código de autenticación de dos factores")

	// ErrTOTPInvalid is returned when the provided TOTP code is wrong.
	ErrTOTPInvalid = errors.New("código de autenticación inválido")

	// ErrTOTPAlreadyEnabled is returned when attempting to enable TOTP on an account that already has it.
	ErrTOTPAlreadyEnabled = errors.New("la autenticación de dos factores ya está activada")

	// ErrTOTPNotEnabled is returned when a TOTP operation is attempted on an account without TOTP.
	ErrTOTPNotEnabled = errors.New("la autenticación de dos factores no está activada")
)

// Role and permission errors.
var (
	// ErrRoleNotFound is returned when a role lookup yields no result.
	ErrRoleNotFound = errors.New("rol no encontrado")

	// ErrPermissionDenied is returned when the caller lacks the required permission.
	ErrPermissionDenied = errors.New("permiso denegado")

	// ErrSystemRoleCannotDelete is returned when attempting to delete a built-in system role.
	ErrSystemRoleCannotDelete = errors.New("los roles del sistema no pueden eliminarse")
)

// Validation errors.
var (
	// ErrInvalidEmail is returned when an email address fails format validation.
	ErrInvalidEmail = errors.New("dirección de correo electrónico inválida")

	// ErrPasswordTooWeak is returned when a password does not meet complexity requirements.
	ErrPasswordTooWeak = errors.New("la contraseña no cumple los requisitos mínimos de seguridad")

	// ErrEmailAlreadyExists is returned when registering a duplicate email within a company.
	ErrEmailAlreadyExists = errors.New("ya existe un usuario con ese correo electrónico")
)

// Rate-limit errors.
var (
	// ErrRateLimitExceeded is returned when a caller triggers the rate limiter.
	ErrRateLimitExceeded = errors.New("demasiados intentos; intente nuevamente más tarde")
)
