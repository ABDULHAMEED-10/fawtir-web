import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import { NOW } from '../../../lib/erpConnector'
import { shortDate } from '../../../lib/settings'
import tickIcon from '../../../assets/settings/check-green.svg'
import infoIcon from '../../../assets/settings/info.svg'

/**
 * The small pieces the Runs and Records tabs share (docs/erp-and-console-plan.md §3, Appendix B):
 * clock helpers that keep Latin digits in both languages, the filter chips, the notice strip a
 * store answer lands in, the figure tile and the definition list a detail screen is made of.
 */

export const PAGE_SIZE = 10

/* ------------------------------------------------------------------ clock */

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

export const timeOf = (d: Date) => TIME.format(d)

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/** "14:00" when it happened today (the story's today), otherwise "24 Sep 2026 · 16:00". */
export const whenOf = (d: Date, today: Date = NOW) =>
  sameDay(d, today) ? timeOf(d) : `${shortDate(d)} · ${timeOf(d)}`

/** "12 s" under a minute, "2 min" from there; a run still going has no duration. */
export function durationLabel(t: TFunction, startedAt: Date, finishedAt?: Date) {
  if (!finishedAt) return t('erp.connector.runs.duration.running')
  const seconds = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000))
  if (seconds < 60) return t('erp.connector.runs.duration.seconds', { count: seconds })
  return t('erp.connector.runs.duration.minutes', { count: Math.round(seconds / 60) })
}

export const pagerLabels = (t: TFunction) => ({
  nav: t('appList.pager.label'),
  previous: t('appList.pager.previous'),
  next: t('appList.pager.next'),
})

/* ------------------------------------------------------------------ pieces */

/** The way back up one level — to the runs or records list. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
    >
      <span aria-hidden="true" className="rtl:rotate-180">
        ‹
      </span>
      {children}
    </Link>
  )
}

export type StripTone = 'success' | 'pending' | 'danger'

const STRIP_TONE: Record<StripTone, string> = {
  success: 'bg-success-100 text-[#3d5648]',
  pending: 'bg-pending-100 text-pending-700',
  danger: 'bg-danger-100 text-danger-700',
}

/** One line the store answered with — a success, a refusal — and, when useful, the way onward. */
export function Strip({
  tone,
  children,
  link,
  className = '',
}: {
  tone: StripTone
  children: ReactNode
  link?: { to: string; label: string }
  className?: string
}) {
  return (
    <p
      role="status"
      className={[
        'flex items-start gap-2 rounded-sm px-3 py-2.5 text-sm font-medium leading-[1.6]',
        STRIP_TONE[tone],
        className,
      ].join(' ')}
    >
      <img
        src={tone === 'success' ? tickIcon : infoIcon}
        alt=""
        className="mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 flex-1">
        {children}
        {link ? (
          <>
            {' '}
            <Link to={link.to} className="font-semibold underline underline-offset-2">
              {link.label}
            </Link>
          </>
        ) : null}
      </span>
    </p>
  )
}

/** A row of chips, one lit, each carrying how many rows it would leave on screen. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; count: number }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={[
              'inline-flex h-[34px] items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary-700 text-white'
                : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
            ].join(' ')}
          >
            {option.label}
            <span
              className={[
                'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                active ? 'bg-white/20 text-white' : 'bg-surface-background text-text-tertiary',
              ].join(' ')}
            >
              {option.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A figure with its name under it — the four counts a run is measured by. */
export function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'danger' | 'success'
}) {
  return (
    <div className="rounded-sm bg-surface-background/60 px-4 py-3">
      <p
        className={[
          'text-[24px] font-semibold leading-[1.2] tabular-nums',
          tone === 'danger'
            ? 'text-danger-700'
            : tone === 'success'
              ? 'text-[#3d5648]'
              : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-text-quaternary">{label}</p>
    </div>
  )
}

/** Name over value, several to a row — the header of a run or a record. */
export function Definitions({
  items,
  columns = 3,
  className = '',
}: {
  items: { label: string; value: ReactNode }[]
  columns?: 2 | 3 | 4
  className?: string
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }
  return (
    <dl className={['grid gap-x-6 gap-y-4', cols[columns], className].join(' ')}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A stale or wrong id in the route: say so inside the tab, and offer the list. */
export function NotHere({
  title,
  body,
  back,
}: {
  title: string
  body: string
  back: { to: string; label: string }
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
      <p className="mt-1 text-sm font-medium leading-[1.6] text-text-tertiary">{body}</p>
      <div className="mt-4">
        <BackLink to={back.to}>{back.label}</BackLink>
      </div>
    </section>
  )
}
