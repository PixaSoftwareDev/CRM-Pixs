import { api } from './client'

export interface Contact {
  id: string
  company_id: string
  kind: string[]
  fantasy_name: string
  legal_name?: string
  cuit_cuil?: string
  vat_condition?: string
  fiscal_address?: string
  city?: string
  province?: string
  postal_code?: string
  email?: string
  phone?: string
  website?: string
  industry?: string
  source?: string
  credit_limit?: string
  usual_discount_pct: string
  assigned_user_id?: string
  lifecycle_status: string
  created_at: string
  updated_at: string
}

export interface ContactPerson {
  id: string
  contact_id: string
  name: string
  role?: string
  email?: string
  phone?: string
  notes?: string
  birthday?: string
  is_primary: boolean
  created_at: string
}

export interface ContactBankAccount {
  id: string
  contact_id: string
  cbu: string
  alias?: string
  bank_name?: string
  account_holder?: string
  currency: string
  created_at: string
}

export interface ContactNote {
  id: string
  contact_id: string
  user_id: string
  body: string
  created_at: string
}

export interface ContactTag {
  id: string
  name: string
  color?: string
  area?: string
}

export interface TimelineEntry {
  kind: string
  timestamp: string
  [key: string]: unknown
}

export type CreateContactInput = Omit<Contact, 'id' | 'company_id' | 'created_at' | 'updated_at'>
export type PersonInput = Omit<ContactPerson, 'id' | 'contact_id' | 'created_at'>
export type BankAccountInput = {
  cbu: string
  alias?: string
  bank_name?: string
  account_holder?: string
  currency: string
}

export const contactsApi = {
  list: (params?: {
    q?: string
    kind?: string
    assigned_user_id?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.kind) qs.set('kind', params.kind)
    if (params?.assigned_user_id) qs.set('assigned_user_id', params.assigned_user_id)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return api.get<Contact[]>(`/contacts${q ? '?' + q : ''}`)
  },
  get: (id: string) => api.get<Contact>(`/contacts/${id}`),
  create: (body: CreateContactInput) => api.post<Contact>('/contacts', body),
  update: (id: string, body: CreateContactInput) => api.put<Contact>(`/contacts/${id}`, body),
  delete: (id: string) => api.delete<void>(`/contacts/${id}`),
  timeline: (id: string) => api.get<TimelineEntry[]>(`/contacts/${id}/timeline`),
  persons: {
    list: (contactId: string) => api.get<ContactPerson[]>(`/contacts/${contactId}/persons`),
    create: (contactId: string, body: PersonInput) =>
      api.post<ContactPerson>(`/contacts/${contactId}/persons`, body),
    update: (contactId: string, personId: string, body: PersonInput) =>
      api.put<ContactPerson>(`/contacts/${contactId}/persons/${personId}`, body),
    delete: (contactId: string, personId: string) =>
      api.delete<void>(`/contacts/${contactId}/persons/${personId}`),
  },
  bankAccounts: {
    list: (contactId: string) =>
      api.get<ContactBankAccount[]>(`/contacts/${contactId}/bank-accounts`),
    create: (contactId: string, body: BankAccountInput) =>
      api.post<ContactBankAccount>(`/contacts/${contactId}/bank-accounts`, body),
    delete: (contactId: string, accountId: string) =>
      api.delete<void>(`/contacts/${contactId}/bank-accounts/${accountId}`),
  },
  notes: {
    list: (contactId: string) => api.get<ContactNote[]>(`/contacts/${contactId}/notes`),
    create: (contactId: string, body: string) =>
      api.post<ContactNote>(`/contacts/${contactId}/notes`, { body }),
  },
  tags: {
    list: (contactId: string) => api.get<ContactTag[]>(`/contacts/${contactId}/tags`),
    add: (contactId: string, tagId: string) =>
      api.post<void>(`/contacts/${contactId}/tags`, { tag_id: tagId }),
    remove: (contactId: string, tagId: string) =>
      api.delete<void>(`/contacts/${contactId}/tags/${tagId}`),
  },
}
