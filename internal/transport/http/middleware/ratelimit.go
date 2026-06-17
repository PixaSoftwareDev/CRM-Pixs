package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

// RateLimitConfig defines a Redis sliding-window rate limit.
type RateLimitConfig struct {
	// KeyFn derives the Redis key from the request (e.g. IP or email).
	KeyFn  func(c echo.Context) string
	Limit  int
	Window time.Duration
	Prefix string
}

// RateLimit returns middleware that enforces a sliding-window rate limit using Redis INCR+EXPIRE.
func RateLimit(rdb *redis.Client, cfg RateLimitConfig) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			key := fmt.Sprintf("rl:%s:%s", cfg.Prefix, cfg.KeyFn(c))
			ctx := c.Request().Context()

			count, err := rdb.Incr(ctx, key).Result()
			if err != nil {
				// Redis unavailable — fail open to avoid lockout.
				return next(c)
			}
			if count == 1 {
				rdb.Expire(ctx, key, cfg.Window)
			}
			if int(count) > cfg.Limit {
				return echo.NewHTTPError(http.StatusTooManyRequests, "demasiados intentos, intente más tarde")
			}
			return next(c)
		}
	}
}

// IPKey extracts the real client IP for rate limiting.
func IPKey(c echo.Context) string {
	return c.RealIP()
}
