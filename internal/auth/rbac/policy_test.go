// internal/auth/rbac/policy_test.go

package rbac_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"pixs/internal/auth/rbac"
)

// Seed role IDs used throughout the tests.
const (
	roleAdmin    = "role-admin"
	roleVentas   = "role-ventas"
	roleContable = "role-contable"
	roleSoporte  = "role-soporte"
)

// buildPolicy returns a representative policy that mirrors the project seed data.
func buildPolicy() *rbac.Policy {
	return rbac.NewPolicy([]rbac.PolicyEntry{
		// admin: unrestricted access to everything tested.
		{RoleID: roleAdmin, Module: "pipeline", Action: "view", RestrictedToOwn: false},
		{RoleID: roleAdmin, Module: "pipeline", Action: "view_all", RestrictedToOwn: false},
		{RoleID: roleAdmin, Module: "invoices_issued", Action: "view", RestrictedToOwn: false},
		{RoleID: roleAdmin, Module: "invoices_issued", Action: "create", RestrictedToOwn: false},
		{RoleID: roleAdmin, Module: "contacts", Action: "view", RestrictedToOwn: false},

		// ventas: can view own pipeline entries only; cannot view all.
		{RoleID: roleVentas, Module: "pipeline", Action: "view", RestrictedToOwn: true},
		{RoleID: roleVentas, Module: "contacts", Action: "view", RestrictedToOwn: true},

		// contable: unrestricted access to issued invoices.
		{RoleID: roleContable, Module: "invoices_issued", Action: "view", RestrictedToOwn: false},
		{RoleID: roleContable, Module: "invoices_issued", Action: "create", RestrictedToOwn: false},

		// soporte: only contacts view, restricted to own.
		{RoleID: roleSoporte, Module: "contacts", Action: "view", RestrictedToOwn: true},
	})
}

func TestCheck_AdminHasAllPermissionsUnrestricted(t *testing.T) {
	p := buildPolicy()

	permitted, restricted := p.Check([]string{roleAdmin}, "pipeline", "view")
	assert.True(t, permitted)
	assert.False(t, restricted)

	permitted, restricted = p.Check([]string{roleAdmin}, "pipeline", "view_all")
	assert.True(t, permitted)
	assert.False(t, restricted)

	permitted, restricted = p.Check([]string{roleAdmin}, "invoices_issued", "view")
	assert.True(t, permitted)
	assert.False(t, restricted)
}

func TestCheck_VentasHasPipelineViewRestrictedToOwn(t *testing.T) {
	p := buildPolicy()

	permitted, restricted := p.Check([]string{roleVentas}, "pipeline", "view")
	assert.True(t, permitted)
	assert.True(t, restricted, "ventas should only see own pipeline entries")
}

func TestCheck_VentasDoesNotHavePipelineViewAll(t *testing.T) {
	p := buildPolicy()

	permitted, _ := p.Check([]string{roleVentas}, "pipeline", "view_all")
	assert.False(t, permitted)
}

func TestCheck_ContableHasInvoicesViewUnrestricted(t *testing.T) {
	p := buildPolicy()

	permitted, restricted := p.Check([]string{roleContable}, "invoices_issued", "view")
	assert.True(t, permitted)
	assert.False(t, restricted)
}

func TestCheck_SoporteDoesNotHaveInvoicesView(t *testing.T) {
	p := buildPolicy()

	permitted, _ := p.Check([]string{roleSoporte}, "invoices_issued", "view")
	assert.False(t, permitted)
}

func TestCheck_NoRoles_NotPermitted(t *testing.T) {
	p := buildPolicy()

	permitted, restricted := p.Check([]string{}, "pipeline", "view")
	assert.False(t, permitted)
	assert.False(t, restricted)
}

func TestCheck_MultiRole_AdminOverridesOwnRestriction(t *testing.T) {
	p := buildPolicy()

	// ventas has pipeline/view restricted_to_own, admin has it unrestricted.
	// The result should be permitted=true, restrictedToOwn=false.
	permitted, restricted := p.Check([]string{roleVentas, roleAdmin}, "pipeline", "view")
	assert.True(t, permitted)
	assert.False(t, restricted, "admin's unrestricted grant should override ventas restriction")
}

func TestCheck_MultiRole_BothRestrictedStaysRestricted(t *testing.T) {
	p := buildPolicy()

	// Both ventas and soporte have contacts/view restricted_to_own.
	// Result should remain restricted.
	permitted, restricted := p.Check([]string{roleVentas, roleSoporte}, "contacts", "view")
	assert.True(t, permitted)
	assert.True(t, restricted, "both roles restrict to own, so result must be restricted")
}

func TestCheck_UnknownModuleAction_NotPermitted(t *testing.T) {
	p := buildPolicy()

	permitted, restricted := p.Check([]string{roleAdmin}, "nonexistent_module", "nonexistent_action")
	assert.False(t, permitted)
	assert.False(t, restricted)
}

func TestCheck_UnknownRoleID_NotPermitted(t *testing.T) {
	p := buildPolicy()

	permitted, restricted := p.Check([]string{"role-does-not-exist"}, "pipeline", "view")
	assert.False(t, permitted)
	assert.False(t, restricted)
}
