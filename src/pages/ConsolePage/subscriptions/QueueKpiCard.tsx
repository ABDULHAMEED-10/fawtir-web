import type { ReactNode } from 'react'
import { withRial } from '../../../components/ui'

/**
 * The KPI card the Subscriptions screens draw — the Tenants card (rial sign in value and note)
 * with the Operations card's small suffix after the figure ("3 of 7").
 */
export function QueueKpiCard({
  icon,
  title,
  value,
  suffix,
  note,
  tone = 'calm',
}: {
  icon: ReactNode
  title: string
  value: string
  suffix?: string
  note: string
  tone?: 'bad' | 'watch' | 'calm'
}) {
  const valueTone =
    tone === 'bad' ? 'text-danger-700' : tone === 'watch' ? 'text-pending-700' : 'text-text-primary'
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2.5 rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
          {icon}
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      <p className={`text-[32px] font-semibold leading-[1.2] ${valueTone}`}>
        {withRial(value)}
        {suffix ? (
          <span className="ms-1.5 text-base font-medium text-text-quaternary">{suffix}</span>
        ) : null}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{withRial(note)}</p>
    </article>
  )
}
