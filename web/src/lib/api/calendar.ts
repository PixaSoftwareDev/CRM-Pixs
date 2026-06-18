import { api } from './client'

export interface EventType {
  id: string
  name: string
  color: string
  icon?: string
}

export interface CalendarEvent {
  id: string
  company_id: string
  title: string
  event_type_id?: string
  contact_id?: string
  assigned_user_id: string
  starts_at: string
  ends_at?: string
  all_day: boolean
  status: string
  notes?: string
  related_task_id?: string
  related_opportunity_id?: string
  related_project_id?: string
  created_at: string
  updated_at: string
}

export interface CreateEventInput {
  title: string
  event_type_id?: string
  contact_id?: string
  assigned_user_id: string
  starts_at: string
  ends_at?: string
  all_day: boolean
  status: string
  notes?: string
  related_task_id?: string
  related_opportunity_id?: string
  related_project_id?: string
}

export const calendarApi = {
  eventTypes: () => api.get<EventType[]>('/calendar/event-types'),
  events: (params?: {
    from?: string
    to?: string
    type_id?: string
    contact_id?: string
    user_id?: string
    status?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    if (params?.type_id) qs.set('type_id', params.type_id)
    if (params?.contact_id) qs.set('contact_id', params.contact_id)
    if (params?.user_id) qs.set('user_id', params.user_id)
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return api.get<CalendarEvent[]>(`/calendar/events${q ? '?' + q : ''}`)
  },
  create: (body: CreateEventInput) => api.post<CalendarEvent>('/calendar/events', body),
  update: (id: string, body: CreateEventInput) =>
    api.put<CalendarEvent>(`/calendar/events/${id}`, body),
  delete: (id: string) => api.delete<void>(`/calendar/events/${id}`),
}
