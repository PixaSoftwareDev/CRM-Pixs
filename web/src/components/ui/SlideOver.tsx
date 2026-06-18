import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

// SlideOver is a panel that slides in from the right. Used for forms and detail
// views. Structurally similar to Modal but anchored to the edge.
export function SlideOver({ open, onClose, title, children, size = 'md' }: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      const first = panelRef.current?.querySelector<HTMLElement>(
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
  }

  if (!open) return null

  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slideover-title"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={cn(
          'relative h-full w-full overflow-y-auto bg-surface-overlay shadow-overlay flex flex-col',
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <h2 id="slideover-title" className="text-lg font-semibold text-text">
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
        <div className="flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}
