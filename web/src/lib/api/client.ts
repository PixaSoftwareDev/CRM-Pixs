export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message)
    this.name = 'ApiRequestError'
  }
}

// Most domain endpoints live under /api/v1. Auth endpoints live under /auth.
// `request` takes a full path starting with '/', so callers choose the prefix.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      // For FormData let the browser set Content-Type (with the multipart boundary).
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    // Redirect to login, but avoid redirect loop.
    if (!window.location.pathname.includes('/login')) {
      window.location.replace('/login')
    }
    throw new ApiRequestError(401, { code: 'unauthorized', message: 'Sesión expirada' })
  }

  if (res.status === 403) {
    throw new ApiRequestError(403, { code: 'forbidden', message: 'Sin permiso para esta acción' })
  }

  if (!res.ok) {
    let error: ApiError = { code: 'unknown', message: 'Error interno del servidor' }
    try {
      const body = await res.json()
      if (body.message) error = { code: body.code ?? 'error', message: body.message }
    } catch {
      // ignore non-JSON bodies
    }
    throw new ApiRequestError(res.status, error)
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

const API_BASE = '/api/v1'

function withBase(path: string): string {
  return path.startsWith('/auth') || path.startsWith('/health') ? path : `${API_BASE}${path}`
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(withBase(path), { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(withBase(path), {
      ...options,
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(withBase(path), {
      ...options,
      method: 'PUT',
      body: body != null ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(withBase(path), {
      ...options,
      method: 'PATCH',
      body: body != null ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(withBase(path), { ...options, method: 'DELETE' }),

  // postForm sends multipart/form-data (file uploads). Do not set Content-Type.
  postForm: <T>(path: string, formData: FormData, options?: RequestInit) =>
    request<T>(withBase(path), { ...options, method: 'POST', body: formData }),
}

// apiBase exposes the base path for building direct URLs (e.g. file downloads).
export const apiBase = API_BASE
