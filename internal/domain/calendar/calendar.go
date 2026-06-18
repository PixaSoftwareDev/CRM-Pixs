// Package calendar defines the core domain types for the CRM calendar bounded context.
// It has no infrastructure imports.
package calendar

import (
	"time"

	"github.com/google/uuid"
)

// CalendarEventType is an extensible catalog of event categories (e.g. "cobranza").
type CalendarEventType struct {
	ID        uuid.UUID
	CompanyID uuid.UUID
	Name      string
	Color     string
	Icon      *string
	CreatedAt time.Time
}

// CalendarEvent is a scheduled activity that may be linked to a contact,
// a pipeline opportunity, a project, or a task.
type CalendarEvent struct {
	ID                   uuid.UUID
	CompanyID            uuid.UUID
	Title                string
	EventTypeID          *uuid.UUID
	ContactID            *uuid.UUID
	AssignedUserID       uuid.UUID
	StartsAt             time.Time
	EndsAt               *time.Time
	AllDay               bool
	Status               EventStatus
	Notes                *string
	RelatedTaskID        *uuid.UUID
	RelatedOpportunityID *uuid.UUID
	RelatedProjectID     *uuid.UUID
	CreatedAt            time.Time
	UpdatedAt            time.Time
	DeletedAt            *time.Time
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
