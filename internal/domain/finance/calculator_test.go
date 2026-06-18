package finance

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func dec(s string) decimal.Decimal {
	d, _ := decimal.NewFromString(s)
	return d
}

func TestCalculateInvoiceTotals_MixedVAT(t *testing.T) {
	// item1: qty=10, price=1000, disc=0%, vat=21% → net=10000, tax=2100, total=12100
	// item2: qty=5,  price=200,  disc=5%, vat=10.5% → net=950, tax=99.75, total=1049.75
	// totals: net=10950, tax=2199.75, total=13149.75
	tot := CalculateInvoiceTotals([]InvoiceItemInput{
		{Quantity: dec("10"), UnitPrice: dec("1000"), DiscountPct: dec("0"), VATRatePct: dec("21")},
		{Quantity: dec("5"), UnitPrice: dec("200"), DiscountPct: dec("5"), VATRatePct: dec("10.5")},
	})

	assert.True(t, tot.Net.Equal(dec("10950")), "net=%s", tot.Net)
	assert.True(t, tot.Tax.Equal(dec("2199.75")), "tax=%s", tot.Tax)
	assert.True(t, tot.Total.Equal(dec("13149.75")), "total=%s", tot.Total)

	require.Len(t, tot.Lines, 2)
	assert.True(t, tot.Lines[0].LineNet.Equal(dec("10000")))
	assert.True(t, tot.Lines[0].LineTax.Equal(dec("2100")))
	assert.True(t, tot.Lines[1].LineNet.Equal(dec("950")))
	assert.True(t, tot.Lines[1].LineTax.Equal(dec("99.75")))

	// Two distinct VAT buckets, each with the right base and tax.
	require.Len(t, tot.VATBuckets, 2)
	b21 := tot.VATBuckets[0]
	b105 := tot.VATBuckets[1]
	assert.True(t, b21.RatePct.Equal(dec("21")))
	assert.True(t, b21.Base.Equal(dec("10000")))
	assert.True(t, b21.Tax.Equal(dec("2100")))
	assert.True(t, b105.RatePct.Equal(dec("10.5")))
	assert.True(t, b105.Base.Equal(dec("950")))
	assert.True(t, b105.Tax.Equal(dec("99.75")))
}

func TestConvertCurrency(t *testing.T) {
	// 1000 ARS at rate 0.001 USD/ARS → 1.00 USD
	got := ConvertCurrency(dec("1000"), dec("0.001"))
	assert.True(t, got.Equal(dec("1.00")), "got=%s", got)

	// 100 USD at 1000 ARS/USD → 100000 ARS
	got2 := ConvertCurrency(dec("100"), dec("1000"))
	assert.True(t, got2.Equal(dec("100000")), "got=%s", got2)
}

func TestAgingBuckets(t *testing.T) {
	asOf := time.Date(2026, 6, 17, 0, 0, 0, 0, time.UTC)
	mk := func(daysOverdue int, amt string) AgingInvoice {
		return AgingInvoice{
			ID:        uuid.New(),
			DueDate:   asOf.AddDate(0, 0, -daysOverdue),
			Remaining: dec(amt),
		}
	}
	// 5d → bucket30, 35d → bucket60, 65d → bucket90, 95d → bucket90P
	report := AgingBuckets([]AgingInvoice{
		mk(5, "100"),
		mk(35, "200"),
		mk(65, "300"),
		mk(95, "400"),
	}, asOf)

	assert.True(t, report.Bucket30.Equal(dec("100")), "b30=%s", report.Bucket30)
	assert.True(t, report.Bucket60.Equal(dec("200")), "b60=%s", report.Bucket60)
	assert.True(t, report.Bucket90.Equal(dec("300")), "b90=%s", report.Bucket90)
	assert.True(t, report.Bucket90P.Equal(dec("400")), "b90p=%s", report.Bucket90P)
	assert.True(t, report.Total.Equal(dec("1000")), "total=%s", report.Total)
}

func TestValidateApplicationSum(t *testing.T) {
	inv1 := uuid.New()
	inv2 := uuid.New()
	balances := map[uuid.UUID]decimal.Decimal{
		inv1: dec("5000"),
		inv2: dec("3000"),
	}

	// Within bounds → ok.
	err := ValidateApplicationSum(dec("8000"), []ApplicationInput{
		{InvoiceID: inv1, Amount: dec("5000")},
		{InvoiceID: inv2, Amount: dec("3000")},
	}, balances)
	assert.NoError(t, err)

	// Sum exceeds receipt total → error.
	err = ValidateApplicationSum(dec("5000"), []ApplicationInput{
		{InvoiceID: inv1, Amount: dec("4000")},
		{InvoiceID: inv2, Amount: dec("3000")},
	}, balances)
	assert.ErrorIs(t, err, ErrApplicationExceedsReceipt)

	// Single application exceeds invoice balance → error.
	err = ValidateApplicationSum(dec("10000"), []ApplicationInput{
		{InvoiceID: inv1, Amount: dec("6000")},
	}, balances)
	assert.ErrorIs(t, err, ErrApplicationExceedsBalance)
}
