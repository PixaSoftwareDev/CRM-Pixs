-- Migration: 20260620000001_contacts_industries_postal.sql
-- Contacts module enhancements:
--   industries    → company-scoped catalog of rubros (creatable, used to filter contacts)
--   postal_codes  → reference catalog: CP → province / locality / phone prefix (read-only)
--
-- The contact's rubro keeps living in contacts.industry (text) so list/display and
-- full-text search stay unchanged; `industries` only provides the selectable catalog
-- and filtering is done by exact name match.

-- ─── industries (rubros) ────────────────────────────────────────────────────────
CREATE TABLE industries (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID         NOT NULL REFERENCES companies(id),
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- One rubro name per company (case-insensitive), soft-delete aware.
CREATE UNIQUE INDEX industries_company_name_unique
    ON industries (company_id, lower(name))
    WHERE deleted_at IS NULL;

-- ─── postal_codes (reference catalog) ───────────────────────────────────────────
-- Argentine postal codes. A 4-digit CP can map to several localities, so the
-- table is keyed by (postal_code, locality). phone_prefix is best-effort: it is
-- only populated for major cities; NULL elsewhere.
CREATE TABLE postal_codes (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    postal_code  VARCHAR(8)   NOT NULL,
    locality     VARCHAR(150) NOT NULL,
    province     VARCHAR(100) NOT NULL,
    phone_prefix VARCHAR(5),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup by CP (the autocomplete query path).
CREATE INDEX postal_codes_cp_idx ON postal_codes (postal_code);

-- Avoid duplicate (cp, locality) rows when (re)seeding.
CREATE UNIQUE INDEX postal_codes_cp_locality_unique
    ON postal_codes (postal_code, locality);
