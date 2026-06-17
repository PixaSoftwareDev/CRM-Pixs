// internal/auth/totp/totp_test.go

package totp_test

import (
	"strings"
	"testing"
	"time"

	ptotp "github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"pixs/internal/auth/totp"
)

func TestGenerateSecret_NonEmpty(t *testing.T) {
	secret, uri, err := totp.GenerateSecret("PIXS", "test@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, secret, "secret must not be empty")
	assert.NotEmpty(t, uri, "uri must not be empty")
}

func TestGenerateSecret_ValidOtpauthURI(t *testing.T) {
	_, uri, err := totp.GenerateSecret("PIXS", "user@company.com")
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(uri, "otpauth://totp/"), "URI must start with otpauth://totp/")
}

func TestValidateCode_CorrectCode(t *testing.T) {
	secret, _, err := totp.GenerateSecret("PIXS", "test@example.com")
	require.NoError(t, err)

	// Generate a valid code using the same underlying library.
	code, err := ptotp.GenerateCode(secret, time.Now())
	require.NoError(t, err)

	assert.True(t, totp.ValidateCode(code, secret), "a freshly generated code must be valid")
}

func TestValidateCode_WrongCode(t *testing.T) {
	secret, _, err := totp.GenerateSecret("PIXS", "test@example.com")
	require.NoError(t, err)

	assert.False(t, totp.ValidateCode("000000", secret), "all-zero code should not be valid (almost certainly)")
}

func TestGenerateBackupCodes_Count(t *testing.T) {
	codes, hashes, err := totp.GenerateBackupCodes(10)
	require.NoError(t, err)
	assert.Len(t, codes, 10, "must return exactly 10 codes")
	assert.Len(t, hashes, 10, "must return exactly 10 hashes")
}

func TestGenerateBackupCodes_NonEmptyAndUnique(t *testing.T) {
	codes, hashes, err := totp.GenerateBackupCodes(10)
	require.NoError(t, err)

	seen := make(map[string]struct{}, 10)
	for i, code := range codes {
		assert.NotEmpty(t, code, "backup code at index %d must not be empty", i)
		assert.NotEmpty(t, hashes[i], "hash at index %d must not be empty", i)
		_, duplicate := seen[code]
		assert.False(t, duplicate, "backup code at index %d is a duplicate", i)
		seen[code] = struct{}{}
	}
}

func TestValidateBackupCode_FindsMatch(t *testing.T) {
	codes, hashes, err := totp.GenerateBackupCodes(5)
	require.NoError(t, err)

	// Each code must find its own hash.
	for i, code := range codes {
		idx := totp.ValidateBackupCode(code, hashes)
		assert.Equal(t, i, idx, "code %d should match hash at index %d", i, i)
	}
}

func TestValidateBackupCode_NoMatch(t *testing.T) {
	_, hashes, err := totp.GenerateBackupCodes(5)
	require.NoError(t, err)

	idx := totp.ValidateBackupCode("XXXXXXXX", hashes)
	assert.Equal(t, -1, idx, "non-existent code should return -1")
}
