import { useRef, useState } from 'react'
import { Popover } from './Popover'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * A white header button that opens a short list, the shape of the POS cashier picker (Figma
 * 143:18015) and the header's other buttons. For a choice that sits among actions, where a form
 * field's Select would look like a field.
 */
export function OptionPicker({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  tall,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  ariaLabel: string
  /** What the button says while there is nothing to choose (loading, none, failed). */
  placeholder?: string
  /** The 46 px of the Catalogue header's buttons; otherwise the till's 44 px. */
  tall?: boolean
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.value === value)

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={options.length === 0}
        className={[
          'inline-flex shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 transition-colors hover:border-primary-300 disabled:cursor-default disabled:hover:border-border-subtle',
          tall ? 'h-[46px]' : 'h-11',
          'max-w-[220px]',
        ].join(' ')}
      >
        <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {current?.label ?? placeholder ?? ''}
        </span>
        <img
          src={chevron}
          alt=""
          className={[
            'size-4 shrink-0 opacity-60 transition-transform',
            open ? '-rotate-90' : 'rotate-90',
          ].join(' ')}
        />
      </button>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={240}>
        <ul role="listbox" aria-label={ariaLabel} className="max-h-[320px] overflow-y-auto py-1">
          {options.map((option) => {
            const chosen = option.value === value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25"
                >
                  <span
                    className={[
                      'min-w-0 flex-1 truncate text-sm',
                      chosen ? 'font-semibold text-primary-800' : 'font-medium text-text-secondary',
                    ].join(' ')}
                  >
                    {option.label}
                  </span>
                  {chosen ? <span className="shrink-0 text-primary-700">✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </Popover>
    </>
  )
}
