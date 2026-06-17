-- Migration: 20260617000001_init_identity
-- Identity & Auth schema: companies, users, roles, permissions, sessions, audit_logs.
--
-- What lives here:
--   - All table definitions
--   - 57 system permissions (module+action catalog — defines the system capability
--     surface, has no company dependency, never changes at runtime)
--
-- What lives in `make seed`:
--   - Company seed record (tenant data)
--   - 7 system roles (require company_id, therefore tenant-scoped)
--   - RBAC matrix in role_permissions (depend on role UUIDs from seed)
--   - Dev admin user

-- ─── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── companies ─────────────────────────────────────────────────────────────────
CREATE TABLE companies (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name          VARCHAR(200) NOT NULL,
    fantasy_name        VARCHAR(200) NOT NULL,
    cuit                CHAR(13),
    vat_condition       VARCHAR(30)  CHECK (vat_condition IN ('ri','monotributo','exempt','final_consumer')),
    fiscal_address      TEXT,
    city                VARCHAR(100),
    province            VARCHAR(100),
    postal_code         VARCHAR(10),
    logo_key            VARCHAR(500),
    gross_income        VARCHAR(50),
    activity_start_date DATE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

-- ─── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID         NOT NULL REFERENCES companies(id),
    email                 CITEXT       NOT NULL,
    password_hash         TEXT         NOT NULL,
    full_name             VARCHAR(200) NOT NULL,
    is_active             BOOLEAN      NOT NULL DEFAULT true,
    cost_rate             NUMERIC(15,2),
    cost_rate_currency    CHAR(3),
    totp_secret_encrypted BYTEA,
    totp_enabled          BOOLEAN      NOT NULL DEFAULT false,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ
);

CREATE UNIQUE INDEX users_company_email_uidx
    ON users (company_id, email)
    WHERE deleted_at IS NULL;

CREATE INDEX users_company_id_idx
    ON users (company_id)
    WHERE deleted_at IS NULL;

-- ─── user_cost_rates ───────────────────────────────────────────────────────────
CREATE TABLE user_cost_rates (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id),
    cost_rate      NUMERIC(15,2) NOT NULL,
    currency       CHAR(3)     NOT NULL,
    effective_from DATE        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_cost_rates_user_id_idx
    ON user_cost_rates (user_id, effective_from DESC);

-- ─── roles ─────────────────────────────────────────────────────────────────────
CREATE TABLE roles (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID         NOT NULL REFERENCES companies(id),
    name        VARCHAR(50)  NOT NULL,
    description TEXT,
    is_system   BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

-- ─── permissions ───────────────────────────────────────────────────────────────
-- System capability catalog. No company_id — permissions are global to the system.
-- These are seeded here because they define what the application can authorize;
-- they never change at runtime and have no tenant dependency.
CREATE TABLE permissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    module      VARCHAR(50) NOT NULL,
    action      VARCHAR(50) NOT NULL,
    description TEXT,
    UNIQUE (module, action)
);

INSERT INTO permissions (id, module, action, description) VALUES
    ('e0000001-0000-4000-8000-000000000001', 'contacts',          'view',              'Ver contactos'),
    ('e0000001-0000-4000-8000-000000000002', 'contacts',          'create',            'Crear contactos'),
    ('e0000001-0000-4000-8000-000000000003', 'contacts',          'edit',              'Editar contactos'),
    ('e0000001-0000-4000-8000-000000000004', 'contacts',          'delete',            'Eliminar contactos'),
    ('e0000001-0000-4000-8000-000000000005', 'contacts',          'export',            'Exportar contactos'),
    ('e0000002-0000-4000-8000-000000000001', 'pipeline',          'view',              'Ver oportunidades'),
    ('e0000002-0000-4000-8000-000000000002', 'pipeline',          'view_all',          'Ver oportunidades de todos'),
    ('e0000002-0000-4000-8000-000000000003', 'pipeline',          'create',            'Crear oportunidades'),
    ('e0000002-0000-4000-8000-000000000004', 'pipeline',          'edit',              'Editar oportunidades'),
    ('e0000003-0000-4000-8000-000000000001', 'quotes',            'view',              'Ver presupuestos'),
    ('e0000003-0000-4000-8000-000000000002', 'quotes',            'create',            'Crear presupuestos'),
    ('e0000003-0000-4000-8000-000000000003', 'quotes',            'edit',              'Editar presupuestos'),
    ('e0000003-0000-4000-8000-000000000004', 'quotes',            'approve',           'Aprobar presupuestos'),
    ('e0000004-0000-4000-8000-000000000001', 'projects',          'view',              'Ver proyectos'),
    ('e0000004-0000-4000-8000-000000000002', 'projects',          'create',            'Crear proyectos'),
    ('e0000004-0000-4000-8000-000000000003', 'projects',          'edit',              'Editar proyectos'),
    ('e0000004-0000-4000-8000-000000000004', 'projects',          'view_profitability','Ver rentabilidad de proyectos'),
    ('e0000005-0000-4000-8000-000000000001', 'tasks',             'view',              'Ver tareas'),
    ('e0000005-0000-4000-8000-000000000002', 'tasks',             'view_all',          'Ver todas las tareas'),
    ('e0000005-0000-4000-8000-000000000003', 'tasks',             'create',            'Crear tareas'),
    ('e0000005-0000-4000-8000-000000000004', 'tasks',             'edit',              'Editar tareas'),
    ('e0000005-0000-4000-8000-000000000005', 'tasks',             'assign',            'Asignar tareas a otros'),
    ('e0000006-0000-4000-8000-000000000001', 'time_tracking',     'view_own',          'Ver entradas de tiempo propias'),
    ('e0000006-0000-4000-8000-000000000002', 'time_tracking',     'view_all',          'Ver entradas de tiempo de todos'),
    ('e0000006-0000-4000-8000-000000000003', 'time_tracking',     'export',            'Exportar time tracking'),
    ('e0000007-0000-4000-8000-000000000001', 'invoices_issued',   'view',              'Ver facturas emitidas'),
    ('e0000007-0000-4000-8000-000000000002', 'invoices_issued',   'create',            'Crear borradores de facturas'),
    ('e0000007-0000-4000-8000-000000000003', 'invoices_issued',   'edit',              'Editar borradores de facturas'),
    ('e0000007-0000-4000-8000-000000000004', 'invoices_issued',   'emit',              'Emitir facturas'),
    ('e0000007-0000-4000-8000-000000000005', 'invoices_issued',   'void',              'Anular facturas'),
    ('e0000007-0000-4000-8000-000000000006', 'invoices_issued',   'export',            'Exportar facturas emitidas'),
    ('e0000008-0000-4000-8000-000000000001', 'invoices_received', 'view',              'Ver facturas recibidas'),
    ('e0000008-0000-4000-8000-000000000002', 'invoices_received', 'create',            'Cargar facturas recibidas'),
    ('e0000008-0000-4000-8000-000000000003', 'invoices_received', 'edit',              'Editar facturas recibidas'),
    ('e0000009-0000-4000-8000-000000000001', 'receipts',          'view',              'Ver recibos'),
    ('e0000009-0000-4000-8000-000000000002', 'receipts',          'create',            'Crear recibos'),
    ('e0000009-0000-4000-8000-000000000003', 'receipts',          'void',              'Anular recibos'),
    ('e000000a-0000-4000-8000-000000000001', 'cash_registers',    'view',              'Ver saldo de cajas'),
    ('e000000a-0000-4000-8000-000000000002', 'cash_registers',    'create_movement',   'Crear movimientos de caja'),
    ('e000000a-0000-4000-8000-000000000003', 'cash_registers',    'reconcile',         'Realizar arqueo de caja'),
    ('e000000b-0000-4000-8000-000000000001', 'banks',             'view',              'Ver cuentas bancarias'),
    ('e000000b-0000-4000-8000-000000000002', 'banks',             'reconcile',         'Conciliar extractos bancarios'),
    ('e000000c-0000-4000-8000-000000000001', 'expenses',          'create',            'Cargar gastos propios'),
    ('e000000c-0000-4000-8000-000000000002', 'expenses',          'approve',           'Aprobar gastos'),
    ('e000000c-0000-4000-8000-000000000003', 'expenses',          'view',              'Ver todos los gastos'),
    ('e000000d-0000-4000-8000-000000000001', 'cash_flow',         'view',              'Ver flujo de caja'),
    ('e000000e-0000-4000-8000-000000000001', 'leads',             'view',              'Ver leads propios'),
    ('e000000e-0000-4000-8000-000000000002', 'leads',             'view_all',          'Ver todos los leads'),
    ('e000000e-0000-4000-8000-000000000003', 'leads',             'convert',           'Convertir lead a cliente'),
    ('e000000f-0000-4000-8000-000000000001', 'scraping',          'launch',            'Lanzar jobs de scraping'),
    ('e000000f-0000-4000-8000-000000000002', 'scraping',          'view_costs',        'Ver costos de scraping'),
    ('e0000010-0000-4000-8000-000000000001', 'reports',           'view_financial',    'Ver reportes financieros'),
    ('e0000010-0000-4000-8000-000000000002', 'reports',           'view_sales',        'Ver reportes de ventas'),
    ('e0000010-0000-4000-8000-000000000003', 'reports',           'export',            'Exportar reportes'),
    ('e0000011-0000-4000-8000-000000000001', 'users',             'manage',            'Gestionar usuarios y roles'),
    ('e0000012-0000-4000-8000-000000000001', 'audit',             'view',              'Ver registros de auditoría'),
    ('e0000013-0000-4000-8000-000000000001', 'settings',          'manage',            'Gestionar configuración del sistema'),
    ('e0000014-0000-4000-8000-000000000001', 'documents',         'view',              'Ver documentos'),
    ('e0000014-0000-4000-8000-000000000002', 'documents',         'upload',            'Subir y editar documentos'),
    ('e0000014-0000-4000-8000-000000000003', 'documents',         'delete',            'Eliminar documentos')
ON CONFLICT (module, action) DO NOTHING;

-- ─── role_permissions ──────────────────────────────────────────────────────────
CREATE TABLE role_permissions (
    role_id           UUID    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id     UUID    NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    restricted_to_own BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (role_id, permission_id)
);

-- ─── user_roles ─────────────────────────────────────────────────────────────────
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ─── sessions ───────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id   UUID        NOT NULL REFERENCES companies(id),
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX sessions_user_active_idx
    ON sessions (user_id, created_at DESC)
    WHERE revoked_at IS NULL;

-- ─── password_reset_tokens ──────────────────────────────────────────────────────
CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- ─── email_verification_tokens ──────────────────────────────────────────────────
CREATE TABLE email_verification_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── totp_backup_codes ──────────────────────────────────────────────────────────
CREATE TABLE totp_backup_codes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT        NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX totp_backup_codes_user_idx
    ON totp_backup_codes (user_id)
    WHERE used_at IS NULL;

-- ─── api_keys ───────────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID         NOT NULL REFERENCES companies(id),
    name         VARCHAR(100) NOT NULL,
    key_prefix   VARCHAR(8)   NOT NULL,
    key_hash     TEXT         NOT NULL UNIQUE,
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_company_idx
    ON api_keys (company_id)
    WHERE revoked_at IS NULL;

-- ─── audit_logs (partitioned by month) ─────────────────────────────────────────
-- Append-only. No deleted_at, no updated_at.
CREATE TABLE audit_logs (
    id          BIGSERIAL,
    company_id  UUID        NOT NULL,
    user_id     UUID,
    ip_address  INET,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id   UUID        NOT NULL,
    action      VARCHAR(30) NOT NULL CHECK (action IN (
        'create','update','delete','restore','export',
        'login','logout','enable_2fa','disable_2fa','revoke_session'
    )),
    before_state JSONB,
    after_state  JSONB,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE INDEX audit_logs_entity_idx
    ON audit_logs (entity_type, entity_id, timestamp DESC);
CREATE INDEX audit_logs_company_user_idx
    ON audit_logs (company_id, user_id, timestamp DESC);
