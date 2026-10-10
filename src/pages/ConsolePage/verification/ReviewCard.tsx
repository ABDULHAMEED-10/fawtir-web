import type { ReactNode } from 'react'
import {
  CONSOLE_CARD,
  CONSOLE_TABLE_BODY,
  ConsoleCardHead,
} from '../../../layouts/ConsoleShell/consoleStyle'

/** The Operations screen's panel: a card with a heading and a column of lines. */
export function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`flex w-full flex-col ${CONSOLE_CARD}`}>
      <ConsoleCardHead title={title} />
      <div className={CONSOLE_TABLE_BODY}>{children}</div>
    </section>
  )
}

/** The Operations screen's label/value line, allowed to wrap for values such as an address. */
export function ReviewLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-[9px] text-[13.5px] last:border-b-0">
      <span className="shrink-0 font-medium text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-end font-semibold text-text-primary">{value}</span>
    </div>
  )
}
