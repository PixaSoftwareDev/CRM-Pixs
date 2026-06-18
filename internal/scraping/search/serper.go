package search

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

const serperEndpoint = "https://google.serper.dev/search"

// ErrNoAPIKey is returned when the Serper provider has no API key configured.
var ErrNoAPIKey = errors.New("serper: no API key configured")

// SerperProvider calls the Serper.dev search API.
type SerperProvider struct {
	apiKey string
	client *http.Client
}

// NewSerperProvider constructs a SerperProvider.
func NewSerperProvider(apiKey string) *SerperProvider {
	return &SerperProvider{
		apiKey: apiKey,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// Search queries Serper and returns organic results plus estimated cost.
func (s *SerperProvider) Search(ctx context.Context, query, country, language string, limit int) ([]Result, float64, error) {
	if s.apiKey == "" {
		return nil, 0, ErrNoAPIKey
	}

	type serperRequest struct {
		Q   string `json:"q"`
		GL  string `json:"gl,omitempty"`
		HL  string `json:"hl,omitempty"`
		Num int    `json:"num"`
	}
	type serperOrganic struct {
		Link    string `json:"link"`
		Title   string `json:"title"`
		Snippet string `json:"snippet"`
	}
	type serperResponse struct {
		Organic []serperOrganic `json:"organic"`
	}

	num := limit
	if num > 100 {
		num = 100
	}
	body, err := json.Marshal(serperRequest{Q: query, GL: country, HL: language, Num: num})
	if err != nil {
		return nil, 0, fmt.Errorf("serper marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serperEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-API-KEY", s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("serper request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("serper status %d", resp.StatusCode)
	}

	var sr serperResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, 0, fmt.Errorf("serper decode: %w", err)
	}

	results := make([]Result, 0, len(sr.Organic))
	for _, o := range sr.Organic {
		results = append(results, Result{URL: o.Link, Title: o.Title, Snippet: o.Snippet})
	}

	// Serper pricing: ~$0.30 per 1000 queries = $0.0003 per query.
	const cost = 0.0003
	return results, cost, nil
}
