import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

// ErrorState is the standard "something failed, retry" panel used across views.
export function ErrorState({
  message = 'No pudimos cargar la información.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface py-16 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised text-danger">
        <AlertTriangle size={28} />
      </div>
      <p className="text-sm text-text-secondary">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="md" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
