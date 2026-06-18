package finance

import "github.com/shopspring/decimal"

// CanTransition reports whether moving an invoice from one status to another is
// allowed. hasApplications indicates whether any receipts have been applied
// (relevant for voiding).
func CanTransition(from, to InvoiceStatus, hasApplications bool) bool {
	switch from {
	case InvoiceStatusDraft:
		return to == InvoiceStatusIssued
	case InvoiceStatusIssued:
		switch to {
		case InvoiceStatusPartiallyPaid, InvoiceStatusPaid, InvoiceStatusOverdue:
			return true
		case InvoiceStatusVoid:
			return !hasApplications
		}
	case InvoiceStatusPartiallyPaid:
		switch to {
		case InvoiceStatusPaid, InvoiceStatusOverdue:
			return true
		case InvoiceStatusVoid:
			return !hasApplications
		}
	case InvoiceStatusOverdue:
		switch to {
		case InvoiceStatusPartiallyPaid, InvoiceStatusPaid:
			return true
		case InvoiceStatusVoid:
			return !hasApplications
		}
	}
	return false
}

// NextPaymentStatus returns the invoice status implied by the paid amount
// relative to the total. It never returns draft/void; callers only invoke this
// for issued invoices receiving payments.
func NextPaymentStatus(paid, total decimal.Decimal) InvoiceStatus {
	switch {
	case paid.GreaterThanOrEqual(total):
		return InvoiceStatusPaid
	case paid.Sign() > 0:
		return InvoiceStatusPartiallyPaid
	default:
		return InvoiceStatusIssued
	}
}

// NextReceivedStatus returns the received-invoice status implied by the paid
// amount relative to total.
func NextReceivedStatus(paid, total decimal.Decimal) string {
	switch {
	case paid.GreaterThanOrEqual(total):
		return "paid"
	case paid.Sign() > 0:
		return "partially_paid"
	default:
		return "pending"
	}
}
