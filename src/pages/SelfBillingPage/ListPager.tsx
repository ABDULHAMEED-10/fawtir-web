import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCount } from '../../lib/format'
import chevronIcon from '../../assets/invoices/chevron.svg'

export const LIST_PAGE_SIZES = [6, 10, 25, 50] as const

/**
 * The footer the self-billing frames draw under their tables (Figma 154:157643, 154:158069):
 * "Show result: 6" on the left and the page numbers on the right, with first, last and the
 * neighbours of the current page shown and the gaps elided.
 */
export function ListPager({
  size,
  onSize,
  page,
  pageCount,
  onPage,
  labels,
}: {
  size: number
  onSize: (size: number) => void
  page: number
  pageCount: number
  onPage: (page: number) => void
  labels: { showResult: string; previous: string; next: string; nav: string }
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-text-muted">{labels.showResult}</span>
        <PageSizeMenu value={size} onChange={onSize} label={labels.showResult} />
      </div>
      {pageCount > 1 ? (
        <PageNumbers current={page} pageCount={pageCount} onChange={onPage} labels={labels} />
      ) : null}
    </div>
  )
}

/** The design's "Show result" number box, a listbox rather than a native select. */
function PageSizeMenu({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-9 w-[55px] items-center justify-between rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
      >
        {formatCount(value, i18n.language)}
        <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute bottom-full start-0 z-20 mb-1 w-24 rounded-sm border border-border-subtle bg-white py-1 shadow-lg"
        >
          {LIST_PAGE_SIZES.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={[
                  'w-full px-3 py-2 text-start text-sm transition-colors hover:bg-primary-25',
                  option === value
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-secondary',
                ].join(' ')}
              >
                {formatCount(option, i18n.language)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function PageNumbers({
  current,
  pageCount,
  onChange,
  labels,
}: {
  current: number
  pageCount: number
  onChange: (page: number) => void
  labels: { previous: string; next: string; nav: string }
}) {
  const { i18n } = useTranslation()
  const numbers = useMemo<(number | string)[]>(() => {
    if (pageCount <= 6) return Array.from({ length: pageCount }, (_, i) => i + 1)
    const near = [current - 1, current, current + 1].filter((n) => n > 1 && n < pageCount)
    return [
      1,
      ...(near[0] > 2 ? ['…'] : []),
      ...near,
      ...(near.at(-1)! < pageCount - 1 ? ['…'] : []),
      pageCount,
    ]
  }, [pageCount, current])

  return (
    <nav aria-label={labels.nav} className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={labels.previous}
      >
        <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
      </button>
      {numbers.map((n, index) =>
        typeof n === 'string' ? (
          <span
            key={`gap-${index}`}
            className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === current ? 'page' : undefined}
            className={[
              'inline-flex size-10 items-center justify-center rounded-xl text-center transition-colors',
              n === current
                ? 'bg-primary-25 text-base font-extrabold text-primary-700'
                : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
            ].join(' ')}
          >
            {formatCount(n, i18n.language)}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, current + 1))}
        disabled={current >= pageCount}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={labels.next}
      >
        <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
      </button>
    </nav>
  )
}
