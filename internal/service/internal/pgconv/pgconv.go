// Package pgconv holds conversion helpers between pgtype values and domain types.
package pgconv

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
)

// NumericToDecimal converts a pgtype.Numeric to a *decimal.Decimal (nil if invalid).
func NumericToDecimal(n pgtype.Numeric) *decimal.Decimal {
	if !n.Valid || n.Int == nil {
		return nil
	}
	d := decimal.NewFromBigInt(n.Int, n.Exp)
	return &d
}

// NumericToDecimalZero converts a pgtype.Numeric to a decimal.Decimal (zero if invalid).
func NumericToDecimalZero(n pgtype.Numeric) decimal.Decimal {
	if d := NumericToDecimal(n); d != nil {
		return *d
	}
	return decimal.Zero
}

// DecimalToNumeric converts a *decimal.Decimal to a pgtype.Numeric.
func DecimalToNumeric(d *decimal.Decimal) pgtype.Numeric {
	var n pgtype.Numeric
	if d == nil {
		return n
	}
	_ = n.Scan(d.String())
	return n
}

// DecimalToNumericValue converts a decimal.Decimal to a (valid) pgtype.Numeric.
func DecimalToNumericValue(d decimal.Decimal) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(d.String())
	return n
}

// UUIDPtr converts a pgtype.UUID to a *uuid.UUID (nil if invalid).
func UUIDPtr(u pgtype.UUID) *uuid.UUID {
	if !u.Valid {
		return nil
	}
	id := uuid.UUID(u.Bytes)
	return &id
}

// PtrUUID converts a *uuid.UUID to a pgtype.UUID.
func PtrUUID(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}

// TimePtr converts a pgtype.Date to a *time.Time (nil if invalid).
func TimePtr(d pgtype.Date) *time.Time {
	if !d.Valid {
		return nil
	}
	t := d.Time
	return &t
}

// TimestamptzPtr converts a pgtype.Timestamptz to a *time.Time (nil if invalid).
func TimestamptzPtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

// PtrDate converts a *time.Time to a pgtype.Date.
func PtrDate(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: *t, Valid: true}
}
