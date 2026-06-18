// Package finance holds the domain model for invoicing, receipts, payment
// orders, treasury (cash and banks), expenses, and payment obligations.
// It has no infrastructure dependencies.
package finance

import "github.com/cockroachdb/errors"

var (
	// ErrInvoiceNotFound is returned when an invoice cannot be found.
	ErrInvoiceNotFound = errors.New("factura no encontrada")
	// ErrInvoiceNotDraft is returned when an operation requires a draft invoice.
	ErrInvoiceNotDraft = errors.New("la factura no está en estado borrador")
	// ErrInvoiceHasApplications is returned when voiding an invoice with receipts applied.
	ErrInvoiceHasApplications = errors.New("la factura tiene cobros aplicados y no puede anularse")
	// ErrInvalidInvoiceType is returned for an invalid invoice type letter.
	ErrInvalidInvoiceType = errors.New("tipo de factura inválido")
	// ErrInvalidInvoiceStatus is returned for an invalid invoice status.
	ErrInvalidInvoiceStatus = errors.New("estado de factura inválido")
	// ErrInvalidStatusTransition is returned for a disallowed state transition.
	ErrInvalidStatusTransition = errors.New("transición de estado inválida")
	// ErrNoItems is returned when an invoice has no line items.
	ErrNoItems = errors.New("la factura debe tener al menos un ítem")

	// ErrReceiptNotFound is returned when a receipt cannot be found.
	ErrReceiptNotFound = errors.New("recibo no encontrado")
	// ErrApplicationExceedsReceipt is returned when applications exceed the receipt total.
	ErrApplicationExceedsReceipt = errors.New("la suma de aplicaciones supera el total del recibo")
	// ErrApplicationExceedsBalance is returned when an application exceeds an invoice balance.
	ErrApplicationExceedsBalance = errors.New("la aplicación supera el saldo pendiente de la factura")
	// ErrNoPaymentMethods is returned when a receipt or payment order has no methods.
	ErrNoPaymentMethods = errors.New("debe indicar al menos un medio de pago")

	// ErrPaymentOrderNotFound is returned when a payment order cannot be found.
	ErrPaymentOrderNotFound = errors.New("orden de pago no encontrada")
	// ErrInvoiceReceivedNotFound is returned when a received invoice cannot be found.
	ErrInvoiceReceivedNotFound = errors.New("factura recibida no encontrada")

	// ErrCashRegisterNotFound is returned when a cash register cannot be found.
	ErrCashRegisterNotFound = errors.New("caja no encontrada")
	// ErrSessionAlreadyOpen is returned when a register already has an open session.
	ErrSessionAlreadyOpen = errors.New("la caja ya tiene una sesión abierta")
	// ErrNoOpenSession is returned when no open session exists for a register.
	ErrNoOpenSession = errors.New("la caja no tiene una sesión abierta")
	// ErrBankAccountNotFound is returned when a bank account cannot be found.
	ErrBankAccountNotFound = errors.New("cuenta bancaria no encontrada")

	// ErrExpenseNotFound is returned when an expense cannot be found.
	ErrExpenseNotFound = errors.New("gasto no encontrado")
	// ErrInvalidExpenseStatus is returned for an invalid expense status.
	ErrInvalidExpenseStatus = errors.New("estado de gasto inválido")

	// ErrRecurringNotFound is returned when a recurring payment cannot be found.
	ErrRecurringNotFound = errors.New("pago recurrente no encontrado")
	// ErrObligationNotFound is returned when a payment obligation cannot be found.
	ErrObligationNotFound = errors.New("obligación de pago no encontrada")

	// ErrInvalidAmount is returned when a monetary amount is invalid (<= 0).
	ErrInvalidAmount = errors.New("monto inválido")
	// ErrInvalidCurrency is returned for an unsupported currency code.
	ErrInvalidCurrency = errors.New("moneda inválida")
)
