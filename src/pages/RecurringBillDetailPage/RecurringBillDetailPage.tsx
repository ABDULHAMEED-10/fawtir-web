import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  chaseRecurringBill,
  loadRecurringBill,
  loadRecurringRuns,
  recurringBillPath,
  recurringRunsPath,
  setRecurringActive,
  type RecurringBillDto,
  type RecurringRunDto,
} from '../../api/expenditure/recurringBills'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { RECURRING_REFUSALS, chaseBlocker, formatVariance, stateNote, toneOf } from '../../lib/recurringBills'
import chevronIcon from '../../assets/invoices/chevron.svg'

const TONE: Record<'warn' | 'ok' | 'muted', string> = {
  warn: 'border-warning-700 text-warning-700',
  ok: 'border-success-700 text-success-700',
  muted: 'border-border-subtle text-text-tertiary',
}

/**
 * One recurring bill (E-12): what it expects, what it has done, and the two things that can be
 * done to it — pausing it, and chasing whoever is named when a bill has not turned up.
 *
 * The history is the API's own runs, one per period, so a period with no arrival is as visible as
 * one with a bill behind it. The design's twelve-month chart and activity feed are not drawn.
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
  const [notice, setNotice] = useState<{ key: string; values?: Record<string, string> } | { body: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const read = useApiRead<RecurringBillDto>(recurringBillPath(id), () => loadRecurringBill(id))
  const runsPath = recurringRunsPath(id)
  const runs = useApiRead<RecurringRunDto[]>(runsPath, () => loadRecurringRuns(runsPath))

  if (read.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {read.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={read.read.error} retry={read.retry} />}
      </div>
    )
  }

  const bill = read.read.data
  const note = stateNote(bill)
  const blocker = chaseBlocker(bill)
  const money = (value: number | null) => (value === null ? '—' : formatAmount(value, bill.currencyCode, language))
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')

  const failed = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : null
    if (code && RECURRING_REFUSALS[code]) {
      setNotice({ key: RECURRING_REFUSALS[code] })
      return
    }
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
  }

  const act = async (what: 'toggle' | 'chase') => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (what === 'toggle') {
        await setRecurringActive(id, !bill.active)
        setNotice({ key: bill.active ? 'recurringBills.done.paused' : 'recurringBills.done.resumed' })
      } else {
        await chaseRecurringBill(id)
        setNotice({ key: 'recurringBills.done.chased' })
      }
      read.retry()
      runs.retry()
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/expenditure/recurring-bills" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700">
          {t('recurringBills.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{bill.description}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{bill.description}</h1>
        <span className={['inline-flex h-[31px] items-center rounded-full border px-3 text-sm font-semibold', TONE[toneOf(bill)]].join(' ')}>
          {t(note.key, note.values ? { ...note.values, date: note.values.date ? day(String(note.values.date)) : undefined } : undefined)}
        </span>
        <div className="ms-auto flex flex-wrap items-center gap-3">
          {canManage ? (
            <>
              <Link
                to={`/expenditure/recurring-bills/${bill.id}/edit`}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
              >
                {t('recurringBills.menu.edit')}
              </Link>
              <button
                type="button"
                onClick={() => void act('toggle')}
                disabled={busy}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
              >
                {t(bill.active ? 'recurringBills.menu.pause' : 'recurringBills.menu.resume')}
              </button>
              <button
                type="button"
                onClick={() => void act('chase')}
                disabled={busy || blocker !== null}
                title={blocker ? t(blocker) : undefined}
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
              >
                {t('recurringBills.actions.chase')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {notice ? <Notice body={'key' in notice ? t(notice.key, notice.values) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}
      {canManage && blocker ? <p className="text-xs font-medium text-text-quaternary">{t(blocker)}</p> : null}

      <section className="rounded-md bg-surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{t('recurringBills.detail.usually')}</p>
            <OmAmount
              size="lg"
              amount={money(bill.totalIncludingVat)}
              className="mt-1.5"
              amountClassName="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums"
            />
            <p className="mt-1 text-sm font-medium text-text-quaternary">
              {bill.supplierName} · {t(`recurringBills.interval.${bill.interval}`)} · {t(`recurringBills.mode.${bill.mode}`)}
            </p>
          </div>
          {bill.expectation ? (
            <div className="text-end">
              <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{t('recurringBills.detail.lastArrived')}</p>
              <p className="mt-1.5 text-sm font-semibold text-text-primary">
                {bill.expectation.lastArrivedOn ? `${day(bill.expectation.lastArrivedOn)} · ${money(bill.expectation.lastArrivedAmount)}` : t('recurringBills.detail.nothingYet')}
              </p>
              {bill.expectation.variancePercent !== null ? (
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('recurringBills.detail.variance', { percent: formatVariance(bill.expectation.variancePercent) })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t('recurringBills.detail.nextExpected')} value={day(bill.nextRunDate)} />
          <Fact label={t('recurringBills.detail.watchedSince')} value={day(bill.watchingFrom)} />
          <Fact label={t('recurringBills.detail.tolerance')} value={bill.tolerancePercent === null ? '—' : `${bill.tolerancePercent}%`} />
          <Fact label={t('recurringBills.detail.lateAfter')} value={bill.lateAfterDays === null ? '—' : t('recurringBills.detail.days', { count: bill.lateAfterDays })} />
          <Fact label={t('recurringBills.detail.paymentTerms')} value={t('recurringBills.detail.days', { count: bill.paymentTermsDays })} />
          <Fact label={t('recurringBills.detail.category')} value={bill.category ?? '—'} />
          <Fact label={t('recurringBills.detail.theirReference')} value={bill.theirReference ?? '—'} />
          <Fact label={t('recurringBills.detail.endsOn')} value={day(bill.endDate)} />
        </div>
      </section>

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-background px-5 py-4">
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('recurringBills.detail.history')}</h2>
          <p className="text-xs font-medium text-text-quaternary">{t('recurringBills.detail.historyNote')}</p>
        </div>
        {runs.read.status === 'loading' ? <LoadingNotice /> : null}
        {runs.read.status === 'failed' ? <ApiReadFailure error={runs.read.error} retry={runs.retry} /> : null}
        {runs.read.status === 'ready' ? (
          runs.read.data.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm font-medium text-text-quaternary">{t('recurringBills.detail.noRuns')}</p>
          ) : (
            <RowsView>
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    {(['period', 'expected', 'outcome', 'variance', 'bill'] as const).map((key) => (
                      <th key={key} className="px-5 py-3 text-start font-semibold">
                        {t(`recurringBills.runCol.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.read.data.map((run) => (
                    <tr key={run.id} className="border-b border-surface-background last:border-0">
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">
                        {run.periodStart && run.periodEnd ? `${day(run.periodStart)} – ${day(run.periodEnd)}` : day(run.runDate)}
                      </td>
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">{day(run.expectedOn)}</td>
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">
                        {t(`recurringBills.outcome.${run.outcome}`)}
                        {run.failureReason ? <span className="mt-1 block text-xs font-medium text-warning-700">{run.failureReason}</span> : null}
                      </td>
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary tabular-nums">{formatVariance(run.variancePercent)}</td>
                      <td className="px-5 py-4 align-top text-sm font-medium">
                        {run.billId ? (
                          <Link to={`/expenditure/bills/${run.billId}`} className="font-semibold text-primary-700 hover:underline">
                            {t('recurringBills.detail.openBill')}
                          </Link>
                        ) : (
                          <span className="text-text-quaternary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RowsView>
          )
        ) : null}
      </section>

      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('recurringBills.sweepNote')}</p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-text-primary">{value}</p>
    </div>
  )
}
