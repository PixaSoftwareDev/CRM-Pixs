// Package llm extracts structured company information from website HTML using
// an LLM. The concrete AnthropicExtractor calls the Anthropic Messages API over
// raw HTTP; tests use the MockExtractor.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ExtractedCompany is the schema the LLM must return.
type ExtractedCompany struct {
	CompanyName      string `json:"company_name"`
	ShortDescription string `json:"short_description"`
	WhatTheyDo       string `json:"what_they_do"`
	Industry         string `json:"industry"`
	ApproximateSize  string `json:"approximate_size"` // micro/small/medium/large/unknown
	TeamVisible      bool   `json:"team_visible"`
	SiteLanguage     string `json:"site_language"` // ISO 639-1 language code
}

// Usage tracks tokens consumed and the resulting cost.
type Usage struct {
	InputTokens  int
	OutputTokens int
	CostUSD      float64
}

// Extractor abstracts the LLM extraction step so the pipeline is mockable.
type Extractor interface {
	ExtractCompanyInfo(ctx context.Context, htmlContent, pageURL string) (*ExtractedCompany, Usage, error)
}

// anthropicModel is Claude Haiku 4.5 — the cheapest model suited to this
// structured-extraction task.
const anthropicModel = "claude-haiku-4-5"

// Haiku 4.5 pricing (USD per million tokens).
const (
	haikuInputCostPerMTok  = 1.00
	haikuOutputCostPerMTok = 5.00
)

// AnthropicExtractor calls the Anthropic Messages API over raw HTTP.
type AnthropicExtractor struct {
	apiKey string
	client *http.Client
}

// NewAnthropicExtractor constructs an AnthropicExtractor.
func NewAnthropicExtractor(apiKey string) *AnthropicExtractor {
	return &AnthropicExtractor{
		apiKey: apiKey,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

const systemPrompt = `You extract structured company information from website HTML.
Return ONLY a valid JSON object with exactly these fields:
{
  "company_name": "string",
  "short_description": "1-2 sentence description",
  "what_they_do": "detailed description of products/services",
  "industry": "string (e.g. technology, retail, services, manufacturing)",
  "approximate_size": "micro|small|medium|large|unknown",
  "team_visible": true/false,
  "site_language": "ISO 639-1 code (e.g. es, en, pt)"
}
Do not include any other text, markdown, or explanation. Only JSON.`

// ExtractCompanyInfo sends the (stripped) HTML to the LLM and parses the JSON reply.
func (a *AnthropicExtractor) ExtractCompanyInfo(ctx context.Context, htmlContent, pageURL string) (*ExtractedCompany, Usage, error) {
	if a.apiKey == "" {
		return nil, Usage{}, fmt.Errorf("anthropic: no API key")
	}

	content := stripHTMLForLLM(htmlContent)
	if len(content) > 15000 {
		content = content[:15000]
	}
	userMsg := fmt.Sprintf("Extract company info from this website (%s):\n\n%s", pageURL, content)

	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type request struct {
		Model     string    `json:"model"`
		MaxTokens int       `json:"max_tokens"`
		System    string    `json:"system"`
		Messages  []message `json:"messages"`
	}

	payload, err := json.Marshal(request{
		Model:     anthropicModel,
		MaxTokens: 512,
		System:    systemPrompt,
		Messages:  []message{{Role: "user", Content: userMsg}},
	})
	if err != nil {
		return nil, Usage{}, fmt.Errorf("anthropic marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, Usage{}, err
	}
	req.Header.Set("x-api-key", a.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, Usage{}, fmt.Errorf("anthropic request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, Usage{}, fmt.Errorf("anthropic status %d", resp.StatusCode)
	}

	type contentBlock struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	type usageBlock struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	}
	type response struct {
		Content []contentBlock `json:"content"`
		Usage   usageBlock     `json:"usage"`
	}

	var r response
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, Usage{}, fmt.Errorf("decoding anthropic response: %w", err)
	}
	if len(r.Content) == 0 {
		return nil, Usage{}, fmt.Errorf("anthropic returned empty content")
	}

	text := r.Content[0].Text
	jsonStart := strings.Index(text, "{")
	jsonEnd := strings.LastIndex(text, "}")
	if jsonStart < 0 || jsonEnd < 0 || jsonEnd < jsonStart {
		return nil, Usage{}, fmt.Errorf("no JSON in LLM response")
	}
	text = text[jsonStart : jsonEnd+1]

	var extracted ExtractedCompany
	if err := json.Unmarshal([]byte(text), &extracted); err != nil {
		return nil, Usage{}, fmt.Errorf("parsing LLM JSON: %w", err)
	}

	usage := Usage{
		InputTokens:  r.Usage.InputTokens,
		OutputTokens: r.Usage.OutputTokens,
		CostUSD: float64(r.Usage.InputTokens)*haikuInputCostPerMTok/1_000_000 +
			float64(r.Usage.OutputTokens)*haikuOutputCostPerMTok/1_000_000,
	}
	return &extracted, usage, nil
}

// stripHTMLForLLM removes scripts, styles, and tags, collapsing whitespace so
// the LLM sees mostly visible text.
func stripHTMLForLLM(h string) string {
	h = strings.NewReplacer(
		"<script", "<!--script", "</script>", "</script-->",
		"<style", "<!--style", "</style>", "</style-->",
	).Replace(h)

	var sb strings.Builder
	inTag := false
	for _, r := range h {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
			sb.WriteRune(' ')
		case !inTag:
			sb.WriteRune(r)
		}
	}

	var out []string
	for _, l := range strings.Split(sb.String(), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return strings.Join(out, "\n")
}
