import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, id, className, ...props }, ref) => {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`
    const hintId = hint ? `${inputId}-hint` : undefined
    const errorId = error ? `${inputId}-error` : undefined
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={cn(
            'h-10 w-full rounded border bg-surface px-3 text-base text-text placeholder:text-text-tertiary',
            'border-border focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
            error && 'border-danger focus:border-danger focus:ring-danger/20',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-text-secondary">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
