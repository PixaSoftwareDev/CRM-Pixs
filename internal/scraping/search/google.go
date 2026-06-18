package search

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// GoogleProvider scrapes Google search results without an API key.
// Suitable for low-volume internal use (< 100 searches/day).
type GoogleProvider struct {
	client *http.Client
}

// NewGoogleProvider constructs a GoogleProvider.
func NewGoogleProvider() *GoogleProvider {
	return &GoogleProvider{
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

// Search performs a Google search and returns organic results.
// Cost is always 0 (no paid API).
func (g *GoogleProvider) Search(ctx context.Context, query, country, language string, limit int) ([]Result, float64, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	gl := country
	if gl == "" {
		gl = "ar"
	}
	hl := language
	if hl == "" {
		hl = "es"
	}

	searchURL := fmt.Sprintf(
		"https://www.google.com/search?q=%s&num=%d&hl=%s&gl=%s&pws=0&safe=off",
		url.QueryEscape(query), limit+5, hl, strings.ToLower(gl),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, http.NoBody)
	if err != nil {
		return nil, 0, fmt.Errorf("google search request: %w", err)
	}
	// Realistic browser headers to reduce chance of being blocked.
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "es-AR,es;q=0.9,en;q=0.8")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("google search fetch: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusForbidden {
		return nil, 0, fmt.Errorf("google bloqueó la búsqueda (status %d) — intentá de nuevo en unos minutos", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("google status %d", resp.StatusCode)
	}

	limited := io.LimitReader(resp.Body, 3*1024*1024)
	bodyBytes, err := io.ReadAll(limited)
	if err != nil {
		return nil, 0, fmt.Errorf("leyendo respuesta de Google: %w", err)
	}

	results := parseGoogleHTML(string(bodyBytes), limit)
	return results, 0, nil
}

// googleResultURL matches the href inside Google result anchors.
// Google wraps URLs in /url?q=<url>&... or uses jsname="UWckNb" href="<url>".
var googleURLPattern = regexp.MustCompile(`href="(https?://[^"]+)"[^>]*(?:jsname="UWckNb"|data-ved)`)
var googleRedirectPattern = regexp.MustCompile(`/url\?(?:[^"]*&)?q=(https?://[^&"]+)`)
var googleTitlePattern = regexp.MustCompile(`<h3[^>]*>([^<]+)</h3>`)

// googleBlocklist skips Google-own domains and irrelevant URLs.
var googleBlocklist = []string{
	"google.com", "google.com.ar", "youtube.com", "googleapis.com",
	"gstatic.com", "accounts.google", "maps.google", "play.google",
	"webcache.googleusercontent", "policies.google", "support.google",
	"translate.google",
}

func parseGoogleHTML(body string, limit int) []Result {
	var results []Result
	seen := make(map[string]bool)

	// Strategy 1: jsname="UWckNb" anchors (modern Google layout).
	matches := googleURLPattern.FindAllStringSubmatch(body, -1)
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		rawURL := m[1]
		if clean, ok := cleanGoogleURL(rawURL); ok && !seen[clean] {
			seen[clean] = true
			results = append(results, Result{URL: clean, Title: clean})
		}
		if len(results) >= limit {
			return results
		}
	}

	// Strategy 2: /url?q=<url> redirects.
	redirects := googleRedirectPattern.FindAllStringSubmatch(body, -1)
	for _, m := range redirects {
		if len(m) < 2 {
			continue
		}
		decoded, err := url.QueryUnescape(m[1])
		if err != nil {
			continue
		}
		if clean, ok := cleanGoogleURL(decoded); ok && !seen[clean] {
			seen[clean] = true
			results = append(results, Result{URL: clean, Title: clean})
		}
		if len(results) >= limit {
			return results
		}
	}

	return results
}

func cleanGoogleURL(raw string) (string, bool) {
	// Strip trailing garbage after spaces or HTML entities.
	if idx := strings.IndexAny(raw, " \t\n\r"); idx != -1 {
		raw = raw[:idx]
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	host := strings.ToLower(u.Host)
	for _, blocked := range googleBlocklist {
		if strings.Contains(host, blocked) {
			return "", false
		}
	}
	// Keep only scheme+host+path, drop tracking params.
	clean := u.Scheme + "://" + u.Host + u.Path
	clean = strings.TrimRight(clean, "/")
	return clean, clean != ""
}
