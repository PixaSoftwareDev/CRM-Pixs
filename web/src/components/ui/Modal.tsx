import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      setTimeout(() => first?.focus(), 10)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    // Basic focus trap.
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  if (!open) return null

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={cn('relative w-full rounded-xl bg-surface-overlay shadow-overlay p-6', sizes[size])}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="modal-title" className="text-lg font-semibold text-text">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text p-1 rounded"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface ConfirmModalProps {
  open?: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  message?: string
  confirmLabel?: string
  loading?: boolean
  variant?: 'danger' | 'primary'
}

export function ConfirmModal({
  open = true,
  onClose,
  onConfirm,
  title,
  description,
  message,
  confirmLabel = 'Confirmar',
  loading,
  variant = 'danger',
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-text-secondary mb-6">{message ?? description}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant={variant} size="md" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
