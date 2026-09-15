import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../../components/ui'

/**
 * The Settings idiom, named once: the two button shapes every Settings screen draws by hand, the
 * section card, and the table head and cells (PeppolTaxPage, PlanPage and BillingPage draw
 * exactly these). The ERP screens borrow them so they read as drawn by the same hand.
 */

export const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200'
export const SECONDARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:text-text-quaternary'
export const SMALL_BUTTON =
  'inline-flex h-[38px] shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:text-text-quaternary'
export const TEXT_BUTTON =
  'text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800 disabled:cursor-not-allowed disabled:text-text-quaternary'
export const DANGER_TEXT_BUTTON =
  'text-sm font-semibold text-danger-700 transition-colors hover:text-[#7a1009]'

/** A section card: heading and note at the top, the body flush against a hairline. */
export function SectionCard({
  title,
  note,
  actions,
  children,
  className = '',
}: {
  title: string
  note?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={['overflow-hidden rounded-md bg-surface-card', className].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
          {note ? (
            <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">{note}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export const THEAD_ROW =
  'border-y border-surface-background text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary'
export const TBODY_ROW = 'border-b border-surface-background last:border-0'

export function Th({
  children,
  first = false,
  align = 'start',
}: {
  children?: ReactNode
  first?: boolean
  align?: 'start' | 'end'
}) {
  return (
    <th
      className={[
        'h-[40px] font-semibold',
        first ? 'px-5' : 'px-4',
        align === 'end' ? 'text-end' : 'text-start',
      ].join(' ')}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  first = false,
  align = 'start',
  className = '',
}: {
  children?: ReactNode
  first?: boolean
  align?: 'start' | 'end'
  className?: string
}) {
  return (
    <td
      className={[
        'py-4 align-top',
        first ? 'px-5' : 'px-4',
        align === 'end' ? 'text-end' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  )
}

/** A message row that spans the table — nothing here yet. */
export function EmptyRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <tr>
      <td
        colSpan={columns}
        className="px-5 py-8 text-center text-sm font-medium text-text-quaternary"
      >
        {children}
      </td>
    </tr>
  )
}

/** A hash or a key, always left-to-right, in the mono the identifiers use. */
export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={['font-mono text-[11px] font-semibold', className].join(' ')}>
      {children}
    </span>
  )
}

/** Yes-or-no before something is thrown away or replaced. */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={480}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="md"
            onClick={onConfirm}
            className={danger ? 'bg-danger-700 hover:bg-[#7a1009] active:bg-[#7a1009]' : ''}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm font-medium leading-[1.6] text-text-tertiary">{body}</div>
    </Modal>
  )
}

/** A call to action that navigates, in the Settings button shape. */
export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={PRIMARY_BUTTON}>
      {children}
    </Link>
  )
}

export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={SECONDARY_BUTTON}>
      {children}
    </Link>
  )
}
