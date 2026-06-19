// Package extractor performs deterministic extraction of contact data
// (emails, phones, social handles, schema.org org info) from HTML pages.
package extractor

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"

	"github.com/nyaruka/phonenumbers"
	"golang.org/x/net/html"
)

// Result holds all extracted data from one or more HTML pages.
type Result struct {
	Emails    []EmailResult
	Phones    []PhoneResult
	Socials   []SocialResult
	SchemaOrg *SchemaOrgData
}

// EmailResult is an extracted email address with optional surrounding context.
type EmailResult struct {
	Email   string
	Context string
}

// PhoneResult is a normalized, validated phone number.
type PhoneResult struct {
	E164    string
	Raw     string
	Type    string // mobile/landline/tollfree/unknown
	Country string
	Context string
}

// SocialResult is an extracted social-network handle.
type SocialResult struct {
	Platform string
	Handle   string
	URL      string
}

// SchemaOrgData holds organization info parsed from JSON-LD.
type SchemaOrgData struct {
	Name        string
	Description string
	Telephone   string
	Address     string
}

// emailDenylist contains substrings that disqualify an email match.
var emailDenylist = []string{
	"no-reply", "noreply", "example.com", "test@", "info@test",
	"user@", "admin@", "webmaster@", ".png", ".jpg", ".gif", ".css",
}

// urlEncodePrefix matches URL-encoded characters (e.g. %20) that appear before
// an email address when the mailto: href is not properly decoded before regex.
var urlEncodedPrefix = regexp.MustCompile(`(?i)%[0-9a-f]{2}`)

var emailRegex = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)

var socialPatterns = map[string]*regexp.Regexp{
	"instagram": regexp.MustCompile(`(?:https?://)?(?:www\.)?instagram\.com/([A-Za-z0-9_.]+)`),
	"linkedin":  regexp.MustCompile(`(?:https?://)?(?:www\.)?linkedin\.com/(?:company|in)/([A-Za-z0-9_\-]+)`),
	"facebook":  regexp.MustCompile(`(?:https?://)?(?:www\.)?facebook\.com/([A-Za-z0-9_.]+)`),
	"tiktok":    regexp.MustCompile(`(?:https?://)?(?:www\.)?tiktok\.com/@([A-Za-z0-9_.]+)`),
	"youtube":   regexp.MustCompile(`(?:https?://)?(?:www\.)?youtube\.com/(?:channel|@|c/)([A-Za-z0-9_\-]+)`),
	"whatsapp":  regexp.MustCompile(`(?:https?://)?(?:wa\.me|api\.whatsapp\.com/send\?phone=)(?:/)?([0-9]+)`),
}

// phoneRegex matches international and local phone numbers. The trailing
// optional group lets it span Argentine mobile numbers written with the "9"
// prefix (e.g. "+54 9 11 4555-1234"), which carry an extra digit group.
var phoneRegex = regexp.MustCompile(`(?:(?:\+|00)[1-9]\d{0,3}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{3,4}(?:[\s\-.]?\d{3,4})?`)
var nonPhoneChars = regexp.MustCompile(`[^\d+]`)

// Extract runs all deterministic extractors on the combined HTML pages.
func Extract(_ context.Context, htmlPages []string, defaultCountry string) Result {
	var r Result
	seenEmail := make(map[string]bool)
	seenPhone := make(map[string]bool)
	seenSocial := make(map[string]bool)

	combined := strings.Join(htmlPages, "\n")

	for _, e := range extractEmails(combined) {
		if !seenEmail[strings.ToLower(e.Email)] {
			seenEmail[strings.ToLower(e.Email)] = true
			r.Emails = append(r.Emails, e)
		}
	}

	for _, p := range extractPhones(combined, defaultCountry) {
		if !seenPhone[p.E164] {
			seenPhone[p.E164] = true
			r.Phones = append(r.Phones, p)
		}
	}

	for _, s := range extractSocials(combined) {
		key := s.Platform + ":" + s.URL
		if !seenSocial[key] {
			seenSocial[key] = true
			r.Socials = append(r.Socials, s)
		}
	}

	r.SchemaOrg = extractSchemaOrg(combined)
	return r
}

// deobfuscationTokens map common at/dot obfuscations (optionally space-padded)
// to their real characters.
var deobfuscationTokens = regexp.MustCompile(`(?i)\s*(?:\[at\]|\(at\)| at |\[arroba\]|\(arroba\))\s*`)
var dotTokens = regexp.MustCompile(`(?i)\s*(?:\[dot\]|\(dot\)|\[punto\]|\(punto\))\s*`)

func extractEmails(body string) []EmailResult {
	// Strip URL-encoded prefixes (e.g. %20 before mailto addresses).
	body = urlEncodedPrefix.ReplaceAllString(body, "")
	// Deobfuscate common patterns, collapsing any surrounding whitespace so the
	// reconstructed address matches the email regex.
	body = deobfuscationTokens.ReplaceAllString(body, "@")
	body = dotTokens.ReplaceAllString(body, ".")

	matches := emailRegex.FindAllString(body, -1)
	var results []EmailResult

outer:
	for _, m := range matches {
		lower := strings.ToLower(m)
		for _, deny := range emailDenylist {
			if strings.Contains(lower, deny) {
				continue outer
			}
		}
		results = append(results, EmailResult{Email: lower})
	}
	return results
}

func extractPhones(body, defaultCountry string) []PhoneResult {
	if defaultCountry == "" {
		defaultCountry = "AR"
	}

	text := htmlToText(body)
	raw := phoneRegex.FindAllString(text, -1)
	var results []PhoneResult

	for _, candidate := range raw {
		cleaned := nonPhoneChars.ReplaceAllString(candidate, "")
		if len(cleaned) < 7 || len(cleaned) > 15 {
			continue
		}

		num, err := phonenumbers.Parse(cleaned, defaultCountry)
		if err != nil {
			num, err = phonenumbers.Parse("+"+cleaned, defaultCountry)
			if err != nil {
				continue
			}
		}
		if !phonenumbers.IsValidNumber(num) {
			continue
		}

		numType := "unknown"
		switch phonenumbers.GetNumberType(num) {
		case phonenumbers.MOBILE:
			numType = "mobile"
		case phonenumbers.FIXED_LINE:
			numType = "landline"
		case phonenumbers.TOLL_FREE:
			numType = "tollfree"
		}

		results = append(results, PhoneResult{
			E164:    phonenumbers.Format(num, phonenumbers.E164),
			Raw:     candidate,
			Type:    numType,
			Country: phonenumbers.GetRegionCodeForNumber(num),
		})
	}
	return results
}

func extractSocials(body string) []SocialResult {
	var results []SocialResult
	for platform, re := range socialPatterns {
		for _, m := range re.FindAllStringSubmatch(body, -1) {
			if len(m) < 2 {
				continue
			}
			handle := m[1]
			switch handle {
			case "share", "sharer", "intent", "p", "tr":
				continue
			}
			results = append(results, SocialResult{
				Platform: platform,
				Handle:   handle,
				URL:      m[0],
			})
		}
	}
	return results
}

var jsonLDRegex = regexp.MustCompile(`(?s)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>`)

func extractSchemaOrg(body string) *SchemaOrgData {
	for _, m := range jsonLDRegex.FindAllStringSubmatch(body, -1) {
		if len(m) < 2 {
			continue
		}

		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(strings.TrimSpace(m[1])), &obj); err != nil {
			continue
		}

		schemaType, _ := obj["@type"].(string)
		if schemaType != "Organization" && schemaType != "LocalBusiness" && schemaType != "Corporation" {
			continue
		}

		data := &SchemaOrgData{}
		if name, ok := obj["name"].(string); ok {
			data.Name = name
		}
		if desc, ok := obj["description"].(string); ok {
			data.Description = desc
		}
		if tel, ok := obj["telephone"].(string); ok {
			data.Telephone = tel
		}
		if addr, ok := obj["address"]; ok {
			switch v := addr.(type) {
			case string:
				data.Address = v
			case map[string]interface{}:
				var parts []string
				for _, k := range []string{"streetAddress", "addressLocality", "addressRegion", "postalCode"} {
					if s, ok := v[k].(string); ok && s != "" {
						parts = append(parts, s)
					}
				}
				data.Address = strings.Join(parts, ", ")
			}
		}
		return data
	}
	return nil
}

// htmlToText extracts visible text from HTML for phone parsing.
func htmlToText(htmlBody string) string {
	doc, err := html.Parse(strings.NewReader(htmlBody))
	if err != nil {
		return htmlBody
	}
	var sb strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			sb.WriteString(" ")
			sb.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return ' '
		}
		return r
	}, sb.String())
}
