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

// BankService manages the company's own bank accounts and their movements.
type BankService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewBankService constructs a BankService.
func NewBankService(db *pgxpool.Pool, logger *slog.Logger) *BankService {
	return &BankService{q: sqlcgen.New(db), db: db, logger: logger}
}

// CreateBankInput is the input for creating a bank account.
type CreateBankInput struct {
	BankName       string
	AccountNumber  *string
	CBU            *string
	Alias          *string
	Currency       string
	AccountHolder  *string
	InitialBalance decimal.Decimal
}

// CreateAccount creates a company bank account.
func (s *BankService) CreateAccount(ctx context.Context, companyID, callerID uuid.UUID, in CreateBankInput) (*domain.BankAccount, error) {
	row, err := s.q.CreateBankAccountFinance(ctx, sqlcgen.CreateBankAccountFinanceParams{
		CompanyID:     companyID,
		BankName:      in.BankName,
		AccountNumber: in.AccountNumber,
		Cbu:           in.CBU,
		Alias:         in.Alias,
		Currency:      in.Currency,
		AccountHolder: in.AccountHolder,
		BookBalance:   pgconv.DecimalToNumericValue(in.InitialBalance),
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating bank account")
	}
	ba := bankAccountFromRow(row)
	writeAudit(ctx, s.q, companyID, "bank_account", nil, ba, &callerID, row.ID, "create")
	return ba, nil
}

// GetAccount returns a bank account by ID.
func (s *BankService) GetAccount(ctx context.Context, companyID, id uuid.UUID) (*domain.BankAccount, error) {
	row, err := s.q.GetBankAccountFinanceByID(ctx, sqlcgen.GetBankAccountFinanceByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrBankAccountNotFound)
	}
	return bankAccountFromRow(row), nil
}

// ListAccounts returns all bank accounts.
func (s *BankService) ListAccounts(ctx context.Context, companyID uuid.UUID) ([]*domain.BankAccount, error) {
	rows, err := s.q.ListBankAccountsFinance(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing bank accounts")
	}
	out := make([]*domain.BankAccount, 0, len(rows))
	for _, r := range rows {
		out = append(out, bankAccountFromRow(r))
	}
	return out, nil
}

// UpdateAccount updates a bank account's metadata.
func (s *BankService) UpdateAccount(ctx context.Context, companyID, callerID, id uuid.UUID, in CreateBankInput, isActive bool) (*domain.BankAccount, error) {
	current, err := s.q.GetBankAccountFinanceByID(ctx, sqlcgen.GetBankAccountFinanceByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrBankAccountNotFound)
	}
	row, err := s.q.UpdateBankAccountFinance(ctx, sqlcgen.UpdateBankAccountFinanceParams{
		ID:            id,
		CompanyID:     companyID,
		BankName:      in.BankName,
		AccountNumber: in.AccountNumber,
		Cbu:           in.CBU,
		Alias:         in.Alias,
		Currency:      in.Currency,
		AccountHolder: in.AccountHolder,
		IsActive:      isActive,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating bank account")
	}
	after := bankAccountFromRow(row)
	writeAudit(ctx, s.q, companyID, "bank_account", bankAccountFromRow(current), after, &callerID, id, "update")
	return after, nil
}

// CreateBankMovementInput is the input for a manual bank movement.
type CreateBankMovementInput struct {
	Type        string
	Amount      decimal.Decimal
	Currency    string
	Description *string
	ValueDate   time.Time
}

// CreateMovement records a manual bank movement and updates the book balance.
func (s *BankService) CreateMovement(ctx context.Context, companyID, callerID, bankAccountID uuid.UUID, in CreateBankMovementInput) (*domain.BankMovement, error) {
	if in.Amount.Sign() <= 0 {
		return nil, errors.WithStack(domain.ErrInvalidAmount)
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	acct, err := qtx.GetBankAccountFinanceByID(ctx, sqlcgen.GetBankAccountFinanceByIDParams{ID: bankAccountID, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrBankAccountNotFound)
	}
	if in.ValueDate.IsZero() {
		in.ValueDate = time.Now()
	}
	row, err := qtx.CreateBankMovement(ctx, sqlcgen.CreateBankMovementParams{
		CompanyID:     companyID,
		BankAccountID: bankAccountID,
		Type:          in.Type,
		Amount:        pgconv.DecimalToNumericValue(in.Amount),
		Currency:      in.Currency,
		Description:   in.Description,
		ValueDate:     pgtype.Date{Time: in.ValueDate, Valid: true},
		CreatedBy:     callerID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating bank movement")
	}

	delta := in.Amount
	if in.Type == "debit" || in.Type == "transfer_out" || in.Type == "fee" {
		delta = delta.Neg()
	}
	newBal := pgconv.NumericToDecimalZero(acct.BookBalance).Add(delta)
	if _, err := qtx.UpdateBankAccountBalance(ctx, sqlcgen.UpdateBankAccountBalanceParams{
		ID: bankAccountID, CompanyID: companyID, BookBalance: pgconv.DecimalToNumericValue(newBal),
	}); err != nil {
		return nil, errors.Wrap(err, "updating book balance")
	}

	mv := bankMovementFromRow(row)
	writeAudit(ctx, qtx, companyID, "bank_movement", nil, mv, &callerID, row.ID, "create")
	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return mv, nil
}

// ListMovements returns bank movements within an optional date range.
func (s *BankService) ListMovements(ctx context.Context, bankAccountID uuid.UUID, from, to *time.Time) ([]*domain.BankMovement, error) {
	rows, err := s.q.ListBankMovements(ctx, sqlcgen.ListBankMovementsParams{
		BankAccountID: bankAccountID,
		FromDate:      pgconv.PtrDate(from),
		ToDate:        pgconv.PtrDate(to),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing bank movements")
	}
	out := make([]*domain.BankMovement, 0, len(rows))
	for _, r := range rows {
		out = append(out, bankMovementFromRow(r))
	}
	return out, nil
}

// Reconcile marks bank movements as reconciled.
func (s *BankService) Reconcile(ctx context.Context, companyID, callerID uuid.UUID, movementIDs []uuid.UUID) ([]*domain.BankMovement, error) {
	out := make([]*domain.BankMovement, 0, len(movementIDs))
	for _, id := range movementIDs {
		row, err := s.q.ReconcileBankMovement(ctx, sqlcgen.ReconcileBankMovementParams{ID: id, CompanyID: companyID})
		if err != nil {
			return nil, errors.Wrap(err, "reconciling movement")
		}
		out = append(out, bankMovementFromRow(row))
	}
	writeAudit(ctx, s.q, companyID, "bank_reconcile", nil, movementIDs, &callerID, companyID, "reconcile")
	return out, nil
}
