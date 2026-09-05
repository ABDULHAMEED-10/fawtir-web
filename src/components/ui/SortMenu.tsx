import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from './Popover'
import sortIcon from '../../assets/invoices/sort.svg'

export type SortOption<T extends string> = { value: T; labelKey: string }

/**
 * The toolbar's "Sort" pill and its menu.
 *
 * Every list toolbar in the app draws the same 46px pill with the same popover of choices; this
 * is that pattern in one place so a change to it lands everywhere rather than in whichever page
 * was edited last.
 */
export function SortMenu<T extends string>({
  value,
  options,
  onChange,
  label,
  width = 200,
}: {
  value: T
  options: SortOption<T>[]
  onChange: (value: T) => void
  /** Trigger text — "Sort" on every screen so far, but a list may want its own. */
  label?: string
  width?: number
}) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
      >
        <img src={sortIcon} alt="" className="size-5" />
        {label ?? t('common.sort')}
      </button>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)}>
        <ul className="py-1.5" style={{ width }} role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={[
                  'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                  option.value === value ? 'text-primary-700' : 'text-text-secondary',
                ].join(' ')}
              >
                {t(option.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}
