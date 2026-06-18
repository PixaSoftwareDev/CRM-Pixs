import { api } from './client'

export interface EventType {
  id: string
  name: string
  color: string
  icon?: string
}

export interface PipelineStage {
  id: string
  name: string
  color: string
  order_pos: number
  is_win: boolean
  is_loss: boolean
  is_default: boolean
}

export interface LostReason {
  id: string
  name: string
  created_at: string
}

export interface CatalogTag {
  id: string
  name: string
  color?: string
  area?: string
}

export interface VatRate {
  id: string
  name: string
  rate: string
}

export interface PaymentCondition {
  id: string
  name: string
  days: number
}

export interface ExpenseCategory {
  id: string
  name: string
}

export interface Currency {
  code: string
  name: string
  symbol: string
}

export const catalogsApi = {
  eventTypes: {
    list: () => api.get<EventType[]>('/admin/catalogs/event-types'),
    create: (data: { name: string; color: string; icon?: string }) =>
      api.post<EventType>('/admin/catalogs/event-types', data),
  },
  pipelineStages: {
    list: () => api.get<PipelineStage[]>('/admin/catalogs/pipeline-stages'),
    create: (data: { name: string; color: string; order_pos: number; is_win?: boolean; is_loss?: boolean; is_default?: boolean }) =>
      api.post<PipelineStage>('/admin/catalogs/pipeline-stages', data),
  },
  lostReasons: {
    list: () => api.get<LostReason[]>('/admin/catalogs/lost-reasons'),
    create: (data: { name: string }) =>
      api.post<LostReason>('/admin/catalogs/lost-reasons', data),
  },
  tags: {
    list: () => api.get<CatalogTag[]>('/admin/catalogs/tags'),
    create: (data: { name: string; color?: string; area?: string }) =>
      api.post<CatalogTag>('/admin/catalogs/tags', data),
  },
  vatRates: {
    list: () => api.get<VatRate[]>('/admin/catalogs/vat-rates'),
  },
  paymentConditions: {
    list: () => api.get<PaymentCondition[]>('/admin/catalogs/payment-conditions'),
  },
  expenseCategories: {
    list: () => api.get<ExpenseCategory[]>('/admin/catalogs/expense-categories'),
  },
  currencies: {
    list: () => api.get<Currency[]>('/admin/catalogs/currencies'),
  },
}
