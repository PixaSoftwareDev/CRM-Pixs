//go:build integration

package finance_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	sqlcgen "pixs/internal/repository/sqlc"
)

// startPostgres spins up a throwaway Postgres 16 container, applies all
// migrations in order, and returns a connected pool.
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

	applyMigrations(t, pool)
	return pool
}

// applyMigrations runs every migration file in db/migrations in lexical order.
func applyMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	migrationsDir := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "db", "migrations")
	entries, err := os.ReadDir(migrationsDir)
	require.NoError(t, err)

	files := make([]string, 0, len(entries))
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, f := range files {
		sql, err := os.ReadFile(filepath.Join(migrationsDir, f))
		require.NoError(t, err, "reading migration %s", f)
		_, err = pool.Exec(context.Background(), string(sql))
		require.NoError(t, err, "applying migration %s", f)
	}
}

// TestSequenceNumbers_Concurrent verifies that NextSequenceNumber returns a
// gap-free, duplicate-free sequence under heavy concurrency. Each goroutine
// runs the allocation inside its own transaction; Postgres serializes the
// row-level lock the UPDATE acquires.
func TestSequenceNumbers_Concurrent(t *testing.T) {
	const N = 20
	ctx := context.Background()
	pool := startPostgres(t)

	// The seed company from the init migration owns the seeded sequence rows.
	companyID := uuid.MustParse("c0000000-0000-4000-8000-000000000001")
	_, err := pool.Exec(ctx, `
		INSERT INTO companies (id, legal_name, fantasy_name)
		VALUES ($1, 'Test Co', 'Test') ON CONFLICT (id) DO NOTHING`, companyID)
	require.NoError(t, err)

	// Insert the sequence row this test allocates from, starting at 0.
	_, err = pool.Exec(ctx, `
		INSERT INTO sequence_numbers (company_id, document_type, sale_point, last_number)
		VALUES ($1, 'invoice_A', 1, 0)
		ON CONFLICT (company_id, document_type, sale_point) DO UPDATE SET last_number = 0`, companyID)
	require.NoError(t, err)

	q := sqlcgen.New(pool)

	results := make([]int32, N)
	var wg sync.WaitGroup
	errCh := make(chan error, N)

	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			tx, err := pool.Begin(ctx)
			if err != nil {
				errCh <- err
				return
			}
			defer func() { _ = tx.Rollback(ctx) }()
			n, err := q.WithTx(tx).NextSequenceNumber(ctx, sqlcgen.NextSequenceNumberParams{
				CompanyID:    companyID,
				DocumentType: "invoice_A",
				SalePoint:    1,
			})
			if err != nil {
				errCh <- err
				return
			}
			if err := tx.Commit(ctx); err != nil {
				errCh <- err
				return
			}
			results[idx] = n
		}(i)
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		require.NoError(t, err)
	}

	// Numbers must be exactly 1..N: no gaps, no duplicates.
	sorted := make([]int, 0, N)
	for _, n := range results {
		sorted = append(sorted, int(n))
	}
	sort.Ints(sorted)
	require.Len(t, sorted, N)
	for i := 0; i < N; i++ {
		require.Equal(t, i+1, sorted[i], "expected sequential number %d at position %d", i+1, i)
	}
	t.Logf("allocated numbers (sorted): %v", sorted)
}
