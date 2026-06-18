// Package timetracking holds the domain model for time entries and utilization.
package timetracking

import "github.com/cockroachdb/errors"

var (
	// ErrTimeEntryNotFound is returned when a time entry cannot be found.
	ErrTimeEntryNotFound = errors.New("entrada de tiempo no encontrada")
	// ErrInvalidDuration is returned when a duration is not positive.
	ErrInvalidDuration = errors.New("la duración debe ser mayor a 0")
)
