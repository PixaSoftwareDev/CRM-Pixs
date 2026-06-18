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
	ID               uuid.UUID        `json:"id"`
	CompanyID        uuid.UUID        `json:"company_id"`
	ClientID         uuid.UUID        `json:"client_id"`
	Name             string           `json:"name"`
	Description      *string          `json:"description"`
	StartDate        *time.Time       `json:"start_date"`
	EstimatedEndDate *time.Time       `json:"estimated_end_date"`
	ActualEndDate    *time.Time       `json:"actual_end_date"`
	Status           ProjectStatus    `json:"status"`
	ResponsibleID    *uuid.UUID       `json:"responsible_id"`
	BudgetHours      *decimal.Decimal `json:"budget_hours"`
	BudgetAmount     *decimal.Decimal `json:"budget_amount"`
	Currency         string           `json:"currency"`
	OpportunityID    *uuid.UUID       `json:"opportunity_id"`
	QuoteID          *uuid.UUID       `json:"quote_id"`
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
	DeletedAt        *time.Time       `json:"deleted_at,omitempty"`
}

// Milestone is a deliverable checkpoint within a project.
type Milestone struct {
	ID            uuid.UUID       `json:"id"`
	ProjectID     uuid.UUID       `json:"project_id"`
	Name          string          `json:"name"`
	Description   *string         `json:"description"`
	Deliverables  *string         `json:"deliverables"`
	CommittedDate *time.Time      `json:"committed_date"`
	Status        MilestoneStatus `json:"status"`
	OrderPos      *int16          `json:"order_pos"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	DeletedAt     *time.Time      `json:"deleted_at,omitempty"`
}

// ProjectMember is a user assigned to a project.
type ProjectMember struct {
	ProjectID     uuid.UUID `json:"project_id"`
	UserID        uuid.UUID `json:"user_id"`
	RoleInProject *string   `json:"role_in_project"`
	FullName      string    `json:"full_name"`
	Email         string    `json:"email"`
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
