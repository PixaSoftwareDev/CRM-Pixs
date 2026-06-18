// Package lead implements the application-layer service for the leads +
// scraping bounded context.
package lead

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	domain "pixs/internal/domain/lead"
	sqlcgen "pixs/internal/repository/sqlc"
)

// LeadService handles lead CRUD, status transitions, assignment and activities.
type LeadService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewLeadService constructs a LeadService.
func NewLeadService(db *pgxpool.Pool, logger *slog.Logger) *LeadService {
	return &LeadService{q: sqlcgen.New(db), db: db, logger: logger}
}

// CreateLeadInput holds the data for creating a lead manually.
type CreateLeadInput struct {
	CompanyName     string
	Description     *string
	WhatTheyDo      *string
	Website         *string
	SourceURL       *string
	Industry        *string
	ApproximateSize *string
	City            *string
	Country         *string
	Language        *string
	AssignedTo      *uuid.UUID
	FollowUpDate    *time.Time
}

// CreateLead creates a lead after a duplicate check, recording a "created" activity.
func (s *LeadService) CreateLead(ctx context.Context, companyID, callerID uuid.UUID, in CreateLeadInput) (*domain.Lead, error) {
	if strings.TrimSpace(in.CompanyName) == "" {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}

	if _, err := s.q.CheckLeadDuplicate(ctx, sqlcgen.CheckLeadDuplicateParams{
		CompanyID: companyID,
		Website:   in.Website,
		Lower:     in.CompanyName,
	}); err == nil {
		return nil, errors.WithStack(domain.ErrDuplicateLead)
	}

	params := sqlcgen.CreateLeadParams{
		CompanyID:       companyID,
		CompanyName:     in.CompanyName,
		Description:     in.Description,
		WhatTheyDo:      in.WhatTheyDo,
		Website:         in.Website,
		SourceUrl:       in.SourceURL,
		Industry:        in.Industry,
		ApproximateSize: in.ApproximateSize,
		City:            in.City,
		Country:         in.Country,
		Language:        in.Language,
		Status:          string(domain.StatusNew),
	}
	if in.AssignedTo != nil {
		params.AssignedTo = pgtype.UUID{Bytes: *in.AssignedTo, Valid: true}
	}
	if in.FollowUpDate != nil {
		params.FollowUpDate = pgtype.Date{Time: *in.FollowUpDate, Valid: true}
	}

	row, err := s.q.CreateLead(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "creating lead")
	}

	detail := "lead creado manualmente"
	s.recordActivity(ctx, row.ID, &callerID, "created", &detail)
	s.writeAudit(ctx, companyID, &callerID, row.ID, "create", nil, leadFromRow(row))
	return s.hydrate(ctx, leadFromRow(row)), nil
}

// GetLead returns a hydrated lead, enforcing own-restriction.
func (s *LeadService) GetLead(ctx context.Context, companyID, id, callerID uuid.UUID, restrictToOwn bool) (*domain.Lead, error) {
	row, err := s.q.GetLeadByID(ctx, sqlcgen.GetLeadByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	l := leadFromRow(row)
	if restrictToOwn && (l.AssignedTo == nil || *l.AssignedTo != callerID) {
		return nil, errors.WithStack(domain.ErrForbidden)
	}
	return s.hydrate(ctx, l), nil
}

// ListFilter holds list/filter parameters.
type ListFilter struct {
	Status     string
	AssignedTo *uuid.UUID
	Industry   string
	FromDate   *time.Time
	ToDate     *time.Time
	Page       int32
	PerPage    int32
}

// ListLeads returns a page of leads matching the filter.
func (s *LeadService) ListLeads(ctx context.Context, companyID, callerID uuid.UUID, restrictToOwn bool, f ListFilter) ([]*domain.Lead, error) {
	if f.PerPage <= 0 {
		f.PerPage = 50
	}
	if f.Page <= 0 {
		f.Page = 1
	}
	params := sqlcgen.ListLeadsParams{
		CompanyID: companyID,
		Limit:     f.PerPage,
		Offset:    (f.Page - 1) * f.PerPage,
	}
	if f.Status != "" {
		params.Status = &f.Status
	}
	if f.Industry != "" {
		params.Industry = &f.Industry
	}
	if restrictToOwn {
		params.AssignedTo = pgtype.UUID{Bytes: callerID, Valid: true}
	} else if f.AssignedTo != nil {
		params.AssignedTo = pgtype.UUID{Bytes: *f.AssignedTo, Valid: true}
	}
	if f.FromDate != nil {
		params.FromDate = pgtype.Date{Time: *f.FromDate, Valid: true}
	}
	if f.ToDate != nil {
		params.ToDate = pgtype.Date{Time: *f.ToDate, Valid: true}
	}

	rows, err := s.q.ListLeads(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "listing leads")
	}
	out := make([]*domain.Lead, 0, len(rows))
	for _, r := range rows {
		out = append(out, leadFromRow(r))
	}
	return out, nil
}

// UpdateLeadInput holds updatable lead fields.
type UpdateLeadInput struct {
	CompanyName     string
	Description     *string
	WhatTheyDo      *string
	Website         *string
	Industry        *string
	ApproximateSize *string
	City            *string
	Country         *string
	Language        *string
	FollowUpDate    *time.Time
}

// UpdateLead updates a lead's basic fields.
func (s *LeadService) UpdateLead(ctx context.Context, companyID, id, callerID uuid.UUID, in UpdateLeadInput) (*domain.Lead, error) {
	before, err := s.q.GetLeadByID(ctx, sqlcgen.GetLeadByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	params := sqlcgen.UpdateLeadParams{
		ID:              id,
		CompanyID:       companyID,
		CompanyName:     in.CompanyName,
		Description:     in.Description,
		WhatTheyDo:      in.WhatTheyDo,
		Website:         in.Website,
		Industry:        in.Industry,
		ApproximateSize: in.ApproximateSize,
		City:            in.City,
		Country:         in.Country,
		Language:        in.Language,
	}
	if in.FollowUpDate != nil {
		params.FollowUpDate = pgtype.Date{Time: *in.FollowUpDate, Valid: true}
	}
	row, err := s.q.UpdateLead(ctx, params)
	if err != nil {
		return nil, errors.Wrap(err, "updating lead")
	}
	s.writeAudit(ctx, companyID, &callerID, id, "update", leadFromRow(before), leadFromRow(row))
	return s.hydrate(ctx, leadFromRow(row)), nil
}

// ChangeStatus validates the state-machine transition and applies it.
func (s *LeadService) ChangeStatus(ctx context.Context, companyID, id, callerID uuid.UUID, newStatus string, rejectionReason *string) (*domain.Lead, error) {
	row, err := s.q.GetLeadByID(ctx, sqlcgen.GetLeadByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	from := domain.LeadStatus(row.Status)
	to := domain.LeadStatus(newStatus)
	if !to.IsValid() {
		return nil, errors.WithStack(domain.ErrInvalidStatusTransition)
	}
	if from == domain.StatusConverted {
		return nil, errors.WithStack(domain.ErrLeadAlreadyConverted)
	}
	if !domain.CanTransition(from, to) {
		return nil, errors.WithStack(domain.ErrInvalidStatusTransition)
	}

	updated, err := s.q.UpdateLeadStatus(ctx, sqlcgen.UpdateLeadStatusParams{
		ID: id, CompanyID: companyID, Status: newStatus, RejectionReason: rejectionReason,
	})
	if err != nil {
		return nil, errors.Wrap(err, "updating lead status")
	}
	detail := "estado: " + row.Status + " → " + newStatus
	s.recordActivity(ctx, id, &callerID, "status_changed", &detail)
	s.writeAudit(ctx, companyID, &callerID, id, "update", leadFromRow(row), leadFromRow(updated))
	return s.hydrate(ctx, leadFromRow(updated)), nil
}

// AssignLead reassigns a lead, recording an "assigned" activity.
func (s *LeadService) AssignLead(ctx context.Context, companyID, id, callerID, assignTo uuid.UUID) (*domain.Lead, error) {
	row, err := s.q.AssignLead(ctx, sqlcgen.AssignLeadParams{
		ID: id, CompanyID: companyID, AssignedTo: pgtype.UUID{Bytes: assignTo, Valid: true},
	})
	if err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	detail := "asignado a " + assignTo.String()
	s.recordActivity(ctx, id, &callerID, "assigned", &detail)
	return s.hydrate(ctx, leadFromRow(row)), nil
}

// AddNote appends a free-text note activity to a lead.
func (s *LeadService) AddNote(ctx context.Context, companyID, id, callerID uuid.UUID, body string) (*domain.ActivityEntry, error) {
	if strings.TrimSpace(body) == "" {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	if _, err := s.q.GetLeadByID(ctx, sqlcgen.GetLeadByIDParams{ID: id, CompanyID: companyID}); err != nil {
		return nil, errors.WithStack(domain.ErrLeadNotFound)
	}
	row, err := s.q.CreateLeadActivity(ctx, sqlcgen.CreateLeadActivityParams{
		LeadID: id, UserID: pgtype.UUID{Bytes: callerID, Valid: true}, ActivityType: "note", Detail: &body,
	})
	if err != nil {
		return nil, errors.Wrap(err, "creating note")
	}
	return activityFromRow(row), nil
}

// SoftDeleteLead soft-deletes a lead.
func (s *LeadService) SoftDeleteLead(ctx context.Context, companyID, id, callerID uuid.UUID) error {
	before, err := s.q.GetLeadByID(ctx, sqlcgen.GetLeadByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrLeadNotFound)
	}
	if err := s.q.SoftDeleteLead(ctx, sqlcgen.SoftDeleteLeadParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting lead")
	}
	s.writeAudit(ctx, companyID, &callerID, id, "delete", leadFromRow(before), nil)
	return nil
}

// GetActivities returns the activity timeline for a lead.
func (s *LeadService) GetActivities(ctx context.Context, id uuid.UUID) ([]*domain.ActivityEntry, error) {
	rows, err := s.q.ListLeadActivities(ctx, id)
	if err != nil {
		return nil, errors.Wrap(err, "listing activities")
	}
	out := make([]*domain.ActivityEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, activityFromRow(r))
	}
	return out, nil
}

// hydrate loads child collections (emails, phones, socials) onto a lead.
func (s *LeadService) hydrate(ctx context.Context, l *domain.Lead) *domain.Lead {
	if emails, err := s.q.ListLeadEmails(ctx, l.ID); err == nil {
		for _, e := range emails {
			l.Emails = append(l.Emails, emailFromRow(e))
		}
	}
	if phones, err := s.q.ListLeadPhones(ctx, l.ID); err == nil {
		for _, p := range phones {
			l.Phones = append(l.Phones, phoneFromRow(p))
		}
	}
	if socials, err := s.q.ListLeadSocials(ctx, l.ID); err == nil {
		for _, sc := range socials {
			l.Socials = append(l.Socials, socialFromRow(sc))
		}
	}
	return l
}

func (s *LeadService) recordActivity(ctx context.Context, leadID uuid.UUID, userID *uuid.UUID, activityType string, detail *string) {
	uid := pgtype.UUID{}
	if userID != nil {
		uid = pgtype.UUID{Bytes: *userID, Valid: true}
	}
	if _, err := s.q.CreateLeadActivity(ctx, sqlcgen.CreateLeadActivityParams{
		LeadID: leadID, UserID: uid, ActivityType: activityType, Detail: detail,
	}); err != nil {
		s.logger.Warn("recording lead activity failed", "lead_id", leadID, "err", err)
	}
}

func (s *LeadService) writeAudit(ctx context.Context, companyID uuid.UUID, userID *uuid.UUID, entityID uuid.UUID, action string, before, after any) {
	var beforeJSON, afterJSON []byte
	if before != nil {
		beforeJSON, _ = json.Marshal(before)
	}
	if after != nil {
		afterJSON, _ = json.Marshal(after)
	}
	uid := pgtype.UUID{}
	if userID != nil {
		uid = pgtype.UUID{Bytes: *userID, Valid: true}
	}
	_ = s.q.InsertAuditLog(ctx, sqlcgen.InsertAuditLogParams{
		CompanyID:   companyID,
		UserID:      uid,
		EntityType:  "lead",
		EntityID:    entityID,
		Action:      action,
		BeforeState: beforeJSON,
		AfterState:  afterJSON,
	})
}
