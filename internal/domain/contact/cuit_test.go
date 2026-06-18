package contact_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"pixs/internal/domain/contact"
)

// Known valid CUITs (verified with the AFIP algorithm):
//
// "20-36648743-4":
//   digits 0-9: 2,0,3,6,6,4,8,7,4,3
//   sum = 2*5+0*4+3*3+6*2+6*7+4*6+8*5+7*4+4*3+3*2 = 10+0+9+12+42+24+40+28+12+6 = 183
//   183 % 11 = 7  →  11-7 = 4  ✓
//
// "30-99887766-7":
//   digits 0-9: 3,0,9,9,8,8,7,7,6,6
//   sum = 3*5+0*4+9*3+9*2+8*7+8*6+7*5+7*4+6*3+6*2 = 15+0+27+18+56+48+35+28+18+12 = 257
//   257 % 11 = 4  →  11-4 = 7  ✓
//
// "20-33456789-2":
//   digits 0-9: 2,0,3,3,4,5,6,7,8,9
//   sum = 2*5+0*4+3*3+3*2+4*7+5*6+6*5+7*4+8*3+9*2 = 10+0+9+6+28+30+30+28+24+18 = 183
//   Wait that's the same sum as the first one — same verifier 4. Let me recalculate:
//   2*5=10, 0*4=0, 3*3=9, 3*2=6, 4*7=28, 5*6=30, 6*5=30, 7*4=28, 8*3=24, 9*2=18
//   sum = 10+0+9+6+28+30+30+28+24+18 = 183 → verifier = 4
//   So "20-33456789-4" is valid, not "20-33456789-2"
//
// "23-45678901-6":
//   digits 0-9: 2,3,4,5,6,7,8,9,0,1
//   sum = 2*5+3*4+4*3+5*2+6*7+7*6+8*5+9*4+0*3+1*2 = 10+12+12+10+42+42+40+36+0+2 = 206
//   206 % 11: 11*18=198, 206-198=8 → 11-8=3
//   So "23-45678901-3" is valid

func TestParseCUIT_Valid(t *testing.T) {
	cases := []struct {
		input   string
		wantRaw string
		wantFmt string
	}{
		// With hyphens
		{"20-36648743-4", "20366487434", "20-36648743-4"},
		{"30-99887766-7", "30998877667", "30-99887766-7"},
		{"20-33456789-4", "20334567894", "20-33456789-4"},
		{"23-45678901-3", "23456789013", "23-45678901-3"},
		// Without hyphens
		{"20366487434", "20366487434", "20-36648743-4"},
		{"30998877667", "30998877667", "30-99887766-7"},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			cuit, err := contact.ParseCUIT(tc.input)
			require.NoError(t, err)
			assert.Equal(t, tc.wantRaw, cuit.Raw())
			assert.Equal(t, tc.wantFmt, cuit.String())
		})
	}
}

func TestParseCUIT_Invalid(t *testing.T) {
	cases := []struct {
		name  string
		input string
	}{
		{"wrong verifier digit", "20-36648743-5"},   // correct is 4
		{"wrong verifier digit 2", "30-99887766-3"}, // correct is 7
		{"too short", "2036648743"},                 // 10 digits
		{"too long", "203664874340"},                // 12 digits
		{"empty string", ""},
		{"letters in middle", "20-ABCDEFGH-4"},
		// "00000000001": sum=0, 0%11=0 → expected verifier=0, actual=1 → mismatch
		{"all zeros wrong verifier", "00000000001"},
		// "00000000060": digits[9]=6 → sum=12, 12%11=1 → verifier would be 10 (two digits) → invalid
		{"remainder one gives two digit verifier", "00000000060"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := contact.ParseCUIT(tc.input)
			assert.ErrorIs(t, err, contact.ErrInvalidCUIT)
		})
	}
}

func TestCUIT_String(t *testing.T) {
	cuit, err := contact.ParseCUIT("20366487434")
	require.NoError(t, err)
	assert.Equal(t, "20-36648743-4", cuit.String())
}

func TestCUIT_Raw(t *testing.T) {
	cuit, err := contact.ParseCUIT("20-36648743-4")
	require.NoError(t, err)
	assert.Equal(t, "20366487434", cuit.Raw())
}
