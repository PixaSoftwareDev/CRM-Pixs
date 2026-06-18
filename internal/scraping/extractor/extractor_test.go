package extractor

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const emailFixture = `
<html><body>
  <p>Escribinos a contacto[at]empresa.com.ar para consultas.</p>
  <p>Ventas: ventas (arroba) empresa (dot) com</p>
  <a href="mailto:hola@studio.io">hola@studio.io</a>
  <img src="logo.png">
  <span>noreply@empresa.com.ar</span>
</body></html>`

const phoneFixture = `
<html><body>
  <p>Celular: +54 9 11 4555-1234</p>
  <p>Fijo: +54 11 4444-5555</p>
  <p>USA office: +1 415 555 2671</p>
  <p>basura: 123</p>
</body></html>`

const socialFixture = `
<html><body>
  <a href="https://www.instagram.com/mi.empresa">IG</a>
  <a href="https://linkedin.com/company/mi-empresa-sa">LinkedIn</a>
  <a href="https://www.facebook.com/MiEmpresaOficial">FB</a>
  <a href="https://wa.me/5491145551234">WhatsApp</a>
  <a href="https://facebook.com/sharer?u=x">share</a>
</body></html>`

const schemaFixture = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Estudio Creativo SA",
  "description": "Agencia de diseño y branding",
  "telephone": "+54 11 4000-1000",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Av. Corrientes 1234",
    "addressLocality": "Buenos Aires",
    "postalCode": "C1043"
  }
}
</script>
</head><body></body></html>`

func TestExtractEmails_Obfuscation(t *testing.T) {
	r := Extract(context.Background(), []string{emailFixture}, "AR")

	got := map[string]bool{}
	for _, e := range r.Emails {
		got[e.Email] = true
	}
	assert.True(t, got["contacto@empresa.com.ar"], "deobfuscated [at] email")
	assert.True(t, got["ventas@empresa.com"], "deobfuscated (arroba)/(dot) email")
	assert.True(t, got["hola@studio.io"], "plain email")
	assert.False(t, got["noreply@empresa.com.ar"], "denylisted noreply email rejected")
	assert.NotContains(t, got, "logo.png")
}

func TestExtractPhones_Libphonenumber(t *testing.T) {
	r := Extract(context.Background(), []string{phoneFixture}, "AR")

	byE164 := map[string]PhoneResult{}
	for _, p := range r.Phones {
		byE164[p.E164] = p
	}
	require.Contains(t, byE164, "+5491145551234", "AR mobile normalized to E164")
	assert.Equal(t, "mobile", byE164["+5491145551234"].Type)

	require.Contains(t, byE164, "+541144445555", "AR landline normalized")
	assert.Equal(t, "landline", byE164["+541144445555"].Type)

	require.Contains(t, byE164, "+14155552671", "US number normalized")
	assert.Equal(t, "US", byE164["+14155552671"].Country)
}

func TestExtractSocials(t *testing.T) {
	r := Extract(context.Background(), []string{socialFixture}, "AR")

	type sk struct{ platform, handle string }
	got := map[sk]bool{}
	for _, s := range r.Socials {
		got[sk{s.Platform, s.Handle}] = true
	}
	assert.True(t, got[sk{"instagram", "mi.empresa"}])
	assert.True(t, got[sk{"linkedin", "mi-empresa-sa"}])
	assert.True(t, got[sk{"facebook", "MiEmpresaOficial"}])
	assert.True(t, got[sk{"whatsapp", "5491145551234"}])
	assert.False(t, got[sk{"facebook", "share"}], "share path must be skipped")
}

func TestExtractSchemaOrg(t *testing.T) {
	r := Extract(context.Background(), []string{schemaFixture}, "AR")

	require.NotNil(t, r.SchemaOrg)
	assert.Equal(t, "Estudio Creativo SA", r.SchemaOrg.Name)
	assert.Equal(t, "Agencia de diseño y branding", r.SchemaOrg.Description)
	assert.Equal(t, "+54 11 4000-1000", r.SchemaOrg.Telephone)
	assert.Contains(t, r.SchemaOrg.Address, "Av. Corrientes 1234")
	assert.Contains(t, r.SchemaOrg.Address, "Buenos Aires")
}

func TestExtract_Dedup(t *testing.T) {
	dup := `
	<p>contacto@empresa.com.ar</p>
	<p>contacto@empresa.com.ar</p>
	<p>+54 9 11 4555-1234</p>
	<p>+54 9 11 4555-1234</p>
	<a href="https://instagram.com/mi.empresa">a</a>
	<a href="https://instagram.com/mi.empresa">b</a>`

	r := Extract(context.Background(), []string{dup, dup}, "AR")

	emailCount := 0
	for _, e := range r.Emails {
		if e.Email == "contacto@empresa.com.ar" {
			emailCount++
		}
	}
	assert.Equal(t, 1, emailCount, "email deduped across pages")

	phoneCount := 0
	for _, p := range r.Phones {
		if p.E164 == "+5491145551234" {
			phoneCount++
		}
	}
	assert.Equal(t, 1, phoneCount, "phone deduped")

	igCount := 0
	for _, s := range r.Socials {
		if s.Platform == "instagram" {
			igCount++
		}
	}
	assert.Equal(t, 1, igCount, "social deduped")
}
