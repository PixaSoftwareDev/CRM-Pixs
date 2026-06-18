// Package project holds the domain model for projects, milestones, and members.
package project

import "github.com/cockroachdb/errors"

var (
	// ErrProjectNotFound is returned when a project cannot be found.
	ErrProjectNotFound = errors.New("proyecto no encontrado")
	// ErrMilestoneNotFound is returned when a milestone cannot be found.
	ErrMilestoneNotFound = errors.New("hito no encontrado")
	// ErrMemberNotFound is returned when a project member cannot be found.
	ErrMemberNotFound = errors.New("miembro no encontrado")
	// ErrInvalidStatus is returned when a project status is invalid.
	ErrInvalidStatus = errors.New("estado de proyecto inválido")
	// ErrForbidden is returned when access is denied.
	ErrForbidden = errors.New("acceso denegado")
)
