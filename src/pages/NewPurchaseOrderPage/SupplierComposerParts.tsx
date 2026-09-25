import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RialMark, withRial } from '../../components/ui'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * The pieces the three supplier composers share (New purchase order 163:27317, Record a bill
 * 163:27781, and the purchase order's own page, which has no frame and follows the composer):
 * the breadcrumb header, the supplier strip under it, and the side column's cards.
 */

export type Crumb = { label: string; to?: string }

export function ComposerHeader({
  crumbs,
  title,
  subtitle,
  actions,
}: {
  crumbs: Crumb[]
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? (
                <img
                  src={chevronIcon}
                  alt=""
                  aria-hidden="true"
                  className="size-5 rtl:rotate-180"
                />
              ) : null}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-2xl font-medium leading-[1.2] text-text-primary">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-1 text-[32px] font-medium leading-[1.2] text-text-primary">{title}</h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{subtitle}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export type StripFact = { label: string; value: ReactNode; tone?: 'brand' }

/** The supplier's card under the header: who they are, and the three facts the order rests on. */
export function SupplierStrip({
  initials,
  name,
  note,
  facts,
}: {
  initials: string
  name: string
  note: ReactNode
  facts: StripFact[]
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-6 rounded-md border border-primary-300 bg-primary-25 p-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-[1.2] text-text-primary">{name}</p>
          <p className="mt-1 text-sm font-medium leading-[1.3] text-text-tertiary">{note}</p>
        </div>
      </div>
      <dl className="flex flex-wrap items-center gap-8">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
              {fact.label}
            </dt>
            <dd
              className={[
                'mt-1 text-sm font-semibold',
                fact.tone === 'brand' ? 'text-primary-700' : 'text-text-primary',
              ].join(' ')}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h2 className="text-base font-semibold leading-[1.2] text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export function SideRow({
  label,
  value,
  currency,
  tone,
  last,
}: {
  label: string
  value: ReactNode
  currency?: boolean
  tone?: 'up' | 'warn'
  last?: boolean
}) {
  const colour =
    tone === 'up' ? 'text-[#3d5648]' : tone === 'warn' ? 'text-pending-700' : 'text-text-primary'
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums',
          colour,
        ].join(' ')}
      >
        {currency ? (
          <RialMark className={['w-4 shrink-0', tone ? colour : 'text-text-secondary'].join(' ')} />
        ) : null}
        <span>{typeof value === 'string' ? withRial(value) : value}</span>
      </dd>
    </div>
  )
}

export type Step = { title: string; note: ReactNode; state?: 'done' | 'current' | 'todo' }

/** "What happens after this": the numbered steps, the first one lit as the design draws it. */
export function StepsCard({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <SideCard title={title}>
      <ol className="mt-3 flex flex-col gap-4">
        {steps.map((step, index) => {
          const state = step.state ?? (index === 0 ? 'current' : 'todo')
          return (
            <li key={`${step.title}-${index}`} className="flex items-start gap-3">
              <span
                className={[
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  state === 'current'
                    ? 'bg-primary-700 text-white'
                    : state === 'done'
                      ? 'bg-success-100 text-success-700'
                      : 'bg-surface-background text-text-quaternary',
                ].join(' ')}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                  {step.note}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </SideCard>
  )
}

/** "In plain words": the whole document as one sentence, in the brand-tinted box. */
export function PlainWords({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="rounded-sm bg-primary-25 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-primary-700">
          {label}
        </p>
        <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-secondary">{children}</p>
      </div>
    </section>
  )
}

export const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50'
export const SECONDARY_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50'
export const FIELD_SHELL =
  'h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder'
