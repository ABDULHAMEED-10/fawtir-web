import type { ReactNode } from 'react'
import { Rial, withRial } from '../../../components/ui'
import { omr } from '../../../lib/superAdmin'
import { ConsoleKpi } from '../../../layouts/ConsoleShell/consoleStyle'
import { type ConsoleTone } from '../../../layouts/ConsoleShell/consoleTones'

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
  tint,
}: {
  icon: ReactNode
  title: string
  /** A count as text, or a money figure built with `RialFigure`. */
  value: ReactNode
  suffix?: string
  note: string
  tone?: ConsoleTone
  tint?: ConsoleTone
}) {
  return (
    <ConsoleKpi
      icon={icon}
      title={title}
      value={withRial(value)}
      suffix={suffix}
      note={withRial(note)}
      tone={tone}
      tint={tint}
    />
  )
}

/** A KPI money figure: the rial sign and the amount at three decimals, kept on one line. */
export function RialFigure({ amount }: { amount: number }) {
  return (
    <span className="whitespace-nowrap">
      <Rial />
      {'\u00A0'}
      {omr(amount)}
    </span>
  )
}
