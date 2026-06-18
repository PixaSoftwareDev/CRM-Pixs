// Package browser provides Chrome-based web scraping via chromedp.
// It opens a real Chrome instance, searches Google, and fetches each page
// (including contact subpages) with full JavaScript rendering.
package browser

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

// Scraper manages a single Chrome browser instance for the duration of a job.
// It handles both the search step (Google) and the page-fetch step.
type Scraper struct {
	browserCtx    context.Context
	cancelBrowser context.CancelFunc
	cancelAlloc   context.CancelFunc
	logger        *slog.Logger
}

// New starts a Chrome process and returns a ready Scraper.
// headless=false shows the browser window so the operator can watch.
// Call Close() when done to kill the browser.
func New(headless bool, logger *slog.Logger) (*Scraper, error) {
	if logger == nil {
		logger = slog.Default()
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", headless),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("lang", "es-AR,es"),
		chromedp.Flag("accept-lang", "es-AR,es"),
		chromedp.WindowSize(1280, 900),
		chromedp.UserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx,
		chromedp.WithLogf(func(format string, args ...any) {
			logger.Debug("chrome: " + fmt.Sprintf(format, args...))
		}),
	)

	// Warm up: start the browser process.
	if err := chromedp.Run(browserCtx); err != nil {
		cancelBrowser()
		cancelAlloc()
		return nil, fmt.Errorf("starting chrome: %w", err)
	}

	logger.Info("chrome started", "headless", headless)
	return &Scraper{
		browserCtx:    browserCtx,
		cancelBrowser: cancelBrowser,
		cancelAlloc:   cancelAlloc,
		logger:        logger,
	}, nil
}

// Close terminates the browser and frees resources.
func (s *Scraper) Close() {
	s.cancelBrowser()
	s.cancelAlloc()
}

// SearchGoogle opens Google, accepts any consent page, types the query,
// waits for results, and returns unique root-domain URLs.
func (s *Scraper) SearchGoogle(ctx context.Context, query string, limit int) ([]string, error) {
	tabCtx, cancel := chromedp.NewContext(s.browserCtx)
	defer cancel()

	timeout, cancelTimeout := context.WithTimeout(tabCtx, 60*time.Second)
	defer cancelTimeout()

	searchURL := "https://www.google.com/search?q=" + url.QueryEscape(query) +
		"&num=20&hl=es&gl=ar&pws=0"

	s.logger.Info("searching google", "query", query, "url", searchURL)

	// Navigate and dismiss any consent / cookie page Google shows.
	if err := chromedp.Run(timeout,
		chromedp.Navigate(searchURL),
		chromedp.Sleep(2*time.Second),
	); err != nil {
		return nil, fmt.Errorf("navigating google: %w", err)
	}

	// Accept consent if present (Google shows this on first visit in many regions).
	_ = chromedp.Run(timeout, chromedp.Tasks{
		// "Aceptar todo" / "Accept all" button variants
		chromedp.Click(`[id="L2AGLb"]`, chromedp.ByQuery),
	})
	_ = chromedp.Run(timeout, chromedp.Tasks{
		chromedp.Click(`button[jsname="higCR"]`, chromedp.ByQuery),
	})
	_ = chromedp.Run(timeout, chromedp.Tasks{
		chromedp.Click(`[aria-label="Aceptar todo"]`, chromedp.ByQuery),
	})
	_ = chromedp.Run(timeout, chromedp.Tasks{
		chromedp.Click(`[aria-label="Accept all"]`, chromedp.ByQuery),
	})

	// Wait for results to load after any consent dismissal.
	if err := chromedp.Run(timeout, chromedp.Sleep(3*time.Second)); err != nil {
		return nil, fmt.Errorf("waiting for results: %w", err)
	}

	// Log the page title so we can debug consent/captcha issues.
	var title string
	_ = chromedp.Run(timeout, chromedp.Title(&title))
	s.logger.Info("google page loaded", "title", title)

	var hrefs []string
	if err := chromedp.Run(timeout,
		chromedp.Evaluate(`
			(() => {
				const seen = new Set();
				const out = [];
				// Cast a wide net: any anchor on the page with an external href.
				const anchors = document.querySelectorAll('a[href]');
				for (const a of anchors) {
					try {
						const u = new URL(a.href);
						if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
						const host = u.hostname.toLowerCase();
						// Skip Google-owned and common noise domains.
						if (host.includes('google.') || host.includes('gstatic.') ||
							host.includes('googleapis.') || host.includes('youtube.com') ||
							host.includes('facebook.com') || host.includes('twitter.com') ||
							host.includes('instagram.com') || host.includes('wikipedia.org') ||
							host === window.location.hostname) continue;
						const base = u.origin;
						if (!seen.has(base)) {
							seen.add(base);
							out.push(base);
						}
					} catch {}
				}
				return out;
			})()
		`, &hrefs),
	); err != nil {
		return nil, fmt.Errorf("extracting links: %w", err)
	}

	if len(hrefs) > limit {
		hrefs = hrefs[:limit]
	}

	s.logger.Info("google search done", "query", query, "found", len(hrefs), "urls", hrefs)
	return hrefs, nil
}

// FetchSite loads siteURL in Chrome (full JS rendering), then tries a few
// known contact/about subpages on the same domain.
// Returns a slice of HTML strings, one per page successfully loaded.
func (s *Scraper) FetchSite(ctx context.Context, siteURL string) ([]string, error) {
	mainHTML, err := s.fetchPage(ctx, siteURL, 20*time.Second)
	if err != nil {
		return nil, err
	}

	pages := []string{mainHTML}

	base, baseErr := baseURL(siteURL)
	if baseErr != nil {
		return pages, nil
	}

	subPaths := []string{
		"/contacto", "/contact", "/contactanos",
		"/about", "/quienes-somos", "/nosotros", "/equipo",
	}
	for _, p := range subPaths {
		if ctx.Err() != nil {
			break
		}
		html, err := s.fetchPage(ctx, base+p, 12*time.Second)
		if err == nil && strings.TrimSpace(html) != "" {
			pages = append(pages, html)
		}
	}

	return pages, nil
}

// fetchPage opens a new tab, navigates to pageURL, waits for the body to render,
// and returns the outer HTML of the page.
func (s *Scraper) fetchPage(ctx context.Context, pageURL string, timeout time.Duration) (string, error) {
	tabCtx, cancel := chromedp.NewContext(s.browserCtx)
	defer cancel()

	timeoutCtx, cancelTimeout := context.WithTimeout(tabCtx, timeout)
	defer cancelTimeout()

	var html string
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(pageURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Sleep(1500*time.Millisecond),
		chromedp.OuterHTML("html", &html, chromedp.ByQuery),
	)
	if err != nil {
		s.logger.Debug("fetch page failed", "url", pageURL, "err", err)
		return "", fmt.Errorf("fetch %s: %w", pageURL, err)
	}
	return html, nil
}

func baseURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	return u.Scheme + "://" + u.Host, nil
}
