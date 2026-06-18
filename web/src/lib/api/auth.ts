import { api } from './client'

export interface LoginResponse {
  // When 2FA is required:
  totp_required?: boolean
  user_id?: string
  // When no 2FA: a session cookie is set and basic user info is returned.
  session_id?: string
  user?: {
    id: string
    email: string
    full_name: string
  }
}

export interface MeResponse {
  user_id: string
  company_id: string
  email: string
  full_name: string
  role_ids: string[]
}

export interface Permission {
  module: string
  action: string
  restricted_to_own: boolean
}

export interface MePermissionsResponse {
  permissions: Permission[]
}

export interface Session {
  id: string
  ip_address: string
  user_agent: string
  created_at: string
  last_seen_at: string
  expires_at: string
}

// Auth endpoints live under /auth (login/me/sessions/2fa).
// The effective-permissions endpoint lives under /api/v1.
export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  loginTotp: (user_id: string, code: string) =>
    api.post<{ session_id: string }>('/auth/login/totp', { user_id, code }),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<MeResponse>('/auth/me'),

  myPermissions: () => api.get<MePermissionsResponse>('/me/permissions'),

  sessions: () => api.get<Session[]>('/auth/sessions'),

  revokeSession: (id: string) => api.delete<void>(`/auth/sessions/${id}`),

  enable2fa: () => api.post<{ uri: string }>('/auth/2fa/enable'),

  verify2fa: (code: string, backup_code_hashes: string[]) =>
    api.post<void>('/auth/2fa/verify', { code, backup_code_hashes }),

  disable2fa: (code: string) => api.post<void>('/auth/2fa/disable', { code }),

  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('/me/change-password', { current_password, new_password }),
}
