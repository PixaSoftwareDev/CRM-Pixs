// Package main seeds development data: creates the dev admin user if it doesn't exist.
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

// Seeded UUIDs — must match db/migrations/20260617000001_init_identity.sql.
var (
	seedCompanyID = uuid.MustParse("c0000000-0000-4000-8000-000000000001")
	adminRoleID   = uuid.MustParse("d0000000-0000-4000-8000-000000000001")
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

	q := sqlcgen.New(db)
	ctx := context.Background()

	// Check if user already exists.
	existing, err := q.GetUserByEmailAnyCompany(ctx, adminEmail)
	if err == nil {
		slog.Info("admin user already exists", "id", existing.ID.String())
		return nil
	}

	// Validate and hash password.
	pwd, err := identity.NewPassword(cfg.DevSeedAdminPassword)
	if err != nil {
		return fmt.Errorf("invalid seed admin password: %w", err)
	}
	hash, err := argon2.Hash(pwd.Raw())
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	// Create user.
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

	// Assign admin role.
	if err := q.AssignRoleToUser(ctx, sqlcgen.AssignRoleToUserParams{
		UserID: user.ID,
		RoleID: adminRoleID,
	}); err != nil {
		return fmt.Errorf("assigning admin role: %w", err)
	}

	slog.Info("admin user created",
		"id", user.ID.String(),
		"email", adminEmail,
		"password", cfg.DevSeedAdminPassword,
	)
	return nil
}
