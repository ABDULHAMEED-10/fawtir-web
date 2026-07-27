import type { ReactNode } from 'react'
import chevron from '../../assets/dashboard/chevron.svg'

type DashboardCardProps = {
  title: string
  children: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
}

export function DashboardCard({
  title,
  children,
  action,
  className = '',
  bodyClassName = '',
}: DashboardCardProps) {
  return (
    <section
      className={[
        'overflow-hidden rounded-md border border-black/[0.06] bg-surface-card',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle px-4">
        <h2 className="text-base font-semibold leading-[1.2] text-text-primary">{title}</h2>
        {action}
      </div>
      <div className={['p-4', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </section>
  )
}

export function PeriodSelect({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-11 items-center gap-2 rounded-sm border border-black/10 bg-surface-card px-4 text-sm font-medium text-text-secondary"
    >
      {label}
      <img src={chevron} alt="" className="size-5 rotate-90 opacity-60" />
    </button>
  )
}
