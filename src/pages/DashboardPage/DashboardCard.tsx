import type { ReactNode } from 'react'

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
