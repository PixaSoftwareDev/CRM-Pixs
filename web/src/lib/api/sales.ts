import { api } from './client'

// ---- Pipeline / Opportunities ----

export interface PipelineStage {
  id: string
  name: string
  order_pos: number
  win_stage: boolean
  loss_stage: boolean
  color?: string
}

export interface LostReason {
  id: string
  name: string
}

export interface ForecastStage {
  stage_id: string
  stage_name: string
  count: number
  total: string
  weighted: string
}

export interface Forecast {
  forecast: string
}

export interface Opportunity {
  id: string
  company_id: string
  contact_id: string
  stage_id: string
  title: string
  amount?: string
  currency: string
  probability_pct?: number
  expected_close_date?: string
  assigned_user_id?: string
  source?: string
  status: string
  created_at: string
  updated_at: string
}

export interface CreateOpportunityInput {
  contact_id: string
  stage_id: string
  title: string
  amount?: string
  currency: string
  probability_pct?: number
  expected_close_date?: string
  assigned_user_id?: string
  source?: string
}

// ---- Quotes ----

export interface QuoteItem {
  id?: string
  product_id?: string
  description: string
  quantity: string
  unit_price: string
  discount_pct: string
  vat_rate_pct: string
  order_pos?: number
  subtotal?: string
}

export interface Quote {
  id: string
  company_id: string
  contact_id: string
  opportunity_id?: string
  number?: string
  version?: number
  date: string
  valid_until?: string
  currency: string
  exchange_rate?: string
  notes?: string
  status: string
  subtotal?: string
  tax_total?: string
  total?: string
  items?: QuoteItem[]
  created_at: string
  updated_at: string
}

export interface CreateQuoteInput {
  contact_id: string
  opportunity_id?: string
  date: string
  valid_until?: string
  currency: string
  exchange_rate?: string
  notes?: string
  items: Omit<QuoteItem, 'id' | 'subtotal'>[]
}

export interface Product {
  id: string
  name: string
  description?: string
  unit_price?: string
  currency?: string
  vat_rate_pct?: string
  active: boolean
}

export const pipelineApi = {
  stages: () => api.get<PipelineStage[]>('/pipeline/stages'),
  lostReasons: () => api.get<LostReason[]>('/pipeline/lost-reasons'),
  forecast: () => api.get<Forecast>('/pipeline/forecast'),
}

export const opportunitiesApi = {
  list: (params?: {
    stage_id?: string
    contact_id?: string
    assigned_user_id?: string
    status?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.stage_id) qs.set('stage_id', params.stage_id)
    if (params?.contact_id) qs.set('contact_id', params.contact_id)
    if (params?.assigned_user_id) qs.set('assigned_user_id', params.assigned_user_id)
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return api.get<Opportunity[]>(`/opportunities${q ? '?' + q : ''}`)
  },
  get: (id: string) => api.get<Opportunity>(`/opportunities/${id}`),
  create: (body: CreateOpportunityInput) => api.post<Opportunity>('/opportunities', body),
  update: (id: string, body: CreateOpportunityInput) =>
    api.put<Opportunity>(`/opportunities/${id}`, body),
  delete: (id: string) => api.delete<void>(`/opportunities/${id}`),
  move: (id: string, stage_id: string) =>
    api.post<Opportunity>(`/opportunities/${id}/move`, { stage_id }),
  win: (id: string) => api.post<Opportunity>(`/opportunities/${id}/win`, {}),
  lose: (id: string, body: { reason_id?: string; custom_reason?: string }) =>
    api.post<Opportunity>(`/opportunities/${id}/lose`, body),
}

export const quotesApi = {
  list: (params?: { status?: string; contact_id?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.contact_id) qs.set('contact_id', params.contact_id)
    const q = qs.toString()
    return api.get<Quote[]>(`/quotes${q ? '?' + q : ''}`)
  },
  get: (id: string) => api.get<Quote>(`/quotes/${id}`),
  create: (body: CreateQuoteInput) => api.post<Quote>('/quotes', body),
  update: (id: string, body: CreateQuoteInput) => api.put<Quote>(`/quotes/${id}`, body),
  delete: (id: string) => api.delete<void>(`/quotes/${id}`),
  setStatus: (id: string, status: string) =>
    api.post<Quote>(`/quotes/${id}/status`, { status }),
  versions: (id: string) => api.get<Quote[]>(`/quotes/${id}/versions`),
}

export const productsApi = {
  list: (activeOnly = true) =>
    api.get<Product[]>(`/products${activeOnly ? '?active=true' : ''}`),
}
