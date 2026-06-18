-- Migration: 20260618000001_leads_scraping
-- Leads + Scraping module.
--
-- Contains application tables only. River's job-queue tables are managed by
-- River's own migration system (run programmatically at worker startup via
-- rivermigrate). They are intentionally NOT defined here.

-- ─── Scraping Jobs ────────────────────────────────────────────────────────────
CREATE TABLE scraping_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    query               TEXT NOT NULL,
    result_count_requested INT NOT NULL,
    country             CHAR(2),
    language            CHAR(5),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    search_api_cost_usd NUMERIC(10,6),
    llm_tokens_input    INT,
    llm_tokens_output   INT,
    llm_cost_usd        NUMERIC(10,6),
    total_cost_usd      NUMERIC(10,6),
    urls_processed      INT NOT NULL DEFAULT 0,
    leads_found         INT NOT NULL DEFAULT 0,
    error_summary       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT scraping_jobs_status_check CHECK (status IN ('pending','running','completed','failed','cancelled'))
);
CREATE INDEX ON scraping_jobs (company_id, created_at DESC);

-- ─── Leads ────────────────────────────────────────────────────────────────────
CREATE TABLE leads (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID NOT NULL REFERENCES companies(id),
    company_name         VARCHAR(200) NOT NULL,
    description          TEXT,
    what_they_do         TEXT,
    source_url           VARCHAR(2000),
    website              VARCHAR(500),
    industry             VARCHAR(100),
    approximate_size     VARCHAR(50),
    city                 VARCHAR(100),
    country              CHAR(2),
    language             CHAR(5),
    assigned_to          UUID REFERENCES users(id),
    status               VARCHAR(20) NOT NULL DEFAULT 'new',
    rejection_reason     TEXT,
    follow_up_date       DATE,
    scraping_job_id      UUID REFERENCES scraping_jobs(id),
    converted_contact_id UUID REFERENCES contacts(id),
    llm_extraction_failed BOOLEAN NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    CONSTRAINT leads_status_check CHECK (status IN ('new','contacted','following','qualified','converted','rejected','waiting'))
);
CREATE INDEX ON leads (company_id, status, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX ON leads (scraping_job_id) WHERE scraping_job_id IS NOT NULL;
CREATE INDEX ON leads (company_id, created_at DESC) WHERE deleted_at IS NULL;

-- Add FK from opportunities.lead_id (column was added in the sales migration, no FK yet).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'opportunities_lead_id_fkey'
    ) THEN
        ALTER TABLE opportunities ADD CONSTRAINT opportunities_lead_id_fkey
            FOREIGN KEY (lead_id) REFERENCES leads(id);
    END IF;
END$$;

-- ─── Lead sub-tables ─────────────────────────────────────────────────────────
CREATE TABLE lead_emails (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id),
    email      VARCHAR(254) NOT NULL,
    context    VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON lead_emails (lead_id);

CREATE TABLE lead_phones (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id),
    phone      VARCHAR(20) NOT NULL,
    type       VARCHAR(20) NOT NULL DEFAULT 'unknown',
    country    CHAR(2),
    context    VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lead_phones_type_check CHECK (type IN ('mobile','landline','tollfree','unknown'))
);
CREATE INDEX ON lead_phones (lead_id);

CREATE TABLE lead_socials (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id),
    platform   VARCHAR(20) NOT NULL,
    handle     VARCHAR(100),
    url        VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lead_socials_platform_check CHECK (platform IN ('instagram','linkedin','facebook','tiktok','youtube','whatsapp'))
);
CREATE INDEX ON lead_socials (lead_id);

CREATE TABLE lead_activities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id       UUID NOT NULL REFERENCES leads(id),
    user_id       UUID REFERENCES users(id),
    activity_type VARCHAR(30) NOT NULL,
    detail        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lead_activities_type_check CHECK (activity_type IN ('created','status_changed','note','contacted','assigned'))
);
CREATE INDEX ON lead_activities (lead_id, created_at DESC);

-- ─── Leads + Scraping permissions ────────────────────────────────────────────
-- The init migration already declares leads/view, leads/view_all, leads/convert,
-- scraping/launch and scraping/view_costs. Here we add the remaining capabilities
-- needed by this module. ON CONFLICT keeps this idempotent and avoids clashing
-- with the pre-existing rows.
INSERT INTO permissions (id, module, action, description) VALUES
    ('e0000030-0000-4000-8000-000000000003', 'leads',    'create', 'Crear leads'),
    ('e0000030-0000-4000-8000-000000000004', 'leads',    'edit',   'Editar leads'),
    ('e0000030-0000-4000-8000-000000000005', 'leads',    'assign', 'Asignar leads'),
    ('e0000031-0000-4000-8000-000000000001', 'scraping', 'run',    'Ejecutar scraping'),
    ('e0000031-0000-4000-8000-000000000002', 'scraping', 'view',   'Ver jobs de scraping')
ON CONFLICT (module, action) DO NOTHING;
