// Package main seeds development data into a fresh PIXS database.
//
// What it inserts (idempotent — safe to run multiple times):
//   - 1 company (seed tenant)
//   - 7 system roles scoped to that company
//   - Full RBAC matrix (role_permissions)
//   - 1 dev admin user (admin@pixs.local) with the admin role
//
// Run via `make seed`. Only for dev/staging — never run in production.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"pixs/internal/auth/argon2"
	"pixs/internal/config"
	"pixs/internal/domain/identity"
	sqlcgen "pixs/internal/repository/sqlc"
)

// Fixed UUIDs — must stay stable across DB resets so runbooks and
// test fixtures can reference them by UUID.
var (
	seedCompanyID  = uuid.MustParse("c0000000-0000-4000-8000-000000000001")
	roleAdmin      = uuid.MustParse("d0000000-0000-4000-8000-000000000001")
	roleDireccion  = uuid.MustParse("d0000000-0000-4000-8000-000000000002")
	roleVentas     = uuid.MustParse("d0000000-0000-4000-8000-000000000003")
	roleCobranzas  = uuid.MustParse("d0000000-0000-4000-8000-000000000004")
	roleSoporte    = uuid.MustParse("d0000000-0000-4000-8000-000000000005")
	roleDesarrollo = uuid.MustParse("d0000000-0000-4000-8000-000000000006")
	roleContable   = uuid.MustParse("d0000000-0000-4000-8000-000000000007")

	// Pipeline stages (fixed UUIDs).
	stageProspecto        = uuid.MustParse("e1000001-0000-4000-8000-000000000001")
	stageContactado       = uuid.MustParse("e1000001-0000-4000-8000-000000000002")
	stagePropuestaEnviada = uuid.MustParse("e1000001-0000-4000-8000-000000000003")
	stageNegociacion      = uuid.MustParse("e1000001-0000-4000-8000-000000000004")
	stageGanada           = uuid.MustParse("e1000001-0000-4000-8000-000000000005")
	stagePerdida          = uuid.MustParse("e1000001-0000-4000-8000-000000000006")

	// Lost reasons (fixed UUIDs).
	lostReasonPrecio         = uuid.MustParse("e2000001-0000-4000-8000-000000000001")
	lostReasonCompetencia    = uuid.MustParse("e2000001-0000-4000-8000-000000000002")
	lostReasonSinPresupuesto = uuid.MustParse("e2000001-0000-4000-8000-000000000003")
	lostReasonSinRespuesta   = uuid.MustParse("e2000001-0000-4000-8000-000000000004")
	lostReasonMalTiming      = uuid.MustParse("e2000001-0000-4000-8000-000000000005")
	lostReasonOtro           = uuid.MustParse("e2000001-0000-4000-8000-000000000006")
)

const (
	adminEmail    = "admin@pixs.local"
	adminFullName = "Administrador PIXS"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "seed: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	if cfg.Environment == "prod" {
		return fmt.Errorf("seed must not be run in production")
	}

	db, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connecting to postgres: %w", err)
	}
	defer db.Close()

	ctx := context.Background()
	q := sqlcgen.New(db)

	if err := seedCompany(ctx, db); err != nil {
		return fmt.Errorf("seeding company: %w", err)
	}
	if err := seedRoles(ctx, db); err != nil {
		return fmt.Errorf("seeding roles: %w", err)
	}
	if err := seedRBACMatrix(ctx, db); err != nil {
		return fmt.Errorf("seeding RBAC matrix: %w", err)
	}
	if err := seedAdminUser(ctx, q, cfg.DevSeedAdminPassword); err != nil {
		return fmt.Errorf("seeding admin user: %w", err)
	}
	if err := seedCalendarEventTypes(ctx, db); err != nil {
		return fmt.Errorf("seeding calendar event types: %w", err)
	}
	if err := seedPipelineStages(ctx, db); err != nil {
		return fmt.Errorf("seeding pipeline stages: %w", err)
	}
	if err := seedLostReasons(ctx, db); err != nil {
		return fmt.Errorf("seeding lost reasons: %w", err)
	}
	if err := seedFinanceCatalogs(ctx, db); err != nil {
		return fmt.Errorf("seeding finance catalogs: %w", err)
	}

	slog.Info("seed complete",
		"company_id", seedCompanyID,
		"admin_email", adminEmail,
		"admin_password", cfg.DevSeedAdminPassword,
	)
	return nil
}

// seedCompany inserts the dev company with a fixed UUID.
func seedCompany(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		INSERT INTO companies (id, legal_name, fantasy_name, cuit, vat_condition, city, province)
		VALUES ($1, 'PIXS S.R.L.', 'PIXS', '30-12345678-9', 'ri', 'Buenos Aires', 'Buenos Aires')
		ON CONFLICT (id) DO NOTHING`,
		seedCompanyID,
	)
	if err != nil {
		return err
	}
	slog.Info("company seeded", "id", seedCompanyID)
	return nil
}

// seedRoles inserts the 7 system roles with fixed UUIDs.
func seedRoles(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		INSERT INTO roles (id, company_id, name, description, is_system) VALUES
		    ($1,  $8, 'admin',      'Acceso total al sistema',                                    true),
		    ($2,  $8, 'direccion',  'Gerencia y dirección',                                       true),
		    ($3,  $8, 'ventas',     'Gestión comercial y pipeline',                               true),
		    ($4,  $8, 'cobranzas',  'Gestión de cobros, facturas y finanzas',                     true),
		    ($5,  $8, 'soporte',    'Atención al cliente y soporte técnico',                      true),
		    ($6,  $8, 'desarrollo', 'Desarrollo de proyectos',                                    true),
		    ($7,  $8, 'contable',   'Acceso de solo lectura a módulos financieros para contador', true)
		ON CONFLICT (id) DO NOTHING`,
		roleAdmin, roleDireccion, roleVentas, roleCobranzas,
		roleSoporte, roleDesarrollo, roleContable, seedCompanyID,
	)
	if err != nil {
		return err
	}
	slog.Info("roles seeded", "count", 7)
	return nil
}

// seedRBACMatrix inserts the full role_permissions RBAC matrix.
// permissions already exist from the migration (they are system catalog data).
func seedRBACMatrix(ctx context.Context, db *pgxpool.Pool) error {
	// admin: all permissions, unrestricted.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, id, false FROM permissions
		ON CONFLICT DO NOTHING`, roleAdmin); err != nil {
		return fmt.Errorf("admin RBAC: %w", err)
	}

	// direccion: broad access, all unrestricted. Includes management capabilities
	// because this role is used by the company owner/partner.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id, false FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('contacts','view'),('contacts','create'),('contacts','edit'),('contacts','delete'),('contacts','export'),
		    ('pipeline','view'),('pipeline','view_all'),('pipeline','create'),('pipeline','edit'),
		    ('quotes','view'),('quotes','create'),('quotes','edit'),('quotes','approve'),
		    ('products','view'),('products','manage'),
		    ('projects','view'),('projects','create'),('projects','edit'),('projects','view_profitability'),
		    ('tasks','view'),('tasks','view_all'),('tasks','create'),('tasks','edit'),('tasks','assign'),
		    ('time_tracking','view_own'),('time_tracking','view_all'),('time_tracking','export'),
		    ('invoices_issued','view'),('invoices_issued','create'),('invoices_issued','edit'),
		    ('invoices_issued','emit'),('invoices_issued','void'),('invoices_issued','export'),
		    ('invoices_received','view'),('invoices_received','create'),('invoices_received','edit'),
		    ('receipts','view'),('receipts','create'),('receipts','void'),
		    ('cash_registers','view'),('cash_registers','create_movement'),('cash_registers','reconcile'),
		    ('banks','view'),('banks','reconcile'),
		    ('expenses','create'),('expenses','approve'),('expenses','view'),
		    ('payment_orders','view'),('payment_orders','create'),('payment_orders','void'),
		    ('recurring_payments','view'),('recurring_payments','manage'),
		    ('payment_calendar','view'),
		    ('cta_cte','view'),
		    ('cash_flow','view'),
		    ('leads','view'),('leads','view_all'),('leads','convert'),
		    ('scraping','launch'),('scraping','view_costs'),
		    ('reports','view_financial'),('reports','view_sales'),('reports','export'),
		    ('documents','view'),('documents','upload'),('documents','delete'),
		    ('users','manage'),('audit','view'),('settings','manage'),
		    ('calendar','view'),('calendar','manage')
		)
		ON CONFLICT DO NOTHING`, roleDireccion); err != nil {
		return fmt.Errorf("direccion RBAC: %w", err)
	}

	// ventas: pipeline, quotes, tasks, leads, calendar → restricted_to_own. A salesperson
	// works exclusively on their own pipeline, quotes, tasks, leads, and calendar events.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id,
		    CASE WHEN (p.module, p.action) IN (
		        ('pipeline','view'),('pipeline','create'),('pipeline','edit'),
		        ('quotes','view'),('quotes','create'),('quotes','edit'),
		        ('tasks','view'),('leads','view'),
		        ('calendar','view'),('calendar','manage')
		    ) THEN true ELSE false END
		FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('contacts','view'),('contacts','create'),('contacts','edit'),('contacts','export'),
		    ('products','view'),
		    ('pipeline','view'),('pipeline','create'),('pipeline','edit'),
		    ('quotes','view'),('quotes','create'),('quotes','edit'),
		    ('projects','view'),('projects','create'),('projects','edit'),
		    ('tasks','view'),('tasks','create'),('tasks','edit'),
		    ('time_tracking','view_own'),
		    ('invoices_issued','view'),('invoices_issued','create'),('invoices_issued','edit'),
		    ('expenses','create'),
		    ('leads','view'),('leads','convert'),
		    ('scraping','launch'),
		    ('reports','view_sales'),
		    ('documents','view'),('documents','upload'),
		    ('calendar','view'),('calendar','manage')
		)
		ON CONFLICT DO NOTHING`, roleVentas); err != nil {
		return fmt.Errorf("ventas RBAC: %w", err)
	}

	// cobranzas: financial focus, unrestricted.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id, false FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('contacts','view'),('contacts','create'),('contacts','edit'),('contacts','export'),
		    ('pipeline','view'),('pipeline','view_all'),
		    ('invoices_issued','view'),('invoices_issued','create'),('invoices_issued','edit'),
		    ('invoices_issued','emit'),('invoices_issued','export'),
		    ('invoices_received','view'),('invoices_received','create'),('invoices_received','edit'),
		    ('receipts','view'),('receipts','create'),
		    ('cash_registers','view'),('cash_registers','create_movement'),('cash_registers','reconcile'),
		    ('banks','view'),('banks','reconcile'),
		    ('payment_orders','view'),('payment_orders','create'),('payment_orders','void'),
		    ('recurring_payments','view'),('recurring_payments','manage'),
		    ('payment_calendar','view'),
		    ('cta_cte','view'),
		    ('expenses','create'),('expenses','view'),
		    ('cash_flow','view'),
		    ('reports','view_financial'),('reports','export'),
		    ('documents','view'),('documents','upload'),
		    ('calendar','view'),('calendar','manage')
		)
		ON CONFLICT DO NOTHING`, roleCobranzas); err != nil {
		return fmt.Errorf("cobranzas RBAC: %w", err)
	}

	// soporte: operational tasks, unrestricted.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id, false FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('contacts','view'),('contacts','create'),('contacts','edit'),
		    ('projects','view'),
		    ('tasks','view'),('tasks','create'),('tasks','edit'),
		    ('time_tracking','view_own'),
		    ('expenses','create'),
		    ('documents','view'),('documents','upload'),
		    ('calendar','view'),('calendar','manage')
		)
		ON CONFLICT DO NOTHING`, roleSoporte); err != nil {
		return fmt.Errorf("soporte RBAC: %w", err)
	}

	// desarrollo: project execution, unrestricted.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id, false FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('contacts','view'),
		    ('projects','view'),
		    ('tasks','view'),('tasks','create'),('tasks','edit'),
		    ('time_tracking','view_own'),
		    ('expenses','create'),
		    ('documents','view'),('documents','upload'),
		    ('calendar','view'),('calendar','manage')
		)
		ON CONFLICT DO NOTHING`, roleDesarrollo); err != nil {
		return fmt.Errorf("desarrollo RBAC: %w", err)
	}

	// contable: read-only financial view + documents/view so they can open
	// attached invoices and contracts without being able to modify anything.
	// calendar/view added so they can see scheduled meetings (read-only).
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id, false FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('quotes','view'),
		    ('time_tracking','export'),
		    ('invoices_issued','view'),('invoices_issued','export'),
		    ('invoices_received','view'),
		    ('receipts','view'),
		    ('cash_registers','view'),
		    ('banks','view'),
		    ('payment_orders','view'),
		    ('recurring_payments','view'),
		    ('payment_calendar','view'),
		    ('cta_cte','view'),
		    ('expenses','view'),
		    ('cash_flow','view'),
		    ('reports','view_financial'),('reports','export'),
		    ('documents','view'),
		    ('calendar','view')
		)
		ON CONFLICT DO NOTHING`, roleContable); err != nil {
		return fmt.Errorf("contable RBAC: %w", err)
	}

	slog.Info("RBAC matrix seeded")
	return nil
}

// seedAdminUser creates the dev admin user if not already present.
func seedAdminUser(ctx context.Context, q *sqlcgen.Queries, password string) error {
	existing, err := q.GetUserByEmailAnyCompany(ctx, adminEmail)
	if err == nil {
		slog.Info("admin user already exists", "id", existing.ID.String())
		return nil
	}

	pwd, err := identity.NewPassword(password)
	if err != nil {
		return fmt.Errorf("invalid seed admin password: %w", err)
	}
	hash, err := argon2.Hash(pwd.Raw())
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	user, err := q.CreateUser(ctx, sqlcgen.CreateUserParams{
		CompanyID:    seedCompanyID,
		Email:        adminEmail,
		PasswordHash: hash,
		FullName:     adminFullName,
		IsActive:     true,
	})
	if err != nil {
		return fmt.Errorf("creating admin user: %w", err)
	}

	if err := q.AssignRoleToUser(ctx, sqlcgen.AssignRoleToUserParams{
		UserID: user.ID,
		RoleID: roleAdmin,
	}); err != nil {
		return fmt.Errorf("assigning admin role: %w", err)
	}

	slog.Info("admin user created", "id", user.ID.String(), "email", adminEmail)
	return nil
}

// seedCalendarEventTypes inserts the default calendar event types.
func seedCalendarEventTypes(ctx context.Context, db *pgxpool.Pool) error {
	types := []struct {
		id    string
		name  string
		color string
	}{
		{"f0000001-0000-4000-8000-000000000001", "Llamada", "#3B82F6"},
		{"f0000001-0000-4000-8000-000000000002", "Reunión", "#8B5CF6"},
		{"f0000001-0000-4000-8000-000000000003", "Visita", "#10B981"},
		{"f0000001-0000-4000-8000-000000000004", "Demo", "#F59E0B"},
		{"f0000001-0000-4000-8000-000000000005", "Seguimiento", "#EF4444"},
	}

	for _, t := range types {
		if _, err := db.Exec(ctx, `
			INSERT INTO calendar_event_types (id, company_id, name, color)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (id) DO NOTHING`,
			uuid.MustParse(t.id), seedCompanyID, t.name, t.color,
		); err != nil {
			return fmt.Errorf("inserting event type %q: %w", t.name, err)
		}
	}

	slog.Info("calendar event types seeded")
	return nil
}

// seedPipelineStages inserts the default sales pipeline stages.
func seedPipelineStages(ctx context.Context, db *pgxpool.Pool) error {
	stages := []struct {
		id     uuid.UUID
		name   string
		orderP int
		color  string
		isWin  bool
		isLoss bool
		isDef  bool
	}{
		{stageProspecto, "Prospecto", 1, "#94A3B8", false, false, true},
		{stageContactado, "Contactado", 2, "#60A5FA", false, false, false},
		{stagePropuestaEnviada, "Propuesta enviada", 3, "#A78BFA", false, false, false},
		{stageNegociacion, "Negociación", 4, "#F59E0B", false, false, false},
		{stageGanada, "Ganada", 5, "#10B981", true, false, false},
		{stagePerdida, "Perdida", 6, "#EF4444", false, true, false},
	}
	for _, s := range stages {
		if _, err := db.Exec(ctx, `
			INSERT INTO pipeline_stages (id, company_id, name, order_pos, color, is_win, is_loss, is_default)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (id) DO NOTHING`,
			s.id, seedCompanyID, s.name, s.orderP, s.color, s.isWin, s.isLoss, s.isDef,
		); err != nil {
			return fmt.Errorf("inserting pipeline stage %q: %w", s.name, err)
		}
	}
	slog.Info("pipeline stages seeded", "count", len(stages))
	return nil
}

// seedFinanceCatalogs inserts the company-scoped finance catalogs and the
// sequence-number rows. These live here (not in the migration) because the
// company row is also created by the seed, so they share its lifecycle.
func seedFinanceCatalogs(ctx context.Context, db *pgxpool.Pool) error {
	stmts := []string{
		`INSERT INTO vat_rates (id, company_id, name, rate_pct) VALUES
		    ('f3000001-0000-4000-8000-000000000001', $1, 'Exento', 0),
		    ('f3000001-0000-4000-8000-000000000002', $1, 'IVA 10.5%', 10.5),
		    ('f3000001-0000-4000-8000-000000000003', $1, 'IVA 21%', 21),
		    ('f3000001-0000-4000-8000-000000000004', $1, 'IVA 27%', 27)
		 ON CONFLICT (id) DO NOTHING`,
		`INSERT INTO payment_conditions (id, company_id, name, days) VALUES
		    ('f4000001-0000-4000-8000-000000000001', $1, 'Contado', 0),
		    ('f4000001-0000-4000-8000-000000000002', $1, '15 días', 15),
		    ('f4000001-0000-4000-8000-000000000003', $1, '30 días', 30),
		    ('f4000001-0000-4000-8000-000000000004', $1, '60 días', 60),
		    ('f4000001-0000-4000-8000-000000000005', $1, '90 días', 90)
		 ON CONFLICT (id) DO NOTHING`,
		`INSERT INTO expense_categories (id, company_id, name) VALUES
		    ('f5000001-0000-4000-8000-000000000001', $1, 'Viáticos'),
		    ('f5000001-0000-4000-8000-000000000002', $1, 'Papelería'),
		    ('f5000001-0000-4000-8000-000000000003', $1, 'Hosting'),
		    ('f5000001-0000-4000-8000-000000000004', $1, 'Herramientas'),
		    ('f5000001-0000-4000-8000-000000000005', $1, 'Impuestos'),
		    ('f5000001-0000-4000-8000-000000000006', $1, 'Sueldos'),
		    ('f5000001-0000-4000-8000-000000000007', $1, 'Honorarios'),
		    ('f5000001-0000-4000-8000-000000000008', $1, 'Otros')
		 ON CONFLICT (id) DO NOTHING`,
		`INSERT INTO sequence_numbers (company_id, document_type, sale_point, last_number) VALUES
		    ($1, 'invoice_A', 1, 0),
		    ($1, 'invoice_B', 1, 0),
		    ($1, 'invoice_C', 1, 0),
		    ($1, 'invoice_M', 1, 0),
		    ($1, 'receipt', 1, 0),
		    ($1, 'payment_order', 1, 0)
		 ON CONFLICT (company_id, document_type, sale_point) DO NOTHING`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(ctx, stmt, seedCompanyID); err != nil {
			return err
		}
	}
	slog.Info("finance catalogs seeded")
	return nil
}

// seedLostReasons inserts the default opportunity lost reasons.
func seedLostReasons(ctx context.Context, db *pgxpool.Pool) error {
	reasons := []struct {
		id   uuid.UUID
		name string
	}{
		{lostReasonPrecio, "Precio"},
		{lostReasonCompetencia, "Competencia"},
		{lostReasonSinPresupuesto, "Sin presupuesto"},
		{lostReasonSinRespuesta, "Sin respuesta"},
		{lostReasonMalTiming, "Mal timing"},
		{lostReasonOtro, "Otro"},
	}
	for _, r := range reasons {
		if _, err := db.Exec(ctx, `
			INSERT INTO lost_reasons (id, company_id, name)
			VALUES ($1, $2, $3)
			ON CONFLICT (id) DO NOTHING`,
			r.id, seedCompanyID, r.name,
		); err != nil {
			return fmt.Errorf("inserting lost reason %q: %w", r.name, err)
		}
	}
	slog.Info("lost reasons seeded", "count", len(reasons))
	return nil
}
