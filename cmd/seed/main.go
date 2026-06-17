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
		    ('cash_flow','view'),
		    ('leads','view'),('leads','view_all'),('leads','convert'),
		    ('scraping','launch'),('scraping','view_costs'),
		    ('reports','view_financial'),('reports','view_sales'),('reports','export'),
		    ('documents','view'),('documents','upload'),('documents','delete'),
		    ('users','manage'),('audit','view'),('settings','manage')
		)
		ON CONFLICT DO NOTHING`, roleDireccion); err != nil {
		return fmt.Errorf("direccion RBAC: %w", err)
	}

	// ventas: pipeline, quotes, tasks, leads → restricted_to_own. A salesperson
	// works exclusively on their own pipeline, quotes, tasks, and leads.
	if _, err := db.Exec(ctx, `
		INSERT INTO role_permissions (role_id, permission_id, restricted_to_own)
		SELECT $1, p.id,
		    CASE WHEN (p.module, p.action) IN (
		        ('pipeline','view'),('pipeline','create'),('pipeline','edit'),
		        ('quotes','view'),('quotes','create'),('quotes','edit'),
		        ('tasks','view'),('leads','view')
		    ) THEN true ELSE false END
		FROM permissions p
		WHERE (p.module, p.action) IN (
		    ('contacts','view'),('contacts','create'),('contacts','edit'),('contacts','export'),
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
		    ('documents','view'),('documents','upload')
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
		    ('expenses','create'),('expenses','view'),
		    ('cash_flow','view'),
		    ('reports','view_financial'),('reports','export'),
		    ('documents','view'),('documents','upload')
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
		    ('documents','view'),('documents','upload')
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
		    ('documents','view'),('documents','upload')
		)
		ON CONFLICT DO NOTHING`, roleDesarrollo); err != nil {
		return fmt.Errorf("desarrollo RBAC: %w", err)
	}

	// contable: read-only financial view + documents/view so they can open
	// attached invoices and contracts without being able to modify anything.
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
		    ('expenses','view'),
		    ('cash_flow','view'),
		    ('reports','view_financial'),('reports','export'),
		    ('documents','view')
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
