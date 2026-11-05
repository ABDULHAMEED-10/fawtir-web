import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { PosFootNote } from './PosFootNote'
import { PosTillGate } from './PosTillGate'
import { TillMoneyInput } from './TillMoneyInput'
import { CashIcon, CheckIcon, ClockIcon } from './posIcons'
import { omr, omrSigned, tillTime, toBaisa } from '../../lib/pos'
import { parseBaisa } from '../../lib/posPayment'
import { formatAmount } from '../../lib/format'
import {
  DENOMINATIONS,
  SHORT_REASONS,
  closeRequest,
  countedTotal,
  denominationLabel,
  figuresOf,
  parseSignedBaisa,
  startingCount,
  type Counted,
} from '../../lib/posClose'
import { posRefusalKey, refusalValues } from '../../lib/posRefusals'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api/errors'
import {
  addCashMovement,
  closePosShift,
  closePreviewPath,
  newPosKey,
  recordPaidOut,
  setShiftFloat,
  uploadPaidOutReceipt,
  type OverShortReason,
  type PosPaidOutCategory,
  type PosPaidOutClass,
  type PosPaidOutRequest,
  type PosCashMovementDto,
  type PosClosePreviewDto,
  type PosShiftCloseDto,
} from '../../api/pos/pos'
import type { TillState } from '../../lib/posTill'
import {
  PAID_OUT_CATEGORIES,
  choosableClasses,
  dropsHeldReceipt,
  fixedClass,
  keyForAttempt,
  loadPaidOutStore,
  outcomeUnknown,
  paidOutGap,
  paidOutRefusal,
  paidOutRequest,
  isLocked,
  pendingBody,
  receiptProblem,
  savePaidOutStore,
  unlockWaitMs,
  type PaidOutStore,
} from '../../lib/posPaidOut'
import { apiRequest } from '../../api/client'
import { fitForUpload } from '../../lib/billUpload'
import { CURRENCIES } from '../../lib/billIntake'
import { billListPath, loadBillPage, type BillRowDto } from '../../api/expenditure/bills'
import {
  flushBeforeShiftEnd,
  queuedFor,
  useQueuedSales,
  type ShiftEndFlush,
} from '../../lib/posQueue'

type Ready = Extract<TillState, { status: 'ready' }>

const FIELD =
  'h-11 w-full rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand'

function Line({
  label,
  note,
  value,
  tone,
  icon,
}: {
  label: string
  note?: string
  value: string
  tone?: 'add' | 'take' | 'sum'
  icon?: ReactNode
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-border-subtle px-5 last:border-b-0',
        // The total sits on a grey band, a step larger, as the frame draws it.
        tone === 'sum' ? 'rounded-b-md bg-surface-tab-bar py-4' : 'py-3.5',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
          tone === 'take'
            ? 'bg-danger-100 text-danger-700'
            : tone === 'add'
              ? 'bg-success-100 text-success-700'
              : tone === 'sum'
                ? 'bg-white text-text-tertiary'
                : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {icon ?? (tone === 'take' ? '−' : tone === 'add' ? '+' : '=')}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block font-medium text-text-primary',
            tone === 'sum' ? 'text-base' : 'text-sm',
          ].join(' ')}
        >
          {label}
        </span>
        {note ? (
          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">{note}</span>
        ) : null}
      </span>
      <span
        dir="ltr"
        className={[
          'shrink-0 font-semibold tabular-nums',
          tone === 'sum' ? 'text-lg' : 'text-base',
          tone === 'take'
            ? 'text-danger-700'
            : tone === 'add'
              ? 'text-success-700'
              : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Closing the till (Figma 143:20055): the shift on this till, its close preview, the count, the
 * card check against the bank machine and the close itself (`POST .../close`, once per shift).
 */
export function PosClosePage() {
  return (
    <AppShell>
      <PosTillGate>
        {(till) =>
          till.till.openShift ? (
            <CloseShift till={till} shiftId={till.till.openShift.shiftId} />
          ) : (
            <NothingOpen closed={justClosed?.tillId === till.till.id ? justClosed.closed : null} />
          )
        }
      </PosTillGate>
    </AppShell>
  )
}

/**
 * The close this tab just made, kept for the screen that follows it: once the shift is closed the
 * till has no open shift and the form gives way, so the confirmation is shown there instead of the
 * page jumping straight to "No shift is open" (E2E 29 Oct 2026, F-13).
 */
let justClosed: { tillId: string; closed: PosShiftCloseDto } | null = null

/** No shift is open on this till: nothing to count (the next sale opens one). */
function NothingOpen({ closed }: { closed: PosShiftCloseDto | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  if (closed) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <Link
          to="/pos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
        >
          ‹ {t('pos.backToTill')}
        </Link>
        <section className="flex flex-col gap-4 rounded-md bg-surface-card px-6 py-5">
          <p className="flex items-center gap-2 rounded-sm bg-success-100 px-3 py-3 text-sm font-medium text-success-700">
            <CheckIcon className="size-4 shrink-0" />
            {t('pos.close.closedAt', { time: tillTime(closed.closedAt, locale) })}
          </p>
          <div className="flex flex-col">
            <Sum
              money
              label={t('pos.close.summary.counted')}
              value={omr(toBaisa(closed.countedCash))}
            />
            <Sum
              money
              label={t('pos.close.summary.expected')}
              value={omr(toBaisa(closed.expectedCash))}
            />
            <Sum money label={t('pos.close.summary.toBank')} value={omr(toBaisa(closed.toBank))} />
            <Sum
              money
              label={t('pos.close.summary.floatLeft')}
              value={omr(toBaisa(closed.floatLeft))}
            />
            {closed.cardTerminalDifference != null && closed.cardTerminalDifference !== 0 ? (
              <Sum
                tone="watch"
                label={t('pos.close.summary.cardDiffers')}
                value={omrSigned(toBaisa(closed.cardTerminalDifference))}
              />
            ) : null}
          </div>
          <div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.close.printSummary')}
            </button>
          </div>
        </section>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToTill')}
      </Link>
      <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('pos.close.noShift')}
      </p>
    </div>
  )
}

function NotYourShift({ error }: { error: ApiError }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToTill')}
      </Link>
      <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(posRefusalKey(error))}
      </p>
    </div>
  )
}

function CloseShift({ till, shiftId }: { till: Ready; shiftId: string }) {
  const preview = useApiRead<PosClosePreviewDto>(closePreviewPath(shiftId))
  // Kept here, above the form, because the form is remounted by the reload that follows a send.
  const [sentBeforeClose, setSentBeforeClose] = useState(0)
  // Likewise the paid-out in flight: a reload while its outcome is unknown must not cost its key
  // or its uploaded receipt, or the retry would be a second paid-out (FIN-M3). Read once from the
  // tab's storage, so a page reload keeps them too (review W4-2).
  const paidOut = useRef<PaidOutStore | null>(null)
  if (paidOut.current === null) paidOut.current = loadPaidOutStore(till.till.id, shiftId)
  if (preview.read.status === 'loading') return <LoadingNotice />
  if (preview.read.status === 'failed') {
    // The till's open shift is someone else's (`pos.close` with OWN): not a missing permission.
    if (preview.read.error instanceof ApiError && preview.read.error.code === 'POS_SHIFT_NOT_OWN') {
      return <NotYourShift error={preview.read.error} />
    }
    return <ApiReadFailure error={preview.read.error} retry={preview.retry} />
  }
  return (
    <CloseForm
      till={till}
      preview={preview.read.data}
      reload={preview.retry}
      paidOut={paidOut.current as PaidOutStore}
      sentBeforeClose={sentBeforeClose}
      onSent={(count) => {
        setSentBeforeClose((before) => before + count)
        preview.retry()
      }}
    />
  )
}

function CloseForm({
  till,
  preview,
  reload,
  paidOut,
  sentBeforeClose,
  onSent,
}: {
  till: Ready
  preview: PosClosePreviewDto
  reload: () => void
  paidOut: PaidOutStore
  sentBeforeClose: number
  /** Sales were filed: the expected cash on screen no longer includes everything the server has. */
  onSent: (count: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const figures = figuresOf(preview)
  const [byNote, setByNote] = useState(false)
  const [total, setTotal] = useState<number | null>(startingCount(figures.expected))
  const [counted, setCounted] = useState<Counted>({})
  const [reason, setReason] = useState<OverShortReason | null>(null)
  const [note, setNote] = useState('')
  // A net card figure below zero is not prefilled: RC2 takes no negative machine total, and a machine
  // may print sales and refunds apart, so the cashier types what it shows.
  const [terminalText, setTerminalText] = useState(
    figures.terminal < 0 ? '' : (figures.terminal / 1000).toFixed(3),
  )
  const [cardNote, setCardNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<unknown>(null)
  const [closed, setClosed] = useState<PosShiftCloseDto | null>(null)
  const key = useRef<{ fingerprint: string; key: string } | null>(null)
  const waiting = useQueuedSales(till.till.id)
  const [sending, setSending] = useState(false)
  const [unsent, setUnsent] = useState<ShiftEndFlush | null>(null)
  const warned = unsent !== null && waiting.length > 0
  const seenWaiting = useRef(waiting.length)

  // Any filing while this form is up changes the server's expected cash: the pre-close send, a run
  // that outlived its bound and finished after the warning, or the till's background sender. Each
  // reloads the preview, so Close anyway never closes against figures the cashier can no longer
  // trust (PRV42W-2). Held back while the pre-close send runs, so that send reloads once, at its end,
  // and while the close itself is in flight: a remount then would drop its confirmation (PRV42W-10).
  // A filing in either window is counted once busy clears, unless the close went through.
  useEffect(() => {
    if (sending || busy || closed) return
    const filed = seenWaiting.current - waiting.length
    seenWaiting.current = waiting.length
    if (filed > 0) onSent(filed)
  }, [waiting.length, sending, busy, closed, onSent])

  const cash = byNote ? countedTotal(counted) : (total ?? 0)
  const gap = cash - figures.expected
  const share = figures.cashTaken ? Math.abs(gap) / figures.cashTaken : 0
  const terminal = terminalText.trim() ? parseSignedBaisa(terminalText) : null
  const terminalNegative = terminal != null && terminal < 0
  const cardDiffers = terminal != null && terminal !== figures.terminal
  const floatLeft = Math.min(toBaisa(till.till.defaultFloat), Math.max(0, cash))
  const day = new Date(`${preview.businessDate}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const countKnown = byNote || total !== null
  const needsReason = countKnown && gap !== 0 && reason === null
  const ready =
    !busy &&
    !closed &&
    countKnown &&
    !needsReason &&
    !terminalNegative &&
    (!cardDiffers || cardNote.trim().length > 0)

  /** One bounded send of this till's waiting sales; whatever is left stays queued and is shown. */
  const sendWaiting = async (): Promise<ShiftEndFlush> => {
    if (queuedFor(till.till.id).length === 0) return { outcome: 'done', left: [] }
    setSending(true)
    try {
      return await flushBeforeShiftEnd(till.till.id, { sender: till.userId })
    } catch {
      return { outcome: 'offline', left: queuedFor(till.till.id) }
    } finally {
      setSending(false)
    }
  }

  /**
   * Null when anything was filed: the effect above reloads the preview, and the count is checked
   * against fresh figures before the shift is closed rather than against the ones the cashier saw.
   */
  const sendThenRecount = async (): Promise<ShiftEndFlush | null> => {
    const before = queuedFor(till.till.id).length
    const result = await sendWaiting()
    return before - result.left.length > 0 ? null : result
  }

  const sendAgain = async () => {
    setBusy(true)
    const result = await sendThenRecount()
    if (result) setUnsent(result)
    setBusy(false)
  }

  const close = async () => {
    setBusy(true)
    setRefusal(null)
    // A queued sale that reaches the server after this close is not in its count, and a signed one
    // is held for a manager (O-1), so the waiting ones get one bounded try first. Once the cashier
    // has been told what is left, the next press closes: the close is warned about, never stopped
    // (blocking it is not approved, batch 42 OFF-4).
    if (!warned) {
      const result = await sendThenRecount()
      if (!result || result.left.length > 0) {
        if (result) setUnsent(result)
        setBusy(false)
        return
      }
    }
    const body = closeRequest({
      byNote,
      counted,
      total: cash,
      floatLeft,
      terminal,
      terminalExpected: figures.terminal,
      cardNote,
      reason,
      overShort: gap,
      note,
    })
    const fingerprint = JSON.stringify(body)
    if (!key.current || key.current.fingerprint !== fingerprint) {
      key.current = { fingerprint, key: newPosKey('close') }
    }
    try {
      const result = await closePosShift(preview.shiftId, body, key.current.key)
      justClosed = { tillId: till.till.id, closed: result }
      setClosed(result)
      till.retry()
    } catch (error) {
      setRefusal(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToTill')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('pos.close.title')}
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('pos.close.subtitle', {
              branch: till.branchName ?? '',
              till: preview.tillNumber,
              who: preview.cashier.name ?? '',
              from: tillTime(preview.openedAt, locale),
              to: tillTime(preview.endedAt ?? preview.at, locale),
              day,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('pos.close.printSummary')}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <Kpi
          title={t('pos.close.takenToday')}
          value={omr(figures.taken)}
          note={t('pos.close.takenNote', {
            count: figures.sales,
            sales: figures.sales,
            average: omr(figures.sales ? Math.round(figures.taken / figures.sales) : 0),
          })}
        />
        <Kpi
          title={t('pos.close.cash')}
          value={omr(figures.cashTaken)}
          note={t('pos.close.cashNote', {
            percent: figures.taken ? Math.round((figures.cashTaken / figures.taken) * 100) : 0,
            count: figures.cashSales,
            sales: figures.cashSales,
          })}
        />
        <Kpi
          title={t('pos.close.card')}
          value={omr(figures.card)}
          note={t('pos.close.cardNote', { count: figures.cardSales, sales: figures.cardSales })}
        />
        <Kpi
          title={t('pos.close.onCompany')}
          value={omr(figures.onAccount)}
          note={t('pos.close.companyNote', { count: figures.companyInvoices })}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div>
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.close.countDrawer')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.close.cashOnly')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setByNote((v) => !v)}
                className="text-sm font-semibold text-primary-700"
              >
                {byNote ? t('pos.close.enterTotal') : t('pos.close.byDenomination')}
              </button>
            </div>

            <div className="flex flex-wrap gap-4 px-5 py-4">
              <div className="min-w-[260px] flex-1">
                <p className="text-xs font-semibold text-text-tertiary">
                  {t('pos.close.actuallyIn')}
                </p>
                <TillMoneyInput
                  readOnly={byNote}
                  baisa={byNote ? cash : total}
                  onBaisa={setTotal}
                  aria-label={t('pos.close.actuallyIn')}
                  className="mt-2 h-[60px] w-full rounded-sm border-2 border-primary-700 bg-primary-25 px-4 text-end text-2xl font-semibold text-text-primary outline-none"
                />
                {byNote ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {DENOMINATIONS.map((value) => (
                      <label
                        key={value}
                        className="flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-tertiary"
                      >
                        <span dir="ltr" className="shrink-0">
                          {denominationLabel(value)}
                        </span>
                        <span className="text-xs text-text-quaternary">×</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          value={String(counted[value] ?? 0)}
                          onFocus={selectAllOnFocus}
                          aria-label={t('pos.close.howMany', { note: denominationLabel(value) })}
                          onChange={(event) =>
                            setCounted((current) => ({
                              ...current,
                              [value]: Math.max(
                                0,
                                Number(event.target.value.replace(/\D/g, '')) || 0,
                              ),
                            }))
                          }
                          className="h-full w-full min-w-0 border-0 bg-transparent text-end text-sm font-semibold text-text-primary outline-none"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              <div
                className={[
                  'min-w-[260px] flex-1 rounded-sm p-4',
                  countKnown && gap === 0 ? 'bg-success-100' : 'bg-pending-100',
                ].join(' ')}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                  {!countKnown
                    ? t('pos.close.notCounted')
                    : gap === 0
                      ? t('pos.close.balances')
                      : gap < 0
                        ? t('pos.close.shortBy')
                        : t('pos.close.overBy')}
                </p>
                <p
                  className={[
                    'mt-1 inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-none',
                    gap === 0 ? 'text-success-700' : 'text-pending-700',
                  ].join(' ')}
                >
                  <Rial />
                  {countKnown ? omr(Math.abs(gap)) : omr(0)}
                </p>
                {countKnown && gap !== 0 ? (
                  <p className="mt-2 text-xs font-medium leading-[1.6] text-text-tertiary">
                    {t('pos.close.shortStory', {
                      expected: omr(figures.expected),
                      counted: omr(cash),
                      percent: (share * 100).toFixed(1),
                    })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="border-t border-border-subtle">
              <Line
                label={t('pos.close.float')}
                note={t('pos.close.floatNote', { time: tillTime(preview.openedAt, locale) })}
                value={omr(figures.float)}
                icon={<CashIcon className="size-4" />}
              />
              <Line
                label={t('pos.close.cashTaken')}
                note={t('pos.close.cashTakenNote', { count: figures.cashSales, sales: figures.cashSales })}
                value={`+${omr(figures.cashTaken)}`}
                tone="add"
              />
              {figures.cashTips ? (
                <Line
                  label={t('pos.close.cashTips')}
                  value={`+${omr(figures.cashTips)}`}
                  tone="add"
                />
              ) : null}
              {figures.paidIn ? (
                <Line label={t('pos.close.paidIn')} value={`+${omr(figures.paidIn)}`} tone="add" />
              ) : null}
              <Line
                label={t('pos.close.refundedInCash')}
                value={omrSigned(-figures.cashRefunded)}
                tone="take"
              />
              <Line
                label={t('pos.close.paidOut')}
                note={preview.movements
                  .filter((movement) => movement.type === 'PAID_OUT' && movement.note)
                  .map((movement) => movement.note)
                  .join(' · ')}
                value={omrSigned(-figures.paidOut)}
                tone="take"
              />
              <Line label={t('pos.close.shouldHold')} value={omr(figures.expected)} tone="sum" />
              {/* Shown beside the expected figure, never added to it (FIN option (i)): a counted
                  close that includes this cash records the over, and this line explains it. */}
              {(preview.lateCashFromHandedOverShift ?? 0) > 0 ? (
                <Line
                  label={t('pos.close.lateCash', {
                    amount: omr(toBaisa(preview.lateCashFromHandedOverShift ?? 0)),
                  })}
                  note={t('pos.close.lateCashHint')}
                  value=""
                />
              ) : null}
            </div>
          </section>

          <CashMovements
            shiftId={preview.shiftId}
            tillId={till.till.id}
            canSetFloat={preview.salesCount === 0}
            canPayIn={till.can.close}
            canPayOut={till.can.payOut}
            canLinkBill={till.can.billSettle}
            paidOut={paidOut}
            onRecorded={reload}
          />

          {gap !== 0 ? (
            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-5 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {gap < 0 ? t('pos.close.whyShort') : t('pos.close.whyOver')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.close.guessIsFine')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 px-5 py-4 max-md:grid-cols-1">
                {SHORT_REASONS.map((option) => {
                  const chosen = option.id === reason
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setReason(option.id)}
                      aria-pressed={chosen}
                      className={[
                        'flex items-start gap-3 rounded-md border px-4 py-3.5 text-start transition-colors',
                        chosen
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                          chosen ? 'border-primary-700' : 'border-border-default',
                        ].join(' ')}
                      >
                        {chosen ? <span className="size-2 rounded-full bg-primary-700" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={[
                            'text-sm font-semibold',
                            chosen ? 'text-primary-800' : 'text-text-primary',
                          ].join(' ')}
                        >
                          {t(option.labelKey)}
                        </span>{' '}
                        <span className="text-xs font-medium text-text-quaternary">
                          {t(option.noteKey)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="px-5 pb-5">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('pos.close.anythingToAdd')}
                  className="w-full resize-none rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.close.looseEnds')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.close.beforeClosing')}
              </p>
            </div>
            <ul>
              {preview.looseEnds.onAccountOpen.count > 0 ? (
                <LooseEnd
                  done={false}
                  title={t('pos.close.tabsOpen', { count: preview.looseEnds.onAccountOpen.count })}
                  note={withRial(
                    t('pos.close.tabsNoteLive', {
                      amount: `OMR ${omr(toBaisa(preview.looseEnds.onAccountOpen.amount))}`,
                    }),
                  )}
                />
              ) : null}
              {/* This device's queue, which the server cannot see: notYetAccepted below counts only
                  sales it already has. */}
              {waiting.length > 0 ? (
                <LooseEnd
                  done={false}
                  title={t('pos.pendingSync.closeTitle', { count: waiting.length })}
                  note={
                    <>
                      {t('pos.pendingSync.closeNote')}
                      <span dir="ltr" className="mt-1 block">
                        {waiting.map((entry) => entry.number).join(', ')}
                      </span>
                      {waiting.some((entry) => entry.refusal) ? (
                        <span className="mt-1 block">
                          {t('pos.pendingSync.someRefused', {
                            count: waiting.filter((entry) => entry.refusal).length,
                          })}
                        </span>
                      ) : null}
                    </>
                  }
                />
              ) : null}
              <LooseEnd
                done={preview.looseEnds.notYetAccepted === 0}
                title={
                  preview.looseEnds.notYetAccepted === 0
                    ? t('pos.close.allFiled')
                    : t('pos.close.notYetFiled', { count: preview.looseEnds.notYetAccepted })
                }
                note={
                  preview.looseEnds.notYetAccepted === 0
                    ? t('pos.close.allFiledNote', { count: preview.salesCount })
                    : t('pos.close.notYetFiledNote')
                }
              />
              {/* The card check against the bank machine's end-of-day report (owner, 27 Oct 2026). */}
              <li className="flex flex-wrap items-start gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0">
                <span
                  className={[
                    'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
                    cardDiffers
                      ? 'bg-pending-100 text-pending-700'
                      : 'bg-success-100 text-success-700',
                  ].join(' ')}
                >
                  {cardDiffers ? (
                    <ClockIcon className="size-4" />
                  ) : (
                    <CheckIcon className="size-4" />
                  )}
                </span>
                <span className="flex min-w-[200px] flex-1 flex-col gap-2">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('pos.close.terminalTotal')}
                  </span>
                  <span className="block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {withRial(
                      figures.terminal < 0
                        ? t('pos.close.terminalNetNote', {
                            gross: `OMR ${omr(figures.terminal + figures.cardRefunded)}`,
                            refunds: `OMR ${omr(figures.cardRefunded)}`,
                            net: `OMR ${omrSigned(figures.terminal)}`,
                            payments: preview.looseEnds.cardSalesForTerminalCheck.count,
                          })
                        : t('pos.close.terminalTotalNote', {
                            amount: `OMR ${omr(figures.terminal)}`,
                            count: preview.looseEnds.cardSalesForTerminalCheck.count,
                            payments: preview.looseEnds.cardSalesForTerminalCheck.count,
                          }),
                    )}
                  </span>
                  {figures.cardRefunded > 0 && figures.terminalNet && figures.terminal >= 0 ? (
                    <span className="block text-xs font-medium leading-[1.5] text-text-quaternary">
                      {withRial(
                        t('pos.close.terminalRefunded', {
                          amount: `OMR ${omr(figures.cardRefunded)}`,
                        }),
                      )}
                    </span>
                  ) : null}
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={terminalText}
                    onFocus={selectAllOnFocus}
                    onChange={(event) => setTerminalText(event.target.value)}
                    aria-label={t('pos.close.terminalTotal')}
                    className={`${FIELD} max-w-[220px] text-end`}
                  />
                  {terminalNegative ? (
                    <span role="alert" className="text-xs font-medium text-pending-700">
                      {t('pos.refusal.POS_CARD_TERMINAL_TOTAL_INVALID')}
                    </span>
                  ) : cardDiffers && terminal != null ? (
                    <>
                      <span className="text-xs font-medium text-pending-700">
                        {t('pos.close.terminalDiffers', {
                          difference: omrSigned(terminal - figures.terminal),
                        })}
                      </span>
                      <input
                        value={cardNote}
                        maxLength={500}
                        onChange={(event) => setCardNote(event.target.value)}
                        placeholder={t('pos.close.terminalNotePlaceholder')}
                        aria-label={t('pos.close.terminalNotePlaceholder')}
                        className={FIELD}
                      />
                    </>
                  ) : null}
                </span>
              </li>
            </ul>
          </section>
        </div>

        <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('pos.close.shiftInShort')}
            </h2>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t('pos.close.savedAndPrinted')}
            </p>
          </div>
          <div className="px-5">
            <Sum label={t('pos.close.sales')} value={String(figures.sales)} />
            <Sum label={t('pos.close.taken')} value={omr(figures.taken)} money />
            <Sum label={t('pos.close.vatWithin')} value={omr(toBaisa(preview.vatWithin))} money />
            <Sum
              label={t('pos.close.discountsGiven')}
              value={omr(toBaisa(preview.discounts))}
              money
            />
            <Sum label={t('pos.close.tips')} value={omr(toBaisa(preview.tips))} money />
            <Sum label={t('pos.close.refundedInCash')} value={omr(figures.cashRefunded)} money />
            {figures.cardRefunded > 0 ? (
              <Sum label={t('pos.close.refundedToCard')} value={omr(figures.cardRefunded)} money />
            ) : null}
            {figures.transferRefunded > 0 ? (
              <Sum
                label={t('pos.close.refundedByTransfer')}
                value={omr(figures.transferRefunded)}
                money
              />
            ) : null}
            <Sum
              label={t('pos.close.drawer')}
              value={
                !countKnown
                  ? t('pos.close.notCounted')
                  : gap === 0
                    ? t('pos.close.balances')
                    : gap < 0
                      ? t('pos.close.shortValue', { amount: omr(Math.abs(gap)) })
                      : t('pos.day.overValue', { amount: omr(gap) })
              }
              tone={countKnown && gap === 0 ? undefined : 'watch'}
            />
            <Sum
              label={t('pos.close.toBank')}
              value={omr(closed ? toBaisa(closed.toBank) : cash - floatLeft)}
              money
            />
            <Sum
              label={t('pos.close.floatTomorrow')}
              value={omr(closed ? toBaisa(closed.floatLeft) : floatLeft)}
              money
            />
          </div>
          {!countKnown && !closed ? (
            <p className="mx-5 mb-2 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700">
              {t('pos.close.countFirst')}
            </p>
          ) : null}
          {needsReason && !closed ? (
            <p className="mx-5 mb-2 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700">
              {t('pos.refusal.POS_OVER_SHORT_REASON_REQUIRED', {
                counted: omr(cash),
                expected: omr(figures.expected),
              })}
            </p>
          ) : null}
          {refusal ? (
            <p
              role="alert"
              className="mx-5 mb-2 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700"
            >
              {t(posRefusalKey(refusal), refusalValues(refusal))}
            </p>
          ) : null}
          {sentBeforeClose > 0 && !closed ? (
            <p
              role="status"
              className="mx-5 mb-2 rounded-sm bg-success-100 px-4 py-3 text-sm font-medium text-success-700"
            >
              {t('pos.pendingSync.sentRecount', { count: sentBeforeClose })}
            </p>
          ) : null}
          {warned && !closed ? (
            <div
              role="alert"
              className="mx-5 mb-2 flex flex-col gap-2 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700"
            >
              <p>
                {t(
                  unsent?.outcome === 'offline'
                    ? 'pos.pendingSync.closeLeftOffline'
                    : 'pos.pendingSync.closeLeft',
                  { count: waiting.length },
                )}
              </p>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendAgain()}
                  className="inline-flex h-9 items-center rounded-sm border border-border-subtle bg-white px-4 text-xs font-semibold text-text-primary disabled:opacity-60"
                >
                  {t('pos.pendingSync.sendAgain')}
                </button>
              </div>
            </div>
          ) : null}
          <div className="border-t border-border-subtle px-5 py-5">
            {closed ? (
              <p className="flex items-center gap-2 rounded-sm bg-success-100 px-3 py-3 text-sm font-medium text-success-700">
                <CheckIcon className="size-4 shrink-0" />
                {t('pos.close.closedAt', { time: tillTime(closed.closedAt, locale) })}
              </p>
            ) : (
              <button
                type="button"
                disabled={!ready || !till.can.close}
                onClick={() => void close()}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
              >
                {sending
                  ? t('pos.pendingSync.sending')
                  : warned
                    ? t('pos.pendingSync.closeAnyway')
                    : t('pos.close.closeTill')}
              </button>
            )}
          </div>
          <PosFootNote icon="lock">
            {t('pos.close.onceClosedLive', { float: omr(floatLeft) })}
          </PosFootNote>
        </aside>
      </div>
    </div>
  )
}

/**
 * Cash in or out of the drawer outside a sale, and the float while nothing is sold yet. Each kind
 * is offered only to whoever the server lets record it (backend cb9898ac3): a paid-out asks
 * `pos.cash.pay_out`, a paid-in `pos.close`.
 */
function CashMovements({
  shiftId,
  tillId,
  canSetFloat,
  canPayIn,
  canPayOut,
  canLinkBill,
  paidOut,
  onRecorded,
}: {
  shiftId: string
  tillId: string
  canSetFloat: boolean
  canPayIn: boolean
  canPayOut: boolean
  canLinkBill: boolean
  paidOut: PaidOutStore
  onRecorded: () => void
}) {
  const { t } = useTranslation()
  const kinds: ('PAID_OUT' | 'PAID_IN' | 'FLOAT')[] = [
    ...(canPayOut ? (['PAID_OUT'] as const) : []),
    ...(canPayIn ? (['PAID_IN'] as const) : []),
    ...(canSetFloat ? (['FLOAT'] as const) : []),
  ]
  const [chosen, setType] = useState<'PAID_OUT' | 'PAID_IN' | 'FLOAT' | null>(kinds[0] ?? null)
  // The float leaves the list once a sale is made; the choice then falls back to what remains.
  const type = chosen && kinds.includes(chosen) ? chosen : (kinds[0] ?? null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (type === null) return null

  const record = async () => {
    setBusy(true)
    setError(null)
    try {
      const value = parseBaisa(amount) / 1000
      if (type === 'FLOAT') await setShiftFloat(shiftId, value)
      else await addCashMovement(shiftId, { type: 'PAID_IN', amount: value, note: note.trim() || null })
      setAmount('')
      setNote('')
      onRecorded()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md bg-surface-card">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-base font-medium leading-[1.2] text-text-primary">
          {t('pos.close.cashMoves')}
        </h2>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('pos.close.cashMovesNote')}
        </p>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="inline-flex w-fit max-w-full flex-wrap rounded-sm bg-surface-background p-1">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setType(kind)}
              aria-pressed={type === kind}
              className={[
                'inline-flex h-9 items-center whitespace-nowrap rounded-sm px-3 text-sm transition-colors',
                type === kind
                  ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                  : 'font-medium text-text-quaternary',
              ].join(' ')}
            >
              {t(`pos.close.move.${kind}`)}
            </button>
          ))}
        </div>
        {/* FIN-P1 (owner 2026-11-05): paid-outs stay separate from refunds. A refund is a credit
            note against its sale; cash handed back here would have no credit note behind it. */}
        {type === 'PAID_OUT' ? (
          <p className="text-xs font-medium text-text-quaternary">{t('pos.close.paidOutNotRefund')}</p>
        ) : null}
        {type === 'PAID_OUT' ? (
          <PaidOutForm
            shiftId={shiftId}
            tillId={tillId}
            canLinkBill={canLinkBill}
            store={paidOut}
            onRecorded={onRecorded}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-w-0 flex-1 basis-[140px] flex-col gap-1.5">
                <span className="text-xs font-medium text-text-tertiary">{t('pos.pay.amount')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={amount}
                  placeholder="0.000"
                  onFocus={selectAllOnFocus}
                  onChange={(event) => setAmount(event.target.value)}
                  className={`${FIELD} text-end`}
                />
              </label>
              {type !== 'FLOAT' ? (
                <label className="flex min-w-0 flex-[2] basis-[200px] flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-tertiary">
                    {t('pos.close.whatFor')}
                  </span>
                  <input
                    value={note}
                    maxLength={500}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={type === 'PAID_IN' ? t('pos.pay.optional') : undefined}
                    className={FIELD}
                  />
                </label>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-xs font-medium text-danger-700">
                {t(posRefusalKey(error), refusalValues(error))}
              </p>
            ) : null}
            <div>
              <button
                type="button"
                disabled={busy || parseBaisa(amount) <= 0}
                onClick={() => void record()}
                className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
              >
                {t('pos.close.record')}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const fileIdentity = (file: File) => `${file.name}|${file.size}|${file.lastModified}`

/**
 * A paid-out (backend cb9898ac3, FIN-M3): what kind it is, how it is booked, the currency, and the
 * receipt or why there is none. Never queued offline: it needs the server's drawer check and key.
 */
function PaidOutForm({
  shiftId,
  tillId,
  canLinkBill,
  store,
  onRecorded,
}: {
  shiftId: string
  tillId: string
  canLinkBill: boolean
  store: PaidOutStore
  onRecorded: () => void
}) {
  const { t, i18n } = useTranslation()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<PosPaidOutCategory | null>(null)
  const [chosenClass, setChosenClass] = useState<PosPaidOutClass | null>(null)
  // FIN-M3-CURRENCY-SRC: nothing records a till's currency, so none is assumed or prefilled; the
  // server refuses a paid-out without one rather than default it.
  const [currency, setCurrency] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Bumped to empty the file picker, which React cannot clear by value.
  const [picker, setPicker] = useState(0)
  const [fileProblem, setFileProblem] = useState<'type' | 'size' | null>(null)
  const [noReceipt, setNoReceipt] = useState(false)
  const [reason, setReason] = useState('')
  const [bill, setBill] = useState<BillRowDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [check, setCheck] = useState<
    | { status: 'loading' }
    | { status: 'ready'; moves: PosCashMovementDto[] }
    | { status: 'failed'; error: unknown }
    | null
  >(null)
  // Re-renders the locked view each second, so the unlock wait counts down (review W5-2).
  const [, setTick] = useState(0)
  const locked = isLocked(store)
  useEffect(() => {
    if (!locked) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [locked])

  const linked = category === 'SUPPLIER_PAYMENT' && bill !== null
  const fixed = category ? fixedClass(category, linked) : null
  const choices = category ? choosableClasses(category, linked) : []
  // A bill that states no currency is left to the server, never shown as "This bill is in ."
  const billCurrencyDiffers =
    linked && currency !== '' && !!bill?.currencyCode && bill.currencyCode !== currency
  const gap = paidOutGap({
    amount: parseBaisa(amount) / 1000,
    note,
    category,
    chosenClass,
    currency,
    billId: linked && bill ? bill.id : null,
    hasReceipt: !noReceipt && file !== null,
    missingReceiptReason: noReceipt ? reason : null,
  })

  const chooseFile = (chosen: File | null) => {
    setFile(null)
    setFileProblem(null)
    if (!chosen) return
    const problem = receiptProblem(chosen)
    if (problem) setFileProblem(problem)
    else setFile(chosen)
  }

  const save = () => savePaidOutStore(tillId, shiftId, store)

  /** A definite answer that recorded it (201, or the 200 replay of the first press). */
  const settled = () => {
    store.attempt = null
    store.receipt = null
    store.unknown = false
    store.sentAt = null
    save()
    onRecorded()
  }

  const failed = (cause: unknown, sent: boolean) => {
    if (sent && outcomeUnknown(cause)) {
      // The server may have recorded it: from here on only the same body under the same key may
      // go, until a definite answer or the cashier's check (review W4-1).
      store.unknown = true
      save()
    } else {
      // A definite refusal recorded nothing, so the next press is a fresh attempt whatever it says.
      store.attempt = null
      store.unknown = false
      store.sentAt = null
      if (dropsHeldReceipt(cause)) store.receipt = null
      save()
      // Uploading the same file again would only make a second copy of a receipt that already backs a
      // paid-out, which is what the server refused; the cashier picks the receipt again on purpose.
      if (cause instanceof ApiError && cause.code === 'POS_PAID_OUT_RECEIPT_ALREADY_USED') {
        setFile(null)
        setPicker((value) => value + 1)
      }
    }
    setError(cause)
  }

  /** The locked press: the stored body, the stored key, nothing read from the fields. */
  const sendAgain = async (body: PosPaidOutRequest, key: string) => {
    setBusy(true)
    setError(null)
    // This send may itself still be in flight a minute from now: the wait restarts with it.
    store.sentAt = Date.now()
    save()
    try {
      await recordPaidOut(shiftId, body, key)
      settled()
    } catch (cause) {
      failed(cause, true)
    } finally {
      setBusy(false)
    }
  }

  /** The cashier's way out of the lock: read the shift's cash moves again before saying it is not there. */
  const readMoves = async () => {
    setCheck({ status: 'loading' })
    try {
      const preview = await apiRequest<PosClosePreviewDto>(closePreviewPath(shiftId))
      setCheck({ status: 'ready', moves: preview.movements.filter((move) => move.type === 'PAID_OUT') })
    } catch (cause) {
      setCheck({ status: 'failed', error: cause })
    }
  }

  const notRecorded = (body: PosPaidOutRequest | null) => {
    store.attempt = null
    store.unknown = false
    store.sentAt = null
    save()
    setCheck(null)
    setError(null)
    // An unreadable body leaves the form as it stands: nothing to refill it from.
    if (!body) return
    // The fields come back as they were sent (also after a reload, when the form had none); the
    // receipt id stays held, so a paid-out that was in fact recorded is refused as ALREADY_USED.
    setAmount(body.amount.toFixed(3))
    setNote(body.note)
    setCategory(body.category)
    const chosen = body.accountingClass
    setChosenClass(
      // The bill row is not kept, so the form comes back unlinked and a bill settlement unchosen.
      chosen && choosableClasses(body.category, false).includes(chosen) ? chosen : null,
    )
    setCurrency(body.currency)
    setNoReceipt(Boolean(body.missingReceiptReason))
    setReason(body.missingReceiptReason ?? '')
  }

  const record = async () => {
    if (!category) return
    setBusy(true)
    setError(null)
    let sent = false
    try {
      let receiptObjectId: string | null = null
      if (!noReceipt && file) {
        const identity = fileIdentity(file)
        if (store.receipt?.file === identity) {
          receiptObjectId = store.receipt.receiptObjectId
        } else {
          // Photos above the gateway's limit go up shrunk, as a bill's photo does.
          const fitted = await fitForUpload(file)
          const uploaded = await uploadPaidOutReceipt(tillId, fitted, fitted.name)
          store.receipt = { file: identity, receiptObjectId: uploaded.receiptObjectId }
          receiptObjectId = uploaded.receiptObjectId
        }
      }
      const body = paidOutRequest({
        amount: parseBaisa(amount) / 1000,
        note,
        category,
        chosenClass,
        currency,
        billId: linked && bill ? bill.id : null,
        receiptObjectId,
        missingReceiptReason: noReceipt ? reason : null,
      })
      const { attempt, key } = keyForAttempt(store.attempt, body)
      store.attempt = attempt
      store.sentAt = Date.now()
      // Stored as unknown before it leaves: a reload while it is in flight cannot tell either.
      savePaidOutStore(tillId, shiftId, { ...store, unknown: true })
      sent = true
      // A 200 replay is the paid-out the first press recorded: success, never a second one.
      await recordPaidOut(shiftId, body, key)
      settled()
    } catch (cause) {
      failed(cause, sent)
    } finally {
      setBusy(false)
    }
  }

  const refusal = error ? paidOutRefusal(error, i18n.language) : null
  const pending = pendingBody(store)

  if (locked && store.attempt) {
    const key = store.attempt.key
    const waitSeconds = Math.ceil(unlockWaitMs(store, Date.now()) / 1000)
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="rounded-sm bg-pending-100 px-3 py-3 text-sm font-medium text-pending-700">
          {t('pos.close.paidOutForm.pending.title')}
        </p>
        {pending ? (
          <ul className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            <li>
              {formatAmount(pending.amount, pending.currency, i18n.language)} {pending.currency} ·{' '}
              {t(`pos.close.paidOutForm.categories.${pending.category}`)}
            </li>
            <li>{pending.note}</li>
            <li>
              {pending.missingReceiptReason
                ? t('pos.close.paidOutForm.pending.noReceipt', { reason: pending.missingReceiptReason })
                : t('pos.close.paidOutForm.pending.receipt')}
            </li>
            {pending.billId ? <li>{t('pos.close.paidOutForm.pending.bill')}</li> : null}
          </ul>
        ) : (
          // Fail closed (review N-W5a): without the body nothing can be sent again, and the lock
          // lifts only through the re-read and the wait.
          <p className="text-sm font-medium text-text-secondary">
            {t('pos.close.paidOutForm.pending.unreadable')}
          </p>
        )}
        <p className="text-xs font-medium text-text-quaternary">
          {t(pending ? 'pos.close.paidOutForm.pending.hint' : 'pos.close.paidOutForm.pending.unreadableHint')}
        </p>
        {refusal ? (
          <p role="alert" className="text-xs font-medium text-danger-700">
            {t(refusal.key, refusal.values)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {pending ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendAgain(pending, key)}
              className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
            >
              {t('pos.close.paidOutForm.pending.again')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || check?.status === 'loading'}
            onClick={() => void readMoves()}
            className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
          >
            {t('pos.close.paidOutForm.pending.check')}
          </button>
        </div>
        {check?.status === 'failed' ? (
          <p role="alert" className="text-xs font-medium text-danger-700">
            {t(posRefusalKey(check.error), refusalValues(check.error))}
          </p>
        ) : null}
        {check?.status === 'ready' ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-tertiary">
              {check.moves.length > 0
                ? t('pos.close.paidOutForm.pending.movesFound')
                : t('pos.close.paidOutForm.pending.movesNone')}
            </p>
            {check.moves.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
                {check.moves.map((move) => (
                  <li key={move.movementId}>
                    {tillTime(move.recordedAt, i18n.language.startsWith('ar') ? 'ar' : 'en-GB')} ·{' '}
                    {pending
                      ? formatAmount(move.amount, pending.currency, i18n.language)
                      : String(move.amount)}{' '}
                    · {move.note ?? ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {waitSeconds > 0 ? (
              <p className="text-xs font-medium text-text-quaternary">
                {t('pos.close.paidOutForm.pending.wait', { seconds: waitSeconds })}
              </p>
            ) : null}
            <div>
              <button
                type="button"
                disabled={busy || waitSeconds > 0}
                onClick={() => notRecorded(pending)}
                className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
              >
                {t('pos.close.paidOutForm.pending.notRecorded')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-4">
        <label className="flex min-w-0 flex-1 basis-[140px] flex-col gap-1.5">
          <span className="text-xs font-medium text-text-tertiary">{t('pos.pay.amount')}</span>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            aria-label={t('pos.pay.amount')}
            placeholder="0.000"
            onFocus={selectAllOnFocus}
            onChange={(event) => setAmount(event.target.value)}
            className={`${FIELD} text-end`}
          />
        </label>
        <label className="flex min-w-0 flex-1 basis-[140px] flex-col gap-1.5">
          <span className="text-xs font-medium text-text-tertiary">
            {t('pos.close.paidOutForm.currency')}
          </span>
          <select
            value={currency}
            aria-label={t('pos.close.paidOutForm.currency')}
            onChange={(event) => setCurrency(event.target.value)}
            className={FIELD}
          >
            <option value="">{t('pos.close.paidOutForm.choose')}</option>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-[2] basis-[200px] flex-col gap-1.5">
          <span className="text-xs font-medium text-text-tertiary">{t('pos.close.whatFor')}</span>
          <input
            value={note}
            aria-label={t('pos.close.whatFor')}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            className={FIELD}
          />
        </label>
      </div>
      <p className="text-xs font-medium text-text-quaternary">
        {t('pos.close.paidOutForm.currencyNote')}
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
          <span className="text-xs font-medium text-text-tertiary">
            {t('pos.close.paidOutForm.category')}
          </span>
          <select
            value={category ?? ''}
            aria-label={t('pos.close.paidOutForm.category')}
            onChange={(event) => {
              const next = (event.target.value || null) as PosPaidOutCategory | null
              setCategory(next)
              setChosenClass(null)
              if (next !== 'SUPPLIER_PAYMENT') setBill(null)
            }}
            className={FIELD}
          >
            <option value="">{t('pos.close.paidOutForm.choose')}</option>
            {PAID_OUT_CATEGORIES.map((code) => (
              <option key={code} value={code}>
                {t(`pos.close.paidOutForm.categories.${code}`)}
              </option>
            ))}
          </select>
        </label>
        {category && choices.length > 0 ? (
          <label className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
            <span className="text-xs font-medium text-text-tertiary">
              {t('pos.close.paidOutForm.class')}
            </span>
            <select
              value={chosenClass ?? ''}
              aria-label={t('pos.close.paidOutForm.class')}
              onChange={(event) => setChosenClass((event.target.value || null) as PosPaidOutClass | null)}
              className={FIELD}
            >
              <option value="">{t('pos.close.paidOutForm.choose')}</option>
              {choices.map((code) => (
                <option key={code} value={code}>
                  {t(`pos.close.paidOutForm.classes.${code}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {fixed ? (
        <p className="text-xs font-medium text-text-quaternary">
          {t('pos.close.paidOutForm.classFixed', {
            class: t(`pos.close.paidOutForm.classes.${fixed}`),
          })}
        </p>
      ) : null}
      {category === 'SUPPLIER_PAYMENT' && canLinkBill ? (
        <BillLink bill={bill} onChange={setBill} />
      ) : null}
      {billCurrencyDiffers ? (
        <p role="alert" className="text-xs font-medium text-danger-700">
          {t('pos.close.paidOutForm.billCurrency', { currency: bill?.currencyCode ?? '' })}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-tertiary">
          {t('pos.close.paidOutForm.receipt')}
        </span>
        {noReceipt ? (
          <input
            value={reason}
            maxLength={500}
            aria-label={t('pos.close.paidOutForm.noReceiptReason')}
            placeholder={t('pos.close.paidOutForm.noReceiptReason')}
            onChange={(event) => setReason(event.target.value)}
            className={FIELD}
          />
        ) : (
          <input
            key={picker}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            aria-label={t('pos.close.paidOutForm.receipt')}
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            className="text-sm font-medium text-text-secondary"
          />
        )}
        <p className="text-xs font-medium text-text-quaternary">
          {noReceipt ? t('pos.close.paidOutForm.noReceiptNote') : t('pos.close.paidOutForm.receiptNote')}
        </p>
        {fileProblem ? (
          <p role="alert" className="text-xs font-medium text-danger-700">
            {t(`pos.close.paidOutForm.receiptProblem.${fileProblem}`)}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={noReceipt}
            onChange={(event) => setNoReceipt(event.target.checked)}
          />
          {t('pos.close.paidOutForm.noReceipt')}
        </label>
      </div>
      {refusal ? (
        <p role="alert" className="text-xs font-medium text-danger-700">
          {t(refusal.key, refusal.values)}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          disabled={busy || gap !== null || billCurrencyDiffers}
          onClick={() => void record()}
          className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
        >
          {t('pos.close.record')}
        </button>
      </div>
    </>
  )
}

/**
 * The bill a supplier paid-out settles, offered only to a holder of `bill.settle`, which the server
 * asks on top of `pos.cash.pay_out` (POS_PAID_OUT_BILL_FORBIDDEN). Approved bills only: the server
 * refuses to pay any other.
 */
function BillLink({
  bill,
  onChange,
}: {
  bill: BillRowDto | null
  onChange: (bill: BillRowDto | null) => void
}) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<BillRowDto[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const describe = (row: BillRowDto) => ({
    supplier: row.supplierName ?? '—',
    number: row.supplierBillNumber ?? '—',
    // Without a currency there are no minor units to format to, and none is assumed.
    outstanding: row.currencyCode
      ? formatAmount(row.outstandingAmount, row.currencyCode, i18n.language)
      : String(row.outstandingAmount),
    currency: row.currencyCode ?? '',
  })

  if (bill) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-text-secondary">
        <span>{t('pos.close.paidOutForm.billLinked', describe(bill))}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex h-9 items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('pos.close.paidOutForm.billUnlink')}
        </button>
      </div>
    )
  }

  const find = async () => {
    setBusy(true)
    setError(null)
    try {
      const page = await loadBillPage(
        billListPath({ filter: 'APPROVED', q: query, source: null, sort: 'NEWEST', page: 0, pageSize: 5 }),
      )
      setFound(page.items.filter((row) => row.outstandingAmount > 0))
    } catch (cause) {
      setFound(null)
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-tertiary">{t('pos.close.paidOutForm.bill')}</span>
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          aria-label={t('pos.close.paidOutForm.billSearch')}
          placeholder={t('pos.close.paidOutForm.billSearch')}
          onChange={(event) => setQuery(event.target.value)}
          className={`${FIELD} min-w-0 flex-1 basis-[200px]`}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void find()}
          className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
        >
          {t('pos.close.paidOutForm.billFind')}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger-700">
          {t('pos.close.paidOutForm.billLookupFailed')}
        </p>
      ) : null}
      {found && found.length === 0 ? (
        <p className="text-xs font-medium text-text-quaternary">{t('pos.close.paidOutForm.billNone')}</p>
      ) : null}
      {found && found.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {found.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onChange(row)}
                className="text-start text-sm font-medium text-text-secondary hover:text-primary-700"
              >
                {t('pos.close.paidOutForm.billRow', describe(row))}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function LooseEnd({ done, title, note }: { done: boolean; title: string; note: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0">
      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
          done ? 'bg-success-100 text-success-700' : 'bg-pending-100 text-pending-700',
        ].join(' ')}
      >
        {done ? <CheckIcon className="size-4" /> : <ClockIcon className="size-4" />}
      </span>
      <span className="min-w-[200px] flex-1">
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
          {note}
        </span>
      </span>
    </li>
  )
}

function Kpi({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-md bg-surface-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {title}
      </p>
      <p className="inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-[1.2] text-text-primary">
        <Rial />
        {value}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

function Sum({
  label,
  value,
  tone,
  money,
}: {
  label: string
  value: string
  tone?: 'watch'
  /** An amount of money: the rial sign goes before it. */
  money?: boolean
}) {
  return (
    <div className="flex min-h-[35px] items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span
        className={[
          'inline-flex items-baseline gap-1 text-sm font-semibold tabular-nums',
          tone === 'watch' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {money ? <Rial /> : null}
        {value}
      </span>
    </div>
  )
}
