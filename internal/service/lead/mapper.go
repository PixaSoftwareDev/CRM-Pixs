package lead

import (
	"github.com/google/uuid"

	domain "pixs/internal/domain/lead"
	sqlcgen "pixs/internal/repository/sqlc"
)

func leadFromRow(r sqlcgen.Lead) *domain.Lead {
	l := &domain.Lead{
		ID:                  r.ID,
		CompanyID:           r.CompanyID,
		CompanyName:         r.CompanyName,
		Description:         r.Description,
		WhatTheyDo:          r.WhatTheyDo,
		SourceURL:           r.SourceUrl,
		Website:             r.Website,
		Industry:            r.Industry,
		ApproximateSize:     r.ApproximateSize,
		City:                r.City,
		Country:             r.Country,
		Language:            r.Language,
		Status:              domain.LeadStatus(r.Status),
		RejectionReason:     r.RejectionReason,
		LLMExtractionFailed: r.LlmExtractionFailed,
		CreatedAt:           r.CreatedAt.Time,
		UpdatedAt:           r.UpdatedAt.Time,
	}
	if r.AssignedTo.Valid {
		id := uuid.UUID(r.AssignedTo.Bytes)
		l.AssignedTo = &id
	}
	if r.ScrapingJobID.Valid {
		id := uuid.UUID(r.ScrapingJobID.Bytes)
		l.ScrapingJobID = &id
	}
	if r.ConvertedContactID.Valid {
		id := uuid.UUID(r.ConvertedContactID.Bytes)
		l.ConvertedContactID = &id
	}
	if r.FollowUpDate.Valid {
		t := r.FollowUpDate.Time
		l.FollowUpDate = &t
	}
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		l.DeletedAt = &t
	}
	return l
}

func emailFromRow(r sqlcgen.LeadEmail) *domain.LeadEmail {
	return &domain.LeadEmail{
		ID: r.ID, LeadID: r.LeadID, Email: r.Email, Context: r.Context, CreatedAt: r.CreatedAt.Time,
	}
}

func phoneFromRow(r sqlcgen.LeadPhone) *domain.LeadPhone {
	return &domain.LeadPhone{
		ID: r.ID, LeadID: r.LeadID, Phone: r.Phone, Type: r.Type,
		Country: r.Country, Context: r.Context, CreatedAt: r.CreatedAt.Time,
	}
}

func socialFromRow(r sqlcgen.LeadSocial) *domain.LeadSocial {
	return &domain.LeadSocial{
		ID: r.ID, LeadID: r.LeadID, Platform: r.Platform, Handle: r.Handle, URL: r.Url, CreatedAt: r.CreatedAt.Time,
	}
}

func activityFromRow(r sqlcgen.LeadActivity) *domain.ActivityEntry {
	a := &domain.ActivityEntry{
		ID: r.ID, LeadID: r.LeadID, ActivityType: r.ActivityType, Detail: r.Detail, CreatedAt: r.CreatedAt.Time,
	}
	if r.UserID.Valid {
		id := uuid.UUID(r.UserID.Bytes)
		a.UserID = &id
	}
	return a
}
