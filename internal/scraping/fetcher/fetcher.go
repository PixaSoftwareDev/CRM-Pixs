// Package fetcher retrieves HTML for a set of URLs with per-domain rate
// limiting and shallow same-domain crawling. JS rendering via chromedp is
// optional and disabled by default.
package fetcher

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Config tunes the fetcher behavior.
type Config struct {
	RespectRobots     bool
	ChromedpEnabled   bool
	DomainRateLimitMs int // milliseconds between requests to the same domain
	CrawlDepth        int
	TimeoutSec        int
}

// DefaultConfig returns sane defaults for production scraping.
func DefaultConfig() Config {
	return Config{
		RespectRobots:     true,
		ChromedpEnabled:   false,
		DomainRateLimitMs: 2000,
		CrawlDepth:        2,
		TimeoutSec:        15,
	}
}

// FetchResult is the outcome of fetching a single URL.
type FetchResult struct {
	URL        string
	HTML       string
	StatusCode int
	Error      error
}

// Fetcher fetches HTML with rate limiting and shallow crawling.
type Fetcher struct {
	cfg        Config
	client     *http.Client
	domainLock sync.Map // domain -> time.Time of last fetch
	logger     *slog.Logger
}

// New constructs a Fetcher.
func New(cfg Config, logger *slog.Logger) *Fetcher {
	if logger == nil {
		logger = slog.Default()
	}
	return &Fetcher{
		cfg:    cfg,
		client: &http.Client{Timeout: time.Duration(cfg.TimeoutSec) * time.Second},
		logger: logger,
	}
}

// FetchAll fetches each URL and, when crawl depth allows, a small set of
// well-known contact/about sub-pages on the same domain.
func (f *Fetcher) FetchAll(ctx context.Context, urls []string) []FetchResult {
	results := make([]FetchResult, 0, len(urls))
	seen := make(map[string]bool)

	for _, rawURL := range urls {
		if seen[rawURL] {
			continue
		}
		seen[rawURL] = true

		result := f.fetchOne(ctx, rawURL)
		results = append(results, result)

		if result.Error != nil || f.cfg.CrawlDepth < 2 {
			continue
		}

		base, err := url.Parse(rawURL)
		if err != nil {
			continue
		}
		subPaths := []string{"/contacto", "/contact", "/about", "/equipo", "/team"}
		for _, p := range subPaths {
			subURL := base.Scheme + "://" + base.Host + p
			if seen[subURL] {
				continue
			}
			seen[subURL] = true
			r := f.fetchOne(ctx, subURL)
			if r.Error == nil {
				results = append(results, r)
			}
		}
	}
	return results
}

func (f *Fetcher) fetchOne(ctx context.Context, rawURL string) FetchResult {
	u, err := url.Parse(rawURL)
	if err != nil {
		return FetchResult{URL: rawURL, Error: fmt.Errorf("invalid url: %w", err)}
	}

	// Per-domain rate limiting.
	domain := u.Host
	if last, ok := f.domainLock.Load(domain); ok {
		elapsed := time.Since(last.(time.Time))
		wait := time.Duration(f.cfg.DomainRateLimitMs)*time.Millisecond - elapsed
		if wait > 0 {
			select {
			case <-ctx.Done():
				return FetchResult{URL: rawURL, Error: ctx.Err()}
			case <-time.After(wait):
			}
		}
	}
	f.domainLock.Store(domain, time.Now())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, http.NoBody)
	if err != nil {
		return FetchResult{URL: rawURL, Error: err}
	}
	req.Header.Set("User-Agent", "PIXS-Scraper/1.0 (+https://pixs.app/bot)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "es-AR,es;q=0.9,en;q=0.8")

	resp, err := f.client.Do(req)
	if err != nil {
		// Retry once after a short backoff.
		select {
		case <-ctx.Done():
			return FetchResult{URL: rawURL, Error: ctx.Err()}
		case <-time.After(2 * time.Second):
		}
		resp, err = f.client.Do(req)
		if err != nil {
			return FetchResult{URL: rawURL, Error: fmt.Errorf("fetch failed after retry: %w", err)}
		}
	}
	defer func() { _ = resp.Body.Close() }()

	limited := io.LimitReader(resp.Body, 2*1024*1024) // 2MB cap
	bodyBytes, err := io.ReadAll(limited)
	if err != nil {
		return FetchResult{URL: rawURL, Error: fmt.Errorf("reading body: %w", err)}
	}

	html := string(bodyBytes)
	if f.isJSRendered(html) {
		if f.cfg.ChromedpEnabled {
			// chromedp rendering is intentionally not implemented (optional).
			f.logger.Warn("JS-rendered site detected but chromedp rendering not implemented, using static HTML",
				"url", rawURL)
		} else {
			f.logger.Debug("JS-rendered site, using static HTML (chromedp disabled)", "url", rawURL)
		}
	}

	return FetchResult{URL: rawURL, HTML: html, StatusCode: resp.StatusCode}
}

// isJSRendered applies a rough heuristic to detect client-rendered SPAs.
func (f *Fetcher) isJSRendered(body string) bool {
	if len(body) < 3000 {
		return true
	}
	lower := strings.ToLower(body)
	hasRootDiv := strings.Contains(lower, `id="root"`) || strings.Contains(lower, `id="app"`)
	stripped := strings.NewReplacer("<", " <", ">", "> ").Replace(lower)
	words := len(strings.Fields(stripped))
	return hasRootDiv && words < 200
}
