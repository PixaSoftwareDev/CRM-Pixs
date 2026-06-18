package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	svclead "pixs/internal/service/lead"
	mw "pixs/internal/transport/http/middleware"
)

// ScrapingHandler handles scraping-job routes.
type ScrapingHandler struct {
	orchestrator *svclead.ScrapingOrchestrator
}

// NewScrapingHandler constructs a ScrapingHandler.
func NewScrapingHandler(orchestrator *svclead.ScrapingOrchestrator) *ScrapingHandler {
	return &ScrapingHandler{orchestrator: orchestrator}
}

type enqueueScrapingRequest struct {
	Query       string `json:"query"        validate:"required"`
	Country     string `json:"country"`
	Language    string `json:"language"`
	ResultCount int    `json:"result_count"`
}

// EnqueueScrapingJob POST /scraping-jobs
func (h *ScrapingHandler) EnqueueScrapingJob(c echo.Context) error {
	var req enqueueScrapingRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	res, err := h.orchestrator.EnqueueJob(c.Request().Context(), companyFromCtx(c), sess.UserID, svclead.EnqueueJobInput{
		Query:       req.Query,
		Country:     req.Country,
		Language:    req.Language,
		ResultCount: req.ResultCount,
	})
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusAccepted, map[string]any{
		"job_id":         res.Job.ID,
		"status":         res.Job.Status,
		"estimated_cost": res.Cost,
		"channel":        res.Channel,
	})
}

// ListScrapingJobs GET /scraping-jobs
func (h *ScrapingHandler) ListScrapingJobs(c echo.Context) error {
	jobs, err := h.orchestrator.ListJobs(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, jobs)
}

// GetScrapingJob GET /scraping-jobs/:id
func (h *ScrapingHandler) GetScrapingJob(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	job, err := h.orchestrator.GetJob(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusOK, job)
}
