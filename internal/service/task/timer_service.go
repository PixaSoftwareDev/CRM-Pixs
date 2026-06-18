package task

import (
	"context"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	domain "pixs/internal/domain/task"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// TimerService manages per-task start/stop timers.
type TimerService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewTimerService constructs a TimerService.
func NewTimerService(db *pgxpool.Pool, logger *slog.Logger) *TimerService {
	return &TimerService{q: sqlcgen.New(db), db: db, logger: logger}
}

// Start begins a timer on a task for the user. Only one open timer per user is allowed.
func (s *TimerService) Start(ctx context.Context, taskID, userID uuid.UUID) (*domain.TaskTimeEntry, error) {
	if _, err := s.q.GetOpenTimer(ctx, userID); err == nil {
		return nil, errors.WithStack(domain.ErrTimerAlreadyRunning)
	}
	row, err := s.q.StartTaskTimer(ctx, sqlcgen.StartTaskTimerParams{
		TaskID:    taskID,
		UserID:    userID,
		StartedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "starting timer")
	}
	return timerFromRow(row), nil
}

// Stop ends the user's open timer for the given task and computes its duration.
func (s *TimerService) Stop(ctx context.Context, taskID, userID uuid.UUID) (*domain.TaskTimeEntry, error) {
	open, err := s.q.GetOpenTimerForTask(ctx, sqlcgen.GetOpenTimerForTaskParams{TaskID: taskID, UserID: userID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrNoOpenTimer)
	}
	row, err := s.q.StopTaskTimer(ctx, sqlcgen.StopTaskTimerParams{
		ID:      open.ID,
		UserID:  userID,
		EndedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "stopping timer")
	}
	return timerFromRow(row), nil
}

// GetOpen returns the user's currently running timer, if any.
func (s *TimerService) GetOpen(ctx context.Context, userID uuid.UUID) (*domain.TaskTimeEntry, error) {
	row, err := s.q.GetOpenTimer(ctx, userID)
	if err != nil {
		return nil, errors.WithStack(domain.ErrNoOpenTimer)
	}
	return timerFromRow(row), nil
}

func timerFromRow(r sqlcgen.TaskTimeEntry) *domain.TaskTimeEntry {
	return &domain.TaskTimeEntry{
		ID:              r.ID,
		TaskID:          r.TaskID,
		UserID:          r.UserID,
		StartedAt:       r.StartedAt.Time,
		EndedAt:         pgconv.TimestamptzPtr(r.EndedAt),
		DurationMinutes: r.DurationMinutes,
		Note:            r.Note,
		CreatedAt:       r.CreatedAt.Time,
	}
}
