package lead

import (
	"context"
	"log/slog"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "pixs/internal/repository/sqlc"
)

// MetricsService computes lead funnel metrics.
type MetricsService struct {
	q      *sqlcgen.Queries
	logger *slog.Logger
}

// NewMetricsService constructs a MetricsService.
func NewMetricsService(db *pgxpool.Pool, logger *slog.Logger) *MetricsService {
	return &MetricsService{q: sqlcgen.New(db), logger: logger}
}

// UserConversion is per-user conversion data.
type UserConversion struct {
	UserID    uuid.UUID `json:"user_id"`
	Total     int64     `json:"total"`
	Converted int64     `json:"converted"`
}

// LeadMetrics is the company-level lead funnel summary.
type LeadMetrics struct {
	LeadsThisMonth   int64            `json:"leads_this_month"`
	TotalLeads       int64            `json:"total_leads"`
	TotalConverted   int64            `json:"total_converted"`
	ConversionRate   float64          `json:"conversion_rate"`
	ActiveLeads      int64            `json:"active_leads"`
	ConversionByUser []UserConversion `json:"conversion_by_user"`
}

// GetMetrics returns the lead funnel metrics for a company.
func (s *MetricsService) GetMetrics(ctx context.Context, companyID uuid.UUID) (*LeadMetrics, error) {
	row, err := s.q.GetLeadMetrics(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "getting lead metrics")
	}
	m := &LeadMetrics{
		LeadsThisMonth: row.LeadsThisMonth,
		TotalLeads:     row.TotalLeads,
		TotalConverted: row.TotalConverted,
		ActiveLeads:    row.ActiveLeads,
	}
	if row.TotalLeads > 0 {
		m.ConversionRate = float64(row.TotalConverted) / float64(row.TotalLeads)
	}

	byUser, err := s.q.GetLeadConversionByUser(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "getting conversion by user")
	}
	for _, u := range byUser {
		if !u.AssignedTo.Valid {
			continue
		}
		m.ConversionByUser = append(m.ConversionByUser, UserConversion{
			UserID:    uuid.UUID(u.AssignedTo.Bytes),
			Total:     u.Total,
			Converted: u.Converted,
		})
	}
	return m, nil
}
