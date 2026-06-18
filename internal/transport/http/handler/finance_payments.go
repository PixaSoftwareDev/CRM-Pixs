package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	svcfinance "pixs/internal/service/finance"
)

// ─── Payment methods / applications DTOs ─────────────────────────────────────────

type paymentMethodRequest struct {
	MethodType     string  `json:"method_type"      validate:"required"`
	CashRegisterID *string `json:"cash_register_id"`
	BankAccountID  *string `json:"bank_account_id"`
	Amount         string  `json:"amount"           validate:"required"`
	Currency       *string `json:"currency"`
	CheckNumber    *string `json:"check_number"`
	CheckDate      *string `json:"check_date"`
}

type applicationRequest struct {
	InvoiceID string `json:"invoice_id" validate:"required,uuid"`
	Amount    string `json:"amount"     validate:"required"`
}

func buildPaymentMethods(reqs []paymentMethodRequest) ([]svcfinance.PaymentMethodInput, error) {
	out := make([]svcfinance.PaymentMethodInput, 0, len(reqs))
	for _, m := range reqs {
		amt, err := parseDecimal(m.Amount)
		if err != nil {
			return nil, err
		}
		crID, err := parseUUIDPtr(m.CashRegisterID)
		if err != nil {
			return nil, err
		}
		baID, err := parseUUIDPtr(m.BankAccountID)
		if err != nil {
			return nil, err
		}
		checkDate, err := parseDatePtr(m.CheckDate)
		if err != nil {
			return nil, err
		}
		out = append(out, svcfinance.PaymentMethodInput{
			MethodType:     m.MethodType,
			CashRegisterID: crID,
			BankAccountID:  baID,
			Amount:         amt,
			Currency:       m.Currency,
			CheckNumber:    m.CheckNumber,
			CheckDate:      checkDate,
		})
	}
	return out, nil
}

// ─── Receipts ────────────────────────────────────────────────────────────────────

type createReceiptRequest struct {
	ContactID      string                 `json:"contact_id"   validate:"required,uuid"`
	Date           string                 `json:"date"         validate:"required"`
	Currency       string                 `json:"currency"     validate:"required"`
	ExchangeRate   string                 `json:"exchange_rate"`
	Notes          *string                `json:"notes"`
	PaymentMethods []paymentMethodRequest `json:"payment_methods" validate:"required,min=1"`
	Applications   []applicationRequest   `json:"applications"`
}

// CreateReceipt POST /receipts
func (h *FinanceHandler) CreateReceipt(c echo.Context) error {
	var req createReceiptRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "X-Idempotency-Key inválido")
	}
	contactID, err := uuid.Parse(req.ContactID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
	}
	date, err := parseDate(req.Date)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "date inválida")
	}
	methods, err := buildPaymentMethods(req.PaymentMethods)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "medios de pago inválidos: "+err.Error())
	}
	apps := make([]svcfinance.ApplicationInput, 0, len(req.Applications))
	for _, a := range req.Applications {
		invID, err := uuid.Parse(a.InvoiceID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invoice_id inválido")
		}
		amt, err := parseDecimal(a.Amount)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "monto de aplicación inválido")
		}
		apps = append(apps, svcfinance.ApplicationInput{InvoiceID: invID, Amount: amt})
	}
	rate := decimal.NewFromInt(1)
	if req.ExchangeRate != "" {
		if rate, err = parseDecimal(req.ExchangeRate); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "exchange_rate inválido")
		}
	}

	receipt, replayed, err := h.receipts.CreateReceipt(c.Request().Context(), companyFromCtx(c), callerID(c), svcfinance.CreateReceiptInput{
		IdempotencyKey: key,
		ContactID:      contactID,
		Date:           date,
		Currency:       req.Currency,
		ExchangeRate:   rate,
		Notes:          req.Notes,
		PaymentMethods: methods,
		Applications:   apps,
	})
	if err != nil {
		return mapFinanceError(err)
	}
	if replayed {
		return c.JSON(http.StatusOK, receipt)
	}
	return c.JSON(http.StatusCreated, receipt)
}

// ListReceipts GET /receipts
func (h *FinanceHandler) ListReceipts(c echo.Context) error {
	var f svcfinance.ReceiptFilter
	if v := c.QueryParam("contact_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.ContactID = &id
		}
	}
	if v := c.QueryParam("from"); v != "" {
		if t, err := parseDate(v); err == nil {
			f.FromDate = &t
		}
	}
	if v := c.QueryParam("to"); v != "" {
		if t, err := parseDate(v); err == nil {
			f.ToDate = &t
		}
	}
	receipts, err := h.receipts.ListReceipts(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, receipts)
}

// GetReceipt GET /receipts/:id
func (h *FinanceHandler) GetReceipt(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	receipt, err := h.receipts.GetReceipt(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, receipt)
}

// VoidReceipt DELETE /receipts/:id
func (h *FinanceHandler) VoidReceipt(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.receipts.VoidReceipt(c.Request().Context(), companyFromCtx(c), callerID(c), id); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Payment orders ──────────────────────────────────────────────────────────────

type poApplicationRequest struct {
	InvoiceReceivedID string `json:"invoice_received_id" validate:"required,uuid"`
	Amount            string `json:"amount"              validate:"required"`
}

type createPaymentOrderRequest struct {
	SupplierID     string                 `json:"supplier_id"  validate:"required,uuid"`
	Date           string                 `json:"date"         validate:"required"`
	Currency       string                 `json:"currency"     validate:"required"`
	ExchangeRate   string                 `json:"exchange_rate"`
	Notes          *string                `json:"notes"`
	PaymentMethods []paymentMethodRequest `json:"payment_methods" validate:"required,min=1"`
	Applications   []poApplicationRequest `json:"applications"`
}

// CreatePaymentOrder POST /payment-orders
func (h *FinanceHandler) CreatePaymentOrder(c echo.Context) error {
	var req createPaymentOrderRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "X-Idempotency-Key inválido")
	}
	supplierID, err := uuid.Parse(req.SupplierID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "supplier_id inválido")
	}
	date, err := parseDate(req.Date)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "date inválida")
	}
	methods, err := buildPaymentMethods(req.PaymentMethods)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "medios de pago inválidos: "+err.Error())
	}
	apps := make([]svcfinance.PaymentOrderApplicationInput, 0, len(req.Applications))
	for _, a := range req.Applications {
		invID, err := uuid.Parse(a.InvoiceReceivedID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invoice_received_id inválido")
		}
		amt, err := parseDecimal(a.Amount)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "monto de aplicación inválido")
		}
		apps = append(apps, svcfinance.PaymentOrderApplicationInput{InvoiceReceivedID: invID, Amount: amt})
	}
	rate := decimal.NewFromInt(1)
	if req.ExchangeRate != "" {
		if rate, err = parseDecimal(req.ExchangeRate); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "exchange_rate inválido")
		}
	}

	po, replayed, err := h.orders.Create(c.Request().Context(), companyFromCtx(c), callerID(c), svcfinance.CreatePaymentOrderInput{
		IdempotencyKey: key,
		SupplierID:     supplierID,
		Date:           date,
		Currency:       req.Currency,
		ExchangeRate:   rate,
		Notes:          req.Notes,
		PaymentMethods: methods,
		Applications:   apps,
	})
	if err != nil {
		return mapFinanceError(err)
	}
	if replayed {
		return c.JSON(http.StatusOK, po)
	}
	return c.JSON(http.StatusCreated, po)
}

// ListPaymentOrders GET /payment-orders
func (h *FinanceHandler) ListPaymentOrders(c echo.Context) error {
	var f svcfinance.PaymentOrderFilter
	if v := c.QueryParam("supplier_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.SupplierID = &id
		}
	}
	if v := c.QueryParam("from"); v != "" {
		if t, err := parseDate(v); err == nil {
			f.FromDate = &t
		}
	}
	if v := c.QueryParam("to"); v != "" {
		if t, err := parseDate(v); err == nil {
			f.ToDate = &t
		}
	}
	orders, err := h.orders.List(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, orders)
}

// GetPaymentOrder GET /payment-orders/:id
func (h *FinanceHandler) GetPaymentOrder(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	po, err := h.orders.Get(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, po)
}

// VoidPaymentOrder DELETE /payment-orders/:id
func (h *FinanceHandler) VoidPaymentOrder(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.orders.Void(c.Request().Context(), companyFromCtx(c), callerID(c), id); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Invoices received ───────────────────────────────────────────────────────────

type createInvoiceReceivedRequest struct {
	SupplierID   string  `json:"supplier_id"  validate:"required,uuid"`
	InvoiceType  *string `json:"invoice_type"`
	SalePoint    *int16  `json:"sale_point"`
	Number       *int32  `json:"number"`
	IssueDate    *string `json:"issue_date"`
	DueDate      *string `json:"due_date"`
	Currency     string  `json:"currency"`
	ExchangeRate string  `json:"exchange_rate"`
	NetAmount    string  `json:"net_amount"`
	TaxAmount    string  `json:"tax_amount"`
	TotalAmount  string  `json:"total_amount" validate:"required"`
	ProjectID    *string `json:"project_id"`
	Notes        *string `json:"notes"`
}

func (h *FinanceHandler) buildReceivedInput(req createInvoiceReceivedRequest) (svcfinance.CreateInvoiceReceivedInput, error) {
	var in svcfinance.CreateInvoiceReceivedInput
	supplierID, err := uuid.Parse(req.SupplierID)
	if err != nil {
		return in, err
	}
	issue, err := parseDatePtr(req.IssueDate)
	if err != nil {
		return in, err
	}
	due, err := parseDatePtr(req.DueDate)
	if err != nil {
		return in, err
	}
	projID, err := parseUUIDPtr(req.ProjectID)
	if err != nil {
		return in, err
	}
	total, err := parseDecimal(req.TotalAmount)
	if err != nil {
		return in, err
	}
	net := decimal.Zero
	if req.NetAmount != "" {
		if net, err = parseDecimal(req.NetAmount); err != nil {
			return in, err
		}
	}
	tax := decimal.Zero
	if req.TaxAmount != "" {
		if tax, err = parseDecimal(req.TaxAmount); err != nil {
			return in, err
		}
	}
	rate := decimal.NewFromInt(1)
	if req.ExchangeRate != "" {
		if rate, err = parseDecimal(req.ExchangeRate); err != nil {
			return in, err
		}
	}
	in = svcfinance.CreateInvoiceReceivedInput{
		SupplierID:   supplierID,
		InvoiceType:  req.InvoiceType,
		SalePoint:    req.SalePoint,
		Number:       req.Number,
		IssueDate:    issue,
		DueDate:      due,
		Currency:     req.Currency,
		ExchangeRate: rate,
		NetAmount:    net,
		TaxAmount:    tax,
		TotalAmount:  total,
		ProjectID:    projID,
		Notes:        req.Notes,
	}
	return in, nil
}

// CreateInvoiceReceived POST /invoices-received
func (h *FinanceHandler) CreateInvoiceReceived(c echo.Context) error {
	var req createInvoiceReceivedRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := h.buildReceivedInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos: "+err.Error())
	}
	inv, err := h.received.Create(c.Request().Context(), companyFromCtx(c), callerID(c), in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, inv)
}

// ListInvoicesReceived GET /invoices-received
func (h *FinanceHandler) ListInvoicesReceived(c echo.Context) error {
	var f svcfinance.ReceivedFilter
	if v := c.QueryParam("supplier_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.SupplierID = &id
		}
	}
	if v := c.QueryParam("status"); v != "" {
		f.Status = &v
	}
	invoices, err := h.received.List(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, invoices)
}

// GetInvoiceReceived GET /invoices-received/:id
func (h *FinanceHandler) GetInvoiceReceived(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	inv, err := h.received.Get(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, inv)
}

// UpdateInvoiceReceived PUT /invoices-received/:id
func (h *FinanceHandler) UpdateInvoiceReceived(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req createInvoiceReceivedRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := h.buildReceivedInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos: "+err.Error())
	}
	inv, err := h.received.Update(c.Request().Context(), companyFromCtx(c), callerID(c), id, in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, inv)
}

// SoftDeleteInvoiceReceived DELETE /invoices-received/:id
func (h *FinanceHandler) SoftDeleteInvoiceReceived(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.received.Delete(c.Request().Context(), companyFromCtx(c), callerID(c), id); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
