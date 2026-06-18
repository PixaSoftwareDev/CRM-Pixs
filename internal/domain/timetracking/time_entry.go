package timetracking

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// TimeEntry is a logged block of work time, optionally billable.
type TimeEntry struct {
	ID              uuid.UUID
	CompanyID       uuid.UUID
	UserID          uuid.UUID
	Date            time.Time
	StartedAt       *time.Time
	EndedAt         *time.Time
	DurationMinutes int32
	Description     *string
	TaskID          *uuid.UUID
	ProjectID       *uuid.UUID
	ContactID       *uuid.UUID
	IsBillable      bool
	HourlyRate      *decimal.Decimal
	Currency        *string
	InvoiceLineID   *uuid.UUID
	CreatedAt       time.Time
}

// TimesheetDay groups time entries for a single day.
type TimesheetDay struct {
	Date         time.Time
	Entries      []*TimeEntry
	TotalMinutes int
}

// UtilizationReport summarizes billable vs total time for a user and period.
type UtilizationReport struct {
	UserID          uuid.UUID
	From            time.Time
	To              time.Time
	TotalMinutes    int64
	BillableMinutes int64
	UtilizationPct  decimal.Decimal
}
