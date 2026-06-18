// Package browser provides browser-based web scraping via chromedp.
//
// Anti-detection strategy:
//   - Uses Chrome (separate from the user's active Brave instance)
//   - Removes all automation flags
//   - Injects stealth JS before every page so navigator.webdriver is hidden
//   - Human-like typing with random per-character delays
//   - Persistent scraper profile so the browser builds trust over time
//
// Per-site lifecycle:
//  1. Open ONE tab for the whole site
//  2. Dismiss any popup/cookie banner
//  3. Scroll to reveal lazy-loaded content
//  4. Extract contact data directly from the DOM (mailto:, tel:, wa.me)
//  5. Discover real contact/about links by reading the actual page HTML
//  6. Visit each discovered page in the same tab, repeating steps 2–4
//  7. Close the tab (via defer cancel)
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

// ─── Stealth ─────────────────────────────────────────────────────────────────

const stealthJS = `
(function() {
	Object.defineProperty(navigator,'webdriver',{get:()=>undefined,configurable:true});
	const fp=[
		{name:'Chrome PDF Plugin',  filename:'internal-pdf-viewer',             description:'Portable Document Format'},
		{name:'Chrome PDF Viewer',  filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai', description:''},
		{name:'Native Client',      filename:'internal-nacl-plugin',             description:''},
	];
	Object.defineProperty(navigator,'plugins',{get:()=>Object.assign(fp,{item:i=>fp[i],namedItem:n=>fp.find(p=>p.name===n),refresh:()=>{}}),configurable:true});
	Object.defineProperty(navigator,'languages',{get:()=>['es-AR','es','en-US','en'],configurable:true});
	if(!window.chrome){window.chrome={app:{isInstalled:false},runtime:{},loadTimes:()=>({}),csi:()=>({})};}
	if(navigator.permissions){const _q=navigator.permissions.query.bind(navigator.permissions);navigator.permissions.query=p=>p.name==='notifications'?Promise.resolve({state:'default',onchange:null}):_q(p);}
	Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8,configurable:true});
	Object.defineProperty(navigator,'deviceMemory',{get:()=>8,configurable:true});
	const _g=WebGLRenderingContext.prototype.getParameter;
	WebGLRenderingContext.prototype.getParameter=function(p){if(p===37445)return'Intel Inc.';if(p===37446)return'Intel Iris OpenGL Engine';return _g.call(this,p);};
})();
`

// ─── Search JS ───────────────────────────────────────────────────────────────

// acceptConsentJS clicks the Google cookie consent button using any known selector.
const acceptConsentJS = `
(() => {
	for(const s of['#L2AGLb','#W0wltc']){const e=document.querySelector(s);if(e){e.click();return'id:'+s;}}
	for(const s of['button[aria-label="Accept all"]','button[aria-label="Aceptar todo"]','button[aria-label="Acepta todo"]','button[jsname="higCR"]','button[jsname="b3VHJd"]']){const e=document.querySelector(s);if(e){e.click();return'attr:'+s;}}
	for(const b of document.querySelectorAll('button,[role="button"]')){const t=b.textContent.trim().toLowerCase();if(['accept all','aceptar todo','acepta todo','i agree','acepto todo'].includes(t)){b.click();return'text:'+b.textContent.trim();}}
	return '';
})()
`

// extractLinksJS returns unique origin URLs from a search results page,
// filtering out aggregators, social networks, news, and other non-lead noise.
const extractLinksJS = `
(() => {
	const noise=[
		'google.','gstatic.','googleapis.','youtube.com',
		'facebook.com','twitter.com','x.com','instagram.com','tiktok.com',
		'wikipedia.org','wikimedia.org',
		'linkedin.com','bing.com','microsoft.com','msn.com','live.com','yahoo.com',
		'tripadvisor.','yelp.','foursquare.','zomato.','opentable.',
		'mercadolibre.','amazon.','ebay.','aliexpress.',
		'rae.es','wordreference.','dictionary.','thefreedictionary.',
		'cloudflare.com','w3.org','mozilla.org','github.com','stackoverflow.',
		'reddit.com','quora.com','pinterest.','tumblr.com',
		'blogspot.','wordpress.com','medium.com','substack.',
		'infobae.com','lanacion.','clarin.com','pagina12.','perfil.com',
		'cronista.com','ambito.com','telam.com','agencianova.',
	];
	const seen=new Set(),out=[];
	for(const a of document.querySelectorAll('a[href]')){
		try{
			const u=new URL(a.href);
			if(u.protocol!=='http:'&&u.protocol!=='https:')continue;
			const h=u.hostname.toLowerCase();
			if(noise.some(n=>h.includes(n))||h===window.location.hostname)continue;
			if(!seen.has(u.origin)){seen.add(u.origin);out.push(u.origin);}
		}catch{}
	}
	return out;
})()
`

// ─── Site scraping JS ────────────────────────────────────────────────────────

// dismissPopupsJS closes cookie banners, GDPR dialogs, newsletter modals, and
// any other overlay that could hide page content. Runs after every page load.
const dismissPopupsJS = `
(() => {
	const visible = el => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
	// 1. Known selectors for major consent/cookie libraries
	const known = [
		'#onetrust-accept-btn-handler',
		'#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
		'.fc-cta-consent','#fc-button-accept',
		'.cc-accept','.cc-btn.cc-allow',
		'#accept-cookies','#cookie-accept','#cookie_accept',
		'.cookie-accept','[data-accept-cookies]',
		'#gdpr-accept','.gdpr-accept',
		'[id*="cookieAccept"]','[class*="cookieAccept"]',
		'[id*="cookie-banner"] button','[class*="cookie-banner"] button',
		'#newsletter-popup .close','#newsletter-modal .close',
		'.modal .close','[class*="modal"] [class*="close"]',
		'.popup-close','[class*="popup"] [class*="close"]',
		'.fancybox-close','.mfp-close',
	];
	for(const s of known){const e=document.querySelector(s);if(visible(e)){e.click();return'known:'+s;}}
	// 2. Text-based matching for any unlisted library
	const words=['aceptar todo','accept all','acepto','aceptar','accept','allow all',
	             'permitir todo','entendido','ok','agree','cerrar','close','dismiss','got it','entendido'];
	for(const el of document.querySelectorAll('button,[role="button"]')){
		if(words.includes(el.textContent.trim().toLowerCase())&&visible(el)){
			el.click();return'text:'+el.textContent.trim();
		}
	}
	return '';
})()
`

// extractDirectLinksJS extracts contact data that lives in href attributes
// (not in visible text). Returns newline-separated values that the Go extractor
// can process with its existing email/phone regexes.
//
// Why this matters: many sites use <a href="tel:+54..."> buttons with icons
// where the phone number is ONLY in the href, not in the page text.
const extractDirectLinksJS = `
(() => {
	const lines = [];
	// tel: → phone numbers (picked up by phone regex in extractor)
	for(const a of document.querySelectorAll('a[href^="tel:"]')){
		const v = a.href.replace(/^tel:/,'').replace(/\s/g,'').trim();
		if(v.length >= 7) lines.push(v);
	}
	// mailto: → email addresses (picked up by email regex)
	for(const a of document.querySelectorAll('a[href^="mailto:"]')){
		const v = a.href.replace(/^mailto:/,'').split('?')[0].trim();
		if(v.includes('@')) lines.push(v);
	}
	// WhatsApp wa.me → normalize to +NNNN
	for(const a of document.querySelectorAll('a[href*="wa.me/"],a[href*="whatsapp.com/send"]')){
		const m = a.href.match(/(?:wa\.me\/|phone=)(\d{7,15})/);
		if(m) lines.push('+'+m[1]);
	}
	return lines.join('\n');
})()
`

// findContactLinksJS discovers real contact/about links from the page by
// scoring each link's text and URL path against a keyword list.
// Footer links are boosted because sites almost always put contact info there.
// Returns up to 5 unique URLs on the same domain, highest-scored first.
const findContactLinksJS = `
(() => {
	const kw = [
		'contact','contacto','contactar','contactanos','contactenos','contactarnos',
		'quienes somos','quiénes somos','nosotros','sobre nosotros','sobre-nosotros',
		'about','about us','about-us','empresa','la empresa','la-empresa',
		'equipo','team','quienes','quiénes','conocenos','conócenos',
		'support','soporte','ayuda','help',
	];
	const norm = s => s.toLowerCase().replace(/\s+/g,'-');
	const base = window.location.origin;
	const seen = new Set();
	const scored = [];

	for(const a of document.querySelectorAll('a[href]')){
		try{
			const u = new URL(a.href, base);
			if(u.origin !== base) continue;
			const path = u.pathname;
			if(!path || path === '/') continue;
			// Avoid anchors on the current page and file downloads
			if(/\.(pdf|doc|jpg|png|zip)$/i.test(path)) continue;

			const text = (a.textContent||'').toLowerCase().trim();
			const lp   = path.toLowerCase();
			let score  = 0;
			for(const k of kw){
				if(text.includes(k)) score += 2;       // text match is strongest signal
				if(lp.includes(norm(k))) score += 1;   // URL match
			}
			if(score > 0 && !seen.has(u.href)){
				const inFooter = !!a.closest('footer,[class*="footer"],[id*="footer"],[class*="bottom"],[id*="bottom"]');
				seen.add(u.href);
				scored.push({url: u.href, score: score + (inFooter ? 3 : 0)});
			}
		}catch{}
	}

	scored.sort((a,b) => b.score - a.score);
	return scored.slice(0,5).map(x => x.url);
})()
`

// ─── Config / types ──────────────────────────────────────────────────────────

// profileDir holds the persistent scraper profile. Reusing it lets the browser
// accumulate cookies so search engines trust it more over time.
var profileDir = filepath.Join(os.Getenv("HOME"), ".config", "pixs-scraper-profile")

// Scraper manages one browser instance for the lifetime of a scraping job.
type Scraper struct {
	browserCtx    context.Context
	cancelBrowser context.CancelFunc
	cancelAlloc   context.CancelFunc
	logger        *slog.Logger
}

// ─── Browser lifecycle ───────────────────────────────────────────────────────

// findBrowserExec returns the best available Chromium-based browser.
// Chrome is preferred because Brave runs in single-instance mode — launching
// a second Brave process hands off to the running instance and exits, which
// breaks the CDP connection that chromedp needs.
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
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// New starts the browser with anti-detection settings.
// headless=false shows the window (useful to watch while debugging).
func New(headless bool, logger *slog.Logger) (*Scraper, error) {
	if logger == nil {
		logger = slog.Default()
	}

	_ = os.MkdirAll(profileDir, 0o755)

	// Remove stale singleton lock files so the profile can be reused even when
	// the previous browser run was killed without graceful shutdown.
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
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("exclude-switches", "enable-automation"),
		chromedp.Flag("disable-infobars", true),
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
func (s *Scraper) IsDead() bool {
	return s.browserCtx.Err() != nil
}

func injectStealth(ctx context.Context) error {
	return chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		_, err := page.AddScriptToEvaluateOnNewDocument(stealthJS).Do(ctx)
		return err
	}))
}

func humanDelay(min, max int) chromedp.Action {
	return chromedp.Sleep(time.Duration(min+rand.IntN(max-min)) * time.Millisecond)
}

// ─── Search ──────────────────────────────────────────────────────────────────

// Search runs a keyword search and returns unique site URLs.
// Tries Google first; falls back to Bing if Google shows consent/CAPTCHA.
func (s *Scraper) Search(ctx context.Context, query string, limit int) ([]string, error) {
	urls, err := s.searchGoogle(ctx, query, limit)
	if err != nil || len(urls) == 0 {
		s.logger.Warn("google failed or empty, trying bing", "err", err)
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

	var consent string
	_ = chromedp.Run(tCtx, chromedp.Evaluate(acceptConsentJS, &consent))
	if consent != "" {
		s.logger.Info("google consent accepted", "method", consent)
		_ = chromedp.Run(tCtx, humanDelay(1000, 1800))
	}

	searchBox := `textarea[name="q"], input[name="q"]`
	boxCtx, cancelBox := context.WithTimeout(tCtx, 12*time.Second)
	err := chromedp.Run(boxCtx, chromedp.WaitVisible(searchBox, chromedp.ByQuery))
	cancelBox()
	if err != nil {
		_ = chromedp.Run(tCtx, humanDelay(800, 1200), chromedp.Evaluate(acceptConsentJS, &consent))
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
		// Clear any pre-existing text before typing.
		chromedp.Evaluate(`(() => {
			const el = document.querySelector('textarea[name="q"],input[name="q"]');
			if(el){el.focus();el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));}
		})()`, nil),
		humanDelay(150, 300),
	); err != nil {
		return nil, fmt.Errorf("clicking google search box: %w", err)
	}

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
	s.logger.Info("google search done", "found", len(hrefs), "urls", hrefs)
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
	s.logger.Info("bing search done", "found", len(hrefs), "urls", hrefs)
	return hrefs, nil
}

// ─── Site fetching ───────────────────────────────────────────────────────────

// FetchSite opens ONE browser tab, exhaustively extracts contact data from the
// main page, then discovers and visits real contact/about pages found in the HTML.
// The tab is closed automatically when the function returns.
func (s *Scraper) FetchSite(ctx context.Context, siteURL string) ([]string, error) {
	if s.IsDead() {
		return nil, fmt.Errorf("browser is not running")
	}

	// ONE tab per site — closed by defer cancel().
	tabCtx, cancel := chromedp.NewContext(s.browserCtx)
	defer cancel()

	tCtx, cancelT := context.WithTimeout(tabCtx, 90*time.Second)
	defer cancelT()

	if err := injectStealth(tCtx); err != nil {
		s.logger.Debug("stealth inject failed", "url", siteURL)
	}

	s.logger.Info("→ opening site", "url", siteURL)

	if err := chromedp.Run(tCtx,
		chromedp.Navigate(siteURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		humanDelay(800, 1500),
	); err != nil {
		return nil, fmt.Errorf("navigate %s: %w", siteURL, err)
	}

	// Reject redirects to completely different domains.
	var finalURL string
	_ = chromedp.Run(tCtx, chromedp.Location(&finalURL))
	if finalURL != "" && !isSameDomain(siteURL, finalURL) {
		return nil, fmt.Errorf("redirected to different domain: %s → %s", siteURL, finalURL)
	}

	// Extract everything from the main page.
	mainPages := s.extractFromCurrentPage(tCtx, siteURL)
	allPages := mainPages

	// Discover contact/about links by analyzing the real page HTML.
	var contactLinks []string
	_ = chromedp.Run(tCtx, chromedp.Evaluate(findContactLinksJS, &contactLinks))
	s.logger.Debug("contact links found", "url", siteURL, "count", len(contactLinks), "links", contactLinks)

	// Visit each discovered contact page in THE SAME TAB.
	for _, link := range contactLinks {
		if tCtx.Err() != nil {
			break
		}

		if err := chromedp.Run(tCtx,
			chromedp.Navigate(link),
			chromedp.WaitReady("body", chromedp.ByQuery),
			humanDelay(600, 1100),
		); err != nil {
			s.logger.Debug("contact page load failed", "url", link, "err", err)
			continue
		}

		// Skip if navigation took us off the target domain.
		var loc string
		_ = chromedp.Run(tCtx, chromedp.Location(&loc))
		if !isSameDomain(siteURL, loc) {
			s.logger.Debug("contact link redirected away", "expected", link, "got", loc)
			continue
		}

		subPages := s.extractFromCurrentPage(tCtx, link)
		allPages = append(allPages, subPages...)
	}

	s.logger.Info("← site done", "url", siteURL, "pages_visited", 1+len(contactLinks), "data_chunks", len(allPages))
	return allPages, nil
}

// extractFromCurrentPage performs the full extraction sequence on whatever page
// is currently loaded in ctx:
//  1. Dismiss any popup/cookie banner (two passes: before and after scroll)
//  2. Scroll to reveal lazy-loaded content
//  3. Collect the full outerHTML
//  4. Extract direct contact links (tel:, mailto:, wa.me) as plain text
//
// Both the HTML and the direct-links text are returned as separate strings so
// the extractor can process them independently.
func (s *Scraper) extractFromCurrentPage(ctx context.Context, pageURL string) []string {
	// Pass 1: dismiss popup immediately after load.
	var dismissed string
	_ = chromedp.Run(ctx, chromedp.Evaluate(dismissPopupsJS, &dismissed))
	if dismissed != "" {
		s.logger.Debug("popup dismissed (pass 1)", "url", pageURL, "method", dismissed)
		_ = chromedp.Run(ctx, humanDelay(300, 600))
	}

	// Scroll to trigger lazy loading: 40% → 100% → back to top.
	_ = chromedp.Run(ctx,
		chromedp.Evaluate(`window.scrollTo({top: Math.floor(document.body.scrollHeight*0.4), behavior:'instant'})`, nil),
		humanDelay(400, 700),
		chromedp.Evaluate(`window.scrollTo({top: document.body.scrollHeight, behavior:'instant'})`, nil),
		humanDelay(500, 800),
		chromedp.Evaluate(`window.scrollTo(0, 0)`, nil),
		humanDelay(200, 400),
	)

	// Pass 2: some sites show popups on scroll (newsletter triggers, etc.).
	_ = chromedp.Run(ctx, chromedp.Evaluate(dismissPopupsJS, &dismissed))
	if dismissed != "" {
		s.logger.Debug("popup dismissed (pass 2)", "url", pageURL, "method", dismissed)
		_ = chromedp.Run(ctx, humanDelay(200, 400))
	}

	// Collect full page HTML (includes everything rendered by JS).
	var html string
	_ = chromedp.Run(ctx, chromedp.OuterHTML("html", &html, chromedp.ByQuery))

	// Extract direct contact data from DOM attributes (tel:, mailto:, wa.me).
	// These are separate from the HTML because they live in href attributes
	// that htmlToText strips out — the extractor phone regex would miss them.
	var directLinks string
	_ = chromedp.Run(ctx, chromedp.Evaluate(extractDirectLinksJS, &directLinks))

	result := []string{}
	if strings.TrimSpace(html) != "" {
		result = append(result, html)
	}
	if strings.TrimSpace(directLinks) != "" {
		result = append(result, directLinks)
	}
	return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// isSameDomain returns true when a and b share the same registered hostname,
// ignoring www prefix and subdomain differences.
func isSameDomain(a, b string) bool {
	ua, err1 := url.Parse(a)
	ub, err2 := url.Parse(b)
	if err1 != nil || err2 != nil {
		return true
	}
	ha := strings.TrimPrefix(strings.ToLower(ua.Hostname()), "www.")
	hb := strings.TrimPrefix(strings.ToLower(ub.Hostname()), "www.")
	return ha == hb || strings.HasSuffix(ha, "."+hb) || strings.HasSuffix(hb, "."+ha)
}

