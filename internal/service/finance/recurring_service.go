package finance

import (
	"context"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/finance"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// RecurringService manages recurring payments and payment obligations
// (the payment calendar).
type RecurringService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewRecurringService constructs a RecurringService.
func NewRecurringService(db *pgxpool.Pool, logger *slog.Logger) *RecurringService {
	return &RecurringService{q: sqlcgen.New(db), db: db, logger: logger}
}

// RecurringInput is the input for a recurring payment.
type RecurringInput struct {
	SupplierID    *uuid.UUID
	Description   string
	Amount        *decimal.Decimal
	Currency      *string
	Frequency     string
	DueDay        *int16
	NextDueDate   *time.Time
	PaymentMethod *string
	CategoryID    *uuid.UUID
	Status        string
}

// CreateRecurring creates a recurring payment template.
func (s *RecurringService) CreateRecurring(ctx context.Context, companyID, callerID uuid.UUID, in RecurringInput) (*domain.RecurringPayment, error) {
	row, err := s.q.CreateRecurringPayment(ctx, sqlcgen.CreateRecurringPaymentParams{
		CompanyID:     companyID,
		SupplierID:    pgconv.PtrUUID(in.SupplierID),
		Description:   in.Description,
		Amount:        pgconv.DecimalToNumeric(in.Amount),
		Currency:      in.Currency,
		Frequency:     in.Frequency,
		DueDay:        in.DueDay,
		NextDueDate:   pgconv.PtrDate(in.NextDueDate),
		PaymentMethod: in.PaymentMethod,
		CategoryID:    pgconv.PtrUUID(in.CategoryID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating recurring payment")
	}
	rp := recurringFromRow(row)
	writeAudit(ctx, s.q, companyID, "recurring_payment", nil, rp, &callerID, row.ID, "create")
	return rp, nil
}

// GetRecurring returns a recurring payment by ID.
func (s *RecurringService) GetRecurring(ctx context.Context, companyID, id uuid.UUID) (*domain.RecurringPayment, error) {
	row, err := s.q.GetRecurringPaymentByID(ctx, sqlcgen.GetRecurringPaymentByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrRecurringNotFound)
	}
	return recurringFromRow(row), nil
}

// ListRecurring returns all recurring payments.
func (s *RecurringService) ListRecurring(ctx context.Context, companyID uuid.UUID) ([]*domain.RecurringPayment, error) {
	rows, err := s.q.ListRecurringPayments(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing recurring payments")
	}
	out := make([]*domain.RecurringPayment, 0, len(rows))
	for _, r := range rows {
		out = append(out, recurringFromRow(r))
	}
	return out, nil
}

// UpdateRecurring updates a recurring payment.
func (s *RecurringService) UpdateRecurring(ctx context.Context, companyID, callerID, id uuid.UUID, in RecurringInput) (*domain.RecurringPayment, error) {
	current, err := s.q.GetRecurringPaymentByID(ctx, sqlcgen.GetRecurringPaymentByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrRecurringNotFound)
	}
	status := in.Status
	if status == "" {
		status = current.Status
	}
	row, err := s.q.UpdateRecurringPayment(ctx, sqlcgen.UpdateRecurringPaymentParams{
		ID:            id,
		CompanyID:     companyID,
		SupplierID:    pgconv.PtrUUID(in.SupplierID),
		Description:   in.Description,
		Amount:        pgconv.DecimalToNumeric(in.Amount),
		Currency:      in.Currency,
		Frequency:     in.Frequency,
		DueDay:        in.DueDay,
		NextDueDate:   pgconv.PtrDate(in.NextDueDate),
		PaymentMethod: in.PaymentMethod,
		CategoryID:    pgconv.PtrUUID(in.CategoryID),
		Status:        status,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating recurring payment")
	}
	after := recurringFromRow(row)
	writeAudit(ctx, s.q, companyID, "recurring_payment", recurringFromRow(current), after, &callerID, id, "update")
	return after, nil
}

// DeleteRecurring soft-deletes a recurring payment.
func (s *RecurringService) DeleteRecurring(ctx context.Context, companyID, callerID, id uuid.UUID) error {
	current, err := s.q.GetRecurringPaymentByID(ctx, sqlcgen.GetRecurringPaymentByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrRecurringNotFound)
	}
	if err := s.q.SoftDeleteRecurringPayment(ctx, sqlcgen.SoftDeleteRecurringPaymentParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting recurring payment")
	}
	writeAudit(ctx, s.q, companyID, "recurring_payment", recurringFromRow(current), nil, &callerID, id, "delete")
	return nil
}

// GenerateDueObligations creates payment obligations for active recurring
// payments whose next_due_date is on or before asOf, then advances the
// next_due_date by the configured frequency. Returns the count created.
func (s *RecurringService) GenerateDueObligations(ctx context.Context, companyID uuid.UUID, asOf time.Time) (int, error) {
	due, err := s.q.ListActiveRecurringDue(ctx, sqlcgen.ListActiveRecurringDueParams{
		CompanyID:   companyID,
		NextDueDate: pgtype.Date{Time: asOf, Valid: true},
	})
	if err != nil {
		return 0, errors.Wrap(err, "listing due recurring payments")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	count := 0
	for _, r := range due {
		amount := pgconv.NumericToDecimalZero(r.Amount)
		currency := "ARS"
		if r.Currency != nil {
			currency = *r.Currency
		}
		if _, err := qtx.CreatePaymentObligation(ctx, sqlcgen.CreatePaymentObligationParams{
			CompanyID:   companyID,
			SourceType:  "recurring",
			SourceID:    pgtype.UUID{Bytes: r.ID, Valid: true},
			Description: r.Description,
			Amount:      pgconv.DecimalToNumericValue(amount),
			Currency:    &currency,
			DueDate:     r.NextDueDate,
		}); err != nil {
			return 0, errors.Wrap(err, "creating obligation")
		}
		next := domain.AdvanceNextDue(r.NextDueDate.Time, r.Frequency)
		if _, err := qtx.AdvanceRecurringNextDue(ctx, sqlcgen.AdvanceRecurringNextDueParams{
			ID: r.ID, CompanyID: companyID, NextDueDate: pgtype.Date{Time: next, Valid: true},
		}); err != nil {
			return 0, errors.Wrap(err, "advancing next due date")
		}
		count++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, errors.Wrap(err, "commit tx")
	}
	return count, nil
}

// ─── Payment obligations (calendar) ─────────────────────────────────────────────

// ObligationFilter holds list filters.
type ObligationFilter struct {
	Status     *string
	SourceType *string
	FromDate   *time.Time
	ToDate     *time.Time
}

// ListObligations returns payment obligations matching filters.
func (s *RecurringService) ListObligations(ctx context.Context, companyID uuid.UUID, f ObligationFilter) ([]*domain.PaymentObligation, error) {
	rows, err := s.q.ListPaymentObligations(ctx, sqlcgen.ListPaymentObligationsParams{
		CompanyID:  companyID,
		Status:     f.Status,
		SourceType: f.SourceType,
		FromDate:   pgconv.PtrDate(f.FromDate),
		ToDate:     pgconv.PtrDate(f.ToDate),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing payment obligations")
	}
	out := make([]*domain.PaymentObligation, 0, len(rows))
	for _, r := range rows {
		out = append(out, obligationFromRow(r))
	}
	return out, nil
}

// MarkObligationPaid marks an obligation as paid, optionally linking a payment order.
func (s *RecurringService) MarkObligationPaid(ctx context.Context, companyID, callerID, id uuid.UUID, paymentOrderID *uuid.UUID) (*domain.PaymentObligation, error) {
	current, err := s.q.GetPaymentObligationByID(ctx, sqlcgen.GetPaymentObligationByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrObligationNotFound)
	}
	row, err := s.q.MarkObligationPaid(ctx, sqlcgen.MarkObligationPaidParams{
		ID: id, CompanyID: companyID, PaymentOrderID: pgconv.PtrUUID(paymentOrderID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "marking obligation paid")
	}
	after := obligationFromRow(row)
	writeAudit(ctx, s.q, companyID, "payment_obligation", obligationFromRow(current), after, &callerID, id, "update")
	return after, nil
}
