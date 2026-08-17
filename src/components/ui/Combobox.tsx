import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Popover } from './Popover'
import type { SelectOption } from './Select'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import searchIcon from '../../assets/order-forms-v2/search.svg'

/**
 * Searchable dropdown — a `Select` with a filter box.
 *
 * For lists long enough that scanning is slower than typing: customers, suppliers, products.
 * Matches label *and* hint, so a customer can be found by VAT number as well as by name.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  emptyText,
  footer,
  renderTrigger,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  ariaLabel?: string
  emptyText?: string
  footer?: ReactNode
  /** Lets a caller keep a richer trigger (logo, badges) and reuse only the popup behaviour. */
  renderTrigger?: (state: { open: boolean; selected?: SelectOption }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.hint ?? '').toLowerCase().includes(needle),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const id = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          renderTrigger
            ? 'w-full text-start'
            : 'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-start transition-colors hover:border-primary-500'
        }
      >
        {renderTrigger ? (
          renderTrigger({ open, selected })
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {selected?.icon ? (
                <img src={selected.icon} alt="" className="size-5 shrink-0" />
              ) : null}
              <span
                className={[
                  'min-w-0 flex-1 truncate text-sm font-medium',
                  selected ? 'text-text-secondary' : 'text-text-placeholder',
                ].join(' ')}
              >
                {selected?.label ?? placeholder}
              </span>
            </span>
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className={['size-6 shrink-0', open ? '-rotate-90' : 'rotate-90'].join(' ')}
            />
          </>
        )}
      </button>

      <Popover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        width={renderTrigger ? 340 : undefined}
        align={renderTrigger ? 'end' : 'start'}
      >
        <label className="flex h-11 items-center gap-2 border-b border-border-subtle px-3">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <ul role="listbox" className="max-h-[220px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm font-medium text-text-quaternary">{emptyText}</li>
          ) : (
            filtered.map((option) => {
              const isSelected = option.value === value
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={[
                      'flex w-full items-start gap-2.5 px-4 py-2.5 text-start transition-colors hover:bg-primary-25',
                      isSelected ? 'bg-primary-25' : '',
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
            })
          )}
        </ul>
        {footer ? <div className="border-t border-border-subtle">{footer}</div> : null}
      </Popover>
    </>
  )
}
