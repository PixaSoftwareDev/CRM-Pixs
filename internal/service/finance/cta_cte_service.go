package finance

import (
	"context"
	"log/slog"
	"sort"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/finance"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// CtaCteService produces a contact's account statement (cuenta corriente).
type CtaCteService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewCtaCteService constructs a CtaCteService.
func NewCtaCteService(db *pgxpool.Pool, logger *slog.Logger) *CtaCteService {
	return &CtaCteService{q: sqlcgen.New(db), db: db, logger: logger}
}

// StatementEntry is one line in an account statement.
type StatementEntry struct {
	Date           time.Time       `json:"date"`
	Kind           string          `json:"kind"` // "invoice" | "receipt"
	Reference      string          `json:"reference"`
	Debit          decimal.Decimal `json:"debit"`
	Credit         decimal.Decimal `json:"credit"`
	RunningBalance decimal.Decimal `json:"running_balance"`
}

// Statement is the full account statement for a contact.
type Statement struct {
	ContactID uuid.UUID          `json:"contact_id"`
	Currency  string             `json:"currency"`
	Entries   []StatementEntry   `json:"entries"`
	Balance   decimal.Decimal    `json:"balance"`
	Aging     domain.AgingReport `json:"aging"`
}

// GetStatement builds a chronological account statement with a running balance
// and aging breakdown for the given contact and currency.
func (s *CtaCteService) GetStatement(ctx context.Context, companyID, contactID uuid.UUID, currency string) (*Statement, error) {
	var cur *string
	if currency != "" {
		cur = &currency
	}

	invoices, err := s.q.GetContactInvoicesIssued(ctx, sqlcgen.GetContactInvoicesIssuedParams{
		CompanyID: companyID, ContactID: contactID, Currency: cur,
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading contact invoices")
	}
	receipts, err := s.q.GetContactReceipts(ctx, sqlcgen.GetContactReceiptsParams{
		CompanyID: companyID, ContactID: contactID, Currency: cur,
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading contact receipts")
	}

	entries := make([]StatementEntry, 0, len(invoices)+len(receipts))
	var aging []domain.AgingInvoice
	for _, inv := range invoices {
		ref := "Factura"
		if inv.Number != nil {
			ref = "Factura " + inv.InvoiceType
		}
		entries = append(entries, StatementEntry{
			Date:      inv.IssueDate.Time,
			Kind:      "invoice",
			Reference: ref,
			Debit:     pgconv.NumericToDecimalZero(inv.TotalAmount),
			Credit:    decimal.Zero,
		})
		remaining := pgconv.NumericToDecimalZero(inv.TotalAmount).Sub(pgconv.NumericToDecimalZero(inv.PaidAmount))
		if remaining.Sign() > 0 && inv.DueDate.Valid {
			aging = append(aging, domain.AgingInvoice{
				ID:        inv.ID,
				DueDate:   inv.DueDate.Time,
				Remaining: remaining,
			})
		}
	}
	for _, r := range receipts {
		entries = append(entries, StatementEntry{
			Date:      r.Date.Time,
			Kind:      "receipt",
			Reference: "Recibo",
			Debit:     decimal.Zero,
			Credit:    pgconv.NumericToDecimalZero(r.TotalAmount),
		})
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return entries[i].Date.Before(entries[j].Date)
	})

	balance := decimal.Zero
	for i := range entries {
		balance = balance.Add(entries[i].Debit).Sub(entries[i].Credit)
		entries[i].RunningBalance = balance
	}

	return &Statement{
		ContactID: contactID,
		Currency:  currency,
		Entries:   entries,
		Balance:   balance,
		Aging:     domain.AgingBuckets(aging, time.Now()),
	}, nil
}
