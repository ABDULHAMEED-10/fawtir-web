import { useTranslation } from 'react-i18next'
import chevronIcon from '../../assets/invoices/chevron.svg'

type PagerProps = {
  /** One-based, as the reader counts. */
  page: number
  pageCount: number
  onChange: (page: number) => void
  /** Accessible names, already translated: the design's pager has no visible words. */
  labels: { nav: string; previous: string; next: string }
  /**
   * Draws the pages but offers none of them: for a sample list whose other pages the server has
   * not got yet. The current page stays marked; every button is off.
   */
  disabled?: boolean
}

/**
 * Numbered pages with previous and next, as the catalogue's pager draws them: first, last, and a
 * window around the current page. For lists the server pages — it only reports which page was
 * chosen; fetching it is the caller's.
 */
export function Pager({ page, pageCount, onChange, labels, disabled = false }: PagerProps) {
  const { i18n } = useTranslation()
  const pages = [...new Set([1, 2, 3, page, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b)
  const number = new Intl.NumberFormat(i18n.language.startsWith('ar') ? 'ar' : 'en-GB')

  return (
    <nav aria-label={labels.nav} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label={labels.previous}
        className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors enabled:hover:bg-primary-25 disabled:opacity-40"
      >
        <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
      </button>
      {pages.map((n, index) => (
        <span key={n} className="flex items-center gap-1">
          {index > 0 && n - pages[index - 1] > 1 ? (
            <span className="px-1 text-sm text-text-quaternary">…</span>
          ) : null}
          <button
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled && n !== page}
            aria-current={n === page ? 'page' : undefined}
            className={[
              'inline-flex size-9 items-center justify-center rounded-sm text-sm font-semibold transition-colors disabled:opacity-40',
              n === page
                ? 'bg-primary-700 text-white'
                : 'border border-border-subtle bg-white text-text-secondary enabled:hover:bg-primary-25',
            ].join(' ')}
          >
            {number.format(n)}
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= pageCount}
        aria-label={labels.next}
        className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors enabled:hover:bg-primary-25 disabled:opacity-40"
      >
        <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
      </button>
    </nav>
  )
}
