package task

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCanTransition_ValidTransitions(t *testing.T) {
	valid := []struct {
		from TaskStatus
		to   TaskStatus
	}{
		{StatusOpen, StatusInProgress},
		{StatusOpen, StatusCancelled},
		{StatusInProgress, StatusWaitingClient},
		{StatusInProgress, StatusWaitingInternal},
		{StatusInProgress, StatusResolved},
		{StatusInProgress, StatusCancelled},
		{StatusWaitingClient, StatusInProgress},
		{StatusWaitingClient, StatusResolved},
		{StatusWaitingClient, StatusCancelled},
		{StatusWaitingInternal, StatusInProgress},
		{StatusWaitingInternal, StatusCancelled},
		{StatusResolved, StatusClosed},
		{StatusResolved, StatusInProgress},
	}
	for _, tc := range valid {
		assert.Truef(t, CanTransition(tc.from, tc.to), "expected %s→%s to be valid", tc.from, tc.to)
	}
}

func TestCanTransition_InvalidTransitions(t *testing.T) {
	invalid := []struct {
		from TaskStatus
		to   TaskStatus
	}{
		{StatusOpen, StatusResolved},
		{StatusOpen, StatusClosed},
		{StatusOpen, StatusWaitingClient},
		{StatusInProgress, StatusClosed},
		{StatusWaitingClient, StatusClosed},
		{StatusResolved, StatusCancelled},
		{StatusOpen, StatusOpen},
	}
	for _, tc := range invalid {
		assert.Falsef(t, CanTransition(tc.from, tc.to), "expected %s→%s to be invalid", tc.from, tc.to)
	}
}

func TestCanTransition_TerminalStates(t *testing.T) {
	// Closed and cancelled are terminal: no transition out is allowed.
	for _, to := range []TaskStatus{
		StatusOpen, StatusInProgress, StatusWaitingClient,
		StatusWaitingInternal, StatusResolved, StatusClosed, StatusCancelled,
	} {
		assert.Falsef(t, CanTransition(StatusClosed, to), "closed→%s must be invalid", to)
		assert.Falsef(t, CanTransition(StatusCancelled, to), "cancelled→%s must be invalid", to)
	}
}

func TestCanTransition_UnknownStatus(t *testing.T) {
	assert.False(t, CanTransition(TaskStatus("bogus"), StatusOpen))
}
