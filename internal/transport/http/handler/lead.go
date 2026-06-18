package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	domainlead "pixs/internal/domain/lead"
	svclead "pixs/internal/service/lead"
	mw "pixs/internal/transport/http/middleware"
)

// LeadHandler handles lead-management routes.
type LeadHandler struct {
	leads      *svclead.LeadService
	conversion *svclead.ConversionService
	metrics    *svclead.MetricsService
}

// NewLeadHandler constructs a LeadHandler.
func NewLeadHandler(leads *svclead.LeadService, conversion *svclead.ConversionService, metrics *svclead.MetricsService) *LeadHandler {
	return &LeadHandler{leads: leads, conversion: conversion, metrics: metrics}
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

type createLeadRequest struct {
	CompanyName     string  `json:"company_name"     validate:"required"`
	Description     *string `json:"description"`
	WhatTheyDo      *string `json:"what_they_do"`
	Website         *string `json:"website"`
	SourceURL       *string `json:"source_url"`
	Industry        *string `json:"industry"`
	ApproximateSize *string `json:"approximate_size"`
	City            *string `json:"city"`
	Country         *string `json:"country"`
	Language        *string `json:"language"`
	AssignedTo      *string `json:"assigned_to"`
	FollowUpDate    *string `json:"follow_up_date"`
}

type updateLeadRequest struct {
	CompanyName     string  `json:"company_name"     validate:"required"`
	Description     *string `json:"description"`
	WhatTheyDo      *string `json:"what_they_do"`
	Website         *string `json:"website"`
	Industry        *string `json:"industry"`
	ApproximateSize *string `json:"approximate_size"`
	City            *string `json:"city"`
	Country         *string `json:"country"`
	Language        *string `json:"language"`
	FollowUpDate    *string `json:"follow_up_date"`
}

type changeStatusRequest struct {
	Status          string  `json:"status"           validate:"required"`
	RejectionReason *string `json:"rejection_reason"`
}

type assignLeadRequest struct {
	AssignedTo string `json:"assigned_to" validate:"required,uuid"`
}

type addNoteRequest struct {
	Body string `json:"body" validate:"required"`
}

type convertLeadRequest struct {
	StageID *string `json:"stage_id"`
}

func mapLeadError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domainlead.ErrLeadNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainlead.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainlead.ErrDuplicateLead):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainlead.ErrLeadAlreadyConverted):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainlead.ErrInvalidStatusTransition):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainlead.ErrQuotaExceeded):
		return echo.NewHTTPError(http.StatusTooManyRequests, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainlead.ErrNoSearchAPIKey), errors.Is(err, domainlead.ErrNoLLMAPIKey):
		return echo.NewHTTPError(http.StatusServiceUnavailable, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// CreateLead POST /leads
func (h *LeadHandler) CreateLead(c echo.Context) error {
	var req createLeadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	in := svclead.CreateLeadInput{
		CompanyName:     req.CompanyName,
		Description:     req.Description,
		WhatTheyDo:      req.WhatTheyDo,
		Website:         req.Website,
		SourceURL:       req.SourceURL,
		Industry:        req.Industry,
		ApproximateSize: req.ApproximateSize,
		City:            req.City,
		Country:         req.Country,
		Language:        req.Language,
	}
	if req.AssignedTo != nil {
		uid, err := uuid.Parse(*req.AssignedTo)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "assigned_to inválido")
		}
		in.AssignedTo = &uid
	}
	fd, derr := parseDatePtr(req.FollowUpDate)
	if derr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "fecha inválida (formato: YYYY-MM-DD)")
	}
	in.FollowUpDate = fd

	sess := mw.SessionFromContext(c)
	lead, err := h.leads.CreateLead(c.Request().Context(), companyFromCtx(c), sess.UserID, in)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusCreated, lead)
}

// ListLeads GET /leads
func (h *LeadHandler) ListLeads(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)

	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))

	f := svclead.ListFilter{
		Status:   c.QueryParam("status"),
		Industry: c.QueryParam("industry"),
		Page:     int32(page),
		PerPage:  int32(perPage),
	}
	if a := c.QueryParam("assigned_to"); a != "" {
		if uid, err := uuid.Parse(a); err == nil {
			f.AssignedTo = &uid
		}
	}
	if fromS := c.QueryParam("from_date"); fromS != "" {
		if t, err := time.Parse("2006-01-02", fromS); err == nil {
			f.FromDate = &t
		}
	}
	if toS := c.QueryParam("to_date"); toS != "" {
		if t, err := time.Parse("2006-01-02", toS); err == nil {
			f.ToDate = &t
		}
	}

	leads, err := h.leads.ListLeads(c.Request().Context(), companyFromCtx(c), sess.UserID, restrictToOwn, f)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, leads)
}

// GetLeadMetrics GET /leads/metrics
func (h *LeadHandler) GetLeadMetrics(c echo.Context) error {
	m, err := h.metrics.GetMetrics(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, m)
}

// GetLead GET /leads/:id
func (h *LeadHandler) GetLead(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	lead, err := h.leads.GetLead(c.Request().Context(), companyFromCtx(c), id, sess.UserID, mw.IsRestrictedToOwn(c))
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, lead)
}

// UpdateLead PATCH /leads/:id
func (h *LeadHandler) UpdateLead(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req updateLeadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in := svclead.UpdateLeadInput{
		CompanyName:     req.CompanyName,
		Description:     req.Description,
		WhatTheyDo:      req.WhatTheyDo,
		Website:         req.Website,
		Industry:        req.Industry,
		ApproximateSize: req.ApproximateSize,
		City:            req.City,
		Country:         req.Country,
		Language:        req.Language,
	}
	fd, derr := parseDatePtr(req.FollowUpDate)
	if derr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "fecha inválida (formato: YYYY-MM-DD)")
	}
	in.FollowUpDate = fd

	sess := mw.SessionFromContext(c)
	lead, err := h.leads.UpdateLead(c.Request().Context(), companyFromCtx(c), id, sess.UserID, in)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, lead)
}

// ChangeLeadStatus POST /leads/:id/status
func (h *LeadHandler) ChangeLeadStatus(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req changeStatusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	lead, err := h.leads.ChangeStatus(c.Request().Context(), companyFromCtx(c), id, sess.UserID, req.Status, req.RejectionReason)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, lead)
}

// AssignLead POST /leads/:id/assign
func (h *LeadHandler) AssignLead(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req assignLeadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	assignTo, _ := uuid.Parse(req.AssignedTo)
	sess := mw.SessionFromContext(c)
	lead, err := h.leads.AssignLead(c.Request().Context(), companyFromCtx(c), id, sess.UserID, assignTo)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, lead)
}

// AddNote POST /leads/:id/note
func (h *LeadHandler) AddNote(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req addNoteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	activity, err := h.leads.AddNote(c.Request().Context(), companyFromCtx(c), id, sess.UserID, req.Body)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusCreated, activity)
}

// ConvertToContact POST /leads/:id/convert
func (h *LeadHandler) ConvertToContact(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req convertLeadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	var stageID *uuid.UUID
	if req.StageID != nil && *req.StageID != "" {
		sid, perr := uuid.Parse(*req.StageID)
		if perr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "stage_id inválido")
		}
		stageID = &sid
	}
	sess := mw.SessionFromContext(c)
	res, err := h.conversion.ConvertToContact(c.Request().Context(), companyFromCtx(c), sess.UserID, id, stageID)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusCreated, res)
}

// SendToOpportunity POST /leads/:id/send-to-opportunity
// Creates an opportunity (requires stage_id), converting the lead.
func (h *LeadHandler) SendToOpportunity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req convertLeadRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if req.StageID == nil || *req.StageID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "stage_id requerido")
	}
	stageID, perr := uuid.Parse(*req.StageID)
	if perr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "stage_id inválido")
	}
	sess := mw.SessionFromContext(c)
	res, err := h.conversion.ConvertToContact(c.Request().Context(), companyFromCtx(c), sess.UserID, id, &stageID)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusCreated, res)
}

// ListLeadActivities GET /leads/:id/activities
func (h *LeadHandler) ListLeadActivities(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	activities, err := h.leads.GetActivities(c.Request().Context(), id)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, activities)
}
