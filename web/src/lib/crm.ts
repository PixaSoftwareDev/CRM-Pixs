// Shared CRM label maps and badge color helpers for the sales/CRM domain.
// Keeps Spanish UI labels and StatusBadge colors in one place.

type BadgeColor = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function validateCUIT(cuit: string): boolean {
  const clean = cuit.replace(/[-\s]/g, '')
  if (!/^\d{11}$/.test(clean)) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * parseInt(clean[i], 10), 0)
  const remainder = sum % 11
  const expected = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder
  return parseInt(clean[10], 10) === expected
}

// ---- Contact kind ----
export const contactKinds = ['cliente', 'proveedor', 'prospecto'] as const
export const contactKindLabel: Record<string, string> = {
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  prospecto: 'Prospecto',
}
export const contactKindColor: Record<string, BadgeColor> = {
  cliente: 'success',
  proveedor: 'info',
  prospecto: 'warning',
}

// ---- Lifecycle ----
export const lifecycleOptions = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'prospect', label: 'Prospecto' },
]
export const lifecycleLabel: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  prospect: 'Prospecto',
}
export const lifecycleColor: Record<string, BadgeColor> = {
  active: 'success',
  inactive: 'neutral',
  prospect: 'warning',
}

// ---- VAT condition ----
export const vatConditionOptions = [
  { value: 'Responsable Inscripto', label: 'Responsable Inscripto' },
  { value: 'Monotributista', label: 'Monotributista' },
  { value: 'Exento', label: 'Exento' },
  { value: 'Consumidor Final', label: 'Consumidor Final' },
]

// ---- Quote status ----
export const quoteStatusLabel: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
}
export const quoteStatusColor: Record<string, BadgeColor> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

// ---- Project status ----
export const projectStatusOptions = [
  { value: 'active', label: 'Activo' },
  { value: 'paused', label: 'Pausado' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
]
export const projectStatusLabel: Record<string, string> = {
  active: 'Activo',
  paused: 'Pausado',
  completed: 'Completado',
  cancelled: 'Cancelado',
}
export const projectStatusColor: Record<string, BadgeColor> = {
  active: 'success',
  paused: 'warning',
  completed: 'info',
  cancelled: 'danger',
}

// ---- Milestone status ----
export const milestoneStatusOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'done', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
]
export const milestoneStatusLabel: Record<string, string> = {
  pending: 'Pendiente',
  done: 'Completado',
  cancelled: 'Cancelado',
}
export const milestoneStatusColor: Record<string, BadgeColor> = {
  pending: 'warning',
  done: 'success',
  cancelled: 'neutral',
}

// ---- Task status ----
export const taskStatusLabel: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  waiting_client: 'Espera cliente',
  waiting_internal: 'Espera interna',
  resolved: 'Resuelto',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
}
export const taskStatusColor: Record<string, BadgeColor> = {
  open: 'neutral',
  in_progress: 'info',
  waiting_client: 'warning',
  waiting_internal: 'warning',
  resolved: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
}

// ---- Task priority ----
export const taskPriorityOptions = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]
export const taskPriorityLabel: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}
// Hex dot colors for priority indicators.
export const taskPriorityDot: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#9ca3af',
}

// ---- Calendar event status ----
export const eventStatusOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'done', label: 'Realizado' },
  { value: 'rescheduled', label: 'Reprogramado' },
  { value: 'cancelled', label: 'Cancelado' },
]

export const currencyOptions = [
  { value: 'ARS', label: 'ARS — Peso argentino' },
  { value: 'USD', label: 'USD — Dólar' },
]
