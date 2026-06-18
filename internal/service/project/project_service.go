// Package project implements the application-layer service for projects,
// milestones, and project members.
package project

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/project"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// ProjectService manages projects, milestones, and members.
type ProjectService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewProjectService constructs a ProjectService.
func NewProjectService(db *pgxpool.Pool, logger *slog.Logger) *ProjectService {
	return &ProjectService{q: sqlcgen.New(db), db: db, logger: logger}
}

// ProjectInput holds data for creating/updating a project.
type ProjectInput struct {
	ClientID         uuid.UUID
	Name             string
	Description      *string
	StartDate        *time.Time
	EstimatedEndDate *time.Time
	ActualEndDate    *time.Time
	Status           string
	ResponsibleID    *uuid.UUID
	BudgetHours      *decimal.Decimal
	BudgetAmount     *decimal.Decimal
	Currency         string
	OpportunityID    *uuid.UUID
	QuoteID          *uuid.UUID
}

// CreateProject creates a new project.
func (s *ProjectService) CreateProject(ctx context.Context, companyID uuid.UUID, userID *uuid.UUID, in ProjectInput) (*domain.Project, error) {
	status := in.Status
	if status == "" {
		status = string(domain.StatusPlanning)
	}
	if _, err := domain.ParseProjectStatus(status); err != nil {
		return nil, errors.WithStack(err)
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}
	row, err := s.q.CreateProject(ctx, sqlcgen.CreateProjectParams{
		CompanyID:        companyID,
		ClientID:         in.ClientID,
		Name:             in.Name,
		Description:      in.Description,
		StartDate:        pgconv.PtrDate(in.StartDate),
		EstimatedEndDate: pgconv.PtrDate(in.EstimatedEndDate),
		Status:           status,
		ResponsibleID:    pgconv.PtrUUID(in.ResponsibleID),
		BudgetHours:      pgconv.DecimalToNumeric(in.BudgetHours),
		BudgetAmount:     pgconv.DecimalToNumeric(in.BudgetAmount),
		Currency:         currency,
		OpportunityID:    pgconv.PtrUUID(in.OpportunityID),
		QuoteID:          pgconv.PtrUUID(in.QuoteID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating project")
	}
	p := projectFromRow(row)
	s.writeAudit(ctx, companyID, nil, p, userID, p.ID, "create")
	return p, nil
}

// GetProject returns a project by ID.
func (s *ProjectService) GetProject(ctx context.Context, companyID, id uuid.UUID) (*domain.Project, error) {
	row, err := s.q.GetProjectByID(ctx, sqlcgen.GetProjectByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrProjectNotFound)
	}
	return projectFromRow(row), nil
}

// ProjectFilter holds filter parameters for listing projects.
type ProjectFilter struct {
	ClientID      *uuid.UUID
	ResponsibleID *uuid.UUID
	Status        string
}

// ListProjects returns projects with optional filters.
func (s *ProjectService) ListProjects(ctx context.Context, companyID uuid.UUID, f ProjectFilter) ([]*domain.Project, error) {
	rows, err := s.q.ListProjects(ctx, sqlcgen.ListProjectsParams{
		CompanyID:     companyID,
		Column2:       f.Status,
		ClientID:      pgconv.PtrUUID(f.ClientID),
		ResponsibleID: pgconv.PtrUUID(f.ResponsibleID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing projects")
	}
	out := make([]*domain.Project, 0, len(rows))
	for _, r := range rows {
		out = append(out, projectFromRow(r))
	}
	return out, nil
}

// UpdateProject updates a project.
func (s *ProjectService) UpdateProject(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID, in ProjectInput) (*domain.Project, error) {
	existing, err := s.q.GetProjectByID(ctx, sqlcgen.GetProjectByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrProjectNotFound)
	}
	if _, err := domain.ParseProjectStatus(in.Status); err != nil {
		return nil, errors.WithStack(err)
	}
	currency := in.Currency
	if currency == "" {
		currency = "ARS"
	}
	row, err := s.q.UpdateProject(ctx, sqlcgen.UpdateProjectParams{
		ID:               id,
		CompanyID:        companyID,
		ClientID:         in.ClientID,
		Name:             in.Name,
		Description:      in.Description,
		StartDate:        pgconv.PtrDate(in.StartDate),
		EstimatedEndDate: pgconv.PtrDate(in.EstimatedEndDate),
		ActualEndDate:    pgconv.PtrDate(in.ActualEndDate),
		Status:           in.Status,
		ResponsibleID:    pgconv.PtrUUID(in.ResponsibleID),
		BudgetHours:      pgconv.DecimalToNumeric(in.BudgetHours),
		BudgetAmount:     pgconv.DecimalToNumeric(in.BudgetAmount),
		Currency:         currency,
		OpportunityID:    pgconv.PtrUUID(in.OpportunityID),
		QuoteID:          pgconv.PtrUUID(in.QuoteID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating project")
	}
	before := projectFromRow(existing)
	after := projectFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// DeleteProject soft-deletes a project.
func (s *ProjectService) DeleteProject(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID) error {
	existing, err := s.q.GetProjectByID(ctx, sqlcgen.GetProjectByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrProjectNotFound)
	}
	if err := s.q.SoftDeleteProject(ctx, sqlcgen.SoftDeleteProjectParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting project")
	}
	s.writeAudit(ctx, companyID, projectFromRow(existing), nil, userID, id, "delete")
	return nil
}

// ─── Milestones ────────────────────────────────────────────────────────────────

// MilestoneInput holds data for creating/updating a milestone.
type MilestoneInput struct {
	Name          string
	Description   *string
	Deliverables  *string
	CommittedDate *time.Time
	Status        string
	OrderPos      *int16
}

// CreateMilestone adds a milestone to a project.
func (s *ProjectService) CreateMilestone(ctx context.Context, projectID uuid.UUID, in MilestoneInput) (*domain.Milestone, error) {
	status := in.Status
	if status == "" {
		status = string(domain.MilestonePending)
	}
	row, err := s.q.CreateMilestone(ctx, sqlcgen.CreateMilestoneParams{
		ProjectID:     projectID,
		Name:          in.Name,
		Description:   in.Description,
		Deliverables:  in.Deliverables,
		CommittedDate: pgconv.PtrDate(in.CommittedDate),
		Status:        status,
		OrderPos:      in.OrderPos,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating milestone")
	}
	return milestoneFromRow(row), nil
}

// ListMilestones returns all milestones for a project.
func (s *ProjectService) ListMilestones(ctx context.Context, projectID uuid.UUID) ([]*domain.Milestone, error) {
	rows, err := s.q.ListMilestones(ctx, projectID)
	if err != nil {
		return nil, errors.Wrap(err, "listing milestones")
	}
	out := make([]*domain.Milestone, 0, len(rows))
	for _, r := range rows {
		out = append(out, milestoneFromRow(r))
	}
	return out, nil
}

// UpdateMilestone updates a milestone.
func (s *ProjectService) UpdateMilestone(ctx context.Context, milestoneID, projectID uuid.UUID, in MilestoneInput) (*domain.Milestone, error) {
	row, err := s.q.UpdateMilestone(ctx, sqlcgen.UpdateMilestoneParams{
		ID:            milestoneID,
		ProjectID:     projectID,
		Name:          in.Name,
		Description:   in.Description,
		Deliverables:  in.Deliverables,
		CommittedDate: pgconv.PtrDate(in.CommittedDate),
		Status:        in.Status,
		OrderPos:      in.OrderPos,
	})
	if err != nil {
		return nil, errors.WithStack(domain.ErrMilestoneNotFound)
	}
	return milestoneFromRow(row), nil
}

// DeleteMilestone soft-deletes a milestone.
func (s *ProjectService) DeleteMilestone(ctx context.Context, milestoneID, projectID uuid.UUID) error {
	return errors.Wrap(s.q.SoftDeleteMilestone(ctx, sqlcgen.SoftDeleteMilestoneParams{ID: milestoneID, ProjectID: projectID}), "deleting milestone")
}

// ─── Members ───────────────────────────────────────────────────────────────────

// AddMember adds (or updates) a user's membership of a project.
func (s *ProjectService) AddMember(ctx context.Context, projectID, userID uuid.UUID, role *string) error {
	return errors.Wrap(s.q.AddProjectMember(ctx, sqlcgen.AddProjectMemberParams{
		ProjectID:     projectID,
		UserID:        userID,
		RoleInProject: role,
	}), "adding project member")
}

// RemoveMember removes a user from a project.
func (s *ProjectService) RemoveMember(ctx context.Context, projectID, userID uuid.UUID) error {
	return errors.Wrap(s.q.RemoveProjectMember(ctx, sqlcgen.RemoveProjectMemberParams{
		ProjectID: projectID,
		UserID:    userID,
	}), "removing project member")
}

// ListMembers returns all members of a project.
func (s *ProjectService) ListMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	rows, err := s.q.ListProjectMembers(ctx, projectID)
	if err != nil {
		return nil, errors.Wrap(err, "listing project members")
	}
	out := make([]*domain.ProjectMember, 0, len(rows))
	for _, r := range rows {
		out = append(out, &domain.ProjectMember{
			ProjectID:     r.ProjectID,
			UserID:        r.UserID,
			RoleInProject: r.RoleInProject,
			FullName:      r.FullName,
			Email:         r.Email,
		})
	}
	return out, nil
}

func (s *ProjectService) writeAudit(ctx context.Context, companyID uuid.UUID, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	var beforeJSON, afterJSON []byte
	if before != nil {
		beforeJSON, _ = json.Marshal(before)
	}
	if after != nil {
		afterJSON, _ = json.Marshal(after)
	}
	uid := pgtype.UUID{}
	if userID != nil {
		uid = pgtype.UUID{Bytes: *userID, Valid: true}
	}
	_ = s.q.InsertAuditLog(ctx, sqlcgen.InsertAuditLogParams{
		CompanyID:   companyID,
		UserID:      uid,
		EntityType:  "project",
		EntityID:    entityID,
		Action:      action,
		BeforeState: beforeJSON,
		AfterState:  afterJSON,
	})
}

func projectFromRow(r sqlcgen.Project) *domain.Project {
	return &domain.Project{
		ID:               r.ID,
		CompanyID:        r.CompanyID,
		ClientID:         r.ClientID,
		Name:             r.Name,
		Description:      r.Description,
		StartDate:        pgconv.TimePtr(r.StartDate),
		EstimatedEndDate: pgconv.TimePtr(r.EstimatedEndDate),
		ActualEndDate:    pgconv.TimePtr(r.ActualEndDate),
		Status:           domain.ProjectStatus(r.Status),
		ResponsibleID:    pgconv.UUIDPtr(r.ResponsibleID),
		BudgetHours:      pgconv.NumericToDecimal(r.BudgetHours),
		BudgetAmount:     pgconv.NumericToDecimal(r.BudgetAmount),
		Currency:         r.Currency,
		OpportunityID:    pgconv.UUIDPtr(r.OpportunityID),
		QuoteID:          pgconv.UUIDPtr(r.QuoteID),
		CreatedAt:        r.CreatedAt.Time,
		UpdatedAt:        r.UpdatedAt.Time,
		DeletedAt:        pgconv.TimestamptzPtr(r.DeletedAt),
	}
}

func milestoneFromRow(r sqlcgen.ProjectMilestone) *domain.Milestone {
	return &domain.Milestone{
		ID:            r.ID,
		ProjectID:     r.ProjectID,
		Name:          r.Name,
		Description:   r.Description,
		Deliverables:  r.Deliverables,
		CommittedDate: pgconv.TimePtr(r.CommittedDate),
		Status:        domain.MilestoneStatus(r.Status),
		OrderPos:      r.OrderPos,
		CreatedAt:     r.CreatedAt.Time,
		UpdatedAt:     r.UpdatedAt.Time,
		DeletedAt:     pgconv.TimestamptzPtr(r.DeletedAt),
	}
}
