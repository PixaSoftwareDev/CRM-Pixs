package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	svcfinance "pixs/internal/service/finance"
)

// ─── DTOs ────────────────────────────────────────────────────────────────────────

type invoiceItemRequest struct {
	ProductID   *string `json:"product_id"`
	Description string  `json:"description"   validate:"required"`
	Quantity    string  `json:"quantity"      validate:"required"`
	UnitPrice   string  `json:"unit_price"    validate:"required"`
	DiscountPct string  `json:"discount_pct"`
	VATRatePct  string  `json:"vat_rate_pct"`
	VATRateID   *string `json:"vat_rate_id"`
	OrderPos    *int16  `json:"order_pos"`
}

type createInvoiceRequest struct {
	InvoiceType        string               `json:"invoice_type"  validate:"required"`
	SalePoint          int16                `json:"sale_point"`
	ContactID          string               `json:"contact_id"    validate:"required,uuid"`
	IssueDate          string               `json:"issue_date"    validate:"required"`
	DueDate            *string              `json:"due_date"`
	PaymentConditionID *string              `json:"payment_condition_id"`
	Currency           string               `json:"currency"      validate:"required"`
	ExchangeRate       string               `json:"exchange_rate"`
	ExchangeRateDate   *string              `json:"exchange_rate_date"`
	ProjectID          *string              `json:"project_id"`
	QuoteID            *string              `json:"quote_id"`
	Notes              *string              `json:"notes"`
	Items              []invoiceItemRequest `json:"items"         validate:"required,min=1"`
}

func (h *FinanceHandler) buildInvoiceInput(req createInvoiceRequest) (svcfinance.CreateInvoiceInput, error) {
	var in svcfinance.CreateInvoiceInput
	contactID, err := uuid.Parse(req.ContactID)
	if err != nil {
		return in, err
	}
	issue, err := parseDate(req.IssueDate)
	if err != nil {
		return in, err
	}
	due, err := parseDatePtr(req.DueDate)
	if err != nil {
		return in, err
	}
	pcID, err := parseUUIDPtr(req.PaymentConditionID)
	if err != nil {
		return in, err
	}
	projID, err := parseUUIDPtr(req.ProjectID)
	if err != nil {
		return in, err
	}
	quoteID, err := parseUUIDPtr(req.QuoteID)
	if err != nil {
		return in, err
	}
	erDate, err := parseDatePtr(req.ExchangeRateDate)
	if err != nil {
		return in, err
	}
	rate := decimal.NewFromInt(1)
	if req.ExchangeRate != "" {
		rate, err = parseDecimal(req.ExchangeRate)
		if err != nil {
			return in, err
		}
	}

	items := make([]svcfinance.InvoiceItemInput, 0, len(req.Items))
	for _, it := range req.Items {
		qty, err := parseDecimal(it.Quantity)
		if err != nil {
			return in, err
		}
		price, err := parseDecimal(it.UnitPrice)
		if err != nil {
			return in, err
		}
		disc := decimal.Zero
		if it.DiscountPct != "" {
			if disc, err = parseDecimal(it.DiscountPct); err != nil {
				return in, err
			}
		}
		vat := decimal.Zero
		if it.VATRatePct != "" {
			if vat, err = parseDecimal(it.VATRatePct); err != nil {
				return in, err
			}
		}
		prodID, err := parseUUIDPtr(it.ProductID)
		if err != nil {
			return in, err
		}
		vatID, err := parseUUIDPtr(it.VATRateID)
		if err != nil {
			return in, err
		}
		items = append(items, svcfinance.InvoiceItemInput{
			ProductID:   prodID,
			Description: it.Description,
			Quantity:    qty,
			UnitPrice:   price,
			DiscountPct: disc,
			VATRatePct:  vat,
			VATRateID:   vatID,
			OrderPos:    it.OrderPos,
		})
	}

	in = svcfinance.CreateInvoiceInput{
		InvoiceType:        req.InvoiceType,
		SalePoint:          req.SalePoint,
		ContactID:          contactID,
		IssueDate:          issue,
		DueDate:            due,
		PaymentConditionID: pcID,
		Currency:           req.Currency,
		ExchangeRate:       rate,
		ProjectID:          projID,
		QuoteID:            quoteID,
		Notes:              req.Notes,
		Items:              items,
	}
	if erDate != nil {
		in.ExchangeRateDate = *erDate
	}
	return in, nil
}

// CreateInvoiceDraft POST /invoices
func (h *FinanceHandler) CreateInvoiceDraft(c echo.Context) error {
	var req createInvoiceRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := h.buildInvoiceInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos: "+err.Error())
	}
	in.IdempotencyKey = uuid.New()
	inv, err := h.invoices.CreateDraft(c.Request().Context(), companyFromCtx(c), callerID(c), in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, inv)
}

// ListInvoices GET /invoices
func (h *FinanceHandler) ListInvoices(c echo.Context) error {
	var f svcfinance.InvoiceFilter
	if v := c.QueryParam("contact_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.ContactID = &id
		}
	}
	if v := c.QueryParam("status"); v != "" {
		f.Status = &v
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
	invoices, err := h.invoices.ListInvoices(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, invoices)
}

// GetInvoice GET /invoices/:id
func (h *FinanceHandler) GetInvoice(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	inv, err := h.invoices.GetInvoice(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, inv)
}

// UpdateInvoiceDraft PUT /invoices/:id
func (h *FinanceHandler) UpdateInvoiceDraft(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req createInvoiceRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := h.buildInvoiceInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos: "+err.Error())
	}
	inv, err := h.invoices.UpdateDraft(c.Request().Context(), companyFromCtx(c), callerID(c), id, in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, inv)
}

// IssueInvoice POST /invoices/:id/issue
func (h *FinanceHandler) IssueInvoice(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	key, err := idempotencyKey(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "X-Idempotency-Key inválido")
	}
	inv, replayed, err := h.invoices.IssueDraft(c.Request().Context(), companyFromCtx(c), callerID(c), id, key)
	if err != nil {
		return mapFinanceError(err)
	}
	if replayed {
		return c.JSON(http.StatusOK, inv)
	}
	return c.JSON(http.StatusCreated, inv)
}

// VoidInvoice POST /invoices/:id/void
func (h *FinanceHandler) VoidInvoice(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	inv, err := h.invoices.VoidInvoice(c.Request().Context(), companyFromCtx(c), callerID(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, inv)
}

// DeleteInvoiceDraft DELETE /invoices/:id
func (h *FinanceHandler) DeleteInvoiceDraft(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.invoices.DeleteDraft(c.Request().Context(), companyFromCtx(c), callerID(c), id); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ListInvoiceItems GET /invoices/:id/items
func (h *FinanceHandler) ListInvoiceItems(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	items, err := h.invoices.ListItems(c.Request().Context(), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, items)
}

// ListInvoiceTaxes GET /invoices/:id/taxes
func (h *FinanceHandler) ListInvoiceTaxes(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	taxes, err := h.invoices.ListTaxes(c.Request().Context(), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, taxes)
}
