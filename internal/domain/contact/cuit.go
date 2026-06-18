package contact

import "strings"

// CUIT represents a validated Argentine CUIT or CUIL number.
// The stored value is always the canonical 11-digit string without separators.
type CUIT struct {
	value string // 11 digits, no separators
}

// cuitMultipliers are the official AFIP multiplicadores for verifier digit calculation.
// Applied to digits 0–9 (left to right, excluding the last verifier digit).
var cuitMultipliers = [10]int{5, 4, 3, 2, 7, 6, 5, 4, 3, 2}

// ParseCUIT parses and validates a CUIT/CUIL string.
// Accepted formats: "20-12345678-9", "20123456789" (11 digits, no separators).
// Returns ErrInvalidCUIT if the format is wrong or the verifier digit doesn't match.
func ParseCUIT(s string) (CUIT, error) {
	digits := strings.ReplaceAll(s, "-", "")
	digits = strings.TrimSpace(digits)

	if len(digits) != 11 {
		return CUIT{}, ErrInvalidCUIT
	}

	nums := make([]int, 11)
	for i, ch := range digits {
		if ch < '0' || ch > '9' {
			return CUIT{}, ErrInvalidCUIT
		}
		nums[i] = int(ch - '0')
	}

	var sum int
	for i := 0; i < 10; i++ {
		sum += nums[i] * cuitMultipliers[i]
	}

	remainder := sum % 11
	var expected int
	switch remainder {
	case 0:
		expected = 0
	case 1:
		// AFIP never assigns CUITs that would result in verifier digit 1.
		return CUIT{}, ErrInvalidCUIT
	default:
		expected = 11 - remainder
	}

	if nums[10] != expected {
		return CUIT{}, ErrInvalidCUIT
	}

	return CUIT{value: digits}, nil
}

// String returns the CUIT formatted as "XX-XXXXXXXX-X".
func (c CUIT) String() string {
	if len(c.value) != 11 {
		return c.value
	}
	return c.value[:2] + "-" + c.value[2:10] + "-" + c.value[10:]
}

// Raw returns the 11-digit string without separators.
func (c CUIT) Raw() string { return c.value }
