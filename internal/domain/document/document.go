// Package document defines the core domain types for file attachments.
// It has no infrastructure imports.
package document

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// EntityType identifies the kind of record a document is attached to.
type EntityType string

const (
	EntityContact EntityType = "contact"
	EntityTask    EntityType = "task"
)

// ParseEntityType validates and converts a string to an EntityType.
func ParseEntityType(s string) (EntityType, error) {
	switch EntityType(s) {
	case EntityContact, EntityTask:
		return EntityType(s), nil
	default:
		return "", ErrInvalidEntityType
	}
}

// Document is metadata for a file attachment. The bytes live on disk under
// PIXS_STORAGE_DIR at StorageKey; this entity never carries the content.
type Document struct {
	ID          uuid.UUID  `json:"id"`
	CompanyID   uuid.UUID  `json:"company_id"`
	EntityType  string     `json:"entity_type"`
	EntityID    uuid.UUID  `json:"entity_id"`
	FileName    string     `json:"file_name"`
	ContentType string     `json:"content_type"`
	SizeBytes   int64      `json:"size_bytes"`
	StorageKey  string     `json:"-"` // internal path, never exposed to clients
	UploadedBy  uuid.UUID  `json:"uploaded_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

// Domain errors.
var (
	ErrDocumentNotFound  = errors.New("documento no encontrado")
	ErrInvalidEntityType = errors.New("tipo de entidad inválido (válidos: contact, task)")
	ErrFileRequired      = errors.New("archivo requerido")
	ErrFileTooLarge      = errors.New("el archivo supera el tamaño máximo permitido")
)
