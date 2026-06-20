import { api } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string
  email: string
  full_name: string
  is_active: boolean
}

export interface Role {
  id: string
  company_id: string
  name: string
  description?: string
  is_system: boolean
  created_at: string
}

export interface Permission {
  id: string
  module: string
  action: string
  description?: string
}

export interface RolePermissionRow {
  module: string
  action: string
  restricted_to_own: boolean
}

export interface UserRoleRow {
  role_id: string
  role_name?: string
  name?: string
}

export interface Company {
  id: string
  legal_name: string
  fantasy_name: string
  cuit?: string
  vat_condition?: string
  fiscal_address?: string
  city?: string
  province?: string
  postal_code?: string
  logo_key?: string
  gross_income?: string
  activity_start_date?: string
  created_at: string
  updated_at: string
}

export interface AuditLogEntry {
  id: number
  user_id?: string
  timestamp: string
  entity_type: string
  entity_id: string
  action: string
  before_state?: unknown
  after_state?: unknown
}

export interface ExchangeRate {
  id: string
  company_id: string
  from_currency: string
  to_currency: string
  rate: string
  date: string
  source?: string
  created_at: string
}

export interface SearchResult {
  contacts: { id: string; fantasy_name: string; kind: string[] }[]
  leads: { id: string; company_name: string; status: string }[]
}

export const adminApi = {
  users: {
    list: () => api.get<AdminUser[]>('/admin/users'),
    create: (body: { email: string; full_name: string; password: string; role_id?: string }) =>
      api.post<AdminUser>('/admin/users', body),
    update: (id: string, body: { full_name: string }) =>
      api.patch<AdminUser>(`/admin/users/${id}`, body),
    toggleActive: (id: string, is_active: boolean) =>
      api.patch<{ is_active: boolean }>(`/admin/users/${id}/active`, { is_active }),
    getRoles: (id: string) => api.get<UserRoleRow[]>(`/admin/users/${id}/roles`),
    assignRole: (id: string, role_id: string) =>
      api.post<{ role_id: string }>(`/admin/users/${id}/roles`, { role_id }),
    removeRole: (id: string, role_id: string) =>
      api.delete<void>(`/admin/users/${id}/roles/${role_id}`),
  },
  roles: {
    list: () => api.get<Role[]>('/admin/roles'),
    create: (body: { name: string; description?: string }) =>
      api.post<Role>('/admin/roles', body),
    update: (id: string, body: { name: string; description?: string }) =>
      api.put<Role>(`/admin/roles/${id}`, body),
    remove: (id: string) => api.delete<void>(`/admin/roles/${id}`),
    permissions: (role_id: string) =>
      api.get<RolePermissionRow[]>(`/admin/roles/${role_id}/permissions`),
    upsertPermission: (role_id: string, perm_id: string, restricted_to_own = false) =>
      api.put<void>(`/admin/roles/${role_id}/permissions/${perm_id}`, { restricted_to_own }),
    deletePermission: (role_id: string, perm_id: string) =>
      api.delete<void>(`/admin/roles/${role_id}/permissions/${perm_id}`),
  },
  permissions: {
    list: () => api.get<Permission[]>('/admin/permissions'),
  },
  company: {
    get: () => api.get<Company>('/admin/company'),
    update: (body: Partial<Company>) => api.put<Company>('/admin/company', body),
  },
  audit: {
    list: (params?: { entity_type?: string; entity_id?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams()
      if (params?.entity_type) qs.set('entity_type', params.entity_type)
      if (params?.entity_id) qs.set('entity_id', params.entity_id)
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.offset) qs.set('offset', String(params.offset))
      const q = qs.toString()
      return api.get<AuditLogEntry[]>(`/admin/audit-logs${q ? '?' + q : ''}`)
    },
  },
  exchangeRates: {
    create: (body: { from_currency: string; to_currency: string; rate: string; date: string; source?: string }) =>
      api.post<ExchangeRate>('/admin/exchange-rates', body),
    getLatest: (from: string, to: string) =>
      api.get<ExchangeRate>(`/admin/exchange-rates/latest?from=${from}&to=${to}`),
  },
  search: (q: string) => api.get<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
}
