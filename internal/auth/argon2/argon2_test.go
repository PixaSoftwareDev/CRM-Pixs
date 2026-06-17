// internal/auth/argon2/argon2_test.go

package argon2_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"pixs/internal/auth/argon2"
)

func TestHash_ReturnsNonEmptyString(t *testing.T) {
	h, err := argon2.Hash("Secure1pass")
	require.NoError(t, err)
	assert.NotEmpty(t, h)
}

func TestHash_NotEqualToInput(t *testing.T) {
	input := "Secure1pass"
	h, err := argon2.Hash(input)
	require.NoError(t, err)
	assert.NotEqual(t, input, h)
}

func TestHash_DifferentForSameInput(t *testing.T) {
	// Random salt must produce a different hash each time.
	h1, err := argon2.Hash("Secure1pass")
	require.NoError(t, err)

	h2, err := argon2.Hash("Secure1pass")
	require.NoError(t, err)

	assert.NotEqual(t, h1, h2, "two hashes of the same password should differ due to random salt")
}

func TestVerify_CorrectPassword(t *testing.T) {
	h, err := argon2.Hash("Correct1horse")
	require.NoError(t, err)

	ok, err := argon2.Verify("Correct1horse", h)
	require.NoError(t, err)
	assert.True(t, ok)
}

func TestVerify_WrongPassword(t *testing.T) {
	h, err := argon2.Hash("Correct1horse")
	require.NoError(t, err)

	ok, err := argon2.Verify("wrongpassword", h)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestHash_Verify_RoundTrip(t *testing.T) {
	passwords := []string{
		"SimplePass1",
		"C0mpl3x!P@ssword",
		"12345678A",
		"AAAAaaaa1",
	}

	for _, pw := range passwords {
		t.Run(pw, func(t *testing.T) {
			h, err := argon2.Hash(pw)
			require.NoError(t, err)

			ok, err := argon2.Verify(pw, h)
			require.NoError(t, err)
			assert.True(t, ok, "round-trip must succeed for %q", pw)

			ok, err = argon2.Verify(pw+"x", h)
			require.NoError(t, err)
			assert.False(t, ok, "modified password must not verify for %q", pw)
		})
	}
}
