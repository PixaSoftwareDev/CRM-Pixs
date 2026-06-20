package handler

import (
	"fmt"
	"net/http"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	domaindoc "pixs/internal/domain/document"
	svcdocument "pixs/internal/service/document"
	mw "pixs/internal/transport/http/middleware"
)

// DocumentHandler handles file attachment routes (contacts and tasks).
type DocumentHandler struct {
	svc *svcdocument.DocumentService
}

// NewDocumentHandler constructs a DocumentHandler.
func NewDocumentHandler(svc *svcdocument.DocumentService) *DocumentHandler {
	return &DocumentHandler{svc: svc}
}

func mapDocumentError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domaindoc.ErrDocumentNotFound):
		return echo.NewHTTPError(http.StatusNotFound, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaindoc.ErrInvalidEntityType),
		errors.Is(err, domaindoc.ErrFileRequired):
		return echo.NewHTTPError(http.StatusBadRequest, errors.UnwrapAll(err).Error())
	case errors.Is(err, domaindoc.ErrFileTooLarge):
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, errors.UnwrapAll(err).Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

// ListDocuments GET /documents?entity_type=&entity_id=
func (h *DocumentHandler) ListDocuments(c echo.Context) error {
	entityType, err := domaindoc.ParseEntityType(c.QueryParam("entity_type"))
	if err != nil {
		return mapDocumentError(err)
	}
	entityID, err := uuid.Parse(c.QueryParam("entity_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "entity_id inválido")
	}
	docs, err := h.svc.List(c.Request().Context(), companyFromCtx(c), entityType, entityID)
	if err != nil {
		return mapDocumentError(err)
	}
	return c.JSON(http.StatusOK, docs)
}

// UploadDocument POST /documents (multipart: entity_type, entity_id, file)
func (h *DocumentHandler) UploadDocument(c echo.Context) error {
	entityType, err := domaindoc.ParseEntityType(c.FormValue("entity_type"))
	if err != nil {
		return mapDocumentError(err)
	}
	entityID, err := uuid.Parse(c.FormValue("entity_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "entity_id inválido")
	}
	fh, err := c.FormFile("file")
	if err != nil {
		return mapDocumentError(domaindoc.ErrFileRequired)
	}
	if fh.Size > h.svc.MaxBytes() {
		return mapDocumentError(domaindoc.ErrFileTooLarge)
	}
	src, err := fh.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "no se pudo leer el archivo")
	}
	defer src.Close()

	sess := mw.SessionFromContext(c)
	doc, err := h.svc.Upload(c.Request().Context(), companyFromCtx(c), svcdocument.UploadInput{
		EntityType:  entityType,
		EntityID:    entityID,
		UploadedBy:  sess.UserID,
		FileName:    fh.Filename,
		ContentType: fh.Header.Get("Content-Type"),
		Content:     src,
	})
	if err != nil {
		return mapDocumentError(err)
	}
	return c.JSON(http.StatusCreated, doc)
}

// DownloadDocument GET /documents/:id/download
func (h *DocumentHandler) DownloadDocument(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	doc, rc, err := h.svc.Open(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapDocumentError(err)
	}
	defer rc.Close()

	c.Response().Header().Set(echo.HeaderContentDisposition,
		fmt.Sprintf(`attachment; filename="%s"`, doc.FileName))
	return c.Stream(http.StatusOK, doc.ContentType, rc)
}

// DeleteDocument DELETE /documents/:id
func (h *DocumentHandler) DeleteDocument(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.svc.Delete(c.Request().Context(), companyFromCtx(c), id); err != nil {
		return mapDocumentError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
