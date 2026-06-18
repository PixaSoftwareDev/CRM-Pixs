package sales

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
)

func dec(s string) decimal.Decimal {
	d, _ := decimal.NewFromString(s)
	return d
}

func TestCalculateTotals_SimpleNoDiscount21(t *testing.T) {
	// qty=10, price=100, discount=0%, vat=21% → subtotal=1000, tax=210, total=1210
	tot := CalculateTotals([]QuoteItemInput{
		{Quantity: dec("10"), UnitPrice: dec("100"), DiscountPct: dec("0"), VATRatePct: dec("21")},
	})
	assert.True(t, tot.Subtotal.Equal(dec("1000")), "subtotal=%s", tot.Subtotal)
	assert.True(t, tot.TaxTotal.Equal(dec("210")), "tax=%s", tot.TaxTotal)
	assert.True(t, tot.Total.Equal(dec("1210")), "total=%s", tot.Total)
	assert.True(t, tot.Items[0].LineSubtotal.Equal(dec("1000")))
	assert.True(t, tot.Items[0].LineTotal.Equal(dec("1210")))
}

func TestCalculateTotals_WithDiscount(t *testing.T) {
	// qty=5, price=200, discount=10%, vat=10.5% → subtotal=900, tax=94.5, total=994.5
	tot := CalculateTotals([]QuoteItemInput{
		{Quantity: dec("5"), UnitPrice: dec("200"), DiscountPct: dec("10"), VATRatePct: dec("10.5")},
	})
	assert.True(t, tot.Subtotal.Equal(dec("900")), "subtotal=%s", tot.Subtotal)
	assert.True(t, tot.TaxTotal.Equal(dec("94.5")), "tax=%s", tot.TaxTotal)
	assert.True(t, tot.Total.Equal(dec("994.5")), "total=%s", tot.Total)
}

func TestCalculateTotals_MultipleVATRates(t *testing.T) {
	// item1: qty=2 price=100 0% disc vat=0%   → sub=200 tax=0
	// item2: qty=1 price=100 0% disc vat=10.5% → sub=100 tax=10.5
	// item3: qty=1 price=100 0% disc vat=21%   → sub=100 tax=21
	tot := CalculateTotals([]QuoteItemInput{
		{Quantity: dec("2"), UnitPrice: dec("100"), DiscountPct: dec("0"), VATRatePct: dec("0")},
		{Quantity: dec("1"), UnitPrice: dec("100"), DiscountPct: dec("0"), VATRatePct: dec("10.5")},
		{Quantity: dec("1"), UnitPrice: dec("100"), DiscountPct: dec("0"), VATRatePct: dec("21")},
	})
	assert.True(t, tot.Subtotal.Equal(dec("400")), "subtotal=%s", tot.Subtotal)
	assert.True(t, tot.TaxTotal.Equal(dec("31.5")), "tax=%s", tot.TaxTotal)
	assert.True(t, tot.Total.Equal(dec("431.5")), "total=%s", tot.Total)
}

func TestCalculateTotals_FractionalQuantities(t *testing.T) {
	// qty=2.5, price=99.99, discount=0%, vat=21%
	// subtotal = 2.5 * 99.99 = 249.975 → rounds (bank) to 249.98
	// tax = 249.98 * 0.21 = 52.4958 → 52.50
	tot := CalculateTotals([]QuoteItemInput{
		{Quantity: dec("2.5"), UnitPrice: dec("99.99"), DiscountPct: dec("0"), VATRatePct: dec("21")},
	})
	assert.True(t, tot.Subtotal.Equal(dec("249.98")), "subtotal=%s", tot.Subtotal)
	assert.True(t, tot.TaxTotal.Equal(dec("52.50")), "tax=%s", tot.TaxTotal)
	assert.True(t, tot.Total.Equal(dec("302.48")), "total=%s", tot.Total)
}

func TestParseQuoteStatus(t *testing.T) {
	s, err := ParseQuoteStatus("sent")
	assert.NoError(t, err)
	assert.Equal(t, QuoteStatusSent, s)

	_, err = ParseQuoteStatus("bogus")
	assert.Error(t, err)
}

func TestShouldVersion(t *testing.T) {
	assert.False(t, QuoteStatusDraft.ShouldVersion())
	assert.True(t, QuoteStatusSent.ShouldVersion())
	assert.True(t, QuoteStatusViewed.ShouldVersion())
	assert.True(t, QuoteStatusAccepted.ShouldVersion())
	assert.False(t, QuoteStatusRejected.ShouldVersion())
}
