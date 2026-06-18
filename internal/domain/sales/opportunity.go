package sales

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Opportunity is a sales opportunity moving through the pipeline.
type Opportunity struct {
	ID                uuid.UUID
	CompanyID         uuid.UUID
	ContactID         uuid.UUID
	StageID           uuid.UUID
	Title             string
	Amount            *decimal.Decimal
	Currency          string
	ProbabilityPct    *decimal.Decimal
	ExpectedCloseDate *time.Time
	AssignedUserID    *uuid.UUID
	Source            *string
	LostReasonID      *uuid.UUID
	LostNotes         *string
	LeadID            *uuid.UUID
	CreatedAt         time.Time
	UpdatedAt         time.Time
	DeletedAt         *time.Time
}

// PipelineStage is a column in the sales pipeline.
type PipelineStage struct {
	ID        uuid.UUID
	CompanyID uuid.UUID
	Name      string
	OrderPos  int16
	Color     string
	IsWin     bool
	IsLoss    bool
	IsDefault bool
	CreatedAt time.Time
}

// LostReason is a configurable reason for losing an opportunity.
type LostReason struct {
	ID        uuid.UUID
	CompanyID uuid.UUID
	Name      string
	CreatedAt time.Time
}

// Forecast returns the sum of each opportunity's amount weighted by its probability.
func Forecast(opps []*Opportunity) decimal.Decimal {
	total := decimal.Zero
	for _, o := range opps {
		if o.Amount != nil && o.ProbabilityPct != nil {
			weighted := o.Amount.Mul(*o.ProbabilityPct).Div(decimal.NewFromInt(100))
			total = total.Add(weighted)
		}
	}
	return total
}
