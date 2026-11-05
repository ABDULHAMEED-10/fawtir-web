import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  currencyExceptionsPath,
  type PosCurrencyExceptionShift,
  type PosCurrencyExceptions,
} from '../../api/pos/pos'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { DateField } from '../../components/ui'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { AppShell } from '../../layouts/AppShell'
import { formatAmount, formatDate } from '../../lib/format'
import { hasPermission } from '../../lib/identity/entitlements'
import { muscatToday } from '../../lib/pos'
import { offlineHoldTime as when } from '../../lib/posOfflineHolds'

const card = 'rounded-md bg-surface-card p-6'
const button =
  'inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'

const DAY_MS = 24 * 3_600_000

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The shifts whose drawer figure the server withholds because their cash is in more than one
 * currency, or in none recorded (FIN-2a-REPORT, backend cb02428c7). Coordinator rules: a withheld
 * figure is "Not available", never 0; a movement with no currency is "currency unknown" and carries
 * no currency sign; nothing is totalled across shifts or currencies; a cut list says so.
 */
export function PosCurrencyExceptionsPage() {
  return (
    <AppShell>
      <Report />
    </AppShell>
  )
}

function Report() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  const { branch } = useWorkingBranch()
  const today = muscatToday()
  // The range is the server's to judge (at most 92 days, POS_REPORT_RANGE_INVALID): the default
  // stays well inside it, and a range the server refuses is worded rather than guessed at here.
  const [draft, setDraft] = useState({ from: daysBefore(today, 30), to: today })
  const [range, setRange] = useState(draft)
  const allowed = !!entitlements && hasPermission(entitlements, 'pos.read')
  const report = useApiRead<PosCurrencyExceptions>(
    allowed ? currencyExceptionsPath(range.from, range.to, branch?.id ?? null) : null,
  )

  if (!ready) return <LoadingNotice />
  if (!allowed) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <p className={card}>{t('pos.currencyExceptions.notAllowed')}</p>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
        {t('pos.currencyExceptions.title')}
      </h1>
      <p className="text-sm text-text-tertiary">{t('pos.currencyExceptions.intro')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
          <span>{t('pos.currencyExceptions.from')}</span>
          <DateField
            value={draft.from}
            max={today}
            ariaLabel={t('pos.currencyExceptions.from')}
            onChange={(value) => value && setDraft((now) => ({ ...now, from: value }))}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
          <span>{t('pos.currencyExceptions.to')}</span>
          <DateField
            value={draft.to}
            max={today}
            ariaLabel={t('pos.currencyExceptions.to')}
            onChange={(value) => value && setDraft((now) => ({ ...now, to: value }))}
          />
        </div>
        <button type="button" className={button} onClick={() => setRange(draft)}>
          {t('pos.currencyExceptions.show')}
        </button>
      </div>
      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? (
        report.read.error instanceof ApiError && report.read.error.code === 'POS_REPORT_RANGE_INVALID' ? (
          <p role="alert" className={card}>
            {t('pos.currencyExceptions.rangeInvalid')}
          </p>
        ) : (
          <ApiReadFailure error={report.read.error} retry={report.retry} />
        )
      ) : null}
      {report.read.status === 'ready' ? (
        <>
          {report.read.data.truncated ? (
            <p role="status" className="rounded-sm bg-pending-100 px-3 py-3 text-sm font-medium text-pending-700">
              {t('pos.currencyExceptions.truncated')}
            </p>
          ) : null}
          {report.read.data.shifts.length === 0 ? (
            <p className={card}>{t('pos.currencyExceptions.none')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {report.read.data.shifts.map((shift) => (
                <li key={shift.shiftId} className={card}>
                  <ShiftRow shift={shift} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}

function ShiftRow({ shift }: { shift: PosCurrencyExceptionShift }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const notAvailable = t('pos.currencyExceptions.notAvailable')
  // A figure in a known currency is formatted to that currency's places and labelled with its code;
  // one with no currency, or a close summed across currencies, is printed as sent, with no sign.
  const money = (value: number | null | undefined, currency: string | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return notAvailable
    return currency ? `${formatAmount(value, currency, language)} ${currency}` : String(value)
  }
  return (
    <div className="flex flex-col gap-3 text-sm text-text-secondary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-text-primary">
          {t('pos.currencyExceptions.shift', {
            till: shift.tillNumber,
            date: formatDate(shift.businessDate, language),
          })}
        </p>
        <span>{t(`pos.currencyExceptions.status.${shift.status}`)}</span>
      </div>
      <p>
        {shift.cashier?.name ?? t('pos.currencyExceptions.cashierUnknown')} ·{' '}
        {t('pos.currencyExceptions.opened', { at: when(shift.openedAt) })}
        {shift.endedAt ? ` · ${t('pos.currencyExceptions.ended', { at: when(shift.endedAt) })}` : ''}
      </p>
      <p className="font-medium text-text-primary">
        {shift.state === 'POS_SHIFT_CURRENCY_MIXED'
          ? t('pos.currencyExceptions.mixed', { currencies: shift.currencies.join(', ') || notAvailable })
          : t('pos.currencyExceptions.unrecorded', { movements: shift.unrecordedMovements })}
      </p>
      <table className="w-full text-start">
        <thead>
          <tr className="text-text-tertiary">
            <th className="py-1 text-start font-medium">{t('pos.currencyExceptions.currency')}</th>
            <th className="py-1 text-start font-medium">{t('pos.currencyExceptions.paidIn')}</th>
            <th className="py-1 text-start font-medium">{t('pos.currencyExceptions.paidOut')}</th>
            <th className="py-1 text-start font-medium">{t('pos.currencyExceptions.movements')}</th>
          </tr>
        </thead>
        <tbody>
          {shift.cash.map((row, index) => {
            const currency = row.currencyRecorded && row.currency ? row.currency : null
            return (
              <tr key={`${row.currency ?? 'none'}-${index}`}>
                <td className="py-1">{currency ?? t('pos.currencyExceptions.currencyUnknown')}</td>
                <td className="py-1">{money(row.paidIn, currency)}</td>
                <td className="py-1">{money(row.paidOut, currency)}</td>
                <td className="py-1">{row.movements}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {shift.storedClose ? (
        <div className="flex flex-col gap-1 rounded-sm bg-surface-background p-3">
          <p className="font-medium text-text-primary">
            {t('pos.currencyExceptions.storedClose', { at: when(shift.storedClose.closedAt) })}
          </p>
          <p className="text-text-tertiary">{t('pos.currencyExceptions.storedCloseNote')}</p>
          <p>
            {t('pos.currencyExceptions.expected')}: {money(shift.storedClose.expectedCash, null)} ·{' '}
            {t('pos.currencyExceptions.counted')}: {money(shift.storedClose.countedCash, null)} ·{' '}
            {t('pos.currencyExceptions.overShort')}: {money(shift.storedClose.overShort, null)}
          </p>
        </div>
      ) : null}
    </div>
  )
}
