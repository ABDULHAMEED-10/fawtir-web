import type { ReactNode } from 'react'

/** The bill page's buttons and card, shared with the duplicate check. */
export const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'
export const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
export const QUIET_BUTTON =
  'inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'

export function Card({
  title,
  action,
  children,
  className = '',
  id,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={['rounded-md bg-surface-card p-5 shadow-card', className].join(' ')}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}
