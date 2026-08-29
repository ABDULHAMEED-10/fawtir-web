import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import * as validate from '../../lib/validation'
import chevronIcon from '../../assets/invoices/chevron.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import stopIcon from '../../assets/suppliers/consequence-stop.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'

/**
 * Importing a supplier list (Figma 117:34516).
 *
 * The point of the screen is that nothing is saved yet, so every problem row is editable and the
 * counts move as they are fixed — a row leaves "can't import" the moment its field validates,
 * which is what makes the footer total worth reading.
 */

type Severity = 'blocked' | 'warning'

type ImportRow = {
  row: number
  supplier: string
  meta: string
  fieldKey: string
  value: string
  placeholder?: string
  problemKey: string
  severity: Severity
  actionKey: string
  /** How the field is checked once someone edits it. */
  check: (value: string) => string | undefined
  /** What the action button fills in. */
  fix?: string
  /** Warnings import either way, so they can be waved through instead of corrected. */
  dismissable?: boolean
}

const alwaysValid = () => undefined

const ROWS: ImportRow[] = [
  {
    row: 7,
    supplier: 'Rustaq Timber Trading',
    meta: 'Net 30 · rustaq@timber.om',
    fieldKey: 'importSuppliers.field.vatNumber',
    value: 'OM11004471',
    problemKey: 'importSuppliers.problem.vatTooShort',
    severity: 'blocked',
    actionKey: 'importSuppliers.action.leaveOut',
    check: validate.vatin,
  },
  {
    row: 14,
    supplier: 'Barka Chemical Supplies',
    meta: 'Net 45 · no email given',
    fieldKey: 'importSuppliers.field.peppolId',
    value: 'OM1100883412',
    problemKey: 'importSuppliers.problem.noScheme',
    severity: 'blocked',
    actionKey: 'importSuppliers.action.fixAllLikeThis',
    check: (value) => (/^0248:OM\d{10}$/.test(value.trim()) ? undefined : 'x'),
    fix: '0248:OM1100883412',
  },
  {
    row: 28,
    supplier: '',
    meta: 'VAT OM1100774209 · Net 30',
    fieldKey: 'importSuppliers.field.legalName',
    value: '',
    placeholder: 'importSuppliers.typeAName',
    problemKey: 'importSuppliers.problem.noName',
    severity: 'blocked',
    actionKey: 'importSuppliers.action.leaveOut',
    check: (value) => (value.trim().length > 1 ? undefined : 'x'),
  },
  {
    row: 39,
    supplier: 'Salalah Spice Company',
    meta: 'VAT OM1100992018',
    fieldKey: 'importSuppliers.field.paymentTerms',
    value: '30 days nett',
    problemKey: 'importSuppliers.problem.unknownTerms',
    severity: 'blocked',
    actionKey: 'importSuppliers.action.yesNet30',
    check: (value) =>
      ['Net 30', 'Net 10', 'Net 45', 'On receipt'].includes(value.trim()) ? undefined : 'x',
    fix: 'Net 30',
  },
  {
    row: 3,
    supplier: 'Sohar Packaging LLC',
    meta: 'VAT OM1100628391 · Net 10',
    fieldKey: 'importSuppliers.field.alreadyOnList',
    value: '14 bills, active',
    problemKey: 'importSuppliers.problem.duplicateVat',
    severity: 'warning',
    actionKey: 'importSuppliers.action.updateInstead',
    check: alwaysValid,
    dismissable: true,
  },
  {
    row: 21,
    supplier: 'Ibri Electrical Works',
    meta: 'VAT OM1100337715 · Net 30',
    fieldKey: 'importSuppliers.field.iban',
    value: '',
    placeholder: 'importSuppliers.empty',
    problemKey: 'importSuppliers.problem.noIban',
    severity: 'warning',
    actionKey: 'importSuppliers.action.bringInAnyway',
    check: alwaysValid,
    dismissable: true,
  },
]

/**
 * The file holds 52 rows: 41 the reader had no complaint about, 7 worth a look and 4 it cannot
 * take. Six of those eleven problem rows are the ones listed below; the rest are counted but not
 * shown, exactly as the design has it.
 */
const TOTAL_ROWS = 52
const CLEAN_ROWS = 41
const ON_PEPPOL = 33

type TabId = 'blocked' | 'warning' | 'ready' | 'all'

export function ImportSuppliersPage() {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<number, string>>(
    Object.fromEntries(ROWS.map((row) => [row.row, row.value])),
  )
  const [dismissed, setDismissed] = useState<number[]>([])
  const [left, setLeft] = useState<number[]>([])
  const [tab, setTab] = useState<TabId>('blocked')

  /**
   * A row's live state.
   *
   * A blocked row clears itself the moment its field validates. A warning cannot be validated
   * away — it is a judgement about a duplicate or a missing account — so it stays until someone
   * accepts it.
   */
  const state = (row: ImportRow): Severity | 'ready' => {
    if (left.includes(row.row)) return row.severity
    if (dismissed.includes(row.row)) return 'ready'
    if (row.severity === 'warning') return 'warning'
    return row.check(values[row.row] ?? '') ? 'blocked' : 'ready'
  }

  const counts = useMemo(() => {
    const listed = (severity: Severity) =>
      ROWS.filter(
        (row) => row.severity === severity && state(row) === severity && !left.includes(row.row),
      )
    const blockedRows = listed('blocked')
    const warningRows = listed('warning')
    // Problem rows the design counts but does not print.
    const unlistedWarnings = 7 - ROWS.filter((row) => row.severity === 'warning').length
    const fixed = ROWS.filter((row) => state(row) === 'ready').length

    const blocked = blockedRows.length
    const warning = warningRows.length + unlistedWarnings
    const ready = CLEAN_ROWS + fixed
    const leftOut = blocked + left.length
    return { blocked, warning, ready, total: TOTAL_ROWS, leftOut, comingIn: TOTAL_ROWS - leftOut }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, dismissed, left])

  const visible = ROWS.filter((row) => {
    if (tab === 'all') return true
    if (tab === 'ready') return state(row) === 'ready'
    return state(row) === tab && !left.includes(row.row)
  })

  const TABS: { id: TabId; count: number }[] = [
    { id: 'blocked', count: counts.blocked },
    { id: 'warning', count: counts.warning },
    { id: 'ready', count: counts.ready },
    { id: 'all', count: counts.total },
  ]

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
              <span className="text-2xl font-medium leading-[1.2] text-text-primary">
                {t('importSuppliers.breadcrumb')}
              </span>
            </div>
            <h1 className="mt-1 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('importSuppliers.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('importSuppliers.subtitle')}
            </p>
          </div>
          <Link
            to="/suppliers/import"
            className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('importSuppliers.startOver')}
          </Link>
        </div>

        {/* Stepper — Figma numbers these 1, 3, 4; they run in sequence here. */}
        <section className="flex flex-wrap items-center gap-4 rounded-md bg-surface-card px-6 py-4">
          {[{ id: 'uploaded', done: true }, { id: 'check', current: true }, { id: 'bring' }].map(
            (step, index, all) => (
              <div key={step.id} className="flex flex-1 items-center gap-4">
                <span className="flex items-center gap-2.5">
                  <span
                    className={[
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      step.done
                        ? 'bg-success-700 text-white'
                        : step.current
                          ? 'bg-primary-700 text-white'
                          : 'bg-surface-background text-text-quaternary',
                    ].join(' ')}
                  >
                    {step.done ? <img src={tickIcon} alt="" className="size-3.5" /> : index + 1}
                  </span>
                  <span
                    className={[
                      'whitespace-nowrap text-sm font-semibold',
                      step.current
                        ? 'text-primary-700'
                        : step.done
                          ? 'text-text-secondary'
                          : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {t(`importSuppliers.step.${step.id}`)}
                  </span>
                </span>
                {index < all.length - 1 ? <span className="h-px flex-1 bg-border-subtle" /> : null}
              </div>
            ),
          )}
        </section>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            tone="ready"
            icon={checkIcon}
            title={t('importSuppliers.card.ready')}
            value={counts.ready}
            note={t('importSuppliers.card.readyNote', { peppol: ON_PEPPOL })}
          />
          <SummaryCard
            tone="warning"
            icon={warnIcon}
            title={t('importSuppliers.card.warning')}
            value={counts.warning}
            note={t('importSuppliers.card.warningNote')}
          />
          <SummaryCard
            tone="blocked"
            icon={stopIcon}
            title={t('importSuppliers.card.blocked')}
            value={counts.blocked}
            note={t('importSuppliers.card.blockedNote')}
          />
        </div>

        {/* Rows */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {TABS.map((entry) => {
              const isActive = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary-700 text-primary-700'
                      : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(`importSuppliers.tab.${entry.id}`)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      isActive ? 'text-primary-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {entry.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                  {(['row', 'supplier', 'problemField', 'whatsWrong'] as const).map((key) => (
                    <th key={key} className="px-5 py-3 text-start font-semibold">
                      {t(`importSuppliers.col.${key}`)}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-14 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('importSuppliers.nothingHere')}
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const rowState = state(row)
                    const isLeft = left.includes(row.row)
                    return (
                      <tr
                        key={row.row}
                        className={[
                          'border-b border-surface-background last:border-0',
                          isLeft
                            ? 'opacity-50'
                            : rowState === 'blocked'
                              ? 'bg-[#fdf4f2]'
                              : rowState === 'warning'
                                ? 'bg-pending-100/50'
                                : 'bg-success-100/40',
                        ].join(' ')}
                      >
                        <td className="px-5 py-4 align-top text-sm font-medium text-text-quaternary tabular-nums">
                          {row.row}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p
                            className={[
                              'text-sm font-semibold',
                              row.supplier ? 'text-text-primary' : 'text-text-quaternary',
                            ].join(' ')}
                          >
                            {row.supplier || t('importSuppliers.blank')}
                          </p>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {row.meta}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <label className="block text-xs font-medium text-text-quaternary">
                            <span className="block">{t(row.fieldKey)}</span>
                            <input
                              value={values[row.row] ?? ''}
                              placeholder={row.placeholder ? t(row.placeholder) : undefined}
                              onChange={(event) =>
                                setValues((current) => ({
                                  ...current,
                                  [row.row]: event.target.value,
                                }))
                              }
                              className={[
                                'mt-1 h-[42px] w-[190px] rounded-sm border px-3 text-sm font-medium text-text-secondary outline-none',
                                rowState === 'ready'
                                  ? 'border-success-700 bg-white'
                                  : 'border-primary-300 bg-white',
                              ].join(' ')}
                            />
                          </label>
                        </td>
                        <td className="px-5 py-4 align-top">
                          {rowState === 'ready' ? (
                            <p className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-success-700">
                              <img src={checkIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                              {t('importSuppliers.problem.resolved')}
                            </p>
                          ) : (
                            <p
                              className={[
                                'flex max-w-[290px] items-start gap-2 text-sm font-medium leading-[1.5]',
                                rowState === 'blocked' ? 'text-warning-700' : 'text-pending-700',
                              ].join(' ')}
                            >
                              <img
                                src={rowState === 'blocked' ? stopIcon : warnIcon}
                                alt=""
                                className="mt-0.5 size-4 shrink-0"
                              />
                              {t(row.problemKey)}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top text-end">
                          {rowState === 'ready' ? null : (
                            <button
                              type="button"
                              onClick={() => {
                                if (row.fix) {
                                  setValues((current) => ({ ...current, [row.row]: row.fix! }))
                                } else if (row.dismissable) {
                                  setDismissed((current) => [...current, row.row])
                                } else {
                                  setLeft((current) => [...current, row.row])
                                }
                              }}
                              className="inline-flex h-[38px] items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                            >
                              {t(row.actionKey)}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Footer bar */}
      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-border-subtle bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <p className="text-sm font-medium text-text-tertiary">
            <span className="font-semibold text-text-primary">
              {t('importSuppliers.wouldComeIn', {
                coming: counts.comingIn,
                total: counts.total,
              })}
            </span>{' '}
            {t('importSuppliers.leftOut', { count: counts.leftOut })}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/suppliers"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('importSuppliers.cancel')}
            </Link>
            <button
              type="button"
              disabled={counts.leftOut === 0}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
            >
              {t('importSuppliers.downloadFailed', { count: counts.leftOut })}
            </button>
            <Link
              to="/suppliers"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {t('importSuppliers.bringIn', { count: counts.comingIn })}
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function SummaryCard({
  tone,
  icon,
  title,
  value,
  note,
}: {
  tone: 'ready' | 'warning' | 'blocked'
  icon: string
  title: string
  value: number
  note: string
}) {
  const styles = {
    ready: 'border-[#cfe0d5] bg-[#eef5f0] text-[#3d5648]',
    warning: 'border-pending-200 bg-pending-100 text-pending-700',
    blocked: 'border-[#f0d4ce] bg-[#fdf4f2] text-warning-700',
  }[tone]

  return (
    <article className={['rounded-md border p-5', styles].join(' ')}>
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={icon} alt="" className="size-4" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      <p className="mt-3 text-[32px] font-semibold leading-[1.2] tabular-nums">{value}</p>
      <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">{note}</p>
    </article>
  )
}
