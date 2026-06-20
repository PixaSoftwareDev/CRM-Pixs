-- Postal code reference lookups for sqlc generation.

-- name: LookupPostalCode :many
SELECT postal_code, locality, province, phone_prefix
FROM postal_codes
WHERE postal_code = $1
ORDER BY locality
LIMIT 50;

-- name: CountPostalCodes :one
SELECT count(*) FROM postal_codes;
