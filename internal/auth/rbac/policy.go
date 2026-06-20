// internal/auth/rbac/policy.go

// Package rbac provides an in-memory RBAC policy engine for PIXS.
// Load a Policy once from the database at startup; on permission changes call
// Replace to atomically swap its snapshot. The *Policy pointer held by callers
// (e.g. middleware) stays valid across reloads.
package rbac

import "sync/atomic"

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

// Policy is an in-memory snapshot of all role→permission mappings. Reads are
// lock-free; the snapshot is swapped atomically by Replace, so the same *Policy
// is safe for concurrent use and reflects the latest permissions after a reload.
type Policy struct {
	// snapshot holds the current roleID → entries map. Swapped atomically.
	snapshot atomic.Pointer[map[string][]Entry]
}

// buildSnapshot de-duplicates entries per role+module+action and returns the map.
func buildSnapshot(entries []PolicyEntry) map[string][]Entry {
	roleEntries := make(map[string][]Entry, len(entries))

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
	return roleEntries
}

// NewPolicy constructs a Policy from a flat list of PolicyEntry records.
// Duplicate (roleID, module, action) combinations are accepted; the last one
// written wins for the RestrictedToOwn flag.
func NewPolicy(entries []PolicyEntry) *Policy {
	p := &Policy{}
	m := buildSnapshot(entries)
	p.snapshot.Store(&m)
	return p
}

// Replace atomically swaps the policy's snapshot with one built from entries.
// Safe to call concurrently with reads; in-flight Check/Entries calls keep using
// the previous snapshot until they return.
func (p *Policy) Replace(entries []PolicyEntry) {
	m := buildSnapshot(entries)
	p.snapshot.Store(&m)
}

func (p *Policy) load() map[string][]Entry {
	if m := p.snapshot.Load(); m != nil {
		return *m
	}
	return nil
}

// Entries returns all effective (de-duplicated) permissions for the given role IDs.
// If two roles grant the same (module, action), the first one encountered wins.
func (p *Policy) Entries(roleIDs []string) []Entry {
	roleEntries := p.load()
	seen := make(map[string]bool)
	var result []Entry
	for _, rid := range roleIDs {
		for _, e := range roleEntries[rid] {
			key := e.Module + ":" + e.Action
			if !seen[key] {
				seen[key] = true
				result = append(result, e)
			}
		}
	}
	return result
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
	roleEntries := p.load()

	for _, roleID := range roleIDs {
		entries, ok := roleEntries[roleID]
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
