import { api } from './client'

export type VaultCategory =
  | 'credencial'
  | 'api_key'
  | 'servidor'
  | 'base_datos'
  | 'correo'
  | 'certificado'
  | 'general'

export interface VaultEntry {
  id: string
  category: VaultCategory
  label: string
  username?: string
  secret?: string
  has_secret: boolean
  url?: string
  notes?: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface CreateVaultEntryInput {
  category: VaultCategory
  label: string
  username?: string
  secret?: string
  url?: string
  notes?: string
  tags?: string[]
}

export interface UpdateVaultEntryInput {
  category: VaultCategory
  label: string
  username?: string
  secret?: string
  url?: string
  notes?: string
  tags?: string[]
}

export const VAULT_CATEGORY_LABELS: Record<VaultCategory, string> = {
  credencial: 'Credencial',
  api_key: 'API Key',
  servidor: 'Servidor',
  base_datos: 'Base de datos',
  correo: 'Correo',
  certificado: 'Certificado',
  general: 'General',
}

export const vaultApi = {
  list: (category?: VaultCategory): Promise<VaultEntry[]> => {
    const params = category ? `?category=${category}` : ''
    return api.get<VaultEntry[]>(`/api/v1/vault${params}`)
  },

  get: (id: string): Promise<VaultEntry> => api.get<VaultEntry>(`/api/v1/vault/${id}`),

  create: (input: CreateVaultEntryInput): Promise<VaultEntry> =>
    api.post<VaultEntry>('/api/v1/vault', input),

  update: (id: string, input: UpdateVaultEntryInput): Promise<VaultEntry> =>
    api.put<VaultEntry>(`/api/v1/vault/${id}`, input),

  delete: (id: string): Promise<unknown> => api.delete(`/api/v1/vault/${id}`),
}
