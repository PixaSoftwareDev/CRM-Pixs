package handler

import (
	"net/http"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	domainproject "pixs/internal/domain/project"
	svcproject "pixs/internal/service/project"
	mw "pixs/internal/transport/http/middleware"
)

// ProjectHandler handles projects, milestones, members, and profitability.
type ProjectHandler struct {
	projects      *svcproject.ProjectService
	profitability *svcproject.ProfitabilityService
}

// NewProjectHandler constructs a ProjectHandler.
func NewProjectHandler(p *svcproject.ProjectService, prof *svcproject.ProfitabilityService) *ProjectHandler {
	return &ProjectHandler{projects: p, profitability: prof}
}

func mapProjectError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domainproject.ErrProjectNotFound),
		errors.Is(err, domainproject.ErrMilestoneNotFound),
		errors.Is(err, domainproject.ErrMemberNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainproject.ErrInvalidStatus):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domainproject.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

func parseDatePtr(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

type projectRequest struct {
	ClientID         string  `json:"client_id" validate:"required,uuid"`
	Name             string  `json:"name" validate:"required"`
	Description      *string `json:"description"`
	StartDate        *string `json:"start_date"`
	EstimatedEndDate *string `json:"estimated_end_date"`
	ActualEndDate    *string `json:"actual_end_date"`
	Status           string  `json:"status"`
	ResponsibleID    *string `json:"responsible_id"`
	BudgetHours      *string `json:"budget_hours"`
	BudgetAmount     *string `json:"budget_amount"`
	Currency         string  `json:"currency"`
	OpportunityID    *string `json:"opportunity_id"`
	QuoteID          *string `json:"quote_id"`
}

func (r *projectRequest) toInput() (svcproject.ProjectInput, error) {
	clientID, err := uuid.Parse(r.ClientID)
	if err != nil {
		return svcproject.ProjectInput{}, err
	}
	in := svcproject.ProjectInput{
		ClientID: clientID, Name: r.Name, Description: r.Description, Status: r.Status, Currency: r.Currency,
	}
	if in.StartDate, err = parseDatePtr(r.StartDate); err != nil {
		return in, err
	}
	if in.EstimatedEndDate, err = parseDatePtr(r.EstimatedEndDate); err != nil {
		return in, err
	}
	if in.ActualEndDate, err = parseDatePtr(r.ActualEndDate); err != nil {
		return in, err
	}
	if in.ResponsibleID, err = parseUUIDPtr(r.ResponsibleID); err != nil {
		return in, err
	}
	if in.OpportunityID, err = parseUUIDPtr(r.OpportunityID); err != nil {
		return in, err
	}
	if in.QuoteID, err = parseUUIDPtr(r.QuoteID); err != nil {
		return in, err
	}
	if in.BudgetHours, err = parseDecPtr(r.BudgetHours); err != nil {
		return in, err
	}
	if in.BudgetAmount, err = parseDecPtr(r.BudgetAmount); err != nil {
		return in, err
	}
	return in, nil
}

// CreateProject POST /projects
func (h *ProjectHandler) CreateProject(c echo.Context) error {
	var req projectRequest
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
	p, err := h.projects.CreateProject(c.Request().Context(), companyFromCtx(c), &sess.UserID, in)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusCreated, p)
}

// ListProjects GET /projects
func (h *ProjectHandler) ListProjects(c echo.Context) error {
	var f svcproject.ProjectFilter
	f.Status = c.QueryParam("status")
	if s := c.QueryParam("client_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ClientID = &id
		}
	}
	if s := c.QueryParam("responsible_id"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			f.ResponsibleID = &id
		}
	}
	projects, err := h.projects.ListProjects(c.Request().Context(), companyFromCtx(c), f)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, projects)
}

// GetProject GET /projects/:id
func (h *ProjectHandler) GetProject(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	p, err := h.projects.GetProject(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, p)
}

// UpdateProject PUT /projects/:id
func (h *ProjectHandler) UpdateProject(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req projectRequest
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
	p, err := h.projects.UpdateProject(c.Request().Context(), companyFromCtx(c), id, &sess.UserID, in)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, p)
}

// DeleteProject DELETE /projects/:id
func (h *ProjectHandler) DeleteProject(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	sess := mw.SessionFromContext(c)
	if err := h.projects.DeleteProject(c.Request().Context(), companyFromCtx(c), id, &sess.UserID); err != nil {
		return mapProjectError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// GetProfitability GET /projects/:id/profitability
func (h *ProjectHandler) GetProfitability(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	report, err := h.profitability.GetProfitability(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, report)
}

// ─── Milestones ────────────────────────────────────────────────────────────────

type milestoneRequest struct {
	Name          string  `json:"name" validate:"required"`
	Description   *string `json:"description"`
	Deliverables  *string `json:"deliverables"`
	CommittedDate *string `json:"committed_date"`
	Status        string  `json:"status"`
	OrderPos      *int16  `json:"order_pos"`
}

func (r *milestoneRequest) toInput() (svcproject.MilestoneInput, error) {
	in := svcproject.MilestoneInput{Name: r.Name, Description: r.Description, Deliverables: r.Deliverables, Status: r.Status, OrderPos: r.OrderPos}
	var err error
	if in.CommittedDate, err = parseDatePtr(r.CommittedDate); err != nil {
		return in, err
	}
	return in, nil
}

// CreateMilestone POST /projects/:id/milestones
func (h *ProjectHandler) CreateMilestone(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req milestoneRequest
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
	m, err := h.projects.CreateMilestone(c.Request().Context(), projectID, in)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusCreated, m)
}

// ListMilestones GET /projects/:id/milestones
func (h *ProjectHandler) ListMilestones(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	ms, err := h.projects.ListMilestones(c.Request().Context(), projectID)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, ms)
}

// UpdateMilestone PUT /projects/:id/milestones/:milestone_id
func (h *ProjectHandler) UpdateMilestone(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	milestoneID, err := uuid.Parse(c.Param("milestone_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "milestone_id inválido")
	}
	var req milestoneRequest
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
	m, err := h.projects.UpdateMilestone(c.Request().Context(), milestoneID, projectID, in)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, m)
}

// DeleteMilestone DELETE /projects/:id/milestones/:milestone_id
func (h *ProjectHandler) DeleteMilestone(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	milestoneID, err := uuid.Parse(c.Param("milestone_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "milestone_id inválido")
	}
	if err := h.projects.DeleteMilestone(c.Request().Context(), milestoneID, projectID); err != nil {
		return mapProjectError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Members ───────────────────────────────────────────────────────────────────

type addMemberRequest struct {
	UserID        string  `json:"user_id" validate:"required,uuid"`
	RoleInProject *string `json:"role_in_project"`
}

// AddMember POST /projects/:id/members
func (h *ProjectHandler) AddMember(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req addMemberRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	userID, _ := uuid.Parse(req.UserID)
	if err := h.projects.AddMember(c.Request().Context(), projectID, userID, req.RoleInProject); err != nil {
		return mapProjectError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ListMembers GET /projects/:id/members
func (h *ProjectHandler) ListMembers(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	members, err := h.projects.ListMembers(c.Request().Context(), projectID)
	if err != nil {
		return mapProjectError(err)
	}
	return c.JSON(http.StatusOK, members)
}

// RemoveMember DELETE /projects/:id/members/:user_id
func (h *ProjectHandler) RemoveMember(c echo.Context) error {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	userID, err := uuid.Parse(c.Param("user_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id inválido")
	}
	if err := h.projects.RemoveMember(c.Request().Context(), projectID, userID); err != nil {
		return mapProjectError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
