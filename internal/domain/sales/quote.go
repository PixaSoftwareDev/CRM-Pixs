package sales

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// QuoteStatus is the lifecycle status of a quote.
type QuoteStatus string

// Quote statuses.
const (
	QuoteStatusDraft    QuoteStatus = "draft"
	QuoteStatusSent     QuoteStatus = "sent"
	QuoteStatusViewed   QuoteStatus = "viewed"
	QuoteStatusAccepted QuoteStatus = "accepted"
	QuoteStatusRejected QuoteStatus = "rejected"
	QuoteStatusExpired  QuoteStatus = "expired"
)

// ParseQuoteStatus validates and parses a quote status string.
func ParseQuoteStatus(s string) (QuoteStatus, error) {
	switch QuoteStatus(s) {
	case QuoteStatusDraft, QuoteStatusSent, QuoteStatusViewed,
		QuoteStatusAccepted, QuoteStatusRejected, QuoteStatusExpired:
		return QuoteStatus(s), nil
	}
	return "", ErrInvalidQuoteStatus
}

// ShouldVersion returns true if editing a quote in this status should create a new version.
func (s QuoteStatus) ShouldVersion() bool {
	return s == QuoteStatusSent || s == QuoteStatusAccepted || s == QuoteStatusViewed
}

// Quote is a sales quote (presupuesto) with line items and totals.
type Quote struct {
	ID            uuid.UUID
	CompanyID     uuid.UUID
	Number        string
	ContactID     uuid.UUID
	OpportunityID *uuid.UUID
	UserID        uuid.UUID
	Date          time.Time
	ValidUntil    *time.Time
	Currency      string
	ExchangeRate  decimal.Decimal
	Status        QuoteStatus
	Version       int16
	ParentID      *uuid.UUID
	Notes         *string
	Subtotal      decimal.Decimal
	TaxTotal      decimal.Decimal
	Total         decimal.Decimal
	Items         []*QuoteItem
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     *time.Time
}

// QuoteItem is a single line on a quote.
type QuoteItem struct {
	ID           uuid.UUID
	QuoteID      uuid.UUID
	ProductID    *uuid.UUID
	Description  string
	Quantity     decimal.Decimal
	UnitPrice    decimal.Decimal
	DiscountPct  decimal.Decimal
	VATRatePct   decimal.Decimal
	LineSubtotal decimal.Decimal
	LineTax      decimal.Decimal
	LineTotal    decimal.Decimal
	OrderPos     *int16
}

// QuoteTotals is the computed result of CalculateTotals.
type QuoteTotals struct {
	Subtotal decimal.Decimal
	TaxTotal decimal.Decimal
	Total    decimal.Decimal
	Items    []QuoteItemCalc
}

// QuoteItemCalc holds the computed amounts for a single line.
type QuoteItemCalc struct {
	LineSubtotal decimal.Decimal
	LineTax      decimal.Decimal
	LineTotal    decimal.Decimal
}

// QuoteItemInput is the raw input used to compute line and quote totals.
type QuoteItemInput struct {
	Quantity    decimal.Decimal
	UnitPrice   decimal.Decimal
	DiscountPct decimal.Decimal
	VATRatePct  decimal.Decimal
}

// CalculateTotals computes line amounts and quote totals from the given item inputs.
// All arithmetic uses decimal with bankers' rounding to 2 decimal places.
func CalculateTotals(items []QuoteItemInput) QuoteTotals {
	var totals QuoteTotals
	totals.Items = make([]QuoteItemCalc, len(items))

	for i, item := range items {
		// line_subtotal = quantity × unit_price × (1 - discount_pct/100)
		discountFactor := decimal.NewFromInt(1).Sub(
			item.DiscountPct.Div(decimal.NewFromInt(100)),
		)
		lineSubtotal := item.Quantity.Mul(item.UnitPrice).Mul(discountFactor).
			RoundBank(2)

		// line_tax = line_subtotal × vat_rate_pct / 100
		lineTax := lineSubtotal.Mul(item.VATRatePct).
			Div(decimal.NewFromInt(100)).
			RoundBank(2)

		lineTotal := lineSubtotal.Add(lineTax)

		totals.Items[i] = QuoteItemCalc{
			LineSubtotal: lineSubtotal,
			LineTax:      lineTax,
			LineTotal:    lineTotal,
		}
		totals.Subtotal = totals.Subtotal.Add(lineSubtotal)
		totals.TaxTotal = totals.TaxTotal.Add(lineTax)
	}
	totals.Total = totals.Subtotal.Add(totals.TaxTotal)
	return totals
}
