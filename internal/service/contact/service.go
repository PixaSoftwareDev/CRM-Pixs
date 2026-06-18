// Package contact implements the application-layer service for CRM contact management.
package contact

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"pixs/internal/auth/encrypt"
	domain "pixs/internal/domain/contact"
	sqlcgen "pixs/internal/repository/sqlc"
)

// ContactService handles all CRM contact operations.
type ContactService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	cipher *encrypt.Cipher
	logger *slog.Logger
}

// NewContactService constructs a ContactService.
func NewContactService(db *pgxpool.Pool, cipher *encrypt.Cipher, logger *slog.Logger) *ContactService {
	return &ContactService{
		q:      sqlcgen.New(db),
		db:     db,
		cipher: cipher,
		logger: logger,
	}
}

// ─── Contacts ──────────────────────────────────────────────────────────────────

// CreateContactInput holds the data for creating a new contact.
type CreateContactInput struct {
	Kind             []string
	FantasyName      string
	LegalName        *string
	CUITCUIL         *string
	VatCondition     *string
	FiscalAddress    *string
	City             *string
	Province         *string
	PostalCode       *string
	Email            *string
	Phone            *string
	Website          *string
	Industry         *string
	Source           *string
	CreditLimit      *decimal.Decimal
	UsualDiscountPct decimal.Decimal
	AssignedUserID   *uuid.UUID
	LifecycleStatus  string
}

// CreateContact creates a new contact.
func (s *ContactService) CreateContact(ctx context.Context, companyID uuid.UUID, in CreateContactInput) (*domain.Contact, error) {
	if len(in.Kind) == 0 {
		return nil, errors.WithStack(domain.ErrInvalidContactKind)
	}
	for _, k := range in.Kind {
		if _, err := domain.ParseContactKind(k); err != nil {
			return nil, errors.WithStack(domain.ErrInvalidContactKind)
		}
	}
	if in.LifecycleStatus == "" {
		in.LifecycleStatus = string(domain.StatusProspect)
	} else {
		if _, err := domain.ParseLifecycleStatus(in.LifecycleStatus); err != nil {
			return nil, errors.WithStack(err)
		}
	}
	if in.VatCondition != nil {
		if _, err := domain.ParseVatCondition(*in.VatCondition); err != nil {
			return nil, errors.WithStack(err)
		}
	}
	if in.CUITCUIL != nil && *in.CUITCUIL != "" {
		if _, err := domain.ParseCUIT(*in.CUITCUIL); err != nil {
			return nil, errors.WithStack(domain.ErrInvalidCUIT)
		}
	}

	params := sqlcgen.CreateContactParams{
		CompanyID:       companyID,
		Kind:            in.Kind,
		FantasyName:     in.FantasyName,
		LegalName:       in.LegalName,
		CuitCuil:        normalizeCUIT(in.CUITCUIL),
		VatCondition:    in.VatCondition,
		FiscalAddress:   in.FiscalAddress,
		City:            in.City,
		Province:        in.Province,
		PostalCode:      in.PostalCode,
		Email:           in.Email,
		Phone:           in.Phone,
		Website:         in.Website,
		Industry:        in.Industry,
		Source:          in.Source,
		LifecycleStatus: in.LifecycleStatus,
	}
	if in.CreditLimit != nil {
		params.CreditLimit = pgtype.Numeric{Valid: true}
		if err := params.CreditLimit.Scan(in.CreditLimit.String()); err != nil {
			return nil, errors.Wrap(err, "parsing credit_limit")
		}
	}
	if err := params.UsualDiscountPct.Scan(in.UsualDiscountPct.String()); err != nil {
		return nil, errors.Wrap(err, "parsing usual_discount_pct")
	}
	if in.AssignedUserID != nil {
		params.AssignedUserID = pgtype.UUID{Bytes: *in.AssignedUserID, Valid: true}
	}

	row, err := s.q.CreateContact(ctx, params)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errors.WithStack(domain.ErrCUITAlreadyExists)
		}
		return nil, errors.Wrap(err, "creating contact")
	}

	c := contactFromCreateRow(row)
	s.writeAudit(ctx, companyID, nil, c, nil, row.ID, "create")
	return c, nil
}

// GetContact returns a contact by ID, respecting own-restriction.
func (s *ContactService) GetContact(ctx context.Context, companyID, id, callerUserID uuid.UUID, restrictToOwn bool) (*domain.Contact, error) {
	row, err := s.q.GetContactByID(ctx, sqlcgen.GetContactByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrContactNotFound)
	}
	c := contactFromRow(row)
	if restrictToOwn && (c.AssignedUserID == nil || *c.AssignedUserID != callerUserID) {
		return nil, errors.WithStack(domain.ErrForbidden)
	}
	return c, nil
}

// ListFilter holds filter parameters for listing contacts.
type ListFilter struct {
	Query          string
	Kind           string
	AssignedUserID *uuid.UUID
	Page           int32
	PerPage        int32
}

// ListContacts returns a paginated list of contacts, with optional full-text search and filters.
func (s *ContactService) ListContacts(ctx context.Context, companyID, callerUserID uuid.UUID, restrictToOwn bool, f ListFilter) ([]*domain.Contact, error) {
	if f.PerPage <= 0 {
		f.PerPage = 50
	}
	if f.Page <= 0 {
		f.Page = 1
	}
	offset := (f.Page - 1) * f.PerPage

	params := sqlcgen.ListContactsParams{
		CompanyID: companyID,
		Column2:   f.Query,
		Column3:   f.Kind,
		Limit:     f.PerPage,
		Offset:    offset,
	}
	if restrictToOwn {
		params.AssignedUserID = pgtype.UUID{Bytes: callerUserID, Valid: true}
	} else if f.AssignedUserID != nil {
		params.AssignedUserID = pgtype.UUID{Bytes: *f.AssignedUserID, Valid: true}
	}

	rows, err := s.q.ListContacts(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "listing contacts")
	}

	out := make([]*domain.Contact, 0, len(rows))
	for _, r := range rows {
		out = append(out, contactFromListRow(r))
	}
	return out, nil
}

// UpdateContactInput holds updatable fields for a contact.
type UpdateContactInput struct {
	Kind             []string
	FantasyName      string
	LegalName        *string
	CUITCUIL         *string
	VatCondition     *string
	FiscalAddress    *string
	City             *string
	Province         *string
	PostalCode       *string
	Email            *string
	Phone            *string
	Website          *string
	Industry         *string
	Source           *string
	CreditLimit      *decimal.Decimal
	UsualDiscountPct decimal.Decimal
	AssignedUserID   *uuid.UUID
	LifecycleStatus  string
}

// UpdateContact updates a contact's fields.
func (s *ContactService) UpdateContact(ctx context.Context, companyID, id uuid.UUID, in UpdateContactInput) (*domain.Contact, error) {
	existing, err := s.q.GetContactByID(ctx, sqlcgen.GetContactByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrContactNotFound)
	}
	if in.VatCondition != nil {
		if _, err2 := domain.ParseVatCondition(*in.VatCondition); err2 != nil {
			return nil, errors.WithStack(err2)
		}
	}
	if in.CUITCUIL != nil && *in.CUITCUIL != "" {
		if _, err2 := domain.ParseCUIT(*in.CUITCUIL); err2 != nil {
			return nil, errors.WithStack(domain.ErrInvalidCUIT)
		}
	}
	if _, err2 := domain.ParseLifecycleStatus(in.LifecycleStatus); err2 != nil {
		return nil, errors.WithStack(err2)
	}

	params := sqlcgen.UpdateContactParams{
		ID:              id,
		CompanyID:       companyID,
		Kind:            in.Kind,
		FantasyName:     in.FantasyName,
		LegalName:       in.LegalName,
		CuitCuil:        normalizeCUIT(in.CUITCUIL),
		VatCondition:    in.VatCondition,
		FiscalAddress:   in.FiscalAddress,
		City:            in.City,
		Province:        in.Province,
		PostalCode:      in.PostalCode,
		Email:           in.Email,
		Phone:           in.Phone,
		Website:         in.Website,
		Industry:        in.Industry,
		Source:          in.Source,
		LifecycleStatus: in.LifecycleStatus,
	}
	if in.CreditLimit != nil {
		params.CreditLimit = pgtype.Numeric{Valid: true}
		if err2 := params.CreditLimit.Scan(in.CreditLimit.String()); err2 != nil {
			return nil, errors.Wrap(err2, "parsing credit_limit")
		}
	}
	if err2 := params.UsualDiscountPct.Scan(in.UsualDiscountPct.String()); err2 != nil {
		return nil, errors.Wrap(err2, "parsing usual_discount_pct")
	}
	if in.AssignedUserID != nil {
		params.AssignedUserID = pgtype.UUID{Bytes: *in.AssignedUserID, Valid: true}
	}

	row, err := s.q.UpdateContact(ctx, params)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errors.WithStack(domain.ErrCUITAlreadyExists)
		}
		return nil, errors.Wrap(err, "updating contact")
	}

	before := contactFromRow(existing)
	after := contactFromUpdateRow(row)
	s.writeAudit(ctx, companyID, before, after, nil, id, "update")
	return after, nil
}

// DeleteContact soft-deletes a contact.
func (s *ContactService) DeleteContact(ctx context.Context, companyID, id uuid.UUID) error {
	existing, err := s.q.GetContactByID(ctx, sqlcgen.GetContactByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrContactNotFound)
	}
	if err := s.q.SoftDeleteContact(ctx, sqlcgen.SoftDeleteContactParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting contact")
	}
	before := contactFromRow(existing)
	s.writeAudit(ctx, companyID, before, nil, nil, id, "delete")
	return nil
}

// ─── Contact Persons ────────────────────────────────────────────────────────────

// CreatePersonInput holds data for a new contact person.
type CreatePersonInput struct {
	Name      string
	Role      *string
	Email     *string
	Phone     *string
	Notes     *string
	Birthday  *time.Time
	IsPrimary bool
}

// CreatePerson adds a person to a contact.
func (s *ContactService) CreatePerson(ctx context.Context, contactID uuid.UUID, in CreatePersonInput) (*domain.ContactPerson, error) {
	if in.IsPrimary {
		_ = s.q.ClearPrimaryContactPerson(ctx, contactID)
	}

	var birthday pgtype.Date
	if in.Birthday != nil {
		birthday = pgtype.Date{Time: *in.Birthday, Valid: true}
	}

	row, err := s.q.CreateContactPerson(ctx, sqlcgen.CreateContactPersonParams{
		ContactID: contactID,
		Name:      in.Name,
		Role:      in.Role,
		Email:     in.Email,
		Phone:     in.Phone,
		Notes:     in.Notes,
		Birthday:  birthday,
		IsPrimary: in.IsPrimary,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating contact person")
	}
	return personFromRow(row), nil
}

// UpdatePersonInput holds updatable fields for a contact person.
type UpdatePersonInput struct {
	Name      string
	Role      *string
	Email     *string
	Phone     *string
	Notes     *string
	Birthday  *time.Time
	IsPrimary bool
}

// UpdatePerson updates a contact person.
func (s *ContactService) UpdatePerson(ctx context.Context, personID, contactID uuid.UUID, in UpdatePersonInput) (*domain.ContactPerson, error) {
	if in.IsPrimary {
		_ = s.q.ClearPrimaryContactPerson(ctx, contactID)
	}

	var birthday pgtype.Date
	if in.Birthday != nil {
		birthday = pgtype.Date{Time: *in.Birthday, Valid: true}
	}

	row, err := s.q.UpdateContactPerson(ctx, sqlcgen.UpdateContactPersonParams{
		ID:        personID,
		ContactID: contactID,
		Name:      in.Name,
		Role:      in.Role,
		Email:     in.Email,
		Phone:     in.Phone,
		Notes:     in.Notes,
		Birthday:  birthday,
		IsPrimary: in.IsPrimary,
	})
	if err != nil {
		return nil, errors.WithStack(domain.ErrPersonNotFound)
	}
	return personFromRow(row), nil
}

// DeletePerson soft-deletes a contact person.
func (s *ContactService) DeletePerson(ctx context.Context, personID uuid.UUID) error {
	return errors.Wrap(s.q.SoftDeleteContactPerson(ctx, personID), "deleting person")
}

// ListPersons returns all persons for a contact.
func (s *ContactService) ListPersons(ctx context.Context, contactID uuid.UUID) ([]*domain.ContactPerson, error) {
	rows, err := s.q.ListContactPersons(ctx, contactID)
	if err != nil {
		return nil, errors.Wrap(err, "listing contact persons")
	}
	out := make([]*domain.ContactPerson, 0, len(rows))
	for _, r := range rows {
		out = append(out, personFromRow(r))
	}
	return out, nil
}

// ─── Bank Accounts ─────────────────────────────────────────────────────────────

// CreateBankAccountInput holds data for a new bank account.
type CreateBankAccountInput struct {
	CBU           string // plaintext, encrypted before storage
	Alias         *string
	BankName      *string
	AccountHolder *string
	Currency      string
}

// CreateBankAccount encrypts the CBU and persists the bank account.
func (s *ContactService) CreateBankAccount(ctx context.Context, contactID uuid.UUID, in CreateBankAccountInput) (*domain.ContactBankAccount, error) {
	encrypted, err := s.cipher.Encrypt([]byte(in.CBU))
	if err != nil {
		return nil, errors.Wrap(err, "encrypting CBU")
	}

	// Store only the last-4-digits mask; full CBU lives only in encrypted_cbu.
	masked := maskCBU(in.CBU)
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}

	row, err := s.q.CreateContactBankAccount(ctx, sqlcgen.CreateContactBankAccountParams{
		ContactID:     contactID,
		CbuCvu:        &masked,
		Alias:         in.Alias,
		BankName:      in.BankName,
		AccountHolder: in.AccountHolder,
		Currency:      currency,
		EncryptedCbu:  encrypted,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating bank account")
	}
	return bankAccountFromRow(row), nil
}

// DeleteBankAccount soft-deletes a bank account.
func (s *ContactService) DeleteBankAccount(ctx context.Context, accountID uuid.UUID) error {
	return errors.Wrap(s.q.SoftDeleteContactBankAccount(ctx, accountID), "deleting bank account")
}

// ListBankAccounts returns all bank accounts for a contact (CBU stays encrypted).
func (s *ContactService) ListBankAccounts(ctx context.Context, contactID uuid.UUID) ([]*domain.ContactBankAccount, error) {
	rows, err := s.q.ListContactBankAccounts(ctx, contactID)
	if err != nil {
		return nil, errors.Wrap(err, "listing bank accounts")
	}
	out := make([]*domain.ContactBankAccount, 0, len(rows))
	for _, r := range rows {
		out = append(out, bankAccountFromRow(r))
	}
	return out, nil
}

// ─── Notes ─────────────────────────────────────────────────────────────────────

// CreateNote appends an immutable note to a contact's history.
func (s *ContactService) CreateNote(ctx context.Context, contactID, userID uuid.UUID, body string) (*domain.ContactNote, error) {
	if strings.TrimSpace(body) == "" {
		return nil, errors.WithStack(domain.ErrNoteBodyRequired)
	}
	row, err := s.q.CreateContactNote(ctx, sqlcgen.CreateContactNoteParams{
		ContactID: contactID,
		UserID:    userID,
		Body:      body,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating note")
	}
	return noteFromRow(row), nil
}

// ListNotes returns all notes for a contact, newest first.
func (s *ContactService) ListNotes(ctx context.Context, contactID uuid.UUID) ([]*domain.ContactNote, error) {
	rows, err := s.q.ListContactNotes(ctx, contactID)
	if err != nil {
		return nil, errors.Wrap(err, "listing notes")
	}
	out := make([]*domain.ContactNote, 0, len(rows))
	for _, r := range rows {
		out = append(out, noteFromRow(r))
	}
	return out, nil
}

// ─── Tags ──────────────────────────────────────────────────────────────────────

// CreateTag creates a new company-scoped tag.
func (s *ContactService) CreateTag(ctx context.Context, companyID uuid.UUID, name string, color, area *string) (*domain.Tag, error) {
	row, err := s.q.CreateTag(ctx, sqlcgen.CreateTagParams{
		CompanyID: companyID,
		Name:      name,
		Color:     color,
		Area:      area,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errors.WithStack(domain.ErrTagAlreadyExists)
		}
		return nil, errors.Wrap(err, "creating tag")
	}
	return tagFromRow(row), nil
}

// ListTags returns all tags for a company, optionally filtered by area.
func (s *ContactService) ListTags(ctx context.Context, companyID uuid.UUID, area string) ([]*domain.Tag, error) {
	rows, err := s.q.ListTags(ctx, sqlcgen.ListTagsParams{CompanyID: companyID, Column2: area})
	if err != nil {
		return nil, errors.Wrap(err, "listing tags")
	}
	out := make([]*domain.Tag, 0, len(rows))
	for _, r := range rows {
		out = append(out, tagFromRow(r))
	}
	return out, nil
}

// AddContactTag links a tag to a contact.
func (s *ContactService) AddContactTag(ctx context.Context, contactID, tagID uuid.UUID) error {
	return errors.Wrap(s.q.AddContactTag(ctx, sqlcgen.AddContactTagParams{
		ContactID: contactID,
		TagID:     tagID,
	}), "adding contact tag")
}

// RemoveContactTag removes a tag from a contact.
func (s *ContactService) RemoveContactTag(ctx context.Context, contactID, tagID uuid.UUID) error {
	return errors.Wrap(s.q.RemoveContactTag(ctx, sqlcgen.RemoveContactTagParams{
		ContactID: contactID,
		TagID:     tagID,
	}), "removing contact tag")
}

// ListContactTags returns all tags for a contact.
func (s *ContactService) ListContactTags(ctx context.Context, contactID uuid.UUID) ([]*domain.Tag, error) {
	rows, err := s.q.ListContactTags(ctx, contactID)
	if err != nil {
		return nil, errors.Wrap(err, "listing contact tags")
	}
	out := make([]*domain.Tag, 0, len(rows))
	for _, r := range rows {
		out = append(out, &domain.Tag{
			ID:        r.ID,
			CompanyID: r.CompanyID,
			Name:      r.Name,
			Color:     r.Color,
			Area:      r.Area,
			CreatedAt: r.CreatedAt.Time,
		})
	}
	return out, nil
}

// ─── Audit ─────────────────────────────────────────────────────────────────────

func (s *ContactService) writeAudit(ctx context.Context, companyID uuid.UUID, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	var beforeJSON, afterJSON []byte
	if before != nil {
		b, _ := json.Marshal(before)
		beforeJSON = b
	}
	if after != nil {
		b, _ := json.Marshal(after)
		afterJSON = b
	}

	uid := pgtype.UUID{}
	if userID != nil {
		uid = pgtype.UUID{Bytes: *userID, Valid: true}
	}

	_ = s.q.InsertAuditLog(ctx, sqlcgen.InsertAuditLogParams{
		CompanyID:   companyID,
		UserID:      uid,
		EntityType:  "contact",
		EntityID:    entityID,
		Action:      action,
		BeforeState: beforeJSON,
		AfterState:  afterJSON,
	})
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

func normalizeCUIT(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	raw := strings.ReplaceAll(*s, "-", "")
	raw = strings.TrimSpace(raw)
	if len(raw) != 11 {
		return s
	}
	// Format as XX-XXXXXXXX-X (13 chars including hyphens).
	formatted := fmt.Sprintf("%s-%s-%s", raw[:2], raw[2:10], raw[10:])
	return &formatted
}

func maskCBU(cbu string) string {
	if len(cbu) <= 4 {
		return strings.Repeat("•", len(cbu))
	}
	return strings.Repeat("•", len(cbu)-4) + cbu[len(cbu)-4:]
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint")
}

// ─── Row mappers ───────────────────────────────────────────────────────────────

func contactFromCreateRow(r sqlcgen.CreateContactRow) *domain.Contact {
	return contactFieldsToContact(
		r.ID, r.CompanyID, r.Kind, r.FantasyName, r.LegalName, r.CuitCuil,
		r.VatCondition, r.FiscalAddress, r.City, r.Province, r.PostalCode,
		r.Email, r.Phone, r.Website, r.Industry, r.Source,
		r.DefaultPaymentConditionID, r.CreditLimit, r.UsualDiscountPct,
		r.AssignedUserID, r.LifecycleStatus, r.CreatedAt, r.UpdatedAt, r.DeletedAt,
	)
}

func contactFromRow(r sqlcgen.GetContactByIDRow) *domain.Contact {
	return contactFieldsToContact(
		r.ID, r.CompanyID, r.Kind, r.FantasyName, r.LegalName, r.CuitCuil,
		r.VatCondition, r.FiscalAddress, r.City, r.Province, r.PostalCode,
		r.Email, r.Phone, r.Website, r.Industry, r.Source,
		r.DefaultPaymentConditionID, r.CreditLimit, r.UsualDiscountPct,
		r.AssignedUserID, r.LifecycleStatus, r.CreatedAt, r.UpdatedAt, r.DeletedAt,
	)
}

func contactFromListRow(r sqlcgen.ListContactsRow) *domain.Contact {
	return contactFieldsToContact(
		r.ID, r.CompanyID, r.Kind, r.FantasyName, r.LegalName, r.CuitCuil,
		r.VatCondition, r.FiscalAddress, r.City, r.Province, r.PostalCode,
		r.Email, r.Phone, r.Website, r.Industry, r.Source,
		r.DefaultPaymentConditionID, r.CreditLimit, r.UsualDiscountPct,
		r.AssignedUserID, r.LifecycleStatus, r.CreatedAt, r.UpdatedAt, r.DeletedAt,
	)
}

func contactFromUpdateRow(r sqlcgen.UpdateContactRow) *domain.Contact {
	return contactFieldsToContact(
		r.ID, r.CompanyID, r.Kind, r.FantasyName, r.LegalName, r.CuitCuil,
		r.VatCondition, r.FiscalAddress, r.City, r.Province, r.PostalCode,
		r.Email, r.Phone, r.Website, r.Industry, r.Source,
		r.DefaultPaymentConditionID, r.CreditLimit, r.UsualDiscountPct,
		r.AssignedUserID, r.LifecycleStatus, r.CreatedAt, r.UpdatedAt, r.DeletedAt,
	)
}

func contactFieldsToContact(
	id, companyID uuid.UUID,
	kind []string,
	fantasyName string,
	legalName, cuitCuil, vatCondition, fiscalAddress, city, province,
	postalCode, email, phone, website, industry, source *string,
	defaultPaymentConditionID pgtype.UUID,
	creditLimit, usualDiscountPct pgtype.Numeric,
	assignedUserID pgtype.UUID,
	lifecycleStatus string,
	createdAt, updatedAt, deletedAt pgtype.Timestamptz,
) *domain.Contact {
	c := &domain.Contact{
		ID:              id,
		CompanyID:       companyID,
		FantasyName:     fantasyName,
		LegalName:       legalName,
		CUITCUIL:        cuitCuil,
		FiscalAddress:   fiscalAddress,
		City:            city,
		Province:        province,
		PostalCode:      postalCode,
		Email:           email,
		Phone:           phone,
		Website:         website,
		Industry:        industry,
		Source:          source,
		LifecycleStatus: domain.LifecycleStatus(lifecycleStatus),
		CreatedAt:       createdAt.Time,
		UpdatedAt:       updatedAt.Time,
	}
	for _, k := range kind {
		c.Kind = append(c.Kind, domain.ContactKind(k))
	}
	if vatCondition != nil {
		vc := domain.VatCondition(*vatCondition)
		c.VatCondition = &vc
	}
	if defaultPaymentConditionID.Valid {
		uid := uuid.UUID(defaultPaymentConditionID.Bytes)
		c.DefaultPaymentConditionID = &uid
	}
	if creditLimit.Valid {
		d, _ := decimal.NewFromString(creditLimit.Int.String())
		// Adjust for exponent
		if creditLimit.Exp != 0 {
			exp := decimal.New(1, int32(creditLimit.Exp))
			d = d.Mul(exp)
		}
		c.CreditLimit = &d
	}
	if usualDiscountPct.Valid {
		d, _ := decimal.NewFromString(usualDiscountPct.Int.String())
		if usualDiscountPct.Exp != 0 {
			exp := decimal.New(1, int32(usualDiscountPct.Exp))
			d = d.Mul(exp)
		}
		c.UsualDiscountPct = d
	}
	if assignedUserID.Valid {
		uid := uuid.UUID(assignedUserID.Bytes)
		c.AssignedUserID = &uid
	}
	if deletedAt.Valid {
		t := deletedAt.Time
		c.DeletedAt = &t
	}
	return c
}

func personFromRow(r sqlcgen.ContactPerson) *domain.ContactPerson {
	p := &domain.ContactPerson{
		ID:        r.ID,
		ContactID: r.ContactID,
		Name:      r.Name,
		Role:      r.Role,
		Email:     r.Email,
		Phone:     r.Phone,
		Notes:     r.Notes,
		IsPrimary: r.IsPrimary,
		CreatedAt: r.CreatedAt.Time,
		UpdatedAt: r.UpdatedAt.Time,
	}
	if r.Birthday.Valid {
		t := r.Birthday.Time
		p.Birthday = &t
	}
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		p.DeletedAt = &t
	}
	return p
}

func bankAccountFromRow(r sqlcgen.ContactBankAccount) *domain.ContactBankAccount {
	ba := &domain.ContactBankAccount{
		ID:            r.ID,
		ContactID:     r.ContactID,
		Alias:         r.Alias,
		BankName:      r.BankName,
		AccountHolder: r.AccountHolder,
		Currency:      r.Currency,
		EncryptedCBU:  r.EncryptedCbu,
		CreatedAt:     r.CreatedAt.Time,
		UpdatedAt:     r.UpdatedAt.Time,
	}
	if r.CbuCvu != nil {
		ba.CBUDisplay = *r.CbuCvu
	}
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		ba.DeletedAt = &t
	}
	return ba
}

func noteFromRow(r sqlcgen.ContactNote) *domain.ContactNote {
	return &domain.ContactNote{
		ID:        r.ID,
		ContactID: r.ContactID,
		UserID:    r.UserID,
		Body:      r.Body,
		CreatedAt: r.CreatedAt.Time,
	}
}

func tagFromRow(r sqlcgen.Tag) *domain.Tag {
	return &domain.Tag{
		ID:        r.ID,
		CompanyID: r.CompanyID,
		Name:      r.Name,
		Color:     r.Color,
		Area:      r.Area,
		CreatedAt: r.CreatedAt.Time,
	}
}
