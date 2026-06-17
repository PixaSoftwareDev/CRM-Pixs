// internal/domain/identity/email_test.go

package identity_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"pixs/internal/domain/identity"
)

func TestNewEmail_Valid(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"user@example.com", "user@example.com"},
		{"USER@EXAMPLE.COM", "user@example.com"},
		{"  User@Example.Com  ", "user@example.com"},
		{"first.last@sub.domain.org", "first.last@sub.domain.org"},
		{"user+tag@company.com.ar", "user+tag@company.com.ar"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			email, err := identity.NewEmail(tt.input)
			require.NoError(t, err)
			assert.Equal(t, tt.expected, email.String())
		})
	}
}

func TestNewEmail_EmptyString(t *testing.T) {
	_, err := identity.NewEmail("")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrInvalidEmail)
}

func TestNewEmail_NoAt(t *testing.T) {
	_, err := identity.NewEmail("nodomain.com")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrInvalidEmail)
}

func TestNewEmail_NoDomainDot(t *testing.T) {
	_, err := identity.NewEmail("user@nodot")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrInvalidEmail)
}

func TestNewEmail_EmptyLocal(t *testing.T) {
	_, err := identity.NewEmail("@example.com")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrInvalidEmail)
}

func TestNewEmail_EmptyDomain(t *testing.T) {
	_, err := identity.NewEmail("user@")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrInvalidEmail)
}
