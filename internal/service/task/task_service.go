// Package task implements the application-layer service for tasks, tickets,
// comments, status history, and task timers.
package task

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	domain "pixs/internal/domain/task"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// TaskService manages tasks, comments, and their status workflow.
type TaskService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewTaskService constructs a TaskService.
func NewTaskService(db *pgxpool.Pool, logger *slog.Logger) *TaskService {
	return &TaskService{q: sqlcgen.New(db), db: db, logger: logger}
}

// TaskInput holds data for creating a task.
type TaskInput struct {
	Type        string
	Title       string
	Description *string
	ContactID   *uuid.UUID
	ProjectID   *uuid.UUID
	AssigneeID  *uuid.UUID
	ReporterID  uuid.UUID
	Origin      *string
	Status      string
	Priority    string
	DueDate     *time.Time
	ParentID    *uuid.UUID
}

// CreateTask creates a new task.
func (s *TaskService) CreateTask(ctx context.Context, companyID uuid.UUID, in TaskInput) (*domain.Task, error) {
	taskType := in.Type
	if taskType == "" {
		taskType = string(domain.TypeInternal)
	}
	status := in.Status
	if status == "" {
		status = string(domain.StatusOpen)
	}
	if _, err := domain.ParseTaskStatus(status); err != nil {
		return nil, errors.WithStack(err)
	}
	priority := in.Priority
	if priority == "" {
		priority = string(domain.PriorityMedium)
	}
	row, err := s.q.CreateTask(ctx, sqlcgen.CreateTaskParams{
		CompanyID:   companyID,
		Type:        taskType,
		Title:       in.Title,
		Description: in.Description,
		ContactID:   pgconv.PtrUUID(in.ContactID),
		ProjectID:   pgconv.PtrUUID(in.ProjectID),
		AssigneeID:  pgconv.PtrUUID(in.AssigneeID),
		ReporterID:  in.ReporterID,
		Origin:      in.Origin,
		Status:      status,
		Priority:    priority,
		DueDate:     pgconv.PtrDate(in.DueDate),
		ParentID:    pgconv.PtrUUID(in.ParentID),
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating task")
	}
	t := taskFromRow(row)
	s.writeAudit(ctx, companyID, nil, t, &in.ReporterID, t.ID, "create")
	return t, nil
}

// GetTask returns a task by ID, respecting own-restriction.
func (s *TaskService) GetTask(ctx context.Context, companyID, id, callerUserID uuid.UUID, restrictToOwn bool) (*domain.Task, error) {
	row, err := s.q.GetTaskByID(ctx, sqlcgen.GetTaskByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrTaskNotFound)
	}
	t := taskFromRow(row)
	if restrictToOwn && !ownsTask(t, callerUserID) {
		return nil, errors.WithStack(domain.ErrForbidden)
	}
	return t, nil
}

// TaskFilter holds filter parameters for listing tasks.
type TaskFilter struct {
	AssigneeID *uuid.UUID
	Status     string
	ProjectID  *uuid.UUID
	ContactID  *uuid.UUID
	DueBefore  *time.Time
}

// ListTasks returns tasks with optional filters. When restrictToOwn is set,
// the assignee filter is forced to the caller.
func (s *TaskService) ListTasks(ctx context.Context, companyID, callerUserID uuid.UUID, restrictToOwn bool, f TaskFilter) ([]*domain.Task, error) {
	params := sqlcgen.ListTasksParams{
		CompanyID: companyID,
		Column2:   f.Status,
		ProjectID: pgconv.PtrUUID(f.ProjectID),
		ContactID: pgconv.PtrUUID(f.ContactID),
		DueDate:   pgconv.PtrDate(f.DueBefore),
	}
	if restrictToOwn {
		params.AssigneeID = pgtype.UUID{Bytes: callerUserID, Valid: true}
	} else {
		params.AssigneeID = pgconv.PtrUUID(f.AssigneeID)
	}
	rows, err := s.q.ListTasks(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "listing tasks")
	}
	out := make([]*domain.Task, 0, len(rows))
	for _, r := range rows {
		out = append(out, taskFromRow(r))
	}
	return out, nil
}

// UpdateTaskInput holds editable task fields (status & assignee handled separately).
type UpdateTaskInput struct {
	Type        string
	Title       string
	Description *string
	ContactID   *uuid.UUID
	ProjectID   *uuid.UUID
	Priority    string
	DueDate     *time.Time
}

// UpdateTask updates editable task fields.
func (s *TaskService) UpdateTask(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID, in UpdateTaskInput) (*domain.Task, error) {
	existing, err := s.q.GetTaskByID(ctx, sqlcgen.GetTaskByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrTaskNotFound)
	}
	if existing.Status == string(domain.StatusClosed) {
		return nil, errors.WithStack(domain.ErrTaskClosed)
	}
	row, err := s.q.UpdateTask(ctx, sqlcgen.UpdateTaskParams{
		ID:          id,
		CompanyID:   companyID,
		Type:        in.Type,
		Title:       in.Title,
		Description: in.Description,
		ContactID:   pgconv.PtrUUID(in.ContactID),
		ProjectID:   pgconv.PtrUUID(in.ProjectID),
		Priority:    in.Priority,
		DueDate:     pgconv.PtrDate(in.DueDate),
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating task")
	}
	before := taskFromRow(existing)
	after := taskFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// ChangeStatus transitions a task's status, validating the transition and recording history.
func (s *TaskService) ChangeStatus(ctx context.Context, companyID, id uuid.UUID, newStatus string, userID uuid.UUID) (*domain.Task, error) {
	parsed, err := domain.ParseTaskStatus(newStatus)
	if err != nil {
		return nil, errors.WithStack(err)
	}
	existing, err := s.q.GetTaskByID(ctx, sqlcgen.GetTaskByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrTaskNotFound)
	}
	from := domain.TaskStatus(existing.Status)
	if from != parsed && !domain.CanTransition(from, parsed) {
		return nil, errors.WithStack(domain.ErrInvalidStatusTransition)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	row, err := qtx.UpdateTaskStatus(ctx, sqlcgen.UpdateTaskStatusParams{
		ID:         id,
		CompanyID:  companyID,
		NewStatus:  string(parsed),
		AssigneeID: existing.AssigneeID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating task status")
	}
	fromStr := existing.Status
	toStr := string(parsed)
	if _, err := qtx.RecordTaskHistory(ctx, sqlcgen.RecordTaskHistoryParams{
		TaskID:       id,
		UserID:       userID,
		FromStatus:   &fromStr,
		ToStatus:     &toStr,
		FromAssignee: existing.AssigneeID,
		ToAssignee:   existing.AssigneeID,
	}); err != nil {
		return nil, errors.Wrap(err, "recording task history")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}

	before := taskFromRow(existing)
	after := taskFromRow(row)
	s.writeAudit(ctx, companyID, before, after, &userID, id, "update")
	return after, nil
}

// Reassign changes a task's assignee and records the change in history.
func (s *TaskService) Reassign(ctx context.Context, companyID, id uuid.UUID, newAssignee *uuid.UUID, userID uuid.UUID) (*domain.Task, error) {
	existing, err := s.q.GetTaskByID(ctx, sqlcgen.GetTaskByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrTaskNotFound)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "begin tx")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.q.WithTx(tx)

	row, err := qtx.UpdateTaskStatus(ctx, sqlcgen.UpdateTaskStatusParams{
		ID:         id,
		CompanyID:  companyID,
		NewStatus:  existing.Status,
		AssigneeID: pgconv.PtrUUID(newAssignee),
	})
	if err != nil {
		return nil, errors.Wrap(err, "reassigning task")
	}
	if _, err := qtx.RecordTaskHistory(ctx, sqlcgen.RecordTaskHistoryParams{
		TaskID:       id,
		UserID:       userID,
		FromStatus:   &existing.Status,
		ToStatus:     &existing.Status,
		FromAssignee: existing.AssigneeID,
		ToAssignee:   pgconv.PtrUUID(newAssignee),
	}); err != nil {
		return nil, errors.Wrap(err, "recording task history")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, errors.Wrap(err, "commit tx")
	}

	before := taskFromRow(existing)
	after := taskFromRow(row)
	s.writeAudit(ctx, companyID, before, after, &userID, id, "update")
	return after, nil
}

// DeleteTask soft-deletes a task.
func (s *TaskService) DeleteTask(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID) error {
	existing, err := s.q.GetTaskByID(ctx, sqlcgen.GetTaskByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrTaskNotFound)
	}
	if err := s.q.SoftDeleteTask(ctx, sqlcgen.SoftDeleteTaskParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting task")
	}
	s.writeAudit(ctx, companyID, taskFromRow(existing), nil, userID, id, "delete")
	return nil
}

// ─── Comments ──────────────────────────────────────────────────────────────────

// AddComment appends an immutable comment to a task.
func (s *TaskService) AddComment(ctx context.Context, taskID, userID uuid.UUID, body string) (*domain.TaskComment, error) {
	if strings.TrimSpace(body) == "" {
		return nil, errors.WithStack(domain.ErrCommentBodyRequired)
	}
	row, err := s.q.CreateTaskComment(ctx, sqlcgen.CreateTaskCommentParams{TaskID: taskID, UserID: userID, Body: body})
	if err != nil {
		return nil, errors.Wrap(err, "creating task comment")
	}
	return &domain.TaskComment{ID: row.ID, TaskID: row.TaskID, UserID: row.UserID, Body: row.Body, CreatedAt: row.CreatedAt.Time}, nil
}

// ListComments returns all comments for a task.
func (s *TaskService) ListComments(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskComment, error) {
	rows, err := s.q.ListTaskComments(ctx, taskID)
	if err != nil {
		return nil, errors.Wrap(err, "listing task comments")
	}
	out := make([]*domain.TaskComment, 0, len(rows))
	for _, r := range rows {
		out = append(out, &domain.TaskComment{ID: r.ID, TaskID: r.TaskID, UserID: r.UserID, Body: r.Body, CreatedAt: r.CreatedAt.Time})
	}
	return out, nil
}

// GetHistory returns the status/assignment history for a task.
func (s *TaskService) GetHistory(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskStatusHistoryEntry, error) {
	rows, err := s.q.GetTaskHistory(ctx, taskID)
	if err != nil {
		return nil, errors.Wrap(err, "listing task history")
	}
	out := make([]*domain.TaskStatusHistoryEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, &domain.TaskStatusHistoryEntry{
			ID:           r.ID,
			TaskID:       r.TaskID,
			UserID:       r.UserID,
			FromStatus:   r.FromStatus,
			ToStatus:     r.ToStatus,
			FromAssignee: pgconv.UUIDPtr(r.FromAssignee),
			ToAssignee:   pgconv.UUIDPtr(r.ToAssignee),
			CreatedAt:    r.CreatedAt.Time,
		})
	}
	return out, nil
}

func ownsTask(t *domain.Task, userID uuid.UUID) bool {
	if t.AssigneeID != nil && *t.AssigneeID == userID {
		return true
	}
	return t.ReporterID == userID
}

func (s *TaskService) writeAudit(ctx context.Context, companyID uuid.UUID, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
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
		EntityType:  "task",
		EntityID:    entityID,
		Action:      action,
		BeforeState: beforeJSON,
		AfterState:  afterJSON,
	})
}

func taskFromRow(r sqlcgen.Task) *domain.Task {
	return &domain.Task{
		ID:             r.ID,
		CompanyID:      r.CompanyID,
		Type:           domain.TaskType(r.Type),
		Title:          r.Title,
		Description:    r.Description,
		ContactID:      pgconv.UUIDPtr(r.ContactID),
		ProjectID:      pgconv.UUIDPtr(r.ProjectID),
		AssigneeID:     pgconv.UUIDPtr(r.AssigneeID),
		ReporterID:     r.ReporterID,
		Origin:         r.Origin,
		Status:         domain.TaskStatus(r.Status),
		Priority:       domain.TaskPriority(r.Priority),
		DueDate:        pgconv.TimePtr(r.DueDate),
		ParentID:       pgconv.UUIDPtr(r.ParentID),
		IsRecurring:    r.IsRecurring,
		RecurrenceRule: r.RecurrenceRule,
		ResolvedAt:     pgconv.TimestamptzPtr(r.ResolvedAt),
		ClosedAt:       pgconv.TimestamptzPtr(r.ClosedAt),
		CreatedAt:      r.CreatedAt.Time,
		UpdatedAt:      r.UpdatedAt.Time,
		DeletedAt:      pgconv.TimestamptzPtr(r.DeletedAt),
	}
}
