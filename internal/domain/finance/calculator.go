package finance

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

var hundred = decimal.NewFromInt(100)

// InvoiceItemInput is the raw input for computing invoice totals.
type InvoiceItemInput struct {
	Quantity    decimal.Decimal
	UnitPrice   decimal.Decimal
	DiscountPct decimal.Decimal
	VATRatePct  decimal.Decimal
	VATRateID   *uuid.UUID
}

// LineCalc holds the computed amounts for a single invoice line.
type LineCalc struct {
	LineNet   decimal.Decimal
	LineTax   decimal.Decimal
	LineTotal decimal.Decimal
}

// VATBucket aggregates net and tax amounts for a single VAT rate.
type VATBucket struct {
	RatePct decimal.Decimal
	Base    decimal.Decimal
	Tax     decimal.Decimal
}

// InvoiceTotals is the computed result of CalculateInvoiceTotals.
type InvoiceTotals struct {
	Net        decimal.Decimal
	Tax        decimal.Decimal
	Total      decimal.Decimal
	Lines      []LineCalc
	VATBuckets []VATBucket
}

// CalculateInvoiceTotals computes per-line net/tax/total, aggregated VAT
// buckets, and invoice net/tax/total. All arithmetic uses banker's rounding
// to 2 decimal places.
func CalculateInvoiceTotals(items []InvoiceItemInput) InvoiceTotals {
	var totals InvoiceTotals
	totals.Lines = make([]LineCalc, len(items))

	// Aggregate VAT buckets keyed by rate string to keep deterministic order.
	bucketIdx := make(map[string]int)

	for i, item := range items {
		discountFactor := decimal.NewFromInt(1).Sub(item.DiscountPct.Div(hundred))
		lineNet := item.Quantity.Mul(item.UnitPrice).Mul(discountFactor).RoundBank(2)
		lineTax := lineNet.Mul(item.VATRatePct).Div(hundred).RoundBank(2)
		lineTotal := lineNet.Add(lineTax)

		totals.Lines[i] = LineCalc{LineNet: lineNet, LineTax: lineTax, LineTotal: lineTotal}
		totals.Net = totals.Net.Add(lineNet)
		totals.Tax = totals.Tax.Add(lineTax)

		key := item.VATRatePct.String()
		if idx, ok := bucketIdx[key]; ok {
			totals.VATBuckets[idx].Base = totals.VATBuckets[idx].Base.Add(lineNet)
			totals.VATBuckets[idx].Tax = totals.VATBuckets[idx].Tax.Add(lineTax)
		} else {
			bucketIdx[key] = len(totals.VATBuckets)
			totals.VATBuckets = append(totals.VATBuckets, VATBucket{
				RatePct: item.VATRatePct,
				Base:    lineNet,
				Tax:     lineTax,
			})
		}
	}
	totals.Total = totals.Net.Add(totals.Tax)
	return totals
}

// ConvertCurrency returns amount * rate, rounded to 2 decimal places.
func ConvertCurrency(amount, rate decimal.Decimal) decimal.Decimal {
	return amount.Mul(rate).RoundBank(2)
}

// AgingInvoice is the minimal info needed to classify an invoice for aging.
type AgingInvoice struct {
	ID        uuid.UUID
	DueDate   time.Time
	Remaining decimal.Decimal
}

// AgingReport classifies outstanding amounts into aging buckets.
type AgingReport struct {
	Current   decimal.Decimal // not yet due (due date in the future) or 0–30 overdue
	Bucket30  decimal.Decimal // 0–30 days overdue
	Bucket60  decimal.Decimal // 31–60 days overdue
	Bucket90  decimal.Decimal // 61–90 days overdue
	Bucket90P decimal.Decimal // 90+ days overdue
	Total     decimal.Decimal
}

// AgingBuckets classifies invoices into 0-30/31-60/61-90/90+ day buckets,
// measured by how many days past the due date the invoice is as of asOf.
func AgingBuckets(invoices []AgingInvoice, asOf time.Time) AgingReport {
	var r AgingReport
	for _, inv := range invoices {
		days := int(asOf.Sub(inv.DueDate).Hours() / 24)
		switch {
		case days <= 30:
			r.Bucket30 = r.Bucket30.Add(inv.Remaining)
		case days <= 60:
			r.Bucket60 = r.Bucket60.Add(inv.Remaining)
		case days <= 90:
			r.Bucket90 = r.Bucket90.Add(inv.Remaining)
		default:
			r.Bucket90P = r.Bucket90P.Add(inv.Remaining)
		}
		r.Total = r.Total.Add(inv.Remaining)
	}
	r.Current = r.Bucket30
	return r
}

// ApplicationInput is one application of a payment to an invoice.
type ApplicationInput struct {
	InvoiceID uuid.UUID
	Amount    decimal.Decimal
}

// ValidateApplicationSum returns an error if the applications exceed the
// receipt total, or if any single invoice's application exceeds its remaining
// balance. invoiceBalances maps invoice ID → remaining payable amount.
func ValidateApplicationSum(
	receiptTotal decimal.Decimal,
	apps []ApplicationInput,
	invoiceBalances map[uuid.UUID]decimal.Decimal,
) error {
	sum := decimal.Zero
	for _, a := range apps {
		if a.Amount.Sign() <= 0 {
			return ErrInvalidAmount
		}
		bal, ok := invoiceBalances[a.InvoiceID]
		if !ok {
			return ErrInvoiceNotFound
		}
		if a.Amount.GreaterThan(bal) {
			return ErrApplicationExceedsBalance
		}
		sum = sum.Add(a.Amount)
	}
	if sum.GreaterThan(receiptTotal) {
		return ErrApplicationExceedsReceipt
	}
	return nil
}
