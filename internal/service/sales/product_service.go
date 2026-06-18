// Package sales implements the application-layer services for products,
// the sales pipeline, and quotes.
package sales

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	domain "pixs/internal/domain/sales"
	sqlcgen "pixs/internal/repository/sqlc"
	"pixs/internal/service/internal/pgconv"
)

// ProductService manages the product catalog.
type ProductService struct {
	q      *sqlcgen.Queries
	db     *pgxpool.Pool
	logger *slog.Logger
}

// NewProductService constructs a ProductService.
func NewProductService(db *pgxpool.Pool, logger *slog.Logger) *ProductService {
	return &ProductService{q: sqlcgen.New(db), db: db, logger: logger}
}

// ProductInput holds the data for creating or updating a product.
type ProductInput struct {
	Code        *string
	Name        string
	Description *string
	Unit        *string
	UnitPrice   *decimal.Decimal
	Currency    *string
	Cost        *decimal.Decimal
	VATRatePct  *decimal.Decimal
	Category    *string
	IsRecurring bool
	IsActive    bool
}

// CreateProduct creates a new product.
func (s *ProductService) CreateProduct(ctx context.Context, companyID uuid.UUID, userID *uuid.UUID, in ProductInput) (*domain.Product, error) {
	row, err := s.q.CreateProduct(ctx, sqlcgen.CreateProductParams{
		CompanyID:   companyID,
		Code:        in.Code,
		Name:        in.Name,
		Description: in.Description,
		Unit:        in.Unit,
		UnitPrice:   pgconv.DecimalToNumeric(in.UnitPrice),
		Currency:    in.Currency,
		Cost:        pgconv.DecimalToNumeric(in.Cost),
		VatRatePct:  pgconv.DecimalToNumeric(in.VATRatePct),
		Category:    in.Category,
		IsRecurring: in.IsRecurring,
		IsActive:    in.IsActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errors.WithStack(domain.ErrProductCodeExists)
		}
		return nil, errors.Wrap(err, "creating product")
	}
	p := productFromRow(row)
	s.writeAudit(ctx, companyID, nil, p, userID, p.ID, "create")
	return p, nil
}

// GetProduct returns a product by ID.
func (s *ProductService) GetProduct(ctx context.Context, companyID, id uuid.UUID) (*domain.Product, error) {
	row, err := s.q.GetProductByID(ctx, sqlcgen.GetProductByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrProductNotFound)
	}
	return productFromRow(row), nil
}

// ListProducts returns products, optionally filtered by active flag and category.
func (s *ProductService) ListProducts(ctx context.Context, companyID uuid.UUID, activeOnly bool, category string) ([]*domain.Product, error) {
	rows, err := s.q.ListProducts(ctx, sqlcgen.ListProductsParams{
		CompanyID: companyID,
		Column2:   activeOnly,
		Column3:   category,
	})
	if err != nil {
		return nil, errors.Wrap(err, "listing products")
	}
	out := make([]*domain.Product, 0, len(rows))
	for _, r := range rows {
		out = append(out, productFromRow(r))
	}
	return out, nil
}

// UpdateProduct updates a product.
func (s *ProductService) UpdateProduct(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID, in ProductInput) (*domain.Product, error) {
	existing, err := s.q.GetProductByID(ctx, sqlcgen.GetProductByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return nil, errors.WithStack(domain.ErrProductNotFound)
	}
	row, err := s.q.UpdateProduct(ctx, sqlcgen.UpdateProductParams{
		ID:          id,
		CompanyID:   companyID,
		Code:        in.Code,
		Name:        in.Name,
		Description: in.Description,
		Unit:        in.Unit,
		UnitPrice:   pgconv.DecimalToNumeric(in.UnitPrice),
		Currency:    in.Currency,
		Cost:        pgconv.DecimalToNumeric(in.Cost),
		VatRatePct:  pgconv.DecimalToNumeric(in.VATRatePct),
		Category:    in.Category,
		IsRecurring: in.IsRecurring,
		IsActive:    in.IsActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, errors.WithStack(domain.ErrProductCodeExists)
		}
		return nil, errors.Wrap(err, "updating product")
	}
	before := productFromRow(existing)
	after := productFromRow(row)
	s.writeAudit(ctx, companyID, before, after, userID, id, "update")
	return after, nil
}

// DeleteProduct soft-deletes a product.
func (s *ProductService) DeleteProduct(ctx context.Context, companyID, id uuid.UUID, userID *uuid.UUID) error {
	existing, err := s.q.GetProductByID(ctx, sqlcgen.GetProductByIDParams{ID: id, CompanyID: companyID})
	if err != nil {
		return errors.WithStack(domain.ErrProductNotFound)
	}
	if err := s.q.SoftDeleteProduct(ctx, sqlcgen.SoftDeleteProductParams{ID: id, CompanyID: companyID}); err != nil {
		return errors.Wrap(err, "deleting product")
	}
	s.writeAudit(ctx, companyID, productFromRow(existing), nil, userID, id, "delete")
	return nil
}

func (s *ProductService) writeAudit(ctx context.Context, companyID uuid.UUID, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	writeAudit(ctx, s.q, companyID, "product", before, after, userID, entityID, action)
}

func productFromRow(r sqlcgen.Product) *domain.Product {
	return &domain.Product{
		ID:          r.ID,
		CompanyID:   r.CompanyID,
		Code:        r.Code,
		Name:        r.Name,
		Description: r.Description,
		Unit:        r.Unit,
		UnitPrice:   pgconv.NumericToDecimal(r.UnitPrice),
		Currency:    r.Currency,
		Cost:        pgconv.NumericToDecimal(r.Cost),
		VATRatePct:  pgconv.NumericToDecimal(r.VatRatePct),
		Category:    r.Category,
		IsRecurring: r.IsRecurring,
		IsActive:    r.IsActive,
		CreatedAt:   r.CreatedAt.Time,
		UpdatedAt:   r.UpdatedAt.Time,
		DeletedAt:   pgconv.TimestamptzPtr(r.DeletedAt),
	}
}

// ─── Shared helpers for the sales package ──────────────────────────────────────

func isUniqueViolation(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint"))
}

func writeAudit(ctx context.Context, q *sqlcgen.Queries, companyID uuid.UUID, entityType string, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	var beforeJSON, afterJSON []byte
	if before != nil {
		beforeJSON, _ = json.Marshal(before)
	}
	if after != nil {
		afterJSON, _ = json.Marshal(after)
	}
	uid := pgtype.UUID{}
	if userID != nil {
		uid = pgtype.UUID{Bytes: *userID, Valid: true}
	}
	_ = q.InsertAuditLog(ctx, sqlcgen.InsertAuditLogParams{
		CompanyID:   companyID,
		UserID:      uid,
		EntityType:  entityType,
		EntityID:    entityID,
		Action:      action,
		BeforeState: beforeJSON,
		AfterState:  afterJSON,
	})
}
