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

// InvoiceReceivedService manages supplier invoices (facturas recibidas).
type InvoiceReceivedService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewInvoiceReceivedService constructs an InvoiceReceivedService.
func NewInvoiceReceivedService(db *pgxpool.Pool, logger *slog.Logger) *InvoiceReceivedService {
	return &InvoiceReceivedService{q: sqlcgen.New(db), db: db, logger: logger}
}

// CreateInvoiceReceivedInput is the input for recording a supplier invoice.
type CreateInvoiceReceivedInput struct {
	SupplierID       uuid.UUID
	InvoiceType      *string
	SalePoint        *int16
	Number           *int32
	IssueDate        *time.Time
	DueDate          *time.Time
	Currency         string
	ExchangeRate     decimal.Decimal
	ExchangeRateDate *time.Time
	NetAmount        decimal.Decimal
	TaxAmount        decimal.Decimal
	TotalAmount      decimal.Decimal
	ProjectID        *uuid.UUID
	Notes            *string
}

// Create records a supplier invoice and registers a matching payment
// obligation, in a single transaction.
func (s *InvoiceReceivedService) Create(ctx context.Context, companyID, callerID uuid.UUID, in CreateInvoiceReceivedInput) (*domain.InvoiceReceived, error) {
	if in.TotalAmount.Sign() <= 0 {
		return nil, errors.WithStack(domain.ErrInvalidAmount)
	}
	rate := in.ExchangeRate
	if rate.IsZero() {
		rate = decimal.NewFromInt(1)
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	row, err := qtx.CreateInvoiceReceived(ctx, sqlcgen.CreateInvoiceReceivedParams{
		CompanyID:        companyID,
		SupplierID:       in.SupplierID,
		InvoiceType:      in.InvoiceType,
		SalePoint:        in.SalePoint,
		Number:           in.Number,
		IssueDate:        pgconv.PtrDate(in.IssueDate),
		DueDate:          pgconv.PtrDate(in.DueDate),
		Currency:         &currency,
		ExchangeRate:     pgconv.DecimalToNumericValue(rate),
		ExchangeRateDate: pgconv.PtrDate(in.ExchangeRateDate),
		NetAmount:        pgconv.DecimalToNumericValue(in.NetAmount),
		TaxAmount:        pgconv.DecimalToNumericValue(in.TaxAmount),
		TotalAmount:      pgconv.DecimalToNumericValue(in.TotalAmount),
		ProjectID:        pgconv.PtrUUID(in.ProjectID),
		FileKey:          nil,
		Notes:            in.Notes,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating invoice received")
	}

	// Register the payment obligation.
	due := time.Now()
	if in.DueDate != nil {
		due = *in.DueDate
	}
	if _, err := qtx.CreatePaymentObligation(ctx, sqlcgen.CreatePaymentObligationParams{
		CompanyID:   companyID,
		SourceType:  "invoice_received",
		SourceID:    pgtype.UUID{Bytes: row.ID, Valid: true},
		Description: "Factura de proveedor",
		Amount:      pgconv.DecimalToNumericValue(in.TotalAmount),
		Currency:    &currency,
		DueDate:     pgtype.Date{Time: due, Valid: true},
	}); err != nil {
		return nil, errors.Wrap(err, "creating payment obligation")
	}

	inv := invoiceReceivedFromRow(row)
	writeAudit(ctx, qtx, companyID, "invoice_received", nil, inv, &callerID, row.ID, "create")
	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return inv, nil
}

// Get returns a supplier invoice by ID.
func (s *InvoiceReceivedService) Get(ctx context.Context, companyID, id uuid.UUID) (*domain.InvoiceReceived, error) {
	row, err := s.q.GetInvoiceReceivedByID(ctx, sqlcgen.GetInvoiceReceivedByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrInvoiceReceivedNotFound)
	}
	return invoiceReceivedFromRow(row), nil
}

// ReceivedFilter holds list filters.
type ReceivedFilter struct {
	SupplierID *uuid.UUID
	Status     *string
}

// List returns supplier invoices matching filters.
func (s *InvoiceReceivedService) List(ctx context.Context, companyID uuid.UUID, f ReceivedFilter) ([]*domain.InvoiceReceived, error) {
	rows, err := s.q.ListInvoicesReceived(ctx, sqlcgen.ListInvoicesReceivedParams{
		CompanyID:  companyID,
		SupplierID: pgconv.PtrUUID(f.SupplierID),
		Status:     f.Status,
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing invoices received")
	}
	out := make([]*domain.InvoiceReceived, 0, len(rows))
	for _, r := range rows {
		out = append(out, invoiceReceivedFromRow(r))
	}
	return out, nil
}

// Update updates a supplier invoice.
func (s *InvoiceReceivedService) Update(ctx context.Context, companyID, callerID, id uuid.UUID, in CreateInvoiceReceivedInput) (*domain.InvoiceReceived, error) {
	current, err := s.q.GetInvoiceReceivedByID(ctx, sqlcgen.GetInvoiceReceivedByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrInvoiceReceivedNotFound)
	}
	rate := in.ExchangeRate
	if rate.IsZero() {
		rate = decimal.NewFromInt(1)
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}
	row, err := s.q.UpdateInvoiceReceived(ctx, sqlcgen.UpdateInvoiceReceivedParams{
		ID:               id,
		CompanyID:        companyID,
		SupplierID:       in.SupplierID,
		InvoiceType:      in.InvoiceType,
		SalePoint:        in.SalePoint,
		Number:           in.Number,
		IssueDate:        pgconv.PtrDate(in.IssueDate),
		DueDate:          pgconv.PtrDate(in.DueDate),
		Currency:         &currency,
		ExchangeRate:     pgconv.DecimalToNumericValue(rate),
		ExchangeRateDate: pgconv.PtrDate(in.ExchangeRateDate),
		NetAmount:        pgconv.DecimalToNumericValue(in.NetAmount),
		TaxAmount:        pgconv.DecimalToNumericValue(in.TaxAmount),
		TotalAmount:      pgconv.DecimalToNumericValue(in.TotalAmount),
		ProjectID:        pgconv.PtrUUID(in.ProjectID),
		FileKey:          nil,
		Notes:            in.Notes,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating invoice received")
	}
	after := invoiceReceivedFromRow(row)
	writeAudit(ctx, s.q, companyID, "invoice_received", invoiceReceivedFromRow(current), after, &callerID, id, "update")
	return after, nil
}

// Delete soft-deletes a supplier invoice.
func (s *InvoiceReceivedService) Delete(ctx context.Context, companyID, callerID, id uuid.UUID) error {
	current, err := s.q.GetInvoiceReceivedByID(ctx, sqlcgen.GetInvoiceReceivedByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrInvoiceReceivedNotFound)
	}
	if err := s.q.SoftDeleteInvoiceReceived(ctx, sqlcgen.SoftDeleteInvoiceReceivedParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting invoice received")
	}
	writeAudit(ctx, s.q, companyID, "invoice_received", invoiceReceivedFromRow(current), nil, &callerID, id, "delete")
	return nil
}
