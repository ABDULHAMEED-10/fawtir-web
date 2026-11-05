import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Rial } from '../../components/ui'
import { useApiRead } from '../../hooks'
import { omr, tillTime, toBaisa } from '../../lib/pos'
import {
  correctQueuedSale,
  markQueuedSaleSetAside,
  opensNumbers,
  retryQueuedSale,
  useQueuedSales,
  type QueuedSale,
} from '../../lib/posQueue'
import { posRefusalKey, queueRefusalKey } from '../../lib/posRefusals'
import type { TillState } from '../../lib/posTill'
import { posOpenNumbersPath, setAsideOpenNumber, type PosOpenNumberDto } from '../../api/pos/pos'
import type { DraftLineRequest } from '../../api/invoices/drafts'

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
 * or try again. Anyone else on the till is told to ask a manager. Later sales wait for the number,
 * and the panel says so: set aside and the server's open-number list are off in this build whatever
 * the till says (`opensNumbers`, Q-27), so their UI below is unreachable. Sales only waiting for the
 * connection are one quiet line.
 */
export function PosQueuePanel({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const entries = useQueuedSales(till.till.id)
  const canSkip = opensNumbers()
  const open = useApiRead<PosOpenNumberDto[]>(canSkip ? posOpenNumbersPath(till.branchId) : null)
  const online = useSyncExternalStore(onlineChanges, () => navigator.onLine)
  const onServer = open.read.status === 'ready' ? open.read.data : []
  const problems = entries.filter((entry) => entry.refusal)
  // Someone else's, or queued before makers were kept: this session never sends them by itself
  // (owner round 5, P3b), so they are listed with Send for instead of counted as going on their own.
  const others = entries.filter(
    (entry) => !entry.refusal && !(till.userId && entry.madeBy?.userId === till.userId),
  )
  const waiting = entries.length - problems.length - others.length
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
                    sender={till.userId}
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
      {others.length > 0 && (till.can.sell || till.can.manage) ? (
        <section className="rounded-md bg-surface-card px-5 py-3">
          <p className="text-xs font-medium text-text-tertiary">
            {t('pos.queue.others', { count: others.length })}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {others.map((entry) => (
              <OtherMaker key={entry.key} entry={entry} tillId={till.till.id} sender={till.userId} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** "Send for {cashier}": never a cashier claim, only who pressed it sending another person's sale. */
function sendForLabel(t: TFunction, entry: QueuedSale) {
  return entry.madeBy
    ? t('pos.queue.sendFor', { cashier: entry.madeBy.name ?? '' })
    : t('pos.queue.sendForUnknown')
}

function OtherMaker({
  entry,
  tillId,
  sender,
}: {
  entry: QueuedSale
  tillId: string
  sender: string | null
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await retryQueuedSale(tillId, entry.key, sender)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-text-primary">
      <span dir="ltr">{entry.number}</span>
      <span className="font-medium text-text-tertiary">{tillTime(entry.body.soldAt, locale)}</span>
      <button type="button" disabled={busy} onClick={() => void send()} className={QUIET_BUTTON}>
        {sendForLabel(t, entry)}
      </button>
    </li>
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
  sender,
  canSkip,
  onServer,
  refresh,
}: {
  entry: QueuedSale
  tillId: string
  sender: string | null
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
      await retryQueuedSale(tillId, entry.key, sender)
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
        sender,
      )
      setMode('none')
      refresh()
    } finally {
      setBusy(false)
    }
  }
  const validAmounts = amounts.every((value) => Number.isFinite(Number(value)) && Number(value) > 0)
  // Held before issue for a goods line with no HS code: not issued, so the item's code is what
  // lets it through, not a correction of the payments.
  const pendingValidation = entry.refusal === 'POS_QUEUED_SALE_HS_CODE_REQUIRED'
  // Held the same way for a line that states neither goods nor services (backend 8f04050ab). The
  // lines this device kept cannot be changed here; only where the item can cure it does the hint
  // send someone to the item.
  const undeclared = entry.refusal === 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED'
  const heldLines = pendingValidation || undeclared ? entry.refusalValues?.lines : undefined
  const itemCures = undeclared && curedByItem(entry, heldLines)

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
          queueRefusalKey(entry.refusal, entry.refusalType ?? null, entry.refusalValues ?? {}),
          entry.refusalValues ?? {},
        )}
        {heldLines
          ? ` ${t(undeclared ? 'pos.queue.goodsOrServiceLines' : 'pos.queue.hsCodeLines', { lines: heldLines })}`
          : null}
      </p>
      <p className="mt-1 text-xs font-medium text-text-tertiary">
        {entry.buyerRemoved
          ? t('pos.queue.buyerRemovedHint')
          : entry.final
            ? t('pos.queue.finalHint')
            : undeclared
              ? t(itemCures ? 'pos.queue.goodsOrServiceItemHint' : 'pos.queue.goodsOrServiceHint')
              : pendingValidation
              ? t('pos.queue.hsCodeHint')
              : sender && entry.madeBy?.userId === sender
                ? t('pos.queue.heldHint')
                : t('pos.queue.sendForHint')}
      </p>
      {/* Only the server's own record names a reason. An earlier build's local flag, or the marker
          Try again leaves, is this device's word alone and says so (Q-27 NF7R; A8-G6). */}
      {onServer?.setAsideAt ? (
        <SetAsideNote reason={onServer.setAsideReason} />
      ) : entry.setAside || entry.setAsideSeen ? (
        <p className="mt-1 text-xs font-medium text-pending-700">
          {t('pos.queue.setAsideSeenNote')}
        </p>
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
          {entry.buyerRemoved ? null : (
            <button type="button" disabled={busy} onClick={() => void retry()} className={BUTTON}>
              {sender && entry.madeBy?.userId === sender
                ? t('pos.queue.retry')
                : sendForLabel(t, entry)}
            </button>
          )}
          {!entry.buyerRemoved && entry.refusal && PAYMENTS_CAN_BE_CORRECTED.has(entry.refusal) ? (
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

/**
 * Whether every held line can be cured by classifying its catalogue item (backend dbcd51ae9,
 * HS-B-TILL-STALL): on a queued sale's resend, a line that cites a product and states no
 * classification of its own (no goods/services, HS code or service type) takes the active item's
 * stored flag. A typed line with no product, or one that states anything itself, never does, and
 * nor does a line the answer names that this device cannot find: those keep the old hint. Whether
 * the item is active, flagged and consistent with its kind only the server knows, so the hint says
 * what to do, not that it will clear.
 */
function curedByItem(entry: QueuedSale, held: string | undefined): boolean {
  if (!held) return false
  const numbers = held.split(',').map((part) => Number(part.trim()))
  if (numbers.some((number) => !Number.isInteger(number))) return false
  const lines = (entry.body.draft as { lines?: DraftLineRequest[] }).lines ?? []
  return numbers.every((number) => {
    const line = lines.find((candidate) => candidate.lineNumber === number)
    if (!line?.productId) return false
    const own = line.classification
    return !own || (own.goodsOrService == null && own.hsCode == null && own.serviceTypeCode == null)
  })
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
