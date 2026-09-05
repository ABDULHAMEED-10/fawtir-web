import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import chevronIcon from '../../assets/invoices/chevron.svg'

export type Crumb = { labelKey?: string; label?: string; to?: string }

/**
 * The frame the Catalog screens share — a breadcrumb back to the list, a title with its state
 * pills, and the row of actions (Figma 135:44255 and its siblings).
 */
export function CatalogShell({
  crumbs,
  title,
  subtitle,
  pills,
  actions,
  tabs,
  children,
}: {
  crumbs: Crumb[]
  title: string
  subtitle?: string
  /** State beside the title — on sale, sold n times, saves n. */
  pills?: ReactNode
  actions?: ReactNode
  /** The four tabs an item carries; absent on the list screens. */
  tabs?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {crumbs.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-2">
            {crumbs.map((crumb, index) => {
              const label = crumb.labelKey ? t(crumb.labelKey) : (crumb.label ?? '')
              const last = index === crumbs.length - 1
              return (
                <span key={label + index} className="flex items-center gap-2">
                  {crumb.to && !last ? (
                    <Link
                      to={crumb.to}
                      className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-primary-700"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span
                      className={[
                        'text-2xl font-medium leading-[1.2]',
                        last ? 'text-text-primary' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {label}
                    </span>
                  )}
                  {last ? null : (
                    <img
                      src={chevronIcon}
                      alt=""
                      aria-hidden="true"
                      className="size-5 rtl:rotate-180"
                    />
                  )}
                </span>
              )
            })}
          </nav>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[760px]">
            <h1 className="flex flex-wrap items-center gap-2.5">
              <span className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {title}
              </span>
              {pills}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">{actions}</div>
          ) : null}
        </div>

        {tabs}
        {children}
      </div>
    </AppShell>
  )
}

/** A state pill — on sale, sold n times, needs a part. */
export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'success' | 'brand' | 'neutral' | 'pending' | 'danger'
  children: ReactNode
}) {
  const tones = {
    success: 'bg-success-100 text-[#3d5648]',
    brand: 'bg-primary-50 text-primary-800',
    neutral: 'bg-surface-background text-text-tertiary',
    pending: 'bg-pending-100 text-pending-700',
    danger: 'bg-danger-100 text-danger-700',
  }
  const dots = {
    success: 'bg-[#4c6c5a]',
    brand: 'bg-primary-700',
    neutral: 'bg-[#a8abb2]',
    pending: 'bg-pending-500',
    danger: 'bg-danger-700',
  }
  return (
    <span
      className={[
        'inline-flex h-[26px] items-center gap-1.5 rounded-[3px] px-2.5 text-xs font-medium',
        tones[tone],
      ].join(' ')}
    >
      <span className={['size-1.5 rounded-full', dots[tone]].join(' ')} />
      {children}
    </span>
  )
}

/** A figure card, the shape every Catalog screen opens with. */
export function Kpi({
  icon,
  tint = 'bg-primary-50',
  label,
  value,
  unit,
  note,
  tone,
  highlight,
}: {
  icon: string
  tint?: string
  label: string
  value: string
  unit?: string
  note: string
  tone?: 'pending' | 'danger'
  /** The card the design paints in sand because it is the one asking for something. */
  highlight?: boolean
}) {
  return (
    <article
      className={['rounded-md p-5', highlight ? 'bg-pending-100/70' : 'bg-surface-card'].join(' ')}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            highlight ? 'bg-pending-200/60' : tint,
          ].join(' ')}
        >
          <img src={icon} alt="" className="size-[18px]" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{label}</h3>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span
          className={[
            'text-[28px] font-semibold leading-[1.2] tabular-nums',
            tone === 'pending'
              ? 'text-pending-700'
              : tone === 'danger'
                ? 'text-danger-700'
                : 'text-text-primary',
          ].join(' ')}
        >
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

/** The tab strip the list screens carry, with a count on each. */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  count,
}: {
  tabs: readonly { id: T; labelKey: string }[]
  value: T
  onChange: (id: T) => void
  count: (id: T) => number
}) {
  const { t } = useTranslation()
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5 pt-4">
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={[
              'inline-flex h-[42px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(tab.labelKey)}
            <span
              className={[
                'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                active ? 'bg-primary-700 text-white' : 'bg-surface-background text-text-tertiary',
              ].join(' ')}
            >
              {count(tab.id)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
