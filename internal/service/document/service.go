// Package document implements the application-layer service for file attachments.
// Files are stored on the local filesystem under a configured storage directory;
// the database keeps only metadata.
package document

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	domain "pixs/internal/domain/document"
	sqlcgen "pixs/internal/repository/sqlc"
)

// DocumentService handles upload, listing, download and deletion of attachments.
type DocumentService struct {
	q          *sqlcgen.Queries
	storageDir string
	maxBytes   int64
	logger     *slog.Logger
}

// NewDocumentService constructs a DocumentService. storageDir is created if missing.
func NewDocumentService(db *pgxpool.Pool, storageDir string, maxUploadMB int, logger *slog.Logger) *DocumentService {
	if maxUploadMB <= 0 {
		maxUploadMB = 25
	}
	return &DocumentService{
		q:          sqlcgen.New(db),
		storageDir: storageDir,
		maxBytes:   int64(maxUploadMB) * 1024 * 1024,
		logger:     logger,
	}
}

// MaxBytes returns the configured max upload size in bytes.
func (s *DocumentService) MaxBytes() int64 { return s.maxBytes }

var unsafeName = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func sanitizeName(name string) string {
	name = filepath.Base(name)
	name = unsafeName.ReplaceAllString(name, "_")
	name = strings.Trim(name, "._")
	if name == "" {
		name = "archivo"
	}
	if len(name) > 120 {
		name = name[len(name)-120:]
	}
	return name
}

// UploadInput carries the data for a new attachment.
type UploadInput struct {
	EntityType  domain.EntityType
	EntityID    uuid.UUID
	UploadedBy  uuid.UUID
	FileName    string
	ContentType string
	Content     io.Reader
}

// Upload streams the file to disk and records its metadata.
func (s *DocumentService) Upload(ctx context.Context, companyID uuid.UUID, in UploadInput) (*domain.Document, error) {
	safe := sanitizeName(in.FileName)
	relDir := filepath.Join(companyID.String(), string(in.EntityType), in.EntityID.String())
	storageKey := filepath.Join(relDir, uuid.NewString()+"_"+safe)
	absDir := filepath.Join(s.storageDir, relDir)
	if err := os.MkdirAll(absDir, 0o750); err != nil {
		return nil, errors.Wrap(err, "creating storage dir")
	}
	absPath := filepath.Join(s.storageDir, storageKey)

	f, err := os.OpenFile(absPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return nil, errors.Wrap(err, "creating file")
	}
	// Cap the copy at maxBytes+1 so we can detect oversize without trusting headers.
	written, copyErr := io.Copy(f, io.LimitReader(in.Content, s.maxBytes+1))
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(absPath)
		return nil, errors.Wrap(copyErr, "writing file")
	}
	if closeErr != nil {
		_ = os.Remove(absPath)
		return nil, errors.Wrap(closeErr, "closing file")
	}
	if written > s.maxBytes {
		_ = os.Remove(absPath)
		return nil, errors.WithStack(domain.ErrFileTooLarge)
	}

	contentType := in.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	row, err := s.q.CreateDocument(ctx, sqlcgen.CreateDocumentParams{
		CompanyID:   companyID,
		EntityType:  string(in.EntityType),
		EntityID:    in.EntityID,
		FileName:    safe,
		ContentType: contentType,
		SizeBytes:   written,
		StorageKey:  filepath.ToSlash(storageKey),
		UploadedBy:  in.UploadedBy,
	})
	if err != nil {
		_ = os.Remove(absPath)
		return nil, errors.Wrap(err, "recording document")
	}
	return docFromRow(row), nil
}

// List returns all attachments for an entity.
func (s *DocumentService) List(ctx context.Context, companyID uuid.UUID, entityType domain.EntityType, entityID uuid.UUID) ([]*domain.Document, error) {
	rows, err := s.q.ListDocuments(ctx, sqlcgen.ListDocumentsParams{
		CompanyID:  companyID,
		EntityType: string(entityType),
		EntityID:   entityID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing documents")
	}
	out := make([]*domain.Document, 0, len(rows))
	for _, r := range rows {
		out = append(out, docFromRow(r))
	}
	return out, nil
}

// Open returns the document metadata and an open reader for its bytes. The
// caller must close the reader.
func (s *DocumentService) Open(ctx context.Context, companyID, id uuid.UUID) (*domain.Document, io.ReadCloser, error) {
	row, err := s.q.GetDocumentByID(ctx, sqlcgen.GetDocumentByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, nil, errors.WithStack(domain.ErrDocumentNotFound)
	}
	doc := docFromRow(row)
	f, err := os.Open(filepath.Join(s.storageDir, filepath.FromSlash(doc.StorageKey)))
	if err != nil {
		return nil, nil, errors.Wrap(err, "opening file")
	}
	return doc, f, nil
}

// Delete soft-deletes the document metadata (the file is left on disk).
func (s *DocumentService) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	if err := s.q.SoftDeleteDocument(ctx, sqlcgen.SoftDeleteDocumentParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting document")
	}
	return nil
}

func docFromRow(r sqlcgen.Document) *domain.Document {
	d := &domain.Document{
		ID:          r.ID,
		CompanyID:   r.CompanyID,
		EntityType:  r.EntityType,
		EntityID:    r.EntityID,
		FileName:    r.FileName,
		ContentType: r.ContentType,
		SizeBytes:   r.SizeBytes,
		StorageKey:  r.StorageKey,
		UploadedBy:  r.UploadedBy,
		CreatedAt:   r.CreatedAt.Time,
		UpdatedAt:   r.UpdatedAt.Time,
	}
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		d.DeletedAt = &t
	}
	return d
}
