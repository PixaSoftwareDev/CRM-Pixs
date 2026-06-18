package handler

import (
	"net/http"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	domainsales "pixs/internal/domain/sales"
	svcsales "pixs/internal/service/sales"
	mw "pixs/internal/transport/http/middleware"
)

// SalesHandler handles products, pipeline opportunities, and quotes.
type SalesHandler struct {
	products      *svcsales.ProductService
	opportunities *svcsales.OpportunityService
	quotes        *svcsales.QuoteService
}

// NewSalesHandler constructs a SalesHandler.
func NewSalesHandler(p *svcsales.ProductService, o *svcsales.OpportunityService, q *svcsales.QuoteService) *SalesHandler {
	return &SalesHandler{products: p, opportunities: o, quotes: q}
}

func mapSalesError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domainsales.ErrProductNotFound),
		errors.Is(err, domainsales.ErrOpportunityNotFound),
		errors.Is(err, domainsales.ErrQuoteNotFound),
		errors.Is(err, domainsales.ErrStageNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainsales.ErrProductCodeExists),
		errors.Is(err, domainsales.ErrQuoteNumberExists):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainsales.ErrInvalidProbability),
		errors.Is(err, domainsales.ErrInvalidQuoteStatus),
		errors.Is(err, domainsales.ErrNoWinStage),
		errors.Is(err, domainsales.ErrNoLossStage):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainsales.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

func parseDecPtr(s *string) (*decimal.Decimal, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	d, err := decimal.NewFromString(*s)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func pgDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: t, Valid: true}
}

func parseUUIDPtr(s *string) (*uuid.UUID, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// ─── Products ──────────────────────────────────────────────────────────────────

type productRequest struct {
	Code        *string `json:"code"`
	Name        string  `json:"name" validate:"required"`
	Description *string `json:"description"`
	Unit        *string `json:"unit"`
	UnitPrice   *string `json:"unit_price"`
	Currency    *string `json:"currency"`
	Cost        *string `json:"cost"`
	VATRatePct  *string `json:"vat_rate_pct"`
	Category    *string `json:"category"`
	IsRecurring bool    `json:"is_recurring"`
	IsActive    *bool   `json:"is_active"`
}

func (r *productRequest) toInput() (svcsales.ProductInput, error) {
	in := svcsales.ProductInput{
		Code: r.Code, Name: r.Name, Description: r.Description, Unit: r.Unit,
		Currency: r.Currency, Category: r.Category, IsRecurring: r.IsRecurring, IsActive: true,
	}
	if r.IsActive != nil {
		in.IsActive = *r.IsActive
	}
	var err error
	if in.UnitPrice, err = parseDecPtr(r.UnitPrice); err != nil {
		return in, err
	}
	if in.Cost, err = parseDecPtr(r.Cost); err != nil {
		return in, err
	}
	if in.VATRatePct, err = parseDecPtr(r.VATRatePct); err != nil {
		return in, err
	}
	return in, nil
}

// CreateProduct POST /products
func (h *SalesHandler) CreateProduct(c echo.Context) error {
	var req productRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := req.toInput()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "valor numérico inválido")
	}
	sess := mw.SessionFromContext(c)
	p, err := h.products.CreateProduct(c.Request().Context(), companyFromCtx(c), &sess.UserID, in)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusCreated, p)
}

// ListProducts GET /products
func (h *SalesHandler) ListProducts(c echo.Context) error {
	activeOnly := c.QueryParam("active") == "true"
	products, err := h.products.ListProducts(c.Request().Context(), companyFromCtx(c), activeOnly, c.QueryParam("category"))
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, products)
}

// GetProduct GET /products/:id
func (h *SalesHandler) GetProduct(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	p, err := h.products.GetProduct(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, p)
}

// UpdateProduct PUT /products/:id
func (h *SalesHandler) UpdateProduct(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req productRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := req.toInput()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "valor numérico inválido")
	}
	sess := mw.SessionFromContext(c)
	p, err := h.products.UpdateProduct(c.Request().Context(), companyFromCtx(c), id, &sess.UserID, in)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, p)
}

// DeleteProduct DELETE /products/:id
func (h *SalesHandler) DeleteProduct(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	if err := h.products.DeleteProduct(c.Request().Context(), companyFromCtx(c), id, &sess.UserID); err != nil {
		return mapSalesError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Opportunities ─────────────────────────────────────────────────────────────

type opportunityRequest struct {
	ContactID         string  `json:"contact_id" validate:"required,uuid"`
	StageID           string  `json:"stage_id" validate:"required,uuid"`
	Title             string  `json:"title" validate:"required"`
	Amount            *string `json:"amount"`
	Currency          string  `json:"currency"`
	ProbabilityPct    *string `json:"probability_pct"`
	ExpectedCloseDate *string `json:"expected_close_date"`
	AssignedUserID    *string `json:"assigned_user_id"`
	Source            *string `json:"source"`
}

func (r *opportunityRequest) toInput() (svcsales.OpportunityInput, error) {
	contactID, err := uuid.Parse(r.ContactID)
	if err != nil {
		return svcsales.OpportunityInput{}, err
	}
	stageID, err := uuid.Parse(r.StageID)
	if err != nil {
		return svcsales.OpportunityInput{}, err
	}
	in := svcsales.OpportunityInput{
		ContactID: contactID, StageID: stageID, Title: r.Title, Currency: r.Currency, Source: r.Source,
	}
	if in.Amount, err = parseDecPtr(r.Amount); err != nil {
		return in, err
	}
	if in.ProbabilityPct, err = parseDecPtr(r.ProbabilityPct); err != nil {
		return in, err
	}
	if in.AssignedUserID, err = parseUUIDPtr(r.AssignedUserID); err != nil {
		return in, err
	}
	if r.ExpectedCloseDate != nil && *r.ExpectedCloseDate != "" {
		t, perr := time.Parse("2006-01-02", *r.ExpectedCloseDate)
		if perr != nil {
			return in, perr
		}
		d := pgDate(t)
		in.ExpectedCloseDate = &d
	}
	return in, nil
}

// CreateOpportunity POST /opportunities
func (h *SalesHandler) CreateOpportunity(c echo.Context) error {
	var req opportunityRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := req.toInput()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	sess := mw.SessionFromContext(c)
	o, err := h.opportunities.CreateOpportunity(c.Request().Context(), companyFromCtx(c), &sess.UserID, in)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusCreated, o)
}

// ListOpportunities GET /opportunities
func (h *SalesHandler) ListOpportunities(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)
	var f svcsales.OpportunityFilter
	if s := c.QueryParam("stage_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.StageID = &id
		}
	}
	if s := c.QueryParam("contact_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ContactID = &id
		}
	}
	if s := c.QueryParam("assigned_user_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.AssignedUserID = &id
		}
	}
	opps, err := h.opportunities.ListOpportunities(c.Request().Context(), companyFromCtx(c), sess.UserID, restrictToOwn, f)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, opps)
}

// GetOpportunity GET /opportunities/:id
func (h *SalesHandler) GetOpportunity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	o, err := h.opportunities.GetOpportunity(c.Request().Context(), companyFromCtx(c), id, sess.UserID, mw.IsRestrictedToOwn(c))
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, o)
}

// UpdateOpportunity PUT /opportunities/:id
func (h *SalesHandler) UpdateOpportunity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req opportunityRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in, err := req.toInput()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	sess := mw.SessionFromContext(c)
	o, err := h.opportunities.UpdateOpportunity(c.Request().Context(), companyFromCtx(c), id, &sess.UserID, in)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, o)
}

type moveStageRequest struct {
	StageID string `json:"stage_id" validate:"required,uuid"`
}

// MoveOpportunityStage POST /opportunities/:id/move
func (h *SalesHandler) MoveOpportunityStage(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req moveStageRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	stageID, _ := uuid.Parse(req.StageID)
	sess := mw.SessionFromContext(c)
	o, err := h.opportunities.MoveStage(c.Request().Context(), companyFromCtx(c), id, stageID, &sess.UserID)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, o)
}

// WinOpportunity POST /opportunities/:id/win
func (h *SalesHandler) WinOpportunity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	o, err := h.opportunities.Win(c.Request().Context(), companyFromCtx(c), id, &sess.UserID)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, o)
}

type loseRequest struct {
	LostReasonID *string `json:"lost_reason_id"`
	LostNotes    *string `json:"lost_notes"`
}

// LoseOpportunity POST /opportunities/:id/lose
func (h *SalesHandler) LoseOpportunity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req loseRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	reasonID, err := parseUUIDPtr(req.LostReasonID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "lost_reason_id inválido")
	}
	sess := mw.SessionFromContext(c)
	o, err := h.opportunities.Lose(c.Request().Context(), companyFromCtx(c), id, reasonID, req.LostNotes, &sess.UserID)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, o)
}

// DeleteOpportunity DELETE /opportunities/:id
func (h *SalesHandler) DeleteOpportunity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	if err := h.opportunities.DeleteOpportunity(c.Request().Context(), companyFromCtx(c), id, &sess.UserID); err != nil {
		return mapSalesError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// GetForecast GET /pipeline/forecast
func (h *SalesHandler) GetForecast(c echo.Context) error {
	f, err := h.opportunities.Forecast(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, map[string]string{"forecast": f.String()})
}

// ListStages GET /pipeline/stages
func (h *SalesHandler) ListStages(c echo.Context) error {
	stages, err := h.opportunities.ListStages(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, stages)
}

// ListLostReasons GET /pipeline/lost-reasons
func (h *SalesHandler) ListLostReasons(c echo.Context) error {
	reasons, err := h.opportunities.ListLostReasons(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, reasons)
}

// ─── Quotes ────────────────────────────────────────────────────────────────────

type quoteItemRequest struct {
	ProductID   *string `json:"product_id"`
	Description string  `json:"description" validate:"required"`
	Quantity    string  `json:"quantity" validate:"required"`
	UnitPrice   string  `json:"unit_price" validate:"required"`
	DiscountPct string  `json:"discount_pct"`
	VATRatePct  string  `json:"vat_rate_pct"`
	OrderPos    *int16  `json:"order_pos"`
}

type quoteRequest struct {
	ContactID     string             `json:"contact_id" validate:"required,uuid"`
	OpportunityID *string            `json:"opportunity_id"`
	Date          string             `json:"date" validate:"required"`
	ValidUntil    *string            `json:"valid_until"`
	Currency      string             `json:"currency" validate:"required"`
	ExchangeRate  *string            `json:"exchange_rate"`
	Notes         *string            `json:"notes"`
	Items         []quoteItemRequest `json:"items" validate:"required,min=1"`
}

func (r *quoteRequest) toInput(userID uuid.UUID) (svcsales.QuoteInput, error) {
	contactID, err := uuid.Parse(r.ContactID)
	if err != nil {
		return svcsales.QuoteInput{}, err
	}
	date, err := time.Parse("2006-01-02", r.Date)
	if err != nil {
		return svcsales.QuoteInput{}, err
	}
	in := svcsales.QuoteInput{
		ContactID: contactID, UserID: userID, Date: date, Currency: r.Currency, Notes: r.Notes,
		ExchangeRate: decimal.NewFromInt(1),
	}
	if in.OpportunityID, err = parseUUIDPtr(r.OpportunityID); err != nil {
		return in, err
	}
	if r.ValidUntil != nil && *r.ValidUntil != "" {
		vu, perr := time.Parse("2006-01-02", *r.ValidUntil)
		if perr != nil {
			return in, perr
		}
		in.ValidUntil = &vu
	}
	if r.ExchangeRate != nil && *r.ExchangeRate != "" {
		er, perr := decimal.NewFromString(*r.ExchangeRate)
		if perr != nil {
			return in, perr
		}
		in.ExchangeRate = er
	}
	for _, it := range r.Items {
		qty, perr := decimal.NewFromString(it.Quantity)
		if perr != nil {
			return in, perr
		}
		price, perr := decimal.NewFromString(it.UnitPrice)
		if perr != nil {
			return in, perr
		}
		disc := decimal.Zero
		if it.DiscountPct != "" {
			if disc, perr = decimal.NewFromString(it.DiscountPct); perr != nil {
				return in, perr
			}
		}
		vat := decimal.Zero
		if it.VATRatePct != "" {
			if vat, perr = decimal.NewFromString(it.VATRatePct); perr != nil {
				return in, perr
			}
		}
		prodID, perr := parseUUIDPtr(it.ProductID)
		if perr != nil {
			return in, perr
		}
		in.Items = append(in.Items, svcsales.QuoteItemInput{
			ProductID: prodID, Description: it.Description, Quantity: qty, UnitPrice: price,
			DiscountPct: disc, VATRatePct: vat, OrderPos: it.OrderPos,
		})
	}
	return in, nil
}

// CreateQuote POST /quotes
func (h *SalesHandler) CreateQuote(c echo.Context) error {
	var req quoteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	in, err := req.toInput(sess.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	q, err := h.quotes.CreateQuote(c.Request().Context(), companyFromCtx(c), in)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusCreated, q)
}

// ListQuotes GET /quotes
func (h *SalesHandler) ListQuotes(c echo.Context) error {
	var f svcsales.QuoteFilter
	if s := c.QueryParam("contact_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ContactID = &id
		}
	}
	if s := c.QueryParam("status"); s != "" {
		f.Status = &s
	}
	if s := c.QueryParam("opportunity_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.OpportunityID = &id
		}
	}
	quotes, err := h.quotes.ListQuotes(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, quotes)
}

// GetQuote GET /quotes/:id
func (h *SalesHandler) GetQuote(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	q, err := h.quotes.GetQuote(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, q)
}

// UpdateQuote PUT /quotes/:id
func (h *SalesHandler) UpdateQuote(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req quoteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	in, err := req.toInput(sess.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	q, err := h.quotes.UpdateQuote(c.Request().Context(), companyFromCtx(c), id, in)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, q)
}

type quoteStatusRequest struct {
	Status string `json:"status" validate:"required"`
}

// ChangeQuoteStatus POST /quotes/:id/status
func (h *SalesHandler) ChangeQuoteStatus(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req quoteStatusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	q, err := h.quotes.ChangeStatus(c.Request().Context(), companyFromCtx(c), id, req.Status, &sess.UserID)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, q)
}

// ListQuoteVersions GET /quotes/:id/versions
func (h *SalesHandler) ListQuoteVersions(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	versions, err := h.quotes.ListVersions(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapSalesError(err)
	}
	return c.JSON(http.StatusOK, versions)
}

// DeleteQuote DELETE /quotes/:id
func (h *SalesHandler) DeleteQuote(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	if err := h.quotes.DeleteQuote(c.Request().Context(), companyFromCtx(c), id, &sess.UserID); err != nil {
		return mapSalesError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
