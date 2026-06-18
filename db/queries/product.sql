-- name: CreateProduct :one
INSERT INTO products (company_id, code, name, description, unit, unit_price, currency, cost, vat_rate_pct, category, is_recurring, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING *;

-- name: GetProductByID :one
SELECT * FROM products WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;

-- name: ListProducts :many
SELECT * FROM products
WHERE company_id = $1
  AND deleted_at IS NULL
  AND ($2::boolean IS NULL OR is_active = $2)
  AND ($3::text = '' OR category = $3)
ORDER BY name;

-- name: UpdateProduct :one
UPDATE products SET
    code = $3, name = $4, description = $5, unit = $6, unit_price = $7,
    currency = $8, cost = $9, vat_rate_pct = $10, category = $11,
    is_recurring = $12, is_active = $13, updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProduct :exec
UPDATE products SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL;
