// Package task holds the domain model for tasks, tickets, and their workflow.
package task

import "github.com/cockroachdb/errors"

var (
	// ErrTaskNotFound is returned when a task cannot be found.
	ErrTaskNotFound = errors.New("tarea no encontrada")
	// ErrInvalidStatusTransition is returned for a disallowed status transition.
	ErrInvalidStatusTransition = errors.New("transición de estado inválida")
	// ErrInvalidStatus is returned when a task status value is invalid.
	ErrInvalidStatus = errors.New("estado de tarea inválido")
	// ErrTaskClosed is returned when modifying a closed task.
	ErrTaskClosed = errors.New("la tarea está cerrada y no puede modificarse")
	// ErrTimerAlreadyRunning is returned when starting a timer while one runs.
	ErrTimerAlreadyRunning = errors.New("ya hay un cronómetro corriendo")
	// ErrNoOpenTimer is returned when stopping a timer that isn't running.
	ErrNoOpenTimer = errors.New("no hay cronómetro corriendo")
	// ErrForbidden is returned when access is denied.
	ErrForbidden = errors.New("acceso denegado")
	// ErrCommentBodyRequired is returned for an empty comment body.
	ErrCommentBodyRequired = errors.New("el comentario no puede estar vacío")
)
