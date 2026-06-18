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

// ReceiptService manages customer receipts (recibos): payment registration,
// invoice application and treasury movements, all within one transaction.
type ReceiptService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewReceiptService constructs a ReceiptService.
func NewReceiptService(db *pgxpool.Pool, logger *slog.Logger) *ReceiptService {
	return &ReceiptService{q: sqlcgen.New(db), db: db, logger: logger}
}

// PaymentMethodInput is one method used to settle a receipt or payment order.
type PaymentMethodInput struct {
	MethodType     string
	CashRegisterID *uuid.UUID
	BankAccountID  *uuid.UUID
	Amount         decimal.Decimal
	Currency       *string
	CheckNumber    *string
	CheckDate      *time.Time
}

// ApplicationInput applies an amount of the receipt to an invoice.
type ApplicationInput struct {
	InvoiceID uuid.UUID
	Amount    decimal.Decimal
}

// CreateReceiptInput is the input for creating a receipt.
type CreateReceiptInput struct {
	IdempotencyKey uuid.UUID
	ContactID      uuid.UUID
	Date           time.Time
	Currency       string
	ExchangeRate   decimal.Decimal
	Notes          *string
	PaymentMethods []PaymentMethodInput
	Applications   []ApplicationInput
}

// CreateReceipt records a receipt, applying it to invoices and posting the
// corresponding cash/bank movements, all in a single transaction. The second
// return value reports whether an existing receipt was returned (idempotent).
func (s *ReceiptService) CreateReceipt(ctx context.Context, companyID, callerID uuid.UUID, in CreateReceiptInput) (*domain.Receipt, bool, error) {
	if len(in.PaymentMethods) == 0 {
		return nil, false, errors.WithStack(domain.ErrNoPaymentMethods)
	}

	// Idempotency: replay an existing receipt for this key.
	if existing, err := s.q.GetReceiptByIdempotencyKey(ctx, sqlcgen.GetReceiptByIdempotencyKeyParams{
		CompanyID: companyID, IdempotencyKey: in.IdempotencyKey,
	}); err == nil {
		r, hErr := s.hydrate(ctx, receiptFromRow(existing))
		return r, true, hErr
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

	// Validate applications against locked invoice balances.
	appliedTotal := decimal.Zero
	type lockedInvoice struct {
		row       sqlcgen.InvoicesIssued
		newPaid   decimal.Decimal
		newStatus domain.InvoiceStatus
	}
	locked := make(map[uuid.UUID]*lockedInvoice)
	for _, a := range in.Applications {
		if a.Amount.Sign() <= 0 {
			return nil, false, errors.WithStack(domain.ErrInvalidAmount)
		}
		li, ok := locked[a.InvoiceID]
		if !ok {
			row, gErr := qtx.GetInvoiceForUpdate(ctx, sqlcgen.GetInvoiceForUpdateParams{ID: a.InvoiceID, CompanyID: companyID})
			if gErr != nil {
				return nil, false, errors.WithStack(domain.ErrInvoiceNotFound)
			}
			li = &lockedInvoice{
				row:     row,
				newPaid: pgconv.NumericToDecimalZero(row.PaidAmount),
			}
			locked[a.InvoiceID] = li
		}
		invTotal := pgconv.NumericToDecimalZero(li.row.TotalAmount)
		remaining := invTotal.Sub(li.newPaid)
		if a.Amount.GreaterThan(remaining) {
			return nil, false, errors.WithStack(domain.ErrApplicationExceedsBalance)
		}
		li.newPaid = li.newPaid.Add(a.Amount)
		li.newStatus = domain.NextPaymentStatus(li.newPaid, invTotal)
		appliedTotal = appliedTotal.Add(a.Amount)
	}
	if appliedTotal.GreaterThan(total) {
		return nil, false, errors.WithStack(domain.ErrApplicationExceedsReceipt)
	}
	onAccount := total.Sub(appliedTotal)

	// Allocate receipt number.
	number, err := qtx.NextSequenceNumber(ctx, sqlcgen.NextSequenceNumberParams{
		CompanyID: companyID, DocumentType: "receipt", SalePoint: 1,
	})
	if err != nil {
		return nil, false, errors.Wrap(err, "allocating receipt number")
	}

	row, err := qtx.CreateReceipt(ctx, sqlcgen.CreateReceiptParams{
		CompanyID:       companyID,
		IdempotencyKey:  in.IdempotencyKey,
		ContactID:       in.ContactID,
		Date:            pgtype.Date{Time: in.Date, Valid: true},
		Number:          number,
		Currency:        in.Currency,
		ExchangeRate:    pgconv.DecimalToNumericValue(rate),
		TotalAmount:     pgconv.DecimalToNumericValue(total),
		OnAccountAmount: pgconv.DecimalToNumericValue(onAccount),
		Notes:           in.Notes,
		CreatedBy:       callerID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			existing, gErr := s.q.GetReceiptByIdempotencyKey(ctx, sqlcgen.GetReceiptByIdempotencyKeyParams{
				CompanyID: companyID, IdempotencyKey: in.IdempotencyKey,
			})
			if gErr == nil {
				r, hErr := s.hydrate(ctx, receiptFromRow(existing))
				return r, true, hErr
			}
		}
		return nil, false, errors.Wrap(err, "creating receipt")
	}

	// Apply to invoices and update their paid amount / status.
	for _, a := range in.Applications {
		if _, err := qtx.CreateReceiptApplication(ctx, sqlcgen.CreateReceiptApplicationParams{
			ReceiptID: row.ID,
			InvoiceID: a.InvoiceID,
			Amount:    pgconv.DecimalToNumericValue(a.Amount),
		}); err != nil {
			return nil, false, errors.Wrap(err, "creating receipt application")
		}
	}
	for invID, li := range locked {
		if _, err := qtx.UpdateInvoicePaidAmount(ctx, sqlcgen.UpdateInvoicePaidAmountParams{
			ID:         invID,
			CompanyID:  companyID,
			PaidAmount: pgconv.DecimalToNumericValue(li.newPaid),
			Status:     string(li.newStatus),
		}); err != nil {
			return nil, false, errors.Wrap(err, "updating invoice paid amount")
		}
	}

	// Post payment methods to treasury.
	for _, m := range in.PaymentMethods {
		if _, err := qtx.CreateReceiptPaymentMethod(ctx, sqlcgen.CreateReceiptPaymentMethodParams{
			ReceiptID:      row.ID,
			MethodType:     m.MethodType,
			CashRegisterID: pgconv.PtrUUID(m.CashRegisterID),
			BankAccountID:  pgconv.PtrUUID(m.BankAccountID),
			Amount:         pgconv.DecimalToNumericValue(m.Amount),
			Currency:       methodCurrency(m.Currency, in.Currency),
			CheckNumber:    m.CheckNumber,
			CheckDate:      pgconv.PtrDate(m.CheckDate),
		}); err != nil {
			return nil, false, errors.Wrap(err, "creating receipt payment method")
		}
		if err := s.postInflow(ctx, qtx, companyID, callerID, m, in.Currency, row.ID); err != nil {
			return nil, false, err
		}
	}

	// Reduce the customer's account-receivable balance by the receipt total.
	if err := qtx.UpsertFinanceContactBalance(ctx, sqlcgen.UpsertFinanceContactBalanceParams{
		ContactID: in.ContactID,
		Currency:  in.Currency,
		Balance:   pgconv.DecimalToNumericValue(total.Neg()),
	}); err != nil {
		return nil, false, errors.Wrap(err, "updating contact balance")
	}

	rcpt := receiptFromRow(row)
	writeAudit(ctx, qtx, companyID, "receipt", nil, rcpt, &callerID, row.ID, "create")

	if err := tx.Commit(ctx); err != nil {
		return nil, false, errors.Wrap(err, "commit tx")
	}
	r, hErr := s.hydrate(ctx, rcpt)
	return r, false, hErr
}

// postInflow records the cash or bank movement for a receipt payment method.
func (s *ReceiptService) postInflow(ctx context.Context, qtx *sqlcgen.Queries, companyID, callerID uuid.UUID, m PaymentMethodInput, currency string, receiptID uuid.UUID) error {
	refType := "receipt"
	switch m.MethodType {
	case "cash":
		if m.CashRegisterID == nil {
			return errors.WithStack(domain.ErrCashRegisterNotFound)
		}
		session, sErr := qtx.GetOpenSession(ctx, *m.CashRegisterID)
		var sessID pgtype.UUID
		if sErr == nil {
			sessID = pgtype.UUID{Bytes: session.ID, Valid: true}
		}
		if _, err := qtx.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
			CompanyID:      companyID,
			CashRegisterID: *m.CashRegisterID,
			SessionID:      sessID,
			Type:           "income",
			Amount:         pgconv.DecimalToNumericValue(m.Amount),
			Currency:       currency,
			ReferenceType:  &refType,
			ReferenceID:    pgtype.UUID{Bytes: receiptID, Valid: true},
			CreatedBy:      callerID,
		}); err != nil {
			return errors.Wrap(err, "posting cash inflow")
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
			Type:          "credit",
			Amount:        pgconv.DecimalToNumericValue(m.Amount),
			Currency:      currency,
			ReferenceType: &refType,
			ReferenceID:   pgtype.UUID{Bytes: receiptID, Valid: true},
			ValueDate:     pgtype.Date{Time: time.Now(), Valid: true},
			CreatedBy:     callerID,
		}); err != nil {
			return errors.Wrap(err, "posting bank inflow")
		}
		newBal := pgconv.NumericToDecimalZero(acct.BookBalance).Add(m.Amount)
		if _, err := qtx.UpdateBankAccountBalance(ctx, sqlcgen.UpdateBankAccountBalanceParams{
			ID: *m.BankAccountID, CompanyID: companyID, BookBalance: pgconv.DecimalToNumericValue(newBal),
		}); err != nil {
			return errors.Wrap(err, "updating bank balance")
		}
	}
	// 'check' and 'card' methods do not move cash/bank ledgers immediately.
	return nil
}

// GetReceipt returns a receipt with its methods and applications.
func (s *ReceiptService) GetReceipt(ctx context.Context, companyID, id uuid.UUID) (*domain.Receipt, error) {
	row, err := s.q.GetReceiptByID(ctx, sqlcgen.GetReceiptByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrReceiptNotFound)
	}
	r := &domain.Receipt{
		ID:              row.ID,
		CompanyID:       row.CompanyID,
		ContactID:       row.ContactID,
		Date:            row.Date.Time,
		Number:          row.Number,
		Currency:        row.Currency,
		ExchangeRate:    pgconv.NumericToDecimalZero(row.ExchangeRate),
		TotalAmount:     pgconv.NumericToDecimalZero(row.TotalAmount),
		OnAccountAmount: pgconv.NumericToDecimalZero(row.OnAccountAmount),
		Notes:           row.Notes,
		CreatedBy:       row.CreatedBy,
		CreatedAt:       row.CreatedAt.Time,
	}
	return s.hydrate(ctx, r)
}

// ReceiptFilter holds list filters.
type ReceiptFilter struct {
	ContactID *uuid.UUID
	FromDate  *time.Time
	ToDate    *time.Time
}

// ListReceipts returns receipts matching the filters.
func (s *ReceiptService) ListReceipts(ctx context.Context, companyID uuid.UUID, f ReceiptFilter) ([]*domain.Receipt, error) {
	rows, err := s.q.ListReceipts(ctx, sqlcgen.ListReceiptsParams{
		CompanyID: companyID,
		ContactID: pgconv.PtrUUID(f.ContactID),
		FromDate:  pgconv.PtrDate(f.FromDate),
		ToDate:    pgconv.PtrDate(f.ToDate),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing receipts")
	}
	out := make([]*domain.Receipt, 0, len(rows))
	for _, r := range rows {
		out = append(out, receiptFromRow(r))
	}
	return out, nil
}

// VoidReceipt soft-deletes a receipt and reverses its invoice applications,
// treasury movements and contact balance, in a single transaction.
func (s *ReceiptService) VoidReceipt(ctx context.Context, companyID, callerID, id uuid.UUID) error {
	receipt, err := s.q.GetReceiptByID(ctx, sqlcgen.GetReceiptByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrReceiptNotFound)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	// Reverse invoice applications.
	apps, err := qtx.ListReceiptApplications(ctx, id)
	if err != nil {
		return errors.Wrap(err, "listing applications")
	}
	for _, a := range apps {
		inv, gErr := qtx.GetInvoiceForUpdate(ctx, sqlcgen.GetInvoiceForUpdateParams{ID: a.InvoiceID, CompanyID: companyID})
		if gErr != nil {
			continue
		}
		invTotal := pgconv.NumericToDecimalZero(inv.TotalAmount)
		newPaid := pgconv.NumericToDecimalZero(inv.PaidAmount).Sub(pgconv.NumericToDecimalZero(a.Amount))
		if newPaid.Sign() < 0 {
			newPaid = decimal.Zero
		}
		if _, err := qtx.UpdateInvoicePaidAmount(ctx, sqlcgen.UpdateInvoicePaidAmountParams{
			ID:         a.InvoiceID,
			CompanyID:  companyID,
			PaidAmount: pgconv.DecimalToNumericValue(newPaid),
			Status:     string(domain.NextPaymentStatus(newPaid, invTotal)),
		}); err != nil {
			return errors.Wrap(err, "reversing invoice paid amount")
		}
	}

	// Reverse treasury movements (contra entries).
	methods, err := qtx.ListReceiptPaymentMethods(ctx, id)
	if err != nil {
		return errors.Wrap(err, "listing payment methods")
	}
	refType := "receipt_void"
	for _, m := range methods {
		amount := pgconv.NumericToDecimalZero(m.Amount)
		switch m.MethodType {
		case "cash":
			if m.CashRegisterID.Valid {
				crID := uuid.UUID(m.CashRegisterID.Bytes)
				if _, err := qtx.CreateCashMovement(ctx, sqlcgen.CreateCashMovementParams{
					CompanyID:      companyID,
					CashRegisterID: crID,
					Type:           "expense",
					Amount:         m.Amount,
					Currency:       receipt.Currency,
					ReferenceType:  &refType,
					ReferenceID:    pgtype.UUID{Bytes: id, Valid: true},
					CreatedBy:      callerID,
				}); err != nil {
					return errors.Wrap(err, "reversing cash movement")
				}
			}
		case "bank_transfer":
			if m.BankAccountID.Valid {
				baID := uuid.UUID(m.BankAccountID.Bytes)
				acct, aErr := qtx.GetBankAccountFinanceByID(ctx, sqlcgen.GetBankAccountFinanceByIDParams{ID: baID, CompanyID: companyID})
				if aErr == nil {
					if _, err := qtx.CreateBankMovement(ctx, sqlcgen.CreateBankMovementParams{
						CompanyID:     companyID,
						BankAccountID: baID,
						Type:          "debit",
						Amount:        m.Amount,
						Currency:      receipt.Currency,
						ReferenceType: &refType,
						ReferenceID:   pgtype.UUID{Bytes: id, Valid: true},
						ValueDate:     pgtype.Date{Time: time.Now(), Valid: true},
						CreatedBy:     callerID,
					}); err != nil {
						return errors.Wrap(err, "reversing bank movement")
					}
					newBal := pgconv.NumericToDecimalZero(acct.BookBalance).Sub(amount)
					if _, err := qtx.UpdateBankAccountBalance(ctx, sqlcgen.UpdateBankAccountBalanceParams{
						ID: baID, CompanyID: companyID, BookBalance: pgconv.DecimalToNumericValue(newBal),
					}); err != nil {
						return errors.Wrap(err, "restoring bank balance")
					}
				}
			}
		}
	}

	// Restore the contact balance by the receipt total.
	if err := qtx.UpsertFinanceContactBalance(ctx, sqlcgen.UpsertFinanceContactBalanceParams{
		ContactID: receipt.ContactID,
		Currency:  receipt.Currency,
		Balance:   receipt.TotalAmount,
	}); err != nil {
		return errors.Wrap(err, "restoring contact balance")
	}

	if err := qtx.SoftDeleteReceipt(ctx, sqlcgen.SoftDeleteReceiptParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "soft-deleting receipt")
	}
	writeAudit(ctx, qtx, companyID, "receipt", receiptFromRow(toReceiptRow(receipt)), nil, &callerID, id, "void")

	return tx.Commit(ctx)
}

func (s *ReceiptService) hydrate(ctx context.Context, r *domain.Receipt) (*domain.Receipt, error) {
	methods, err := s.q.ListReceiptPaymentMethods(ctx, r.ID)
	if err != nil {
		return nil, errors.Wrap(err, "loading payment methods")
	}
	for _, m := range methods {
		r.PaymentMethods = append(r.PaymentMethods, paymentMethodFromReceiptRow(m))
	}
	apps, err := s.q.ListReceiptApplications(ctx, r.ID)
	if err != nil {
		return nil, errors.Wrap(err, "loading applications")
	}
	for _, a := range apps {
		r.Applications = append(r.Applications, applicationFromReceiptRow(a))
	}
	return r, nil
}

func methodCurrency(method *string, fallback string) *string {
	if method != nil && *method != "" {
		return method
	}
	f := fallback
	return &f
}

// toReceiptRow adapts a GetReceiptByIDRow to a Receipt for audit logging.
func toReceiptRow(r sqlcgen.GetReceiptByIDRow) sqlcgen.Receipt {
	return sqlcgen.Receipt{
		ID:              r.ID,
		CompanyID:       r.CompanyID,
		IdempotencyKey:  r.IdempotencyKey,
		ContactID:       r.ContactID,
		Date:            r.Date,
		Number:          r.Number,
		Currency:        r.Currency,
		ExchangeRate:    r.ExchangeRate,
		TotalAmount:     r.TotalAmount,
		OnAccountAmount: r.OnAccountAmount,
		Notes:           r.Notes,
		PdfKey:          r.PdfKey,
		CreatedBy:       r.CreatedBy,
		CreatedAt:       r.CreatedAt,
		DeletedAt:       r.DeletedAt,
	}
}
