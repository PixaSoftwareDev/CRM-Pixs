// Package calendar implements the application-layer service for CRM calendar management.
package calendar

import (
	"context"
	"log/slog"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	domain "pixs/internal/domain/calendar"
	sqlcgen "pixs/internal/repository/sqlc"
)

// CalendarService handles calendar event operations.
type CalendarService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewCalendarService constructs a CalendarService.
func NewCalendarService(db *pgxpool.Pool, logger *slog.Logger) *CalendarService {
	return &CalendarService{
		q:      sqlcgen.New(db),
		db:     db,
		logger: logger,
	}
}

// ─── Event Types ───────────────────────────────────────────────────────────────

// CreateEventType creates a new calendar event type.
func (s *CalendarService) CreateEventType(ctx context.Context, companyID uuid.UUID, name, color string, icon *string) (*domain.CalendarEventType, error) {
	row, err := s.q.CreateCalendarEventType(ctx, sqlcgen.CreateCalendarEventTypeParams{
		CompanyID: companyID,
		Name:      name,
		Color:     color,
		Icon:      icon,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating calendar event type")
	}
	return eventTypeFromRow(row), nil
}

// GetEventType returns a calendar event type by ID.
func (s *CalendarService) GetEventType(ctx context.Context, companyID, id uuid.UUID) (*domain.CalendarEventType, error) {
	row, err := s.q.GetCalendarEventTypeByID(ctx, sqlcgen.GetCalendarEventTypeByIDParams{
		ID:        id,
		CompanyID: companyID,
	})
	if err != nil {
		return nil, errors.WithStack(domain.ErrEventTypeNotFound)
	}
	return eventTypeFromRow(row), nil
}

// ListEventTypes returns all event types for a company.
func (s *CalendarService) ListEventTypes(ctx context.Context, companyID uuid.UUID) ([]*domain.CalendarEventType, error) {
	rows, err := s.q.ListCalendarEventTypes(ctx, companyID)
	if err != nil {
		return nil, errors.Wrap(err, "listing event types")
	}
	out := make([]*domain.CalendarEventType, 0, len(rows))
	for _, r := range rows {
		out = append(out, eventTypeFromRow(r))
	}
	return out, nil
}

// ─── Events ────────────────────────────────────────────────────────────────────

// CreateEventInput holds data for a new calendar event.
type CreateEventInput struct {
	Title                string
	EventTypeID          *uuid.UUID
	ContactID            *uuid.UUID
	AssignedUserID       uuid.UUID
	StartsAt             time.Time
	EndsAt               *time.Time
	AllDay               bool
	Status               string
	Notes                *string
	RelatedTaskID        *uuid.UUID
	RelatedOpportunityID *uuid.UUID
	RelatedProjectID     *uuid.UUID
}

// CreateEvent creates a new calendar event.
func (s *CalendarService) CreateEvent(ctx context.Context, companyID uuid.UUID, in CreateEventInput) (*domain.CalendarEvent, error) {
	status := in.Status
	if status == "" {
		status = string(domain.StatusPending)
	} else {
		if _, err := domain.ParseEventStatus(status); err != nil {
			return nil, errors.WithStack(err)
		}
	}

	params := sqlcgen.CreateCalendarEventParams{
		CompanyID:      companyID,
		Title:          in.Title,
		AssignedUserID: in.AssignedUserID,
		StartsAt:       pgtype.Timestamptz{Time: in.StartsAt, Valid: true},
		AllDay:         in.AllDay,
		Status:         status,
		Notes:          in.Notes,
	}
	if in.EventTypeID != nil {
		params.EventTypeID = pgtype.UUID{Bytes: *in.EventTypeID, Valid: true}
	}
	if in.ContactID != nil {
		params.ContactID = pgtype.UUID{Bytes: *in.ContactID, Valid: true}
	}
	if in.EndsAt != nil {
		params.EndsAt = pgtype.Timestamptz{Time: *in.EndsAt, Valid: true}
	}
	if in.RelatedTaskID != nil {
		params.RelatedTaskID = pgtype.UUID{Bytes: *in.RelatedTaskID, Valid: true}
	}
	if in.RelatedOpportunityID != nil {
		params.RelatedOpportunityID = pgtype.UUID{Bytes: *in.RelatedOpportunityID, Valid: true}
	}
	if in.RelatedProjectID != nil {
		params.RelatedProjectID = pgtype.UUID{Bytes: *in.RelatedProjectID, Valid: true}
	}

	row, err := s.q.CreateCalendarEvent(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "creating calendar event")
	}
	return eventFromRow(row), nil
}

// GetEvent returns a calendar event by ID.
func (s *CalendarService) GetEvent(ctx context.Context, companyID, id, callerUserID uuid.UUID, restrictToOwn bool) (*domain.CalendarEvent, error) {
	row, err := s.q.GetCalendarEventByID(ctx, sqlcgen.GetCalendarEventByIDParams{
		ID:        id,
		CompanyID: companyID,
	})
	if err != nil {
		return nil, errors.WithStack(domain.ErrEventNotFound)
	}
	ev := eventFromRow(row)
	if restrictToOwn && ev.AssignedUserID != callerUserID {
		return nil, errors.WithStack(domain.ErrForbidden)
	}
	return ev, nil
}

// ListFilter holds filter parameters for listing calendar events.
type ListFilter struct {
	From           *time.Time
	To             *time.Time
	EventTypeID    *uuid.UUID
	ContactID      *uuid.UUID
	AssignedUserID *uuid.UUID
	Status         string
}

// ListEvents returns calendar events with optional filters.
func (s *CalendarService) ListEvents(ctx context.Context, companyID, callerUserID uuid.UUID, restrictToOwn bool, f ListFilter) ([]*domain.CalendarEvent, error) {
	params := sqlcgen.ListCalendarEventsParams{
		CompanyID: companyID,
		Column2:   f.Status,
	}
	if f.From != nil {
		params.FromTs = pgtype.Timestamptz{Time: *f.From, Valid: true}
	}
	if f.To != nil {
		params.ToTs = pgtype.Timestamptz{Time: *f.To, Valid: true}
	}
	if f.EventTypeID != nil {
		params.EventTypeID = pgtype.UUID{Bytes: *f.EventTypeID, Valid: true}
	}
	if f.ContactID != nil {
		params.ContactID = pgtype.UUID{Bytes: *f.ContactID, Valid: true}
	}
	if restrictToOwn {
		params.AssignedUserID = pgtype.UUID{Bytes: callerUserID, Valid: true}
	} else if f.AssignedUserID != nil {
		params.AssignedUserID = pgtype.UUID{Bytes: *f.AssignedUserID, Valid: true}
	}

	rows, err := s.q.ListCalendarEvents(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "listing calendar events")
	}
	out := make([]*domain.CalendarEvent, 0, len(rows))
	for _, r := range rows {
		out = append(out, eventFromRow(r))
	}
	return out, nil
}

// UpdateEventInput holds updatable fields for a calendar event.
type UpdateEventInput struct {
	Title                string
	EventTypeID          *uuid.UUID
	ContactID            *uuid.UUID
	AssignedUserID       uuid.UUID
	StartsAt             time.Time
	EndsAt               *time.Time
	AllDay               bool
	Status               string
	Notes                *string
	RelatedTaskID        *uuid.UUID
	RelatedOpportunityID *uuid.UUID
	RelatedProjectID     *uuid.UUID
}

// UpdateEvent updates a calendar event.
func (s *CalendarService) UpdateEvent(ctx context.Context, companyID, id uuid.UUID, in UpdateEventInput) (*domain.CalendarEvent, error) {
	if _, err := domain.ParseEventStatus(in.Status); err != nil {
		return nil, errors.WithStack(err)
	}

	params := sqlcgen.UpdateCalendarEventParams{
		ID:             id,
		CompanyID:      companyID,
		Title:          in.Title,
		AssignedUserID: in.AssignedUserID,
		StartsAt:       pgtype.Timestamptz{Time: in.StartsAt, Valid: true},
		AllDay:         in.AllDay,
		Status:         in.Status,
		Notes:          in.Notes,
	}
	if in.EventTypeID != nil {
		params.EventTypeID = pgtype.UUID{Bytes: *in.EventTypeID, Valid: true}
	}
	if in.ContactID != nil {
		params.ContactID = pgtype.UUID{Bytes: *in.ContactID, Valid: true}
	}
	if in.EndsAt != nil {
		params.EndsAt = pgtype.Timestamptz{Time: *in.EndsAt, Valid: true}
	}
	if in.RelatedTaskID != nil {
		params.RelatedTaskID = pgtype.UUID{Bytes: *in.RelatedTaskID, Valid: true}
	}
	if in.RelatedOpportunityID != nil {
		params.RelatedOpportunityID = pgtype.UUID{Bytes: *in.RelatedOpportunityID, Valid: true}
	}
	if in.RelatedProjectID != nil {
		params.RelatedProjectID = pgtype.UUID{Bytes: *in.RelatedProjectID, Valid: true}
	}

	row, err := s.q.UpdateCalendarEvent(ctx, params)
	if err != nil {
		return nil, errors.WithStack(domain.ErrEventNotFound)
	}
	return eventFromRow(row), nil
}

// DeleteEvent soft-deletes a calendar event.
func (s *CalendarService) DeleteEvent(ctx context.Context, companyID, id uuid.UUID) error {
	return errors.Wrap(s.q.SoftDeleteCalendarEvent(ctx, sqlcgen.SoftDeleteCalendarEventParams{
		ID:        id,
		CompanyID: companyID,
	}), "deleting calendar event")
}

// ─── Row mappers ───────────────────────────────────────────────────────────────

func eventTypeFromRow(r sqlcgen.CalendarEventType) *domain.CalendarEventType {
	return &domain.CalendarEventType{
		ID:        r.ID,
		CompanyID: r.CompanyID,
		Name:      r.Name,
		Color:     r.Color,
		Icon:      r.Icon,
		CreatedAt: r.CreatedAt.Time,
	}
}

func eventFromRow(r sqlcgen.CalendarEvent) *domain.CalendarEvent {
	ev := &domain.CalendarEvent{
		ID:             r.ID,
		CompanyID:      r.CompanyID,
		Title:          r.Title,
		AssignedUserID: r.AssignedUserID,
		StartsAt:       r.StartsAt.Time,
		AllDay:         r.AllDay,
		Status:         domain.EventStatus(r.Status),
		Notes:          r.Notes,
		CreatedAt:      r.CreatedAt.Time,
		UpdatedAt:      r.UpdatedAt.Time,
	}
	if r.EventTypeID.Valid {
		uid := uuid.UUID(r.EventTypeID.Bytes)
		ev.EventTypeID = &uid
	}
	if r.ContactID.Valid {
		uid := uuid.UUID(r.ContactID.Bytes)
		ev.ContactID = &uid
	}
	if r.EndsAt.Valid {
		t := r.EndsAt.Time
		ev.EndsAt = &t
	}
	if r.RelatedTaskID.Valid {
		uid := uuid.UUID(r.RelatedTaskID.Bytes)
		ev.RelatedTaskID = &uid
	}
	if r.RelatedOpportunityID.Valid {
		uid := uuid.UUID(r.RelatedOpportunityID.Bytes)
		ev.RelatedOpportunityID = &uid
	}
	if r.RelatedProjectID.Valid {
		uid := uuid.UUID(r.RelatedProjectID.Bytes)
		ev.RelatedProjectID = &uid
	}
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		ev.DeletedAt = &t
	}
	return ev
}
