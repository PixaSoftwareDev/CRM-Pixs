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
	ID                  uuid.UUID
	CompanyID           uuid.UUID
	CompanyName         string
	Description         *string
	WhatTheyDo          *string
	SourceURL           *string
	Website             *string
	Industry            *string
	ApproximateSize     *string
	City                *string
	Country             *string
	Language            *string
	AssignedTo          *uuid.UUID
	Status              LeadStatus
	RejectionReason     *string
	FollowUpDate        *time.Time
	ScrapingJobID       *uuid.UUID
	ConvertedContactID  *uuid.UUID
	LLMExtractionFailed bool
	CreatedAt           time.Time
	UpdatedAt           time.Time
	DeletedAt           *time.Time
	// Hydrated child collections.
	Emails  []*LeadEmail
	Phones  []*LeadPhone
	Socials []*LeadSocial
}

// LeadEmail is a contact email discovered for a lead.
type LeadEmail struct {
	ID        uuid.UUID
	LeadID    uuid.UUID
	Email     string
	Context   *string
	CreatedAt time.Time
}

// LeadPhone is a contact phone number discovered for a lead.
type LeadPhone struct {
	ID        uuid.UUID
	LeadID    uuid.UUID
	Phone     string
	Type      string
	Country   *string
	Context   *string
	CreatedAt time.Time
}

// LeadSocial is a social-network handle discovered for a lead.
type LeadSocial struct {
	ID        uuid.UUID
	LeadID    uuid.UUID
	Platform  string
	Handle    *string
	URL       *string
	CreatedAt time.Time
}

// ActivityEntry is an append-only audit/timeline entry for a lead.
type ActivityEntry struct {
	ID           uuid.UUID
	LeadID       uuid.UUID
	UserID       *uuid.UUID
	ActivityType string
	Detail       *string
	CreatedAt    time.Time
}
