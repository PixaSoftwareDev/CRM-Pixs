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
	// Query triggers keyword-search mode (e.g. "queserías Argentina").
	Query       string   `json:"query"`
	ResultCount int      `json:"result_count"`
	// URLs is used for manual-URL mode (optional, rarely needed).
	URLs    []string `json:"urls"`
	Country string   `json:"country"`
}

// EnqueueScrapingJob POST /scraping-jobs
func (h *ScrapingHandler) EnqueueScrapingJob(c echo.Context) error {
	var req enqueueScrapingRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if req.Query == "" && len(req.URLs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "se requiere query o urls")
	}
	sess := mw.SessionFromContext(c)
	res, err := h.orchestrator.EnqueueJob(c.Request().Context(), companyFromCtx(c), sess.UserID, svclead.EnqueueJobInput{
		Query:       req.Query,
		ResultCount: req.ResultCount,
		URLs:        req.URLs,
		Country:     req.Country,
	})
	if err != nil {
		return mapLeadError(err)
	}
	return c.JSON(http.StatusAccepted, map[string]any{
		"job_id":  res.Job.ID,
		"status":  res.Job.Status,
		"channel": res.Channel,
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

// DeleteScrapingJob DELETE /scraping-jobs/:id
func (h *ScrapingHandler) DeleteScrapingJob(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.orchestrator.DeleteJob(c.Request().Context(), companyFromCtx(c), id); err != nil {
		return mapLeadError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
