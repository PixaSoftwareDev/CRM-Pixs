// Package validator provides an Echo-compatible request validator using go-playground/validator.
package validator

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// Validator wraps go-playground/validator for Echo.
type Validator struct {
	v *validator.Validate
}

// New returns a Validator ready to use with echo.Echo.Validator.
func New() *Validator {
	return &Validator{v: validator.New()}
}

// Validate implements echo.Validator.
func (val *Validator) Validate(i any) error {
	if err := val.v.Struct(i); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return nil
}
