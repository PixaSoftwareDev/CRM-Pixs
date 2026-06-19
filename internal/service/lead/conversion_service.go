package lead

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	domaincontact "pixs/internal/domain/contact"
	domain "pixs/internal/domain/lead"
	sqlcgen "pixs/internal/repository/sqlc"
)

// ConversionService converts a lead into a CRM contact (and optionally an
// opportunity) inside a single transaction.
type ConversionService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewConversionService constructs a ConversionService.
func NewConversionService(db *pgxpool.Pool, logger *slog.Logger) *ConversionService {
	return &ConversionService{q: sqlcgen.New(db), db: db, logger: logger}
}

// ConvertResult is the outcome of converting a lead.
type ConvertResult struct {
	Lead          *domain.Lead
	ContactID     uuid.UUID
	OpportunityID *uuid.UUID
}

// ConvertToContact creates a contact from the lead, marks the lead converted,
// and (when stageID is provided) creates a linked opportunity — atomically.
//
// All scraped emails, phones and socials are transferred to the new contact:
//   - First email/phone go onto the contact record itself.
//   - Each unique email/phone pair becomes a ContactPerson entry so they appear
//     in the Personas tab, ready to fill in names later.
func (s *ConversionService) ConvertToContact(ctx context.Context, companyID, callerID, leadID uuid.UUID, stageID *uuid.UUID) (*ConvertResult, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	// Lock the lead row.
	row, err := qtx.GetLeadForUpdate(ctx, sqlcgen.GetLeadForUpdateParams{ID: leadID, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	if domain.LeadStatus(row.Status) == domain.StatusConverted {
		return nil, errors.WithStack(domain.ErrLeadAlreadyConverted)
	}

	// Fetch scraped contact data while still inside the transaction.
	emails, _ := qtx.ListLeadEmails(ctx, leadID)
	phones, _ := qtx.ListLeadPhones(ctx, leadID)
	socials, _ := qtx.ListLeadSocials(ctx, leadID)

	// Build the contact params — populate email/phone at company level from
	// the first scraped value found.
	contactParams := sqlcgen.CreateContactParams{
		CompanyID:       companyID,
		Kind:            []string{string(domaincontact.KindProspect)},
		FantasyName:     row.CompanyName,
		Website:         row.Website,
		Industry:        row.Industry,
		City:            row.City,
		LifecycleStatus: string(domaincontact.StatusProspect),
	}
	source := "lead_scraping"
	contactParams.Source = &source
	if row.AssignedTo.Valid {
		contactParams.AssignedUserID = row.AssignedTo
	}
	if err := contactParams.UsualDiscountPct.Scan("0"); err != nil {
		return nil, errors.Wrap(err, "init discount")
	}
	if len(emails) > 0 {
		contactParams.Email = &emails[0].Email
	}
	if len(phones) > 0 {
		contactParams.Phone = &phones[0].Phone
	}

	contact, err := qtx.CreateContact(ctx, contactParams)
	if err != nil {
		return nil, errors.Wrap(err, "creating contact")
	}

	// Create ContactPerson entries for each scraped email/phone pair so they
	// appear in the Personas tab. We pair by index: email[0]+phone[0],
	// email[1]+phone[1], etc., then continue with leftovers.
	maxPairs := len(emails)
	if len(phones) > maxPairs {
		maxPairs = len(phones)
	}
	role := "Contacto (scraping)"
	for i := 0; i < maxPairs; i++ {
		p := sqlcgen.CreateContactPersonParams{
			ContactID: contact.ID,
			Name:      row.CompanyName + " — contacto " + fmt.Sprint(i+1),
			Role:      &role,
			IsPrimary: i == 0,
		}
		if i < len(emails) {
			p.Name = strings.Split(emails[i].Email, "@")[0]
			p.Email = &emails[i].Email
		}
		if i < len(phones) {
			p.Phone = &phones[i].Phone
		}
		if _, err := qtx.CreateContactPerson(ctx, p); err != nil {
			s.logger.Warn("could not create contact person from lead", "err", err, "index", i)
		}
	}

	// Append socials as a structured note on the contact so the data is
	// visible. A proper socials table on contacts can be added later.
	if len(socials) > 0 {
		var sb strings.Builder
		sb.WriteString("Redes sociales (importado desde lead):\n")
		for _, sc := range socials {
			sb.WriteString("• ")
			sb.WriteString(strings.Title(sc.Platform))
			if sc.Handle != nil && *sc.Handle != "" {
				sb.WriteString(": @")
				sb.WriteString(*sc.Handle)
			}
			if sc.Url != nil && *sc.Url != "" {
				sb.WriteString(" ")
				sb.WriteString(*sc.Url)
			}
			sb.WriteString("\n")
		}
		note := sb.String()
		if _, err := qtx.CreateContactNote(ctx, sqlcgen.CreateContactNoteParams{
			ContactID: contact.ID,
			Body:      note,
		}); err != nil {
			s.logger.Warn("could not create socials note", "err", err)
		}
	}

	// Mark the lead converted.
	updated, err := qtx.ConvertLead(ctx, sqlcgen.ConvertLeadParams{
		ID: leadID, CompanyID: companyID,
		ConvertedContactID: pgtype.UUID{Bytes: contact.ID, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "marking lead converted")
	}

	result := &ConvertResult{Lead: leadFromRow(updated), ContactID: contact.ID}

	// Optionally create an opportunity linked to the contact + lead.
	if stageID != nil {
		oppParams := sqlcgen.CreateLeadOpportunityParams{
			CompanyID: companyID,
			ContactID: contact.ID,
			StageID:   *stageID,
			Title:     row.CompanyName,
			Currency:  "ARS",
			LeadID:    pgtype.UUID{Bytes: leadID, Valid: true},
		}
		oppParams.Source = &source
		if row.AssignedTo.Valid {
			oppParams.AssignedUserID = row.AssignedTo
		}
		opp, err := qtx.CreateLeadOpportunity(ctx, oppParams)
		if err != nil {
			return nil, errors.Wrap(err, "creating opportunity")
		}
		result.OpportunityID = &opp.ID
	}

	// Record the conversion activity.
	detail := "lead convertido a contacto " + contact.ID.String()
	if _, err := qtx.CreateLeadActivity(ctx, sqlcgen.CreateLeadActivityParams{
		LeadID: leadID, UserID: pgtype.UUID{Bytes: callerID, Valid: true},
		ActivityType: "status_changed", Detail: &detail,
	}); err != nil {
		return nil, errors.Wrap(err, "recording activity")
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit conversion")
	}
	return result, nil
}
