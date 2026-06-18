package calendar

import "errors"

var (
	ErrEventNotFound      = errors.New("evento de calendario no encontrado")
	ErrEventTypeNotFound  = errors.New("tipo de evento no encontrado")
	ErrEventTypeDuplicate = errors.New("ya existe un tipo de evento con ese nombre")
	ErrInvalidEventStatus = errors.New("estado de evento inválido (válidos: pending, done, rescheduled, cancelled)")
	ErrForbidden          = errors.New("acceso denegado")
)
