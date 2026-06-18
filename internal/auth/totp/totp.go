// internal/auth/totp/totp.go

// Package totp provides TOTP secret generation, code validation, and backup code
// management for two-factor authentication in PIXS.
package totp

import (
	"crypto/rand"
	"math/big"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/pquerna/otp"
	ptotp "github.com/pquerna/otp/totp"

	"pixs/internal/auth/argon2"
)

// alphabet used for backup codes: uppercase alphanumeric, without ambiguous chars.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// backupCodeLen is the length of each generated backup code.
const backupCodeLen = 8

// GenerateSecret generates a new TOTP secret for the given issuer and account name.
// It returns the base32-encoded secret key and the otpauth:// URI suitable for a QR code.
func GenerateSecret(issuer, accountName string) (secret, uri string, err error) {
	key, err := ptotp.Generate(ptotp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
		SecretSize:  20,
		Algorithm:   otp.AlgorithmSHA1,
		Digits:      otp.DigitsSix,
		Period:      30,
	})
	if err != nil {
		return "", "", errors.Wrap(err, "generating TOTP secret")
	}

	return key.Secret(), key.URL(), nil
}

// ValidateCode checks whether a 6-digit TOTP code is valid for the given base32 secret.
// It allows a ±1 period tolerance to account for clock skew.
func ValidateCode(code, secret string) bool {
	valid, err := ptotp.ValidateCustom(code, secret, time.Now().UTC(), ptotp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	if err != nil {
		return false
	}
	return valid
}

// GenerateBackupCodes generates n random 8-character uppercase alphanumeric backup codes.
// It returns the plaintext codes (to be shown once to the user) and their argon2id hashes
// (to be persisted). Returns an error if randomness or hashing fails.
func GenerateBackupCodes(n int) (codes, hashes []string, err error) {
	codes = make([]string, n)
	hashes = make([]string, n)

	alphabetLen := big.NewInt(int64(len(alphabet)))

	for i := range n {
		var sb strings.Builder
		sb.Grow(backupCodeLen)

		for range backupCodeLen {
			idx, randErr := rand.Int(rand.Reader, alphabetLen)
			if randErr != nil {
				return nil, nil, errors.Wrap(randErr, "generating backup code random bytes")
			}
			sb.WriteByte(alphabet[idx.Int64()])
		}

		code := sb.String()
		hash, hashErr := argon2.Hash(code)
		if hashErr != nil {
			return nil, nil, errors.Wrap(hashErr, "hashing backup code")
		}

		codes[i] = code
		hashes[i] = hash
	}

	return codes, hashes, nil
}

// ValidateBackupCode checks plaintext code against each stored hash.
// It returns the index of the first matching hash, or -1 if none match.
// The caller is responsible for invalidating (deleting) the matched hash after use.
func ValidateBackupCode(code string, hashes []string) int {
	for i, h := range hashes {
		ok, err := argon2.Verify(code, h)
		if err == nil && ok {
			return i
		}
	}
	return -1
}
