// Package lead defines the domain entities, value objects and business
// invariants for the leads bounded context. It has no infrastructure deps.
package lead

import "github.com/cockroachdb/errors"

// Domain errors for the leads + scraping bounded context.
var (
	ErrLeadNotFound            = errors.New("lead no encontrado")
	ErrInvalidStatusTransition = errors.New("transición de estado inválida")
	ErrLeadAlreadyConverted    = errors.New("el lead ya fue convertido")
	ErrForbidden               = errors.New("acceso denegado")
	ErrDuplicateLead           = errors.New("ya existe un lead con ese sitio web o nombre")
	ErrQuotaExceeded           = errors.New("cuota diaria de scraping excedida")
	ErrNoSearchAPIKey          = errors.New("PIXS_SERPER_API_KEY no configurada")
	ErrNoLLMAPIKey             = errors.New("PIXS_ANTHROPIC_API_KEY no configurada")
)
