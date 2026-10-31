import { useRef, useState } from 'react'
import { Popover } from './Popover'
import chevronIcon from '../../assets/invoices/chevron.svg'
import funnelIcon from '../../assets/bills/filter.svg'

export type FilterMenuOption<T extends string> = {
  value: T
  label: string
  /** Rows this option would leave on screen — Figma's toolbar shows none, so it is optional. */
  count?: number | string
}

/**
 * Toolbar filter pill with a portalled menu.
 *
 * The list toolbars all use the same 44px pill, so it lives here rather than in one page. At
 * rest it shows the designed label ("Doc Type", "Channel"); once a narrowing choice is made it
 * shows that choice and picks up the brand border, which is the only signal the toolbar has
 * that a filter is on. `defaultValue` is the option that means "no filter".
 */
export function FilterMenu<T extends string>({
  label,
  value,
  defaultValue,
  options,
  onChange,
  width = 220,
  icon,
  funnel,
}: {
  label: string
  value: T
  defaultValue: T
  options: FilterMenuOption<T>[]
  onChange: (value: T) => void
  width?: number
  /** Leading glyph on the trigger. */
  icon?: string
  /**
   * The toolbar button as the Catalog and Stock frames draw it: a funnel and no chevron, the
   * same shape as the Sort button beside it.
   */
  funnel?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const active = value !== defaultValue
  const selected = options.find((option) => option.value === value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border px-4 text-sm transition-colors',
          funnel ? 'h-[46px] font-medium' : 'h-11 font-semibold',
          active
            ? 'border-primary-700 bg-primary-25 text-primary-800'
            : funnel
              ? 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25'
              : 'border-border-subtle bg-surface-tab-bar text-text-tertiary hover:border-primary-300',
        ].join(' ')}
      >
        {funnel ? (
          <img src={funnelIcon} alt="" aria-hidden="true" className="size-5 shrink-0" />
        ) : icon ? (
          <img src={icon} alt="" aria-hidden="true" className="size-5 shrink-0" />
        ) : null}
        {active ? (selected?.label ?? label) : label}
        {funnel ? null : (
          <img
            src={chevronIcon}
            alt=""
            aria-hidden="true"
            className={[
              'size-5 opacity-70 transition-transform',
              open ? '-rotate-90' : 'rotate-90',
            ].join(' ')}
          />
        )}
      </button>

      <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={width}>
        <ul role="listbox" className="py-1">
          {options.map((option) => {
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
                    'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-25',
                    isSelected
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-secondary',
                  ].join(' ')}
                >
                  <span className="truncate">{option.label}</span>
                  {option.count !== undefined ? (
                    <span className="shrink-0 text-xs font-medium text-text-quaternary">
                      {option.count}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </Popover>
    </>
  )
}
