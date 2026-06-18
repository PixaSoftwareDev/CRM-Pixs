// Package config loads and validates runtime configuration from environment variables.
package config

import (
	"github.com/kelseyhightower/envconfig"
)

// Config holds all runtime configuration loaded from environment variables.
// All fields are prefixed with PIXS_ (e.g. PIXS_HTTP_PORT).
type Config struct {
	HTTPPort    string `envconfig:"HTTP_PORT"    default:"8080"`
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`
	RedisURL    string `envconfig:"REDIS_URL"    required:"true"`

	// Environment controls behavior like log verbosity and CORS.
	// Valid values: dev, staging, prod
	Environment string `envconfig:"ENVIRONMENT" default:"dev"`

	// LogLevel controls slog output level.
	// Valid values: debug, info, warn, error
	LogLevel string `envconfig:"LOG_LEVEL" default:"info"`

	// CORSAllowedOrigins is a comma-separated list of allowed origins.
	CORSAllowedOrigins []string `envconfig:"CORS_ALLOWED_ORIGINS" default:"http://localhost:3000"`

	// EncryptionKey is a 32-byte hex-encoded key used for AES-256-GCM encryption
	// of sensitive fields (TOTP secrets, API keys).
	// Generate with: openssl rand -hex 32
	EncryptionKey string `envconfig:"ENCRYPTION_KEY" required:"true"`

	// SessionTTLHours is the sliding TTL for user sessions. Default 8h.
	SessionTTLHours int `envconfig:"SESSION_TTL_HOURS" default:"8"`

	// MaxSessionsPerUser is the maximum number of concurrent active sessions.
	// When exceeded, the oldest session is revoked. Default 5.
	MaxSessionsPerUser int `envconfig:"MAX_SESSIONS_PER_USER" default:"5"`

	// DevSeedAdminPassword is only used by the seed command in dev/staging.
	DevSeedAdminPassword string `envconfig:"DEV_SEED_ADMIN_PASSWORD" default:"admin123!"`

	// --- Scraping / Leads module ---

	// SerperAPIKey authenticates against the Serper.dev search API.
	// When empty, scraping jobs are still enqueued but fail at the search step.
	SerperAPIKey string `envconfig:"SERPER_API_KEY"`

	// AnthropicAPIKey authenticates against the Anthropic Messages API for
	// LLM-based company-info extraction. When empty, LLM extraction is skipped.
	AnthropicAPIKey string `envconfig:"ANTHROPIC_API_KEY"`

	// ChromedpEnabled toggles JS rendering for SPA sites (optional, off by default).
	ChromedpEnabled bool `envconfig:"CHROMEDP_ENABLED" default:"false"`

	// RespectRobots toggles robots.txt checking during fetching.
	RespectRobots bool `envconfig:"SCRAPING_RESPECT_ROBOTS" default:"true"`

	// ScrapingDailyQuota caps the number of URLs a user may request per day.
	ScrapingDailyQuota int `envconfig:"SCRAPING_DAILY_QUOTA" default:"200"`
}

// Load reads configuration from environment variables with the PIXS prefix.
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("PIXS", &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
