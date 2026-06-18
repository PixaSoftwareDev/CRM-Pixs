package handler

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	svcfinance "pixs/internal/service/finance"
)

// ─── Expenses ────────────────────────────────────────────────────────────────────

type createExpenseRequest struct {
	Date         string  `json:"date"         validate:"required"`
	CategoryID   string  `json:"category_id"  validate:"required,uuid"`
	Description  string  `json:"description"  validate:"required"`
	Amount       string  `json:"amount"       validate:"required"`
	Currency     string  `json:"currency"`
	PaidByUserID *string `json:"paid_by_user_id"`
	PaidByCashID *string `json:"paid_by_cash_id"`
	PaidByBankID *string `json:"paid_by_bank_id"`
	ProjectID    *string `json:"project_id"`
	Status       string  `json:"status"`
}

// CreateExpense POST /expenses
func (h *FinanceHandler) CreateExpense(c echo.Context) error {
	var req createExpenseRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	date, err := parseDate(req.Date)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "date inválida")
	}
	catID, err := uuid.Parse(req.CategoryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "category_id inválido")
	}
	amt, err := parseDecimal(req.Amount)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "amount inválido")
	}
	userID, err := parseUUIDPtr(req.PaidByUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "paid_by_user_id inválido")
	}
	cashID, err := parseUUIDPtr(req.PaidByCashID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "paid_by_cash_id inválido")
	}
	bankID, err := parseUUIDPtr(req.PaidByBankID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "paid_by_bank_id inválido")
	}
	projID, err := parseUUIDPtr(req.ProjectID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "project_id inválido")
	}
	exp, err := h.expenses.Create(c.Request().Context(), companyFromCtx(c), callerID(c), svcfinance.CreateExpenseInput{
		Date: date, CategoryID: catID, Description: req.Description, Amount: amt,
		Currency: req.Currency, PaidByUserID: userID, PaidByCashID: cashID,
		PaidByBankID: bankID, ProjectID: projID, Status: req.Status,
	})
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, exp)
}

// ListExpenses GET /expenses
func (h *FinanceHandler) ListExpenses(c echo.Context) error {
	var f svcfinance.ExpenseFilter
	if v := c.QueryParam("category_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.CategoryID = &id
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
	expenses, err := h.expenses.List(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, expenses)
}

// GetExpense GET /expenses/:id
func (h *FinanceHandler) GetExpense(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	exp, err := h.expenses.Get(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, exp)
}

// UpdateExpense PUT /expenses/:id — re-records the expense fields (treated as create-over).
func (h *FinanceHandler) UpdateExpense(c echo.Context) error {
	// Update is limited to status changes via approve/reject; full edit is not
	// supported to preserve the audit trail. Return method not allowed semantics.
	return echo.NewHTTPError(http.StatusBadRequest, "usar /approve o /reject para modificar el gasto")
}

// ApproveExpense POST /expenses/:id/approve
func (h *FinanceHandler) ApproveExpense(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	exp, err := h.expenses.Approve(c.Request().Context(), companyFromCtx(c), callerID(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, exp)
}

// RejectExpense POST /expenses/:id/reject
func (h *FinanceHandler) RejectExpense(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	exp, err := h.expenses.Reject(c.Request().Context(), companyFromCtx(c), callerID(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, exp)
}

// SoftDeleteExpense DELETE /expenses/:id
func (h *FinanceHandler) SoftDeleteExpense(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.expenses.Delete(c.Request().Context(), companyFromCtx(c), callerID(c), id); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Recurring payments ──────────────────────────────────────────────────────────

type recurringRequest struct {
	SupplierID    *string `json:"supplier_id"`
	Description   string  `json:"description"   validate:"required"`
	Amount        *string `json:"amount"`
	Currency      *string `json:"currency"`
	Frequency     string  `json:"frequency"     validate:"required"`
	DueDay        *int16  `json:"due_day"`
	NextDueDate   *string `json:"next_due_date"`
	PaymentMethod *string `json:"payment_method"`
	CategoryID    *string `json:"category_id"`
	Status        string  `json:"status"`
}

func buildRecurringInput(req recurringRequest) (svcfinance.RecurringInput, error) {
	var in svcfinance.RecurringInput
	supplierID, err := parseUUIDPtr(req.SupplierID)
	if err != nil {
		return in, err
	}
	catID, err := parseUUIDPtr(req.CategoryID)
	if err != nil {
		return in, err
	}
	nextDue, err := parseDatePtr(req.NextDueDate)
	if err != nil {
		return in, err
	}
	var amt *decimal.Decimal
	if req.Amount != nil && *req.Amount != "" {
		d, err := parseDecimal(*req.Amount)
		if err != nil {
			return in, err
		}
		amt = &d
	}
	in = svcfinance.RecurringInput{
		SupplierID: supplierID, Description: req.Description, Amount: amt,
		Currency: req.Currency, Frequency: req.Frequency, DueDay: req.DueDay,
		NextDueDate: nextDue, PaymentMethod: req.PaymentMethod, CategoryID: catID,
		Status: req.Status,
	}
	return in, nil
}

// CreateRecurringPayment POST /recurring-payments
func (h *FinanceHandler) CreateRecurringPayment(c echo.Context) error {
	var req recurringRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := buildRecurringInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos: "+err.Error())
	}
	rp, err := h.recurring.CreateRecurring(c.Request().Context(), companyFromCtx(c), callerID(c), in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, rp)
}

// ListRecurringPayments GET /recurring-payments
func (h *FinanceHandler) ListRecurringPayments(c echo.Context) error {
	rps, err := h.recurring.ListRecurring(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rps)
}

// GetRecurringPayment GET /recurring-payments/:id
func (h *FinanceHandler) GetRecurringPayment(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	rp, err := h.recurring.GetRecurring(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rp)
}

// UpdateRecurringPayment PUT /recurring-payments/:id
func (h *FinanceHandler) UpdateRecurringPayment(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req recurringRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := buildRecurringInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos: "+err.Error())
	}
	rp, err := h.recurring.UpdateRecurring(c.Request().Context(), companyFromCtx(c), callerID(c), id, in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rp)
}

// SoftDeleteRecurringPayment DELETE /recurring-payments/:id
func (h *FinanceHandler) SoftDeleteRecurringPayment(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.recurring.DeleteRecurring(c.Request().Context(), companyFromCtx(c), callerID(c), id); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Payment calendar ────────────────────────────────────────────────────────────

// ListPaymentObligations GET /payment-calendar
func (h *FinanceHandler) ListPaymentObligations(c echo.Context) error {
	var f svcfinance.ObligationFilter
	if v := c.QueryParam("status"); v != "" {
		f.Status = &v
	}
	if v := c.QueryParam("source_type"); v != "" {
		f.SourceType = &v
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
	obs, err := h.recurring.ListObligations(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, obs)
}

type payObligationRequest struct {
	PaymentOrderID *string `json:"payment_order_id"`
}

// MarkObligationPaid POST /payment-calendar/:id/pay
func (h *FinanceHandler) MarkObligationPaid(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req payObligationRequest
	_ = c.Bind(&req)
	poID, err := parseUUIDPtr(req.PaymentOrderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "payment_order_id inválido")
	}
	ob, err := h.recurring.MarkObligationPaid(c.Request().Context(), companyFromCtx(c), callerID(c), id, poID)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, ob)
}

// ─── Reporting ───────────────────────────────────────────────────────────────────

// GetCashFlowProjection GET /cash-flow
func (h *FinanceHandler) GetCashFlowProjection(c echo.Context) error {
	days := 30
	if v := c.QueryParam("days"); v != "" {
		if d, err := strconv.Atoi(v); err == nil {
			days = d
		}
	}
	currency := c.QueryParam("currency")
	scenario := c.QueryParam("scenario")
	if scenario == "" {
		scenario = "realistic"
	}
	proj, err := h.cashflow.GetProjection(c.Request().Context(), companyFromCtx(c), days, currency, scenario)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, proj)
}

// GetAccountStatement GET /contacts/:id/account-statement
func (h *FinanceHandler) GetAccountStatement(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	stmt, err := h.ctacte.GetStatement(c.Request().Context(), companyFromCtx(c), id, c.QueryParam("currency"))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, stmt)
}

// GetConsolidatedBalance GET /consolidated-balance
func (h *FinanceHandler) GetConsolidatedBalance(c echo.Context) error {
	balances, err := h.cashflow.GetConsolidatedBalance(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, balances)
}

// ─── Catalogs ────────────────────────────────────────────────────────────────────

// ListVATRates GET /finance/vat-rates
func (h *FinanceHandler) ListVATRates(c echo.Context) error {
	rows, err := h.catalog.ListVATRates(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rows)
}

// ListPaymentConditions GET /finance/payment-conditions
func (h *FinanceHandler) ListPaymentConditions(c echo.Context) error {
	rows, err := h.catalog.ListPaymentConditions(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rows)
}

// ListExpenseCategories GET /finance/expense-categories
func (h *FinanceHandler) ListExpenseCategories(c echo.Context) error {
	rows, err := h.catalog.ListExpenseCategories(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rows)
}

// ListCurrencies GET /finance/currencies
func (h *FinanceHandler) ListCurrencies(c echo.Context) error {
	rows, err := h.catalog.ListCurrencies(c.Request().Context())
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, rows)
}
