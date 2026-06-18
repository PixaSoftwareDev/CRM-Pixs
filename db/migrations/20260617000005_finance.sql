-- Finance module schema: catalogs, treasury, vouchers, obligations.
-- Money columns are NUMERIC(15,2); exchange rates NUMERIC(12,6).
-- Sequence numbering is allocated via UPDATE ... RETURNING inside a transaction.

-- ─── Catálogos ────────────────────────────────────────────────────────────────
CREATE TABLE currencies (
    code   CHAR(3)      PRIMARY KEY,
    name   VARCHAR(50)  NOT NULL,
    symbol VARCHAR(5)   NOT NULL
);
INSERT INTO currencies VALUES
    ('ARS', 'Peso argentino', '$'),
    ('USD', 'Dólar estadounidense', 'U$S');

CREATE TABLE exchange_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id),
    from_currency CHAR(3) NOT NULL REFERENCES currencies(code),
    to_currency   CHAR(3) NOT NULL REFERENCES currencies(code),
    rate          NUMERIC(12,6) NOT NULL,
    date          DATE NOT NULL,
    source        VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exchange_rate UNIQUE (company_id, from_currency, to_currency, date)
);

CREATE TABLE vat_rates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name       VARCHAR(50) NOT NULL,
    rate_pct   NUMERIC(5,2) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_conditions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name       VARCHAR(100) NOT NULL,
    days       INT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from contacts to the new payment_conditions catalog.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS payment_condition_id UUID REFERENCES payment_conditions(id);

CREATE TABLE expense_categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name       VARCHAR(100) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sequence_numbers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id),
    document_type VARCHAR(20) NOT NULL,
    sale_point    SMALLINT NOT NULL,
    last_number   INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_sequence UNIQUE (company_id, document_type, sale_point)
);

-- NOTE: company-scoped catalog rows (vat_rates, payment_conditions,
-- expense_categories, sequence_numbers) are seeded by cmd/seed, since the
-- company row itself is created there too (no company exists at migrate time).

-- ─── Tesorería ────────────────────────────────────────────────────────────────
CREATE TABLE cash_registers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES companies(id),
    name           VARCHAR(100) NOT NULL,
    currency       CHAR(3) NOT NULL REFERENCES currencies(code),
    responsible_id UUID REFERENCES users(id),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);
CREATE INDEX ON cash_registers (company_id) WHERE deleted_at IS NULL;

CREATE TABLE bank_accounts_finance (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES companies(id),
    bank_name      VARCHAR(100) NOT NULL,
    account_number VARCHAR(50),
    cbu            VARCHAR(22),
    alias          VARCHAR(50),
    currency       CHAR(3) NOT NULL REFERENCES currencies(code),
    account_holder VARCHAR(200),
    book_balance   NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);
CREATE INDEX ON bank_accounts_finance (company_id) WHERE deleted_at IS NULL;

CREATE TABLE cash_register_sessions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_register_id            UUID NOT NULL REFERENCES cash_registers(id),
    opened_by                   UUID NOT NULL REFERENCES users(id),
    opened_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by                   UUID REFERENCES users(id),
    closed_at                   TIMESTAMPTZ,
    opening_balance             NUMERIC(15,2) NOT NULL,
    declared_closing_balance    NUMERIC(15,2),
    calculated_closing_balance  NUMERIC(15,2),
    difference                  NUMERIC(15,2),
    status                      VARCHAR(10) NOT NULL DEFAULT 'open',
    CONSTRAINT sessions_status_check CHECK (status IN ('open','closed'))
);
CREATE INDEX ON cash_register_sessions (cash_register_id, status);

CREATE TABLE cash_movements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id),
    cash_register_id UUID NOT NULL REFERENCES cash_registers(id),
    session_id       UUID REFERENCES cash_register_sessions(id),
    type             VARCHAR(20) NOT NULL,
    amount           NUMERIC(15,2) NOT NULL,
    currency         CHAR(3) NOT NULL REFERENCES currencies(code),
    description      TEXT,
    reference_type   VARCHAR(20),
    reference_id     UUID,
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT cash_movements_type_check CHECK (type IN ('income','expense','transfer_in','transfer_out'))
);
CREATE INDEX ON cash_movements (cash_register_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ON cash_movements (reference_type, reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE bank_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts_finance(id),
    type            VARCHAR(20) NOT NULL,
    amount          NUMERIC(15,2) NOT NULL,
    currency        CHAR(3) NOT NULL REFERENCES currencies(code),
    description     TEXT,
    reference_type  VARCHAR(20),
    reference_id    UUID,
    reconciled      BOOLEAN NOT NULL DEFAULT false,
    reconciled_at   TIMESTAMPTZ,
    value_date      DATE NOT NULL,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT bank_movements_type_check CHECK (type IN ('credit','debit','transfer_in','transfer_out','fee'))
);
CREATE INDEX ON bank_movements (bank_account_id, value_date DESC) WHERE deleted_at IS NULL;

-- ─── Comprobantes ─────────────────────────────────────────────────────────────
CREATE TABLE invoices_issued (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID NOT NULL REFERENCES companies(id),
    idempotency_key      UUID NOT NULL UNIQUE,
    invoice_type         CHAR(1) NOT NULL CHECK (invoice_type IN ('A','B','C','M')),
    sale_point           SMALLINT NOT NULL DEFAULT 1,
    number               INT,
    contact_id           UUID NOT NULL REFERENCES contacts(id),
    issue_date           DATE NOT NULL,
    due_date             DATE,
    payment_condition_id UUID REFERENCES payment_conditions(id),
    currency             CHAR(3) NOT NULL REFERENCES currencies(code),
    exchange_rate        NUMERIC(12,6) NOT NULL DEFAULT 1,
    exchange_rate_date   DATE NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'draft',
    net_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
    paid_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    project_id           UUID REFERENCES projects(id),
    quote_id             UUID REFERENCES quotes(id),
    notes                TEXT,
    pdf_key              VARCHAR(500),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    CONSTRAINT invoices_issued_status_check CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void')),
    CONSTRAINT uq_invoice_number UNIQUE (company_id, invoice_type, sale_point, number) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ON invoices_issued (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON invoices_issued (contact_id) WHERE deleted_at IS NULL;
CREATE INDEX ON invoices_issued (due_date) WHERE deleted_at IS NULL AND status NOT IN ('paid','void');

CREATE TABLE invoice_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id   UUID NOT NULL REFERENCES invoices_issued(id) ON DELETE CASCADE,
    product_id   UUID,
    description  TEXT NOT NULL,
    quantity     NUMERIC(12,2) NOT NULL,
    unit_price   NUMERIC(15,2) NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    vat_rate_id  UUID REFERENCES vat_rates(id),
    line_net     NUMERIC(15,2) NOT NULL,
    line_tax     NUMERIC(15,2) NOT NULL,
    line_total   NUMERIC(15,2) NOT NULL,
    order_pos    SMALLINT
);

CREATE TABLE invoice_taxes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES invoices_issued(id) ON DELETE CASCADE,
    tax_type    VARCHAR(20) NOT NULL,
    rate_pct    NUMERIC(5,2),
    base_amount NUMERIC(15,2) NOT NULL,
    tax_amount  NUMERIC(15,2) NOT NULL,
    CONSTRAINT invoice_taxes_type_check CHECK (tax_type IN ('vat','perception_iibb','perception_vat','perception_profit'))
);

CREATE TABLE invoices_received (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID NOT NULL REFERENCES companies(id),
    supplier_id        UUID NOT NULL REFERENCES contacts(id),
    invoice_type       CHAR(1),
    sale_point         SMALLINT,
    number             INT,
    issue_date         DATE,
    due_date           DATE,
    currency           CHAR(3) REFERENCES currencies(code),
    exchange_rate      NUMERIC(12,6) NOT NULL DEFAULT 1,
    exchange_rate_date DATE,
    net_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
    paid_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending',
    project_id         UUID REFERENCES projects(id),
    file_key           VARCHAR(500),
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    CONSTRAINT invoices_received_status_check CHECK (status IN ('pending','partially_paid','paid','void'))
);
CREATE INDEX ON invoices_received (company_id, supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX ON invoices_received (company_id, status) WHERE deleted_at IS NULL;

CREATE TABLE receipts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id),
    idempotency_key  UUID NOT NULL UNIQUE,
    contact_id       UUID NOT NULL REFERENCES contacts(id),
    date             DATE NOT NULL,
    number           INT NOT NULL,
    currency         CHAR(3) NOT NULL REFERENCES currencies(code),
    exchange_rate    NUMERIC(12,6) NOT NULL DEFAULT 1,
    total_amount     NUMERIC(15,2) NOT NULL,
    on_account_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    notes            TEXT,
    pdf_key          VARCHAR(500),
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX ON receipts (company_id, contact_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ON receipts (company_id, number) WHERE deleted_at IS NULL;

CREATE TABLE receipt_payment_methods (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id       UUID NOT NULL REFERENCES receipts(id),
    method_type      VARCHAR(20) NOT NULL,
    cash_register_id UUID REFERENCES cash_registers(id),
    bank_account_id  UUID REFERENCES bank_accounts_finance(id),
    amount           NUMERIC(15,2) NOT NULL,
    currency         CHAR(3) REFERENCES currencies(code),
    check_number     VARCHAR(50),
    check_date       DATE,
    CONSTRAINT receipt_pm_type_check CHECK (method_type IN ('cash','bank_transfer','check','card'))
);

CREATE TABLE receipt_invoice_applications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id),
    invoice_id UUID NOT NULL REFERENCES invoices_issued(id),
    amount     NUMERIC(15,2) NOT NULL
);
CREATE INDEX ON receipt_invoice_applications (receipt_id);
CREATE INDEX ON receipt_invoice_applications (invoice_id);

CREATE TABLE payment_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    idempotency_key UUID NOT NULL UNIQUE,
    supplier_id     UUID NOT NULL REFERENCES contacts(id),
    date            DATE NOT NULL,
    number          INT NOT NULL,
    currency        CHAR(3) NOT NULL REFERENCES currencies(code),
    exchange_rate   NUMERIC(12,6) NOT NULL DEFAULT 1,
    total_amount    NUMERIC(15,2) NOT NULL,
    notes           TEXT,
    pdf_key         VARCHAR(500),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX ON payment_orders (company_id, supplier_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ON payment_orders (company_id, number) WHERE deleted_at IS NULL;

CREATE TABLE payment_order_methods (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_order_id UUID NOT NULL REFERENCES payment_orders(id),
    method_type      VARCHAR(20) NOT NULL,
    cash_register_id UUID REFERENCES cash_registers(id),
    bank_account_id  UUID REFERENCES bank_accounts_finance(id),
    amount           NUMERIC(15,2) NOT NULL,
    currency         CHAR(3) REFERENCES currencies(code),
    check_number     VARCHAR(50),
    check_date       DATE,
    CONSTRAINT payment_order_pm_type_check CHECK (method_type IN ('cash','bank_transfer','check','card'))
);

CREATE TABLE payment_order_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_order_id    UUID NOT NULL REFERENCES payment_orders(id),
    invoice_received_id UUID NOT NULL REFERENCES invoices_received(id),
    amount              NUMERIC(15,2) NOT NULL
);
CREATE INDEX ON payment_order_applications (payment_order_id);
CREATE INDEX ON payment_order_applications (invoice_received_id);

CREATE TABLE expenses (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID NOT NULL REFERENCES companies(id),
    date                 DATE NOT NULL,
    category_id          UUID NOT NULL REFERENCES expense_categories(id),
    description          TEXT NOT NULL,
    amount               NUMERIC(15,2) NOT NULL,
    currency             CHAR(3) REFERENCES currencies(code),
    paid_by_user_id      UUID REFERENCES users(id),
    paid_by_cash_id      UUID REFERENCES cash_registers(id),
    paid_by_bank_id      UUID REFERENCES bank_accounts_finance(id),
    file_key             VARCHAR(500),
    project_id           UUID REFERENCES projects(id),
    status               VARCHAR(20) NOT NULL DEFAULT 'approved',
    approver_id          UUID REFERENCES users(id),
    approved_at          TIMESTAMPTZ,
    reimbursement_status VARCHAR(20) NOT NULL DEFAULT 'na',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    CONSTRAINT expenses_status_check CHECK (status IN ('pending_approval','approved','rejected')),
    CONSTRAINT expenses_reimb_check CHECK (reimbursement_status IN ('na','pending','approved','paid')),
    CONSTRAINT expenses_payment_source_check CHECK (
        (CASE WHEN paid_by_user_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN paid_by_cash_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN paid_by_bank_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
CREATE INDEX ON expenses (company_id, date DESC) WHERE deleted_at IS NULL;

CREATE TABLE recurring_payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES companies(id),
    supplier_id    UUID REFERENCES contacts(id),
    description    VARCHAR(200) NOT NULL,
    amount         NUMERIC(15,2),
    currency       CHAR(3) REFERENCES currencies(code),
    frequency      VARCHAR(20) NOT NULL,
    due_day        SMALLINT,
    next_due_date  DATE,
    payment_method VARCHAR(50),
    category_id    UUID REFERENCES expense_categories(id),
    status         VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    CONSTRAINT recurring_freq_check CHECK (frequency IN ('monthly','bimonthly','quarterly','annual')),
    CONSTRAINT recurring_status_check CHECK (status IN ('active','paused','cancelled'))
);
CREATE INDEX ON recurring_payments (company_id) WHERE deleted_at IS NULL;

CREATE TABLE payment_obligations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id),
    source_type      VARCHAR(20) NOT NULL,
    source_id        UUID,
    description      VARCHAR(200) NOT NULL,
    amount           NUMERIC(15,2) NOT NULL,
    currency         CHAR(3) REFERENCES currencies(code),
    due_date         DATE NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    paid_at          TIMESTAMPTZ,
    payment_order_id UUID REFERENCES payment_orders(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT obligations_source_check CHECK (source_type IN ('recurring','invoice_received','tax','salary','reimbursement')),
    CONSTRAINT obligations_status_check CHECK (status IN ('pending','paid','overdue','cancelled'))
);
CREATE INDEX ON payment_obligations (company_id, due_date) WHERE deleted_at IS NULL AND status = 'pending';

-- ─── Finance permissions ──────────────────────────────────────────────────────
-- Most finance permissions already exist from the init migration. Here we add
-- only the ones introduced by this module. ON CONFLICT keeps it idempotent.
INSERT INTO permissions (id, module, action, description) VALUES
    ('e0000019-0000-4000-8000-000000000001', 'payment_orders',    'view',   'Ver órdenes de pago'),
    ('e0000019-0000-4000-8000-000000000002', 'payment_orders',    'create', 'Crear órdenes de pago'),
    ('e0000019-0000-4000-8000-000000000003', 'payment_orders',    'void',   'Anular órdenes de pago'),
    ('e0000023-0000-4000-8000-000000000001', 'cta_cte',           'view',   'Ver cuenta corriente'),
    ('e0000024-0000-4000-8000-000000000001', 'recurring_payments','view',   'Ver pagos recurrentes'),
    ('e0000024-0000-4000-8000-000000000002', 'recurring_payments','manage', 'Gestionar pagos recurrentes'),
    ('e0000025-0000-4000-8000-000000000001', 'payment_calendar',  'view',   'Ver calendario de pagos')
ON CONFLICT (module, action) DO NOTHING;
