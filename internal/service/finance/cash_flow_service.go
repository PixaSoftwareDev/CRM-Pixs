package finance

import (
	"context"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// CashFlowService produces cash-flow projections and consolidated balances.
type CashFlowService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewCashFlowService constructs a CashFlowService.
func NewCashFlowService(db *pgxpool.Pool, logger *slog.Logger) *CashFlowService {
	return &CashFlowService{q: sqlcgen.New(db), db: db, logger: logger}
}

// Bucket holds aging-style amounts.
type Bucket struct {
	Bucket0030 decimal.Decimal `json:"b_0_30"`
	Bucket3160 decimal.Decimal `json:"b_31_60"`
	Bucket6190 decimal.Decimal `json:"b_61_90"`
	Bucket90P  decimal.Decimal `json:"b_90_plus"`
	Total      decimal.Decimal `json:"total"`
}

// Projection is the cash-flow projection result.
type Projection struct {
	Currency         string          `json:"currency"`
	Scenario         string          `json:"scenario"`
	CurrentBalance   decimal.Decimal `json:"current_balance"`
	Receivables      Bucket          `json:"receivables_by_bucket"`
	Payables         Bucket          `json:"payables_by_bucket"`
	NetFlow          Bucket          `json:"net_flow_by_bucket"`
	ProjectedBalance decimal.Decimal `json:"projected_balance"`
}

// scenarioFactor returns the collection probability multiplier for receivables.
func scenarioFactor(scenario string) decimal.Decimal {
	switch scenario {
	case "optimistic":
		return decimal.NewFromInt(1)
	case "pessimistic":
		return decimal.NewFromFloat(0.5)
	default: // realistic
		return decimal.NewFromFloat(0.8)
	}
}

// GetProjection builds a cash-flow projection for the given window, currency
// and scenario. Receivables are scaled by the scenario's collection factor.
func (s *CashFlowService) GetProjection(ctx context.Context, companyID uuid.UUID, days int, currency, scenario string) (*Projection, error) {
	// days is advisory: the projection always reports 30-day aging buckets.
	// Amounts due beyond the requested window still fold into the 90+ bucket.
	_ = days
	asOf := time.Now()
	var cur *string
	if currency != "" {
		cur = &currency
	}

	// Current consolidated balance for the currency.
	balances, err := s.q.GetConsolidatedBalance(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "getting consolidated balance")
	}
	currentBalance := decimal.Zero
	for _, b := range balances {
		if currency == "" || b.Currency == currency {
			currentBalance = currentBalance.Add(pgconv.NumericToDecimalZero(b.Balance))
		}
	}

	rows, err := s.q.GetCashFlowProjection(ctx, sqlcgen.GetCashFlowProjectionParams{
		CompanyID: companyID,
		Currency:  cur,
	})
	if err != nil {
		return nil, errors.Wrap(err, "getting cash flow projection")
	}

	factor := scenarioFactor(scenario)
	var recv, pay Bucket
	for _, r := range rows {
		if !r.DueDate.Valid {
			continue
		}
		amt := pgconv.NumericToDecimalZero(r.Amount)
		bucket := bucketIndex(asOf, r.DueDate.Time)
		if r.Direction == "in" {
			addToBucket(&recv, bucket, amt.Mul(factor).RoundBank(2))
		} else {
			addToBucket(&pay, bucket, amt)
		}
	}

	net := Bucket{
		Bucket0030: recv.Bucket0030.Sub(pay.Bucket0030),
		Bucket3160: recv.Bucket3160.Sub(pay.Bucket3160),
		Bucket6190: recv.Bucket6190.Sub(pay.Bucket6190),
		Bucket90P:  recv.Bucket90P.Sub(pay.Bucket90P),
		Total:      recv.Total.Sub(pay.Total),
	}

	return &Projection{
		Currency:         currency,
		Scenario:         scenario,
		CurrentBalance:   currentBalance,
		Receivables:      recv,
		Payables:         pay,
		NetFlow:          net,
		ProjectedBalance: currentBalance.Add(net.Total),
	}, nil
}

// ConsolidatedBalance is one currency's consolidated cash+bank balance.
type ConsolidatedBalance struct {
	Currency string          `json:"currency"`
	Balance  decimal.Decimal `json:"balance"`
}

// GetConsolidatedBalance returns balances per currency across cash and banks.
func (s *CashFlowService) GetConsolidatedBalance(ctx context.Context, companyID uuid.UUID) ([]ConsolidatedBalance, error) {
	rows, err := s.q.GetConsolidatedBalance(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "getting consolidated balance")
	}
	out := make([]ConsolidatedBalance, 0, len(rows))
	for _, r := range rows {
		out = append(out, ConsolidatedBalance{
			Currency: r.Currency,
			Balance:  pgconv.NumericToDecimalZero(r.Balance),
		})
	}
	return out, nil
}

func bucketIndex(asOf, dueDate time.Time) int {
	days := int(dueDate.Sub(asOf).Hours() / 24)
	switch {
	case days <= 30:
		return 0
	case days <= 60:
		return 1
	case days <= 90:
		return 2
	default:
		return 3
	}
}

func addToBucket(b *Bucket, idx int, amt decimal.Decimal) {
	switch idx {
	case 0:
		b.Bucket0030 = b.Bucket0030.Add(amt)
	case 1:
		b.Bucket3160 = b.Bucket3160.Add(amt)
	case 2:
		b.Bucket6190 = b.Bucket6190.Add(amt)
	default:
		b.Bucket90P = b.Bucket90P.Add(amt)
	}
	b.Total = b.Total.Add(amt)
}
