-- Sales + Projects + Tasks + Time Tracking schema
-- NOTE: products.vat_rate_pct stores the rate % directly.
-- When the finance module adds the vat_rates table, migrate this to a FK column.

-- ─── Products ─────────────────────────────────────────────────────────────────
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    unit VARCHAR(20),
    unit_price NUMERIC(15,2),
    currency CHAR(3),
    cost NUMERIC(15,2),
    vat_rate_pct NUMERIC(5,2),
    category VARCHAR(100),
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX ON products (company_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ON products (company_id, code) WHERE deleted_at IS NULL AND code IS NOT NULL;

-- ─── Pipeline ─────────────────────────────────────────────────────────────────
CREATE TABLE pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,
    order_pos SMALLINT NOT NULL,
    color CHAR(7) NOT NULL,
    is_win BOOLEAN NOT NULL DEFAULT false,
    is_loss BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON pipeline_stages (company_id, order_pos);

CREATE TABLE lost_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    contact_id UUID NOT NULL REFERENCES contacts(id),
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(15,2),
    currency CHAR(3) NOT NULL DEFAULT 'ARS',
    probability_pct NUMERIC(5,2) CHECK (probability_pct >= 0 AND probability_pct <= 100),
    expected_close_date DATE,
    assigned_user_id UUID REFERENCES users(id),
    source VARCHAR(100),
    lost_reason_id UUID REFERENCES lost_reasons(id),
    lost_notes TEXT,
    lead_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX ON opportunities (company_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX ON opportunities (contact_id) WHERE deleted_at IS NULL;
CREATE INDEX ON opportunities (assigned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX ON opportunities (expected_close_date) WHERE deleted_at IS NULL;

-- ─── Quotes ───────────────────────────────────────────────────────────────────
-- Versioning rule: editing a quote that is in status 'sent' or 'accepted'
-- creates a new quote record with parent_id pointing to the previous version
-- and version incremented by 1. The original record is NOT modified.
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    number VARCHAR(20) NOT NULL,
    contact_id UUID NOT NULL REFERENCES contacts(id),
    opportunity_id UUID REFERENCES opportunities(id),
    user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    valid_until DATE,
    currency CHAR(3) NOT NULL,
    exchange_rate NUMERIC(12,6) NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    version SMALLINT NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES quotes(id),
    notes TEXT,
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    total NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT quotes_status_check CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired'))
);
-- Uniqueness is per (number, version): a quote keeps its number across versions,
-- so the version disambiguates the row. See the versioning rule above.
CREATE UNIQUE INDEX ON quotes (company_id, number, version) WHERE deleted_at IS NULL;
CREATE INDEX ON quotes (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON quotes (contact_id) WHERE deleted_at IS NULL;
CREATE INDEX ON quotes (opportunity_id) WHERE deleted_at IS NULL;

CREATE TABLE quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    vat_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    line_subtotal NUMERIC(15,2) NOT NULL,
    line_tax NUMERIC(15,2) NOT NULL,
    line_total NUMERIC(15,2) NOT NULL,
    order_pos SMALLINT
);

-- ─── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    client_id UUID NOT NULL REFERENCES contacts(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE,
    estimated_end_date DATE,
    actual_end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'planning',
    responsible_id UUID REFERENCES users(id),
    budget_hours NUMERIC(8,2),
    budget_amount NUMERIC(15,2),
    currency CHAR(3) NOT NULL DEFAULT 'ARS',
    opportunity_id UUID REFERENCES opportunities(id),
    quote_id UUID REFERENCES quotes(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT projects_status_check CHECK (status IN ('planning','active','paused','delivered','archived','cancelled'))
);
CREATE INDEX ON projects (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON projects (client_id) WHERE deleted_at IS NULL;
CREATE INDEX ON projects (responsible_id) WHERE deleted_at IS NULL;

CREATE TABLE project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    deliverables TEXT,
    committed_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    order_pos SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT milestones_status_check CHECK (status IN ('pending','in_progress','done','delayed'))
);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role_in_project VARCHAR(50),
    PRIMARY KEY (project_id, user_id)
);

-- ─── Tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    type VARCHAR(20) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    contact_id UUID REFERENCES contacts(id),
    project_id UUID REFERENCES projects(id),
    assignee_id UUID REFERENCES users(id),
    reporter_id UUID NOT NULL REFERENCES users(id),
    origin VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    priority VARCHAR(10) NOT NULL DEFAULT 'medium',
    due_date DATE,
    parent_id UUID REFERENCES tasks(id),
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule TEXT,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT tasks_type_check CHECK (type IN ('internal','client_ticket','subtask')),
    CONSTRAINT tasks_status_check CHECK (status IN ('open','in_progress','waiting_client','waiting_internal','resolved','closed','cancelled')),
    CONSTRAINT tasks_priority_check CHECK (priority IN ('low','medium','high','urgent'))
);
CREATE INDEX ON tasks (company_id, assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON tasks (project_id) WHERE deleted_at IS NULL;
CREATE INDEX ON tasks (contact_id) WHERE deleted_at IS NULL;
CREATE INDEX ON tasks (due_date) WHERE deleted_at IS NULL;

CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    user_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON task_comments (task_id);

CREATE TABLE task_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    user_id UUID NOT NULL REFERENCES users(id),
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    from_assignee UUID,
    to_assignee UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON task_status_history (task_id);

CREATE TABLE task_time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    user_id UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_minutes INT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON task_time_entries (task_id);
CREATE INDEX ON task_time_entries (user_id, started_at);

-- ─── Time Tracking ────────────────────────────────────────────────────────────
CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    description TEXT,
    task_id UUID REFERENCES tasks(id),
    project_id UUID REFERENCES projects(id),
    contact_id UUID REFERENCES contacts(id),
    is_billable BOOLEAN NOT NULL DEFAULT true,
    hourly_rate NUMERIC(15,2),
    currency CHAR(3),
    invoice_line_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON time_entries (company_id, user_id, date);
CREATE INDEX ON time_entries (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX ON time_entries (task_id) WHERE task_id IS NOT NULL;

-- ─── Products permissions ─────────────────────────────────────────────────────
INSERT INTO permissions (id, module, action, description) VALUES
    ('e0000016-0000-4000-8000-000000000001', 'products', 'view',   'Ver catálogo de productos'),
    ('e0000016-0000-4000-8000-000000000002', 'products', 'manage', 'Gestionar catálogo de productos')
ON CONFLICT (module, action) DO NOTHING;
