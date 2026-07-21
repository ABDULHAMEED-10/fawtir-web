import { useId, type InputHTMLAttributes } from 'react'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
}

export function Checkbox({ label, id, className = '', ...props }: CheckboxProps) {
  const generatedId = useId()
  const checkboxId = id ?? generatedId

  return (
    <label
      htmlFor={checkboxId}
      className={`inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-text-secondary ${className}`}
    >
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          id={checkboxId}
          type="checkbox"
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
          {...props}
        />
        <span
          className={[
            'flex h-5 w-5 items-center justify-center rounded-sm border transition-colors',
            'border-border-default bg-surface-card',
            'peer-checked:border-primary-700 peer-checked:bg-primary-700 peer-checked:[&_svg]:opacity-100',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-border-brand',
          ].join(' ')}
          aria-hidden="true"
        >
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none" className="opacity-0 transition-opacity">
            <path
              d="M1 5.2L4.2 8.5L11 1.5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
      {label}
    </label>
  )
}
