package sales

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
)

func TestForecast_Empty(t *testing.T) {
	assert.True(t, Forecast(nil).Equal(decimal.Zero))
	assert.True(t, Forecast([]*Opportunity{}).Equal(decimal.Zero))
}

func TestForecast_AllNilAmounts(t *testing.T) {
	opps := []*Opportunity{
		{Amount: nil, ProbabilityPct: ptr(dec("50"))},
		{Amount: nil, ProbabilityPct: nil},
	}
	assert.True(t, Forecast(opps).Equal(decimal.Zero))
}

func TestForecast_Mixed(t *testing.T) {
	// Only the first contributes: 1000 * 50 / 100 = 500
	opps := []*Opportunity{
		{Amount: ptr(dec("1000")), ProbabilityPct: ptr(dec("50"))},
		{Amount: nil, ProbabilityPct: ptr(dec("80"))},
		{Amount: ptr(dec("500")), ProbabilityPct: nil},
	}
	assert.True(t, Forecast(opps).Equal(dec("500")), "forecast=%s", Forecast(opps))
}

func TestForecast_MultipleWeightedSum(t *testing.T) {
	// 1000*50% = 500 ; 2000*25% = 500 ; 400*100% = 400 → 1400
	opps := []*Opportunity{
		{Amount: ptr(dec("1000")), ProbabilityPct: ptr(dec("50"))},
		{Amount: ptr(dec("2000")), ProbabilityPct: ptr(dec("25"))},
		{Amount: ptr(dec("400")), ProbabilityPct: ptr(dec("100"))},
	}
	assert.True(t, Forecast(opps).Equal(dec("1400")), "forecast=%s", Forecast(opps))
}
