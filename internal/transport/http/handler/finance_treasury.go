package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	svcfinance "pixs/internal/service/finance"
)

// ─── Cash registers ──────────────────────────────────────────────────────────────

type cashRegisterRequest struct {
	Name          string  `json:"name"           validate:"required"`
	Currency      string  `json:"currency"       validate:"required"`
	ResponsibleID *string `json:"responsible_id"`
	IsActive      *bool   `json:"is_active"`
}

// CreateCashRegister POST /cash-registers
func (h *FinanceHandler) CreateCashRegister(c echo.Context) error {
	var req cashRegisterRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	respID, err := parseUUIDPtr(req.ResponsibleID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "responsible_id inválido")
	}
	cr, err := h.cash.CreateRegister(c.Request().Context(), companyFromCtx(c), callerID(c), svcfinance.CreateRegisterInput{
		Name: req.Name, Currency: req.Currency, ResponsibleID: respID,
	})
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, cr)
}

// ListCashRegisters GET /cash-registers
func (h *FinanceHandler) ListCashRegisters(c echo.Context) error {
	regs, err := h.cash.ListRegisters(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, regs)
}

// GetCashRegister GET /cash-registers/:id
func (h *FinanceHandler) GetCashRegister(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	cr, err := h.cash.GetRegister(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	balance, err := h.cash.GetBalance(c.Request().Context(), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, map[string]any{"register": cr, "balance": balance})
}

// UpdateCashRegister PUT /cash-registers/:id
func (h *FinanceHandler) UpdateCashRegister(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req cashRegisterRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	respID, err := parseUUIDPtr(req.ResponsibleID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "responsible_id inválido")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	cr, err := h.cash.UpdateRegister(c.Request().Context(), companyFromCtx(c), callerID(c), id, svcfinance.CreateRegisterInput{
		Name: req.Name, Currency: req.Currency, ResponsibleID: respID,
	}, isActive)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, cr)
}

type openSessionRequest struct {
	OpeningBalance string `json:"opening_balance" validate:"required"`
}

// OpenSession POST /cash-registers/:id/open
func (h *FinanceHandler) OpenSession(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req openSessionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	opening, err := parseDecimal(req.OpeningBalance)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "opening_balance inválido")
	}
	sess, err := h.cash.OpenSession(c.Request().Context(), companyFromCtx(c), callerID(c), id, opening)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, sess)
}

type closeSessionRequest struct {
	DeclaredClosingBalance string `json:"declared_closing_balance" validate:"required"`
}

// CloseSession POST /cash-registers/:id/close
func (h *FinanceHandler) CloseSession(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req closeSessionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	declared, err := parseDecimal(req.DeclaredClosingBalance)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "declared_closing_balance inválido")
	}
	sess, err := h.cash.CloseSession(c.Request().Context(), companyFromCtx(c), callerID(c), id, declared)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, sess)
}

type cashMovementRequest struct {
	Type        string  `json:"type"        validate:"required"`
	Amount      string  `json:"amount"      validate:"required"`
	Currency    string  `json:"currency"    validate:"required"`
	Description *string `json:"description"`
}

// CreateCashMovement POST /cash-registers/:id/movements
func (h *FinanceHandler) CreateCashMovement(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req cashMovementRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	amt, err := parseDecimal(req.Amount)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "amount inválido")
	}
	mv, err := h.cash.CreateMovement(c.Request().Context(), companyFromCtx(c), callerID(c), id, svcfinance.CreateMovementInput{
		Type: req.Type, Amount: amt, Currency: req.Currency, Description: req.Description,
	})
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, mv)
}

// ListCashMovements GET /cash-registers/:id/movements
func (h *FinanceHandler) ListCashMovements(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	from, _ := parseDatePtr(strPtr(c.QueryParam("from")))
	to, _ := parseDatePtr(strPtr(c.QueryParam("to")))
	movements, err := h.cash.ListMovements(c.Request().Context(), id, from, to)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, movements)
}

type transferRequest struct {
	FromCashID  string  `json:"from_cash_id" validate:"required,uuid"`
	ToCashID    *string `json:"to_cash_id"`
	ToBankID    *string `json:"to_bank_id"`
	Amount      string  `json:"amount"       validate:"required"`
	Currency    string  `json:"currency"     validate:"required"`
	Description *string `json:"description"`
}

// TransferBetweenCashes POST /cash-registers/transfer
func (h *FinanceHandler) TransferBetweenCashes(c echo.Context) error {
	var req transferRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	fromID, err := uuid.Parse(req.FromCashID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "from_cash_id inválido")
	}
	toCash, err := parseUUIDPtr(req.ToCashID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "to_cash_id inválido")
	}
	toBank, err := parseUUIDPtr(req.ToBankID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "to_bank_id inválido")
	}
	amt, err := parseDecimal(req.Amount)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "amount inválido")
	}
	if err := h.cash.Transfer(c.Request().Context(), companyFromCtx(c), callerID(c), svcfinance.TransferInput{
		FromCashID: fromID, ToCashID: toCash, ToBankID: toBank, Amount: amt,
		Currency: req.Currency, Description: req.Description,
	}); err != nil {
		return mapFinanceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Bank accounts ───────────────────────────────────────────────────────────────

type bankAccountRequest struct {
	BankName       string  `json:"bank_name"       validate:"required"`
	AccountNumber  *string `json:"account_number"`
	CBU            *string `json:"cbu"`
	Alias          *string `json:"alias"`
	Currency       string  `json:"currency"        validate:"required"`
	AccountHolder  *string `json:"account_holder"`
	InitialBalance string  `json:"initial_balance"`
	IsActive       *bool   `json:"is_active"`
}

func toBankInput(req bankAccountRequest) (svcfinance.CreateBankInput, error) {
	initial := decimal.Zero
	if req.InitialBalance != "" {
		var err error
		if initial, err = parseDecimal(req.InitialBalance); err != nil {
			return svcfinance.CreateBankInput{}, err
		}
	}
	return svcfinance.CreateBankInput{
		BankName: req.BankName, AccountNumber: req.AccountNumber, CBU: req.CBU,
		Alias: req.Alias, Currency: req.Currency, AccountHolder: req.AccountHolder,
		InitialBalance: initial,
	}, nil
}

// CreateBankAccount POST /bank-accounts
func (h *FinanceHandler) CreateBankAccount(c echo.Context) error {
	var req bankAccountRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := toBankInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "initial_balance inválido")
	}
	ba, err := h.banks.CreateAccount(c.Request().Context(), companyFromCtx(c), callerID(c), in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, ba)
}

// ListBankAccounts GET /bank-accounts
func (h *FinanceHandler) ListBankAccounts(c echo.Context) error {
	accts, err := h.banks.ListAccounts(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, accts)
}

// GetBankAccount GET /bank-accounts/:id
func (h *FinanceHandler) GetBankAccount(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	ba, err := h.banks.GetAccount(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, ba)
}

// UpdateBankAccount PUT /bank-accounts/:id
func (h *FinanceHandler) UpdateBankAccount(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req bankAccountRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := toBankInput(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "initial_balance inválido")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ba, err := h.banks.UpdateAccount(c.Request().Context(), companyFromCtx(c), callerID(c), id, in, isActive)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, ba)
}

type bankMovementRequest struct {
	Type        string  `json:"type"        validate:"required"`
	Amount      string  `json:"amount"      validate:"required"`
	Currency    string  `json:"currency"    validate:"required"`
	Description *string `json:"description"`
	ValueDate   *string `json:"value_date"`
}

// CreateBankMovement POST /bank-accounts/:id/movements
func (h *FinanceHandler) CreateBankMovement(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req bankMovementRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	amt, err := parseDecimal(req.Amount)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "amount inválido")
	}
	in := svcfinance.CreateBankMovementInput{
		Type: req.Type, Amount: amt, Currency: req.Currency, Description: req.Description,
	}
	if vd, err := parseDatePtr(req.ValueDate); err == nil && vd != nil {
		in.ValueDate = *vd
	}
	mv, err := h.banks.CreateMovement(c.Request().Context(), companyFromCtx(c), callerID(c), id, in)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusCreated, mv)
}

// ListBankMovements GET /bank-accounts/:id/movements
func (h *FinanceHandler) ListBankMovements(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	from, _ := parseDatePtr(strPtr(c.QueryParam("from")))
	to, _ := parseDatePtr(strPtr(c.QueryParam("to")))
	movements, err := h.banks.ListMovements(c.Request().Context(), id, from, to)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, movements)
}

type reconcileRequest struct {
	MovementIDs []string `json:"movement_ids" validate:"required,min=1"`
}

// ReconcileMovements POST /bank-accounts/:id/reconcile
func (h *FinanceHandler) ReconcileMovements(c echo.Context) error {
	var req reconcileRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	ids := make([]uuid.UUID, 0, len(req.MovementIDs))
	for _, s := range req.MovementIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "movement_id inválido")
		}
		ids = append(ids, id)
	}
	movements, err := h.banks.Reconcile(c.Request().Context(), companyFromCtx(c), callerID(c), ids)
	if err != nil {
		return mapFinanceError(err)
	}
	return c.JSON(http.StatusOK, movements)
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
