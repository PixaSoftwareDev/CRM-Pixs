import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type FocusEvent,
  type ChangeEvent,
} from 'react'
import { cn } from '../../lib/utils'

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  hint?: string
  error?: string
  currency?: string
  value?: string
  onChange?: (value: string) => void
}

function formatMoney(value: string, currency: string): string {
  const num = parseFloat(value.replace(/[^\d.]/g, ''))
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num)
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    { label, hint, error, currency = 'ARS', value = '', onChange, onBlur, className, ...props },
    ref,
  ) => {
    const [display, setDisplay] = useState(value ? formatMoney(value, currency) : '')

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      // Allow typing freely.
      setDisplay(e.target.value)
      // Extract numeric value.
      const raw = e.target.value.replace(/[^\d.]/g, '')
      onChange?.(raw)
    }

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
      if (value) {
        setDisplay(formatMoney(value, currency))
      }
      onBlur?.(e)
    }

    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-text">{label}</label>}
        <div className="relative">
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={display}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={!!error}
            className={cn(
              'h-10 w-full rounded border bg-surface px-3 text-base text-text placeholder:text-text-tertiary text-right',
              'border-border focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
              error && 'border-danger focus:border-danger focus:ring-danger/20',
              className,
            )}
            {...props}
          />
        </div>
        {hint && !error && <p className="text-xs text-text-secondary">{hint}</p>}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    )
  },
)
MoneyInput.displayName = 'MoneyInput'
