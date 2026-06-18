package lead

import (
	"time"

	"github.com/google/uuid"
)

// LeadStatus is the lifecycle state of a lead.
type LeadStatus string

// Lead lifecycle states.
const (
	StatusNew       LeadStatus = "new"
	StatusContacted LeadStatus = "contacted"
	StatusFollowing LeadStatus = "following"
	StatusQualified LeadStatus = "qualified"
	StatusConverted LeadStatus = "converted"
	StatusRejected  LeadStatus = "rejected"
	StatusWaiting   LeadStatus = "waiting"
)

// IsValid reports whether s is a known lead status.
func (s LeadStatus) IsValid() bool {
	_, ok := validTransitions[s]
	return ok
}

// validTransitions defines allowed lead status transitions.
// "converted" is terminal.
var validTransitions = map[LeadStatus][]LeadStatus{
	StatusNew:       {StatusContacted, StatusRejected, StatusWaiting},
	StatusContacted: {StatusFollowing, StatusQualified, StatusRejected, StatusWaiting},
	StatusFollowing: {StatusContacted, StatusQualified, StatusRejected, StatusWaiting},
	StatusQualified: {StatusConverted, StatusRejected},
	StatusWaiting:   {StatusContacted, StatusFollowing, StatusRejected},
	StatusConverted: {},          // terminal
	StatusRejected:  {StatusNew}, // can reopen
}

// CanTransition reports whether a lead may move from one status to another.
func CanTransition(from, to LeadStatus) bool {
	allowed, ok := validTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

// Lead is the aggregate root for a prospective customer discovered via
// scraping or entered manually.
type Lead struct {
	ID                  uuid.UUID    `json:"id"`
	CompanyID           uuid.UUID    `json:"company_id"`
	CompanyName         string       `json:"company_name"`
	Description         *string      `json:"description"`
	WhatTheyDo          *string      `json:"what_they_do"`
	SourceURL           *string      `json:"source_url"`
	Website             *string      `json:"website"`
	Industry            *string      `json:"industry"`
	ApproximateSize     *string      `json:"approximate_size"`
	City                *string      `json:"city"`
	Country             *string      `json:"country"`
	Language            *string      `json:"language"`
	AssignedTo          *uuid.UUID   `json:"assigned_to"`
	Status              LeadStatus   `json:"status"`
	RejectionReason     *string      `json:"rejection_reason"`
	FollowUpDate        *time.Time   `json:"follow_up_date"`
	ScrapingJobID       *uuid.UUID   `json:"scraping_job_id"`
	ConvertedContactID  *uuid.UUID   `json:"converted_contact_id"`
	LLMExtractionFailed bool         `json:"llm_extraction_failed"`
	CreatedAt           time.Time    `json:"created_at"`
	UpdatedAt           time.Time    `json:"updated_at"`
	DeletedAt           *time.Time   `json:"deleted_at,omitempty"`
	// Hydrated child collections.
	Emails  []*LeadEmail  `json:"emails"`
	Phones  []*LeadPhone  `json:"phones"`
	Socials []*LeadSocial `json:"socials"`
}

// LeadEmail is a contact email discovered for a lead.
type LeadEmail struct {
	ID        uuid.UUID `json:"id"`
	LeadID    uuid.UUID `json:"lead_id"`
	Email     string    `json:"email"`
	Context   *string   `json:"context"`
	CreatedAt time.Time `json:"created_at"`
}

// LeadPhone is a contact phone number discovered for a lead.
type LeadPhone struct {
	ID        uuid.UUID `json:"id"`
	LeadID    uuid.UUID `json:"lead_id"`
	Phone     string    `json:"phone"`
	Type      string    `json:"type"`
	Country   *string   `json:"country"`
	Context   *string   `json:"context"`
	CreatedAt time.Time `json:"created_at"`
}

// LeadSocial is a social-network handle discovered for a lead.
type LeadSocial struct {
	ID        uuid.UUID `json:"id"`
	LeadID    uuid.UUID `json:"lead_id"`
	Platform  string    `json:"platform"`
	Handle    *string   `json:"handle"`
	URL       *string   `json:"url"`
	CreatedAt time.Time `json:"created_at"`
}

// ActivityEntry is an append-only audit/timeline entry for a lead.
type ActivityEntry struct {
	ID           uuid.UUID  `json:"id"`
	LeadID       uuid.UUID  `json:"lead_id"`
	UserID       *uuid.UUID `json:"user_id"`
	ActivityType string     `json:"activity_type"`
	Detail       *string    `json:"detail"`
	CreatedAt    time.Time  `json:"created_at"`
}
