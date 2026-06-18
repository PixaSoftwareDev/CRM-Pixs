package sales

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Product is a catalog item that can be quoted or sold.
type Product struct {
	ID          uuid.UUID
	CompanyID   uuid.UUID
	Code        *string
	Name        string
	Description *string
	Unit        *string
	UnitPrice   *decimal.Decimal
	Currency    *string
	Cost        *decimal.Decimal
	VATRatePct  *decimal.Decimal
	Category    *string
	IsRecurring bool
	IsActive    bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   *time.Time
}

// Margin returns (unit_price - cost) / unit_price.
// Returns nil if either price is nil or unit_price is zero.
func (p *Product) Margin() *decimal.Decimal {
	if p.UnitPrice == nil || p.Cost == nil || p.UnitPrice.IsZero() {
		return nil
	}
	m := p.UnitPrice.Sub(*p.Cost).Div(*p.UnitPrice)
	return &m
}
