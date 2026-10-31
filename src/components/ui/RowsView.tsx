import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRowsView, type RowsMode } from '../../hooks/useRowsView'
import { CardsIcon, TableIcon } from './icons'

/**
 * A list that reads as cards on a phone and as a table everywhere else.
 *
 * Wraps the `<table>` a screen already has — the markup is not rewritten. The styling in
 * `tokens.css` re-lays the same elements as cards, and the effect below copies each column
 * heading onto its cells so a card can name its own values. A column can therefore never be
 * described one way in the table and another in the card, and a new column needs no card work.
 *
 * Everything is self-contained on purpose: a screen opts in by changing the wrapper it already
 * had, which is the one thing all ~30 list screens have in common. Their toolbars do not agree
 * on anything else.
 */
export function RowsView({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  const view = useRowsView()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const table = ref.current?.querySelector('table')
    if (!table) return

    const headings = Array.from(table.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? '',
    )

    for (const row of table.querySelectorAll('tbody tr')) {
      Array.from(row.children).forEach((cell, index) => {
        // A cell spanning the table is a message, not a value, so it is left unlabelled.
        const spans = (cell as HTMLTableCellElement).colSpan > 1
        cell.setAttribute('data-label', spans ? '' : (headings[index] ?? ''))
        cell.toggleAttribute('data-message', spans)
      })
    }
  })

  const button = (mode: RowsMode, Icon: typeof CardsIcon, label: string) => {
    const active = view.mode === mode
    return (
      <button
        type="button"
        onClick={() => view.setMode(mode)}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={[
          'inline-flex size-9 items-center justify-center rounded-sm transition-colors',
          active
            ? 'bg-surface-card text-primary-800 shadow-sm'
            : 'text-text-quaternary hover:text-text-secondary',
        ].join(' ')}
      >
        <Icon size={18} />
      </button>
    )
  }

  return (
    <>
      <div className={['mb-2 hidden justify-end max-md:flex', className].join(' ')}>
        <div
          role="group"
          aria-label={t('rowsView.label')}
          className="inline-flex rounded-sm bg-surface-background p-1"
        >
          {button('cards', CardsIcon, t('rowsView.cards'))}
          {button('table', TableIcon, t('rowsView.table'))}
        </div>
      </div>

      <div
        ref={ref}
        className={[view.mode === 'cards' ? 'rows-cards' : '', 'overflow-x-auto', className].join(
          ' ',
        )}
      >
        {children}
      </div>
    </>
  )
}
