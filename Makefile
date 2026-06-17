.PHONY: db-up db-down migrate migrate-new sqlc lint vet test test-cover build run-api seed help

# ── Tool paths ───────────────────────────────────────────────────────────────

GOBIN          := $(HOME)/go/bin
LOCAL_BIN      := $(HOME)/.local/bin
# Go 1.25 is required by current dependency versions (pgx/v5, echo/v4, etc.)
GO_DIR         := $(HOME)/sdk/golang.org/toolchain@v0.0.1-go1.25.0.linux-amd64/bin
GO             := $(GO_DIR)/go

# Ensure Go binary is in PATH for tools that invoke `go` themselves (e.g. golangci-lint)
export PATH := $(GO_DIR):$(GOBIN):$(LOCAL_BIN):$(PATH)
GOLANGCI_LINT  := $(GOBIN)/golangci-lint
SQLC           := $(GOBIN)/sqlc
ATLAS          := $(LOCAL_BIN)/atlas

BIN_DIR        := bin

# Load .env if present (for PIXS_* env vars)
ifneq (,$(wildcard .env))
  include .env
  export
endif

# ── Docker / Database ────────────────────────────────────────────────────────

db-up:
	docker compose up -d --wait
	@echo "Postgres and Redis are healthy."

db-down:
	docker compose down

# ── Migrations (Atlas) ────────────────────────────────────────────────────────

migrate:
	$(ATLAS) migrate apply --env local

migrate-new:
	@[ -z "$(name)" ] && echo "Usage: make migrate-new name=<migration_name>" && exit 1 || true
	$(ATLAS) migrate new --env local $(name)

# ── Code generation ───────────────────────────────────────────────────────────

sqlc:
	$(SQLC) generate

# ── Quality ───────────────────────────────────────────────────────────────────

lint:
	$(GOLANGCI_LINT) run ./...

vet:
	$(GO) vet ./...

test:
	$(GO) test ./... -race -count=1

test-cover:
	$(GO) test ./... -race -coverprofile=coverage.out -count=1
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# ── Build ─────────────────────────────────────────────────────────────────────

build:
	@mkdir -p $(BIN_DIR)
	$(GO) build -o $(BIN_DIR)/api     ./cmd/api
	$(GO) build -o $(BIN_DIR)/worker  ./cmd/worker
	$(GO) build -o $(BIN_DIR)/migrate ./cmd/migrate
	@echo "Binaries built in $(BIN_DIR)/"

# ── Run ───────────────────────────────────────────────────────────────────────

run-api:
	$(GO) run ./cmd/api

seed:
	$(GO) run ./cmd/seed

# ── Help ──────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "PIXS — Available targets:"
	@echo ""
	@echo "  db-up          Start Postgres + Redis via Docker Compose (waits for healthy)"
	@echo "  db-down        Stop Docker Compose services"
	@echo "  migrate        Apply pending Atlas migrations to local DB"
	@echo "  migrate-new    Create a new migration file  (name=<name> required)"
	@echo "  sqlc           Regenerate sqlc query code"
	@echo "  lint           Run golangci-lint"
	@echo "  vet            Run go vet"
	@echo "  test           Run all tests with race detector"
	@echo "  test-cover     Run tests and generate HTML coverage report"
	@echo "  build          Compile all three binaries to /bin"
	@echo "  run-api        Run the API server (loads .env if present)"
	@echo "  seed           Insert dev admin user (admin@pixs.local) — dev only"
	@echo ""
