package handler

import (
	"net/http"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	domainvault "pixs/internal/domain/vault"
	svcvault "pixs/internal/service/vault"
	mw "pixs/internal/transport/http/middleware"
)

// VaultHandler handles the credential vault routes.
type VaultHandler struct {
	svc *svcvault.VaultService
}

// NewVaultHandler constructs a VaultHandler.
func NewVaultHandler(svc *svcvault.VaultService) *VaultHandler {
	return &VaultHandler{svc: svc}
}

func mapVaultError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, domainvault.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "entrada no encontrada")
	case errors.Is(err, domainvault.ErrNoLabel):
		return echo.NewHTTPError(http.StatusBadRequest, "el nombre de la entrada es obligatorio")
	case errors.Is(err, domainvault.ErrForbidden):
		return echo.NewHTTPError(http.StatusForbidden, "acceso denegado")
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
}

type vaultEntryRequest struct {
	Category string   `json:"category"`
	Label    string   `json:"label" validate:"required"`
	Username *string  `json:"username"`
	Secret   *string  `json:"secret"`
	URL      *string  `json:"url"`
	Notes    *string  `json:"notes"`
	Tags     []string `json:"tags"`
}

// ListVaultEntries GET /vault
func (h *VaultHandler) ListVaultEntries(c echo.Context) error {
	entries, err := h.svc.List(c.Request().Context(), companyFromCtx(c), c.QueryParam("category"))
	if err != nil {
		return mapVaultError(err)
	}
	return c.JSON(http.StatusOK, entries)
}

// GetVaultEntry GET /vault/:id  — returns decrypted secret
func (h *VaultHandler) GetVaultEntry(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	entry, err := h.svc.Get(c.Request().Context(), companyFromCtx(c), id)
	if err != nil {
		return mapVaultError(err)
	}
	return c.JSON(http.StatusOK, entry)
}

// CreateVaultEntry POST /vault
func (h *VaultHandler) CreateVaultEntry(c echo.Context) error {
	var req vaultEntryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	sess := mw.SessionFromContext(c)
	entry, err := h.svc.Create(c.Request().Context(), companyFromCtx(c), sess.UserID, svcvault.EntryInput{
		Category: req.Category, Label: req.Label, Username: req.Username,
		Secret: req.Secret, URL: req.URL, Notes: req.Notes, Tags: req.Tags,
	})
	if err != nil {
		return mapVaultError(err)
	}
	return c.JSON(http.StatusCreated, entry)
}

// UpdateVaultEntry PUT /vault/:id
func (h *VaultHandler) UpdateVaultEntry(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req vaultEntryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	entry, err := h.svc.Update(c.Request().Context(), companyFromCtx(c), id, svcvault.EntryInput{
		Category: req.Category, Label: req.Label, Username: req.Username,
		Secret: req.Secret, URL: req.URL, Notes: req.Notes, Tags: req.Tags,
	})
	if err != nil {
		return mapVaultError(err)
	}
	return c.JSON(http.StatusOK, entry)
}

// DeleteVaultEntry DELETE /vault/:id
func (h *VaultHandler) DeleteVaultEntry(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	if err := h.svc.Delete(c.Request().Context(), companyFromCtx(c), id); err != nil {
		return mapVaultError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
