import { useId, type InputHTMLAttributes } from 'react'
import omanFlag from '../../assets/flags/oman.svg'

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  requiredMark?: boolean
  error?: string
}

export function PhoneInput({
  label,
  requiredMark = false,
  error,
  id,
  className = '',
  ...props
}: PhoneInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor={inputId}
        className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary"
      >
        {label}
        {requiredMark ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </label>
      <div
        className={[
          'flex h-[50px] items-center gap-2 rounded-sm bg-surface-card px-4',
          'transition-shadow focus-within:ring-1 focus-within:ring-border-brand',
          error ? 'ring-1 ring-border-danger' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <img
          src={omanFlag}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 shrink-0 rounded-[2px] object-cover"
        />
        <span className="shrink-0 text-sm font-medium tracking-[0.14px] text-text-tertiary">
          +968
        </span>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          className="h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          {...props}
        />
      </div>
      {error ? <p className="text-xs font-medium text-text-danger">{error}</p> : null}
    </div>
  )
}
