package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	domaincontact "pixs/internal/domain/contact"
	svccontact "pixs/internal/service/contact"
	mw "pixs/internal/transport/http/middleware"
)

// ContactHandler handles CRM contact-related routes.
type ContactHandler struct {
	svc *svccontact.ContactService
}

// NewContactHandler constructs a ContactHandler.
func NewContactHandler(svc *svccontact.ContactService) *ContactHandler {
	return &ContactHandler{svc: svc}
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

type createContactRequest struct {
	Kind             []string `json:"kind"              validate:"required,min=1"`
	FantasyName      string   `json:"fantasy_name"      validate:"required"`
	LegalName        *string  `json:"legal_name"`
	CUITCUIL         *string  `json:"cuit_cuil"`
	VatCondition     *string  `json:"vat_condition"`
	FiscalAddress    *string  `json:"fiscal_address"`
	City             *string  `json:"city"`
	Province         *string  `json:"province"`
	PostalCode       *string  `json:"postal_code"`
	Email            *string  `json:"email"`
	Phone            *string  `json:"phone"`
	Website          *string  `json:"website"`
	Industry         *string  `json:"industry"`
	Source           *string  `json:"source"`
	CreditLimit      *string  `json:"credit_limit"`
	UsualDiscountPct string   `json:"usual_discount_pct"`
	AssignedUserID   *string  `json:"assigned_user_id"`
	LifecycleStatus  string   `json:"lifecycle_status"`
}

type updateContactRequest = createContactRequest

type createPersonRequest struct {
	Name      string  `json:"name"       validate:"required"`
	Role      *string `json:"role"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Notes     *string `json:"notes"`
	Birthday  *string `json:"birthday"`
	IsPrimary bool    `json:"is_primary"`
}

type updatePersonRequest = createPersonRequest

type createBankAccountRequest struct {
	CBU           string  `json:"cbu"            validate:"required"`
	Alias         *string `json:"alias"`
	BankName      *string `json:"bank_name"`
	AccountHolder *string `json:"account_holder"`
	Currency      string  `json:"currency"       validate:"required"`
}

type createNoteRequest struct {
	Body string `json:"body" validate:"required"`
}

type createTagRequest struct {
	Name  string  `json:"name"  validate:"required"`
	Color *string `json:"color"`
	Area  *string `json:"area"`
}

type addContactTagRequest struct {
	TagID string `json:"tag_id" validate:"required,uuid"`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func companyFromCtx(_ echo.Context) uuid.UUID {
	// In the current single-company setup the company is resolved from the seed.
	// In a multi-tenant setup this would come from the session or subdomain.
	b := [16]byte{0xc0, 0, 0, 0, 0, 0, 0x40, 0, 0x80, 0, 0, 0, 0, 0, 0, 0x01}
	return uuid.UUID(b)
}

func mapContactError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domaincontact.ErrContactNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincontact.ErrCUITAlreadyExists):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincontact.ErrInvalidCUIT),
		errors.Is(err, domaincontact.ErrInvalidContactKind),
		errors.Is(err, domaincontact.ErrInvalidVatCondition),
		errors.Is(err, domaincontact.ErrInvalidLifecycleStatus):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincontact.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincontact.ErrPersonNotFound),
		errors.Is(err, domaincontact.ErrBankAccountNotFound),
		errors.Is(err, domaincontact.ErrTagNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincontact.ErrTagAlreadyExists),
		errors.Is(err, domaincontact.ErrNoteBodyRequired):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

// ─── Contact CRUD ─────────────────────────────────────────────────────────────

// CreateContact POST /contacts
func (h *ContactHandler) CreateContact(c echo.Context) error {
	var req createContactRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	in := svccontact.CreateContactInput{
		Kind:            req.Kind,
		FantasyName:     req.FantasyName,
		LegalName:       req.LegalName,
		CUITCUIL:        req.CUITCUIL,
		VatCondition:    req.VatCondition,
		FiscalAddress:   req.FiscalAddress,
		City:            req.City,
		Province:        req.Province,
		PostalCode:      req.PostalCode,
		Email:           req.Email,
		Phone:           req.Phone,
		Website:         req.Website,
		Industry:        req.Industry,
		Source:          req.Source,
		LifecycleStatus: req.LifecycleStatus,
	}
	if req.CreditLimit != nil {
		d, err := decimal.NewFromString(*req.CreditLimit)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "límite de crédito inválido")
		}
		in.CreditLimit = &d
	}
	if req.UsualDiscountPct != "" {
		d, err := decimal.NewFromString(req.UsualDiscountPct)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "porcentaje de descuento inválido")
		}
		in.UsualDiscountPct = d
	}
	if req.AssignedUserID != nil {
		uid, err := uuid.Parse(*req.AssignedUserID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "assigned_user_id inválido")
		}
		in.AssignedUserID = &uid
	}

	companyID := companyFromCtx(c)
	contact, err := h.svc.CreateContact(c.Request().Context(), companyID, in)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusCreated, contact)
}

// GetContact GET /contacts/:id
func (h *ContactHandler) GetContact(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)

	contact, err := h.svc.GetContact(c.Request().Context(), companyFromCtx(c), id, sess.UserID, restrictToOwn)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, contact)
}

// ListContacts GET /contacts
func (h *ContactHandler) ListContacts(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)

	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))

	f := svccontact.ListFilter{
		Query:   c.QueryParam("q"),
		Kind:    c.QueryParam("kind"),
		Page:    int32(page),
		PerPage: int32(perPage),
	}
	if assigned := c.QueryParam("assigned_user_id"); assigned != "" {
		uid, err := uuid.Parse(assigned)
		if err == nil {
			f.AssignedUserID = &uid
		}
	}

	contacts, err := h.svc.ListContacts(c.Request().Context(), companyFromCtx(c), sess.UserID, restrictToOwn, f)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, contacts)
}

// UpdateContact PUT /contacts/:id
func (h *ContactHandler) UpdateContact(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}

	var req updateContactRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	in := svccontact.UpdateContactInput{
		Kind:            req.Kind,
		FantasyName:     req.FantasyName,
		LegalName:       req.LegalName,
		CUITCUIL:        req.CUITCUIL,
		VatCondition:    req.VatCondition,
		FiscalAddress:   req.FiscalAddress,
		City:            req.City,
		Province:        req.Province,
		PostalCode:      req.PostalCode,
		Email:           req.Email,
		Phone:           req.Phone,
		Website:         req.Website,
		Industry:        req.Industry,
		Source:          req.Source,
		LifecycleStatus: req.LifecycleStatus,
	}
	if req.CreditLimit != nil {
		d, err := decimal.NewFromString(*req.CreditLimit)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "límite de crédito inválido")
		}
		in.CreditLimit = &d
	}
	if req.UsualDiscountPct != "" {
		d, err := decimal.NewFromString(req.UsualDiscountPct)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "porcentaje de descuento inválido")
		}
		in.UsualDiscountPct = d
	}
	if req.AssignedUserID != nil {
		uid, err := uuid.Parse(*req.AssignedUserID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "assigned_user_id inválido")
		}
		in.AssignedUserID = &uid
	}

	contact, err := h.svc.UpdateContact(c.Request().Context(), companyFromCtx(c), id, in)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, contact)
}

// DeleteContact DELETE /contacts/:id
func (h *ContactHandler) DeleteContact(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.svc.DeleteContact(c.Request().Context(), companyFromCtx(c), id); err != nil {
		return mapContactError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Contact Persons ──────────────────────────────────────────────────────────

// CreatePerson POST /contacts/:id/persons
func (h *ContactHandler) CreatePerson(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}

	var req createPersonRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	in := svccontact.CreatePersonInput{
		Name:      req.Name,
		Role:      req.Role,
		Email:     req.Email,
		Phone:     req.Phone,
		Notes:     req.Notes,
		IsPrimary: req.IsPrimary,
	}
	if req.Birthday != nil {
		t, err := time.Parse("2006-01-02", *req.Birthday)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "birthday inválido (formato: YYYY-MM-DD)")
		}
		in.Birthday = &t
	}

	person, err := h.svc.CreatePerson(c.Request().Context(), contactID, in)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusCreated, person)
}

// ListPersons GET /contacts/:id/persons
func (h *ContactHandler) ListPersons(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	persons, err := h.svc.ListPersons(c.Request().Context(), contactID)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, persons)
}

// UpdatePerson PUT /contacts/:id/persons/:person_id
func (h *ContactHandler) UpdatePerson(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	personID, err := uuid.Parse(c.Param("person_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "person_id inválido")
	}

	var req updatePersonRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	in := svccontact.UpdatePersonInput{
		Name:      req.Name,
		Role:      req.Role,
		Email:     req.Email,
		Phone:     req.Phone,
		Notes:     req.Notes,
		IsPrimary: req.IsPrimary,
	}
	if req.Birthday != nil {
		t, err := time.Parse("2006-01-02", *req.Birthday)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "birthday inválido (formato: YYYY-MM-DD)")
		}
		in.Birthday = &t
	}

	person, err := h.svc.UpdatePerson(c.Request().Context(), personID, contactID, in)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, person)
}

// DeletePerson DELETE /contacts/:id/persons/:person_id
func (h *ContactHandler) DeletePerson(c echo.Context) error {
	personID, err := uuid.Parse(c.Param("person_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "person_id inválido")
	}
	if err := h.svc.DeletePerson(c.Request().Context(), personID); err != nil {
		return mapContactError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Bank Accounts ────────────────────────────────────────────────────────────

// CreateBankAccount POST /contacts/:id/bank-accounts
func (h *ContactHandler) CreateBankAccount(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}

	var req createBankAccountRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	in := svccontact.CreateBankAccountInput{
		CBU:           req.CBU,
		Alias:         req.Alias,
		BankName:      req.BankName,
		AccountHolder: req.AccountHolder,
		Currency:      req.Currency,
	}

	account, err := h.svc.CreateBankAccount(c.Request().Context(), contactID, in)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusCreated, account)
}

// ListBankAccounts GET /contacts/:id/bank-accounts
func (h *ContactHandler) ListBankAccounts(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	accounts, err := h.svc.ListBankAccounts(c.Request().Context(), contactID)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, accounts)
}

// DeleteBankAccount DELETE /contacts/:id/bank-accounts/:account_id
func (h *ContactHandler) DeleteBankAccount(c echo.Context) error {
	accountID, err := uuid.Parse(c.Param("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "account_id inválido")
	}
	if err := h.svc.DeleteBankAccount(c.Request().Context(), accountID); err != nil {
		return mapContactError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Notes ────────────────────────────────────────────────────────────────────

// CreateNote POST /contacts/:id/notes
func (h *ContactHandler) CreateNote(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}

	var req createNoteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	sess := mw.SessionFromContext(c)
	note, err := h.svc.CreateNote(c.Request().Context(), contactID, sess.UserID, req.Body)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusCreated, note)
}

// ListNotes GET /contacts/:id/notes
func (h *ContactHandler) ListNotes(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	notes, err := h.svc.ListNotes(c.Request().Context(), contactID)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, notes)
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

// GetTimeline GET /contacts/:id/timeline
func (h *ContactHandler) GetTimeline(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	timeline, err := h.svc.GetTimeline(c.Request().Context(), companyFromCtx(c), contactID)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, timeline)
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

// CreateTag POST /tags
func (h *ContactHandler) CreateTag(c echo.Context) error {
	var req createTagRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	tag, err := h.svc.CreateTag(c.Request().Context(), companyFromCtx(c), req.Name, req.Color, req.Area)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusCreated, tag)
}

// ListTags GET /tags
func (h *ContactHandler) ListTags(c echo.Context) error {
	tags, err := h.svc.ListTags(c.Request().Context(), companyFromCtx(c), c.QueryParam("area"))
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, tags)
}

// AddContactTag POST /contacts/:id/tags
func (h *ContactHandler) AddContactTag(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}

	var req addContactTagRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	tagID, _ := uuid.Parse(req.TagID)
	if err := h.svc.AddContactTag(c.Request().Context(), contactID, tagID); err != nil {
		return mapContactError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// RemoveContactTag DELETE /contacts/:id/tags/:tag_id
func (h *ContactHandler) RemoveContactTag(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	tagID, err := uuid.Parse(c.Param("tag_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "tag_id inválido")
	}
	if err := h.svc.RemoveContactTag(c.Request().Context(), contactID, tagID); err != nil {
		return mapContactError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ListContactTags GET /contacts/:id/tags
func (h *ContactHandler) ListContactTags(c echo.Context) error {
	contactID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	tags, err := h.svc.ListContactTags(c.Request().Context(), contactID)
	if err != nil {
		return mapContactError(err)
	}
	return c.JSON(http.StatusOK, tags)
}
