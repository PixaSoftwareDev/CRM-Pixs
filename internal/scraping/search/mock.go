package search

import "context"

// MockProvider returns fixed results for testing.
type MockProvider struct {
	Results []Result
	Cost    float64
	Err     error
}

// Search returns the configured fixed results.
func (m *MockProvider) Search(_ context.Context, _, _, _ string, _ int) ([]Result, float64, error) {
	return m.Results, m.Cost, m.Err
}
