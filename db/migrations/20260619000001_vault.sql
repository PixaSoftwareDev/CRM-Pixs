-- ─── Vault — datos sensibles cifrados ────────────────────────────────────────
CREATE TABLE vault_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id),
    created_by  UUID NOT NULL REFERENCES users(id),
    category    VARCHAR(50)  NOT NULL DEFAULT 'general',
    label       VARCHAR(200) NOT NULL,
    username    TEXT,
    secret      BYTEA,          -- AES-256-GCM encrypted value
    url         VARCHAR(2000),
    notes       TEXT,
    tags        TEXT[],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT vault_entries_category_check CHECK (
        category IN ('credencial','api_key','servidor','base_datos','correo','certificado','general')
    )
);
CREATE INDEX ON vault_entries (company_id, category) WHERE deleted_at IS NULL;
CREATE INDEX ON vault_entries (company_id, label)    WHERE deleted_at IS NULL;

-- Permission
INSERT INTO permissions (id, module, action, description) VALUES
    ('e0000040-0000-4000-8000-000000000001', 'vault', 'view',   'Ver entradas del vault'),
    ('e0000040-0000-4000-8000-000000000002', 'vault', 'manage', 'Crear/editar/eliminar entradas del vault')
ON CONFLICT (module, action) DO NOTHING;
