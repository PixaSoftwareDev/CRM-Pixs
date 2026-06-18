// Package timetracking implements the application-layer service for time
// entries, timesheets, and utilization reporting.
package timetracking

import (
	"context"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/timetracking"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// TimeTrackingService manages time entries and utilization reporting.
type TimeTrackingService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewTimeTrackingService constructs a TimeTrackingService.
func NewTimeTrackingService(db *pgxpool.Pool, logger *slog.Logger) *TimeTrackingService {
	return &TimeTrackingService{q: sqlcgen.New(db), db: db, logger: logger}
}

// TimeEntryInput holds data for creating a time entry.
type TimeEntryInput struct {
	UserID          uuid.UUID
	Date            time.Time
	StartedAt       *time.Time
	EndedAt         *time.Time
	DurationMinutes int32
	Description     *string
	TaskID          *uuid.UUID
	ProjectID       *uuid.UUID
	ContactID       *uuid.UUID
	IsBillable      bool
	HourlyRate      *decimal.Decimal
	Currency        *string
}

// CreateTimeEntry logs a new block of work time.
func (s *TimeTrackingService) CreateTimeEntry(ctx context.Context, companyID uuid.UUID, in TimeEntryInput) (*domain.TimeEntry, error) {
	if in.DurationMinutes <= 0 {
		return nil, errors.WithStack(domain.ErrInvalidDuration)
	}
	params := sqlcgen.CreateTimeEntryParams{
		CompanyID:       companyID,
		UserID:          in.UserID,
		Date:            pgtype.Date{Time: in.Date, Valid: true},
		DurationMinutes: in.DurationMinutes,
		Description:     in.Description,
		TaskID:          pgconv.PtrUUID(in.TaskID),
		ProjectID:       pgconv.PtrUUID(in.ProjectID),
		ContactID:       pgconv.PtrUUID(in.ContactID),
		IsBillable:      in.IsBillable,
		HourlyRate:      pgconv.DecimalToNumeric(in.HourlyRate),
		Currency:        in.Currency,
	}
	if in.StartedAt != nil {
		params.StartedAt = pgtype.Timestamptz{Time: *in.StartedAt, Valid: true}
	}
	if in.EndedAt != nil {
		params.EndedAt = pgtype.Timestamptz{Time: *in.EndedAt, Valid: true}
	}
	row, err := s.q.CreateTimeEntry(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "creating time entry")
	}
	return timeEntryFromRow(row), nil
}

// GetTimeEntry returns a time entry by ID.
func (s *TimeTrackingService) GetTimeEntry(ctx context.Context, companyID, id uuid.UUID) (*domain.TimeEntry, error) {
	row, err := s.q.GetTimeEntryByID(ctx, sqlcgen.GetTimeEntryByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrTimeEntryNotFound)
	}
	return timeEntryFromRow(row), nil
}

// TimeEntryFilter holds filter parameters for listing time entries.
type TimeEntryFilter struct {
	UserID     *uuid.UUID
	ProjectID  *uuid.UUID
	TaskID     *uuid.UUID
	FromDate   *time.Time
	ToDate     *time.Time
	IsBillable *bool
}

// ListTimeEntries returns time entries with optional filters. When restrictToOwn
// is set, the user filter is forced to the caller.
func (s *TimeTrackingService) ListTimeEntries(ctx context.Context, companyID, callerUserID uuid.UUID, restrictToOwn bool, f TimeEntryFilter) ([]*domain.TimeEntry, error) {
	params := sqlcgen.ListTimeEntriesParams{
		CompanyID:  companyID,
		ProjectID:  pgconv.PtrUUID(f.ProjectID),
		TaskID:     pgconv.PtrUUID(f.TaskID),
		FromDate:   pgconv.PtrDate(f.FromDate),
		ToDate:     pgconv.PtrDate(f.ToDate),
		IsBillable: f.IsBillable,
	}
	if restrictToOwn {
		params.UserID = pgtype.UUID{Bytes: callerUserID, Valid: true}
	} else {
		params.UserID = pgconv.PtrUUID(f.UserID)
	}
	rows, err := s.q.ListTimeEntries(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "listing time entries")
	}
	out := make([]*domain.TimeEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, timeEntryFromRow(r))
	}
	return out, nil
}

// GetTimesheetWeek returns the entries for the 7-day window starting at weekStart, grouped by day.
func (s *TimeTrackingService) GetTimesheetWeek(ctx context.Context, userID uuid.UUID, weekStart time.Time) ([]*domain.TimesheetDay, error) {
	rows, err := s.q.GetTimesheetWeek(ctx, sqlcgen.GetTimesheetWeekParams{
		UserID: userID,
		Date:   pgtype.Date{Time: weekStart, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading timesheet week")
	}
	byDay := map[string]*domain.TimesheetDay{}
	order := make([]string, 0, 7)
	for _, r := range rows {
		e := timeEntryFromRow(r)
		key := e.Date.Format("2006-01-02")
		day, ok := byDay[key]
		if !ok {
			day = &domain.TimesheetDay{Date: e.Date}
			byDay[key] = day
			order = append(order, key)
		}
		day.Entries = append(day.Entries, e)
		day.TotalMinutes += int(e.DurationMinutes)
	}
	out := make([]*domain.TimesheetDay, 0, len(order))
	for _, k := range order {
		out = append(out, byDay[k])
	}
	return out, nil
}

// GetUtilization returns the billable-vs-total utilization report for a user and period.
func (s *TimeTrackingService) GetUtilization(ctx context.Context, companyID, userID uuid.UUID, from, to time.Time) (*domain.UtilizationReport, error) {
	stats, err := s.q.GetUtilizationStats(ctx, sqlcgen.GetUtilizationStatsParams{
		UserID:    userID,
		Date:      pgtype.Date{Time: from, Valid: true},
		Date_2:    pgtype.Date{Time: to, Valid: true},
		CompanyID: companyID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading utilization stats")
	}
	report := &domain.UtilizationReport{
		UserID:          userID,
		From:            from,
		To:              to,
		TotalMinutes:    stats.TotalMinutes,
		BillableMinutes: stats.BillableMinutes,
		UtilizationPct:  decimal.Zero,
	}
	if stats.TotalMinutes > 0 {
		report.UtilizationPct = decimal.NewFromInt(stats.BillableMinutes).
			Mul(decimal.NewFromInt(100)).
			Div(decimal.NewFromInt(stats.TotalMinutes)).
			RoundBank(2)
	}
	return report, nil
}

func timeEntryFromRow(r sqlcgen.TimeEntry) *domain.TimeEntry {
	return &domain.TimeEntry{
		ID:              r.ID,
		CompanyID:       r.CompanyID,
		UserID:          r.UserID,
		Date:            r.Date.Time,
		StartedAt:       pgconv.TimestamptzPtr(r.StartedAt),
		EndedAt:         pgconv.TimestamptzPtr(r.EndedAt),
		DurationMinutes: r.DurationMinutes,
		Description:     r.Description,
		TaskID:          pgconv.UUIDPtr(r.TaskID),
		ProjectID:       pgconv.UUIDPtr(r.ProjectID),
		ContactID:       pgconv.UUIDPtr(r.ContactID),
		IsBillable:      r.IsBillable,
		HourlyRate:      pgconv.NumericToDecimal(r.HourlyRate),
		Currency:        r.Currency,
		InvoiceLineID:   pgconv.UUIDPtr(r.InvoiceLineID),
		CreatedAt:       r.CreatedAt.Time,
	}
}
