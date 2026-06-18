// Package browser provides browser-based web scraping via chromedp.
//
// Anti-detection strategy:
//   - Uses Brave (user's default) before falling back to Chrome
//   - Removes all automation flags from the browser
//   - Injects stealth JS before every page so navigator.webdriver is always hidden
//   - Human-like typing with random per-character delays
//   - Persistent scraper profile so the browser accumulates trust over time
//
// Tab lifecycle per site:
//   - FetchSite opens ONE tab, navigates through all subpages in that same tab,
//     then closes it via defer. No extra tabs.
package browser

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// stealthJS runs before every page load and hides all Chrome automation markers.
const stealthJS = `
(function() {
	Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });

	const fakePlugins = [
		{name:'Chrome PDF Plugin',  filename:'internal-pdf-viewer',             description:'Portable Document Format'},
		{name:'Chrome PDF Viewer',  filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai', description:''},
		{name:'Native Client',      filename:'internal-nacl-plugin',             description:''},
	];
	Object.defineProperty(navigator, 'plugins', {
		get: () => Object.assign(fakePlugins, {
			item:      (i) => fakePlugins[i],
			namedItem: (n) => fakePlugins.find(p => p.name === n),
			refresh:   () => {},
		}),
		configurable: true,
	});

	Object.defineProperty(navigator, 'languages', { get: () => ['es-AR','es','en-US','en'], configurable: true });

	if (!window.chrome) {
		window.chrome = {
			app:       { isInstalled: false },
			runtime:   {},
			loadTimes: function() { return {}; },
			csi:       function() { return {}; },
		};
	}

	if (navigator.permissions) {
		const _q = navigator.permissions.query.bind(navigator.permissions);
		navigator.permissions.query = (p) =>
			p.name === 'notifications'
				? Promise.resolve({ state: 'default', onchange: null })
				: _q(p);
	}

	Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
	Object.defineProperty(navigator, 'deviceMemory',        { get: () => 8, configurable: true });

	const _getParam = WebGLRenderingContext.prototype.getParameter;
	WebGLRenderingContext.prototype.getParameter = function(p) {
		if (p === 37445) return 'Intel Inc.';
		if (p === 37446) return 'Intel Iris OpenGL Engine';
		return _getParam.call(this, p);
	};
})();
`

// extractLinksJS returns unique origin URLs from the current page, excluding
// aggregators, directories, social networks, and other non-lead noise domains.
const extractLinksJS = `
(() => {
	const noise = [
		'google.','gstatic.','googleapis.','youtube.com',
		'facebook.com','twitter.com','x.com','instagram.com','tiktok.com',
		'wikipedia.org','wikimedia.org',
		'linkedin.com','bing.com','microsoft.com','msn.com','live.com','yahoo.com',
		'tripadvisor.','yelp.','foursquare.','zomato.','opentable.',
		'mercadolibre.','amazon.','ebay.','aliexpress.',
		'rae.es','wordreference.','dictionary.','thefreedictionary.',
		'cloudflare.com','w3.org','mozilla.org','github.com','stackoverflow.',
		'infobae.com','lanacion.','clarin.com','pagina12.','perfil.com',
		'cronista.com','ambito.com','telam.com','agencianova.',
		'reddit.com','quora.com','pinterest.','tumblr.com',
		'blogspot.','wordpress.com','medium.com','substack.',
	];
	const seen = new Set();
	const out  = [];
	for (const a of document.querySelectorAll('a[href]')) {
		try {
			const u    = new URL(a.href);
			if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
			const host = u.hostname.toLowerCase();
			if (noise.some(n => host.includes(n)) || host === window.location.hostname) continue;
			if (!seen.has(u.origin)) { seen.add(u.origin); out.push(u.origin); }
		} catch {}
	}
	return out;
})()
`

// findContactLinksJS scans the current page for links that lead to contact,
// about-us, or "quiénes somos" pages — by matching link text and URL paths.
// Returns at most 4 full URLs on the same domain.
const findContactLinksJS = `
(() => {
	const kw = [
		'contact','contacto','contactar','contactanos','contactenos','contactarnos',
		'quienes-somos','quienes_somos','quienes somos','quiénes somos',
		'nosotros','about','about-us','about_us','empresa','la-empresa',
		'la empresa','equipo','team','conocenos','conócenos',
	];
	const base = window.location.origin;
	const seen = new Set();
	const out  = [];

	for (const a of document.querySelectorAll('a[href]')) {
		try {
			const u    = new URL(a.href, base);
			if (u.origin !== base) continue;            // only same-domain
			if (u.pathname === '/' || u.pathname === '') continue;
			const text = (a.textContent || '').toLowerCase().trim();
			const path = u.pathname.toLowerCase();
			const hit  = kw.some(k => text.includes(k) || path.includes(k));
			if (hit && !seen.has(u.href)) {
				seen.add(u.href);
				out.push(u.href);
			}
		} catch {}
	}
	return out.slice(0, 4);  // visit at most 4 relevant pages
})()
`

// acceptConsentJS clicks the first "Accept all" consent button it finds, using
// multiple strategies so it works regardless of which IDs Google uses today.
const acceptConsentJS = `
(() => {
	for (const sel of ['#L2AGLb','#W0wltc']) {
		const el = document.querySelector(sel);
		if (el) { el.click(); return 'id:'+sel; }
	}
	for (const sel of [
		'button[aria-label="Accept all"]','button[aria-label="Aceptar todo"]',
		'button[aria-label="Acepta todo"]','button[jsname="higCR"]',
		'button[jsname="b3VHJd"]','button[jsname="tHlp8d"]',
	]) {
		const el = document.querySelector(sel);
		if (el) { el.click(); return 'attr:'+sel; }
	}
	for (const b of document.querySelectorAll('button,[role="button"]')) {
		const t = b.textContent.trim().toLowerCase();
		if (['accept all','aceptar todo','acepta todo','i agree','acepto todo'].includes(t)) {
			b.click(); return 'text:'+b.textContent.trim();
		}
	}
	return '';
})()
`

// profileDir holds the persistent scraper profile. Reusing it lets the browser
// accumulate cookies and history so search engines trust it more over time.
var profileDir = filepath.Join(os.Getenv("HOME"), ".config", "pixs-scraper-profile")

// Scraper manages one browser instance for the lifetime of a scraping job.
type Scraper struct {
	browserCtx    context.Context
	cancelBrowser context.CancelFunc
	cancelAlloc   context.CancelFunc
	logger        *slog.Logger
}

// findBrowserExec returns the path to the best available Chromium-based browser.
// Chrome is preferred over Brave because Brave is usually the user's active daily
// browser — launching a second Brave process while one is already running causes
// the new process to hand off to the existing instance and exit, which breaks the
// CDP connection that chromedp needs.
// Set PIXS_SCRAPING_BROWSER_PATH to override.
func findBrowserExec() string {
	if env := os.Getenv("PIXS_SCRAPING_BROWSER_PATH"); env != "" {
		return env
	}
	for _, p := range []string{
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/opt/brave.com/brave/brave",
		"/usr/bin/brave-browser",
		"/snap/bin/brave",
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "" // let chromedp find its default
}

// New starts the browser with anti-detection settings.
// headless=false shows the window (useful to watch while debugging).
func New(headless bool, logger *slog.Logger) (*Scraper, error) {
	if logger == nil {
		logger = slog.Default()
	}

	_ = os.MkdirAll(profileDir, 0o755)

	// Remove stale singleton lock files so the browser can open the profile even
	// if a previous run was killed without graceful shutdown.
	for _, name := range []string{"lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"} {
		_ = os.Remove(filepath.Join(profileDir, name))
	}

	exec := findBrowserExec()
	logger.Info("browser selected", "exec", exec, "headless", headless, "profile", profileDir)

	opts := []chromedp.ExecAllocatorOption{
		chromedp.Flag("headless", headless),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.UserDataDir(profileDir),
		chromedp.WindowSize(1366, 768),

		// Core anti-detection flags.
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("exclude-switches", "enable-automation"),
		chromedp.Flag("disable-infobars", true),

		// Realistic environment.
		chromedp.Flag("lang", "es-AR"),
		chromedp.Flag("no-first-run", true),
		chromedp.Flag("no-default-browser-check", true),
		chromedp.UserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"),
	}

	if exec != "" {
		opts = append(opts, chromedp.ExecPath(exec))
	}

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx,
		chromedp.WithLogf(func(format string, args ...any) {
			logger.Debug("browser: " + fmt.Sprintf(format, args...))
		}),
	)

	if err := chromedp.Run(browserCtx); err != nil {
		cancelBrowser()
		cancelAlloc()
		return nil, fmt.Errorf("starting browser: %w", err)
	}

	return &Scraper{
		browserCtx:    browserCtx,
		cancelBrowser: cancelBrowser,
		cancelAlloc:   cancelAlloc,
		logger:        logger,
	}, nil
}

// Close terminates the browser and releases all resources.
func (s *Scraper) Close() {
	s.cancelBrowser()
	s.cancelAlloc()
}

// IsDead returns true when the browser process has exited or crashed.
// A dead browser must be replaced — all subsequent operations will fail.
func (s *Scraper) IsDead() bool {
	return s.browserCtx.Err() != nil
}

// injectStealth registers the stealth script to run before every page load in
// the given tab context. Must be called once per new tab, before any Navigate.
func injectStealth(ctx context.Context) error {
	return chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		_, err := page.AddScriptToEvaluateOnNewDocument(stealthJS).Do(ctx)
		return err
	}))
}

// humanDelay returns a chromedp action that sleeps a random duration in [min,max] ms.
func humanDelay(min, max int) chromedp.Action {
	return chromedp.Sleep(time.Duration(min+rand.IntN(max-min)) * time.Millisecond)
}

// ─── Search ──────────────────────────────────────────────────────────────────

// Search runs a keyword search and returns unique site URLs.
// Tries Google first; falls back to Bing automatically if Google shows a
// consent/CAPTCHA page or returns no results.
func (s *Scraper) Search(ctx context.Context, query string, limit int) ([]string, error) {
	urls, err := s.searchGoogle(ctx, query, limit)
	if err != nil {
		s.logger.Warn("google failed, trying bing", "err", err)
		return s.searchBing(ctx, query, limit)
	}
	if len(urls) == 0 {
		s.logger.Warn("google returned 0 results, trying bing")
		return s.searchBing(ctx, query, limit)
	}
	return urls, nil
}

func (s *Scraper) searchGoogle(ctx context.Context, query string, limit int) ([]string, error) {
	tabCtx, cancel := chromedp.NewContext(s.browserCtx)
	defer cancel()

	tCtx, cancelT := context.WithTimeout(tabCtx, 120*time.Second)
	defer cancelT()

	if err := injectStealth(tCtx); err != nil {
		s.logger.Warn("stealth inject failed on google tab", "err", err)
	}

	s.logger.Info("searching google", "query", query)

	if err := chromedp.Run(tCtx,
		chromedp.Navigate("https://www.google.com/?hl=es"),
		humanDelay(1200, 2000),
	); err != nil {
		return nil, fmt.Errorf("navigate google: %w", err)
	}

	// Accept cookie consent via JS — handles any ID Google might use.
	var consentResult string
	_ = chromedp.Run(tCtx, chromedp.Evaluate(acceptConsentJS, &consentResult))
	if consentResult != "" {
		s.logger.Info("google consent accepted", "method", consentResult)
		_ = chromedp.Run(tCtx, humanDelay(1000, 1800))
	}

	// Wait up to 12 s for the search box. If it doesn't appear, the page is
	// still a consent/CAPTCHA — fail fast and let the caller fall back to Bing.
	searchBox := `textarea[name="q"], input[name="q"]`
	boxCtx, cancelBox := context.WithTimeout(tCtx, 12*time.Second)
	err := chromedp.Run(boxCtx, chromedp.WaitVisible(searchBox, chromedp.ByQuery))
	cancelBox()
	if err != nil {
		// One retry after a second consent attempt.
		_ = chromedp.Run(tCtx, humanDelay(800, 1200), chromedp.Evaluate(acceptConsentJS, &consentResult))
		boxCtx2, cancelBox2 := context.WithTimeout(tCtx, 8*time.Second)
		err2 := chromedp.Run(boxCtx2, chromedp.WaitVisible(searchBox, chromedp.ByQuery))
		cancelBox2()
		if err2 != nil {
			return nil, fmt.Errorf("google search box not visible (consent/captcha): %w", err2)
		}
	}

	if err := chromedp.Run(tCtx,
		chromedp.Click(searchBox, chromedp.ByQuery),
		humanDelay(300, 600),
		// Clear any text that may be in the box before typing.
		chromedp.Evaluate(`(() => {
			const el = document.querySelector('textarea[name="q"],input[name="q"]');
			if (el) { el.focus(); el.value = ''; el.dispatchEvent(new Event('input',{bubbles:true})); }
		})()`, nil),
		humanDelay(150, 300),
	); err != nil {
		return nil, fmt.Errorf("clicking google search box: %w", err)
	}

	// Type query character by character with random delays — indistinguishable from a human.
	for _, ch := range query {
		if err := chromedp.Run(tCtx,
			chromedp.SendKeys(searchBox, string(ch), chromedp.ByQuery),
			chromedp.Sleep(time.Duration(60+rand.IntN(90))*time.Millisecond),
		); err != nil {
			return nil, fmt.Errorf("typing google query: %w", err)
		}
	}

	if err := chromedp.Run(tCtx,
		humanDelay(300, 600),
		chromedp.Submit(searchBox, chromedp.ByQuery),
		humanDelay(2000, 3500),
	); err != nil {
		return nil, fmt.Errorf("google submit: %w", err)
	}

	var title string
	_ = chromedp.Run(tCtx, chromedp.Title(&title))
	s.logger.Info("google results loaded", "title", title)

	var hrefs []string
	if err := chromedp.Run(tCtx, chromedp.Evaluate(extractLinksJS, &hrefs)); err != nil {
		return nil, fmt.Errorf("google extract links: %w", err)
	}
	if len(hrefs) > limit {
		hrefs = hrefs[:limit]
	}
	s.logger.Info("google search done", "found", len(hrefs))
	return hrefs, nil
}

func (s *Scraper) searchBing(ctx context.Context, query string, limit int) ([]string, error) {
	tabCtx, cancel := chromedp.NewContext(s.browserCtx)
	defer cancel()

	tCtx, cancelT := context.WithTimeout(tabCtx, 90*time.Second)
	defer cancelT()

	if err := injectStealth(tCtx); err != nil {
		s.logger.Warn("stealth inject failed on bing tab", "err", err)
	}

	s.logger.Info("searching bing", "query", query)

	if err := chromedp.Run(tCtx,
		chromedp.Navigate("https://www.bing.com/"),
		humanDelay(1000, 1800),
	); err != nil {
		return nil, fmt.Errorf("navigate bing: %w", err)
	}

	searchBox := `input[name="q"], textarea[name="q"]`
	if err := chromedp.Run(tCtx,
		chromedp.WaitVisible(searchBox, chromedp.ByQuery),
		chromedp.Click(searchBox, chromedp.ByQuery),
		humanDelay(300, 600),
	); err != nil {
		return nil, fmt.Errorf("bing search box: %w", err)
	}

	for _, ch := range query {
		if err := chromedp.Run(tCtx,
			chromedp.SendKeys(searchBox, string(ch), chromedp.ByQuery),
			chromedp.Sleep(time.Duration(60+rand.IntN(90))*time.Millisecond),
		); err != nil {
			return nil, fmt.Errorf("typing bing query: %w", err)
		}
	}

	if err := chromedp.Run(tCtx,
		humanDelay(300, 500),
		chromedp.Submit(searchBox, chromedp.ByQuery),
		humanDelay(2000, 3000),
	); err != nil {
		return nil, fmt.Errorf("bing submit: %w", err)
	}

	var title string
	_ = chromedp.Run(tCtx, chromedp.Title(&title))
	s.logger.Info("bing results loaded", "title", title)

	var hrefs []string
	if err := chromedp.Run(tCtx, chromedp.Evaluate(extractLinksJS, &hrefs)); err != nil {
		return nil, fmt.Errorf("bing extract links: %w", err)
	}
	if len(hrefs) > limit {
		hrefs = hrefs[:limit]
	}
	s.logger.Info("bing search done", "found", len(hrefs))
	return hrefs, nil
}

// ─── FetchSite ───────────────────────────────────────────────────────────────

// FetchSite opens ONE browser tab, loads the main page, then finds real
// contact/about links by parsing the HTML (instead of guessing URLs), visits
// those pages in the same tab, and closes the tab when done.
//
// Design: one tab per site, closed by defer. No extra tabs are opened.
// Max 4 contact-related subpages are visited (found via JS, not hardcoded paths).
func (s *Scraper) FetchSite(ctx context.Context, siteURL string) ([]string, error) {
	if s.IsDead() {
		return nil, fmt.Errorf("browser is not running")
	}

	// ONE tab for the entire site — opened here, closed by defer cancel().
	tabCtx, cancel := chromedp.NewContext(s.browserCtx)
	defer cancel()

	tCtx, cancelT := context.WithTimeout(tabCtx, 60*time.Second)
	defer cancelT()

	if err := injectStealth(tCtx); err != nil {
		s.logger.Debug("stealth inject failed", "url", siteURL)
	}

	s.logger.Info("→ opening site", "url", siteURL)

	// Load the main page.
	if err := chromedp.Run(tCtx,
		chromedp.Navigate(siteURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		humanDelay(800, 1500),
	); err != nil {
		return nil, fmt.Errorf("navigate %s: %w", siteURL, err)
	}

	// Reject immediate redirects to foreign domains (ad networks, parked pages, etc.)
	var finalURL string
	_ = chromedp.Run(tCtx, chromedp.Location(&finalURL))
	if finalURL != "" && !isSameDomain(siteURL, finalURL) {
		return nil, fmt.Errorf("redirected to different domain: %s → %s", siteURL, finalURL)
	}

	var mainHTML string
	_ = chromedp.Run(tCtx, chromedp.OuterHTML("html", &mainHTML, chromedp.ByQuery))
	pages := []string{mainHTML}

	// Discover real contact/about links by reading the actual page HTML.
	// This is far more reliable than guessing URL paths.
	var contactLinks []string
	_ = chromedp.Run(tCtx, chromedp.Evaluate(findContactLinksJS, &contactLinks))
	s.logger.Debug("contact links found", "url", siteURL, "links", contactLinks)

	// Visit each discovered contact page in the SAME tab (no new tabs).
	for _, link := range contactLinks {
		if tCtx.Err() != nil {
			break
		}

		if err := chromedp.Run(tCtx,
			chromedp.Navigate(link),
			chromedp.WaitReady("body", chromedp.ByQuery),
			humanDelay(600, 1100),
		); err != nil {
			continue
		}

		// Guard against off-domain redirects on individual subpages too.
		var loc string
		_ = chromedp.Run(tCtx, chromedp.Location(&loc))
		if !isSameDomain(siteURL, loc) {
			s.logger.Debug("contact link redirected away", "link", link, "got", loc)
			continue
		}

		var html string
		_ = chromedp.Run(tCtx, chromedp.OuterHTML("html", &html, chromedp.ByQuery))
		if strings.TrimSpace(html) != "" {
			pages = append(pages, html)
			s.logger.Debug("fetched contact page", "url", link)
		}
	}

	s.logger.Info("← site done", "url", siteURL, "pages_fetched", len(pages))
	return pages, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// isSameDomain returns true when a and b share the same registered hostname
// (ignoring www prefix and subdomain differences like "shop.example.com" vs "example.com").
func isSameDomain(a, b string) bool {
	ua, err1 := url.Parse(a)
	ub, err2 := url.Parse(b)
	if err1 != nil || err2 != nil {
		return true // can't parse → don't skip
	}
	ha := strings.TrimPrefix(strings.ToLower(ua.Hostname()), "www.")
	hb := strings.TrimPrefix(strings.ToLower(ub.Hostname()), "www.")
	return ha == hb || strings.HasSuffix(ha, "."+hb) || strings.HasSuffix(hb, "."+ha)
}

func baseURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	return u.Scheme + "://" + u.Host, nil
}
