// internal/auth/argon2/argon2.go

// Package argon2 provides argon2id password hashing and verification for PIXS.
// Parameters are fixed project-wide; callers cannot override them.
package argon2

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/cockroachdb/errors"
	"golang.org/x/crypto/argon2"
)

// Fixed argon2id parameters. These values must not be changed without a
// migration plan for existing hashes, because stored hashes embed the params.
const (
	memory      = 128 * 1024 // 128 MB
	iterations  = 4
	parallelism = 4
	saltLen     = 16
	keyLen      = 32
)

// Hash derives an argon2id hash from password and returns it in PHC format:
//
//	$argon2id$v=19$m=131072,t=4,p=4$<base64url-salt>$<base64url-hash>
func Hash(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", errors.Wrap(err, "generating argon2 salt")
	}

	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, keyLen)

	encodedSalt := base64.RawURLEncoding.EncodeToString(salt)
	encodedHash := base64.RawURLEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		memory,
		iterations,
		parallelism,
		encodedSalt,
		encodedHash,
	)

	return encoded, nil
}

// Verify checks password against the PHC-formatted encodedHash.
// Returns (true, nil) on a successful match, (false, nil) on a mismatch,
// and (false, err) when encodedHash cannot be parsed.
func Verify(password, encodedHash string) (bool, error) {
	salt, storedHash, err := decode(encodedHash)
	if err != nil {
		return false, errors.Wrap(err, "decoding argon2 hash")
	}

	candidate := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, keyLen)

	// Constant-time comparison to prevent timing attacks.
	if len(candidate) != len(storedHash) {
		return false, nil
	}
	var diff byte
	for i := range candidate {
		diff |= candidate[i] ^ storedHash[i]
	}
	return diff == 0, nil
}

// decode parses a PHC-formatted argon2id string and extracts the raw salt and hash bytes.
// It does not re-use the embedded parameters; PIXS always applies the fixed constants above.
func decode(encodedHash string) (salt, hash []byte, err error) {
	parts := strings.Split(encodedHash, "$")
	// Expected parts after splitting by "$":
	// ["", "argon2id", "v=19", "m=131072,t=4,p=4", "<salt>", "<hash>"]
	if len(parts) != 6 {
		return nil, nil, errors.New("invalid argon2 hash format: unexpected number of segments")
	}

	if parts[1] != "argon2id" {
		return nil, nil, errors.Newf("invalid argon2 hash format: unexpected algorithm %q", parts[1])
	}

	salt, err = base64.RawURLEncoding.DecodeString(parts[4])
	if err != nil {
		return nil, nil, errors.Wrap(err, "decoding argon2 salt")
	}

	hash, err = base64.RawURLEncoding.DecodeString(parts[5])
	if err != nil {
		return nil, nil, errors.Wrap(err, "decoding argon2 hash bytes")
	}

	return salt, hash, nil
}
