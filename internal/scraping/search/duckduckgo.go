package search

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// DDGProvider scrapes DuckDuckGo HTML results without an API key.
// Uses the html.duckduckgo.com endpoint which returns plain HTML and is
// significantly more reliable than scraping Google (no CAPTCHA, no consent).
type DDGProvider struct {
	client *http.Client
	logger *slog.Logger
}

// NewDDGProvider constructs a DuckDuckGo search provider.
func NewDDGProvider(logger *slog.Logger) *DDGProvider {
	if logger == nil {
		logger = slog.Default()
	}
	return &DDGProvider{
		client: &http.Client{Timeout: 20 * time.Second},
		logger: logger,
	}
}

// Search queries DuckDuckGo and returns organic results.
func (d *DDGProvider) Search(ctx context.Context, query, country, language string, limit int) ([]Result, float64, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	kl := "ar-es"
	if country != "" {
		kl = strings.ToLower(country) + "-" + strings.ToLower(language)
		if language == "" {
			kl = strings.ToLower(country) + "-es"
		}
	}

	// DuckDuckGo HTML endpoint — POST with form data is more reliable than GET.
	formData := url.Values{}
	formData.Set("q", query)
	formData.Set("kl", kl)
	formData.Set("df", "")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://html.duckduckgo.com/html/",
		strings.NewReader(formData.Encode()),
	)
	if err != nil {
		return nil, 0, fmt.Errorf("ddg search request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "es-AR,es;q=0.9,en;q=0.8")
	req.Header.Set("Origin", "https://duckduckgo.com")
	req.Header.Set("Referer", "https://duckduckgo.com/")

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("ddg search fetch: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("duckduckgo status %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 3*1024*1024))
	if err != nil {
		return nil, 0, fmt.Errorf("leyendo respuesta: %w", err)
	}

	results := parseDDGHTML(string(bodyBytes), limit)
	d.logger.Info("duckduckgo search", "query", query, "results", len(results))
	return results, 0, nil
}

// ddgResultAPattern matches direct URLs in result__a anchors.
// e.g. <a rel="nofollow" class="result__a" href="https://www.example.com/">Title</a>
var ddgResultAPattern = regexp.MustCompile(`class="result__a"[^>]+href="(https?://[^"]+)"`)

// ddgResultURLPattern matches direct URLs in result__url anchors (dedup fallback).
// e.g. <a class="result__url" href="https://www.example.com/">
var ddgResultURLPattern = regexp.MustCompile(`class="result__url"[^>]+href="(https?://[^"]+)"`)

// ddgBlocklist skips DDG infrastructure and high-noise aggregator domains.
var ddgBlocklist = []string{
	"duckduckgo.com", "duck.com", "youtube.com", "facebook.com",
	"twitter.com", "instagram.com", "linkedin.com", "wikipedia.org",
}

func parseDDGHTML(body string, limit int) []Result {
	var results []Result
	seen := make(map[string]bool)

	addURL := func(raw string) bool {
		raw = strings.TrimRight(raw, "/")
		if clean, ok := filterURL(raw, ddgBlocklist); ok && !seen[clean] {
			seen[clean] = true
			results = append(results, Result{URL: clean, Title: clean})
			return true
		}
		return false
	}

	// Primary: result__a links (organic results + ads mixed, filtered by blocklist).
	for _, m := range ddgResultAPattern.FindAllStringSubmatch(body, -1) {
		if len(m) >= 2 {
			addURL(m[1])
		}
		if len(results) >= limit {
			return results
		}
	}

	// Fallback: result__url links.
	for _, m := range ddgResultURLPattern.FindAllStringSubmatch(body, -1) {
		if len(m) >= 2 {
			addURL(m[1])
		}
		if len(results) >= limit {
			return results
		}
	}

	return results
}

func filterURL(raw string, blocklist []string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", false
	}
	host := strings.ToLower(u.Host)
	for _, blocked := range blocklist {
		if strings.Contains(host, blocked) {
			return "", false
		}
	}
	clean := u.Scheme + "://" + u.Host + u.Path
	clean = strings.TrimRight(clean, "/")
	return clean, clean != ""
}
