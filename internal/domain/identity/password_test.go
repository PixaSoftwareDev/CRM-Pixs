// internal/domain/identity/password_test.go

package identity_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"pixs/internal/domain/identity"
)

func TestNewPassword_Valid(t *testing.T) {
	pw, err := identity.NewPassword("Secure1pass")
	require.NoError(t, err)
	assert.Equal(t, "Secure1pass", pw.Raw())
}

func TestNewPassword_ValidComplex(t *testing.T) {
	pw, err := identity.NewPassword("P@ssw0rd!")
	require.NoError(t, err)
	assert.Equal(t, "P@ssw0rd!", pw.Raw())
}

func TestNewPassword_TooShort(t *testing.T) {
	_, err := identity.NewPassword("Ab1!")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrPasswordTooWeak)
}

func TestNewPassword_NoUppercase(t *testing.T) {
	_, err := identity.NewPassword("alllower1")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrPasswordTooWeak)
}

func TestNewPassword_NoLowercase(t *testing.T) {
	_, err := identity.NewPassword("ALLUPPER1")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrPasswordTooWeak)
}

func TestNewPassword_NoDigit(t *testing.T) {
	_, err := identity.NewPassword("NoDigitsHere")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrPasswordTooWeak)
}

func TestNewPassword_ExactlyEightChars(t *testing.T) {
	// Exactly 8 chars, meets all requirements.
	pw, err := identity.NewPassword("Secure1a")
	require.NoError(t, err)
	assert.Equal(t, "Secure1a", pw.Raw())
}

func TestNewPassword_SevenChars(t *testing.T) {
	// One char short.
	_, err := identity.NewPassword("Secur1a")
	require.Error(t, err)
	assert.ErrorIs(t, err, identity.ErrPasswordTooWeak)
}
