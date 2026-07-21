import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  requiredMark?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  error?: string
}

export function Input({
  label,
  requiredMark = false,
  leadingIcon,
  trailingIcon,
  error,
  className = '',
  id,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={inputId} className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary">
        {label}
        {requiredMark ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </label>
      <div
        className={[
          'flex h-[50px] items-center justify-between gap-2 rounded-sm bg-surface-card px-4',
          'transition-shadow focus-within:ring-1 focus-within:ring-border-brand',
          error ? 'ring-1 ring-border-danger' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leadingIcon ? (
            <span className="inline-flex shrink-0 text-primary-700">{leadingIcon}</span>
          ) : null}
          <input
            id={inputId}
            className="h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            {...props}
          />
        </div>
        {trailingIcon ? (
          <span className="inline-flex shrink-0 text-text-quaternary">{trailingIcon}</span>
        ) : null}
      </div>
      {error ? <p className="text-xs font-medium text-text-danger">{error}</p> : null}
    </div>
  )
}
