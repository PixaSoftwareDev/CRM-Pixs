package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	mw "pixs/internal/transport/http/middleware"
)

func newTestEcho(t *testing.T) (*echo.Echo, *redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	return echo.New(), rdb, mr
}

// okHandler is a trivial handler that returns 200.
var okHandler = func(c echo.Context) error {
	return c.String(http.StatusOK, "ok")
}

// makeRequest fires one request through the given middleware-wrapped handler.
// Errors returned by the handler (e.g. *echo.HTTPError) are processed by Echo's
// error handler so that rec.Code reflects the actual HTTP status.
func makeRequest(e *echo.Echo, handler echo.HandlerFunc, middlewareFn echo.MiddlewareFunc) int {
	req := httptest.NewRequest(http.MethodPost, "/", http.NoBody)
	req.RemoteAddr = "127.0.0.1:12345" // fixed IP so IPKey is deterministic
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	wrapped := middlewareFn(handler)
	if err := wrapped(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	return rec.Code
}

// TestRateLimit_AllowsUpToLimit verifies that exactly `limit` requests pass
// and the (limit+1)th request is rejected with 429.
func TestRateLimit_AllowsUpToLimit(t *testing.T) {
	e, rdb, _ := newTestEcho(t)

	const limit = 5
	rl := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  limit,
		Window: time.Minute,
		Prefix: "test:login",
	})

	// Requests 1 through 5 must pass.
	for i := 1; i <= limit; i++ {
		code := makeRequest(e, okHandler, rl)
		assert.Equal(t, http.StatusOK, code, "request %d should pass (limit=%d)", i, limit)
	}

	// Request 6 (limit+1) must be rejected.
	code := makeRequest(e, okHandler, rl)
	assert.Equal(t, http.StatusTooManyRequests, code, "request %d should be rejected (limit=%d)", limit+1, limit)
}

// TestRateLimit_WindowReset verifies that the counter resets after the window expires.
func TestRateLimit_WindowReset(t *testing.T) {
	e, rdb, mr := newTestEcho(t)

	const limit = 3
	rl := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  limit,
		Window: 30 * time.Second,
		Prefix: "test:reset",
	})

	// Exhaust the limit.
	for i := 1; i <= limit; i++ {
		makeRequest(e, okHandler, rl)
	}
	assert.Equal(t, http.StatusTooManyRequests, makeRequest(e, okHandler, rl), "should be rate-limited before window expires")

	// Advance miniredis clock past the window.
	mr.FastForward(31 * time.Second)

	// After window reset the counter is gone — new requests should pass.
	assert.Equal(t, http.StatusOK, makeRequest(e, okHandler, rl), "should pass after window expires")
}

// TestRateLimit_DifferentKeysAreIndependent verifies that distinct keys (different IPs)
// have independent counters.
func TestRateLimit_DifferentKeysAreIndependent(t *testing.T) {
	e, rdb, _ := newTestEcho(t)

	const limit = 2
	rl := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  limit,
		Window: time.Minute,
		Prefix: "test:keys",
	})

	makeIP := func(_ string) echo.HandlerFunc {
		return func(c echo.Context) error { return c.String(http.StatusOK, "ok") }
	}

	reqWithIP := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/", http.NoBody)
		req.RemoteAddr = ip + ":9000"
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		if err := rl(makeIP(ip))(c); err != nil {
			e.HTTPErrorHandler(err, c)
		}
		return rec.Code
	}

	// Exhaust limit for IP 1.
	for i := 1; i <= limit; i++ {
		assert.Equal(t, http.StatusOK, reqWithIP("10.0.0.1"))
	}
	assert.Equal(t, http.StatusTooManyRequests, reqWithIP("10.0.0.1"), "IP1 should be limited")

	// IP 2 has its own fresh counter — should still pass.
	assert.Equal(t, http.StatusOK, reqWithIP("10.0.0.2"), "IP2 should not be affected")
}

// TestRateLimit_FailOpenOnRedisUnavailable verifies that when Redis is down
// the middleware fails open (lets the request through).
func TestRateLimit_FailOpenOnRedisUnavailable(t *testing.T) {
	e := echo.New()
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:1"}) // unreachable
	t.Cleanup(func() { _ = rdb.Close() })

	rl := mw.RateLimit(rdb, mw.RateLimitConfig{
		KeyFn:  mw.IPKey,
		Limit:  1,
		Window: time.Minute,
		Prefix: "test:down",
	})

	code := makeRequest(e, okHandler, rl)
	assert.Equal(t, http.StatusOK, code, "should fail open when Redis is unavailable")
}
