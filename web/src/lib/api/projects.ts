import { api } from './client'

export interface Project {
  id: string
  company_id: string
  client_id: string
  name: string
  description?: string
  start_date?: string
  estimated_end_date?: string
  actual_end_date?: string
  status: string
  responsible_id?: string
  budget_hours?: string
  budget_amount?: string
  currency: string
  opportunity_id?: string
  quote_id?: string
  created_at: string
  updated_at: string
}

export interface CreateProjectInput {
  client_id: string
  name: string
  description?: string
  start_date?: string
  estimated_end_date?: string
  actual_end_date?: string
  status: string
  responsible_id?: string
  budget_hours?: string
  budget_amount?: string
  currency: string
  opportunity_id?: string
  quote_id?: string
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  committed_date?: string
  status: string
  description?: string
  deliverables?: string
  order_pos?: number
  created_at: string
}

export type MilestoneInput = {
  name: string
  committed_date?: string
  status: string
  description?: string
}

export interface ProjectMember {
  user_id: string
  project_id?: string
  role_in_project?: string
  full_name: string
  email: string
}

// Profitability shape is backend-driven; keep it permissive.
export interface Profitability {
  [key: string]: unknown
}

export const projectsApi = {
  list: (params?: { status?: string; client_id?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.client_id) qs.set('client_id', params.client_id)
    const q = qs.toString()
    return api.get<Project[]>(`/projects${q ? '?' + q : ''}`)
  },
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (body: CreateProjectInput) => api.post<Project>('/projects', body),
  update: (id: string, body: CreateProjectInput) => api.put<Project>(`/projects/${id}`, body),
  delete: (id: string) => api.delete<void>(`/projects/${id}`),
  profitability: (id: string) => api.get<Profitability>(`/projects/${id}/profitability`),
  milestones: {
    list: (projectId: string) => api.get<Milestone[]>(`/projects/${projectId}/milestones`),
    create: (projectId: string, body: MilestoneInput) =>
      api.post<Milestone>(`/projects/${projectId}/milestones`, body),
    update: (projectId: string, milestoneId: string, body: MilestoneInput) =>
      api.put<Milestone>(`/projects/${projectId}/milestones/${milestoneId}`, body),
    delete: (projectId: string, milestoneId: string) =>
      api.delete<void>(`/projects/${projectId}/milestones/${milestoneId}`),
  },
  members: {
    list: (projectId: string) => api.get<ProjectMember[]>(`/projects/${projectId}/members`),
    add: (projectId: string, userId: string) =>
      api.post<ProjectMember>(`/projects/${projectId}/members`, { user_id: userId }),
    remove: (projectId: string, userId: string) =>
      api.delete<void>(`/projects/${projectId}/members/${userId}`),
  },
}
