package sales

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/sales"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// QuoteService manages quotes and their line items, including versioning.
type QuoteService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewQuoteService constructs a QuoteService.
func NewQuoteService(db *pgxpool.Pool, logger *slog.Logger) *QuoteService {
	return &QuoteService{q: sqlcgen.New(db), db: db, logger: logger}
}

// QuoteItemInput holds the data for one quote line.
type QuoteItemInput struct {
	ProductID   *uuid.UUID
	Description string
	Quantity    decimal.Decimal
	UnitPrice   decimal.Decimal
	DiscountPct decimal.Decimal
	VATRatePct  decimal.Decimal
	OrderPos    *int16
}

// QuoteInput holds the data for creating or updating a quote.
type QuoteInput struct {
	ContactID     uuid.UUID
	OpportunityID *uuid.UUID
	UserID        uuid.UUID
	Date          time.Time
	ValidUntil    *time.Time
	Currency      string
	ExchangeRate  decimal.Decimal
	Notes         *string
	Items         []QuoteItemInput
}

// CreateQuote creates a new draft quote with computed totals and items, atomically.
func (s *QuoteService) CreateQuote(ctx context.Context, companyID uuid.UUID, in QuoteInput) (*domain.Quote, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	number, err := nextQuoteNumber(ctx, qtx, companyID)
	if err != nil {
		return nil, err
	}

	totals := computeTotals(in.Items)
	exchangeRate := in.ExchangeRate
	if exchangeRate.IsZero() {
		exchangeRate = decimal.NewFromInt(1)
	}

	params := sqlcgen.CreateQuoteParams{
		CompanyID:     companyID,
		Number:        number,
		ContactID:     in.ContactID,
		OpportunityID: pgconv.PtrUUID(in.OpportunityID),
		UserID:        in.UserID,
		Date:          pgtype.Date{Time: in.Date, Valid: true},
		ValidUntil:    pgconv.PtrDate(in.ValidUntil),
		Currency:      in.Currency,
		ExchangeRate:  pgconv.DecimalToNumericValue(exchangeRate),
		Status:        string(domain.QuoteStatusDraft),
		Version:       1,
		Notes:         in.Notes,
		Subtotal:      pgconv.DecimalToNumericValue(totals.Subtotal),
		TaxTotal:      pgconv.DecimalToNumericValue(totals.TaxTotal),
		Total:         pgconv.DecimalToNumericValue(totals.Total),
	}
	row, err := qtx.CreateQuote(ctx, params)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errors.WithStack(domain.ErrQuoteNumberExists)
		}
		return nil, errors.Wrap(err, "creating quote")
	}

	items, err := insertItems(ctx, qtx, row.ID, in.Items, totals)
	if err != nil {
		return nil, err
	}

	writeAudit(ctx, qtx, companyID, "quote", nil, quoteFromRow(row, nil), &in.UserID, row.ID, "create")

	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return quoteFromRow(row, items), nil
}

// GetQuote returns a quote by ID with its items.
func (s *QuoteService) GetQuote(ctx context.Context, companyID, id uuid.UUID) (*domain.Quote, error) {
	row, err := s.q.GetQuoteByID(ctx, sqlcgen.GetQuoteByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrQuoteNotFound)
	}
	items, err := s.q.ListQuoteItems(ctx, id)
	if err != nil {
		return nil, errors.Wrap(err, "listing quote items")
	}
	return quoteFromRow(row, items), nil
}

// QuoteFilter holds filter parameters for listing quotes.
type QuoteFilter struct {
	ContactID     *uuid.UUID
	Status        *string
	OpportunityID *uuid.UUID
}

// ListQuotes returns quotes with optional filters (without items).
func (s *QuoteService) ListQuotes(ctx context.Context, companyID uuid.UUID, f QuoteFilter) ([]*domain.Quote, error) {
	rows, err := s.q.ListQuotes(ctx, sqlcgen.ListQuotesParams{
		CompanyID:     companyID,
		ContactID:     pgconv.PtrUUID(f.ContactID),
		Status:        f.Status,
		OpportunityID: pgconv.PtrUUID(f.OpportunityID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing quotes")
	}
	out := make([]*domain.Quote, 0, len(rows))
	for _, r := range rows {
		out = append(out, quoteFromRow(r, nil))
	}
	return out, nil
}

// UpdateQuote updates a quote. If the quote is in a status that requires versioning
// (sent/viewed/accepted), a new draft version is created instead of mutating in place.
func (s *QuoteService) UpdateQuote(ctx context.Context, companyID, id uuid.UUID, in QuoteInput) (*domain.Quote, error) {
	current, err := s.q.GetQuoteByID(ctx, sqlcgen.GetQuoteByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrQuoteNotFound)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	totals := computeTotals(in.Items)
	exchangeRate := in.ExchangeRate
	if exchangeRate.IsZero() {
		exchangeRate = decimal.NewFromInt(1)
	}

	status := domain.QuoteStatus(current.Status)
	var result sqlcgen.Quote

	if status.ShouldVersion() {
		// Create a new version: same root number, version+1, parent_id = current.id, status draft.
		rootID := id
		if current.ParentID.Valid {
			rootID = uuid.UUID(current.ParentID.Bytes)
		}
		result, err = qtx.CreateQuote(ctx, sqlcgen.CreateQuoteParams{
			CompanyID:     companyID,
			Number:        current.Number,
			ContactID:     in.ContactID,
			OpportunityID: pgconv.PtrUUID(in.OpportunityID),
			UserID:        in.UserID,
			Date:          pgtype.Date{Time: in.Date, Valid: true},
			ValidUntil:    pgconv.PtrDate(in.ValidUntil),
			Currency:      in.Currency,
			ExchangeRate:  pgconv.DecimalToNumericValue(exchangeRate),
			Status:        string(domain.QuoteStatusDraft),
			Version:       current.Version + 1,
			ParentID:      pgtype.UUID{Bytes: rootID, Valid: true},
			Notes:         in.Notes,
			Subtotal:      pgconv.DecimalToNumericValue(totals.Subtotal),
			TaxTotal:      pgconv.DecimalToNumericValue(totals.TaxTotal),
			Total:         pgconv.DecimalToNumericValue(totals.Total),
		})
		if err != nil {
			return nil, errors.Wrap(err, "creating quote version")
		}
		writeAudit(ctx, qtx, companyID, "quote", quoteFromRow(current, nil), quoteFromRow(result, nil), &in.UserID, result.ID, "create")
	} else {
		// In-place update of a draft (or other non-versioned status).
		result, err = qtx.UpdateQuote(ctx, sqlcgen.UpdateQuoteParams{
			ID:            id,
			CompanyID:     companyID,
			ContactID:     in.ContactID,
			OpportunityID: pgconv.PtrUUID(in.OpportunityID),
			UserID:        in.UserID,
			Date:          pgtype.Date{Time: in.Date, Valid: true},
			ValidUntil:    pgconv.PtrDate(in.ValidUntil),
			Currency:      in.Currency,
			ExchangeRate:  pgconv.DecimalToNumericValue(exchangeRate),
			Notes:         in.Notes,
			Subtotal:      pgconv.DecimalToNumericValue(totals.Subtotal),
			TaxTotal:      pgconv.DecimalToNumericValue(totals.TaxTotal),
			Total:         pgconv.DecimalToNumericValue(totals.Total),
		})
		if err != nil {
			return nil, errors.Wrap(err, "updating quote")
		}
		if err := qtx.DeleteQuoteItems(ctx, id); err != nil {
			return nil, errors.Wrap(err, "clearing quote items")
		}
		writeAudit(ctx, qtx, companyID, "quote", quoteFromRow(current, nil), quoteFromRow(result, nil), &in.UserID, result.ID, "update")
	}

	items, err := insertItems(ctx, qtx, result.ID, in.Items, totals)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return quoteFromRow(result, items), nil
}

// ChangeStatus updates the status of a quote.
func (s *QuoteService) ChangeStatus(ctx context.Context, companyID, id uuid.UUID, status string, userID *uuid.UUID) (*domain.Quote, error) {
	parsed, err := domain.ParseQuoteStatus(status)
	if err != nil {
		return nil, errors.WithStack(err)
	}
	current, err := s.q.GetQuoteByID(ctx, sqlcgen.GetQuoteByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrQuoteNotFound)
	}
	row, err := s.q.UpdateQuoteStatus(ctx, sqlcgen.UpdateQuoteStatusParams{ID: id, CompanyID: companyID, Status: string(parsed)})
	if err != nil {
		return nil, errors.Wrap(err, "updating quote status")
	}
	s.writeAudit(ctx, companyID, quoteFromRow(current, nil), quoteFromRow(row, nil), userID, id, "update")
	items, _ := s.q.ListQuoteItems(ctx, id)
	return quoteFromRow(row, items), nil
}

// DeleteQuote soft-deletes a quote.
func (s *QuoteService) DeleteQuote(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID) error {
	current, err := s.q.GetQuoteByID(ctx, sqlcgen.GetQuoteByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrQuoteNotFound)
	}
	if err := s.q.SoftDeleteQuote(ctx, sqlcgen.SoftDeleteQuoteParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting quote")
	}
	s.writeAudit(ctx, companyID, quoteFromRow(current, nil), nil, userID, id, "delete")
	return nil
}

// ListVersions returns all versions of a quote (the root and its children).
func (s *QuoteService) ListVersions(ctx context.Context, companyID, id uuid.UUID) ([]*domain.Quote, error) {
	// Resolve the root id first.
	q, err := s.q.GetQuoteByID(ctx, sqlcgen.GetQuoteByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrQuoteNotFound)
	}
	rootID := id
	if q.ParentID.Valid {
		rootID = uuid.UUID(q.ParentID.Bytes)
	}
	rows, err := s.q.GetQuoteVersions(ctx, sqlcgen.GetQuoteVersionsParams{CompanyID: companyID, ID: rootID})
	if err != nil {
		return nil, errors.Wrap(err, "listing quote versions")
	}
	out := make([]*domain.Quote, 0, len(rows))
	for _, r := range rows {
		out = append(out, quoteFromRow(r, nil))
	}
	return out, nil
}

func (s *QuoteService) writeAudit(ctx context.Context, companyID uuid.UUID, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	writeAudit(ctx, s.q, companyID, "quote", before, after, userID, entityID, action)
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

func nextQuoteNumber(ctx context.Context, q *sqlcgen.Queries, companyID uuid.UUID) (string, error) {
	maxNum, err := q.GetMaxQuoteNumber(ctx, companyID)
	if err != nil {
		return "", errors.Wrap(err, "getting max quote number")
	}
	return fmt.Sprintf("Q-%05d", maxNum+1), nil
}

func computeTotals(items []QuoteItemInput) domain.QuoteTotals {
	dItems := make([]domain.QuoteItemInput, len(items))
	for i, it := range items {
		dItems[i] = domain.QuoteItemInput{
			Quantity:    it.Quantity,
			UnitPrice:   it.UnitPrice,
			DiscountPct: it.DiscountPct,
			VATRatePct:  it.VATRatePct,
		}
	}
	return domain.CalculateTotals(dItems)
}

func insertItems(ctx context.Context, q *sqlcgen.Queries, quoteID uuid.UUID, in []QuoteItemInput, totals domain.QuoteTotals) ([]sqlcgen.QuoteItem, error) {
	out := make([]sqlcgen.QuoteItem, 0, len(in))
	for i, it := range in {
		calc := totals.Items[i]
		row, err := q.CreateQuoteItem(ctx, sqlcgen.CreateQuoteItemParams{
			QuoteID:      quoteID,
			ProductID:    pgconv.PtrUUID(it.ProductID),
			Description:  it.Description,
			Quantity:     pgconv.DecimalToNumericValue(it.Quantity),
			UnitPrice:    pgconv.DecimalToNumericValue(it.UnitPrice),
			DiscountPct:  pgconv.DecimalToNumericValue(it.DiscountPct),
			VatRatePct:   pgconv.DecimalToNumericValue(it.VATRatePct),
			LineSubtotal: pgconv.DecimalToNumericValue(calc.LineSubtotal),
			LineTax:      pgconv.DecimalToNumericValue(calc.LineTax),
			LineTotal:    pgconv.DecimalToNumericValue(calc.LineTotal),
			OrderPos:     it.OrderPos,
		})
		if err != nil {
			return nil, errors.Wrap(err, "creating quote item")
		}
		out = append(out, row)
	}
	return out, nil
}

func quoteFromRow(r sqlcgen.Quote, items []sqlcgen.QuoteItem) *domain.Quote {
	q := &domain.Quote{
		ID:            r.ID,
		CompanyID:     r.CompanyID,
		Number:        r.Number,
		ContactID:     r.ContactID,
		OpportunityID: pgconv.UUIDPtr(r.OpportunityID),
		UserID:        r.UserID,
		Date:          r.Date.Time,
		ValidUntil:    pgconv.TimePtr(r.ValidUntil),
		Currency:      r.Currency,
		ExchangeRate:  pgconv.NumericToDecimalZero(r.ExchangeRate),
		Status:        domain.QuoteStatus(r.Status),
		Version:       r.Version,
		ParentID:      pgconv.UUIDPtr(r.ParentID),
		Notes:         r.Notes,
		Subtotal:      pgconv.NumericToDecimalZero(r.Subtotal),
		TaxTotal:      pgconv.NumericToDecimalZero(r.TaxTotal),
		Total:         pgconv.NumericToDecimalZero(r.Total),
		CreatedAt:     r.CreatedAt.Time,
		UpdatedAt:     r.UpdatedAt.Time,
		DeletedAt:     pgconv.TimestamptzPtr(r.DeletedAt),
	}
	for _, it := range items {
		q.Items = append(q.Items, quoteItemFromRow(it))
	}
	return q
}

func quoteItemFromRow(r sqlcgen.QuoteItem) *domain.QuoteItem {
	return &domain.QuoteItem{
		ID:           r.ID,
		QuoteID:      r.QuoteID,
		ProductID:    pgconv.UUIDPtr(r.ProductID),
		Description:  r.Description,
		Quantity:     pgconv.NumericToDecimalZero(r.Quantity),
		UnitPrice:    pgconv.NumericToDecimalZero(r.UnitPrice),
		DiscountPct:  pgconv.NumericToDecimalZero(r.DiscountPct),
		VATRatePct:   pgconv.NumericToDecimalZero(r.VatRatePct),
		LineSubtotal: pgconv.NumericToDecimalZero(r.LineSubtotal),
		LineTax:      pgconv.NumericToDecimalZero(r.LineTax),
		LineTotal:    pgconv.NumericToDecimalZero(r.LineTotal),
		OrderPos:     r.OrderPos,
	}
}
