package identity

import (
	"strings"

	"github.com/cockroachdb/errors"
)

// Email is a normalized, validated e-mail address value object.
// The underlying string is always lowercase and trimmed.
type Email string

// NewEmail validates and normalizes s into an Email.
// Normalization: trim whitespace, convert to lowercase.
// Validation rules: must contain exactly one '@', local part must be non-empty,
// domain part must be non-empty and contain at least one '.'.
func NewEmail(s string) (Email, error) {
	s = strings.TrimSpace(s)
	s = strings.ToLower(s)

	if s == "" {
		return "", errors.WithDetail(ErrInvalidEmail, "el correo no puede estar vacío")
	}

	atIdx := strings.Index(s, "@")
	if atIdx < 0 {
		return "", errors.WithDetail(ErrInvalidEmail, "el correo debe contener '@'")
	}

	// Ensure there is only one '@'.
	if strings.Count(s, "@") != 1 {
		return "", errors.WithDetail(ErrInvalidEmail, "el correo contiene más de un '@'")
	}

	local := s[:atIdx]
	domain := s[atIdx+1:]

	if local == "" {
		return "", errors.WithDetail(ErrInvalidEmail, "la parte local del correo no puede estar vacía")
	}

	if domain == "" {
		return "", errors.WithDetail(ErrInvalidEmail, "el dominio del correo no puede estar vacío")
	}

	// Domain must contain at least one dot and not start or end with one.
	dotIdx := strings.LastIndex(domain, ".")
	if dotIdx < 0 {
		return "", errors.WithDetail(ErrInvalidEmail, "el dominio del correo debe contener al menos un punto")
	}
	if dotIdx == 0 || dotIdx == len(domain)-1 {
		return "", errors.WithDetail(ErrInvalidEmail, "el dominio del correo tiene un punto en una posición inválida")
	}
	// TLD part after the last dot must be non-empty (guaranteed by the check above,
	// but be explicit: the substring after the last dot must have length >= 1).
	tld := domain[dotIdx+1:]
	if tld == "" {
		return "", errors.WithDetail(ErrInvalidEmail, "el dominio del correo debe tener una extensión válida")
	}

	return Email(s), nil
}

// String returns the email address as a plain string.
func (e Email) String() string {
	return string(e)
}
