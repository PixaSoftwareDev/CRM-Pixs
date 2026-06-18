import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useUIStore } from '../../stores/ui'
import { cn } from '../../lib/utils'

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  const removeToast = useUIStore((s) => s.removeToast)

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 min-w-72 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          aria-live="polite"
          className={cn(
            'flex items-start gap-3 rounded-lg p-4 shadow-lg text-white text-sm font-medium',
            t.type === 'success' && 'bg-success',
            t.type === 'error' && 'bg-danger',
            t.type === 'info' && 'bg-info',
          )}
        >
          {t.type === 'success' && <CheckCircle size={18} className="shrink-0 mt-0.5" />}
          {t.type === 'error' && <XCircle size={18} className="shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info size={18} className="shrink-0 mt-0.5" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 opacity-75 hover:opacity-100"
            aria-label="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
