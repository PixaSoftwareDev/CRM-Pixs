package sales

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Opportunity is a sales opportunity moving through the pipeline.
type Opportunity struct {
	ID                uuid.UUID        `json:"id"`
	CompanyID         uuid.UUID        `json:"company_id"`
	ContactID         uuid.UUID        `json:"contact_id"`
	StageID           uuid.UUID        `json:"stage_id"`
	Title             string           `json:"title"`
	Amount            *decimal.Decimal `json:"amount"`
	Currency          string           `json:"currency"`
	ProbabilityPct    *decimal.Decimal `json:"probability_pct"`
	ExpectedCloseDate *time.Time       `json:"expected_close_date"`
	AssignedUserID    *uuid.UUID       `json:"assigned_user_id"`
	Source            *string          `json:"source"`
	LostReasonID      *uuid.UUID       `json:"lost_reason_id"`
	LostNotes         *string          `json:"lost_notes"`
	LeadID            *uuid.UUID       `json:"lead_id"`
	CreatedAt         time.Time        `json:"created_at"`
	UpdatedAt         time.Time        `json:"updated_at"`
	DeletedAt         *time.Time       `json:"deleted_at,omitempty"`
}

// PipelineStage is a column in the sales pipeline.
type PipelineStage struct {
	ID        uuid.UUID `json:"id"`
	CompanyID uuid.UUID `json:"company_id"`
	Name      string    `json:"name"`
	OrderPos  int16     `json:"order_pos"`
	Color     string    `json:"color"`
	IsWin     bool      `json:"is_win"`
	IsLoss    bool      `json:"is_loss"`
	IsDefault bool      `json:"is_default"`
	CreatedAt time.Time `json:"created_at"`
}

// LostReason is a configurable reason for losing an opportunity.
type LostReason struct {
	ID        uuid.UUID `json:"id"`
	CompanyID uuid.UUID `json:"company_id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
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
