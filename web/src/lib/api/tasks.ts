import { api } from './client'

export interface Task {
  id: string
  company_id: string
  type?: string
  title: string
  description?: string
  contact_id?: string
  project_id?: string
  assignee_id?: string
  origin?: string
  status: string
  priority: string
  due_date?: string
  parent_id?: string
  created_at: string
  updated_at: string
}

export interface CreateTaskInput {
  type?: string
  title: string
  description?: string
  contact_id?: string
  project_id?: string
  assignee_id?: string
  origin?: string
  status: string
  priority: string
  due_date?: string
  parent_id?: string
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  body: string
  created_at: string
}

export interface TaskHistoryEntry {
  id: string
  task_id: string
  user_id?: string
  from_status?: string
  to_status?: string
  field?: string
  created_at: string
  [key: string]: unknown
}

export const tasksApi = {
  list: (params?: {
    status?: string
    assignee_id?: string
    project_id?: string
    contact_id?: string
    due_before?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.assignee_id) qs.set('assignee_id', params.assignee_id)
    if (params?.project_id) qs.set('project_id', params.project_id)
    if (params?.contact_id) qs.set('contact_id', params.contact_id)
    if (params?.due_before) qs.set('due_before', params.due_before)
    const q = qs.toString()
    return api.get<Task[]>(`/tasks${q ? '?' + q : ''}`)
  },
  get: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (body: CreateTaskInput) => api.post<Task>('/tasks', body),
  update: (id: string, body: CreateTaskInput) => api.put<Task>(`/tasks/${id}`, body),
  delete: (id: string) => api.delete<void>(`/tasks/${id}`),
  setStatus: (id: string, status: string) => api.post<Task>(`/tasks/${id}/status`, { status }),
  assign: (id: string, userId: string) =>
    api.post<Task>(`/tasks/${id}/assign`, { user_id: userId }),
  comments: {
    list: (id: string) => api.get<TaskComment[]>(`/tasks/${id}/comments`),
    create: (id: string, body: string) =>
      api.post<TaskComment>(`/tasks/${id}/comments`, { body }),
  },
  history: (id: string) => api.get<TaskHistoryEntry[]>(`/tasks/${id}/history`),
  timer: {
    start: (id: string) => api.post<void>(`/tasks/${id}/timer/start`, {}),
    stop: (id: string) => api.post<void>(`/tasks/${id}/timer/stop`, {}),
  },
}

// Status transition map mirrors the backend's allowed transitions.
export const taskTransitions: Record<string, string[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['waiting_client', 'waiting_internal', 'resolved', 'cancelled'],
  waiting_client: ['in_progress', 'resolved', 'cancelled'],
  waiting_internal: ['in_progress', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
}
