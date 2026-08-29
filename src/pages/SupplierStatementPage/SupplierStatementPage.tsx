import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Popover } from '../../components/ui'
import { SUPPLIER_DETAIL } from '../../lib/supplierDetail'
import { formatOmr } from '../../lib/suppliers'
import chevronIcon from '../../assets/invoices/chevron.svg'
import chevronDownIcon from '../../assets/create-invoice/chevron.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import mailIcon from '../../assets/suppliers/chip-email.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

/**
 * A supplier statement (Figma 117:34891).
 *
 * Every line moves the balance, so the running column and the summary above it are both worked
 * out from the entries rather than stated. Figma prints period totals of 24,860.910 billed
 * against 23,063.310 paid, which cannot come from the seven entries it lists — those add up to
 * 4,601.600 — so the totals here are the ones the listed entries actually make. The opening and
 * closing balances are unchanged, and still close on the 2,759.100 the rest of the app shows.
 */

type EntryKind = 'broughtForward' | 'bill' | 'credit' | 'payment'

type Entry = {
  id: string
  date: string
  ref?: string
  noteKey: string
  noteValues?: Record<string, string>
  kind: EntryKind
  /** Positive increases what is owed; credits and payments reduce it. */
  billed?: number
  paid?: number
}

const ENTRIES: Entry[] = [
  {
    id: 'bf',
    date: '1 Jan 2026',
    noteKey: 'supplierStatement.entry.broughtForwardNote',
    kind: 'broughtForward',
  },
  {
    id: 'MR-INV-8712',
    date: '18 Jun 2026',
    ref: 'MR-INV-8712',
    noteKey: 'supplierStatement.entry.againstMatched',
    noteValues: { po: 'PO-0021' },
    kind: 'bill',
    billed: 1842.5,
  },
  {
    id: 'MR-CN-0118',
    date: '28 Jun 2026',
    ref: 'MR-CN-0118',
    noteKey: 'supplierStatement.entry.shortDelivery',
    noteValues: { po: 'PO-0021' },
    kind: 'credit',
    billed: -242.5,
  },
  {
    id: 'PR-0011-a',
    date: '16 Jul 2026',
    ref: 'PR-0011',
    noteKey: 'supplierStatement.entry.settled',
    noteValues: { ref: 'BM-4471-0916', bill: 'MR-INV-8712' },
    kind: 'payment',
    paid: 1842.5,
  },
  {
    id: 'PR-0011-b',
    date: '18 Jul 2026',
    ref: 'PR-0011',
    noteKey: 'supplierStatement.entry.clearedBroughtForward',
    kind: 'payment',
    paid: 961.5,
  },
  {
    id: 'MR-INV-8790',
    date: '21 Jul 2026',
    ref: 'MR-INV-8790',
    noteKey: 'supplierStatement.entry.againstDue',
    noteValues: { po: 'PO-0027', due: '2 Aug', run: 'PR-0014' },
    kind: 'bill',
    billed: 404.79,
  },
  {
    id: 'MR-INV-8821',
    date: '29 Jul 2026',
    ref: 'MR-INV-8821',
    noteKey: 'supplierStatement.entry.againstDue',
    noteValues: { po: 'PO-0031', due: '28 Aug', run: 'PR-0014' },
    kind: 'bill',
    billed: 2354.31,
  },
]

const OPENING = 1204
const round3 = (value: number) => Math.round(value * 1000) / 1000

const KIND_CHIP: Record<Exclude<EntryKind, 'broughtForward'>, string> = {
  bill: 'bg-surface-background text-text-tertiary',
  credit: 'bg-pending-100 text-pending-700',
  payment: 'bg-success-100 text-[#3d5648]',
}

const PERIODS = ['yearly', 'quarterly', 'monthly']

export function SupplierStatementPage() {
  const { t } = useTranslation()
  const supplier = SUPPLIER_DETAIL
  const [period, setPeriod] = useState(PERIODS[0])
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef<HTMLButtonElement>(null)

  /** Each row carries the balance after it, so the closing figure is the last one. */
  const { rows, totals } = useMemo(() => {
    let balance = 0
    const built = ENTRIES.map((entry) => {
      if (entry.kind === 'broughtForward') {
        balance = OPENING
      } else {
        balance = round3(balance + (entry.billed ?? 0) - (entry.paid ?? 0))
      }
      return { entry, balance }
    })

    const billed = round3(
      ENTRIES.filter((e) => e.kind === 'bill').reduce((sum, e) => sum + (e.billed ?? 0), 0),
    )
    const credits = round3(
      ENTRIES.filter((e) => e.kind === 'credit').reduce((sum, e) => sum - (e.billed ?? 0), 0),
    )
    const paid = round3(ENTRIES.reduce((sum, e) => sum + (e.paid ?? 0), 0))

    return {
      rows: built,
      totals: {
        opening: OPENING,
        billed,
        credits,
        paid,
        closing: built[built.length - 1].balance,
        /** The billed column over the period nets the credit off, as the design's row does. */
        billedNet: round3(billed - credits),
      },
    }
  }, [])

  const unusedCredits = ENTRIES.filter((entry) => entry.kind === 'credit').length

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/suppliers"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
              >
                {t('suppliersPage.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
              <Link
                to={`/suppliers/${supplier.slug}`}
                className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
              >
                {supplier.name}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
              <span className="text-2xl font-medium leading-[1.2] text-text-primary">
                {t('supplierStatement.title')}
              </span>
            </div>
            <h1 className="mt-1 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('supplierStatement.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('supplierStatement.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={printIcon} alt="" className="size-5" />
              {t('supplierStatement.print')}
            </button>
            <button
              ref={periodRef}
              type="button"
              onClick={() => setPeriodOpen((open) => !open)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t(`reports.periods.${period}`)}
              <img src={chevronDownIcon} alt="" className="size-4 brightness-0 invert" />
            </button>
            <Popover anchorRef={periodRef} open={periodOpen} onClose={() => setPeriodOpen(false)}>
              <ul className="w-[180px] py-1.5">
                {PERIODS.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriod(option)
                        setPeriodOpen(false)
                      }}
                      className={[
                        'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                        option === period ? 'text-primary-700' : 'text-text-secondary',
                      ].join(' ')}
                    >
                      {t(`reports.periods.${option}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
          </div>
        </div>

        <section className="overflow-hidden rounded-md bg-surface-card">
          {/* Parties */}
          <div className="grid gap-6 p-6 md:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
                {t('supplierStatement.statementFor')}
              </p>
              <p className="mt-2 text-base font-semibold leading-[1.3] text-text-primary">
                {supplier.legalName}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-tertiary">
                VAT {supplier.vat} · {supplier.billing.peppolId}
              </p>
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                Rusayl Industrial Estate, Muscat
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
                {t('supplierStatement.issuedBy')}
              </p>
              <p className="mt-2 text-base font-semibold leading-[1.3] text-text-primary">
                Al Bahja Coffee LLC
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-tertiary">
                VAT OM1100392000
              </p>
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                Souq Street, Nizwa
              </p>
            </div>
            <div className="md:text-end">
              <p className="text-xl font-semibold leading-[1.2] text-text-primary">
                1 Jan – 30 Jul 2026
              </p>
              <p className="mt-1.5 text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('supplierStatement.prepared', { when: '30 July 2026, 09:14' })}
              </p>
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('supplierDetail.net30Days')} · {t('supplierDetail.twoPercentSeven')}
              </p>
            </div>
          </div>

          {/* The equation */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-y border-surface-background bg-surface-background/40 px-6 py-5">
            <Figure
              label={t('supplierStatement.owedOn', { date: '1 Jan' })}
              value={totals.opening}
            />
            <Operator>+</Operator>
            <Figure label={t('supplierStatement.theyBilledYou')} value={totals.billed} />
            <Operator>−</Operator>
            <Figure label={t('supplierStatement.youPaid')} value={totals.paid} />
            <Operator>−</Operator>
            <Figure label={t('supplierStatement.credits')} value={totals.credits} />
            <div className="ms-auto text-end">
              <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
                {t('supplierStatement.owedOn', { date: '30 Jul' })}
              </p>
              <p className="mt-1.5 flex items-center justify-end gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                <img src={omrRowIcon} alt="" className="h-auto w-6 shrink-0" />
                {formatOmr(totals.closing)}
              </p>
            </div>
          </div>

          {/* Ledger */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {(
                    ['date', 'whatItWas', 'kind', 'theyBilled', 'youPaid', 'owedAfter'] as const
                  ).map((key, index) => (
                    <th
                      key={key}
                      className={[
                        'h-[46px] px-5 font-semibold',
                        index >= 3 ? 'text-end' : 'text-start',
                      ].join(' ')}
                    >
                      {t(`supplierStatement.col.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, balance }) => (
                  <tr key={entry.id} className="border-b border-surface-background">
                    <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">
                      {entry.date}
                    </td>
                    <td className="px-5 py-4 align-top">
                      {entry.ref ? (
                        <Link
                          to="#"
                          className="text-sm font-semibold text-primary-700 hover:underline"
                        >
                          {entry.ref}
                        </Link>
                      ) : (
                        <p className="text-sm font-semibold text-text-primary">
                          {t('supplierStatement.entry.broughtForward')}
                        </p>
                      )}
                      <p className="mt-1 max-w-[280px] text-xs font-medium leading-[1.5] text-text-quaternary">
                        {t(entry.noteKey, entry.noteValues)}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      {entry.kind === 'broughtForward' ? null : (
                        <span
                          className={[
                            'inline-flex h-[24px] items-center rounded-sm px-2 text-[11px] font-semibold uppercase tracking-[0.4px]',
                            KIND_CHIP[entry.kind],
                          ].join(' ')}
                        >
                          {t(`supplierStatement.kind.${entry.kind}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {entry.billed !== undefined
                        ? `${entry.billed < 0 ? '−' : ''}${formatOmr(Math.abs(entry.billed))}`
                        : ''}
                    </td>
                    <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {entry.paid !== undefined ? formatOmr(entry.paid) : ''}
                    </td>
                    <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {formatOmr(balance)}
                    </td>
                  </tr>
                ))}

                <tr className="bg-surface-background/40">
                  <td colSpan={3} className="px-5 py-4 text-sm font-semibold text-text-primary">
                    {t('supplierStatement.overThePeriod')}
                  </td>
                  <td className="px-5 py-4 text-end text-sm font-semibold text-text-primary tabular-nums">
                    {formatOmr(totals.billedNet)}
                  </td>
                  <td className="px-5 py-4 text-end text-sm font-semibold text-text-primary tabular-nums">
                    {formatOmr(totals.paid)}
                  </td>
                  <td className="px-5 py-4 text-end">
                    <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                      <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                      {formatOmr(totals.closing)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Ageing */}
          <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
            {supplier.bands.map((band, index) => (
              <div
                key={band.id}
                className={[
                  'border-s-2 ps-3',
                  [
                    'border-[#4c6c5a]',
                    'border-[#6d5a39]',
                    'border-pending-200',
                    'border-warning-700',
                  ][index],
                ].join(' ')}
              >
                <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                  {t(`supplierStatement.ageing.${band.id}`)}
                </p>
                {band.total > 0 ? (
                  <p className="mt-1.5 flex items-center gap-1 text-xl font-semibold leading-[1.2] text-text-primary tabular-nums">
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {formatOmr(band.total)}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xl font-semibold leading-[1.2] text-text-quaternary">
                    {t('supplierStatement.nothing')}
                  </p>
                )}
                <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                  {band.bills.length > 0
                    ? t('supplierDetail.bandNote.notDueYet', {
                        count: band.bills.length,
                        date: band.bills[0].due.replace(' 2026', ''),
                      })
                    : t(`supplierStatement.ageingNote.${band.id}`)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-border-subtle bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
            <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
            <span className="font-semibold text-text-primary tabular-nums">
              {formatOmr(totals.closing)}
            </span>
            {t('supplierStatement.footer', {
              entries: ENTRIES.length,
              credits: unusedCredits,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierStatement.downloadPdf')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierStatement.downloadExcel')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={mailIcon} alt="" className="size-4 brightness-0 invert" />
              {t('supplierStatement.emailIt')}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {label}
      </p>
      <p className="mt-1.5 flex items-center gap-1 text-lg font-semibold leading-[1.2] text-text-primary tabular-nums">
        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
        {formatOmr(value)}
      </p>
    </div>
  )
}

function Operator({ children }: { children: React.ReactNode }) {
  return <span className="mt-4 text-lg font-semibold text-text-quaternary">{children}</span>
}
