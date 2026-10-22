import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children: ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-700 text-text-on-primary hover:bg-primary-800 active:bg-primary-900 disabled:bg-primary-200',
  secondary:
    'bg-surface-card text-text-brand border border-border-brand-subtle hover:bg-primary-25',
  ghost: 'bg-transparent text-text-brand hover:bg-primary-25',
  danger:
    'bg-danger-700 text-text-on-primary hover:bg-danger-700/90 disabled:cursor-not-allowed disabled:opacity-40',
}

const sizes: Record<ButtonSize, string> = {
  md: 'h-11 px-4 text-base font-semibold',
  lg: 'h-[54px] px-5 text-base font-semibold',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center rounded-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-brand',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
