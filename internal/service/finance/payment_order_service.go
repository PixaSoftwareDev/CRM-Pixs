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

// PaymentOrderService manages supplier payments (órdenes de pago).
type PaymentOrderService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewPaymentOrderService constructs a PaymentOrderService.
func NewPaymentOrderService(db *pgxpool.Pool, logger *slog.Logger) *PaymentOrderService {
	return &PaymentOrderService{q: sqlcgen.New(db), db: db, logger: logger}
}

// PaymentOrderApplicationInput applies an amount to a received invoice.
type PaymentOrderApplicationInput struct {
	InvoiceReceivedID uuid.UUID
	Amount            decimal.Decimal
}

// CreatePaymentOrderInput is the input for creating a payment order.
type CreatePaymentOrderInput struct {
	IdempotencyKey uuid.UUID
	SupplierID     uuid.UUID
	Date           time.Time
	Currency       string
	ExchangeRate   decimal.Decimal
	Notes          *string
	PaymentMethods []PaymentMethodInput
	Applications   []PaymentOrderApplicationInput
}

// Create records a payment order, applies it to received invoices and posts
// the corresponding outflows, all within a single transaction.
func (s *PaymentOrderService) Create(ctx context.Context, companyID, callerID uuid.UUID, in CreatePaymentOrderInput) (*domain.PaymentOrder, bool, error) {
	if len(in.PaymentMethods) == 0 {
		return nil, false, errors.WithStack(domain.ErrNoPaymentMethods)
	}

	if existing, err := s.q.GetPaymentOrderByIdempotencyKey(ctx, sqlcgen.GetPaymentOrderByIdempotencyKeyParams{
		CompanyID: companyID, IdempotencyKey: in.IdempotencyKey,
	}); err == nil {
		po, hErr := s.hydrate(ctx, paymentOrderFromRow(existing))
		return po, true, hErr
	}

	total := decimal.Zero
	for _, m := range in.PaymentMethods {
		if m.Amount.Sign() <= 0 {
			return nil, false, errors.WithStack(domain.ErrInvalidAmount)
		}
		total = total.Add(m.Amount)
	}
	rate := in.ExchangeRate
	if rate.IsZero() {
		rate = decimal.NewFromInt(1)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, false, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	// Validate applications against locked received-invoice balances.
	type lockedRcv struct {
		row     sqlcgen.InvoicesReceived
		newPaid decimal.Decimal
	}
	locked := make(map[uuid.UUID]*lockedRcv)
	appliedTotal := decimal.Zero
	for _, a := range in.Applications {
		if a.Amount.Sign() <= 0 {
			return nil, false, errors.WithStack(domain.ErrInvalidAmount)
		}
		lr, ok := locked[a.InvoiceReceivedID]
		if !ok {
			row, gErr := qtx.GetInvoiceReceivedForUpdate(ctx, sqlcgen.GetInvoiceReceivedForUpdateParams{ID: a.InvoiceReceivedID, CompanyID: companyID})
			if gErr != nil {
				return nil, false, errors.WithStack(domain.ErrInvoiceReceivedNotFound)
			}
			lr = &lockedRcv{row: row, newPaid: pgconv.NumericToDecimalZero(row.PaidAmount)}
			locked[a.InvoiceReceivedID] = lr
		}
		invTotal := pgconv.NumericToDecimalZero(lr.row.TotalAmount)
		remaining := invTotal.Sub(lr.newPaid)
		if a.Amount.GreaterThan(remaining) {
			return nil, false, errors.WithStack(domain.ErrApplicationExceedsBalance)
		}
		lr.newPaid = lr.newPaid.Add(a.Amount)
		appliedTotal = appliedTotal.Add(a.Amount)
	}
	if appliedTotal.GreaterThan(total) {
		return nil, false, errors.WithStack(domain.ErrApplicationExceedsReceipt)
	}

	number, err := qtx.NextSequenceNumber(ctx, sqlcgen.NextSequenceNumberParams{
		CompanyID: companyID, DocumentType: "payment_order", SalePoint: 1,
	})
	if err != nil {
		return nil, false, errors.Wrap(err, "allocating payment order number")
	}

	row, err := qtx.CreatePaymentOrder(ctx, sqlcgen.CreatePaymentOrderParams{
		CompanyID:      companyID,
		IdempotencyKey: in.IdempotencyKey,
		SupplierID:     in.SupplierID,
		Date:           pgtype.Date{Time: in.Date, Valid: true},
		Number:         number,
		Currency:       in.Currency,
		ExchangeRate:   pgconv.DecimalToNumericValue(rate),
		TotalAmount:    pgconv.DecimalToNumericValue(total),
		Notes:          in.Notes,
		CreatedBy:      callerID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			existing, gErr := s.q.GetPaymentOrderByIdempotencyKey(ctx, sqlcgen.GetPaymentOrderByIdempotencyKeyParams{
				CompanyID: companyID, IdempotencyKey: in.IdempotencyKey,
			})
			if gErr == nil {
				po, hErr := s.hydrate(ctx, paymentOrderFromRow(existing))
				return po, true, hErr
			}
		}
		return nil, false, errors.Wrap(err, "creating payment order")
	}

	for _, a := range in.Applications {
		if _, err := qtx.CreatePaymentOrderApplication(ctx, sqlcgen.CreatePaymentOrderApplicationParams{
			PaymentOrderID:    row.ID,
			InvoiceReceivedID: a.InvoiceReceivedID,
			Amount:            pgconv.DecimalToNumericValue(a.Amount),
		}); err != nil {
			return nil, false, errors.Wrap(err, "creating payment order application")
		}
	}
	for id, lr := range locked {
		invTotal := pgconv.NumericToDecimalZero(lr.row.TotalAmount)
		if _, err := qtx.UpdateInvoiceReceivedPaidAmount(ctx, sqlcgen.UpdateInvoiceReceivedPaidAmountParams{
			ID:         id,
			CompanyID:  companyID,
			PaidAmount: pgconv.DecimalToNumericValue(lr.newPaid),
			Status:     domain.NextReceivedStatus(lr.newPaid, invTotal),
		}); err != nil {
			return nil, false, errors.Wrap(err, "updating received invoice paid amount")
		}
	}

	for _, m := range in.PaymentMethods {
		if _, err := qtx.CreatePaymentOrderMethod(ctx, sqlcgen.CreatePaymentOrderMethodParams{
			PaymentOrderID: row.ID,
			MethodType:     m.MethodType,
			CashRegisterID: pgconv.PtrUUID(m.CashRegisterID),
			BankAccountID:  pgconv.PtrUUID(m.BankAccountID),
			Amount:         pgconv.DecimalToNumericValue(m.Amount),
			Currency:       methodCurrency(m.Currency, in.Currency),
			CheckNumber:    m.CheckNumber,
			CheckDate:      pgconv.PtrDate(m.CheckDate),
		}); err != nil {
			return nil, false, errors.Wrap(err, "creating payment order method")
		}
		if err := s.postOutflow(ctx, qtx, companyID, callerID, m, in.Currency, row.ID); err != nil {
			return nil, false, err
		}
	}

	// Increase the supplier's payable balance reduction (we paid them).
	if err := qtx.UpsertFinanceContactBalance(ctx, sqlcgen.UpsertFinanceContactBalanceParams{
		ContactID: in.SupplierID,
		Currency:  in.Currency,
		Balance:   pgconv.DecimalToNumericValue(total),
	}); err != nil {
		return nil, false, errors.Wrap(err, "updating supplier balance")
	}

	po := paymentOrderFromRow(row)
	writeAudit(ctx, qtx, companyID, "payment_order", nil, po, &callerID, row.ID, "create")
	if err := tx.Commit(ctx); err != nil {
		return nil, false, errors.Wrap(err, "commit tx")
	}
	r, hErr := s.hydrate(ctx, po)
	return r, false, hErr
}

func (s *PaymentOrderService) postOutflow(ctx context.Context, qtx *sqlcgen.Queries, companyID, callerID uuid.UUID, m PaymentMethodInput, currency string, poID uuid.UUID) error {
	refType := "payment_order"
	switch m.MethodType {
	case "cash":
		if m.CashRegisterID == nil {
			return errors.WithStack(domain.ErrCashRegisterNotFound)
		}
		var sessID pgtype.UUID
		if session, err := qtx.GetOpenSession(ctx, *m.CashRegisterID); err == nil {
			sessID = pgtype.UUID{Bytes: session.ID, Valid: true}
		}
		if _, err := qtx.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
			CompanyID:      companyID,
			CashRegisterID: *m.CashRegisterID,
			SessionID:      sessID,
			Type:           "expense",
			Amount:         pgconv.DecimalToNumericValue(m.Amount),
			Currency:       currency,
			ReferenceType:  &refType,
			ReferenceID:    pgtype.UUID{Bytes: poID, Valid: true},
			CreatedBy:      callerID,
		}); err != nil {
			return errors.Wrap(err, "posting cash outflow")
		}
	case "bank_transfer":
		if m.BankAccountID == nil {
			return errors.WithStack(domain.ErrBankAccountNotFound)
		}
		acct, aErr := qtx.GetBankAccountFinanceByID(ctx, sqlcgen.GetBankAccountFinanceByIDParams{ID: *m.BankAccountID, CompanyID: companyID})
		if aErr != nil {
			return errors.WithStack(domain.ErrBankAccountNotFound)
		}
		if _, err := qtx.CreateBankMovement(ctx, sqlcgen.CreateBankMovementParams{
			CompanyID:     companyID,
			BankAccountID: *m.BankAccountID,
			Type:          "debit",
			Amount:        pgconv.DecimalToNumericValue(m.Amount),
			Currency:      currency,
			ReferenceType: &refType,
			ReferenceID:   pgtype.UUID{Bytes: poID, Valid: true},
			ValueDate:     pgtype.Date{Time: time.Now(), Valid: true},
			CreatedBy:     callerID,
		}); err != nil {
			return errors.Wrap(err, "posting bank outflow")
		}
		newBal := pgconv.NumericToDecimalZero(acct.BookBalance).Sub(m.Amount)
		if _, err := qtx.UpdateBankAccountBalance(ctx, sqlcgen.UpdateBankAccountBalanceParams{
			ID: *m.BankAccountID, CompanyID: companyID, BookBalance: pgconv.DecimalToNumericValue(newBal),
		}); err != nil {
			return errors.Wrap(err, "updating bank balance")
		}
	}
	return nil
}

// Get returns a payment order with methods and applications.
func (s *PaymentOrderService) Get(ctx context.Context, companyID, id uuid.UUID) (*domain.PaymentOrder, error) {
	row, err := s.q.GetPaymentOrderByID(ctx, sqlcgen.GetPaymentOrderByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrPaymentOrderNotFound)
	}
	return s.hydrate(ctx, paymentOrderFromRow(row))
}

// PaymentOrderFilter holds list filters.
type PaymentOrderFilter struct {
	SupplierID *uuid.UUID
	FromDate   *time.Time
	ToDate     *time.Time
}

// List returns payment orders matching filters.
func (s *PaymentOrderService) List(ctx context.Context, companyID uuid.UUID, f PaymentOrderFilter) ([]*domain.PaymentOrder, error) {
	rows, err := s.q.ListPaymentOrders(ctx, sqlcgen.ListPaymentOrdersParams{
		CompanyID:  companyID,
		SupplierID: pgconv.PtrUUID(f.SupplierID),
		FromDate:   pgconv.PtrDate(f.FromDate),
		ToDate:     pgconv.PtrDate(f.ToDate),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing payment orders")
	}
	out := make([]*domain.PaymentOrder, 0, len(rows))
	for _, r := range rows {
		out = append(out, paymentOrderFromRow(r))
	}
	return out, nil
}

// Void soft-deletes a payment order.
func (s *PaymentOrderService) Void(ctx context.Context, companyID, callerID, id uuid.UUID) error {
	current, err := s.q.GetPaymentOrderByID(ctx, sqlcgen.GetPaymentOrderByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrPaymentOrderNotFound)
	}
	if err := s.q.SoftDeletePaymentOrder(ctx, sqlcgen.SoftDeletePaymentOrderParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "voiding payment order")
	}
	writeAudit(ctx, s.q, companyID, "payment_order", paymentOrderFromRow(current), nil, &callerID, id, "void")
	return nil
}

func (s *PaymentOrderService) hydrate(ctx context.Context, po *domain.PaymentOrder) (*domain.PaymentOrder, error) {
	methods, err := s.q.ListPaymentOrderMethods(ctx, po.ID)
	if err != nil {
		return nil, errors.Wrap(err, "loading methods")
	}
	for _, m := range methods {
		po.PaymentMethods = append(po.PaymentMethods, &domain.PaymentMethod{
			ID:             m.ID,
			MethodType:     m.MethodType,
			CashRegisterID: pgconv.UUIDPtr(m.CashRegisterID),
			BankAccountID:  pgconv.UUIDPtr(m.BankAccountID),
			Amount:         pgconv.NumericToDecimalZero(m.Amount),
			Currency:       m.Currency,
			CheckNumber:    m.CheckNumber,
			CheckDate:      pgconv.TimePtr(m.CheckDate),
		})
	}
	apps, err := s.q.ListPaymentOrderApplications(ctx, po.ID)
	if err != nil {
		return nil, errors.Wrap(err, "loading applications")
	}
	for _, a := range apps {
		po.Applications = append(po.Applications, &domain.Application{
			ID:        a.ID,
			InvoiceID: a.InvoiceReceivedID,
			Amount:    pgconv.NumericToDecimalZero(a.Amount),
		})
	}
	return po, nil
}
