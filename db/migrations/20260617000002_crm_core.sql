-- Migration: 20260617000002_crm_core.sql
-- CRM core: contacts, persons, bank accounts, notes, balances, tags, calendar.
--
-- All domain tables carry: company_id, created_at, updated_at, deleted_at.
-- Exceptions (append-only / join / materialized):
--   contact_notes  → only created_at (facts are immutable)
--   contact_balances → only updated_at (maintained by finance module, no soft-delete)
--   contact_tags   → no timestamps (pure join)

-- ─── contacts ──────────────────────────────────────────────────────────────────
CREATE TABLE contacts (
    id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID          NOT NULL REFERENCES companies(id),
    kind                        TEXT[]        NOT NULL,
    fantasy_name                VARCHAR(200)  NOT NULL,
    legal_name                  VARCHAR(200),
    cuit_cuil                   CHAR(13),
    vat_condition               VARCHAR(30)   CHECK (vat_condition IN ('ri','monotributo','exempt','final_consumer')),
    fiscal_address              TEXT,
    city                        VARCHAR(100),
    province                    VARCHAR(100),
    postal_code                 VARCHAR(10),
    email                       VARCHAR(254),
    phone                       VARCHAR(20),
    website                     VARCHAR(500),
    industry                    VARCHAR(100),
    source                      VARCHAR(100),
    default_payment_condition_id UUID,        -- FK to payment_conditions (table added by finance module)
    credit_limit                NUMERIC(15,2),
    usual_discount_pct          NUMERIC(5,2)  NOT NULL DEFAULT 0,
    assigned_user_id            UUID          REFERENCES users(id),
    lifecycle_status            VARCHAR(30)   NOT NULL DEFAULT 'prospect',
    search_vector               tsvector GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce(fantasy_name, '') || ' ' ||
            coalesce(legal_name, '') || ' ' ||
            coalesce(email, '')
        )
    ) STORED,
    created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ,
    CONSTRAINT contacts_kind_valid CHECK (
        kind <@ ARRAY['client','supplier','prospect','lead']::TEXT[]
        AND array_length(kind, 1) >= 1
    ),
    CONSTRAINT contacts_lifecycle_valid CHECK (
        lifecycle_status IN ('prospect','lead','opportunity','active_client','lost','supplier')
    )
);

-- Partial unique index: CUIT/CUIL unique per company for non-deleted contacts.
CREATE UNIQUE INDEX contacts_cuit_unique
    ON contacts (company_id, cuit_cuil)
    WHERE deleted_at IS NULL AND cuit_cuil IS NOT NULL;

-- Name prefix search (text_pattern_ops enables LIKE 'prefix%' via index).
CREATE INDEX contacts_company_name_idx
    ON contacts (company_id, fantasy_name text_pattern_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX contacts_assigned_user_idx
    ON contacts (assigned_user_id)
    WHERE deleted_at IS NULL;

-- Full-text search index.
CREATE INDEX contacts_search_idx ON contacts USING GIN (search_vector);

-- ─── contact_persons ───────────────────────────────────────────────────────────
CREATE TABLE contact_persons (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID          NOT NULL REFERENCES contacts(id),
    name       VARCHAR(200)  NOT NULL,
    role       VARCHAR(100),
    email      VARCHAR(254),
    phone      VARCHAR(20),
    notes      TEXT,
    birthday   DATE,
    is_primary BOOLEAN       NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Only one primary person per contact.
CREATE UNIQUE INDEX contact_persons_primary_idx
    ON contact_persons (contact_id)
    WHERE is_primary = true AND deleted_at IS NULL;

CREATE INDEX contact_persons_contact_idx
    ON contact_persons (contact_id)
    WHERE deleted_at IS NULL;

-- ─── contact_bank_accounts ─────────────────────────────────────────────────────
-- CBU/CVU is stored ONLY in encrypted_cbu (AES-256-GCM, key=PIXS_ENCRYPTION_KEY).
-- cbu_cvu stores the last-4-digits masked hint (e.g. "****1234") for display only.
-- This ensures no CBU ever exists in plaintext at rest.
CREATE TABLE contact_bank_accounts (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id     UUID          NOT NULL REFERENCES contacts(id),
    cbu_cvu        VARCHAR(22),            -- masked display hint (last 4 digits)
    alias          VARCHAR(50),
    bank_name      VARCHAR(100),
    account_holder VARCHAR(200),
    currency       CHAR(3)       NOT NULL DEFAULT 'ARS',
    encrypted_cbu  BYTEA,                  -- AES-256-GCM encrypted full CBU/CVU
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);

CREATE INDEX contact_bank_accounts_contact_idx
    ON contact_bank_accounts (contact_id)
    WHERE deleted_at IS NULL;

-- ─── contact_notes (append-only) ───────────────────────────────────────────────
-- Notes are immutable facts. No update, no soft-delete.
CREATE TABLE contact_notes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID        NOT NULL REFERENCES contacts(id),
    user_id    UUID        NOT NULL REFERENCES users(id),
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contact_notes_contact_idx ON contact_notes (contact_id, created_at DESC);

-- ─── contact_balances (materialized, maintained by finance module) ──────────────
-- This table is updated by invoice/receipt/payment modules; the CRM module
-- only reads it. Do NOT write to this table from the contact service.
CREATE TABLE contact_balances (
    contact_id UUID          NOT NULL REFERENCES contacts(id),
    currency   CHAR(3)       NOT NULL,
    balance    NUMERIC(15,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, currency)
);

-- ─── tags ─────────────────────────────────────────────────────────────────────
CREATE TABLE tags (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID         NOT NULL REFERENCES companies(id),
    name       VARCHAR(50)  NOT NULL,
    color      CHAR(7),
    area       VARCHAR(30)  CHECK (area IN ('ventas','cobranzas','soporte','desarrollo') OR area IS NULL),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

-- ─── contact_tags (join, no timestamps) ────────────────────────────────────────
CREATE TABLE contact_tags (
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, tag_id)
);

-- ─── calendar_event_types ──────────────────────────────────────────────────────
CREATE TABLE calendar_event_types (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID         NOT NULL REFERENCES companies(id),
    name       VARCHAR(50)  NOT NULL,
    color      CHAR(7)      NOT NULL,
    icon       VARCHAR(50),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

-- ─── calendar_events ──────────────────────────────────────────────────────────
CREATE TABLE calendar_events (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID          NOT NULL REFERENCES companies(id),
    title                 VARCHAR(200)  NOT NULL,
    event_type_id         UUID          REFERENCES calendar_event_types(id),
    contact_id            UUID          REFERENCES contacts(id),
    assigned_user_id      UUID          NOT NULL REFERENCES users(id),
    starts_at             TIMESTAMPTZ   NOT NULL,
    ends_at               TIMESTAMPTZ,
    all_day               BOOLEAN       NOT NULL DEFAULT false,
    status                VARCHAR(20)   NOT NULL DEFAULT 'pending',
    notes                 TEXT,
    related_task_id       UUID,         -- FK to tasks (added by project module)
    related_opportunity_id UUID,        -- FK to pipeline (added by pipeline module)
    related_project_id    UUID,         -- FK to projects (added by project module)
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ,
    CONSTRAINT calendar_events_status_valid CHECK (
        status IN ('pending','done','rescheduled','cancelled')
    )
);

CREATE INDEX calendar_events_company_starts_idx
    ON calendar_events (company_id, starts_at)
    WHERE deleted_at IS NULL;

CREATE INDEX calendar_events_user_starts_idx
    ON calendar_events (assigned_user_id, starts_at)
    WHERE deleted_at IS NULL;

CREATE INDEX calendar_events_contact_idx
    ON calendar_events (contact_id)
    WHERE deleted_at IS NULL;
