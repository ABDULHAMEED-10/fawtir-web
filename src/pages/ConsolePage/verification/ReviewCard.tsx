import type { ReactNode } from 'react'

/** The Operations screen's panel: a card with a heading and a column of lines. */
export function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex w-full flex-col rounded-md bg-surface-card p-5">
      <h2 className="text-base font-medium leading-[1.2] text-text-primary">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** The Operations screen's label/value line, allowed to wrap for values such as an address. */
export function ReviewLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="shrink-0 text-sm font-medium text-text-tertiary">{label}</span>
      <span className="min-w-0 break-words text-end text-sm font-semibold text-text-primary">{value}</span>
    </div>
  )
}
