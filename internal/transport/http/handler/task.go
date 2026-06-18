package handler

import (
	"net/http"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"

	domaintask "pixs/internal/domain/task"
	domaintt "pixs/internal/domain/timetracking"
	svctask "pixs/internal/service/task"
	svctt "pixs/internal/service/timetracking"
	mw "pixs/internal/transport/http/middleware"
)

// TaskHandler handles tasks, comments, timers, and time tracking.
type TaskHandler struct {
	tasks  *svctask.TaskService
	timers *svctask.TimerService
	tt     *svctt.TimeTrackingService
}

// NewTaskHandler constructs a TaskHandler.
func NewTaskHandler(t *svctask.TaskService, tm *svctask.TimerService, tt *svctt.TimeTrackingService) *TaskHandler {
	return &TaskHandler{tasks: t, timers: tm, tt: tt}
}

func mapTaskError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domaintask.ErrTaskNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaintask.ErrInvalidStatusTransition),
		errors.Is(err, domaintask.ErrInvalidStatus),
		errors.Is(err, domaintask.ErrTaskClosed),
		errors.Is(err, domaintask.ErrCommentBodyRequired),
		errors.Is(err, domaintt.ErrInvalidDuration):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaintask.ErrTimerAlreadyRunning):
		return echo.NewHTTPError(http.StatusConflict, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaintask.ErrNoOpenTimer),
		errors.Is(err, domaintt.ErrTimeEntryNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaintask.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

// ─── Tasks ─────────────────────────────────────────────────────────────────────

type createTaskRequest struct {
	Type        string  `json:"type"`
	Title       string  `json:"title" validate:"required"`
	Description *string `json:"description"`
	ContactID   *string `json:"contact_id"`
	ProjectID   *string `json:"project_id"`
	AssigneeID  *string `json:"assignee_id"`
	Origin      *string `json:"origin"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"due_date"`
	ParentID    *string `json:"parent_id"`
}

// CreateTask POST /tasks
func (h *TaskHandler) CreateTask(c echo.Context) error {
	var req createTaskRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	in := svctask.TaskInput{
		Type: req.Type, Title: req.Title, Description: req.Description,
		Origin: req.Origin, Status: req.Status, Priority: req.Priority, ReporterID: sess.UserID,
	}
	var err error
	if in.ContactID, err = parseUUIDPtr(req.ContactID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
	}
	if in.ProjectID, err = parseUUIDPtr(req.ProjectID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "project_id inválido")
	}
	if in.AssigneeID, err = parseUUIDPtr(req.AssigneeID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "assignee_id inválido")
	}
	if in.ParentID, err = parseUUIDPtr(req.ParentID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "parent_id inválido")
	}
	if in.DueDate, err = parseDatePtr(req.DueDate); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "due_date inválido")
	}
	t, err := h.tasks.CreateTask(c.Request().Context(), companyFromCtx(c), in)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusCreated, t)
}

// ListTasks GET /tasks
func (h *TaskHandler) ListTasks(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)
	var f svctask.TaskFilter
	f.Status = c.QueryParam("status")
	if s := c.QueryParam("assignee_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.AssigneeID = &id
		}
	}
	if s := c.QueryParam("project_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ProjectID = &id
		}
	}
	if s := c.QueryParam("contact_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ContactID = &id
		}
	}
	if s := c.QueryParam("due_before"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			f.DueBefore = &t
		}
	}
	tasks, err := h.tasks.ListTasks(c.Request().Context(), companyFromCtx(c), sess.UserID, restrictToOwn, f)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, tasks)
}

// GetTask GET /tasks/:id
func (h *TaskHandler) GetTask(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	t, err := h.tasks.GetTask(c.Request().Context(), companyFromCtx(c), id, sess.UserID, mw.IsRestrictedToOwn(c))
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, t)
}

type updateTaskRequest struct {
	Type        string  `json:"type" validate:"required"`
	Title       string  `json:"title" validate:"required"`
	Description *string `json:"description"`
	ContactID   *string `json:"contact_id"`
	ProjectID   *string `json:"project_id"`
	Priority    string  `json:"priority" validate:"required"`
	DueDate     *string `json:"due_date"`
}

// UpdateTask PUT /tasks/:id
func (h *TaskHandler) UpdateTask(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req updateTaskRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	in := svctask.UpdateTaskInput{Type: req.Type, Title: req.Title, Description: req.Description, Priority: req.Priority}
	if in.ContactID, err = parseUUIDPtr(req.ContactID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
	}
	if in.ProjectID, err = parseUUIDPtr(req.ProjectID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "project_id inválido")
	}
	if in.DueDate, err = parseDatePtr(req.DueDate); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "due_date inválido")
	}
	sess := mw.SessionFromContext(c)
	t, err := h.tasks.UpdateTask(c.Request().Context(), companyFromCtx(c), id, &sess.UserID, in)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, t)
}

type taskStatusRequest struct {
	Status string `json:"status" validate:"required"`
}

// ChangeTaskStatus POST /tasks/:id/status
func (h *TaskHandler) ChangeTaskStatus(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req taskStatusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	t, err := h.tasks.ChangeStatus(c.Request().Context(), companyFromCtx(c), id, req.Status, sess.UserID)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, t)
}

type reassignRequest struct {
	AssigneeID *string `json:"assignee_id"`
}

// ReassignTask POST /tasks/:id/assign
func (h *TaskHandler) ReassignTask(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req reassignRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	assignee, err := parseUUIDPtr(req.AssigneeID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "assignee_id inválido")
	}
	sess := mw.SessionFromContext(c)
	t, err := h.tasks.Reassign(c.Request().Context(), companyFromCtx(c), id, assignee, sess.UserID)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, t)
}

// DeleteTask DELETE /tasks/:id
func (h *TaskHandler) DeleteTask(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	if err := h.tasks.DeleteTask(c.Request().Context(), companyFromCtx(c), id, &sess.UserID); err != nil {
		return mapTaskError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

type taskCommentRequest struct {
	Body string `json:"body" validate:"required"`
}

// AddComment POST /tasks/:id/comments
func (h *TaskHandler) AddComment(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req taskCommentRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	sess := mw.SessionFromContext(c)
	comment, err := h.tasks.AddComment(c.Request().Context(), id, sess.UserID, req.Body)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusCreated, comment)
}

// ListComments GET /tasks/:id/comments
func (h *TaskHandler) ListComments(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	comments, err := h.tasks.ListComments(c.Request().Context(), id)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, comments)
}

// GetHistory GET /tasks/:id/history
func (h *TaskHandler) GetHistory(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	history, err := h.tasks.GetHistory(c.Request().Context(), id)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, history)
}

// ─── Task timers ───────────────────────────────────────────────────────────────

// StartTimer POST /tasks/:id/timer/start
func (h *TaskHandler) StartTimer(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	entry, err := h.timers.Start(c.Request().Context(), id, sess.UserID)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusCreated, entry)
}

// StopTimer POST /tasks/:id/timer/stop
func (h *TaskHandler) StopTimer(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	entry, err := h.timers.Stop(c.Request().Context(), id, sess.UserID)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, entry)
}

// ─── Time tracking ─────────────────────────────────────────────────────────────

type timeEntryRequest struct {
	Date            string  `json:"date" validate:"required"`
	StartedAt       *string `json:"started_at"`
	EndedAt         *string `json:"ended_at"`
	DurationMinutes int32   `json:"duration_minutes" validate:"required"`
	Description     *string `json:"description"`
	TaskID          *string `json:"task_id"`
	ProjectID       *string `json:"project_id"`
	ContactID       *string `json:"contact_id"`
	IsBillable      *bool   `json:"is_billable"`
	HourlyRate      *string `json:"hourly_rate"`
	Currency        *string `json:"currency"`
}

// CreateTimeEntry POST /time-entries
func (h *TaskHandler) CreateTimeEntry(c echo.Context) error {
	var req timeEntryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "date inválido")
	}
	sess := mw.SessionFromContext(c)
	in := svctt.TimeEntryInput{
		UserID: sess.UserID, Date: date, DurationMinutes: req.DurationMinutes,
		Description: req.Description, Currency: req.Currency, IsBillable: true,
	}
	if req.IsBillable != nil {
		in.IsBillable = *req.IsBillable
	}
	if in.TaskID, err = parseUUIDPtr(req.TaskID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "task_id inválido")
	}
	if in.ProjectID, err = parseUUIDPtr(req.ProjectID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "project_id inválido")
	}
	if in.ContactID, err = parseUUIDPtr(req.ContactID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "contact_id inválido")
	}
	if req.HourlyRate != nil && *req.HourlyRate != "" {
		d, derr := decimal.NewFromString(*req.HourlyRate)
		if derr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "hourly_rate inválido")
		}
		in.HourlyRate = &d
	}
	if req.StartedAt != nil && *req.StartedAt != "" {
		t, terr := time.Parse(time.RFC3339, *req.StartedAt)
		if terr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "started_at inválido")
		}
		in.StartedAt = &t
	}
	if req.EndedAt != nil && *req.EndedAt != "" {
		t, terr := time.Parse(time.RFC3339, *req.EndedAt)
		if terr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "ended_at inválido")
		}
		in.EndedAt = &t
	}
	entry, err := h.tt.CreateTimeEntry(c.Request().Context(), companyFromCtx(c), in)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusCreated, entry)
}

// ListTimeEntries GET /time-entries
func (h *TaskHandler) ListTimeEntries(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)
	var f svctt.TimeEntryFilter
	if s := c.QueryParam("user_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.UserID = &id
		}
	}
	if s := c.QueryParam("project_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ProjectID = &id
		}
	}
	if s := c.QueryParam("task_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.TaskID = &id
		}
	}
	if s := c.QueryParam("from"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			f.FromDate = &t
		}
	}
	if s := c.QueryParam("to"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			f.ToDate = &t
		}
	}
	entries, err := h.tt.ListTimeEntries(c.Request().Context(), companyFromCtx(c), sess.UserID, restrictToOwn, f)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, entries)
}

// GetTimesheet GET /time-entries/timesheet?week_start=YYYY-MM-DD
func (h *TaskHandler) GetTimesheet(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	weekStart := time.Now()
	if s := c.QueryParam("week_start"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "week_start inválido")
		}
		weekStart = t
	}
	days, err := h.tt.GetTimesheetWeek(c.Request().Context(), sess.UserID, weekStart)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, days)
}

// GetUtilization GET /time-entries/utilization?from=&to=&user_id=
func (h *TaskHandler) GetUtilization(c echo.Context) error {
	sess := mw.SessionFromContext(c)
	restrictToOwn := mw.IsRestrictedToOwn(c)
	userID := sess.UserID
	if !restrictToOwn {
		if s := c.QueryParam("user_id"); s != "" {
			if id, err := uuid.Parse(s); err == nil {
				userID = id
			}
		}
	}
	from := time.Now().AddDate(0, 0, -30)
	to := time.Now()
	if s := c.QueryParam("from"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			from = t
		}
	}
	if s := c.QueryParam("to"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			to = t
		}
	}
	report, err := h.tt.GetUtilization(c.Request().Context(), companyFromCtx(c), userID, from, to)
	if err != nil {
		return mapTaskError(err)
	}
	return c.JSON(http.StatusOK, report)
}
