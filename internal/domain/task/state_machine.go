package task

// validTransitions defines allowed status transitions.
// Terminal states (closed, cancelled) have empty sets.
var validTransitions = map[TaskStatus][]TaskStatus{
	StatusOpen: {
		StatusInProgress,
		StatusCancelled,
	},
	StatusInProgress: {
		StatusWaitingClient,
		StatusWaitingInternal,
		StatusResolved,
		StatusCancelled,
	},
	StatusWaitingClient: {
		StatusInProgress,
		StatusResolved,
		StatusCancelled,
	},
	StatusWaitingInternal: {
		StatusInProgress,
		StatusCancelled,
	},
	StatusResolved: {
		StatusClosed,
		StatusInProgress, // reopen
	},
	StatusClosed:    {},
	StatusCancelled: {},
}

// CanTransition returns true if the transition from → to is allowed.
func CanTransition(from, to TaskStatus) bool {
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
