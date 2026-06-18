package lead

import "testing"

func TestCanTransition_Valid(t *testing.T) {
	valid := []struct{ from, to LeadStatus }{
		{StatusNew, StatusContacted},
		{StatusNew, StatusRejected},
		{StatusNew, StatusWaiting},
		{StatusContacted, StatusFollowing},
		{StatusContacted, StatusQualified},
		{StatusContacted, StatusRejected},
		{StatusContacted, StatusWaiting},
		{StatusFollowing, StatusContacted},
		{StatusFollowing, StatusQualified},
		{StatusQualified, StatusConverted},
		{StatusQualified, StatusRejected},
		{StatusWaiting, StatusContacted},
		{StatusWaiting, StatusFollowing},
		{StatusWaiting, StatusRejected},
		{StatusRejected, StatusNew}, // reopen
	}
	for _, tc := range valid {
		if !CanTransition(tc.from, tc.to) {
			t.Errorf("expected %s -> %s to be allowed", tc.from, tc.to)
		}
	}
}

func TestCanTransition_Invalid(t *testing.T) {
	invalid := []struct{ from, to LeadStatus }{
		{StatusNew, StatusConverted}, // must qualify first
		{StatusNew, StatusQualified}, // must contact first
		{StatusContacted, StatusConverted},
		{StatusFollowing, StatusConverted},
		{StatusConverted, StatusNew},       // terminal
		{StatusConverted, StatusContacted}, // terminal
		{StatusConverted, StatusRejected},  // terminal
		{StatusRejected, StatusConverted},  // can only reopen to new
		{StatusWaiting, StatusConverted},
		{LeadStatus("bogus"), StatusNew}, // unknown source state
		{StatusNew, LeadStatus("bogus")}, // unknown target state
	}
	for _, tc := range invalid {
		if CanTransition(tc.from, tc.to) {
			t.Errorf("expected %s -> %s to be rejected", tc.from, tc.to)
		}
	}
}

func TestConvertedIsTerminal(t *testing.T) {
	allowed := validTransitions[StatusConverted]
	if len(allowed) != 0 {
		t.Errorf("converted must be terminal, got transitions: %v", allowed)
	}
	for to := range validTransitions {
		if CanTransition(StatusConverted, to) {
			t.Errorf("converted must not transition to %s", to)
		}
	}
}

func TestStatusIsValid(t *testing.T) {
	for s := range validTransitions {
		if !s.IsValid() {
			t.Errorf("status %s should be valid", s)
		}
	}
	if LeadStatus("nope").IsValid() {
		t.Error("unknown status should be invalid")
	}
}
