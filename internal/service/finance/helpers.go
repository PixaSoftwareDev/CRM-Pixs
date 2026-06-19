// Package finance implements the application-layer services for the finance
// bounded context: invoicing, receipts, payment orders, treasury, expenses,
// recurring payments and payment obligations.
package finance

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	sqlcgen "pixs/internal/repository/sqlc"
)

func strPtr(s string) *string { return &s }

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint")
}

// auditAction normalizes finance-specific actions to the values permitted by
// the audit_logs CHECK constraint (create/update/delete/restore/export/...).
// The fine-grained intent is preserved in the entity's after_state snapshot.
func auditAction(action string) string {
	switch action {
	case "create":
		return "create"
	case "delete", "void":
		return "delete"
	default: // issue, open, close, reconcile, transfer, pay, update, ...
		return "update"
	}
}

// writeAudit appends an entry to the append-only audit_logs table.
func writeAudit(ctx context.Context, q *sqlcgen.Queries, companyID uuid.UUID, entityType string, before, after any, userID *uuid.UUID, entityID uuid.UUID, action string) {
	action = auditAction(action)
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
