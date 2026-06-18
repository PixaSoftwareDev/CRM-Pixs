// Package search abstracts the web search API used to discover candidate URLs
// for a scraping job.
package search

import "context"

// Result is a single web-search result.
type Result struct {
	URL     string
	Title   string
	Snippet string
}

// Provider abstracts the web search API. The second return value is the
// estimated cost in USD of the call.
type Provider interface {
	Search(ctx context.Context, query, country, language string, limit int) ([]Result, float64, error)
}
