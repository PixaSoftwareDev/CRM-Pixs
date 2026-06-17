// internal/domain/identity/user.go

package identity

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// User represents an authenticated user within a company tenant.
type User struct {
	ID               uuid.UUID
	CompanyID        uuid.UUID
	Email            Email
	FullName         string
	IsActive         bool
	TOTPEnabled      bool
	CostRate         *decimal.Decimal // nullable; hourly or daily cost rate for this user
	CostRateCurrency string           // ISO 4217 currency code, e.g. "ARS"
	LastLoginAt      *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
	DeletedAt        *time.Time
}

// Role represents a named set of permissions scoped to a company.
type Role struct {
	ID          uuid.UUID
	CompanyID   uuid.UUID
	Name        string
	Description string
	IsSystem    bool // system roles are created by migrations and cannot be deleted
}

// Permission represents a granular action a role may perform on a module.
type Permission struct {
	ID              uuid.UUID
	Module          string // e.g. "pipeline", "invoices_issued", "contacts"
	Action          string // e.g. "view", "create", "delete", "view_all"
	RestrictedToOwn bool   // when true, the permission applies only to resources the user owns
}

// Company holds the legal and fiscal profile of a tenant.
type Company struct {
	ID            uuid.UUID
	LegalName     string
	FantasyName   string
	CUIT          string // Argentine tax ID (xx-xxxxxxxx-x)
	VATCondition  string // e.g. "Responsable Inscripto", "Monotributista"
	FiscalAddress string
	City          string
	Province      string
	PostalCode    string
	LogoKey       string     // object storage key for the company logo
	GrossIncome   string     // Ingresos Brutos number or exemption
	ActivityStart *time.Time // date the company started its fiscal activity
}

// Session represents an active or historical user login session.
type Session struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	CompanyID  uuid.UUID
	IPAddress  string
	UserAgent  string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
	RevokedAt  *time.Time
}

// APIKey represents a long-lived programmatic access credential for a company.
type APIKey struct {
	ID         uuid.UUID
	CompanyID  uuid.UUID
	Name       string
	KeyPrefix  string // first few chars shown in the UI for identification
	LastUsedAt *time.Time
	ExpiresAt  *time.Time
	RevokedAt  *time.Time
	CreatedAt  time.Time
}
