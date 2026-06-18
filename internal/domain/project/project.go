package project

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ProjectStatus is the lifecycle status of a project.
type ProjectStatus string

// Project statuses.
const (
	StatusPlanning  ProjectStatus = "planning"
	StatusActive    ProjectStatus = "active"
	StatusPaused    ProjectStatus = "paused"
	StatusDelivered ProjectStatus = "delivered"
	StatusArchived  ProjectStatus = "archived"
	StatusCancelled ProjectStatus = "cancelled"
)

// ParseProjectStatus validates and parses a project status string.
func ParseProjectStatus(s string) (ProjectStatus, error) {
	switch ProjectStatus(s) {
	case StatusPlanning, StatusActive, StatusPaused, StatusDelivered, StatusArchived, StatusCancelled:
		return ProjectStatus(s), nil
	}
	return "", ErrInvalidStatus
}

// MilestoneStatus is the status of a project milestone.
type MilestoneStatus string

// Milestone statuses.
const (
	MilestonePending    MilestoneStatus = "pending"
	MilestoneInProgress MilestoneStatus = "in_progress"
	MilestoneDone       MilestoneStatus = "done"
	MilestoneDelayed    MilestoneStatus = "delayed"
)

// Project is a unit of delivered work for a client.
type Project struct {
	ID               uuid.UUID
	CompanyID        uuid.UUID
	ClientID         uuid.UUID
	Name             string
	Description      *string
	StartDate        *time.Time
	EstimatedEndDate *time.Time
	ActualEndDate    *time.Time
	Status           ProjectStatus
	ResponsibleID    *uuid.UUID
	BudgetHours      *decimal.Decimal
	BudgetAmount     *decimal.Decimal
	Currency         string
	OpportunityID    *uuid.UUID
	QuoteID          *uuid.UUID
	CreatedAt        time.Time
	UpdatedAt        time.Time
	DeletedAt        *time.Time
}

// Milestone is a deliverable checkpoint within a project.
type Milestone struct {
	ID            uuid.UUID
	ProjectID     uuid.UUID
	Name          string
	Description   *string
	Deliverables  *string
	CommittedDate *time.Time
	Status        MilestoneStatus
	OrderPos      *int16
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     *time.Time
}

// ProjectMember is a user assigned to a project.
type ProjectMember struct {
	ProjectID     uuid.UUID
	UserID        uuid.UUID
	RoleInProject *string
	FullName      string
	Email         string
}

// ProfitabilityReport summarizes time and budget figures for a project.
type ProfitabilityReport struct {
	ProjectID     uuid.UUID
	BudgetHours   *decimal.Decimal
	BudgetAmount  *decimal.Decimal
	TotalMinutes  int64
	TotalHours    decimal.Decimal
	BilledMinutes int64
	BillableHours decimal.Decimal
	// LaborCost is 0 until identity exposes per-user cost rates for the time window.
	// TODO: calculate from user_cost_rates when identity exposes them; currently 0.
	LaborCost decimal.Decimal
	// TODO: add InvoicedRevenue decimal.Decimal when finance module exists.
	// TODO: add ImputableExpenses decimal.Decimal when expenses module exists.
}
