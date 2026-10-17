import type { ReactNode } from 'react'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'

/** The invitation form's cards, ready list and "what happens next" rows (Figma 135:38912). */
export function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string
  note: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{note}</p>
        </div>
        {action}
      </div>
      <div className="p-5 pt-0">{children}</div>
    </section>
  )
}

export function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <img src={done ? tickIcon : circleIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      <span
        className={[
          'text-sm font-medium leading-[1.4]',
          done ? 'text-text-secondary' : 'text-text-quaternary',
        ].join(' ')}
      >
        {label}
      </span>
    </li>
  )
}

export function Row({
  label,
  value,
  muted,
  last,
}: {
  label: string
  value: string
  muted?: boolean
  last?: boolean
}) {
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
          'shrink-0 text-sm',
          muted ? 'font-medium text-text-quaternary' : 'font-semibold text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
