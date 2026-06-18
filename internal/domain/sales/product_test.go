package sales

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptr(d decimal.Decimal) *decimal.Decimal { return &d }

func TestMargin_Normal(t *testing.T) {
	p := &Product{UnitPrice: ptr(dec("100")), Cost: ptr(dec("60"))}
	m := p.Margin()
	require.NotNil(t, m)
	assert.True(t, m.Equal(dec("0.4")), "margin=%s", m)
}

func TestMargin_ZeroCost(t *testing.T) {
	p := &Product{UnitPrice: ptr(dec("100")), Cost: ptr(dec("0"))}
	m := p.Margin()
	require.NotNil(t, m)
	assert.True(t, m.Equal(dec("1")), "margin=%s", m)
}

func TestMargin_NilUnitPrice(t *testing.T) {
	p := &Product{UnitPrice: nil, Cost: ptr(dec("60"))}
	assert.Nil(t, p.Margin())
}

func TestMargin_ZeroUnitPrice(t *testing.T) {
	p := &Product{UnitPrice: ptr(dec("0")), Cost: ptr(dec("60"))}
	assert.Nil(t, p.Margin())
}

func TestMargin_NilCost(t *testing.T) {
	p := &Product{UnitPrice: ptr(dec("100")), Cost: nil}
	assert.Nil(t, p.Margin())
}
