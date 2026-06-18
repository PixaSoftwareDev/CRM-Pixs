package finance

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCanTransition_Valid(t *testing.T) {
	cases := []struct {
		from, to InvoiceStatus
		hasApps  bool
	}{
		{InvoiceStatusDraft, InvoiceStatusIssued, false},
		{InvoiceStatusIssued, InvoiceStatusPartiallyPaid, false},
		{InvoiceStatusIssued, InvoiceStatusPaid, false},
		{InvoiceStatusIssued, InvoiceStatusOverdue, false},
		{InvoiceStatusIssued, InvoiceStatusVoid, false},
		{InvoiceStatusPartiallyPaid, InvoiceStatusPaid, false},
		{InvoiceStatusPartiallyPaid, InvoiceStatusOverdue, false},
		{InvoiceStatusOverdue, InvoiceStatusPaid, false},
		{InvoiceStatusOverdue, InvoiceStatusVoid, false},
	}
	for _, c := range cases {
		assert.True(t, CanTransition(c.from, c.to, c.hasApps),
			"expected %s→%s allowed", c.from, c.to)
	}
}

func TestCanTransition_Invalid(t *testing.T) {
	cases := []struct {
		from, to InvoiceStatus
		hasApps  bool
	}{
		{InvoiceStatusDraft, InvoiceStatusPaid, false},
		{InvoiceStatusDraft, InvoiceStatusVoid, false},
		{InvoiceStatusPaid, InvoiceStatusIssued, false},
		{InvoiceStatusVoid, InvoiceStatusIssued, false},
		{InvoiceStatusPaid, InvoiceStatusVoid, false},
		// Voiding is blocked when applications exist.
		{InvoiceStatusIssued, InvoiceStatusVoid, true},
		{InvoiceStatusPartiallyPaid, InvoiceStatusVoid, true},
	}
	for _, c := range cases {
		assert.False(t, CanTransition(c.from, c.to, c.hasApps),
			"expected %s→%s blocked (hasApps=%v)", c.from, c.to, c.hasApps)
	}
}

func TestNextPaymentStatus(t *testing.T) {
	assert.Equal(t, InvoiceStatusPaid, NextPaymentStatus(dec("100"), dec("100")))
	assert.Equal(t, InvoiceStatusPaid, NextPaymentStatus(dec("150"), dec("100")))
	assert.Equal(t, InvoiceStatusPartiallyPaid, NextPaymentStatus(dec("50"), dec("100")))
	assert.Equal(t, InvoiceStatusIssued, NextPaymentStatus(dec("0"), dec("100")))
}

func TestNextReceivedStatus(t *testing.T) {
	assert.Equal(t, "paid", NextReceivedStatus(dec("100"), dec("100")))
	assert.Equal(t, "partially_paid", NextReceivedStatus(dec("40"), dec("100")))
	assert.Equal(t, "pending", NextReceivedStatus(dec("0"), dec("100")))
}
