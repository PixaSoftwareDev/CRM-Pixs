package sales

import (
	"context"
	"log/slog"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/sales"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// OpportunityService manages pipeline opportunities and stages.
type OpportunityService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewOpportunityService constructs an OpportunityService.
func NewOpportunityService(db *pgxpool.Pool, logger *slog.Logger) *OpportunityService {
	return &OpportunityService{q: sqlcgen.New(db), db: db, logger: logger}
}

// OpportunityInput holds data for creating/updating an opportunity.
type OpportunityInput struct {
	ContactID         uuid.UUID
	StageID           uuid.UUID
	Title             string
	Amount            *decimal.Decimal
	Currency          string
	ProbabilityPct    *decimal.Decimal
	ExpectedCloseDate *pgtype.Date
	AssignedUserID    *uuid.UUID
	Source            *string
}

func validateProbability(p *decimal.Decimal) error {
	if p == nil {
		return nil
	}
	if p.LessThan(decimal.Zero) || p.GreaterThan(decimal.NewFromInt(100)) {
		return errors.WithStack(domain.ErrInvalidProbability)
	}
	return nil
}

// CreateOpportunity creates a new opportunity.
func (s *OpportunityService) CreateOpportunity(ctx context.Context, companyID uuid.UUID, userID *uuid.UUID, in OpportunityInput) (*domain.Opportunity, error) {
	if err := validateProbability(in.ProbabilityPct); err != nil {
		return nil, err
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}
	params := sqlcgen.CreateOpportunityParams{
		CompanyID:      companyID,
		ContactID:      in.ContactID,
		StageID:        in.StageID,
		Title:          in.Title,
		Amount:         pgconv.DecimalToNumeric(in.Amount),
		Currency:       currency,
		ProbabilityPct: pgconv.DecimalToNumeric(in.ProbabilityPct),
		AssignedUserID: pgconv.PtrUUID(in.AssignedUserID),
		Source:         in.Source,
	}
	if in.ExpectedCloseDate != nil {
		params.ExpectedCloseDate = *in.ExpectedCloseDate
	}
	row, err := s.q.CreateOpportunity(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "creating opportunity")
	}
	o := opportunityFromRow(row)
	s.writeAudit(ctx, companyID, nil, o, userID, o.ID, "create")
	return o, nil
}

// GetOpportunity returns an opportunity by ID, respecting own-restriction.
func (s *OpportunityService) GetOpportunity(ctx context.Context, companyID, id, callerUserID uuid.UUID, restrictToOwn bool) (*domain.Opportunity, error) {
	row, err := s.q.GetOpportunityByID(ctx, sqlcgen.GetOpportunityByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrOpportunityNotFound)
	}
	o := opportunityFromRow(row)
	if restrictToOwn && (o.AssignedUserID == nil || *o.AssignedUserID != callerUserID) {
		return nil, errors.WithStack(domain.ErrForbidden)
	}
	return o, nil
}

// OpportunityFilter holds filter parameters for listing opportunities.
type OpportunityFilter struct {
	StageID        *uuid.UUID
	AssignedUserID *uuid.UUID
	ContactID      *uuid.UUID
}

// ListOpportunities returns opportunities with optional filters.
func (s *OpportunityService) ListOpportunities(ctx context.Context, companyID, callerUserID uuid.UUID, restrictToOwn bool, f OpportunityFilter) ([]*domain.Opportunity, error) {
	params := sqlcgen.ListOpportunitiesParams{
		CompanyID: companyID,
		StageID:   pgconv.PtrUUID(f.StageID),
		ContactID: pgconv.PtrUUID(f.ContactID),
	}
	if restrictToOwn {
		params.AssignedUserID = pgtype.UUID{Bytes: callerUserID, Valid: true}
	} else {
		params.AssignedUserID = pgconv.PtrUUID(f.AssignedUserID)
	}
	rows, err := s.q.ListOpportunities(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "listing opportunities")
	}
	out := make([]*domain.Opportunity, 0, len(rows))
	for _, r := range rows {
		out = append(out, opportunityFromRow(r))
	}
	return out, nil
}

// UpdateOpportunity updates an opportunity.
func (s *OpportunityService) UpdateOpportunity(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID, in OpportunityInput) (*domain.Opportunity, error) {
	if err := validateProbability(in.ProbabilityPct); err != nil {
		return nil, err
	}
	existing, err := s.q.GetOpportunityByID(ctx, sqlcgen.GetOpportunityByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrOpportunityNotFound)
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}
	params := sqlcgen.UpdateOpportunityParams{
		ID:             id,
		CompanyID:      companyID,
		ContactID:      in.ContactID,
		StageID:        in.StageID,
		Title:          in.Title,
		Amount:         pgconv.DecimalToNumeric(in.Amount),
		Currency:       currency,
		ProbabilityPct: pgconv.DecimalToNumeric(in.ProbabilityPct),
		AssignedUserID: pgconv.PtrUUID(in.AssignedUserID),
		Source:         in.Source,
	}
	if in.ExpectedCloseDate != nil {
		params.ExpectedCloseDate = *in.ExpectedCloseDate
	}
	row, err := s.q.UpdateOpportunity(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "updating opportunity")
	}
	before := opportunityFromRow(existing)
	after := opportunityFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// MoveStage moves an opportunity to a different stage.
func (s *OpportunityService) MoveStage(ctx context.Context, companyID, id, stageID uuid.UUID, userID *uuid.UUID) (*domain.Opportunity, error) {
	existing, err := s.q.GetOpportunityByID(ctx, sqlcgen.GetOpportunityByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrOpportunityNotFound)
	}
	if _, err := s.q.GetPipelineStageByID(ctx, sqlcgen.GetPipelineStageByIDParams{ID: stageID, CompanyID: companyID}); err != nil {
		return nil, errors.WithStack(domain.ErrStageNotFound)
	}
	row, err := s.q.MoveOpportunityStage(ctx, sqlcgen.MoveOpportunityStageParams{ID: id, CompanyID: companyID, StageID: stageID})
	if err != nil {
		return nil, errors.Wrap(err, "moving opportunity stage")
	}
	before := opportunityFromRow(existing)
	after := opportunityFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// Win marks an opportunity as won by moving it to the configured win stage.
func (s *OpportunityService) Win(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID) (*domain.Opportunity, error) {
	existing, err := s.q.GetOpportunityByID(ctx, sqlcgen.GetOpportunityByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrOpportunityNotFound)
	}
	stage, err := s.q.GetWinStage(ctx, companyID)
	if err != nil {
		return nil, errors.WithStack(domain.ErrNoWinStage)
	}
	row, err := s.q.WinOpportunity(ctx, sqlcgen.WinOpportunityParams{ID: id, CompanyID: companyID, StageID: stage.ID})
	if err != nil {
		return nil, errors.Wrap(err, "winning opportunity")
	}
	before := opportunityFromRow(existing)
	after := opportunityFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// Lose marks an opportunity as lost by moving it to the loss stage and recording the reason.
func (s *OpportunityService) Lose(ctx context.Context, companyID, id uuid.UUID, reasonID *uuid.UUID, notes *string, userID *uuid.UUID) (*domain.Opportunity, error) {
	existing, err := s.q.GetOpportunityByID(ctx, sqlcgen.GetOpportunityByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrOpportunityNotFound)
	}
	stage, err := s.q.GetLossStage(ctx, companyID)
	if err != nil {
		return nil, errors.WithStack(domain.ErrNoLossStage)
	}
	row, err := s.q.LoseOpportunity(ctx, sqlcgen.LoseOpportunityParams{
		ID:           id,
		CompanyID:    companyID,
		StageID:      stage.ID,
		LostReasonID: pgconv.PtrUUID(reasonID),
		LostNotes:    notes,
	})
	if err != nil {
		return nil, errors.Wrap(err, "losing opportunity")
	}
	before := opportunityFromRow(existing)
	after := opportunityFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// DeleteOpportunity soft-deletes an opportunity.
func (s *OpportunityService) DeleteOpportunity(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID) error {
	existing, err := s.q.GetOpportunityByID(ctx, sqlcgen.GetOpportunityByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrOpportunityNotFound)
	}
	if err := s.q.SoftDeleteOpportunity(ctx, sqlcgen.SoftDeleteOpportunityParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting opportunity")
	}
	s.writeAudit(ctx, companyID, opportunityFromRow(existing), nil, userID, id, "delete")
	return nil
}

// Forecast returns the weighted pipeline forecast for the company.
func (s *OpportunityService) Forecast(ctx context.Context, companyID uuid.UUID) (decimal.Decimal, error) {
	rows, err := s.q.ListOpportunitiesForForecast(ctx, companyID)
	if err != nil {
		return decimal.Zero, errors.Wrap(err, "loading forecast data")
	}
	opps := make([]*domain.Opportunity, 0, len(rows))
	for _, r := range rows {
		opps = append(opps, &domain.Opportunity{
			ID:             r.ID,
			Amount:         pgconv.NumericToDecimal(r.Amount),
			ProbabilityPct: pgconv.NumericToDecimal(r.ProbabilityPct),
			Currency:       r.Currency,
		})
	}
	return domain.Forecast(opps), nil
}

// ─── Pipeline stages & lost reasons ────────────────────────────────────────────

// ListStages returns all pipeline stages.
func (s *OpportunityService) ListStages(ctx context.Context, companyID uuid.UUID) ([]*domain.PipelineStage, error) {
	rows, err := s.q.ListPipelineStages(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing pipeline stages")
	}
	out := make([]*domain.PipelineStage, 0, len(rows))
	for _, r := range rows {
		out = append(out, stageFromRow(r))
	}
	return out, nil
}

// ListLostReasons returns all lost reasons.
func (s *OpportunityService) ListLostReasons(ctx context.Context, companyID uuid.UUID) ([]*domain.LostReason, error) {
	rows, err := s.q.ListLostReasons(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing lost reasons")
	}
	out := make([]*domain.LostReason, 0, len(rows))
	for _, r := range rows {
		out = append(out, &domain.LostReason{ID: r.ID, CompanyID: r.CompanyID, Name: r.Name, CreatedAt: r.CreatedAt.Time})
	}
	return out, nil
}

func (s *OpportunityService) writeAudit(ctx context.Context, companyID uuid.UUID, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	writeAudit(ctx, s.q, companyID, "opportunity", before, after, userID, entityID, action)
}

func opportunityFromRow(r sqlcgen.Opportunity) *domain.Opportunity {
	return &domain.Opportunity{
		ID:                r.ID,
		CompanyID:         r.CompanyID,
		ContactID:         r.ContactID,
		StageID:           r.StageID,
		Title:             r.Title,
		Amount:            pgconv.NumericToDecimal(r.Amount),
		Currency:          r.Currency,
		ProbabilityPct:    pgconv.NumericToDecimal(r.ProbabilityPct),
		ExpectedCloseDate: pgconv.TimePtr(r.ExpectedCloseDate),
		AssignedUserID:    pgconv.UUIDPtr(r.AssignedUserID),
		Source:            r.Source,
		LostReasonID:      pgconv.UUIDPtr(r.LostReasonID),
		LostNotes:         r.LostNotes,
		LeadID:            pgconv.UUIDPtr(r.LeadID),
		CreatedAt:         r.CreatedAt.Time,
		UpdatedAt:         r.UpdatedAt.Time,
		DeletedAt:         pgconv.TimestamptzPtr(r.DeletedAt),
	}
}

func stageFromRow(r sqlcgen.PipelineStage) *domain.PipelineStage {
	return &domain.PipelineStage{
		ID:        r.ID,
		CompanyID: r.CompanyID,
		Name:      r.Name,
		OrderPos:  r.OrderPos,
		Color:     r.Color,
		IsWin:     r.IsWin,
		IsLoss:    r.IsLoss,
		IsDefault: r.IsDefault,
		CreatedAt: r.CreatedAt.Time,
	}
}
