package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

const idempotencyTTL = 24 * time.Hour

type cachedResponse struct {
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body"`
}

// Idempotency caches POST/PUT responses keyed by X-Idempotency-Key for 24 hours.
// Replays the cached response on repeated requests with the same key.
func Idempotency(rdb *redis.Client) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			key := strings.TrimSpace(c.Request().Header.Get("X-Idempotency-Key"))
			if key == "" || (c.Request().Method != http.MethodPost && c.Request().Method != http.MethodPut) {
				return next(c)
			}

			redisKey := "idem:" + key
			ctx := c.Request().Context()

			// Check cache.
			cached, err := rdb.Get(ctx, redisKey).Bytes()
			if err == nil {
				var cr cachedResponse
				if json.Unmarshal(cached, &cr) == nil {
					return c.JSONBlob(cr.Status, cr.Body)
				}
			}

			// Capture the response.
			rec := &responseRecorder{ResponseWriter: c.Response().Writer, buf: &bytes.Buffer{}}
			c.Response().Writer = rec

			if err := next(c); err != nil {
				return err
			}

			// Cache successful responses only (2xx).
			if rec.status >= 200 && rec.status < 300 {
				cr := cachedResponse{Status: rec.status, Body: rec.buf.Bytes()}
				if b, err := json.Marshal(cr); err == nil {
					rdb.Set(ctx, redisKey, b, idempotencyTTL)
				}
			}
			return nil
		}
	}
}

// responseRecorder wraps http.ResponseWriter to capture status and body.
type responseRecorder struct {
	http.ResponseWriter
	status int
	buf    *bytes.Buffer
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	r.buf.Write(b)
	return r.ResponseWriter.Write(b)
}
