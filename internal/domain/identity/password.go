// internal/domain/identity/password.go

package identity

import (
	"unicode"

	"github.com/cockroachdb/errors"
)

// Password is a plaintext password value object used only in transit.
// It is never persisted; callers must hash it immediately after creation.
type Password struct {
	raw string
}

// NewPassword validates raw against the project's minimum complexity rules:
//   - at least 8 characters
//   - at least one uppercase letter
//   - at least one lowercase letter
//   - at least one decimal digit
//
// Returns ErrPasswordTooWeak (with a descriptive detail) when any rule fails.
func NewPassword(raw string) (Password, error) {
	if len(raw) < 8 {
		return Password{}, errors.WithDetail(
			ErrPasswordTooWeak,
			"la contraseña debe tener al menos 8 caracteres",
		)
	}

	var hasUpper, hasLower, hasDigit bool
	for _, r := range raw {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}

	if !hasUpper {
		return Password{}, errors.WithDetail(
			ErrPasswordTooWeak,
			"la contraseña debe contener al menos una letra mayúscula",
		)
	}
	if !hasLower {
		return Password{}, errors.WithDetail(
			ErrPasswordTooWeak,
			"la contraseña debe contener al menos una letra minúscula",
		)
	}
	if !hasDigit {
		return Password{}, errors.WithDetail(
			ErrPasswordTooWeak,
			"la contraseña debe contener al menos un número",
		)
	}

	return Password{raw: raw}, nil
}

// Raw returns the plaintext password string.
// This method must only be called by the hashing layer (e.g. argon2.Hash).
func (p Password) Raw() string {
	return p.raw
}
