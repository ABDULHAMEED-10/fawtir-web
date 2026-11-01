import { useEffect, useSyncExternalStore } from 'react'
import { ApiError, NetworkError } from '../api'
import {
  createPosSale,
  type PosSaleDto,
  type PosSaleRequest,
  type PosTillDto,
} from '../api/pos/pos'
import {
  dropSlipPhotos,
  holdSlipPhotos,
  retrySlipPhotos,
  sendSlipPhotos,
  type SlipPhoto,
} from './posSlipOutbox'
import { refusalValues } from './posRefusals'
import { forgetBuyer, openBuyer, sealBuyer } from './posVault'

/**
 * The till keeps selling when the connection drops (guide section 9, "Offline"). A sale that
 * cannot reach the server is numbered by the till itself, from its own series (`series.INVOICE`
 * on `GET /v1/pos/tills/{id}`), and kept on this device. Queued sales are sent oldest number
 * first, each with the key it was made with, so a sale is filed exactly once
 * (`queuedOffline: true`, the printed `invoiceNumber`). A new sale first sends the waiting ones;
 * while any still waits it joins the queue too: an online sale would take the next number, which
 * is on a receipt the customer holds.
 *
 * A refused entry never stops the till (E2E 30 Oct 2026, H-1). It stays here, shown on the Till and
 * Today screens (`PosQueuePanel`), and its number is kept. A refusal whose cause can clear is sent
 * again on its own, with the same key, so it can never be paid or filed twice. A refusal that the
 * same sale can never get past is not sent again until a person presses Try again; it stays on the
 * till, open, until it is filed. Later sales go past it where the server allows it
 * (`till.openNumbers`, naming the numbers they pass); an older server requires strict number
 * order, so there they wait behind it, in order, and are numbered and printed meanwhile.
 *
 * TODO(backend): a sale made offline prints its number but not its QR; the QR's signed payload
 * is made by the server once the sale is sent (INCOME.md row P.28).
 *
 * A full invoice names its buyer, and their civil ID or passport number is personal data: the
 * queue entry never holds it where the device can seal it (`posVault`). The sealed copy stays until
 * the sale is filed, whatever the server has answered meanwhile, so Try again and "Correct and send
 * again" can still name the buyer (Abdul, 1 Nov 2026); it is deleted the moment the sale is filed
 * and is never shown. A device that cannot seal keeps the buyer in the entry only until a final
 * refusal: nothing personal stays in plain text for a sale that may never go. A slip photo taken
 * offline waits with the sale, also until it is filed, and is then attached (`posSlipOutbox`).
 */

export type QueuedSale = {
  key: string
  tillId: string
  number: string
  body: PosSaleRequest
  /** The refusal that stopped the queue, worded on the till; null while it is only waiting. */
  refusal: string | null
  /** The buyer was taken out of `body` and sealed on the device, to be put back as it is sent. */
  sealed?: boolean
  /** Refused for good: not sent again by itself. A sealed buyer stays until a person resends it. */
  final?: boolean
  /** The refusal as the server gave it, for its sentence on the till. */
  refusalType?: string | null
  refusalValues?: Record<string, string>
  /** Server time this entry was last refused. */
  refusedAt?: string
  /** A refusal nobody has reviewed: tried again no sooner than this, and later each time. */
  notBefore?: string
  attempts?: number
  /** A manager set it aside on the server: not sent by itself, still open, still shown. */
  setAside?: boolean
}

const QUEUE_KEY = 'fawtir.pos.queue'
const NUMBER_NOTES_KEY = 'fawtir.pos.numberNotes'
const nextKey = (tillId: string) => `fawtir.pos.next.${tillId}`

function read<T>(key: string, fallback: T): T {
  try {
    const text = window.localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A till without storage still sells online; the queue lives in memory for this tab.
  }
}

/**
 * What a refusal means for a queued sale:
 * - `wait`: nothing is wrong with the sale, try again soon (sign-in, a lapse, a server fault, or a
 *   sale under a minute old on a server that files it from then on);
 * - `till`: the same answer stands for everything on this till until its cause clears (read-only,
 *   plan, the till retired, permission, the device clock): shown, tried again, later ones wait;
 * - `held`: this sale, until its cause clears or the server's rules for a queued sale apply: shown,
 *   tried again, later ones may pass;
 * - `final`: on the reviewed list below, the same sale can never get past it: shown, not tried again
 *   unless a person says so;
 * - `unknown`: anything else. We do not know that it cannot clear, so it is never given up on: shown,
 *   tried again with growing gaps, later ones may pass.
 */
export type RefusalVerdict = 'wait' | 'till' | 'held' | 'final' | 'unknown'

const WAIT_STATUS = new Set([401, 408, 425, 429])

const TILL_WIDE = new Set([
  'SUBSCRIPTION_SUSPENDED',
  'SUBSCRIPTION_READ_ONLY',
  'SUBSCRIPTION_RESTRICTED',
  'SUBSCRIPTION_CANCELLED',
  'POS_TILL_RETIRED',
  'POS_TILL_NOT_FOUND',
  'POS_SOLD_AT_IN_FUTURE',
  'BRANCH_NOT_ACTIVE',
  'SELLER_PARTICIPANT_NOT_VERIFIED',
])
const TILL_WIDE_SLUGS = new Set([
  'subscription-restricted',
  'plan-feature-not-included',
  'branch-not-in-scope',
])

/** An online rule (a queued sale passes it once a minute old), or a cause a person can clear. */
const HELD = new Set([
  'PERIOD_CLOSED',
  'POS_TILL_NUMBER_GAP',
  'POS_PRICE_NOT_CATALOGUE',
  'POS_PRICE_RULE_MISMATCH',
  'POS_PRODUCT_NOT_SELLABLE',
  'POS_VARIANT_NOT_SELLABLE',
  'POS_BUNDLE_SPLIT_REQUIRED',
  'INDUSTRIAL_CLASSIFICATION_REQUIRED',
  'CUSTOMER_NOT_FOUND',
  'CUSTOMER_NOT_INVOICE_ELIGIBLE',
])
const HELD_SLUGS = new Set(['quota-exceeded'])

/**
 * Reviewed against the till sale's refusals (`PosSaleService`, `InvoiceNumberAdapter`): each is about
 * what the request itself says, so sending the same request again cannot change the answer.
 */
const FINAL = new Set([
  'VALIDATION_FAILED',
  'POS_PAYMENTS_DO_NOT_MATCH_TOTAL',
  'POS_PAYMENT_INVALID',
  'POS_TIP_INVALID',
  'POS_CASH_TENDERED_TOO_LOW',
  'POS_CARD_APPROVAL_REQUIRED',
  'POS_ON_ACCOUNT_NEEDS_COMPANY',
  'POS_LINE_REF_INVALID',
  'POS_CUSTOMER_MISMATCH',
  'POS_BRANCH_MISMATCH',
  'POS_TRANSACTION_TYPE_MISMATCH',
  'POS_VAT_MODE_MISMATCH',
  'POS_CONSUMER_CONTACT_INVALID',
  'POS_INVOICE_NUMBER_REQUIRED',
  'POS_TILL_NUMBER_REPEATED',
  'POS_TILL_NUMBER_WRONG_SERIES',
  'POS_SALE_KEY_REUSED',
  'PRICE_RULE_STACKING_NOT_AVAILABLE',
  'SIMPLIFIED_INVOICE_LIMIT',
  'BUYER_IDENTIFIER_REQUIRED',
])
const FINAL_SLUGS = new Set(['validation-failed'])

function verdictOf(status: number, code: string | null, slug: string | null): RefusalVerdict {
  if (status >= 500 || WAIT_STATUS.has(status)) return 'wait'
  if (/^HTTP_(5\d\d|401|408|425|429)$/.test(code ?? '')) return 'wait'
  if (code === 'POS_QUEUED_SALE_TOO_EARLY') return 'wait'
  if (status === 403 || code === 'HTTP_403') return 'till'
  if ((code && TILL_WIDE.has(code)) || (slug && TILL_WIDE_SLUGS.has(slug))) return 'till'
  if ((code && HELD.has(code)) || (slug && HELD_SLUGS.has(slug))) return 'held'
  if ((code && FINAL.has(code)) || (slug && FINAL_SLUGS.has(slug))) return 'final'
  return 'unknown'
}

/**
 * An entry the previous version gave up on for a refusal that can clear (a till stuck by H-1) comes
 * back to life when this version loads.
 */
function revived(entry: QueuedSale): QueuedSale {
  if (!entry.final || !entry.refusal) return entry
  const verdict = verdictOf(0, entry.refusal, entry.refusalType ?? null)
  if (verdict === 'final') return entry
  const { final: _final, ...alive } = entry
  void _final
  return alive
}

let queue: QueuedSale[] =
  typeof window === 'undefined' ? [] : read<QueuedSale[]>(QUEUE_KEY, []).map(revived)
const listeners = new Set<() => void>()

function save(next: QueuedSale[]) {
  queue = next
  write(QUEUE_KEY, next)
  listeners.forEach((listener) => listener())
}

/** The number's running part: `NZW-T01-INV-2026-000123` is 123. */
export function numberValue(invoiceNumber: string): number | null {
  const match = /-(\d+)$/.exec(invoiceNumber)
  return match ? Number(match[1]) : null
}

/** `<series>-<year>-<value, six digits>`, as the server numbers the till's sales. */
export function formatTillNumber(series: string, year: number, value: number): string {
  return `${series}-${year}-${String(value).padStart(6, '0')}`
}

/** The next number this till will print offline: the server's, or further on if it sold since. */
export function nextTillNumber(till: PosTillDto): string | null {
  const series = till.series?.INVOICE
  if (!series) return null
  const local = read<number>(nextKey(till.id), 0)
  const queued = queue
    .filter((entry) => entry.tillId === till.id)
    .map((entry) => (numberValue(entry.number) ?? 0) + 1)
  const value = Math.max(series.nextValue, local, ...queued)
  return formatTillNumber(series.series, series.year, value)
}

/** After a sale is numbered, offline numbering continues from the one after it. */
export function noteNumberUsed(tillId: string, invoiceNumber: string) {
  const value = numberValue(invoiceNumber)
  if (value == null) return
  if (value + 1 > read<number>(nextKey(tillId), 0)) write(nextKey(tillId), value + 1)
}

export function queuedFor(tillId: string): QueuedSale[] {
  return queue
    .filter((entry) => entry.tillId === tillId)
    .sort((a, b) => (numberValue(a.number) ?? 0) - (numberValue(b.number) ?? 0))
}

/**
 * `behind`: the server answered, and this sale waits behind one it would not take yet, so the till
 * is not offline and its receipt must not say it is.
 */
export type SubmitResult = { sale: PosSaleDto } | { queued: QueuedSale; behind?: boolean }

export function refusalVerdict(error: ApiError): RefusalVerdict {
  return verdictOf(error.status, error.code, error.problemType)
}

/** A refusal that the same sale sent again cannot get past. */
export function isFinalRefusal(error: unknown): boolean {
  return error instanceof ApiError && refusalVerdict(error) === 'final'
}

/** The numbers from the server's next one up to, not including, this sale's. */
export function numbersBefore(number: string, expected: string): string[] {
  const value = numberValue(number)
  const from = numberValue(expected)
  if (value == null || from == null || from >= value || value - from > MAX_SKIPPED) return []
  const prefix = number.slice(0, number.lastIndexOf('-') + 1)
  const out: string[] = []
  for (let at = from; at < value; at++) out.push(`${prefix}${String(at).padStart(6, '0')}`)
  return out
}

const MAX_SKIPPED = 200

/**
 * Sends one numbered sale. Where the server allows it, a sale whose earlier numbers are stuck names
 * them when it is told it would leave a gap; they stay open for their own sales to be filed later.
 */
async function sendNumbered(body: PosSaleRequest, key: string, canSkip: boolean) {
  try {
    return await createPosSale(body, key)
  } catch (error) {
    const expected =
      canSkip && error instanceof ApiError && error.code === 'POS_TILL_NUMBER_GAP'
        ? error.problem.expectedNumber
        : null
    const skippedNumbers =
      typeof expected === 'string' && body.invoiceNumber
        ? numbersBefore(body.invoiceNumber, expected)
        : []
    if (skippedNumbers.length === 0) throw error
    return createPosSale({ ...body, skippedNumbers }, key)
  }
}

/** The buyer taken out of the entry, sealed on the device when it can be. */
async function sealed(entry: QueuedSale): Promise<QueuedSale> {
  const consumer = entry.body.customer.consumer
  if (!consumer || !(await sealBuyer(entry.key, consumer))) return entry
  const customer = { ...entry.body.customer }
  delete customer.consumer
  return { ...entry, body: { ...entry.body, customer }, sealed: true }
}

/** The body as it is sent: the sealed buyer put back, held only for the request. */
async function bodyToSend(entry: QueuedSale): Promise<PosSaleRequest> {
  if (!entry.sealed) return entry.body
  const consumer = await openBuyer(entry.key)
  return consumer ? { ...entry.body, customer: { ...entry.body.customer, consumer } } : entry.body
}

/** Nothing personal is left of a sale the server has filed. */
async function forget(entry: QueuedSale) {
  await forgetBuyer(entry.key)
}

/**
 * A sale the server had already filed before its queued copy arrived (the online answer was lost)
 * can be filed under another number than its receipt. The server says so only on that replay, while
 * the queue sends in the background, so the till keeps it and tells the cashier on the next sale's
 * Done screen, with the other warnings.
 */
type NumberNote = { tillId: string; printed: string; filed: string }

function notePrintedNumberDiffers(entry: QueuedSale, sale: PosSaleDto) {
  if (!sale.warnings?.some((warning) => warning.code === 'POS_PRINTED_NUMBER_DIFFERS')) return
  const note = { tillId: entry.tillId, printed: entry.number, filed: sale.invoiceNumber }
  write(NUMBER_NOTES_KEY, [...read<NumberNote[]>(NUMBER_NOTES_KEY, []), note])
}

function withNumberNotes(tillId: string, sale: PosSaleDto): PosSaleDto {
  const notes = read<NumberNote[]>(NUMBER_NOTES_KEY, [])
  const mine = notes.filter((note) => note.tillId === tillId)
  if (mine.length === 0) return sale
  write(
    NUMBER_NOTES_KEY,
    notes.filter((note) => note.tillId !== tillId),
  )
  return {
    ...sale,
    warnings: [
      ...sale.warnings,
      ...mine.map(({ printed, filed }) => ({
        code: 'POS_PRINTED_NUMBER_DIFFERS',
        line: null,
        printed,
        filed,
      })),
    ],
  }
}

/**
 * Sends one sale, or numbers it and keeps it when the till is offline (or already has a queue).
 * A refusal (`ApiError`) is not queued: it is the cashier's to put right, so it is thrown.
 * `photos` are bank slips scanned while offline: kept with the sale, attached once it is filed.
 */
export async function submitSale(
  till: PosTillDto,
  body: PosSaleRequest,
  key: string,
  photos: SlipPhoto[] = [],
): Promise<SubmitResult> {
  const enqueue = async (): Promise<SubmitResult> => {
    const number = nextTillNumber(till)
    if (!number) throw new NetworkError('offline')
    // Taken now, before the awaits below: a second sale must not print the same number.
    noteNumberUsed(till.id, number)
    const entry = await sealed({
      key,
      tillId: till.id,
      number,
      body: { ...body, queuedOffline: true, invoiceNumber: number },
      refusal: null,
    })
    save([...queue, entry])
    return { queued: entry }
  }
  await holdSlipPhotos(key, till.id, photos)
  const canSkip = till.openNumbers === true
  capable.set(till.id, canSkip)
  // The older sales go first: once they are in, this one is sent as an ordinary online sale and
  // its receipt says so (E2E 29 Oct 2026, F-5). Only while some still wait does it join them.
  const outcome: FlushOutcome = queuedFor(till.id).length > 0 ? await flushQueue(till.id) : 'done'
  const waiting = queuedFor(till.id)
  if (waiting.length === 0) {
    try {
      const sale = await createPosSale(body, key)
      noteNumberUsed(till.id, sale.invoiceNumber)
      void sendSlipPhotos(key, sale.saleId, till.id)
      return { sale: withNumberNotes(till.id, sale) }
    } catch (error) {
      if (error instanceof NetworkError) return enqueue()
      void dropSlipPhotos(key)
      throw error
    }
  }
  if (outcome === 'offline' || outcome === 'busy') return enqueue()
  // The server answered and every waiting sale is stuck on its own: this one need not wait. It goes
  // as an ordinary online sale, and the server takes a number past those it has refused.
  if (outcome === 'done' && canSkip) {
    try {
      const sale = await createPosSale(body, key)
      noteNumberUsed(till.id, sale.invoiceNumber)
      void sendSlipPhotos(key, sale.saleId, till.id)
      return { sale: withNumberNotes(till.id, sale) }
    } catch (error) {
      if (error instanceof NetworkError) return enqueue()
      void dropSlipPhotos(key)
      throw error
    }
  }
  // Read-only, the plan, a retired till: an online sale would get the same answer, so it is the
  // cashier's to know now, before a receipt exists. It is not printed and not queued.
  if (outcome !== 'done' && outcome.verdict === 'till') {
    void dropSlipPhotos(key)
    throw outcome.error
  }
  const queued = await enqueue()
  return { ...queued, behind: true }
}

let flushing = false
/** Whether the server takes `skippedNumbers`, as the till last said (`openNumbers`). */
const capable = new Map<string, boolean>()

/** Tells the queue what this till's server allows; until then it keeps strict number order. */
export function noteTillServer(till: Pick<PosTillDto, 'id' | 'openNumbers'>) {
  capable.set(till.id, till.openNumbers === true)
}

/**
 * - `done`: nothing further could be sent (the queue is empty, or what is left is stuck on its own);
 * - `offline`: no answer; `busy`: another run is sending;
 * - otherwise the refusal that stopped the run.
 */
export type FlushOutcome =
  'done' | 'offline' | 'busy' | { verdict: RefusalVerdict; error: ApiError }

let retryTimer: ReturnType<typeof setTimeout> | null = null

/** A sale under a minute old is sent again the moment the server will take it. */
function retryAfter(tillId: string, error: ApiError) {
  const stated = error.problem.retryAfterSeconds
  const seconds = typeof stated === 'number' ? stated : error.retryAfterSeconds
  if (seconds == null || retryTimer) return
  retryTimer = setTimeout(
    () => {
      retryTimer = null
      void flushQueue(tillId)
    },
    Math.min(seconds, 300) * 1000,
  )
}

const FIRST_GAP_MS = 60_000
const LONGEST_GAP_MS = 60 * 60_000

function refusedEntry(entry: QueuedSale, error: ApiError, verdict: RefusalVerdict): QueuedSale {
  const final = verdict === 'final'
  const attempts = verdict === 'unknown' ? (entry.attempts ?? 0) + 1 : 0
  const refused: QueuedSale = {
    ...entry,
    refusal: error.code ?? `HTTP_${error.status}`,
    refusalType: error.problemType,
    refusalValues: refusalValues(error),
    refusedAt: new Date().toISOString(),
    attempts,
    notBefore: attempts
      ? new Date(
          Date.now() + Math.min(FIRST_GAP_MS * 2 ** (attempts - 1), LONGEST_GAP_MS),
        ).toISOString()
      : undefined,
    ...(final ? { final: true } : {}),
  }
  // Only a buyer this device could not seal: plain text does not stay for a sale that may never go.
  if (final && refused.body.customer.consumer) {
    const customer = { ...refused.body.customer }
    delete customer.consumer
    refused.body = { ...refused.body, customer }
  }
  return refused
}

/**
 * Sends the till's queued sales oldest number first. A sale the server would not take stays, with
 * its reason; later ones go past it only where the server allows that, and only when the refusal is
 * about that sale alone.
 */
export async function flushQueue(tillId: string): Promise<FlushOutcome> {
  if (flushing) return 'busy'
  flushing = true
  const canSkip = capable.get(tillId) === true
  try {
    for (const entry of queuedFor(tillId)) {
      const resting = entry.notBefore != null && Date.now() < Date.parse(entry.notBefore)
      if (entry.final || entry.setAside || resting) {
        if (canSkip) continue
        return 'done'
      }
      try {
        const sale = await sendNumbered(await bodyToSend(entry), entry.key, canSkip)
        notePrintedNumberDiffers(entry, sale)
        save(queue.filter((other) => other.key !== entry.key))
        await forget(entry)
        void sendSlipPhotos(entry.key, sale.saleId, tillId)
      } catch (error) {
        const refusalOver = () =>
          save(
            queue.map((other) =>
              other.key === entry.key
                ? { ...other, refusal: null, refusalType: null, refusalValues: {} }
                : other,
            ),
          )
        if (!(error instanceof ApiError)) {
          // No answer: the server may have filed it, so an old refusal no longer says where it stands.
          if (error instanceof NetworkError) refusalOver()
          return 'offline'
        }
        const verdict = refusalVerdict(error)
        if (verdict === 'wait') {
          // Not a problem with the sale: it only waits, and whatever a past refusal said is over.
          refusalOver()
          retryAfter(tillId, error)
          return { verdict, error }
        }
        const final = verdict === 'final'
        // Refused is not filed: the sealed buyer and any slip photo stay for Try again.
        save(
          queue.map((other) =>
            other.key === entry.key ? refusedEntry(other, error, verdict) : other,
          ),
        )
        if (verdict === 'till') return { verdict, error }
        if (!canSkip) return final ? 'done' : { verdict, error }
      }
    }
    return 'done'
  } finally {
    flushing = false
    void retrySlipPhotos(tillId)
  }
}

/**
 * Try again, for a person who has put the cause right: the same sale with the same key, so a sale
 * the server already has is answered as it was and nothing is paid or filed twice.
 */
export async function retryQueuedSale(tillId: string, key: string): Promise<FlushOutcome> {
  save(
    queue.map((entry) => {
      if (entry.key !== key) return entry
      const { final: _final, notBefore: _notBefore, setAside: _setAside, ...again } = entry
      void _final
      void _notBefore
      void _setAside
      return again
    }),
  )
  return flushQueue(tillId)
}

/** The server has it set aside: this device stops sending it by itself, and keeps it. */
export function markQueuedSaleSetAside(key: string) {
  save(queue.map((entry) => (entry.key === key ? { ...entry, setAside: true } : entry)))
}

/**
 * A manager's correction, sent again on the printed number and under the same key: the refused
 * attempts left nothing on the server, and if one did go through, the server says so rather than
 * filing twice. Only the payments change, so the invoice and the customer's receipt still agree.
 */
export async function correctQueuedSale(
  tillId: string,
  key: string,
  payments: PosSaleRequest['payments'],
): Promise<FlushOutcome> {
  save(
    queue.map((entry) => {
      if (entry.key !== key) return entry
      const { final: _final, notBefore: _notBefore, setAside: _setAside, ...again } = entry
      void _final
      void _notBefore
      void _setAside
      return { ...again, body: { ...again.body, payments } }
    }),
  )
  return flushQueue(tillId)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The till's queue as it stands, for the screens that show it. */
export function useQueuedSales(tillId: string | null): QueuedSale[] {
  const all = useSyncExternalStore(subscribe, () => queue)
  return tillId
    ? all
        .filter((entry) => entry.tillId === tillId)
        .sort((a, b) => (numberValue(a.number) ?? 0) - (numberValue(b.number) ?? 0))
    : []
}

/**
 * The till's waiting sales, sent again whenever the browser comes back online, the page is looked
 * at again, and every minute, so a sale held by a cause that cleared (the subscription paid) goes
 * by itself.
 */
export function usePosQueue(tillId: string | null): QueuedSale[] {
  const entries = useQueuedSales(tillId)
  useEffect(() => {
    if (!tillId) return
    void flushQueue(tillId)
    const again = () => void flushQueue(tillId)
    const onVisible = () => {
      if (document.visibilityState === 'visible') again()
    }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(again, 60_000)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [tillId])
  return entries
}

/** For tests. */
export function resetPosQueue() {
  flushing = false
  capable.clear()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  save([])
}
