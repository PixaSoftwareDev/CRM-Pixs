-- Migration: 20260620000002_clients_documents.sql
-- Client comments and the documents (attachments) module.
--
--   contact_comments → editable comments on a contact (vs. immutable contact_notes)
--   documents        → polymorphic attachments stored on local disk, linked to a
--                      contact or a task. The bytes live on disk under PIXS_STORAGE_DIR;
--                      this table holds metadata only.

-- ─── contact_comments (editable, soft-delete) ──────────────────────────────────
-- Unlike contact_notes (append-only facts), comments can be edited and removed.
CREATE TABLE contact_comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID        NOT NULL REFERENCES contacts(id),
    user_id    UUID        NOT NULL REFERENCES users(id),
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX contact_comments_contact_idx
    ON contact_comments (contact_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- ─── documents (polymorphic attachments, metadata only) ─────────────────────────
-- entity_type identifies the owner table ('contact' | 'task'); entity_id its row.
-- The file content is stored on disk at storage_key (path relative to PIXS_STORAGE_DIR).
CREATE TABLE documents (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID         NOT NULL REFERENCES companies(id),
    entity_type  VARCHAR(20)  NOT NULL,
    entity_id    UUID         NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(150) NOT NULL,
    size_bytes   BIGINT       NOT NULL,
    storage_key  VARCHAR(500) NOT NULL,
    uploaded_by  UUID         NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    CONSTRAINT documents_entity_type_valid CHECK (entity_type IN ('contact','task'))
);

CREATE INDEX documents_entity_idx
    ON documents (company_id, entity_type, entity_id, created_at DESC)
    WHERE deleted_at IS NULL;
