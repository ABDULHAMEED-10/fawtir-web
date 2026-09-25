import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import chevronIcon from '../../assets/invoices/chevron.svg'
import expandIcon from '../../assets/invoice-details/fullscreen.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import upIcon from '../../assets/reports/trend-up.svg'
import downIcon from '../../assets/reports/trend-down.svg'

/**
 * The frame every Reports screen sits in (Figma 112:8367 and siblings).
 *
 * All six share a breadcrumb and then either a row of figures or a grid of chart cards, so the
 * chrome lives here and each page supplies only what makes it different.
 *
 * The period pill and the "Export as PDF" button this frame used to carry are gone. The pill set
 * local state and drove no request, and the button had no handler and no endpoint behind it —
 * two controls that looked live and did nothing. The range, the bucket and the real CSV/Excel
 * exports belong to the report being shown, so they are `ReportControls` on the pages that have
 * an endpoint to honour them rather than chrome on every page whether or not it does.
 */

export function ReportShell({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: string
  subtitleKey: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[760px]">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/reports/income"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
              >
                {t('reports.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
              <h1 className="text-2xl font-medium leading-[1.2] text-text-primary">
                {t(titleKey)}
              </h1>
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t(subtitleKey)}
            </p>
          </div>

        </div>

        {children}
      </div>
    </AppShell>
  )
}

/* ---------------------------------------------------------------- figures */

/** One of the four figures across the top of a report. */
export function KpiCard({
  label,
  value,
  /** Shows the OMR glyph before the figure, as the money cards do. */
  currency,
  change,
  note,
}: {
  label: string
  value: string
  currency?: boolean
  /** The tinted pill: a direction and an amount, or a plain word like "Steady". */
  change?: { text: string; direction: 'up' | 'down' | 'flat' }
  note: ReactNode
}) {
  const tone =
    change?.direction === 'down'
      ? 'bg-warning-100 text-warning-700'
      : change?.direction === 'flat'
        ? 'bg-surface-background text-text-quaternary'
        : 'bg-success-100 text-success-700'

  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</h3>
      <p className="mt-2 flex items-center gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
        {currency ? <img src={omrRowIcon} alt="" className="h-auto w-[22px] shrink-0" /> : null}
        {value}
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-2">
        {change ? (
          <span
            className={[
              'inline-flex h-[22px] items-center gap-1 rounded-sm px-1.5 text-xs font-semibold',
              tone,
            ].join(' ')}
          >
            {change.direction === 'flat' ? null : (
              <img src={change.direction === 'up' ? upIcon : downIcon} alt="" className="size-3" />
            )}
            {change.text}
          </span>
        ) : null}
        <span className="text-xs font-medium leading-[1.3] text-text-quaternary">{note}</span>
      </p>
    </article>
  )
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>
}

/* ----------------------------------------------------------- chart cards */

/**
 * A titled chart with its legend and closing remark.
 *
 * The footer is one row in the design: the series keys on the left, a single sentence about
 * what the chart shows on the right.
 */
export function ChartCard({
  title,
  legend,
  note,
  children,
}: {
  title: string
  legend: { label: string; color: string }[]
  note: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col rounded-md bg-surface-card">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="text-[13px] font-semibold uppercase leading-[1.2] tracking-[0.8px] text-primary-700">
          {title}
        </h2>
        <button
          type="button"
          aria-label={t('reports.expand')}
          className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
        >
          <img src={expandIcon} alt="" className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 items-center px-5 pb-4">{children}</div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-3.5">
        <ul className="flex flex-wrap items-center gap-4">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: entry.color }} />
              <span className="text-xs font-medium text-text-secondary">{entry.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs font-medium text-text-quaternary">{note}</p>
      </div>
    </section>
  )
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>
}

/**
 * Prints an OMR figure inside a footer sentence, glyph and all.
 *
 * Children are optional because `Trans` clones this with the interpolated figure as its
 * children; written in JSX it is handed them directly.
 */
export function OmrNote({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img src={omrRowIcon} alt="" className="h-auto w-3.5 shrink-0" />
      <span className="font-semibold text-text-secondary tabular-nums">{children}</span>
    </span>
  )
}
