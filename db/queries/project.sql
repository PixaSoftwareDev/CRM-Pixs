-- name: CreateProject :one
INSERT INTO projects (
    company_id, client_id, name, description, start_date, estimated_end_date,
    status, responsible_id, budget_hours, budget_amount, currency, opportunity_id, quote_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetProjectByID :one
SELECT * FROM projects WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListProjects :many
SELECT * FROM projects
WHERE company_id = $1
  AND deleted_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR client_id = sqlc.narg('client_id'))
  AND (sqlc.narg('responsible_id')::uuid IS NULL OR responsible_id = sqlc.narg('responsible_id'))
  AND ($2::text = '' OR status = $2)
ORDER BY created_at DESC;

-- name: UpdateProject :one
UPDATE projects SET
    client_id = $3, name = $4, description = $5, start_date = $6,
    estimated_end_date = $7, actual_end_date = $8, status = $9,
    responsible_id = $10, budget_hours = $11, budget_amount = $12,
    currency = $13, opportunity_id = $14, quote_id = $15, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProject :exec
UPDATE projects SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: CreateMilestone :one
INSERT INTO project_milestones (project_id, name, description, deliverables, committed_date, status, order_pos)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetMilestoneByID :one
SELECT * FROM project_milestones WHERE id = $1 AND deleted_at IS NULL;

-- name: ListMilestones :many
SELECT * FROM project_milestones
WHERE project_id = $1 AND deleted_at IS NULL
ORDER BY order_pos NULLS LAST, created_at;

-- name: UpdateMilestone :one
UPDATE project_milestones SET
    name = $3, description = $4, deliverables = $5, committed_date = $6,
    status = $7, order_pos = $8, updated_at = now()
WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteMilestone :exec
UPDATE project_milestones SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL;

-- name: AddProjectMember :exec
INSERT INTO project_members (project_id, user_id, role_in_project)
VALUES ($1, $2, $3)
ON CONFLICT (project_id, user_id) DO UPDATE SET role_in_project = EXCLUDED.role_in_project;

-- name: RemoveProjectMember :exec
DELETE FROM project_members WHERE project_id = $1 AND user_id = $2;

-- name: ListProjectMembers :many
SELECT pm.project_id, pm.user_id, pm.role_in_project,
       u.full_name, u.email
FROM project_members pm
JOIN users u ON u.id = pm.user_id
WHERE pm.project_id = $1;

-- name: GetProjectTimeStats :one
SELECT
    COALESCE(SUM(duration_minutes), 0)::bigint AS total_minutes,
    COALESCE(SUM(CASE WHEN is_billable THEN duration_minutes ELSE 0 END), 0)::bigint AS billable_minutes
FROM time_entries
WHERE project_id = $1 AND company_id = $2;
