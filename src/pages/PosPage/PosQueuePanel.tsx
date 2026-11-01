import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Rial } from '../../components/ui'
import { useApiRead } from '../../hooks'
import { omr, tillTime, toBaisa } from '../../lib/pos'
import {
  correctQueuedSale,
  markQueuedSaleSetAside,
  retryQueuedSale,
  useQueuedSales,
  type QueuedSale,
} from '../../lib/posQueue'
import { posRefusalKey, queueRefusalKey } from '../../lib/posRefusals'
import type { TillState } from '../../lib/posTill'
import { posOpenNumbersPath, setAsideOpenNumber, type PosOpenNumberDto } from '../../api/pos/pos'

type Ready = Extract<TillState, { status: 'ready' }>

/** The refusals a manager can put right here: payments only, so the receipt still matches. */
const onlineChanges = (notify: () => void) => {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

const PAYMENTS_CAN_BE_CORRECTED = new Set([
  'POS_PAYMENTS_DO_NOT_MATCH_TOTAL',
  'POS_CASH_TENDERED_TOO_LOW',
  'POS_PAYMENT_INVALID',
])

/**
 * A sale made offline has a number on a receipt the customer holds, so one the server has not taken
 * is never left silent (E2E 30 Oct 2026, H-1; Abdul, 31 Oct 2026). Whoever manages tills
 * (`pos.till.manage`) sees the reason and resolves it: correct and send again on the printed number,
 * try again, or set it aside on the server so the queue moves on. Setting aside closes nothing: the
 * number stays listed until it is filed. Anyone else on the till is told to ask a manager. Set aside
 * and the server's list need `openNumbers`; on a server without it later sales must wait for
 * the number, and the panel says so. Sales only waiting for the connection are one quiet line.
 */
export function PosQueuePanel({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const entries = useQueuedSales(till.till.id)
  const canSkip = till.till.openNumbers === true
  const open = useApiRead<PosOpenNumberDto[]>(canSkip ? posOpenNumbersPath(till.branchId) : null)
  const online = useSyncExternalStore(onlineChanges, () => navigator.onLine)
  const onServer = open.read.status === 'ready' ? open.read.data : []
  const problems = entries.filter((entry) => entry.refusal)
  const waiting = entries.length - problems.length
  const here = new Set(problems.map((entry) => entry.number))
  const elsewhere = onServer.filter((row) => !here.has(row.invoiceNumber))
  const count = problems.length + elsewhere.length
  if (entries.length === 0 && count === 0) return null

  return (
    <div className="mx-auto mb-4 flex w-full max-w-[1144px] flex-col gap-3">
      {count > 0 ? (
        <section
          role="alert"
          className="rounded-md border border-danger-700 bg-danger-100 px-5 py-4 text-danger-700"
        >
          <h2 className="text-sm font-semibold">{t('pos.queue.problemTitle', { count })}</h2>
          {till.can.manage ? (
            <>
              <ul className="mt-3 flex flex-col gap-3">
                {problems.map((entry) => (
                  <Problem
                    key={entry.key}
                    entry={entry}
                    tillId={till.till.id}
                    canSkip={canSkip}
                    onServer={onServer.find((row) => row.invoiceNumber === entry.number)}
                    refresh={open.retry}
                  />
                ))}
                {elsewhere.map((row) => (
                  <Elsewhere key={row.invoiceNumber} row={row} refresh={open.retry} />
                ))}
              </ul>
              {!canSkip ? (
                <p className="mt-3 text-xs font-medium">{t('pos.queue.orderHint')}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-xs font-medium">{t('pos.queue.askManager')}</p>
          )}
        </section>
      ) : null}
      {waiting > 0 ? (
        <p className="rounded-md bg-surface-card px-5 py-3 text-xs font-medium text-text-tertiary">
          {t(
            // What it waits for: the connection, the stuck sale it must follow, or only its turn.
            !online
              ? 'pos.queue.waitingOffline'
              : problems.length > 0 && !canSkip
                ? 'pos.queue.waitingBehind'
                : 'pos.queue.waiting',
            { count: waiting },
          )}
        </p>
      ) : null}
    </div>
  )
}

const BUTTON =
  'inline-flex h-9 items-center rounded-sm bg-primary-700 px-4 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-60'
const QUIET_BUTTON =
  'inline-flex h-9 items-center rounded-sm border border-border-subtle px-4 text-xs font-semibold text-text-primary disabled:opacity-60'
const FIELD =
  'h-9 w-full rounded-sm border border-border-subtle bg-surface-card px-3 text-sm font-medium text-text-primary'

function SetAsideForm({
  tillId,
  number,
  done,
  cancel,
}: {
  tillId: string
  number: string
  done: () => void
  cancel: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await setAsideOpenNumber(tillId, number, reason.trim())
      done()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-text-primary">{t('pos.queue.setAsideWarning')}</p>
      <label className="mt-2 block text-xs font-medium text-text-tertiary">
        {t('pos.queue.setAsideReason')}
        <input
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          className={`mt-1 ${FIELD}`}
        />
      </label>
      {error ? (
        <p className="mt-1 text-xs font-medium text-danger-700">{t(posRefusalKey(error))}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() => void send()}
          className={BUTTON}
        >
          {t('pos.queue.setAsideConfirm')}
        </button>
        <button type="button" onClick={cancel} className={QUIET_BUTTON}>
          {t('pos.queue.setAsideKeep')}
        </button>
      </div>
    </div>
  )
}

function SetAsideNote({ reason }: { reason: string | null }) {
  const { t } = useTranslation()
  return (
    <p className="mt-1 text-xs font-medium text-pending-700">
      {t('pos.queue.setAsideNote', { reason: reason ?? '' })}
    </p>
  )
}

function Problem({
  entry,
  tillId,
  canSkip,
  onServer,
  refresh,
}: {
  entry: QueuedSale
  tillId: string
  canSkip: boolean
  onServer?: PosOpenNumberDto
  refresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'none' | 'correct' | 'setAside'>('none')
  const [amounts, setAmounts] = useState(() => entry.body.payments.map((p) => String(p.amount)))
  const amount = entry.body.payments.reduce((sum, payment) => sum + toBaisa(payment.amount), 0)

  const retry = async () => {
    setBusy(true)
    try {
      await retryQueuedSale(tillId, entry.key)
      refresh()
    } finally {
      setBusy(false)
    }
  }
  const correct = async () => {
    setBusy(true)
    try {
      await correctQueuedSale(
        tillId,
        entry.key,
        entry.body.payments.map((payment, index) => {
          const value = Number(amounts[index])
          return payment.method === 'CASH'
            ? { ...payment, amount: value, tendered: Math.max(value, payment.tendered ?? value) }
            : { ...payment, amount: value }
        }),
      )
      setMode('none')
      refresh()
    } finally {
      setBusy(false)
    }
  }
  const validAmounts = amounts.every((value) => Number.isFinite(Number(value)) && Number(value) > 0)

  return (
    <li className="rounded-sm bg-surface-card px-4 py-3 text-text-primary">
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
        <span dir="ltr">{entry.number}</span>
        <span className="inline-flex items-center gap-1 font-medium text-text-tertiary">
          <Rial />
          {omr(amount)}
        </span>
        <span className="font-medium text-text-tertiary">
          {tillTime(entry.body.soldAt, locale)}
        </span>
      </p>
      <p className="mt-1 text-sm font-medium text-danger-700">
        {t(
          queueRefusalKey(entry.refusal, entry.refusalType ?? null, entry.refusalValues),
          entry.refusalValues ?? {},
        )}
      </p>
      <p className="mt-1 text-xs font-medium text-text-tertiary">
        {entry.final ? t('pos.queue.finalHint') : t('pos.queue.heldHint')}
      </p>
      {entry.setAside || onServer?.setAsideAt ? (
        <SetAsideNote reason={onServer?.setAsideReason ?? null} />
      ) : null}
      {mode === 'correct' ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-text-primary">{t('pos.queue.correctNote')}</p>
          {entry.body.payments.map((payment, index) => (
            <label key={index} className="block text-xs font-medium text-text-tertiary">
              {t(`pos.queue.method.${payment.method}`)}
              <input
                inputMode="decimal"
                dir="ltr"
                value={amounts[index]}
                onChange={(event) =>
                  setAmounts(amounts.map((v, i) => (i === index ? event.target.value : v)))
                }
                className={`mt-1 ${FIELD}`}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !validAmounts}
              onClick={() => void correct()}
              className={BUTTON}
            >
              {t('pos.queue.correctSend')}
            </button>
            <button type="button" onClick={() => setMode('none')} className={QUIET_BUTTON}>
              {t('pos.queue.setAsideKeep')}
            </button>
          </div>
        </div>
      ) : mode === 'setAside' ? (
        <SetAsideForm
          tillId={tillId}
          number={entry.number}
          done={() => {
            markQueuedSaleSetAside(entry.key)
            setMode('none')
            refresh()
          }}
          cancel={() => setMode('none')}
        />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void retry()} className={BUTTON}>
            {t('pos.queue.retry')}
          </button>
          {entry.refusal && PAYMENTS_CAN_BE_CORRECTED.has(entry.refusal) ? (
            <button type="button" onClick={() => setMode('correct')} className={QUIET_BUTTON}>
              {t('pos.queue.correct')}
            </button>
          ) : null}
          {canSkip && !entry.setAside && onServer && !onServer.setAsideAt ? (
            <button type="button" onClick={() => setMode('setAside')} className={QUIET_BUTTON}>
              {t('pos.queue.setAside')}
            </button>
          ) : null}
        </div>
      )}
    </li>
  )
}

/** On the server's list and not in this device's queue: another device holds the sale. */
function Elsewhere({ row, refresh }: { row: PosOpenNumberDto; refresh: () => void }) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  return (
    <li className="rounded-sm bg-surface-card px-4 py-3 text-text-primary">
      <p className="text-sm font-semibold" dir="ltr">
        {row.invoiceNumber}
      </p>
      <p className="mt-1 text-xs font-medium text-text-tertiary">
        {t('pos.queue.elsewhere', { till: row.tillNumber })}
      </p>
      {row.refusalCode ? (
        <p className="mt-1 text-sm font-medium text-danger-700">
          {t(queueRefusalKey(row.refusalCode, null))}
        </p>
      ) : null}
      {row.setAsideAt ? <SetAsideNote reason={row.setAsideReason} /> : null}
      {asking ? (
        <SetAsideForm
          tillId={row.tillId}
          number={row.invoiceNumber}
          done={() => {
            setAsking(false)
            refresh()
          }}
          cancel={() => setAsking(false)}
        />
      ) : !row.setAsideAt ? (
        <div className="mt-3">
          <button type="button" onClick={() => setAsking(true)} className={QUIET_BUTTON}>
            {t('pos.queue.setAside')}
          </button>
        </div>
      ) : null}
    </li>
  )
}
