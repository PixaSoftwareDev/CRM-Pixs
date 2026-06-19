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

// ExpenseService manages business expenses and their approval/reimbursement.
type ExpenseService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewExpenseService constructs an ExpenseService.
func NewExpenseService(db *pgxpool.Pool, logger *slog.Logger) *ExpenseService {
	return &ExpenseService{q: sqlcgen.New(db), db: db, logger: logger}
}

// CreateExpenseInput is the input for recording an expense. Exactly one of the
// PaidBy* fields must be set.
type CreateExpenseInput struct {
	Date         time.Time
	CategoryID   uuid.UUID
	Description  string
	Amount       decimal.Decimal
	Currency     string
	PaidByUserID *uuid.UUID
	PaidByCashID *uuid.UUID
	PaidByBankID *uuid.UUID
	ProjectID    *uuid.UUID
	Status       string
}

// Create records an expense. When paid by a user, it sets the reimbursement
// status to pending and generates a reimbursement payment obligation.
func (s *ExpenseService) Create(ctx context.Context, companyID, callerID uuid.UUID, in CreateExpenseInput) (*domain.Expense, error) {
	if in.Amount.Sign() <= 0 {
		return nil, errors.WithStack(domain.ErrInvalidAmount)
	}
	status := in.Status
	if status == "" {
		status = string(domain.ExpenseStatusApproved)
	}
	if _, err := domain.ParseExpenseStatus(status); err != nil {
		return nil, errors.WithStack(err)
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}
	reimb := "na"
	if in.PaidByUserID != nil {
		reimb = "pending"
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	row, err := qtx.CreateExpense(ctx, sqlcgen.CreateExpenseParams{
		CompanyID:           companyID,
		Date:                pgtype.Date{Time: in.Date, Valid: true},
		CategoryID:          in.CategoryID,
		Description:         in.Description,
		Amount:              pgconv.DecimalToNumericValue(in.Amount),
		Currency:            &currency,
		PaidByUserID:        pgconv.PtrUUID(in.PaidByUserID),
		PaidByCashID:        pgconv.PtrUUID(in.PaidByCashID),
		PaidByBankID:        pgconv.PtrUUID(in.PaidByBankID),
		FileKey:             nil,
		ProjectID:           pgconv.PtrUUID(in.ProjectID),
		Status:              status,
		ReimbursementStatus: reimb,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating expense")
	}

	if in.PaidByUserID != nil {
		if _, err := qtx.CreatePaymentObligation(ctx, sqlcgen.CreatePaymentObligationParams{
			CompanyID:   companyID,
			SourceType:  "reimbursement",
			SourceID:    pgtype.UUID{Bytes: row.ID, Valid: true},
			Description: "Reembolso de gasto: " + in.Description,
			Amount:      pgconv.DecimalToNumericValue(in.Amount),
			Currency:    &currency,
			DueDate:     pgtype.Date{Time: in.Date, Valid: true},
		}); err != nil {
			return nil, errors.Wrap(err, "creating reimbursement obligation")
		}
	}

	// Auto-register a cash movement when paid from a cash register so the balance updates.
	if in.PaidByCashID != nil && status == string(domain.ExpenseStatusApproved) {
		if _, err := qtx.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
			CompanyID:      companyID,
			CashRegisterID: *in.PaidByCashID,
			SessionID:      pgtype.UUID{},
			Type:           "expense",
			Amount:         pgconv.DecimalToNumericValue(in.Amount),
			Currency:       currency,
			Description:    &in.Description,
			ReferenceType:  strPtr("expense"),
			ReferenceID:    pgtype.UUID{Bytes: row.ID, Valid: true},
			CreatedBy:      callerID,
		}); err != nil {
			return nil, errors.Wrap(err, "creating cash movement for expense")
		}
	}

	exp := expenseFromRow(row)
	writeAudit(ctx, qtx, companyID, "expense", nil, exp, &callerID, row.ID, "create")
	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return exp, nil
}

// Get returns an expense by ID.
func (s *ExpenseService) Get(ctx context.Context, companyID, id uuid.UUID) (*domain.Expense, error) {
	row, err := s.q.GetExpenseByID(ctx, sqlcgen.GetExpenseByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrExpenseNotFound)
	}
	return expenseFromRow(row), nil
}

// ExpenseFilter holds list filters.
type ExpenseFilter struct {
	CategoryID *uuid.UUID
	Status     *string
	FromDate   *time.Time
	ToDate     *time.Time
}

// List returns expenses matching filters.
func (s *ExpenseService) List(ctx context.Context, companyID uuid.UUID, f ExpenseFilter) ([]*domain.Expense, error) {
	rows, err := s.q.ListExpenses(ctx, sqlcgen.ListExpensesParams{
		CompanyID:  companyID,
		CategoryID: pgconv.PtrUUID(f.CategoryID),
		Status:     f.Status,
		FromDate:   pgconv.PtrDate(f.FromDate),
		ToDate:     pgconv.PtrDate(f.ToDate),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing expenses")
	}
	out := make([]*domain.Expense, 0, len(rows))
	for _, r := range rows {
		out = append(out, expenseFromRow(r))
	}
	return out, nil
}

// Approve marks an expense as approved.
func (s *ExpenseService) Approve(ctx context.Context, companyID, callerID, id uuid.UUID) (*domain.Expense, error) {
	return s.setStatus(ctx, companyID, callerID, id, domain.ExpenseStatusApproved)
}

// Reject marks an expense as rejected.
func (s *ExpenseService) Reject(ctx context.Context, companyID, callerID, id uuid.UUID) (*domain.Expense, error) {
	return s.setStatus(ctx, companyID, callerID, id, domain.ExpenseStatusRejected)
}

func (s *ExpenseService) setStatus(ctx context.Context, companyID, callerID, id uuid.UUID, status domain.ExpenseStatus) (*domain.Expense, error) {
	current, err := s.q.GetExpenseByID(ctx, sqlcgen.GetExpenseByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrExpenseNotFound)
	}
	row, err := s.q.UpdateExpenseStatus(ctx, sqlcgen.UpdateExpenseStatusParams{
		ID:                  id,
		CompanyID:           companyID,
		Status:              string(status),
		ApproverID:          pgtype.UUID{Bytes: callerID, Valid: true},
		ApprovedAt:          pgtype.Timestamptz{Time: time.Now(), Valid: true},
		ReimbursementStatus: current.ReimbursementStatus,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating expense status")
	}
	after := expenseFromRow(row)
	writeAudit(ctx, s.q, companyID, "expense", expenseFromRow(current), after, &callerID, id, "update")
	return after, nil
}

// Delete soft-deletes an expense.
func (s *ExpenseService) Delete(ctx context.Context, companyID, callerID, id uuid.UUID) error {
	current, err := s.q.GetExpenseByID(ctx, sqlcgen.GetExpenseByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrExpenseNotFound)
	}
	if err := s.q.SoftDeleteExpense(ctx, sqlcgen.SoftDeleteExpenseParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting expense")
	}
	writeAudit(ctx, s.q, companyID, "expense", expenseFromRow(current), nil, &callerID, id, "delete")
	return nil
}
