-- Calendar queries for sqlc generation.

-- ─── Calendar Event Types ──────────────────────────────────────────────────────

-- name: CreateCalendarEventType :one
INSERT INTO calendar_event_types (company_id, name, color, icon)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetCalendarEventTypeByID :one
SELECT * FROM calendar_event_types WHERE id = $1 AND company_id = $2;

-- name: ListCalendarEventTypes :many
SELECT * FROM calendar_event_types WHERE company_id = $1 ORDER BY name;

-- ─── Calendar Events ───────────────────────────────────────────────────────────

-- name: CreateCalendarEvent :one
INSERT INTO calendar_events (
    company_id, title, event_type_id, contact_id, assigned_user_id,
    starts_at, ends_at, all_day, status, notes,
    related_task_id, related_opportunity_id, related_project_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
)
RETURNING *;

-- name: GetCalendarEventByID :one
SELECT * FROM calendar_events
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListCalendarEvents :many
SELECT * FROM calendar_events
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('from_ts')::timestamptz IS NULL OR starts_at >= sqlc.narg('from_ts'))
  AND (sqlc.narg('to_ts')::timestamptz IS NULL OR starts_at <= sqlc.narg('to_ts'))
  AND (sqlc.narg('event_type_id')::uuid IS NULL OR event_type_id = sqlc.narg('event_type_id'))
  AND (sqlc.narg('contact_id')::uuid IS NULL OR contact_id = sqlc.narg('contact_id'))
  AND (sqlc.narg('assigned_user_id')::uuid IS NULL OR assigned_user_id = sqlc.narg('assigned_user_id'))
  AND ($2::text = '' OR status = $2)
ORDER BY starts_at ASC;

-- name: ListCalendarEventsForContact :many
SELECT * FROM calendar_events
WHERE company_id = $1 AND contact_id = $2 AND deleted_at IS NULL
ORDER BY starts_at DESC;

-- name: UpdateCalendarEvent :one
UPDATE calendar_events SET
    title                  = $3,
    event_type_id          = $4,
    contact_id             = $5,
    assigned_user_id       = $6,
    starts_at              = $7,
    ends_at                = $8,
    all_day                = $9,
    status                 = $10,
    notes                  = $11,
    related_task_id        = $12,
    related_opportunity_id = $13,
    related_project_id     = $14,
    updated_at             = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteCalendarEvent :exec
UPDATE calendar_events SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;
