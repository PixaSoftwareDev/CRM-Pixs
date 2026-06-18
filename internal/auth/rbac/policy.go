// internal/auth/rbac/policy.go

// Package rbac provides an in-memory, immutable RBAC policy engine for PIXS.
// Load a Policy once from the database at startup and atomically swap it on
// permission changes using sync/atomic.Pointer.
package rbac

// Entry represents a single effective permission granted by a role.
type Entry struct {
	Module          string
	Action          string
	RestrictedToOwn bool
}

// PolicyEntry is the flat input record used to construct a Policy.
type PolicyEntry struct {
	RoleID          string
	Module          string
	Action          string
	RestrictedToOwn bool
}

// Policy is an immutable, in-memory snapshot of all role→permission mappings.
// After construction it is safe to use from multiple goroutines without locking,
// because it is never mutated. To refresh permissions, build a new Policy and
// replace the pointer atomically (e.g. with sync/atomic.Pointer[Policy]).
type Policy struct {
	// roleEntries maps roleID → slice of entries for that role.
	roleEntries map[string][]Entry
}

// NewPolicy constructs a Policy from a flat list of PolicyEntry records.
// Duplicate (roleID, module, action) combinations are accepted; the last one
// written wins for the RestrictedToOwn flag.
func NewPolicy(entries []PolicyEntry) *Policy {
	roleEntries := make(map[string][]Entry, len(entries))

	// Use a nested map during construction to de-duplicate per role+module+action.
	type key struct{ module, action string }
	interim := make(map[string]map[key]Entry)

	for _, e := range entries {
		if interim[e.RoleID] == nil {
			interim[e.RoleID] = make(map[key]Entry)
		}
		interim[e.RoleID][key{e.Module, e.Action}] = Entry{
			Module:          e.Module,
			Action:          e.Action,
			RestrictedToOwn: e.RestrictedToOwn,
		}
	}

	for roleID, byKey := range interim {
		sl := make([]Entry, 0, len(byKey))
		for _, ent := range byKey {
			sl = append(sl, ent)
		}
		roleEntries[roleID] = sl
	}

	return &Policy{roleEntries: roleEntries}
}

// Check evaluates whether any of the given roleIDs grants (module, action).
//
// Returns:
//   - permitted=false, restrictedToOwn=false: no role grants this permission.
//   - permitted=true,  restrictedToOwn=true:  every matching role restricts to own resources.
//   - permitted=true,  restrictedToOwn=false: at least one matching role is unrestricted.
//
// The logic for restrictedToOwn mirrors common RBAC practice: a user with two
// roles where one is unrestricted should receive the broader access.
func (p *Policy) Check(roleIDs []string, module, action string) (permitted, restrictedToOwn bool) {
	// allRestricted tracks whether every hit so far has RestrictedToOwn=true.
	// We start as true and flip to false the moment we find an unrestricted grant.
	allRestricted := true
	found := false

	for _, roleID := range roleIDs {
		entries, ok := p.roleEntries[roleID]
		if !ok {
			continue
		}
		for _, e := range entries {
			if e.Module == module && e.Action == action {
				found = true
				if !e.RestrictedToOwn {
					allRestricted = false
				}
			}
		}
	}

	if !found {
		return false, false
	}
	return true, allRestricted
}
