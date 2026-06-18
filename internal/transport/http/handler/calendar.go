package handler

import (
	"net/http"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	domaincalendar "pixs/internal/domain/calendar"
	svccalendar "pixs/internal/service/calendar"
	mw "pixs/internal/transport/http/middleware"
)

// CalendarHandler handles calendar event routes.
type CalendarHandler struct {
	svc *svccalendar.CalendarService
}

// NewCalendarHandler constructs a CalendarHandler.
func NewCalendarHandler(svc *svccalendar.CalendarService) *CalendarHandler {
	return &CalendarHandler{svc: svc}
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

type createEventTypeRequest struct {
	Name  string  `json:"name"  validate:"required"`
	Color string  `json:"color" validate:"required"`
	Icon  *string `json:"icon"`
}

type createEventRequest struct {
	Title                string  `json:"title"           validate:"required"`
	EventTypeID          *string `json:"event_type_id"`
	ContactID            *string `json:"contact_id"`
	AssignedUserID       string  `json:"assigned_user_id" validate:"required,uuid"`
	StartsAt             string  `json:"starts_at"       validate:"required"`
	EndsAt               *string `json:"ends_at"`
	AllDay               bool    `json:"all_day"`
	Status               string  `json:"status"`
	Notes                *string `json:"notes"`
	RelatedTaskID        *string `json:"related_task_id"`
	RelatedOpportunityID *string `json:"related_opportunity_id"`
	RelatedProjectID     *string `json:"related_project_id"`
}

type updateEventRequest = createEventRequest

// ─── Helpers ──────────────────────────────────────────────────────────────────

func mapCalendarError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domaincalendar.ErrEventNotFound),
		errors.Is(err, domaincalendar.ErrEventTypeNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincalendar.ErrEventTypeDuplicate):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincalendar.ErrInvalidEventStatus):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaincalendar.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

func parseOptionalUUID(s *string) (*uuid.UUID, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	uid, err := uuid.Parse(*s)
	if err != nil {
		return nil, err
	}
	return &uid, nil
}

// ─── Event Types ──────────────────────────────────────────────────────────────

// CreateEventType POST /calendar/event-types
func (h *CalendarHandler) CreateEventType(c echo.Context) error {
	var req createEventTypeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	et, err := h.svc.CreateEventType(c.Request().Context(), companyFromCtx(c), req.Name, req.Color, req.Icon)
	if err != nil {
		return mapCalendarError(err)
	}
	return c.JSON(http.StatusCreated, et)
}

// ListEventTypes GET /calendar/event-types
func (h *CalendarHandler) ListEventTypes(c echo.Context) error {
	types, err := h.svc.ListEventTypes(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapCalendarError(err)
	}
	return c.JSON(http.StatusOK, types)
}

// ─── Events ───────────────────────────────────────────────────────────────────

// CreateEvent POST /calendar/events
func (h *CalendarHandler) CreateEvent(c echo.Context) error {
	var req createEventRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	assignedUserID, _ := uuid.Parse(req.AssignedUserID)
	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "starts_at inválido (formato RFC3339)")
	}

	in := svccalendar.CreateEventInput{
		Title:          req.Title,
		AssignedUserID: assignedUserID,
		StartsAt:       startsAt,
		AllDay:         req.AllDay,
		Status:         req.Status,
		Notes:          req.Notes,
	}

	var parseErr error
	in.EventTypeID, parseErr = parseOptionalUUID(req.EventTypeID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "event_type_id inválido")
	}
	in.ContactID, parseErr = parseOptionalUUID(req.ContactID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
	}
	in.RelatedTaskID, parseErr = parseOptionalUUID(req.RelatedTaskID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "related_task_id inválido")
	}
	in.RelatedOpportunityID, parseErr = parseOptionalUUID(req.RelatedOpportunityID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "related_opportunity_id inválido")
	}
	in.RelatedProjectID, parseErr = parseOptionalUUID(req.RelatedProjectID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "related_project_id inválido")
	}
	if req.EndsAt != nil {
		t, err := time.Parse(time.RFC3339, *req.EndsAt)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "ends_at inválido (formato RFC3339)")
		}
		in.EndsAt = &t
	}

	event, err := h.svc.CreateEvent(c.Request().Context(), companyFromCtx(c), in)
	if err != nil {
		return mapCalendarError(err)
	}
	return c.JSON(http.StatusCreated, event)
}

// GetEvent GET /calendar/events/:id
func (h *CalendarHandler) GetEvent(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)

	event, err := h.svc.GetEvent(c.Request().Context(), companyFromCtx(c), id, sess.UserID, restrictToOwn)
	if err != nil {
		return mapCalendarError(err)
	}
	return c.JSON(http.StatusOK, event)
}

// ListEvents GET /calendar/events
func (h *CalendarHandler) ListEvents(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)

	f := svccalendar.ListFilter{Status: c.QueryParam("status")}

	if from := c.QueryParam("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "from inválido (formato RFC3339)")
		}
		f.From = &t
	}
	if to := c.QueryParam("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "to inválido (formato RFC3339)")
		}
		f.To = &t
	}
	if etID := c.QueryParam("event_type_id"); etID != "" {
		uid, err := uuid.Parse(etID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "event_type_id inválido")
		}
		f.EventTypeID = &uid
	}
	if cID := c.QueryParam("contact_id"); cID != "" {
		uid, err := uuid.Parse(cID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
		}
		f.ContactID = &uid
	}
	if aID := c.QueryParam("assigned_user_id"); aID != "" {
		uid, err := uuid.Parse(aID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "assigned_user_id inválido")
		}
		f.AssignedUserID = &uid
	}

	events, err := h.svc.ListEvents(c.Request().Context(), companyFromCtx(c), sess.UserID, restrictToOwn, f)
	if err != nil {
		return mapCalendarError(err)
	}
	return c.JSON(http.StatusOK, events)
}

// UpdateEvent PUT /calendar/events/:id
func (h *CalendarHandler) UpdateEvent(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}

	var req updateEventRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}

	assignedUserID, _ := uuid.Parse(req.AssignedUserID)
	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "starts_at inválido (formato RFC3339)")
	}

	in := svccalendar.UpdateEventInput{
		Title:          req.Title,
		AssignedUserID: assignedUserID,
		StartsAt:       startsAt,
		AllDay:         req.AllDay,
		Status:         req.Status,
		Notes:          req.Notes,
	}

	var parseErr error
	in.EventTypeID, parseErr = parseOptionalUUID(req.EventTypeID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "event_type_id inválido")
	}
	in.ContactID, parseErr = parseOptionalUUID(req.ContactID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
	}
	in.RelatedTaskID, parseErr = parseOptionalUUID(req.RelatedTaskID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "related_task_id inválido")
	}
	in.RelatedOpportunityID, parseErr = parseOptionalUUID(req.RelatedOpportunityID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "related_opportunity_id inválido")
	}
	in.RelatedProjectID, parseErr = parseOptionalUUID(req.RelatedProjectID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "related_project_id inválido")
	}
	if req.EndsAt != nil {
		t, err := time.Parse(time.RFC3339, *req.EndsAt)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "ends_at inválido (formato RFC3339)")
		}
		in.EndsAt = &t
	}

	event, err := h.svc.UpdateEvent(c.Request().Context(), companyFromCtx(c), id, in)
	if err != nil {
		return mapCalendarError(err)
	}
	return c.JSON(http.StatusOK, event)
}

// DeleteEvent DELETE /calendar/events/:id
func (h *CalendarHandler) DeleteEvent(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.svc.DeleteEvent(c.Request().Context(), companyFromCtx(c), id); err != nil {
		return mapCalendarError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
