import { api } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'following'
  | 'qualified'
  | 'converted'
  | 'rejected'
  | 'waiting'

export interface LeadEmail {
  id: string
  lead_id: string
  email: string
  context?: string
  created_at: string
}

export interface LeadPhone {
  id: string
  lead_id: string
  phone: string
  type: string
  country?: string
  context?: string
  created_at: string
}

export interface LeadSocial {
  id: string
  lead_id: string
  platform: string
  handle?: string
  url?: string
  created_at: string
}

export interface Lead {
  id: string
  company_id: string
  company_name: string
  description?: string
  what_they_do?: string
  source_url?: string
  website?: string
  industry?: string
  approximate_size?: string
  city?: string
  country?: string
  language?: string
  assigned_to?: string
  status: LeadStatus
  rejection_reason?: string
  follow_up_date?: string
  scraping_job_id?: string
  converted_contact_id?: string
  llm_extraction_failed: boolean
  created_at: string
  updated_at: string
  emails: LeadEmail[] | null
  phones: LeadPhone[] | null
  socials: LeadSocial[] | null
}

export interface LeadActivity {
  id: string
  lead_id: string
  user_id?: string
  activity_type: string
  detail?: string
  created_at: string
}

export interface LeadMetrics {
  leads_this_month: number
  total_leads: number
  total_converted: number
  conversion_rate: number
  active_leads: number
  conversion_by_user: {
    user_id: string
    total: number
    converted: number
  }[]
}

export interface ConversionResult {
  lead: Lead
  contact_id: string
  opportunity_id?: string
}

export interface ScrapingJob {
  id: string
  company_id: string
  user_id: string
  query: string
  result_count_requested: number
  country?: string
  language?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at?: string
  finished_at?: string
  search_api_cost_usd?: string
  llm_tokens_input?: number
  llm_tokens_output?: number
  llm_cost_usd?: string
  total_cost_usd?: string
  urls_processed: number
  leads_found: number
  error_summary?: string
  created_at: string
}

export interface EnqueueResult {
  job_id: string
  status: string
  channel: string
}

export interface ListLeadsParams {
  status?: string
  assigned_to?: string
  industry?: string
  from_date?: string
  to_date?: string
  page?: number
  per_page?: number
}

export interface CreateLeadInput {
  company_name: string
  description?: string
  what_they_do?: string
  website?: string
  source_url?: string
  industry?: string
  approximate_size?: string
  city?: string
  country?: string
  language?: string
  assigned_to?: string
  follow_up_date?: string
}

export const leadsApi = {
  leads: {
    list: (params?: ListLeadsParams) => {
      const qs = new URLSearchParams()
      if (params?.status) qs.set('status', params.status)
      if (params?.assigned_to) qs.set('assigned_to', params.assigned_to)
      if (params?.industry) qs.set('industry', params.industry)
      if (params?.from_date) qs.set('from_date', params.from_date)
      if (params?.to_date) qs.set('to_date', params.to_date)
      if (params?.page) qs.set('page', String(params.page))
      if (params?.per_page) qs.set('per_page', String(params.per_page))
      const q = qs.toString()
      return api.get<Lead[]>(`/leads${q ? '?' + q : ''}`)
    },
    get: (id: string) => api.get<Lead>(`/leads/${id}`),
    create: (body: CreateLeadInput) => api.post<Lead>('/leads', body),
    update: (id: string, body: Partial<CreateLeadInput>) =>
      api.patch<Lead>(`/leads/${id}`, body),
    changeStatus: (id: string, status: string, rejection_reason?: string) =>
      api.post<Lead>(`/leads/${id}/status`, { status, rejection_reason }),
    assign: (id: string, assigned_to: string) =>
      api.post<Lead>(`/leads/${id}/assign`, { assigned_to }),
    addNote: (id: string, body: string) =>
      api.post<LeadActivity>(`/leads/${id}/note`, { body }),
    convert: (id: string, stage_id?: string) =>
      api.post<ConversionResult>(`/leads/${id}/convert`, { stage_id }),
    sendToOpportunity: (id: string, stage_id: string) =>
      api.post<ConversionResult>(`/leads/${id}/send-to-opportunity`, { stage_id }),
    activities: (id: string) => api.get<LeadActivity[]>(`/leads/${id}/activities`),
    metrics: () => api.get<LeadMetrics>('/leads/metrics'),
  },
  scraping: {
    enqueue: (body: { query?: string; result_count?: number; urls?: string[]; country?: string }) =>
      api.post<EnqueueResult>('/scraping-jobs', body),
    list: () => api.get<ScrapingJob[]>('/scraping-jobs'),
    get: (id: string) => api.get<ScrapingJob>(`/scraping-jobs/${id}`),
    delete: (id: string) => api.delete<void>(`/scraping-jobs/${id}`),
  },
}
