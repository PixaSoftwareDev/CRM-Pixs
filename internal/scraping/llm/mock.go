package llm

import "context"

// MockExtractor returns fixed data for testing.
type MockExtractor struct {
	Data  *ExtractedCompany
	Usage Usage
	Err   error
}

// ExtractCompanyInfo returns the configured fixed data.
func (m *MockExtractor) ExtractCompanyInfo(_ context.Context, _, _ string) (*ExtractedCompany, Usage, error) {
	return m.Data, m.Usage, m.Err
}
