import { type ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-4">
      {icon && (
        <div className="text-text-tertiary w-16 h-16 flex items-center justify-center rounded-2xl bg-surface-raised">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {description && <p className="text-sm text-text-secondary max-w-xs">{description}</p>}
      </div>
      {action && (
        <Button variant="primary" size="lg" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
