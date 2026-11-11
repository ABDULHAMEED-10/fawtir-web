import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Modal, Rial, RowsView, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  chaseRecurringBill,
  exportRecurringRuns,
  loadReceivableBills,
  loadRecurringBill,
  loadRecurringRuns,
  markRecurringReceived,
  receivableBillsPath,
  recurringBillPath,
  recurringRunsPath,
  setRecurringActive,
  type ReceivableBillDto,
  type RecurringBillDto,
  type RecurringRunDto,
} from '../../api/expenditure/recurringBills'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import { saveDownload } from '../../lib/supplierRecord'
import {
  RECURRING_REFUSALS,
  activityOf,
  amountOf,
  cadenceNote,
  canResume,
  chartBars,
  chaseNotice,
  daysBetween,
  formatVariance,
  isEnded,
  pauseReasonKey,
  offersChase,
  monthName,
  monthYear,
  ordinal,
  stateNote,
  toleranceBand,
  toneOf,
  trackRecord,
} from '../../lib/recurringBills'
import calSmallIcon from '../../assets/recurring/cal-small.svg'
import calAlertIcon from '../../assets/recurring/cal-alert.svg'
import actCalIcon from '../../assets/recurring/act-cal.svg'
import mailWhiteIcon from '../../assets/recurring/mail-white.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import peppolIcon from '../../assets/invoice-details/peppol-badge.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const BAR_TONE = {
  paid: 'bg-[#d5dcf1]',
  recent: 'bg-primary-700',
  expected: 'border border-dashed border-[#d8c9a8] bg-[#faf5ea]',
} as const

const CHIP_TONE = {
  ok: 'bg-success-100 text-[#3d5648]',
  warn: 'bg-pending-100 text-pending-700',
  muted: 'bg-surface-background text-text-tertiary',
} as const

const PILL = {
  warn: 'bg-pending-100 text-pending-700',
  ok: 'bg-success-100 text-[#3d5648]',
  muted: 'bg-[#e3e4ea] text-[#474a5e]',
} as const

const CHANNEL_KEY: Record<string, string> = {
  PEPPOL: 'recurringBills.detail.channel.peppol',
  EMAIL_PDF: 'recurringBills.detail.channel.email',
  PAPER: 'recurringBills.detail.channel.paper',
  MANUAL: 'recurringBills.detail.channel.manual',
}

function Card({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-baseline gap-3 text-xl font-medium leading-[1.2] text-text-secondary">
          {title}
          {note ? <span className="text-sm font-medium text-text-quaternary">{note}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Rows({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-3">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 border-b border-surface-background pb-3 last:border-0 last:pb-0"
        >
          <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
          <dd className="text-end text-sm font-semibold text-text-primary">
            {typeof value === 'string' ? withRial(value) : value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One recurring bill (Figma 163:18190): what it expects, what it has cost, what happened each
 * period, and the two things that can be done to it: pausing the watch and chasing.
 *
 * The history is the API's own runs, one per period; the chart, the track record and the activity
 * are read off them. "Mark as received" asks which of the supplier's bills the late period's was;
 * "Export" hands over the history as a CSV.
 */
export function RecurringBillDetailPage() {
  const { id = '' } = useParams()
  return (
    <AppShell>
      <RecurringBill key={id} id={id} />
    </AppShell>
  )
}

function RecurringBill({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'invoice.payment.manage')
  // A plan without recurring bills (PL-8): reading, pausing and marking one received stay;
  // editing, resuming and chasing wait for a plan that has them.
  const planIncludes = usePlanIncludes('recurringBills')
  const canExport = can(session, 'invoice.export')
  const today = muscatToday()
  const [notice, setNotice] = useState<
    { key: string; values?: Record<string, string | number> } | { body: string } | null
  >(null)
  /** The period "Mark as received" is asking about (by its expected date), while its dialog is open. */
  const [receiving, setReceiving] = useState<{ expectedOn: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [allRuns, setAllRuns] = useState(false)

  const read = useApiRead<RecurringBillDto>(recurringBillPath(id), () => loadRecurringBill(id))
  const runsPath = recurringRunsPath(id)
  const runs = useApiRead<RecurringRunDto[]>(runsPath, () => loadRecurringRuns(runsPath))
  const bill = read.read.status === 'ready' ? read.read.data : null
  const supplier = useApiRead<SupplierDetailDto>(
    bill?.supplierId ? supplierPath(bill.supplierId) : null,
    () => loadSupplier(bill!.supplierId!),
  )

  if (read.read.status !== 'ready' || !bill) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {read.read.status === 'failed' ? (
          <ApiReadFailure error={read.read.error} retry={read.retry} notFoundOn400 />
        ) : (
          <LoadingNotice />
        )}
      </div>
    )
  }

  const note = stateNote(bill)
  const tone = toneOf(bill)
  const cadence = cadenceNote(bill, language)
  const money = (value: number | null) =>
    value === null ? '' : formatAmount(value, bill.currencyCode, language)
  const day = (value: string) => formatDate(value, language)
  const history = runs.read.status === 'ready' ? runs.read.data : []
  const bars = chartBars(history, bill.totalIncludingVat, language)
  const record = trackRecord(history, bill, today)
  const activity = activityOf(bill, history, day)
  // A server that does not say whether the range is flagged reads as before: on with a percentage.
  const flagsRange = bill.toleranceEnabled ?? bill.tolerancePercent !== null
  const band =
    flagsRange && bill.tolerancePercent !== null
      ? toleranceBand(bill.totalIncludingVat, bill.tolerancePercent)
      : null
  const ended = isEnded(bill)
  const pauseReason = pauseReasonKey(bill)
  const late = bill.active && bill.expectation?.state === 'LATE' ? bill.expectation : null
  const whoName = bill.notifyUserName?.trim() || null
  const supplierProfile = supplier.read.status === 'ready' ? supplier.read.data.profile : null
  // Resume is offered only where it can be taken. Paused with its supplier: not until the
  // supplier's record says it is back on; a record that cannot be read leaves the server to say.
  const resumable = planIncludes && canResume(
    bill,
    !bill.supplierId
      ? false
      : supplier.read.status === 'ready'
        ? supplier.read.data.profile.status === 'SWITCHED_OFF'
        : supplier.read.status === 'failed'
          ? false
          : null,
  )
  const shownRuns = allRuns ? history : history.slice(0, 5)

  /** The next date the payment falls due after the expected day, when the watch names one. */
  const dueAfter = (iso: string) => {
    if (!bill.paymentDueDay) return null
    const [year, month] = iso.split('-').map(Number)
    const next = new Date(Date.UTC(year, month, Math.min(bill.paymentDueDay, 28)))
    return next.toISOString().slice(0, 10)
  }

  const failed = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : null
    if (code && Object.hasOwn(RECURRING_REFUSALS, code)) {
      setNotice({ key: RECURRING_REFUSALS[code] })
      return
    }
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({
      body: message.reference
        ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
        : body,
    })
  }

  const act = async (what: 'toggle' | 'chase') => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (what === 'toggle') {
        await setRecurringActive(id, !bill.active)
        setNotice({
          key: bill.active ? 'recurringBills.done.paused' : 'recurringBills.done.resumed',
        })
      } else {
        setNotice(chaseNotice(await chaseRecurringBill(id)))
      }
      read.retry()
      runs.retry()
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  const markReceived = async (billId: string) => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      await markRecurringReceived(id, billId, receiving?.expectedOn ?? null)
      read.retry()
      runs.retry()
    } catch (error) {
      failed(error)
    } finally {
      setReceiving(null)
      setBusy(false)
    }
  }

  const exportHistory = async () => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      saveDownload(await exportRecurringRuns(id), 'recurring-bill-history.csv')
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  const cadenceText = t(
    cadence.key,
    cadence.values
      ? {
          ...cadence.values,
          weekday: cadence.values.weekday ? t(String(cadence.values.weekday)) : undefined,
        }
      : undefined,
  )
  const arrivedChip = (
    run: RecurringRunDto,
  ): { key: string; values?: Record<string, string | number>; tone: keyof typeof CHIP_TONE } => {
    switch (run.outcome) {
      case 'ARRIVED':
        return { key: 'recurringBills.detail.arrivedChip', tone: 'ok' }
      case 'ARRIVED_OUT_OF_RANGE':
        return {
          key: 'recurringBills.detail.arrivedOff',
          values: { percent: formatVariance(run.variancePercent) },
          tone: 'warn',
        }
      case 'LATE':
        return {
          key: 'recurringBills.detail.daysLate',
          values: { count: run.expectedOn ? Math.max(0, daysBetween(run.expectedOn, today)) : 0 },
          tone: 'warn',
        }
      case 'RAISED':
        return { key: 'recurringBills.outcome.RAISED', tone: 'ok' }
      case 'FAILED':
        return { key: 'recurringBills.outcome.FAILED', tone: 'warn' }
      case 'SKIPPED':
        return { key: 'recurringBills.outcome.SKIPPED', tone: 'muted' }
      default:
        return { key: 'recurringBills.outcome.EXPECTED', tone: 'muted' }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/recurring-bills"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
          >
            {t('recurringBills.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {bill.description}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {bill.description}
              </h1>
              <span
                className={[
                  'inline-flex h-[31px] items-center gap-2 rounded-sm px-3 text-sm font-semibold',
                  PILL[tone],
                ].join(' ')}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {t(
                  note.key === 'recurringBills.state.late'
                    ? 'recurringBills.detail.lateArriving'
                    : note.key,
                  note.values
                    ? {
                        ...note.values,
                        date: note.values.date ? day(String(note.values.date)) : undefined,
                      }
                    : undefined,
                )}
              </span>
              <span className="inline-flex h-[31px] items-center gap-1.5 rounded-sm border border-border-subtle bg-surface-background px-3 text-xs font-semibold uppercase tracking-[0.5px] text-text-tertiary">
                <img src={calSmallIcon} alt="" className="size-4" />
                {cadenceText}
              </span>
              {pauseReason ? (
                <span className="text-sm font-medium text-text-tertiary">{t(pauseReason)}</span>
              ) : null}
            </div>

            <p className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
              <span className="font-medium text-text-quaternary">
                {t('recurringBills.detail.from')}
              </span>
              <span className="font-semibold text-text-primary">{bill.supplierName}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">
                {t('recurringBills.detail.usually')}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
                <Rial /> {money(bill.totalIncludingVat)}
              </span>
              {bill.watchingFrom ? (
                <>
                  <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
                  <span className="font-medium text-text-quaternary">
                    {t('recurringBills.detail.watchedSince', {
                      since: monthYear(bill.watchingFrom, language),
                    })}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              {planIncludes ? (
                <Link
                  to={`/expenditure/recurring-bills/${bill.id}/edit`}
                  className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
                >
                  {t('recurringBills.menu.edit')}
                </Link>
              ) : null}
              {bill.active || resumable ? (
                <button
                  type="button"
                  onClick={() => void act('toggle')}
                  disabled={busy}
                  className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-50"
                >
                  {t(
                    bill.active
                      ? 'recurringBills.detail.pauseWatching'
                      : 'recurringBills.detail.resumeWatching',
                  )}
                </button>
              ) : null}
              {/* Only once the bill is late, by the list row's own rule: hidden, not disabled. */}
              {planIncludes && !ended && offersChase(bill) ? (
                <button
                  type="button"
                  onClick={() => void act('chase')}
                  disabled={busy}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
                >
                  <img src={mailWhiteIcon} alt="" className="size-[17px]" />
                  {t('recurringBills.actions.chase')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key, notice.values) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {ended && bill.endedOn ? (
        <Notice body={t('recurringBills.detail.endedLine', { date: day(bill.endedOn) })} />
      ) : null}

      {late ? (
        <div className="flex flex-wrap items-center gap-4 rounded-sm border border-[#e7e0cd] bg-[#faf5ea] p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
            <img src={calAlertIcon} alt="" className="size-5" />
          </span>
          <div className="min-w-[260px] flex-1">
            <p className="text-base font-semibold leading-[1.2] text-[#6d5a39]">
              {t('recurringBills.detail.alertTitle', {
                month: late.expectedOn ? monthName(late.expectedOn, language) : '',
              })}
            </p>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#887147]">
              {t('recurringBills.detail.alertBody', {
                expected: late.expectedOn ? day(late.expectedOn) : '',
              })}
              {late.expectedOn && dueAfter(late.expectedOn)
                ? ` ${t('recurringBills.detail.alertDue', { due: day(dueAfter(late.expectedOn)!), count: Math.max(0, daysBetween(today, dueAfter(late.expectedOn)!)) })}`
                : ''}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setReceiving({ expectedOn: late.expectedOn })}
                disabled={busy}
                className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
              >
                {t('recurringBills.detail.markReceived')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card
            title={t('recurringBills.detail.whatItsCost')}
            note={t('recurringBills.detail.last12')}
            action={
              canExport ? (
                <button
                  type="button"
                  onClick={() => void exportHistory()}
                  disabled={busy}
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-50"
                >
                  {t('recurringBills.detail.export')}
                </button>
              ) : null
            }
          >
            {runs.read.status === 'loading' ? <LoadingNotice /> : null}
            {runs.read.status === 'failed' ? (
              <ApiReadFailure error={runs.read.error} retry={runs.retry} />
            ) : null}
            {runs.read.status === 'ready' && bars.length === 0 ? (
              <p className="py-8 text-center text-sm font-medium text-text-quaternary">
                {t('recurringBills.detail.noRuns')}
              </p>
            ) : null}
            {bars.length > 0 ? (
              <>
                <div className="flex h-[170px] items-end gap-2">
                  {bars.map((bar, index) => {
                    const top = Math.max(...bars.map((entry) => entry.amount), 1)
                    return (
                      <div
                        key={`${bar.label}-${index}`}
                        className="flex h-full flex-1 flex-col items-center gap-2"
                      >
                        {/* A percentage height needs a parent with a resolved one, which this flex-1 box supplies. */}
                        <span className="flex w-full flex-1 items-end">
                          <span
                            style={{ height: `${Math.max(8, (bar.amount / top) * 100)}%` }}
                            className={['w-full rounded-sm', BAR_TONE[bar.tone]].join(' ')}
                            title={money(bar.amount)}
                          />
                        </span>
                        <span className="text-xs font-medium leading-[1.2] text-text-quaternary">
                          {bar.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-background pt-4">
                  <div className="flex flex-wrap items-center gap-4">
                    {(['paid', 'recent', 'expected'] as const).map((key) => (
                      <span
                        key={key}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary"
                      >
                        <span className={['size-3 rounded-[2px]', BAR_TONE[key]].join(' ')} />
                        {t(`recurringBills.detail.legend.${key}`)}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-medium text-text-tertiary">
                    {withRial(
                      record.changed === 0
                        ? t('recurringBills.detail.flatFor', {
                            amount: `OMR ${money(bill.totalIncludingVat)}`,
                            count: record.matched,
                          })
                        : t('recurringBills.detail.movedTimes', { count: record.changed }),
                    )}
                  </span>
                </div>
              </>
            ) : null}
          </Card>

          <Card
            title={t('recurringBills.detail.everyPeriod')}
            action={
              history.length > 5 ? (
                <button
                  type="button"
                  onClick={() => setAllRuns((value) => !value)}
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                >
                  {allRuns
                    ? t('recurringBills.detail.seeFewer')
                    : t('recurringBills.detail.seeAll', { count: history.length })}
                </button>
              ) : null
            }
          >
            {runs.read.status === 'ready' && history.length === 0 ? (
              <p className="py-8 text-center text-sm font-medium text-text-quaternary">
                {t('recurringBills.detail.noRuns')}
              </p>
            ) : null}
            {shownRuns.length > 0 ? (
              <RowsView>
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                      {(['month', 'bill', 'arrived', 'amount', 'paid'] as const).map((key) => (
                        <th
                          key={key}
                          className={[
                            'py-2 font-semibold',
                            key === 'amount' ? 'text-end' : 'text-start',
                            key === 'paid' ? 'ps-4' : '',
                          ].join(' ')}
                        >
                          {t(`recurringBills.detail.col.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownRuns.map((run) => {
                      const chip = arrivedChip(run)
                      const amount = amountOf(run, bill.totalIncludingVat)
                      const due = run.expectedOn ? dueAfter(run.expectedOn) : null
                      return (
                        <tr
                          key={run.id}
                          className="border-b border-surface-background last:border-b-0"
                        >
                          <td className="py-3.5">
                            <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                              {monthYear(run.periodStart ?? run.runDate, language)}
                            </p>
                            <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                              {run.expectedOn
                                ? t('recurringBills.detail.expectedOn', {
                                    date: day(run.expectedOn),
                                  })
                                : day(run.runDate)}
                            </p>
                          </td>
                          <td className="py-3.5">
                            {run.billId ? (
                              <Link
                                to={`/expenditure/bills/${run.billId}`}
                                className="text-sm font-semibold text-primary-700 hover:underline"
                              >
                                {run.billNumber?.trim() || t('recurringBills.detail.openBill')}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-text-quaternary">
                                {t('recurringBills.detail.nothingYet')}
                              </span>
                            )}
                            {run.failureReason ? (
                              <span className="mt-1 block text-xs font-medium text-warning-700">
                                {run.failureReason}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3.5">
                            <span
                              className={[
                                'inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium leading-[1.3]',
                                CHIP_TONE[chip.tone],
                              ].join(' ')}
                            >
                              {t(chip.key, chip.values)}
                            </span>
                          </td>
                          <td className="py-3.5 text-end">
                            <p className="inline-flex items-center gap-1 text-sm font-semibold text-text-primary tabular-nums">
                              <Rial /> {money(amount ?? bill.totalIncludingVat)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-text-quaternary">
                              {amount === null
                                ? t('recurringBills.detail.expectedAmount')
                                : (run.variancePercent ?? 0) === 0
                                  ? t('recurringBills.detail.sameAsUsual')
                                  : t('recurringBills.detail.onUsual', {
                                      percent: formatVariance(run.variancePercent),
                                    })}
                            </p>
                          </td>
                          <td className="py-3.5 ps-4">
                            {run.paidOn ? (
                              <span
                                className={[
                                  'inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium leading-[1.3]',
                                  CHIP_TONE.ok,
                                ].join(' ')}
                              >
                                {t('supplierDetail.paidOn', { date: day(run.paidOn) })}
                              </span>
                            ) : due ? (
                              <span
                                className={[
                                  'inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium leading-[1.3]',
                                  amount === null ? CHIP_TONE.muted : CHIP_TONE.ok,
                                ].join(' ')}
                              >
                                {t('recurringBills.detail.dueOn', { date: day(due) })}
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-text-quaternary">
                                {t('recurringBills.detail.onArrival')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </RowsView>
            ) : null}
          </Card>

          <Card title={t('recurringBills.detail.activityTitle')}>
            {activity.length === 0 ? (
              <p className="text-sm font-medium text-text-quaternary">
                {t('recurringBills.detail.noRuns')}
              </p>
            ) : null}
            <ol className="flex flex-col">
              {activity.map((event, index) => (
                <li key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={[
                        'flex size-7 shrink-0 items-center justify-center rounded-full',
                        event.tone === 'current' ? 'bg-primary-50' : 'bg-success-100',
                      ].join(' ')}
                    >
                      <img
                        src={event.tone === 'current' ? actCalIcon : matchOkIcon}
                        alt=""
                        className="size-3.5"
                      />
                    </span>
                    {index < activity.length - 1 ? (
                      <span className="w-px flex-1 bg-border-subtle" />
                    ) : null}
                  </div>
                  <div className="pb-5">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {t(`${event.key}`, event.values)}
                    </p>
                    {event.detail === false ? null : (
                      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(`${event.key}Detail`, {
                          ...event.values,
                          who: whoName ?? t('recurringBills.form.nobody'),
                        })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <Card title={t('recurringBills.detail.whatExpects')}>
            <Rows
              items={[
                [
                  t('recurringBills.detail.howOften'),
                  t(`recurringBills.interval.${bill.interval}`),
                ],
                [
                  t(
                    bill.mode === 'RAISE'
                      ? 'recurringBills.detail.nextRaised'
                      : 'recurringBills.form.arrivesAround',
                  ),
                  bill.mode === 'RAISE'
                    ? bill.nextRunDate
                      ? day(bill.nextRunDate)
                      : t('recurringBills.state.noNextRun')
                    : bill.arrivesAroundDay
                      ? bill.interval === 'WEEKLY'
                        ? cadenceText
                        : t('recurringBills.detail.theDay', {
                            day: ordinal(bill.arrivesAroundDay, language),
                          })
                      : t('recurringBills.kpi.nothing'),
                ],
                [
                  t('recurringBills.detail.paymentDue'),
                  bill.paymentDueDay
                    ? t('recurringBills.form.ofNextMonth', {
                        day: ordinal(bill.paymentDueDay, language),
                      })
                    : t('recurringBills.form.onArrival'),
                ],
                [t('recurringBills.form.usualAmount'), `OMR ${money(bill.totalIncludingVat)}`],
                [
                  t('recurringBills.detail.flagIfOutside'),
                  band
                    ? `${money(band.low)} – ${money(band.high)}`
                    : t('recurringBills.detail.off'),
                ],
              ]}
            />
            <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
              {t(
                bill.mode === 'RAISE'
                  ? 'recurringBills.detail.doesCreate'
                  : 'recurringBills.detail.doesNotCreate',
              )}
            </p>
          </Card>

          <Card title={t('recurringBills.detail.whenItTells')}>
            <Rows
              items={[
                [
                  t('recurringBills.detail.ifNothingArrives'),
                  bill.lateAfterDays === null
                    ? t('recurringBills.detail.off')
                    : bill.lateAfterDays === 0
                      ? t('recurringBills.form.straightAway')
                      : t('recurringBills.form.afterDays', { count: bill.lateAfterDays }),
                ],
                [
                  t('recurringBills.detail.ifAmountOff'),
                  t(flagsRange ? 'recurringBills.detail.on' : 'recurringBills.detail.off'),
                ],
                [
                  t('recurringBills.form.autoApprove'),
                  t(
                    bill.autoApproveWithinRange
                      ? 'recurringBills.detail.on'
                      : 'recurringBills.detail.off',
                  ),
                ],
                [
                  t('recurringBills.form.whoGetsTold'),
                  whoName ??
                    (bill.notifyUserId
                      ? t('recurringBills.form.someone')
                      : t('recurringBills.form.nobody')),
                ],
              ]}
            />
          </Card>

          <Card title={t('recurringBills.detail.trackRecord')}>
            <Rows
              items={[
                [
                  t('recurringBills.detail.billsMatched'),
                  t('recurringBills.detail.ofPeriods', {
                    count: record.matched,
                    total: record.periods,
                  }),
                ],
                [
                  t('recurringBills.detail.arrivedOnTime'),
                  t('recurringBills.detail.ofPeriods', {
                    count: record.onTime,
                    total: record.matched,
                  }),
                ],
                [
                  t('recurringBills.detail.everChanged'),
                  record.changed === 0
                    ? t('recurringBills.detail.never')
                    : t('recurringBills.detail.times', { count: record.changed }),
                ],
                [t('recurringBills.detail.paidThisYear'), `OMR ${money(record.paidThisYear)}`],
                [t('recurringBills.detail.costPerYear'), `OMR ${money(record.costPerYear)}`],
              ]}
            />
          </Card>

          <Card title={t('recurringBills.detail.supplier')}>
            {supplier.read.status === 'loading' ? <LoadingNotice /> : null}
            <Rows
              items={[
                [t('billDetail.supplier.name'), supplierProfile?.displayName ?? bill.supplierName],
                [
                  t('billDetail.supplier.vat'),
                  supplierProfile?.vatNumber ?? t('recurringBills.detail.notOnFile'),
                ],
                [
                  t('recurringBills.detail.sendsBillsBy'),
                  supplierProfile?.receivingChannel
                    ? t(
                        (Object.hasOwn(CHANNEL_KEY, supplierProfile.receivingChannel) ? CHANNEL_KEY[supplierProfile.receivingChannel] : undefined) ??
                          'recurringBills.detail.notOnFile',
                      )
                    : t('recurringBills.detail.notOnFile'),
                ],
                [
                  t('recurringBills.detail.contact'),
                  supplierProfile?.emailRecipients?.[0] ??
                    supplierProfile?.telephone ??
                    t('recurringBills.detail.notOnFile'),
                ],
              ]}
            />
            {supplierProfile ? (
              <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={peppolIcon} alt="" className="mt-px size-4 shrink-0" />
                {t(
                  supplierProfile.registeredOnPeppol
                    ? 'recurringBills.detail.onPeppol'
                    : 'recurringBills.detail.notOnPeppol',
                )}
              </p>
            ) : null}
            {bill.supplierId ? (
              <Link
                to={`/suppliers/${bill.supplierId}`}
                className="mt-3 inline-block text-sm font-semibold text-primary-700 hover:underline"
              >
                {t('recurringBills.detail.openSupplier')}
              </Link>
            ) : null}
          </Card>
        </aside>
      </div>

      {receiving !== null ? (
        <ReceivedDialog
          path={receivableBillsPath(id, receiving.expectedOn)}
          expectedOn={receiving.expectedOn}
          busy={busy}
          onPick={(picked) => void markReceived(picked.billId)}
          onClose={() => setReceiving(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * "Mark as received": which of the supplier's bills was this period's. The frame draws the button
 * and no dialog, so this is the bill page's "match to a purchase order" dialog with bills in it:
 * the same shell, the same one-press rows (number, date, amount), the same empty line.
 */
function ReceivedDialog({
  path,
  expectedOn,
  busy,
  onPick,
  onClose,
}: {
  path: string
  expectedOn: string | null
  busy: boolean
  onPick: (bill: ReceivableBillDto) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const bills = useApiRead<ReceivableBillDto[]>(path, () => loadReceivableBills(path))
  return (
    <Modal
      open
      onClose={onClose}
      title={t('recurringBills.detail.markReceived')}
      subtitle={
        expectedOn
          ? t('recurringBills.detail.expectedOn', { date: formatDate(expectedOn, language) })
          : undefined
      }
    >
      <div className="max-h-[320px] overflow-y-auto">
        {bills.read.status === 'loading' ? <LoadingNotice /> : null}
        {bills.read.status === 'failed' ? (
          <ApiReadFailure error={bills.read.error} retry={bills.retry} />
        ) : null}
        {bills.read.status === 'ready' && bills.read.data.length === 0 ? (
          <p className="py-6 text-center text-sm font-medium text-text-quaternary">
            {t('recurringBills.empty')}
          </p>
        ) : null}
        {bills.read.status === 'ready'
          ? bills.read.data.map((candidate) => (
              <button
                key={candidate.billId}
                type="button"
                disabled={busy}
                onClick={() => onPick(candidate)}
                className="flex w-full items-center justify-between gap-3 border-b border-surface-background px-1 py-3 text-start transition-colors last:border-b-0 hover:bg-primary-25 disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-semibold text-text-primary">
                    {candidate.billNumber?.trim() || t('paymentRuns.unnumbered')}
                  </span>
                  <span className="block text-xs font-medium text-text-quaternary">
                    {[
                      candidate.issueDate ? formatDate(candidate.issueDate, language) : null,
                      candidate.variancePercent === null
                        ? null
                        : candidate.variancePercent === 0
                          ? t('recurringBills.detail.sameAsUsual')
                          : t('recurringBills.detail.onUsual', {
                              percent: formatVariance(candidate.variancePercent),
                            }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {candidate.totalIncludingVat === null ? null : (
                  <span className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                    <Rial />
                    {formatAmount(candidate.totalIncludingVat, candidate.currencyCode, language)}
                  </span>
                )}
              </button>
            ))
          : null}
      </div>
    </Modal>
  )
}
