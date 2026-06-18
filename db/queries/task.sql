-- name: CreateTask :one
INSERT INTO tasks (
    company_id, type, title, description, contact_id, project_id,
    assignee_id, reporter_id, origin, status, priority, due_date, parent_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetTaskByID :one
SELECT * FROM tasks WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListTasks :many
SELECT * FROM tasks
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND ($2::text = '' OR status = $2)
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('contact_id')::uuid IS NULL OR contact_id = sqlc.narg('contact_id'))
  AND (sqlc.narg('due_date')::date IS NULL OR due_date <= sqlc.narg('due_date'))
ORDER BY
    CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
    due_date NULLS LAST,
    created_at DESC;

-- name: UpdateTask :one
UPDATE tasks SET
    type = $3, title = $4, description = $5, contact_id = $6,
    project_id = $7, priority = $8, due_date = $9, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateTaskStatus :one
UPDATE tasks SET
    status = sqlc.arg(new_status)::text, assignee_id = sqlc.narg(assignee_id),
    resolved_at = CASE WHEN sqlc.arg(new_status)::text = 'resolved' AND resolved_at IS NULL THEN now() ELSE resolved_at END,
    closed_at   = CASE WHEN sqlc.arg(new_status)::text = 'closed'   AND closed_at   IS NULL THEN now() ELSE closed_at   END,
    updated_at  = now()
WHERE id = sqlc.arg(id) AND company_id = sqlc.arg(company_id) AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteTask :exec
UPDATE tasks SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: CreateTaskComment :one
INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *;

-- name: ListTaskComments :many
SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC;

-- name: RecordTaskHistory :one
INSERT INTO task_status_history (task_id, user_id, from_status, to_status, from_assignee, to_assignee)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetTaskHistory :many
SELECT * FROM task_status_history WHERE task_id = $1 ORDER BY created_at ASC;

-- name: StartTaskTimer :one
INSERT INTO task_time_entries (task_id, user_id, started_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: StopTaskTimer :one
UPDATE task_time_entries SET
    ended_at = $3,
    duration_minutes = CEIL(EXTRACT(EPOCH FROM ($3 - started_at)) / 60)::INT
WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
RETURNING *;

-- name: GetOpenTimer :one
SELECT * FROM task_time_entries
WHERE user_id = $1 AND ended_at IS NULL
ORDER BY started_at DESC LIMIT 1;

-- name: GetOpenTimerForTask :one
SELECT * FROM task_time_entries
WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL
ORDER BY started_at DESC LIMIT 1;
