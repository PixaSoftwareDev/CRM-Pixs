package finance

import (
	"context"
	"log/slog"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "pixs/internal/repository/sqlc"
)

// CatalogService exposes the finance catalogs (VAT rates, payment conditions,
// expense categories, currencies).
type CatalogService struct {
	q      *sqlcgen.Queries
	logger *slog.Logger
}

// NewCatalogService constructs a CatalogService.
func NewCatalogService(db *pgxpool.Pool, logger *slog.Logger) *CatalogService {
	return &CatalogService{q: sqlcgen.New(db), logger: logger}
}

// ListVATRates returns active VAT rates.
func (s *CatalogService) ListVATRates(ctx context.Context, companyID uuid.UUID) ([]sqlcgen.VatRate, error) {
	rows, err := s.q.ListVATRates(ctx, companyID)
	return rows, errors.Wrap(err, "listing vat rates")
}

// ListPaymentConditions returns active payment conditions.
func (s *CatalogService) ListPaymentConditions(ctx context.Context, companyID uuid.UUID) ([]sqlcgen.PaymentCondition, error) {
	rows, err := s.q.ListPaymentConditions(ctx, companyID)
	return rows, errors.Wrap(err, "listing payment conditions")
}

// ListExpenseCategories returns active expense categories.
func (s *CatalogService) ListExpenseCategories(ctx context.Context, companyID uuid.UUID) ([]sqlcgen.ExpenseCategory, error) {
	rows, err := s.q.ListExpenseCategories(ctx, companyID)
	return rows, errors.Wrap(err, "listing expense categories")
}

// ListCurrencies returns all currencies.
func (s *CatalogService) ListCurrencies(ctx context.Context) ([]sqlcgen.Currency, error) {
	rows, err := s.q.ListCurrencies(ctx)
	return rows, errors.Wrap(err, "listing currencies")
}
