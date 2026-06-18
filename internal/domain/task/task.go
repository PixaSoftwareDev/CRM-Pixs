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
	ID             uuid.UUID
	CompanyID      uuid.UUID
	Type           TaskType
	Title          string
	Description    *string
	ContactID      *uuid.UUID
	ProjectID      *uuid.UUID
	AssigneeID     *uuid.UUID
	ReporterID     uuid.UUID
	Origin         *string
	Status         TaskStatus
	Priority       TaskPriority
	DueDate        *time.Time
	ParentID       *uuid.UUID
	IsRecurring    bool
	RecurrenceRule *string
	ResolvedAt     *time.Time
	ClosedAt       *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	DeletedAt      *time.Time
}

// TaskComment is an immutable comment on a task.
type TaskComment struct {
	ID        uuid.UUID
	TaskID    uuid.UUID
	UserID    uuid.UUID
	Body      string
	CreatedAt time.Time
}

// TaskStatusHistoryEntry records a status or assignee change.
type TaskStatusHistoryEntry struct {
	ID           uuid.UUID
	TaskID       uuid.UUID
	UserID       uuid.UUID
	FromStatus   *string
	ToStatus     *string
	FromAssignee *uuid.UUID
	ToAssignee   *uuid.UUID
	CreatedAt    time.Time
}

// TaskTimeEntry is a start/stop timer entry attached to a task.
type TaskTimeEntry struct {
	ID              uuid.UUID
	TaskID          uuid.UUID
	UserID          uuid.UUID
	StartedAt       time.Time
	EndedAt         *time.Time
	DurationMinutes *int32
	Note            *string
	CreatedAt       time.Time
}
