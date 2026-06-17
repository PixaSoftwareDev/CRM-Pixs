// Package encrypt provides AES-256-GCM encryption for sensitive fields
// (e.g. TOTP secrets). The key is sourced from PIXS_ENCRYPTION_KEY (32-byte hex).
package encrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"io"

	"github.com/cockroachdb/errors"
)

// Cipher wraps an AES-256-GCM block cipher.
type Cipher struct {
	block cipher.Block
}

// New creates a Cipher from a 64-character hex-encoded key (32 bytes).
func New(hexKey string) (*Cipher, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, errors.Wrap(err, "decoding encryption key")
	}
	if len(key) != 32 {
		return nil, errors.New("encryption key must be 32 bytes (64 hex chars)")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errors.Wrap(err, "creating AES cipher")
	}
	return &Cipher{block: block}, nil
}

// Encrypt encrypts plaintext with AES-256-GCM. Returns nonce+ciphertext.
func (c *Cipher) Encrypt(plaintext []byte) ([]byte, error) {
	gcm, err := cipher.NewGCM(c.block)
	if err != nil {
		return nil, errors.Wrap(err, "creating GCM")
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, errors.Wrap(err, "generating nonce")
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt decrypts nonce+ciphertext produced by Encrypt.
func (c *Cipher) Decrypt(data []byte) ([]byte, error) {
	gcm, err := cipher.NewGCM(c.block)
	if err != nil {
		return nil, errors.Wrap(err, "creating GCM")
	}
	ns := gcm.NonceSize()
	if len(data) < ns {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ciphertext := data[:ns], data[ns:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, errors.Wrap(err, "decrypting")
	}
	return plaintext, nil
}
