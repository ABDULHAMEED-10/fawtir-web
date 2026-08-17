import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  requiredMark?: boolean
  labelEnd?: ReactNode
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  error?: string
  hint?: string
  readOnlyAppearance?: boolean
}

export function Input({
  label,
  requiredMark = false,
  labelEnd,
  leadingIcon,
  trailingIcon,
  error,
  hint,
  readOnlyAppearance = false,
  className = '',
  id,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary"
        >
          {label}
          {requiredMark ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
        </label>
        {labelEnd ? <span className="inline-flex shrink-0 items-center">{labelEnd}</span> : null}
      </div>
      <div
        className={[
          'flex h-[50px] items-center justify-between gap-2 rounded-sm px-4',
          readOnlyAppearance
            ? 'border border-primary-300 bg-primary-50'
            : 'bg-surface-card transition-shadow focus-within:ring-1 focus-within:ring-border-brand',
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
            className={[
              'h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium outline-none placeholder:text-text-placeholder',
              readOnlyAppearance ? 'text-primary-800' : 'text-text-primary',
            ].join(' ')}
            {...props}
          />
        </div>
        {trailingIcon ? (
          <span className="inline-flex shrink-0 text-text-quaternary">{trailingIcon}</span>
        ) : null}
      </div>
      {error ? <p className="text-xs font-medium text-text-danger">{error}</p> : null}
      {!error && hint ? (
        <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}
