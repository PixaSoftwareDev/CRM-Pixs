package task

import (
	"time"

	"github.com/google/uuid"
)

// TaskStatus is the workflow status of a task.
type TaskStatus string

// Task statuses.
const (
	StatusOpen            TaskStatus = "open"
	StatusInProgress      TaskStatus = "in_progress"
	StatusWaitingClient   TaskStatus = "waiting_client"
	StatusWaitingInternal TaskStatus = "waiting_internal"
	StatusResolved        TaskStatus = "resolved"
	StatusClosed          TaskStatus = "closed"
	StatusCancelled       TaskStatus = "cancelled"
)

// ParseTaskStatus validates and parses a task status string.
func ParseTaskStatus(s string) (TaskStatus, error) {
	switch TaskStatus(s) {
	case StatusOpen, StatusInProgress, StatusWaitingClient, StatusWaitingInternal,
		StatusResolved, StatusClosed, StatusCancelled:
		return TaskStatus(s), nil
	}
	return "", ErrInvalidStatus
}

// TaskPriority is the priority level of a task.
type TaskPriority string

// Task priorities.
const (
	PriorityLow    TaskPriority = "low"
	PriorityMedium TaskPriority = "medium"
	PriorityHigh   TaskPriority = "high"
	PriorityUrgent TaskPriority = "urgent"
)

// TaskType discriminates internal tasks, client tickets, and subtasks.
type TaskType string

// Task types.
const (
	TypeInternal     TaskType = "internal"
	TypeClientTicket TaskType = "client_ticket"
	TypeSubtask      TaskType = "subtask"
)

// Task is a unit of work or a client ticket.
type Task struct {
	ID             uuid.UUID    `json:"id"`
	CompanyID      uuid.UUID    `json:"company_id"`
	Type           TaskType     `json:"type"`
	Title          string       `json:"title"`
	Description    *string      `json:"description"`
	ContactID      *uuid.UUID   `json:"contact_id"`
	ProjectID      *uuid.UUID   `json:"project_id"`
	AssigneeID     *uuid.UUID   `json:"assignee_id"`
	ReporterID     uuid.UUID    `json:"reporter_id"`
	Origin         *string      `json:"origin"`
	Status         TaskStatus   `json:"status"`
	Priority       TaskPriority `json:"priority"`
	DueDate        *time.Time   `json:"due_date"`
	ParentID       *uuid.UUID   `json:"parent_id"`
	IsRecurring    bool         `json:"is_recurring"`
	RecurrenceRule *string      `json:"recurrence_rule"`
	ResolvedAt     *time.Time   `json:"resolved_at"`
	ClosedAt       *time.Time   `json:"closed_at"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	DeletedAt      *time.Time   `json:"deleted_at,omitempty"`
}

// TaskComment is an immutable comment on a task.
type TaskComment struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"task_id"`
	UserID    uuid.UUID `json:"user_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// TaskStatusHistoryEntry records a status or assignee change.
type TaskStatusHistoryEntry struct {
	ID           uuid.UUID  `json:"id"`
	TaskID       uuid.UUID  `json:"task_id"`
	UserID       uuid.UUID  `json:"user_id"`
	FromStatus   *string    `json:"from_status"`
	ToStatus     *string    `json:"to_status"`
	FromAssignee *uuid.UUID `json:"from_assignee"`
	ToAssignee   *uuid.UUID `json:"to_assignee"`
	CreatedAt    time.Time  `json:"created_at"`
}

// TaskTimeEntry is a start/stop timer entry attached to a task.
type TaskTimeEntry struct {
	ID              uuid.UUID  `json:"id"`
	TaskID          uuid.UUID  `json:"task_id"`
	UserID          uuid.UUID  `json:"user_id"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at"`
	DurationMinutes *int32     `json:"duration_minutes"`
	Note            *string    `json:"note"`
	CreatedAt       time.Time  `json:"created_at"`
}
