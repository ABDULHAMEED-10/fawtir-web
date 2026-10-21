import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ITEM_TABS, USED_TOTAL, CHANGE_BOOK } from '../../lib/catalogItem'

/** How many each tab would show, where a tab carries a count in the design. */
const COUNTS: Record<string, number | undefined> = {
  details: undefined,
  sells: undefined,
  used: USED_TOTAL,
  changes: CHANGE_BOOK.total,
}

/** The four faces of one item (Figma 135:45974 and siblings). */
export function ItemTabs({ id, active }: { id: string; active: string }) {
  const { t } = useTranslation()

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-border-subtle">
      {ITEM_TABS.map((tab) => {
        const on = tab.id === active
        const count = COUNTS[tab.id]
        return (
          <Link
            key={tab.id}
            to={`/catalog/${id}${tab.to}`}
            aria-current={on ? 'page' : undefined}
            className={[
              'inline-flex h-[44px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              on
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(tab.labelKey)}
            {count !== undefined ? (
              <span
                className={[
                  // A small grey chip on the page's grey ground; light blue on the open tab.
                  'inline-flex h-[20px] min-w-[22px] items-center justify-center rounded-[4px] px-1.5 text-[11px] font-medium tabular-nums',
                  on ? 'bg-primary-50 text-primary-800' : 'bg-border-subtle text-text-tertiary',
                ].join(' ')}
              >
                {count}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
