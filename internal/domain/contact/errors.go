// Package contact — domain errors for the contact bounded context.
package contact

import "errors"

var (
	ErrContactNotFound        = errors.New("contacto no encontrado")
	ErrContactDeleted         = errors.New("contacto eliminado")
	ErrCUITAlreadyExists      = errors.New("ya existe un contacto con ese CUIT/CUIL")
	ErrInvalidCUIT            = errors.New("CUIT/CUIL inválido")
	ErrInvalidContactKind     = errors.New("tipo de contacto inválido (válidos: client, supplier, prospect, lead)")
	ErrInvalidVatCondition    = errors.New("condición fiscal inválida")
	ErrInvalidLifecycleStatus = errors.New("estado del ciclo de vida inválido")
	ErrPersonNotFound         = errors.New("persona de contacto no encontrada")
	ErrBankAccountNotFound    = errors.New("cuenta bancaria no encontrada")
	ErrTagNotFound            = errors.New("etiqueta no encontrada")
	ErrTagAlreadyExists       = errors.New("ya existe una etiqueta con ese nombre")
	ErrForbidden              = errors.New("acceso denegado")
	ErrNoteBodyRequired       = errors.New("el cuerpo de la nota no puede estar vacío")
)
