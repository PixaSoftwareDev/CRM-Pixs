package project

import (
	"context"
	"log/slog"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/project"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// ProfitabilityService computes profitability reports for projects.
type ProfitabilityService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewProfitabilityService constructs a ProfitabilityService.
func NewProfitabilityService(db *pgxpool.Pool, logger *slog.Logger) *ProfitabilityService {
	return &ProfitabilityService{q: sqlcgen.New(db), db: db, logger: logger}
}

// GetProfitability returns time-based profitability figures for a project.
func (s *ProfitabilityService) GetProfitability(ctx context.Context, companyID, projectID uuid.UUID) (*domain.ProfitabilityReport, error) {
	proj, err := s.q.GetProjectByID(ctx, sqlcgen.GetProjectByIDParams{ID: projectID, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrProjectNotFound)
	}
	stats, err := s.q.GetProjectTimeStats(ctx, sqlcgen.GetProjectTimeStatsParams{
		ProjectID: pgconv.PtrUUID(&projectID),
		CompanyID: companyID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading project time stats")
	}

	minutesPerHour := decimal.NewFromInt(60)
	report := &domain.ProfitabilityReport{
		ProjectID:     projectID,
		TotalMinutes:  stats.TotalMinutes,
		TotalHours:    decimal.NewFromInt(stats.TotalMinutes).Div(minutesPerHour).RoundBank(2),
		BilledMinutes: stats.BillableMinutes,
		BillableHours: decimal.NewFromInt(stats.BillableMinutes).Div(minutesPerHour).RoundBank(2),
		// LaborCost stays zero until per-user cost rates are available.
		// TODO: calculate from user_cost_rates when identity exposes them.
		LaborCost: decimal.Zero,
	}
	report.BudgetHours = pgconv.NumericToDecimal(proj.BudgetHours)
	report.BudgetAmount = pgconv.NumericToDecimal(proj.BudgetAmount)
	return report, nil
}
