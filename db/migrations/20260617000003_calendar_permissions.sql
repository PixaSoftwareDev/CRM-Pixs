-- Migration: 20260617000003_calendar_permissions.sql
-- Adds calendar/view and calendar/manage to the system permissions catalog.
--
-- Role assignments go in `make seed` (seed/main.go seedRBACMatrix), since
-- role_permissions are tenant-scoped (depend on company-scoped role UUIDs).

INSERT INTO permissions (id, module, action, description) VALUES
    ('e0000015-0000-4000-8000-000000000001', 'calendar', 'view',   'Ver eventos de calendario'),
    ('e0000015-0000-4000-8000-000000000002', 'calendar', 'manage', 'Crear y editar eventos de calendario')
ON CONFLICT (module, action) DO NOTHING;
