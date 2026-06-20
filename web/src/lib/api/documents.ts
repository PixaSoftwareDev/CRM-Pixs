import { api, apiBase } from './client'

export type DocumentEntityType = 'contact' | 'task'

export interface DocumentMeta {
  id: string
  company_id: string
  entity_type: DocumentEntityType
  entity_id: string
  file_name: string
  content_type: string
  size_bytes: number
  uploaded_by: string
  created_at: string
  updated_at: string
}

export const documentsApi = {
  list: (entityType: DocumentEntityType, entityId: string) =>
    api.get<DocumentMeta[]>(
      `/documents?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`,
    ),

  upload: (entityType: DocumentEntityType, entityId: string, file: File) => {
    const fd = new FormData()
    fd.append('entity_type', entityType)
    fd.append('entity_id', entityId)
    fd.append('file', file)
    return api.postForm<DocumentMeta>('/documents', fd)
  },

  // Direct URL for downloading (served with credentials via the browser).
  downloadUrl: (id: string) => `${apiBase}/documents/${id}/download`,

  delete: (id: string) => api.delete<void>(`/documents/${id}`),
}
