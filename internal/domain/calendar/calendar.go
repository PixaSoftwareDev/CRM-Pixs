// Package calendar defines the core domain types for the CRM calendar bounded context.
// It has no infrastructure imports.
package calendar

import (
	"time"

	"github.com/google/uuid"
)

// CalendarEventType is an extensible catalog of event categories (e.g. "cobranza").
type CalendarEventType struct {
	ID        uuid.UUID `json:"id"`
	CompanyID uuid.UUID `json:"company_id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Icon      *string   `json:"icon"`
	CreatedAt time.Time `json:"created_at"`
}

// CalendarEvent is a scheduled activity that may be linked to a contact,
// a pipeline opportunity, a project, or a task.
type CalendarEvent struct {
	ID                   uuid.UUID   `json:"id"`
	CompanyID            uuid.UUID   `json:"company_id"`
	Title                string      `json:"title"`
	EventTypeID          *uuid.UUID  `json:"event_type_id"`
	ContactID            *uuid.UUID  `json:"contact_id"`
	AssignedUserID       uuid.UUID   `json:"assigned_user_id"`
	StartsAt             time.Time   `json:"starts_at"`
	EndsAt               *time.Time  `json:"ends_at"`
	AllDay               bool        `json:"all_day"`
	Status               EventStatus `json:"status"`
	Notes                *string     `json:"notes"`
	RelatedTaskID        *uuid.UUID  `json:"related_task_id"`
	RelatedOpportunityID *uuid.UUID  `json:"related_opportunity_id"`
	RelatedProjectID     *uuid.UUID  `json:"related_project_id"`
	CreatedAt            time.Time   `json:"created_at"`
	UpdatedAt            time.Time   `json:"updated_at"`
	DeletedAt            *time.Time  `json:"deleted_at,omitempty"`
}

// EventStatus represents the current state of a calendar event.
type EventStatus string

const (
	StatusPending     EventStatus = "pending"
	StatusDone        EventStatus = "done"
	StatusRescheduled EventStatus = "rescheduled"
	StatusCancelled   EventStatus = "cancelled"
)

// ParseEventStatus validates and converts a string to an EventStatus.
func ParseEventStatus(s string) (EventStatus, error) {
	switch EventStatus(s) {
	case StatusPending, StatusDone, StatusRescheduled, StatusCancelled:
		return EventStatus(s), nil
	default:
		return "", ErrInvalidEventStatus
	}
}
