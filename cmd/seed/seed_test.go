package main

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// startPostgres spins up a throwaway Postgres 16 container, applies the
// identity migration, and returns a connected pool. Cleanup is registered via t.
func startPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("pixstest"),
		tcpostgres.WithUsername("pixs"),
		tcpostgres.WithPassword("pixs"),
		tcpostgres.BasicWaitStrategies(),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ctr.Terminate(context.Background()) })

	connStr, err := ctr.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	pool, err := pgxpool.New(ctx, connStr)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	applyMigration(t, pool)
	return pool
}

// applyMigration reads the identity migration SQL and applies it to the pool.
func applyMigration(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	migrationPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "db", "migrations", "20260617000001_init_identity.sql")
	sql, err := os.ReadFile(migrationPath)
	require.NoError(t, err, "reading migration file")
	_, err = pool.Exec(context.Background(), string(sql))
	require.NoError(t, err, "applying migration")
}

// rolePermission represents one cell in the RBAC matrix as returned by the DB.
type rolePermission struct {
	module          string
	action          string
	restrictedToOwn bool
}

// queryMatrix returns all role_permissions for a given role name.
func queryMatrix(t *testing.T, pool *pgxpool.Pool, roleName string) map[string]rolePermission {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		SELECT p.module, p.action, rp.restricted_to_own
		FROM role_permissions rp
		JOIN permissions p  ON p.id  = rp.permission_id
		JOIN roles r        ON r.id  = rp.role_id
		WHERE r.name = $1`, roleName)
	require.NoError(t, err)
	defer rows.Close()

	result := make(map[string]rolePermission)
	for rows.Next() {
		var rp rolePermission
		require.NoError(t, rows.Scan(&rp.module, &rp.action, &rp.restrictedToOwn))
		result[rp.module+"/"+rp.action] = rp
	}
	require.NoError(t, rows.Err())
	return result
}

// hasPermission asserts a key is present in the matrix with the expected own-restriction.
func hasPermission(t *testing.T, matrix map[string]rolePermission, key string, wantOwn bool) {
	t.Helper()
	rp, ok := matrix[key]
	assert.True(t, ok, "expected permission %q to be granted", key)
	if ok {
		assert.Equal(t, wantOwn, rp.restrictedToOwn, "permission %q: wrong restricted_to_own", key)
	}
}

// lacksPermission asserts a key is absent from the matrix.
func lacksPermission(t *testing.T, matrix map[string]rolePermission, key string) {
	t.Helper()
	_, ok := matrix[key]
	assert.False(t, ok, "expected permission %q to be absent", key)
}

// TestSeedRBACMatrix runs the full seed against a real Postgres container and
// verifies the corrected RBAC matrix, with emphasis on the three adjusted entries:
//
//  1. contable: documents/view added (no upload/delete)
//  2. direccion: users/manage, audit/view, settings/manage added
//  3. ventas: quotes/create and quotes/edit are now restricted_to_own
func TestSeedRBACMatrix(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()
	pool := startPostgres(t)

	require.NoError(t, seedCompany(ctx, pool))
	require.NoError(t, seedRoles(ctx, pool))
	require.NoError(t, seedRBACMatrix(ctx, pool))

	t.Run("admin has all permissions unrestricted", func(t *testing.T) {
		m := queryMatrix(t, pool, "admin")
		assert.Len(t, m, 60, "admin should have all 60 permissions")
		hasPermission(t, m, "contacts/view", false)
		hasPermission(t, m, "users/manage", false)
		hasPermission(t, m, "audit/view", false)
		hasPermission(t, m, "settings/manage", false)
		hasPermission(t, m, "documents/view", false)
		hasPermission(t, m, "documents/upload", false)
		hasPermission(t, m, "documents/delete", false)
	})

	// ── Change 1: contable gets documents/view (no upload or delete) ──────────
	t.Run("contable has documents/view but not upload or delete", func(t *testing.T) {
		m := queryMatrix(t, pool, "contable")
		hasPermission(t, m, "documents/view", false)
		lacksPermission(t, m, "documents/upload")
		lacksPermission(t, m, "documents/delete")
	})

	t.Run("contable read-only financial access preserved", func(t *testing.T) {
		m := queryMatrix(t, pool, "contable")
		hasPermission(t, m, "quotes/view", false)
		hasPermission(t, m, "time_tracking/export", false)
		hasPermission(t, m, "invoices_issued/view", false)
		hasPermission(t, m, "invoices_issued/export", false)
		hasPermission(t, m, "invoices_received/view", false)
		hasPermission(t, m, "receipts/view", false)
		hasPermission(t, m, "cash_registers/view", false)
		hasPermission(t, m, "banks/view", false)
		hasPermission(t, m, "expenses/view", false)
		hasPermission(t, m, "cash_flow/view", false)
		hasPermission(t, m, "reports/view_financial", false)
		hasPermission(t, m, "reports/export", false)
		// must NOT have write access
		lacksPermission(t, m, "invoices_issued/create")
		lacksPermission(t, m, "invoices_issued/emit")
		lacksPermission(t, m, "invoices_issued/void")
		lacksPermission(t, m, "receipts/create")
		lacksPermission(t, m, "users/manage")
	})

	// ── Change 2: direccion gets users/manage, audit/view, settings/manage ────
	t.Run("direccion has management permissions", func(t *testing.T) {
		m := queryMatrix(t, pool, "direccion")
		hasPermission(t, m, "users/manage", false)
		hasPermission(t, m, "audit/view", false)
		hasPermission(t, m, "settings/manage", false)
	})

	t.Run("direccion broad access preserved", func(t *testing.T) {
		m := queryMatrix(t, pool, "direccion")
		hasPermission(t, m, "contacts/view", false)
		hasPermission(t, m, "contacts/delete", false)
		hasPermission(t, m, "pipeline/view_all", false)
		hasPermission(t, m, "invoices_issued/emit", false)
		hasPermission(t, m, "invoices_issued/void", false)
		hasPermission(t, m, "expenses/approve", false)
		hasPermission(t, m, "scraping/view_costs", false)
		hasPermission(t, m, "documents/delete", false)
		hasPermission(t, m, "leads/view_all", false)
	})

	// ── Change 3: ventas quotes/create and quotes/edit are now own-restricted ─
	t.Run("ventas quotes are all restricted to own", func(t *testing.T) {
		m := queryMatrix(t, pool, "ventas")
		hasPermission(t, m, "quotes/view", true)
		hasPermission(t, m, "quotes/create", true) // was false before fix
		hasPermission(t, m, "quotes/edit", true)   // was false before fix
		lacksPermission(t, m, "quotes/approve")
	})

	t.Run("ventas other own-restrictions preserved", func(t *testing.T) {
		m := queryMatrix(t, pool, "ventas")
		hasPermission(t, m, "pipeline/view", true)
		hasPermission(t, m, "pipeline/create", true)
		hasPermission(t, m, "pipeline/edit", true)
		hasPermission(t, m, "tasks/view", true)
		hasPermission(t, m, "leads/view", true)
	})

	t.Run("ventas unrestricted permissions unchanged", func(t *testing.T) {
		m := queryMatrix(t, pool, "ventas")
		hasPermission(t, m, "contacts/view", false)
		hasPermission(t, m, "contacts/create", false)
		hasPermission(t, m, "contacts/edit", false)
		hasPermission(t, m, "contacts/export", false)
		hasPermission(t, m, "leads/convert", false)
		hasPermission(t, m, "scraping/launch", false)
		hasPermission(t, m, "reports/view_sales", false)
		hasPermission(t, m, "documents/view", false)
		hasPermission(t, m, "documents/upload", false)
		// must not have financial write access
		lacksPermission(t, m, "invoices_issued/emit")
		lacksPermission(t, m, "pipeline/view_all")
		lacksPermission(t, m, "users/manage")
	})

	// ── Smoke checks for remaining roles ──────────────────────────────────────
	t.Run("cobranzas financial access", func(t *testing.T) {
		m := queryMatrix(t, pool, "cobranzas")
		hasPermission(t, m, "invoices_issued/view", false)
		hasPermission(t, m, "invoices_issued/emit", false)
		hasPermission(t, m, "receipts/create", false)
		hasPermission(t, m, "cash_registers/reconcile", false)
		hasPermission(t, m, "banks/reconcile", false)
		lacksPermission(t, m, "invoices_issued/void")
		lacksPermission(t, m, "users/manage")
		hasPermission(t, m, "documents/view", false)
	})

	t.Run("soporte operational access", func(t *testing.T) {
		m := queryMatrix(t, pool, "soporte")
		hasPermission(t, m, "contacts/view", false)
		hasPermission(t, m, "tasks/view", false)
		hasPermission(t, m, "tasks/create", false)
		hasPermission(t, m, "time_tracking/view_own", false)
		hasPermission(t, m, "expenses/create", false)
		lacksPermission(t, m, "invoices_issued/view")
		lacksPermission(t, m, "pipeline/view")
		lacksPermission(t, m, "users/manage")
	})

	t.Run("desarrollo project access", func(t *testing.T) {
		m := queryMatrix(t, pool, "desarrollo")
		hasPermission(t, m, "contacts/view", false)
		hasPermission(t, m, "projects/view", false)
		hasPermission(t, m, "tasks/create", false)
		hasPermission(t, m, "time_tracking/view_own", false)
		lacksPermission(t, m, "contacts/create")
		lacksPermission(t, m, "invoices_issued/view")
		lacksPermission(t, m, "pipeline/view")
	})
}
