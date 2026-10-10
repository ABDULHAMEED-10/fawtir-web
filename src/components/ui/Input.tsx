import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  requiredMark?: boolean
  labelEnd?: ReactNode
  /** A short word beside the label, such as "optional", as the frames draw it. */
  labelNote?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  /** The message under the field. A node, so a sentence can carry the drawn rial sign. */
  error?: ReactNode
  hint?: string
  readOnlyAppearance?: boolean
  /**
   * Draws the field's own border.
   *
   * The default field is borderless because the auth and invoice forms sit on a tinted ground
   * that separates it. On a white card — Settings, Catalog — nothing separates it, so the box
   * has to be drawn.
   */
  bordered?: boolean
}

export function Input({
  label,
  requiredMark = false,
  labelEnd,
  labelNote,
  leadingIcon,
  trailingIcon,
  error,
  hint,
  readOnlyAppearance = false,
  bordered = false,
  className = '',
  id,
  'aria-describedby': describedBy,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  // The error replaces the hint, so one id serves whichever message is on screen and the input
  // stays linked to the text a screen reader should read with it.
  const messageId = `${inputId}-message`
  const hasMessage = Boolean(error || hint)

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary"
        >
          {label}
          {requiredMark ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
          {labelNote ? (
            <span className="ms-1.5 text-xs font-normal text-text-quaternary">{labelNote}</span>
          ) : null}
        </label>
        {labelEnd ? <span className="inline-flex shrink-0 items-center">{labelEnd}</span> : null}
      </div>
      <div
        className={[
          'flex h-[50px] items-center justify-between gap-2 rounded-sm px-4',
          readOnlyAppearance
            ? 'border border-primary-300 bg-primary-50'
            : bordered
              ? 'border border-border-default bg-white transition-colors focus-within:border-border-brand'
              : 'bg-surface-card transition-shadow focus-within:ring-1 focus-within:ring-border-brand',
          error ? 'ring-1 ring-border-danger' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 max-md:self-stretch">
          {leadingIcon ? (
            <span className="inline-flex shrink-0 text-primary-700">{leadingIcon}</span>
          ) : null}
          <input
            id={inputId}
            className={[
              'h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium outline-none placeholder:text-text-placeholder',
              readOnlyAppearance ? 'text-primary-800' : 'text-text-primary',
            ].join(' ')}
            aria-invalid={error ? true : undefined}
            {...props}
            aria-describedby={
              [describedBy, hasMessage ? messageId : undefined].filter(Boolean).join(' ') ||
              undefined
            }
          />
        </div>
        {trailingIcon ? (
          <span className="inline-flex shrink-0 text-text-quaternary">{trailingIcon}</span>
        ) : null}
      </div>
      {error ? (
        <p id={messageId} className="text-xs font-medium text-text-danger">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={messageId} className="text-[10px] font-medium leading-[1.2] text-text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
