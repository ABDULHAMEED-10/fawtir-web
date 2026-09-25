import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Rial, withRial } from '../ui'
import type { NoteActivity } from '../../lib/supplierCreditNotes'
import chevronIcon from '../../assets/invoices/chevron.svg'
import stepDoneIcon from '../../assets/supplier-credit-notes/step-done.svg'
import eyeIcon from '../../assets/supplier-debit-notes/eye-dark.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import warnIcon from '../../assets/supplier-debit-notes/check-warn.svg'
import billIcon from '../../assets/invoice-details/credit-note.svg'
import receiptIcon from '../../assets/create-invoice/doc-delivery.svg'
import fileIcon from '../../assets/bill-capture/file.svg'

/**
 * The pieces the supplier credit-note and debit-note screens share (Figma 163:19560 and
 * 163:20528 draw the same page in two tones): a signed amount with the rial sign, the three-tile
 * effect banner, the activity trail, the linked documents, and the side cards.
 *
 * `tone` is `credit` (green, a reduction) or `debit` (sand, an increase). Nothing here knows
 * which endpoint it came from.
 */

export type NoteTone = 'credit' | 'debit'

export const TONE = {
  credit: {
    banner: 'border-[#cfe0d5] bg-[#eef5f0]',
    tile: 'border-[#cfe0d5]',
    title: 'text-[#2f4438]',
    body: 'text-[#4f6857]',
    figure: 'text-[#3d5648]',
    op: '−',
    currentDot: 'bg-primary-50',
    decision: 'border-primary-300 bg-primary-25',
    decisionTitle: 'text-primary-700',
  },
  debit: {
    banner: 'border-pending-200 bg-pending-100',
    tile: 'border-pending-200',
    title: 'text-pending-700',
    body: 'text-pending-500',
    figure: 'text-pending-700',
    op: '+',
    currentDot: 'bg-pending-100',
    decision: 'border-pending-200 bg-pending-100',
    decisionTitle: 'text-pending-700',
  },
} as const

/** A figure with the rial sign before it, in the figure's own size and colour, optionally signed. */
export function SignedAmount({
  value,
  sign,
  className = '',
}: {
  value: ReactNode
  /** `−` for a credit, `+` for a charge, nothing for a plain figure. */
  sign?: '−' | '+' | ''
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums',
        className,
      ].join(' ')}
    >
      {sign ? <span>{sign}</span> : null}
      <Rial />
      <span>{value}</span>
    </span>
  )
}

export function NoteCard({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={['rounded-md bg-surface-card p-5', className].join(' ')}>
      <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export function NoteBreadcrumb({
  to,
  parent,
  current,
}: {
  to: string
  parent: string
  current: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to={to}
        className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
      >
        {parent}
      </Link>
      <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
      <span className="text-2xl font-medium leading-[1.2] text-text-primary">{current}</span>
    </div>
  )
}

export type EffectTile = { key: string; label: string; value: ReactNode; note: ReactNode }

/**
 * "They billed − this credit = you'll pay" (or "+ this charge = you'd pay"): three tiles with
 * the operators between them, inside the tinted banner.
 */
export function EffectBanner({
  tone,
  icon,
  title,
  body,
  tiles,
}: {
  tone: NoteTone
  icon: ReactNode
  title: ReactNode
  body: ReactNode
  tiles: [EffectTile, EffectTile, EffectTile]
}) {
  const t = TONE[tone]
  const ops = [t.op, '='] as const
  return (
    <section className={['rounded-md border p-5', t.banner].join(' ')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
          {icon}
        </span>
        <div>
          <h2 className={['text-xl font-medium leading-[1.2]', t.title].join(' ')}>{title}</h2>
          <p className={['mt-1.5 text-sm font-medium leading-[1.4]', t.body].join(' ')}>{body}</p>
        </div>
      </div>
      <div className="mt-4 flex items-stretch gap-2.5 max-md:flex-col">
        {tiles.map((tile, index) => (
          <div
            key={tile.key}
            className="flex min-w-0 flex-1 items-center gap-2.5 max-md:flex-col max-md:items-stretch"
          >
            <div
              className={['min-w-0 flex-1 rounded-sm border bg-white px-4 py-3.5', t.tile].join(
                ' ',
              )}
            >
              <p className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                {tile.label}
              </p>
              <p className="mt-2 text-[22px] font-semibold leading-[1.2] text-text-primary max-md:text-lg">
                {tile.value}
              </p>
              <p className="mt-1.5 truncate text-xs font-medium leading-[1.3] text-text-quaternary">
                {tile.note}
              </p>
            </div>
            {index < 2 ? (
              <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-full bg-white text-sm font-semibold text-text-tertiary">
                {ops[index]}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

/** The Activity card's trail: the current state first, then what happened, newest first. */
export function ActivityTrail({
  entries,
  tone,
  label,
}: {
  entries: NoteActivity[]
  tone: NoteTone
  label: string
}) {
  const { t } = useTranslation()
  return (
    <ol aria-label={label} className="mt-3 flex flex-col">
      {entries.map((entry, index) => {
        const last = index === entries.length - 1
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={[
                  'flex size-6 shrink-0 items-center justify-center rounded-full',
                  entry.tone === 'current' ? TONE[tone].currentDot : 'bg-success-100',
                ].join(' ')}
              >
                {entry.tone !== 'current' ? (
                  <img src={stepDoneIcon} alt="" className="size-3" />
                ) : tone === 'credit' ? (
                  <span className="h-[2px] w-2.5 rounded-full bg-primary-700" />
                ) : (
                  <img src={eyeIcon} alt="" className="size-3.5" />
                )}
              </span>
              {!last ? <span className="w-px flex-1 bg-border-subtle" /> : null}
            </div>
            <div className={last ? '' : 'pb-5'}>
              <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                {t(entry.titleKey, entry.values)}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                {withRial(t(entry.detailKey, entry.values))}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export type LinkedDocument = {
  id: string
  title: string
  /** "the bill this corrects", printed after the title. */
  kind?: string
  detail: ReactNode
  to?: string
  onOpen?: () => void
  icon: 'bill' | 'receipt' | 'file'
}

const LINKED_ICON = { bill: billIcon, receipt: receiptIcon, file: fileIcon }

export function LinkedDocuments({ documents }: { documents: LinkedDocument[] }) {
  return (
    <ul className="mt-2 flex flex-col">
      {documents.map((doc, index) => (
        <li
          key={doc.id}
          className={[
            'flex items-center gap-3 py-3.5',
            index < documents.length - 1 ? 'border-b border-surface-background' : '',
          ].join(' ')}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background">
            <img src={LINKED_ICON[doc.icon]} alt="" className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-[1.3]">
              {doc.to ? (
                <Link to={doc.to} className="font-semibold text-primary-700 hover:underline">
                  {doc.title}
                </Link>
              ) : doc.onOpen ? (
                <button
                  type="button"
                  onClick={doc.onOpen}
                  className="font-semibold text-primary-700 hover:underline"
                >
                  {doc.title}
                </button>
              ) : (
                <span className="font-semibold text-text-primary">{doc.title}</span>
              )}
              {doc.kind ? (
                <span className="font-semibold text-text-primary"> · {doc.kind}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
              {doc.detail}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export type FactRow = { label: string; value: ReactNode; tone?: 'warning' | 'plain' }

/** A side card's label/value rows: "Effect on your VAT", "Supplier", "Against your rate card". */
export function FactRows({ rows, divided = false }: { rows: FactRow[]; divided?: boolean }) {
  return (
    <dl className="mt-3 flex flex-col">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={[
            'flex items-center justify-between gap-3',
            divided ? 'py-2.5' : 'py-2',
            divided && index < rows.length - 1 ? 'border-b border-surface-background' : '',
          ].join(' ')}
        >
          <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{row.label}</dt>
          <dd
            className={[
              'shrink-0 text-sm font-semibold tabular-nums',
              row.tone === 'warning' ? 'text-warning-700' : 'text-text-primary',
            ].join(' ')}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function InfoNote({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  return (
    <p
      className={[
        'mt-3 flex items-start gap-2 text-xs font-medium leading-[1.4] text-text-tertiary',
        plain ? '' : 'rounded-sm bg-surface-background p-3',
      ].join(' ')}
    >
      <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** The Compliance card's ticks, or a warning where the platform did not vouch for the document. */
export function ComplianceList({ lines }: { lines: { id: string; ok: boolean; text: string }[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {lines.map((line) => (
        <li key={line.id} className="flex items-start gap-2">
          <img src={line.ok ? tickIcon : warnIcon} alt="" className="mt-px size-4 shrink-0" />
          <span className="text-sm font-medium leading-[1.4] text-text-secondary">{line.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** The status chip beside the title, in the tone the list uses for the same status. */
export function StatusChip({
  className,
  label,
  dot = true,
}: {
  className: string
  label: string
  dot?: boolean
}) {
  return (
    <span
      className={[
        'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
        className,
      ].join(' ')}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {label}
    </span>
  )
}

/** "CREDIT NOTE · PEPPOL": the document type and how it reached us. */
export function KindBadge({ sign, label }: { sign: string; label: string }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border-subtle px-2.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
      <span aria-hidden="true">{sign}</span>
      {label}
    </span>
  )
}
