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

// CashService manages cash registers, sessions (arqueos) and movements.
type CashService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewCashService constructs a CashService.
func NewCashService(db *pgxpool.Pool, logger *slog.Logger) *CashService {
	return &CashService{q: sqlcgen.New(db), db: db, logger: logger}
}

// CreateRegisterInput is the input for creating a cash register.
type CreateRegisterInput struct {
	Name          string
	Currency      string
	ResponsibleID *uuid.UUID
}

// CreateRegister creates a cash register.
func (s *CashService) CreateRegister(ctx context.Context, companyID, callerID uuid.UUID, in CreateRegisterInput) (*domain.CashRegister, error) {
	row, err := s.q.CreateCashRegister(ctx, sqlcgen.CreateCashRegisterParams{
		CompanyID:     companyID,
		Name:          in.Name,
		Currency:      in.Currency,
		ResponsibleID: pgconv.PtrUUID(in.ResponsibleID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating cash register")
	}
	cr := cashRegisterFromRow(row)
	writeAudit(ctx, s.q, companyID, "cash_register", nil, cr, &callerID, row.ID, "create")
	return cr, nil
}

// GetRegister returns a cash register by ID.
func (s *CashService) GetRegister(ctx context.Context, companyID, id uuid.UUID) (*domain.CashRegister, error) {
	row, err := s.q.GetCashRegisterByID(ctx, sqlcgen.GetCashRegisterByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrCashRegisterNotFound)
	}
	return cashRegisterFromRow(row), nil
}

// ListRegisters returns all active cash registers.
func (s *CashService) ListRegisters(ctx context.Context, companyID uuid.UUID) ([]*domain.CashRegister, error) {
	rows, err := s.q.ListCashRegisters(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing cash registers")
	}
	out := make([]*domain.CashRegister, 0, len(rows))
	for _, r := range rows {
		out = append(out, cashRegisterFromRow(r))
	}
	return out, nil
}

// UpdateRegister updates a cash register.
func (s *CashService) UpdateRegister(ctx context.Context, companyID, callerID, id uuid.UUID, in CreateRegisterInput, isActive bool) (*domain.CashRegister, error) {
	current, err := s.q.GetCashRegisterByID(ctx, sqlcgen.GetCashRegisterByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrCashRegisterNotFound)
	}
	row, err := s.q.UpdateCashRegister(ctx, sqlcgen.UpdateCashRegisterParams{
		ID:            id,
		CompanyID:     companyID,
		Name:          in.Name,
		Currency:      in.Currency,
		ResponsibleID: pgconv.PtrUUID(in.ResponsibleID),
		IsActive:      isActive,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating cash register")
	}
	after := cashRegisterFromRow(row)
	writeAudit(ctx, s.q, companyID, "cash_register", cashRegisterFromRow(current), after, &callerID, id, "update")
	return after, nil
}

// GetBalance returns the computed balance of a cash register.
func (s *CashService) GetBalance(ctx context.Context, cashRegisterID uuid.UUID) (decimal.Decimal, error) {
	bal, err := s.q.GetCashBalance(ctx, cashRegisterID)
	if err != nil {
		return decimal.Zero, errors.Wrap(err, "getting cash balance")
	}
	return pgconv.NumericToDecimalZero(bal), nil
}

// OpenSession opens a cash session with the given opening balance.
func (s *CashService) OpenSession(ctx context.Context, companyID, callerID, cashRegisterID uuid.UUID, opening decimal.Decimal) (*domain.CashSession, error) {
	if _, err := s.q.GetCashRegisterByID(ctx, sqlcgen.GetCashRegisterByIDParams{ID: cashRegisterID, CompanyID: companyID}); err != nil {
		return nil, errors.WithStack(domain.ErrCashRegisterNotFound)
	}
	if _, err := s.q.GetOpenSession(ctx, cashRegisterID); err == nil {
		return nil, errors.WithStack(domain.ErrSessionAlreadyOpen)
	}
	row, err := s.q.OpenCashSession(ctx, sqlcgen.OpenCashSessionParams{
		CashRegisterID: cashRegisterID,
		OpenedBy:       callerID,
		OpeningBalance: pgconv.DecimalToNumericValue(opening),
	})
	if err != nil {
		return nil, errors.Wrap(err, "opening session")
	}
	sess := cashSessionFromRow(row)
	writeAudit(ctx, s.q, companyID, "cash_session", nil, sess, &callerID, row.ID, "open")
	return sess, nil
}

// CloseSession closes the open session, computing the calculated balance from
// all movements and the difference against the declared balance.
func (s *CashService) CloseSession(ctx context.Context, companyID, callerID, cashRegisterID uuid.UUID, declared decimal.Decimal) (*domain.CashSession, error) {
	session, err := s.q.GetOpenSession(ctx, cashRegisterID)
	if err != nil {
		return nil, errors.WithStack(domain.ErrNoOpenSession)
	}
	balance, err := s.q.GetCashBalance(ctx, cashRegisterID)
	if err != nil {
		return nil, errors.Wrap(err, "computing balance")
	}
	calculated := pgconv.NumericToDecimalZero(session.OpeningBalance).Add(pgconv.NumericToDecimalZero(balance))
	difference := declared.Sub(calculated)

	row, err := s.q.CloseSession(ctx, sqlcgen.CloseSessionParams{
		ID:                       session.ID,
		ClosedBy:                 pgtype.UUID{Bytes: callerID, Valid: true},
		DeclaredClosingBalance:   pgconv.DecimalToNumericValue(declared),
		CalculatedClosingBalance: pgconv.DecimalToNumericValue(calculated),
		Difference:               pgconv.DecimalToNumericValue(difference),
	})
	if err != nil {
		return nil, errors.Wrap(err, "closing session")
	}
	after := cashSessionFromRow(row)
	writeAudit(ctx, s.q, companyID, "cash_session", cashSessionFromRow(session), after, &callerID, session.ID, "close")
	return after, nil
}

// CreateMovementInput is the input for a manual cash movement.
type CreateMovementInput struct {
	Type        string
	Amount      decimal.Decimal
	Currency    string
	Description *string
}

// CreateMovement records a manual income/expense in a cash register.
func (s *CashService) CreateMovement(ctx context.Context, companyID, callerID, cashRegisterID uuid.UUID, in CreateMovementInput) (*domain.CashMovement, error) {
	if in.Amount.Sign() <= 0 {
		return nil, errors.WithStack(domain.ErrInvalidAmount)
	}
	if _, err := s.q.GetCashRegisterByID(ctx, sqlcgen.GetCashRegisterByIDParams{ID: cashRegisterID, CompanyID: companyID}); err != nil {
		return nil, errors.WithStack(domain.ErrCashRegisterNotFound)
	}
	var sessID pgtype.UUID
	if session, err := s.q.GetOpenSession(ctx, cashRegisterID); err == nil {
		sessID = pgtype.UUID{Bytes: session.ID, Valid: true}
	}
	row, err := s.q.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
		CompanyID:      companyID,
		CashRegisterID: cashRegisterID,
		SessionID:      sessID,
		Type:           in.Type,
		Amount:         pgconv.DecimalToNumericValue(in.Amount),
		Currency:       in.Currency,
		Description:    in.Description,
		CreatedBy:      callerID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating cash movement")
	}
	mv := cashMovementFromRow(row)
	writeAudit(ctx, s.q, companyID, "cash_movement", nil, mv, &callerID, row.ID, "create")
	return mv, nil
}

// ListMovements returns cash movements for a register within an optional range.
func (s *CashService) ListMovements(ctx context.Context, cashRegisterID uuid.UUID, from, to *time.Time) ([]*domain.CashMovement, error) {
	rows, err := s.q.ListCashMovements(ctx, sqlcgen.ListCashMovementsParams{
		CashRegisterID: cashRegisterID,
		FromDate:       pgconv.PtrTimestamptz(from),
		ToDate:         pgconv.PtrTimestamptz(to),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing cash movements")
	}
	out := make([]*domain.CashMovement, 0, len(rows))
	for _, r := range rows {
		out = append(out, cashMovementFromRow(r))
	}
	return out, nil
}

// TransferInput moves funds out of a cash register into another cash register
// or a bank account, atomically.
type TransferInput struct {
	FromCashID  uuid.UUID
	ToCashID    *uuid.UUID
	ToBankID    *uuid.UUID
	Amount      decimal.Decimal
	Currency    string
	Description *string
}

// Transfer moves money from one cash register to another cash register or to a
// bank account in a single transaction.
func (s *CashService) Transfer(ctx context.Context, companyID, callerID uuid.UUID, in TransferInput) error {
	if in.Amount.Sign() <= 0 {
		return errors.WithStack(domain.ErrInvalidAmount)
	}
	if in.ToCashID == nil && in.ToBankID == nil {
		return errors.New("debe indicar caja o banco destino")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	refType := "transfer"
	// Debit source cash register.
	if _, err := qtx.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
		CompanyID:      companyID,
		CashRegisterID: in.FromCashID,
		Type:           "transfer_out",
		Amount:         pgconv.DecimalToNumericValue(in.Amount),
		Currency:       in.Currency,
		Description:    in.Description,
		ReferenceType:  &refType,
		CreatedBy:      callerID,
	}); err != nil {
		return errors.Wrap(err, "debiting source cash")
	}

	switch {
	case in.ToCashID != nil:
		if _, err := qtx.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
			CompanyID:      companyID,
			CashRegisterID: *in.ToCashID,
			Type:           "transfer_in",
			Amount:         pgconv.DecimalToNumericValue(in.Amount),
			Currency:       in.Currency,
			Description:    in.Description,
			ReferenceType:  &refType,
			CreatedBy:      callerID,
		}); err != nil {
			return errors.Wrap(err, "crediting destination cash")
		}
	case in.ToBankID != nil:
		acct, aErr := qtx.GetBankAccountFinanceByID(ctx, sqlcgen.GetBankAccountFinanceByIDParams{ID: *in.ToBankID, CompanyID: companyID})
		if aErr != nil {
			return errors.WithStack(domain.ErrBankAccountNotFound)
		}
		if _, err := qtx.CreateBankMovement(ctx, sqlcgen.CreateBankMovementParams{
			CompanyID:     companyID,
			BankAccountID: *in.ToBankID,
			Type:          "transfer_in",
			Amount:        pgconv.DecimalToNumericValue(in.Amount),
			Currency:      in.Currency,
			Description:   in.Description,
			ReferenceType: &refType,
			ValueDate:     pgtype.Date{Time: time.Now(), Valid: true},
			CreatedBy:     callerID,
		}); err != nil {
			return errors.Wrap(err, "crediting destination bank")
		}
		newBal := pgconv.NumericToDecimalZero(acct.BookBalance).Add(in.Amount)
		if _, err := qtx.UpdateBankAccountBalance(ctx, sqlcgen.UpdateBankAccountBalanceParams{
			ID: *in.ToBankID, CompanyID: companyID, BookBalance: pgconv.DecimalToNumericValue(newBal),
		}); err != nil {
			return errors.Wrap(err, "updating destination bank balance")
		}
	}

	writeAudit(ctx, qtx, companyID, "cash_transfer", nil, in, &callerID, in.FromCashID, "transfer")
	return tx.Commit(ctx)
}
