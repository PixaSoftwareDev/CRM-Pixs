package lead

import (
	"context"
	"log/slog"

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

	// Create the contact as a prospect.
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
	contact, err := qtx.CreateContact(ctx, contactParams)
	if err != nil {
		return nil, errors.Wrap(err, "creating contact")
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
