import { useRef, useState, type ReactNode } from 'react'
import { Popover } from './Popover'
import chevronIcon from '../../assets/create-invoice/chevron.svg'

/**
 * Dropdown built on the app's 50px field shell.
 *
 * A native `<select>` cannot show a two-line option or an icon, and cannot be styled to match
 * the Figma field, so this is a listbox. The panel is portalled (see `Popover`) because these
 * sit inside scrollable tables and cards that would otherwise clip it.
 */

export type SelectOption = {
  value: string
  label: string
  /** Second line in the list — a rate, a code, an address. */
  hint?: string
  /** Shown on the trigger when the column is too narrow for the full label. */
  shortLabel?: string
  /** Leading glyph, shown on both the trigger and the row. */
  icon?: string
  disabled?: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
  highlighted,
  compact,
  footer,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  highlighted?: boolean
  /** 42px instead of 50px — used inside dense table rows. */
  compact?: boolean
  /** Rendered under the list, e.g. an "Add new…" action. */
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selected = options.find((option) => option.value === value)

  const commit = (option: SelectOption) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(options.findIndex((o) => o.value === value))
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      let next = activeIndex
      for (let i = 0; i < options.length; i += 1) {
        next = (next + step + options.length) % options.length
        if (!options[next].disabled) break
      }
      setActiveIndex(next)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) setOpen(true)
      else if (activeIndex >= 0) commit(options[activeIndex])
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-sm border border-primary-300 px-4 text-start transition-colors',
          compact ? 'h-[42px]' : 'h-[50px]',
          highlighted ? 'bg-primary-25' : 'bg-surface-tab-bar',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary-500',
        ].join(' ')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.icon ? <img src={selected.icon} alt="" className="size-5 shrink-0" /> : null}
          <span
            className={[
              'min-w-0 flex-1 truncate text-sm font-medium',
              selected ? 'text-text-secondary' : 'text-text-placeholder',
            ].join(' ')}
          >
            {selected?.shortLabel ?? selected?.label ?? placeholder}
          </span>
        </span>
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className={[
            'size-6 shrink-0 transition-transform',
            open ? '-rotate-90' : 'rotate-90',
          ].join(' ')}
        />
      </button>

      <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)}>
        <ul role="listbox" className="max-h-[240px] overflow-y-auto py-1">
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(option)}
                  className={[
                    'flex w-full items-start gap-2.5 px-4 py-2.5 text-start transition-colors',
                    option.disabled ? 'cursor-not-allowed opacity-50' : '',
                    index === activeIndex || isSelected ? 'bg-primary-25' : '',
                  ].join(' ')}
                >
                  {option.icon ? (
                    <img src={option.icon} alt="" className="mt-0.5 size-5 shrink-0" />
                  ) : null}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={[
                        'text-sm leading-[1.2]',
                        isSelected
                          ? 'font-semibold text-primary-800'
                          : 'font-medium text-text-secondary',
                      ].join(' ')}
                    >
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="text-xs font-medium leading-[1.2] text-text-quaternary">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {footer ? <div className="border-t border-border-subtle">{footer}</div> : null}
      </Popover>
    </>
  )
}
