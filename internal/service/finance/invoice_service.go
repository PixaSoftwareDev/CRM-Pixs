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

// InvoiceService manages issued invoices: drafts, issuing (numbering),
// payment registration and voiding.
type InvoiceService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewInvoiceService constructs an InvoiceService.
func NewInvoiceService(db *pgxpool.Pool, logger *slog.Logger) *InvoiceService {
	return &InvoiceService{q: sqlcgen.New(db), db: db, logger: logger}
}

// InvoiceItemInput is the input for a single invoice line.
type InvoiceItemInput struct {
	ProductID   *uuid.UUID
	Description string
	Quantity    decimal.Decimal
	UnitPrice   decimal.Decimal
	DiscountPct decimal.Decimal
	VATRatePct  decimal.Decimal
	VATRateID   *uuid.UUID
	OrderPos    *int16
}

// CreateInvoiceInput is the input for creating an invoice draft.
type CreateInvoiceInput struct {
	IdempotencyKey     uuid.UUID
	InvoiceType        string
	SalePoint          int16
	ContactID          uuid.UUID
	IssueDate          time.Time
	DueDate            *time.Time
	PaymentConditionID *uuid.UUID
	Currency           string
	ExchangeRate       decimal.Decimal
	ExchangeRateDate   time.Time
	ProjectID          *uuid.UUID
	QuoteID            *uuid.UUID
	Notes              *string
	Items              []InvoiceItemInput
}

// CreateDraft validates the input, computes totals and persists a draft
// invoice (without a fiscal number). The idempotency key is stored immediately.
func (s *InvoiceService) CreateDraft(ctx context.Context, companyID, callerID uuid.UUID, in CreateInvoiceInput) (*domain.Invoice, error) {
	if !domain.ValidInvoiceType(in.InvoiceType) {
		return nil, errors.WithStack(domain.ErrInvalidInvoiceType)
	}
	if len(in.Items) == 0 {
		return nil, errors.WithStack(domain.ErrNoItems)
	}
	if in.SalePoint == 0 {
		in.SalePoint = 1
	}
	rate := in.ExchangeRate
	if rate.IsZero() {
		rate = decimal.NewFromInt(1)
	}
	if in.ExchangeRateDate.IsZero() {
		in.ExchangeRateDate = in.IssueDate
	}

	if err := s.resolveVATRates(ctx, companyID, in.Items); err != nil {
		return nil, err
	}
	totals := domain.CalculateInvoiceTotals(toCalcInputs(in.Items))

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	row, err := qtx.CreateInvoiceDraft(ctx, sqlcgen.CreateInvoiceDraftParams{
		CompanyID:          companyID,
		IdempotencyKey:     in.IdempotencyKey,
		InvoiceType:        in.InvoiceType,
		SalePoint:          in.SalePoint,
		ContactID:          in.ContactID,
		IssueDate:          pgtype.Date{Time: in.IssueDate, Valid: true},
		DueDate:            pgconv.PtrDate(in.DueDate),
		PaymentConditionID: pgconv.PtrUUID(in.PaymentConditionID),
		Currency:           in.Currency,
		ExchangeRate:       pgconv.DecimalToNumericValue(rate),
		ExchangeRateDate:   pgtype.Date{Time: in.ExchangeRateDate, Valid: true},
		NetAmount:          pgconv.DecimalToNumericValue(totals.Net),
		TaxAmount:          pgconv.DecimalToNumericValue(totals.Tax),
		TotalAmount:        pgconv.DecimalToNumericValue(totals.Total),
		ProjectID:          pgconv.PtrUUID(in.ProjectID),
		QuoteID:            pgconv.PtrUUID(in.QuoteID),
		Notes:              in.Notes,
	})
	if err != nil {
		if isUniqueViolation(err) {
			// Idempotent create: return the existing invoice for this key.
			existing, gErr := s.q.GetInvoiceByIdempotencyKey(ctx, sqlcgen.GetInvoiceByIdempotencyKeyParams{
				CompanyID: companyID, IdempotencyKey: in.IdempotencyKey,
			})
			if gErr == nil {
				return s.hydrate(ctx, invoiceFromRow(existing))
			}
		}
		return nil, errors.Wrap(err, "creating invoice draft")
	}

	if err := s.insertItems(ctx, qtx, row.ID, in.Items, totals); err != nil {
		return nil, err
	}

	inv := invoiceFromRow(row)
	writeAudit(ctx, qtx, companyID, "invoice_issued", nil, inv, &callerID, row.ID, "create")

	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return s.hydrate(ctx, inv)
}

// UpdateDraft replaces the items and recomputes totals on a draft invoice.
func (s *InvoiceService) UpdateDraft(ctx context.Context, companyID, callerID, id uuid.UUID, in CreateInvoiceInput) (*domain.Invoice, error) {
	current, err := s.q.GetInvoiceByID(ctx, sqlcgen.GetInvoiceByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrInvoiceNotFound)
	}
	if current.Status != string(domain.InvoiceStatusDraft) {
		return nil, errors.WithStack(domain.ErrInvoiceNotDraft)
	}
	if len(in.Items) == 0 {
		return nil, errors.WithStack(domain.ErrNoItems)
	}
	rate := in.ExchangeRate
	if rate.IsZero() {
		rate = decimal.NewFromInt(1)
	}
	if in.ExchangeRateDate.IsZero() {
		in.ExchangeRateDate = in.IssueDate
	}
	if err := s.resolveVATRates(ctx, companyID, in.Items); err != nil {
		return nil, err
	}
	totals := domain.CalculateInvoiceTotals(toCalcInputs(in.Items))

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	row, err := qtx.UpdateInvoiceDraft(ctx, sqlcgen.UpdateInvoiceDraftParams{
		ID:                 id,
		CompanyID:          companyID,
		ContactID:          in.ContactID,
		IssueDate:          pgtype.Date{Time: in.IssueDate, Valid: true},
		DueDate:            pgconv.PtrDate(in.DueDate),
		PaymentConditionID: pgconv.PtrUUID(in.PaymentConditionID),
		Currency:           in.Currency,
		ExchangeRate:       pgconv.DecimalToNumericValue(rate),
		ExchangeRateDate:   pgtype.Date{Time: in.ExchangeRateDate, Valid: true},
		NetAmount:          pgconv.DecimalToNumericValue(totals.Net),
		TaxAmount:          pgconv.DecimalToNumericValue(totals.Tax),
		TotalAmount:        pgconv.DecimalToNumericValue(totals.Total),
		ProjectID:          pgconv.PtrUUID(in.ProjectID),
		QuoteID:            pgconv.PtrUUID(in.QuoteID),
		Notes:              in.Notes,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating invoice draft")
	}
	if err := qtx.DeleteInvoiceItems(ctx, id); err != nil {
		return nil, errors.Wrap(err, "clearing invoice items")
	}
	if err := s.insertItems(ctx, qtx, id, in.Items, totals); err != nil {
		return nil, err
	}

	after := invoiceFromRow(row)
	writeAudit(ctx, qtx, companyID, "invoice_issued", invoiceFromRow(current), after, &callerID, id, "update")

	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}
	return s.hydrate(ctx, after)
}

// IssueDraft assigns the next fiscal number to a draft invoice and transitions
// it to 'issued', within a single transaction. It is idempotent on the
// idempotency key: if an invoice with that key is already issued, it returns it.
func (s *InvoiceService) IssueDraft(ctx context.Context, companyID, callerID, invoiceID, idempotencyKey uuid.UUID) (*domain.Invoice, bool, error) {
	// Idempotency: if an issued invoice already exists for this key, return it.
	if existing, err := s.q.GetInvoiceByIdempotencyKey(ctx, sqlcgen.GetInvoiceByIdempotencyKeyParams{
		CompanyID: companyID, IdempotencyKey: idempotencyKey,
	}); err == nil && existing.Status != string(domain.InvoiceStatusDraft) {
		inv, hErr := s.hydrate(ctx, invoiceFromRow(existing))
		return inv, true, hErr
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, false, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	current, err := qtx.GetInvoiceForUpdate(ctx, sqlcgen.GetInvoiceForUpdateParams{ID: invoiceID, CompanyID: companyID})
	if err != nil {
		return nil, false, errors.WithStack(domain.ErrInvoiceNotFound)
	}
	if current.Status != string(domain.InvoiceStatusDraft) {
		return nil, false, errors.WithStack(domain.ErrInvoiceNotDraft)
	}

	// Allocate the next number for this document type and sale point.
	docType := "invoice_" + current.InvoiceType
	number, err := qtx.NextSequenceNumber(ctx, sqlcgen.NextSequenceNumberParams{
		CompanyID:    companyID,
		DocumentType: docType,
		SalePoint:    current.SalePoint,
	})
	if err != nil {
		return nil, false, errors.Wrap(err, "allocating invoice number")
	}

	row, err := qtx.IssueInvoice(ctx, sqlcgen.IssueInvoiceParams{
		ID:             invoiceID,
		CompanyID:      companyID,
		Number:         &number,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil && isUniqueViolation(err) {
		// The header key was already used to issue another invoice — replay it.
		existing, gErr := s.q.GetInvoiceByIdempotencyKey(ctx, sqlcgen.GetInvoiceByIdempotencyKeyParams{
			CompanyID: companyID, IdempotencyKey: idempotencyKey,
		})
		if gErr == nil {
			inv, hErr := s.hydrate(ctx, invoiceFromRow(existing))
			return inv, true, hErr
		}
	}
	if err != nil {
		return nil, false, errors.Wrap(err, "issuing invoice")
	}

	// Persist aggregated VAT tax lines.
	items, err := qtx.ListInvoiceItems(ctx, invoiceID)
	if err != nil {
		return nil, false, errors.Wrap(err, "loading items for taxes")
	}
	calcInputs := make([]domain.InvoiceItemInput, len(items))
	for i, it := range items {
		calcInputs[i] = domain.InvoiceItemInput{
			Quantity:    pgconv.NumericToDecimalZero(it.Quantity),
			UnitPrice:   pgconv.NumericToDecimalZero(it.UnitPrice),
			DiscountPct: pgconv.NumericToDecimalZero(it.DiscountPct),
			VATRatePct:  vatRatePctFromLine(it),
		}
	}
	totals := domain.CalculateInvoiceTotals(calcInputs)
	for _, b := range totals.VATBuckets {
		if _, err := qtx.CreateInvoiceTax(ctx, sqlcgen.CreateInvoiceTaxParams{
			InvoiceID:  invoiceID,
			TaxType:    "vat",
			RatePct:    pgconv.DecimalToNumericValue(b.RatePct),
			BaseAmount: pgconv.DecimalToNumericValue(b.Base),
			TaxAmount:  pgconv.DecimalToNumericValue(b.Tax),
		}); err != nil {
			return nil, false, errors.Wrap(err, "creating invoice tax")
		}
	}

	after := invoiceFromRow(row)
	writeAudit(ctx, qtx, companyID, "invoice_issued", invoiceFromRow(current), after, &callerID, invoiceID, "issue")

	if err := tx.Commit(ctx); err != nil {
		return nil, false, errors.Wrap(err, "commit tx")
	}
	inv, hErr := s.hydrate(ctx, after)
	return inv, false, hErr
}

// VoidInvoice voids an issued invoice provided no receipts have been applied.
func (s *InvoiceService) VoidInvoice(ctx context.Context, companyID, callerID, id uuid.UUID) (*domain.Invoice, error) {
	current, err := s.q.GetInvoiceByID(ctx, sqlcgen.GetInvoiceByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrInvoiceNotFound)
	}
	applied, err := s.q.GetInvoiceApplicationSum(ctx, id)
	if err != nil {
		return nil, errors.Wrap(err, "checking applications")
	}
	hasApps := pgconv.NumericToDecimalZero(applied).Sign() > 0
	if !domain.CanTransition(domain.InvoiceStatus(current.Status), domain.InvoiceStatusVoid, hasApps) {
		if hasApps {
			return nil, errors.WithStack(domain.ErrInvoiceHasApplications)
		}
		return nil, errors.WithStack(domain.ErrInvalidStatusTransition)
	}
	row, err := s.q.VoidInvoice(ctx, sqlcgen.VoidInvoiceParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.Wrap(err, "voiding invoice")
	}
	after := invoiceFromRow(row)
	writeAudit(ctx, s.q, companyID, "invoice_issued", invoiceFromRow(current), after, &callerID, id, "void")
	return after, nil
}

// DeleteDraft soft-deletes a draft invoice.
func (s *InvoiceService) DeleteDraft(ctx context.Context, companyID, callerID, id uuid.UUID) error {
	current, err := s.q.GetInvoiceByID(ctx, sqlcgen.GetInvoiceByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrInvoiceNotFound)
	}
	if current.Status != string(domain.InvoiceStatusDraft) {
		return errors.WithStack(domain.ErrInvoiceNotDraft)
	}
	if err := s.q.SoftDeleteInvoice(ctx, sqlcgen.SoftDeleteInvoiceParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting invoice")
	}
	writeAudit(ctx, s.q, companyID, "invoice_issued", invoiceFromRow(current), nil, &callerID, id, "delete")
	return nil
}

// GetInvoice returns an invoice with items and taxes.
func (s *InvoiceService) GetInvoice(ctx context.Context, companyID, id uuid.UUID) (*domain.Invoice, error) {
	row, err := s.q.GetInvoiceByID(ctx, sqlcgen.GetInvoiceByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrInvoiceNotFound)
	}
	return s.hydrate(ctx, invoiceFromRow(row))
}

// InvoiceFilter holds list filters.
type InvoiceFilter struct {
	ContactID *uuid.UUID
	Status    *string
	FromDate  *time.Time
	ToDate    *time.Time
}

// ListInvoices returns invoices matching the filters (without items).
func (s *InvoiceService) ListInvoices(ctx context.Context, companyID uuid.UUID, f InvoiceFilter) ([]*domain.Invoice, error) {
	rows, err := s.q.ListInvoices(ctx, sqlcgen.ListInvoicesParams{
		CompanyID: companyID,
		ContactID: pgconv.PtrUUID(f.ContactID),
		Status:    f.Status,
		FromDate:  pgconv.PtrDate(f.FromDate),
		ToDate:    pgconv.PtrDate(f.ToDate),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing invoices")
	}
	out := make([]*domain.Invoice, 0, len(rows))
	for _, r := range rows {
		out = append(out, invoiceFromRow(r))
	}
	return out, nil
}

// ListItems returns the line items of an invoice.
func (s *InvoiceService) ListItems(ctx context.Context, invoiceID uuid.UUID) ([]*domain.InvoiceItem, error) {
	rows, err := s.q.ListInvoiceItems(ctx, invoiceID)
	if err != nil {
		return nil, errors.Wrap(err, "listing invoice items")
	}
	out := make([]*domain.InvoiceItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, invoiceItemFromRow(r))
	}
	return out, nil
}

// ListTaxes returns the aggregated tax lines of an invoice.
func (s *InvoiceService) ListTaxes(ctx context.Context, invoiceID uuid.UUID) ([]*domain.InvoiceTax, error) {
	rows, err := s.q.ListInvoiceTaxes(ctx, invoiceID)
	if err != nil {
		return nil, errors.Wrap(err, "listing invoice taxes")
	}
	out := make([]*domain.InvoiceTax, 0, len(rows))
	for _, r := range rows {
		out = append(out, invoiceTaxFromRow(r))
	}
	return out, nil
}

// ─── internal helpers ──────────────────────────────────────────────────────────

func (s *InvoiceService) insertItems(ctx context.Context, q *sqlcgen.Queries, invoiceID uuid.UUID, items []InvoiceItemInput, totals domain.InvoiceTotals) error {
	for i, it := range items {
		calc := totals.Lines[i]
		if _, err := q.CreateInvoiceItem(ctx, sqlcgen.CreateInvoiceItemParams{
			InvoiceID:   invoiceID,
			ProductID:   pgconv.PtrUUID(it.ProductID),
			Description: it.Description,
			Quantity:    pgconv.DecimalToNumericValue(it.Quantity),
			UnitPrice:   pgconv.DecimalToNumericValue(it.UnitPrice),
			DiscountPct: pgconv.DecimalToNumericValue(it.DiscountPct),
			VatRateID:   pgconv.PtrUUID(it.VATRateID),
			LineNet:     pgconv.DecimalToNumericValue(calc.LineNet),
			LineTax:     pgconv.DecimalToNumericValue(calc.LineTax),
			LineTotal:   pgconv.DecimalToNumericValue(calc.LineTotal),
			OrderPos:    orderPos(it.OrderPos, i),
		}); err != nil {
			return errors.Wrap(err, "creating invoice item")
		}
	}
	return nil
}

func (s *InvoiceService) hydrate(ctx context.Context, inv *domain.Invoice) (*domain.Invoice, error) {
	items, err := s.q.ListInvoiceItems(ctx, inv.ID)
	if err != nil {
		return nil, errors.Wrap(err, "loading invoice items")
	}
	for _, it := range items {
		inv.Items = append(inv.Items, invoiceItemFromRow(it))
	}
	taxes, err := s.q.ListInvoiceTaxes(ctx, inv.ID)
	if err != nil {
		return nil, errors.Wrap(err, "loading invoice taxes")
	}
	for _, tx := range taxes {
		inv.Taxes = append(inv.Taxes, invoiceTaxFromRow(tx))
	}
	return inv, nil
}

func toCalcInputs(items []InvoiceItemInput) []domain.InvoiceItemInput {
	out := make([]domain.InvoiceItemInput, len(items))
	for i, it := range items {
		out[i] = domain.InvoiceItemInput{
			Quantity:    it.Quantity,
			UnitPrice:   it.UnitPrice,
			DiscountPct: it.DiscountPct,
			VATRatePct:  it.VATRatePct,
			VATRateID:   it.VATRateID,
		}
	}
	return out
}

// vatRatePctFromLine derives the VAT rate percentage from a stored line by
// dividing tax by net. Returns zero when the net is zero.
func vatRatePctFromLine(it sqlcgen.InvoiceItem) decimal.Decimal {
	net := pgconv.NumericToDecimalZero(it.LineNet)
	tax := pgconv.NumericToDecimalZero(it.LineTax)
	if net.IsZero() {
		return decimal.Zero
	}
	return tax.Div(net).Mul(decimal.NewFromInt(100)).RoundBank(2)
}

func orderPos(p *int16, i int) *int16 {
	if p != nil {
		return p
	}
	v := int16(i)
	return &v
}

// resolveVATRates looks up the VAT rate percentage for each item that has a
// VATRateID but a zero VATRatePct. Mutates the slice in place.
func (s *InvoiceService) resolveVATRates(ctx context.Context, companyID uuid.UUID, items []InvoiceItemInput) error {
	for i := range items {
		if items[i].VATRateID == nil || !items[i].VATRatePct.IsZero() {
			continue
		}
		row, err := s.q.GetVATRateByID(ctx, sqlcgen.GetVATRateByIDParams{
			ID: *items[i].VATRateID, CompanyID: companyID,
		})
		if err != nil {
			return errors.Wrapf(err, "looking up vat_rate %s", items[i].VATRateID)
		}
		items[i].VATRatePct = pgconv.NumericToDecimalZero(row.RatePct)
	}
	return nil
}
