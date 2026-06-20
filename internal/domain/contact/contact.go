// Package contact defines the core domain types for the CRM contact bounded context.
// It has no infrastructure imports.
package contact

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Contact is the central CRM entity. A contact may play several roles
// simultaneously (e.g. client + supplier).
type Contact struct {
	ID                        uuid.UUID        `json:"id"`
	CompanyID                 uuid.UUID        `json:"company_id"`
	Kind                      []ContactKind    `json:"kind"`
	FantasyName               string           `json:"fantasy_name"`
	LegalName                 *string          `json:"legal_name"`
	CUITCUIL                  *string          `json:"cuit_cuil"`
	VatCondition              *VatCondition    `json:"vat_condition"`
	FiscalAddress             *string          `json:"fiscal_address"`
	City                      *string          `json:"city"`
	Province                  *string          `json:"province"`
	PostalCode                *string          `json:"postal_code"`
	Email                     *string          `json:"email"`
	Phone                     *string          `json:"phone"`
	Website                   *string          `json:"website"`
	Industry                  *string          `json:"industry"`
	Source                    *string          `json:"source"`
	DefaultPaymentConditionID *uuid.UUID       `json:"default_payment_condition_id"`
	CreditLimit               *decimal.Decimal `json:"credit_limit"`
	UsualDiscountPct          decimal.Decimal  `json:"usual_discount_pct"`
	AssignedUserID            *uuid.UUID       `json:"assigned_user_id"`
	LifecycleStatus           LifecycleStatus  `json:"lifecycle_status"`
	CreatedAt                 time.Time        `json:"created_at"`
	UpdatedAt                 time.Time        `json:"updated_at"`
	DeletedAt                 *time.Time       `json:"deleted_at,omitempty"`
}

// ContactPerson is a human representative associated with a contact.
type ContactPerson struct {
	ID        uuid.UUID  `json:"id"`
	ContactID uuid.UUID  `json:"contact_id"`
	Name      string     `json:"name"`
	Role      *string    `json:"role"`
	Email     *string    `json:"email"`
	Phone     *string    `json:"phone"`
	Notes     *string    `json:"notes"`
	Birthday  *time.Time `json:"birthday"`
	IsPrimary bool       `json:"is_primary"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

// ContactBankAccount stores banking information for a contact.
// The full CBU/CVU is never stored in plaintext; only the AES-256-GCM
// encrypted form (EncryptedCBU) and a masked display hint (CBUDisplay).
type ContactBankAccount struct {
	ID            uuid.UUID  `json:"id"`
	ContactID     uuid.UUID  `json:"contact_id"`
	CBUDisplay    string     `json:"cbu_display"` // last-4-digits mask, e.g. "••••1234"
	Alias         *string    `json:"alias"`
	BankName      *string    `json:"bank_name"`
	AccountHolder *string    `json:"account_holder"`
	Currency      string     `json:"currency"`
	EncryptedCBU  []byte     `json:"-"` // never expose encrypted bytes
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	DeletedAt     *time.Time `json:"deleted_at,omitempty"`
}

// ContactNote is an immutable fact appended to a contact's history.
// Notes are never edited or deleted — they are a chronological record.
type ContactNote struct {
	ID        uuid.UUID `json:"id"`
	ContactID uuid.UUID `json:"contact_id"`
	UserID    uuid.UUID `json:"user_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// ContactComment is an editable comment on a contact. Unlike ContactNote
// (immutable facts), comments can be edited and soft-deleted.
type ContactComment struct {
	ID        uuid.UUID  `json:"id"`
	ContactID uuid.UUID  `json:"contact_id"`
	UserID    uuid.UUID  `json:"user_id"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

// Tag is a label that can be applied to contacts.
type Tag struct {
	ID        uuid.UUID `json:"id"`
	CompanyID uuid.UUID `json:"company_id"`
	Name      string    `json:"name"`
	Color     *string   `json:"color"`
	Area      *string   `json:"area"`
	CreatedAt time.Time `json:"created_at"`
}

// Industry is a company-scoped catalog entry (rubro) used to classify and
// filter contacts. The chosen industry's name is also stored on the contact.
type Industry struct {
	ID        uuid.UUID `json:"id"`
	CompanyID uuid.UUID `json:"company_id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// PostalCode is a read-only reference entry resolving a CP to its province,
// locality and (best-effort) telephone area prefix.
type PostalCode struct {
	PostalCode  string  `json:"postal_code"`
	Locality    string  `json:"locality"`
	Province    string  `json:"province"`
	PhonePrefix *string `json:"phone_prefix"`
}

// ContactKind represents the roles a contact can have.
type ContactKind string

const (
	KindClient   ContactKind = "client"
	KindSupplier ContactKind = "supplier"
	KindProspect ContactKind = "prospect"
	KindLead     ContactKind = "lead"
)

var validKinds = map[ContactKind]struct{}{
	KindClient: {}, KindSupplier: {}, KindProspect: {}, KindLead: {},
}

// ParseContactKind validates and converts a string to a ContactKind.
func ParseContactKind(s string) (ContactKind, error) {
	k := ContactKind(s)
	if _, ok := validKinds[k]; !ok {
		return "", ErrInvalidContactKind
	}
	return k, nil
}

// VatCondition identifies the VAT status of a contact.
type VatCondition string

const (
	VatRI            VatCondition = "ri"
	VatMonotributo   VatCondition = "monotributo"
	VatExempt        VatCondition = "exempt"
	VatFinalConsumer VatCondition = "final_consumer"
)

// ParseVatCondition validates and converts a string to a VatCondition.
func ParseVatCondition(s string) (VatCondition, error) {
	switch VatCondition(s) {
	case VatRI, VatMonotributo, VatExempt, VatFinalConsumer:
		return VatCondition(s), nil
	default:
		return "", ErrInvalidVatCondition
	}
}

// LifecycleStatus describes where a contact sits in the commercial funnel.
type LifecycleStatus string

const (
	StatusProspect     LifecycleStatus = "prospect"
	StatusLead         LifecycleStatus = "lead"
	StatusOpportunity  LifecycleStatus = "opportunity"
	StatusActiveClient LifecycleStatus = "active_client"
	StatusLost         LifecycleStatus = "lost"
	StatusSupplier     LifecycleStatus = "supplier"
)

// ParseLifecycleStatus validates and converts a string to a LifecycleStatus.
func ParseLifecycleStatus(s string) (LifecycleStatus, error) {
	switch LifecycleStatus(s) {
	case StatusProspect, StatusLead, StatusOpportunity,
		StatusActiveClient, StatusLost, StatusSupplier:
		return LifecycleStatus(s), nil
	default:
		return "", ErrInvalidLifecycleStatus
	}
}
