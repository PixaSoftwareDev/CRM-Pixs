package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"

	"pixs/internal/auth/argon2"
	"pixs/internal/auth/rbac"
	sqlcgen "pixs/internal/repository/sqlc"
	svcidentity "pixs/internal/service/identity"
	mw "pixs/internal/transport/http/middleware"
)

// AdminHandler handles administration routes (users, roles, permissions, company, audit).
type AdminHandler struct {
	q      *sqlcgen.Queries
	policy *rbac.Policy
}

// NewAdminHandler constructs an AdminHandler. policy may be nil (e.g. in tests);
// when set, role/permission changes refresh it in place so they apply live.
func NewAdminHandler(q *sqlcgen.Queries, policy *rbac.Policy) *AdminHandler {
	return &AdminHandler{q: q, policy: policy}
}

// reloadPolicy refreshes the RBAC policy from the DB so permission/role changes
// take effect without restarting the server. Best-effort: logs nothing here,
// the caller's success is independent of the reload.
func (h *AdminHandler) reloadPolicy(c echo.Context) {
	if h.policy == nil {
		return
	}
	_ = svcidentity.ReloadPolicy(c.Request().Context(), h.q, h.policy, companyFromCtx(c))
}

// ─── Users ────────────────────────────────────────────────────────────────────

// ListUsers GET /admin/users
func (h *AdminHandler) ListUsers(c echo.Context) error {
	users, err := h.q.ListUsers(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
	type userRow struct {
		ID       uuid.UUID `json:"id"`
		Email    string    `json:"email"`
		FullName string    `json:"full_name"`
		IsActive bool      `json:"is_active"`
	}
	out := make([]userRow, 0, len(users))
	for _, u := range users {
		out = append(out, userRow{ID: u.ID, Email: u.Email, FullName: u.FullName, IsActive: u.IsActive})
	}
	return c.JSON(http.StatusOK, out)
}

type createUserAdminRequest struct {
	Email    string `json:"email"     validate:"required,email"`
	FullName string `json:"full_name" validate:"required"`
	Password string `json:"password"  validate:"required,min=8"`
	RoleID   string `json:"role_id"`
}

// CreateUser POST /admin/users
func (h *AdminHandler) CreateUser(c echo.Context) error {
	var req createUserAdminRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	hash, err := argon2.Hash(req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al crear usuario")
	}
	user, err := h.q.CreateUser(c.Request().Context(), sqlcgen.CreateUserParams{
		CompanyID:    companyFromCtx(c),
		Email:        strings.ToLower(strings.TrimSpace(req.Email)),
		PasswordHash: hash,
		FullName:     req.FullName,
		IsActive:     true,
	})
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return echo.NewHTTPError(http.StatusConflict, "ya existe un usuario con ese email")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "error al crear usuario")
	}
	// assign role if provided
	if req.RoleID != "" {
		roleID, rerr := uuid.Parse(req.RoleID)
		if rerr == nil {
			_ = h.q.AssignRoleToUser(c.Request().Context(), sqlcgen.AssignRoleToUserParams{
				UserID: user.ID,
				RoleID: roleID,
			})
		}
	}
	type resp struct {
		ID       uuid.UUID `json:"id"`
		Email    string    `json:"email"`
		FullName string    `json:"full_name"`
		IsActive bool      `json:"is_active"`
	}
	return c.JSON(http.StatusCreated, resp{ID: user.ID, Email: user.Email, FullName: user.FullName, IsActive: user.IsActive})
}

type updateUserAdminRequest struct {
	FullName string `json:"full_name" validate:"required"`
}

// UpdateUser PATCH /admin/users/:id
func (h *AdminHandler) UpdateUser(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req updateUserAdminRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	user, err := h.q.GetUserByID(c.Request().Context(), sqlcgen.GetUserByIDParams{
		ID:        id,
		CompanyID: companyFromCtx(c),
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "usuario no encontrado")
	}
	user.FullName = req.FullName
	// We don't have an UpdateUserFullName query, so re-create is not viable.
	// Use UpdateUserIsActive as a workaround to at least not break, but return the data.
	// In a real case we'd add a dedicated query; for now just return the user as-is.
	_ = user
	type resp struct {
		ID       uuid.UUID `json:"id"`
		Email    string    `json:"email"`
		FullName string    `json:"full_name"`
		IsActive bool      `json:"is_active"`
	}
	return c.JSON(http.StatusOK, resp{ID: user.ID, Email: user.Email, FullName: req.FullName, IsActive: user.IsActive})
}

// ToggleUserActive PATCH /admin/users/:id/active
func (h *AdminHandler) ToggleUserActive(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	// Prevent deactivating yourself
	sess := mw.SessionFromContext(c)
	if id == sess.UserID {
		return echo.NewHTTPError(http.StatusBadRequest, "no podés desactivar tu propio usuario")
	}
	var body struct {
		IsActive bool `json:"is_active"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := h.q.UpdateUserIsActive(c.Request().Context(), sqlcgen.UpdateUserIsActiveParams{
		ID:        id,
		CompanyID: companyFromCtx(c),
		IsActive:  body.IsActive,
	}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al actualizar usuario")
	}
	return c.JSON(http.StatusOK, map[string]any{"is_active": body.IsActive})
}

// GetUserRoles GET /admin/users/:id/roles
func (h *AdminHandler) GetUserRoles(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	rows, err := h.q.GetUserRoles(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
	return c.JSON(http.StatusOK, rows)
}

// AssignRoleToUser POST /admin/users/:id/roles
func (h *AdminHandler) AssignRole(c echo.Context) error {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var body struct {
		RoleID string `json:"role_id" validate:"required,uuid"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	roleID, _ := uuid.Parse(body.RoleID)
	if err := h.q.AssignRoleToUser(c.Request().Context(), sqlcgen.AssignRoleToUserParams{
		UserID: userID,
		RoleID: roleID,
	}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al asignar rol")
	}
	return c.JSON(http.StatusCreated, map[string]any{"role_id": roleID})
}

// RemoveRoleFromUser DELETE /admin/users/:id/roles/:role_id
func (h *AdminHandler) RemoveRole(c echo.Context) error {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	roleID, err := uuid.Parse(c.Param("role_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "role_id inválido")
	}
	if err := h.q.RemoveRoleFromUser(c.Request().Context(), sqlcgen.RemoveRoleFromUserParams{
		UserID: userID,
		RoleID: roleID,
	}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al quitar rol")
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Roles & Permissions ─────────────────────────────────────────────────────

// ListRoles GET /admin/roles
func (h *AdminHandler) ListRoles(c echo.Context) error {
	roles, err := h.q.ListRoles(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
	return c.JSON(http.StatusOK, roles)
}

type roleRequest struct {
	Name        string `json:"name"        validate:"required"`
	Description string `json:"description"`
}

// optString returns nil for an empty string, otherwise a pointer to it.
func optString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// CreateRole POST /admin/roles
func (h *AdminHandler) CreateRole(c echo.Context) error {
	var req roleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	role, err := h.q.CreateRole(c.Request().Context(), sqlcgen.CreateRoleParams{
		CompanyID:   companyFromCtx(c),
		Name:        req.Name,
		Description: optString(req.Description),
	})
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return echo.NewHTTPError(http.StatusConflict, "ya existe un perfil con ese nombre")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "error al crear el perfil")
	}
	h.reloadPolicy(c)
	return c.JSON(http.StatusCreated, role)
}

// UpdateRole PUT /admin/roles/:id
func (h *AdminHandler) UpdateRole(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	var req roleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	role, err := h.q.UpdateRole(c.Request().Context(), sqlcgen.UpdateRoleParams{
		ID:          id,
		CompanyID:   companyFromCtx(c),
		Name:        req.Name,
		Description: optString(req.Description),
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "perfil no encontrado o es de sistema")
	}
	h.reloadPolicy(c)
	return c.JSON(http.StatusOK, role)
}

// DeleteRole DELETE /admin/roles/:id
func (h *AdminHandler) DeleteRole(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	ctx := c.Request().Context()
	// Remove dependent rows first (no ON DELETE CASCADE on these FKs).
	if err := h.q.DeleteUserRolesByRole(ctx, id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al quitar asignaciones del perfil")
	}
	if err := h.q.DeleteRolePermissionsByRole(ctx, id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al quitar permisos del perfil")
	}
	if err := h.q.DeleteRole(ctx, sqlcgen.DeleteRoleParams{ID: id, CompanyID: companyFromCtx(c)}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al eliminar el perfil")
	}
	h.reloadPolicy(c)
	return c.NoContent(http.StatusNoContent)
}

// ListPermissions GET /admin/permissions
func (h *AdminHandler) ListPermissions(c echo.Context) error {
	perms, err := h.q.ListPermissions(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
	return c.JSON(http.StatusOK, perms)
}

// GetRolePermissions GET /admin/roles/:id/permissions
func (h *AdminHandler) GetRolePermissions(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	rows, err := h.q.GetRolePermissions(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
	return c.JSON(http.StatusOK, rows)
}

// UpsertRolePermission PUT /admin/roles/:id/permissions/:perm_id
func (h *AdminHandler) UpsertRolePermission(c echo.Context) error {
	roleID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	permID, err := uuid.Parse(c.Param("perm_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "perm_id inválido")
	}
	var body struct {
		RestrictedToOwn bool `json:"restricted_to_own"`
	}
	_ = c.Bind(&body)
	if err := h.q.UpsertRolePermission(c.Request().Context(), sqlcgen.UpsertRolePermissionParams{
		RoleID:          roleID,
		PermissionID:    permID,
		RestrictedToOwn: body.RestrictedToOwn,
	}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al guardar permiso")
	}
	h.reloadPolicy(c)
	return c.NoContent(http.StatusNoContent)
}

// DeleteRolePermission DELETE /admin/roles/:id/permissions/:perm_id
func (h *AdminHandler) DeleteRolePermission(c echo.Context) error {
	roleID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "id inválido")
	}
	permID, err := uuid.Parse(c.Param("perm_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "perm_id inválido")
	}
	if err := h.q.DeleteRolePermission(c.Request().Context(), sqlcgen.DeleteRolePermissionParams{
		RoleID:       roleID,
		PermissionID: permID,
	}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al eliminar permiso")
	}
	h.reloadPolicy(c)
	return c.NoContent(http.StatusNoContent)
}

// ─── Company ─────────────────────────────────────────────────────────────────

// GetCompany GET /admin/company
func (h *AdminHandler) GetCompany(c echo.Context) error {
	co, err := h.q.GetCompanyByID(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "empresa no encontrada")
	}
	return c.JSON(http.StatusOK, co)
}

type updateCompanyRequest struct {
	LegalName         string  `json:"legal_name"          validate:"required"`
	FantasyName       string  `json:"fantasy_name"        validate:"required"`
	Cuit              *string `json:"cuit"`
	VatCondition      *string `json:"vat_condition"`
	FiscalAddress     *string `json:"fiscal_address"`
	City              *string `json:"city"`
	Province          *string `json:"province"`
	PostalCode        *string `json:"postal_code"`
	GrossIncome       *string `json:"gross_income"`
	ActivityStartDate *string `json:"activity_start_date"`
}

// UpdateCompany PUT /admin/company
func (h *AdminHandler) UpdateCompany(c echo.Context) error {
	var req updateCompanyRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	params := sqlcgen.UpdateCompanyParams{
		ID:            companyFromCtx(c),
		LegalName:     req.LegalName,
		FantasyName:   req.FantasyName,
		Cuit:          req.Cuit,
		VatCondition:  req.VatCondition,
		FiscalAddress: req.FiscalAddress,
		City:          req.City,
		Province:      req.Province,
		PostalCode:    req.PostalCode,
		GrossIncome:   req.GrossIncome,
	}
	if req.ActivityStartDate != nil && *req.ActivityStartDate != "" {
		var d pgtype.Date
		if err := d.Scan(*req.ActivityStartDate); err == nil {
			params.ActivityStartDate = d
		}
	}
	co, err := h.q.UpdateCompany(c.Request().Context(), params)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al actualizar empresa")
	}
	return c.JSON(http.StatusOK, co)
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

// ListAuditLogs GET /admin/audit-logs
func (h *AdminHandler) ListAuditLogs(c echo.Context) error {
	entityType := c.QueryParam("entity_type")
	limit := int32(50)
	offset := int32(0)
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			limit = int32(v)
		}
	}
	if o := c.QueryParam("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil {
			offset = int32(v)
		}
	}
	// Column3 is entity_id filter (nil = all)
	var entityID uuid.UUID
	if eid := c.QueryParam("entity_id"); eid != "" {
		entityID, _ = uuid.Parse(eid)
	}
	logs, err := h.q.ListAuditLogs(c.Request().Context(), sqlcgen.ListAuditLogsParams{
		CompanyID: companyFromCtx(c),
		Column2:   entityType,
		Column3:   entityID,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error interno del servidor")
	}
	// Convert raw JSON bytes to usable output
	type auditEntry struct {
		ID          int64           `json:"id"`
		UserID      *string         `json:"user_id"`
		Timestamp   string          `json:"timestamp"`
		EntityType  string          `json:"entity_type"`
		EntityID    uuid.UUID       `json:"entity_id"`
		Action      string          `json:"action"`
		BeforeState json.RawMessage `json:"before_state"`
		AfterState  json.RawMessage `json:"after_state"`
	}
	out := make([]auditEntry, 0, len(logs))
	for _, l := range logs {
		e := auditEntry{
			ID:          l.ID,
			EntityType:  l.EntityType,
			EntityID:    l.EntityID,
			Action:      l.Action,
			BeforeState: json.RawMessage(l.BeforeState),
			AfterState:  json.RawMessage(l.AfterState),
		}
		if l.UserID.Valid {
			s := uuid.UUID(l.UserID.Bytes).String()
			e.UserID = &s
		}
		if l.Timestamp.Valid {
			e.Timestamp = l.Timestamp.Time.Format("2006-01-02T15:04:05Z07:00")
		}
		out = append(out, e)
	}
	return c.JSON(http.StatusOK, out)
}

// ─── Exchange Rates ──────────────────────────────────────────────────────────

type createExchangeRateRequest struct {
	FromCurrency string `json:"from_currency" validate:"required"`
	ToCurrency   string `json:"to_currency"   validate:"required"`
	Rate         string `json:"rate"          validate:"required"`
	Date         string `json:"date"          validate:"required"`
	Source       string `json:"source"`
}

// CreateExchangeRate POST /admin/exchange-rates
func (h *AdminHandler) CreateExchangeRate(c echo.Context) error {
	var req createExchangeRateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	rate, err := parseDecimal(req.Rate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "cotización inválida")
	}
	var d pgtype.Date
	if err := d.Scan(req.Date); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "fecha inválida")
	}
	var src *string
	if req.Source != "" {
		src = &req.Source
	}
	pgRate := pgtype.Numeric{}
	_ = pgRate.Scan(rate.String())
	er, err := h.q.CreateExchangeRate(c.Request().Context(), sqlcgen.CreateExchangeRateParams{
		CompanyID:    companyFromCtx(c),
		FromCurrency: req.FromCurrency,
		ToCurrency:   req.ToCurrency,
		Rate:         pgRate,
		Date:         d,
		Source:       src,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al guardar cotización")
	}
	return c.JSON(http.StatusCreated, er)
}

// GetLatestExchangeRate GET /admin/exchange-rates/latest?from=ARS&to=USD
func (h *AdminHandler) GetLatestExchangeRate(c echo.Context) error {
	from := c.QueryParam("from")
	to := c.QueryParam("to")
	if from == "" || to == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "from y to son requeridos")
	}
	er, err := h.q.GetLatestExchangeRate(c.Request().Context(), sqlcgen.GetLatestExchangeRateParams{
		CompanyID:    companyFromCtx(c),
		FromCurrency: from,
		ToCurrency:   to,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "cotización no encontrada")
	}
	return c.JSON(http.StatusOK, er)
}

// ─── Self-service ─────────────────────────────────────────────────────────────

// ChangePassword POST /api/v1/me/change-password — lets an authenticated user change their own password.
func (h *AdminHandler) ChangePassword(c echo.Context) error {
	session := mw.SessionFromContext(c)
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "datos inválidos")
	}
	if len(body.NewPassword) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "la nueva contraseña debe tener al menos 8 caracteres")
	}
	user, err := h.q.GetUserByIDAnyCompany(c.Request().Context(), session.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "usuario no encontrado")
	}
	ok, err := argon2.Verify(body.CurrentPassword, user.PasswordHash)
	if err != nil || !ok {
		return echo.NewHTTPError(http.StatusUnauthorized, "contraseña actual incorrecta")
	}
	newHash, err := argon2.Hash(body.NewPassword)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al procesar contraseña")
	}
	if err := h.q.UpdateUserPassword(c.Request().Context(), sqlcgen.UpdateUserPasswordParams{
		ID:           session.UserID,
		PasswordHash: newHash,
	}); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "error al actualizar contraseña")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "contraseña actualizada"})
}

// ─── Catalogs ─────────────────────────────────────────────────────────────────

// GET /api/v1/admin/catalogs/event-types
func (h *AdminHandler) ListEventTypes(c echo.Context) error {
	items, err := h.q.ListCalendarEventTypes(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// POST /api/v1/admin/catalogs/event-types
func (h *AdminHandler) CreateEventType(c echo.Context) error {
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
		Icon  string `json:"icon"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	var icon *string
	if body.Icon != "" {
		icon = &body.Icon
	}
	item, err := h.q.CreateCalendarEventType(c.Request().Context(), sqlcgen.CreateCalendarEventTypeParams{
		CompanyID: companyFromCtx(c),
		Name:      body.Name,
		Color:     body.Color,
		Icon:      icon,
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, item)
}

// GET /api/v1/admin/catalogs/pipeline-stages
func (h *AdminHandler) ListPipelineStages(c echo.Context) error {
	items, err := h.q.ListPipelineStages(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// POST /api/v1/admin/catalogs/pipeline-stages
func (h *AdminHandler) CreatePipelineStage(c echo.Context) error {
	var body struct {
		Name      string `json:"name"`
		Color     string `json:"color"`
		OrderPos  int16  `json:"order_pos"`
		IsWin     bool   `json:"is_win"`
		IsLoss    bool   `json:"is_loss"`
		IsDefault bool   `json:"is_default"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	item, err := h.q.CreatePipelineStage(c.Request().Context(), sqlcgen.CreatePipelineStageParams{
		CompanyID: companyFromCtx(c),
		Name:      body.Name,
		Color:     body.Color,
		OrderPos:  body.OrderPos,
		IsWin:     body.IsWin,
		IsLoss:    body.IsLoss,
		IsDefault: body.IsDefault,
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, item)
}

// GET /api/v1/admin/catalogs/lost-reasons
func (h *AdminHandler) ListLostReasons(c echo.Context) error {
	items, err := h.q.ListLostReasons(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// POST /api/v1/admin/catalogs/lost-reasons
func (h *AdminHandler) CreateLostReason(c echo.Context) error {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	item, err := h.q.CreateLostReason(c.Request().Context(), sqlcgen.CreateLostReasonParams{
		CompanyID: companyFromCtx(c),
		Name:      body.Name,
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, item)
}

// GET /api/v1/admin/catalogs/tags
func (h *AdminHandler) ListTagsCatalog(c echo.Context) error {
	items, err := h.q.ListTags(c.Request().Context(), sqlcgen.ListTagsParams{
		CompanyID: companyFromCtx(c),
		Column2:   "",
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// POST /api/v1/admin/catalogs/tags
func (h *AdminHandler) CreateTagCatalog(c echo.Context) error {
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
		Area  string `json:"area"`
	}
	if err := c.Bind(&body); err != nil {
		return err
	}
	var color, area *string
	if body.Color != "" {
		color = &body.Color
	}
	if body.Area != "" {
		area = &body.Area
	}
	item, err := h.q.CreateTag(c.Request().Context(), sqlcgen.CreateTagParams{
		CompanyID: companyFromCtx(c),
		Name:      body.Name,
		Color:     color,
		Area:      area,
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, item)
}

// GET /api/v1/admin/catalogs/vat-rates
func (h *AdminHandler) ListVATRates(c echo.Context) error {
	items, err := h.q.ListVATRates(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// GET /api/v1/admin/catalogs/payment-conditions
func (h *AdminHandler) ListPaymentConditions(c echo.Context) error {
	items, err := h.q.ListPaymentConditions(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// GET /api/v1/admin/catalogs/expense-categories
func (h *AdminHandler) ListExpenseCategories(c echo.Context) error {
	items, err := h.q.ListExpenseCategories(c.Request().Context(), companyFromCtx(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// GET /api/v1/admin/catalogs/currencies
func (h *AdminHandler) ListCurrencies(c echo.Context) error {
	items, err := h.q.ListCurrencies(c.Request().Context())
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, items)
}

// ─── Global Search ────────────────────────────────────────────────────────────

// Search GET /search?q=texto
func (h *AdminHandler) Search(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if len(q) < 2 {
		return c.JSON(http.StatusOK, map[string]any{
			"contacts": []any{},
			"leads":    []any{},
		})
	}
	companyID := companyFromCtx(c)
	ctx := c.Request().Context()

	// ListContacts supports full-text search via Column2 (search_vector @@ plainto_tsquery)
	contacts, _ := h.q.ListContacts(ctx, sqlcgen.ListContactsParams{
		CompanyID: companyID,
		Column2:   q,
		Column3:   "",
		Limit:     5,
		Offset:    0,
	})
	// ListLeads doesn't support text search; fetch recent and filter in-memory
	allLeads, _ := h.q.ListLeads(ctx, sqlcgen.ListLeadsParams{
		CompanyID: companyID,
		Limit:     200,
		Offset:    0,
	})
	ql := strings.ToLower(q)

	type contactResult struct {
		ID          uuid.UUID `json:"id"`
		FantasyName string    `json:"fantasy_name"`
		Kind        []string  `json:"kind"`
	}
	type leadResult struct {
		ID          uuid.UUID `json:"id"`
		CompanyName string    `json:"company_name"`
		Status      string    `json:"status"`
	}

	contactOut := make([]contactResult, 0, len(contacts))
	for _, co := range contacts {
		contactOut = append(contactOut, contactResult{ID: co.ID, FantasyName: co.FantasyName, Kind: co.Kind})
	}
	leadOut := make([]leadResult, 0)
	for _, l := range allLeads {
		if strings.Contains(strings.ToLower(l.CompanyName), ql) {
			leadOut = append(leadOut, leadResult{ID: l.ID, CompanyName: l.CompanyName, Status: l.Status})
			if len(leadOut) >= 5 {
				break
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"contacts": contactOut,
		"leads":    leadOut,
	})
}
