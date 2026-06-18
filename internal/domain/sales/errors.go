// Package sales holds the domain model for products, the sales pipeline, and quotes.
package sales

import "github.com/cockroachdb/errors"

var (
	// ErrProductNotFound is returned when a product cannot be found.
	ErrProductNotFound = errors.New("producto no encontrado")
	// ErrProductCodeExists is returned when a product code already exists.
	ErrProductCodeExists = errors.New("ya existe un producto con ese código")
	// ErrOpportunityNotFound is returned when an opportunity cannot be found.
	ErrOpportunityNotFound = errors.New("oportunidad no encontrada")
	// ErrInvalidProbability is returned when probability is out of range.
	ErrInvalidProbability = errors.New("probabilidad debe estar entre 0 y 100")
	// ErrNoWinStage is returned when no win stage is configured.
	ErrNoWinStage = errors.New("no existe etapa de ganada configurada")
	// ErrNoLossStage is returned when no loss stage is configured.
	ErrNoLossStage = errors.New("no existe etapa de perdida configurada")
	// ErrQuoteNotFound is returned when a quote cannot be found.
	ErrQuoteNotFound = errors.New("presupuesto no encontrado")
	// ErrQuoteNumberExists is returned when a quote number already exists.
	ErrQuoteNumberExists = errors.New("ya existe un presupuesto con ese número")
	// ErrInvalidQuoteStatus is returned when a quote status is invalid.
	ErrInvalidQuoteStatus = errors.New("estado de presupuesto inválido")
	// ErrStageNotFound is returned when a pipeline stage cannot be found.
	ErrStageNotFound = errors.New("etapa de pipeline no encontrada")
	// ErrForbidden is returned when access is denied.
	ErrForbidden = errors.New("acceso denegado")
)
