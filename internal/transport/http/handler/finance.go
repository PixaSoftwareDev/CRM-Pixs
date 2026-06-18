package handler

import (
	"net/http"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	domainfinance "pixs/internal/domain/finance"
	svcfinance "pixs/internal/service/finance"
	mw "pixs/internal/transport/http/middleware"
)

// FinanceHandler handles all finance routes.
type FinanceHandler struct {
	invoices  *svcfinance.InvoiceService
	received  *svcfinance.InvoiceReceivedService
	receipts  *svcfinance.ReceiptService
	orders    *svcfinance.PaymentOrderService
	cash      *svcfinance.CashService
	banks     *svcfinance.BankService
	expenses  *svcfinance.ExpenseService
	recurring *svcfinance.RecurringService
	cashflow  *svcfinance.CashFlowService
	ctacte    *svcfinance.CtaCteService
	catalog   *svcfinance.CatalogService
}

// NewFinanceHandler constructs a FinanceHandler.
func NewFinanceHandler(
	invoices *svcfinance.InvoiceService,
	received *svcfinance.InvoiceReceivedService,
	receipts *svcfinance.ReceiptService,
	orders *svcfinance.PaymentOrderService,
	cash *svcfinance.CashService,
	banks *svcfinance.BankService,
	expenses *svcfinance.ExpenseService,
	recurring *svcfinance.RecurringService,
	cashflow *svcfinance.CashFlowService,
	ctacte *svcfinance.CtaCteService,
	catalog *svcfinance.CatalogService,
) *FinanceHandler {
	return &FinanceHandler{
		invoices: invoices, received: received, receipts: receipts, orders: orders,
		cash: cash, banks: banks, expenses: expenses, recurring: recurring,
		cashflow: cashflow, ctacte: ctacte, catalog: catalog,
	}
}

// ─── Error mapping ──────────────────────────────────────────────────────────────

func mapFinanceError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domainfinance.ErrInvoiceNotFound),
		errors.Is(err, domainfinance.ErrReceiptNotFound),
		errors.Is(err, domainfinance.ErrPaymentOrderNotFound),
		errors.Is(err, domainfinance.ErrInvoiceReceivedNotFound),
		errors.Is(err, domainfinance.ErrCashRegisterNotFound),
		errors.Is(err, domainfinance.ErrBankAccountNotFound),
		errors.Is(err, domainfinance.ErrExpenseNotFound),
		errors.Is(err, domainfinance.ErrRecurringNotFound),
		errors.Is(err, domainfinance.ErrObligationNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainfinance.ErrInvoiceHasApplications),
		errors.Is(err, domainfinance.ErrSessionAlreadyOpen):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainfinance.ErrInvoiceNotDraft),
		errors.Is(err, domainfinance.ErrInvalidInvoiceType),
		errors.Is(err, domainfinance.ErrInvalidInvoiceStatus),
		errors.Is(err, domainfinance.ErrInvalidStatusTransition),
		errors.Is(err, domainfinance.ErrNoItems),
		errors.Is(err, domainfinance.ErrApplicationExceedsReceipt),
		errors.Is(err, domainfinance.ErrApplicationExceedsBalance),
		errors.Is(err, domainfinance.ErrNoPaymentMethods),
		errors.Is(err, domainfinance.ErrNoOpenSession),
		errors.Is(err, domainfinance.ErrInvalidExpenseStatus),
		errors.Is(err, domainfinance.ErrInvalidAmount),
		errors.Is(err, domainfinance.ErrInvalidCurrency):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

// ─── Small parse helpers ────────────────────────────────────────────────────────

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}

func parseDecimal(s string) (decimal.Decimal, error) {
	return decimal.NewFromString(s)
}

func idempotencyKey(c echo.Context) (uuid.UUID, error) {
	raw := c.Request().Header.Get("X-Idempotency-Key")
	if raw == "" {
		return uuid.Nil, errors.New("X-Idempotency-Key requerido")
	}
	return uuid.Parse(raw)
}

func callerID(c echo.Context) uuid.UUID {
	return mw.SessionFromContext(c).UserID
}
