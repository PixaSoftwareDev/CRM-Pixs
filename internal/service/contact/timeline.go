package contact

import (
	"context"
	"sort"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	sqlcgen "pixs/internal/repository/sqlc"
)

// TimelineEvent is a unified chronological entry for a contact's activity log.
// The Kind field discriminates the source; Meta allows extension by other modules
// (invoices, receipts, opportunities) without changing this struct.
type TimelineEvent struct {
	ID         uuid.UUID      `json:"id"`
	Kind       string         `json:"kind"` // "note" | "calendar_event" | "opportunity" | "task"
	OccurredAt time.Time      `json:"timestamp"`
	Title      string         `json:"title"`
	Body       *string        `json:"body"`
	UserID     *uuid.UUID     `json:"user_id"`
	Meta       map[string]any `json:"meta"`
}

// GetTimeline returns a unified timeline for a contact, sorted newest-first.
// Current sources: contact notes and calendar events.
// Future modules (invoices, opportunities) can add their own sources by
// extending this method or registering a TimelineSource.
func (s *ContactService) GetTimeline(ctx context.Context, companyID, contactID uuid.UUID) ([]*TimelineEvent, error) {
	var events []*TimelineEvent

	// Source 1: contact notes.
	notes, err := s.q.ListContactNotes(ctx, contactID)
	if err != nil {
		return nil, errors.Wrap(err, "loading notes for timeline")
	}
	for _, n := range notes {
		uid := n.UserID
		e := &TimelineEvent{
			ID:         n.ID,
			Kind:       "note",
			OccurredAt: n.CreatedAt.Time,
			Title:      "Nota",
			Body:       &n.Body,
			UserID:     &uid,
		}
		events = append(events, e)
	}

	// Source 2: calendar events for this contact.
	calEvents, err := s.q.ListCalendarEventsForContact(ctx, sqlcgen.ListCalendarEventsForContactParams{
		CompanyID: companyID,
		ContactID: pgtype.UUID{Bytes: contactID, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading calendar events for timeline")
	}
	for _, ce := range calEvents {
		uid := ce.AssignedUserID
		e := &TimelineEvent{
			ID:         ce.ID,
			Kind:       "calendar_event",
			OccurredAt: ce.StartsAt.Time,
			Title:      ce.Title,
			UserID:     &uid,
			Meta:       map[string]any{"status": ce.Status},
		}
		if ce.Notes != nil {
			e.Body = ce.Notes
		}
		events = append(events, e)
	}

	// Source 3: opportunities for this contact.
	opps, err := s.q.ListOpportunities(ctx, sqlcgen.ListOpportunitiesParams{
		CompanyID: companyID,
		ContactID: pgtype.UUID{Bytes: contactID, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading opportunities for timeline")
	}
	for _, o := range opps {
		e := &TimelineEvent{
			ID:         o.ID,
			Kind:       "opportunity",
			OccurredAt: o.CreatedAt.Time,
			Title:      o.Title,
			Meta:       map[string]any{"stage_id": o.StageID.String()},
		}
		if o.AssignedUserID.Valid {
			uid := uuid.UUID(o.AssignedUserID.Bytes)
			e.UserID = &uid
		}
		events = append(events, e)
	}

	// Source 4: tasks linked to this contact.
	tasks, err := s.q.ListTasks(ctx, sqlcgen.ListTasksParams{
		CompanyID: companyID,
		ContactID: pgtype.UUID{Bytes: contactID, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading tasks for timeline")
	}
	for _, tk := range tasks {
		e := &TimelineEvent{
			ID:         tk.ID,
			Kind:       "task",
			OccurredAt: tk.CreatedAt.Time,
			Title:      tk.Title,
			Body:       tk.Description,
			Meta:       map[string]any{"status": tk.Status, "priority": tk.Priority},
		}
		if tk.AssigneeID.Valid {
			uid := uuid.UUID(tk.AssigneeID.Bytes)
			e.UserID = &uid
		}
		events = append(events, e)
	}

	// Source 5: invoices issued to this contact.
	invoices, err := s.q.ListInvoices(ctx, sqlcgen.ListInvoicesParams{
		CompanyID: companyID,
		ContactID: pgtype.UUID{Bytes: contactID, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading invoices for timeline")
	}
	for _, inv := range invoices {
		e := &TimelineEvent{
			ID:         inv.ID,
			Kind:       "invoice_issued",
			OccurredAt: inv.IssueDate.Time,
			Title:      "Factura " + inv.InvoiceType,
			Meta: map[string]any{
				"status":   inv.Status,
				"currency": inv.Currency,
			},
		}
		events = append(events, e)
	}

	// Source 6: receipts for this contact.
	receipts, err := s.q.ListReceipts(ctx, sqlcgen.ListReceiptsParams{
		CompanyID: companyID,
		ContactID: pgtype.UUID{Bytes: contactID, Valid: true},
	})
	if err != nil {
		return nil, errors.Wrap(err, "loading receipts for timeline")
	}
	for _, r := range receipts {
		e := &TimelineEvent{
			ID:         r.ID,
			Kind:       "receipt",
			OccurredAt: r.Date.Time,
			Title:      "Recibo",
			Meta:       map[string]any{"currency": r.Currency},
		}
		events = append(events, e)
	}

	// Sort newest-first.
	sort.Slice(events, func(i, j int) bool {
		return events[i].OccurredAt.After(events[j].OccurredAt)
	})

	return events, nil
}
