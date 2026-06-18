package vault

import "github.com/cockroachdb/errors"

var (
	ErrNotFound  = errors.New("entrada no encontrada")
	ErrForbidden = errors.New("acceso denegado")
	ErrNoLabel   = errors.New("el nombre de la entrada es obligatorio")
)
