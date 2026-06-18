// Package vault provides CRUD for encrypted credential storage.
package vault

import (
	"context"
	"log/slog"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"pixs/internal/auth/encrypt"
	domainvault "pixs/internal/domain/vault"
	sqlcgen "pixs/internal/repository/sqlc"
)

// VaultEntry is the service-layer representation (secret already decrypted).
type VaultEntry struct {
	ID        uuid.UUID `json:"id"`
	Category  string    `json:"category"`
	Label     string    `json:"label"`
	Username  *string   `json:"username"`
	Secret    *string   `json:"secret,omitempty"` // plaintext, only on GET /:id
	HasSecret bool      `json:"has_secret"`
	URL       *string   `json:"url"`
	Notes     *string   `json:"notes"`
	Tags      []string  `json:"tags"`
	CreatedAt string    `json:"created_at"`
	UpdatedAt string    `json:"updated_at"`
}

// EntryInput carries the data for create/update.
type EntryInput struct {
	Category string
	Label    string
	Username *string
	Secret   *string // plaintext; nil means "don't change on update"
	URL      *string
	Notes    *string
	Tags     []string
}

// VaultService manages vault entries.
type VaultService struct {
	db     *pgxpool.Pool
	q      *sqlcgen.Queries
	cipher *encrypt.Cipher
	logger *slog.Logger
}

// New constructs a VaultService.
func New(db *pgxpool.Pool, cipher *encrypt.Cipher, logger *slog.Logger) *VaultService {
	return &VaultService{db: db, q: sqlcgen.New(db), cipher: cipher, logger: logger}
}

// List returns all (non-deleted) vault entries, secrets omitted.
func (s *VaultService) List(ctx context.Context, companyID uuid.UUID, category string) ([]VaultEntry, error) {
	var catPtr *string
	if category != "" {
		catPtr = &category
	}
	rows, err := s.q.ListVaultEntries(ctx, sqlcgen.ListVaultEntriesParams{
		CompanyID: companyID,
		Category:  catPtr,
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing vault entries")
	}
	result := make([]VaultEntry, 0, len(rows))
	for _, r := range rows {
		result = append(result, toEntry(r, false, nil))
	}
	return result, nil
}

// Get returns a single vault entry with the secret decrypted.
func (s *VaultService) Get(ctx context.Context, companyID, id uuid.UUID) (VaultEntry, error) {
	row, err := s.q.GetVaultEntry(ctx, sqlcgen.GetVaultEntryParams{ID: id, CompanyID: companyID})
	if err != nil {
		return VaultEntry{}, domainvault.ErrNotFound
	}
	return toEntry(row, true, s.cipher), nil
}

// Create inserts a new vault entry, encrypting the secret if provided.
func (s *VaultService) Create(ctx context.Context, companyID, callerID uuid.UUID, in EntryInput) (VaultEntry, error) {
	if in.Label == "" {
		return VaultEntry{}, domainvault.ErrNoLabel
	}
	encrypted, err := encryptSecret(s.cipher, in.Secret)
	if err != nil {
		return VaultEntry{}, err
	}
	cat := in.Category
	if cat == "" {
		cat = "general"
	}
	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}
	row, err := s.q.CreateVaultEntry(ctx, sqlcgen.CreateVaultEntryParams{
		CompanyID: companyID,
		CreatedBy: callerID,
		Category:  cat,
		Label:     in.Label,
		Username:  in.Username,
		Secret:    encrypted,
		Url:       in.URL,
		Notes:     in.Notes,
		Tags:      tags,
	})
	if err != nil {
		return VaultEntry{}, errors.Wrap(err, "creating vault entry")
	}
	return toEntry(row, false, nil), nil
}

// Update modifies an existing vault entry.
func (s *VaultService) Update(ctx context.Context, companyID, id uuid.UUID, in EntryInput) (VaultEntry, error) {
	if in.Label == "" {
		return VaultEntry{}, domainvault.ErrNoLabel
	}
	existing, err := s.q.GetVaultEntry(ctx, sqlcgen.GetVaultEntryParams{ID: id, CompanyID: companyID})
	if err != nil {
		return VaultEntry{}, domainvault.ErrNotFound
	}
	secret := existing.Secret
	if in.Secret != nil {
		secret, err = encryptSecret(s.cipher, in.Secret)
		if err != nil {
			return VaultEntry{}, err
		}
	}
	cat := in.Category
	if cat == "" {
		cat = "general"
	}
	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}
	row, err := s.q.UpdateVaultEntry(ctx, sqlcgen.UpdateVaultEntryParams{
		ID:        id,
		CompanyID: companyID,
		Category:  cat,
		Label:     in.Label,
		Username:  in.Username,
		Secret:    secret,
		Url:       in.URL,
		Notes:     in.Notes,
		Tags:      tags,
	})
	if err != nil {
		return VaultEntry{}, errors.Wrap(err, "updating vault entry")
	}
	return toEntry(row, false, nil), nil
}

// Delete soft-deletes a vault entry.
func (s *VaultService) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	return s.q.SoftDeleteVaultEntry(ctx, sqlcgen.SoftDeleteVaultEntryParams{ID: id, CompanyID: companyID})
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func encryptSecret(c *encrypt.Cipher, plaintext *string) ([]byte, error) {
	if plaintext == nil || *plaintext == "" {
		return nil, nil
	}
	enc, err := c.Encrypt([]byte(*plaintext))
	if err != nil {
		return nil, errors.Wrap(err, "encrypting secret")
	}
	return enc, nil
}

func decryptSecret(c *encrypt.Cipher, data []byte) *string {
	if len(data) == 0 || c == nil {
		return nil
	}
	plain, err := c.Decrypt(data)
	if err != nil {
		return nil
	}
	s := string(plain)
	return &s
}

func toEntry(r sqlcgen.VaultEntry, withSecret bool, c *encrypt.Cipher) VaultEntry {
	e := VaultEntry{
		ID:        r.ID,
		Category:  r.Category,
		Label:     r.Label,
		Username:  r.Username,
		URL:       r.Url,
		Notes:     r.Notes,
		Tags:      r.Tags,
		HasSecret: len(r.Secret) > 0,
		CreatedAt: r.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: r.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	}
	if withSecret {
		e.Secret = decryptSecret(c, r.Secret)
	}
	return e
}
