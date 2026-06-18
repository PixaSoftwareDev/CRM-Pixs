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
	ID                        uuid.UUID
	CompanyID                 uuid.UUID
	Kind                      []ContactKind
	FantasyName               string
	LegalName                 *string
	CUITCUIL                  *string
	VatCondition              *VatCondition
	FiscalAddress             *string
	City                      *string
	Province                  *string
	PostalCode                *string
	Email                     *string
	Phone                     *string
	Website                   *string
	Industry                  *string
	Source                    *string
	DefaultPaymentConditionID *uuid.UUID
	CreditLimit               *decimal.Decimal
	UsualDiscountPct          decimal.Decimal
	AssignedUserID            *uuid.UUID
	LifecycleStatus           LifecycleStatus
	CreatedAt                 time.Time
	UpdatedAt                 time.Time
	DeletedAt                 *time.Time
}

// ContactPerson is a human representative associated with a contact.
type ContactPerson struct {
	ID        uuid.UUID
	ContactID uuid.UUID
	Name      string
	Role      *string
	Email     *string
	Phone     *string
	Notes     *string
	Birthday  *time.Time
	IsPrimary bool
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt *time.Time
}

// ContactBankAccount stores banking information for a contact.
// The full CBU/CVU is never stored in plaintext; only the AES-256-GCM
// encrypted form (EncryptedCBU) and a masked display hint (CBUDisplay).
type ContactBankAccount struct {
	ID            uuid.UUID
	ContactID     uuid.UUID
	CBUDisplay    string // last-4-digits mask, e.g. "••••1234"
	Alias         *string
	BankName      *string
	AccountHolder *string
	Currency      string
	EncryptedCBU  []byte // AES-256-GCM encrypted full CBU/CVU
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     *time.Time
}

// ContactNote is an immutable fact appended to a contact's history.
// Notes are never edited or deleted — they are a chronological record.
type ContactNote struct {
	ID        uuid.UUID
	ContactID uuid.UUID
	UserID    uuid.UUID
	Body      string
	CreatedAt time.Time
}

// Tag is a label that can be applied to contacts.
type Tag struct {
	ID        uuid.UUID
	CompanyID uuid.UUID
	Name      string
	Color     *string
	Area      *string
	CreatedAt time.Time
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
