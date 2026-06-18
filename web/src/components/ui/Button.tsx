import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'lg' | 'md' | 'sm'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center font-medium rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 disabled:pointer-events-none'

    const variants = {
      primary: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-hover',
      secondary:
        'bg-surface-raised text-text border border-border hover:bg-border hover:border-border-strong',
      ghost: 'text-text-secondary hover:bg-surface-raised hover:text-text',
      danger: 'bg-danger text-white hover:bg-red-600 active:bg-red-700',
    }

    const sizes = {
      lg: 'h-14 px-6 text-base gap-2.5', // 56px — acción primaria
      md: 'h-10 px-4 text-sm gap-2', // 40px
      sm: 'h-8 px-3 text-sm gap-1.5', // 32px
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" size={size === 'lg' ? 20 : 16} />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
