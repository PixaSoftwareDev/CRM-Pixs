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
	// Use "*" for development only.
	CORSAllowedOrigins []string `envconfig:"CORS_ALLOWED_ORIGINS" default:"http://localhost:3000"`
}

// Load reads configuration from environment variables with the PIXS prefix.
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("PIXS", &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
