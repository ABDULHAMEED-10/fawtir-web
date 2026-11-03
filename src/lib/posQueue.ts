import { useEffect, useSyncExternalStore } from 'react'
import { ApiError, NetworkError } from '../api'
import {
  createPosSale,
  type PosPerson,
  type PosPrintedTotals,
  type PosSaleDto,
  type PosSaleRequest,
  type PosTillDto,
} from '../api/pos/pos'
import { signQueuedSale } from './posSigning/signingKey'
import {
  dropSlipPhotos,
  holdSlipPhotos,
  retrySlipPhotos,
  sendSlipPhotos,
  type SlipPhoto,
} from './posSlipOutbox'
import { refusalValues } from './posRefusals'
import { BUSINESS_TIME_ZONE } from './format'
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
  /**
   * The buyer was in plain text on a device that cannot seal, and went at the final refusal: the
   * sale cannot be sent from this device any more, since a full invoice has to name them.
   */
  buyerRemoved?: boolean
  /**
   * Who was signed in on this device when the sale was queued. It is editable here and proves
   * nothing (owner round 5, P3b and point 11), so the server is only ever told it as an untrusted
   * claim it records and decides nothing on (`claimedMakerUnverified`, owner Round 13, L-2). Here it
   * decides whose session sends the entry by itself: the maker's alone. Anyone else sends it with
   * "Send for {cashier}", knowing that it files with them as the sender. Absent on an entry queued
   * before this was kept: its maker is unknown, so no session counts as theirs and it goes only by
   * that explicit action.
   */
  madeBy?: PosPerson
}

/**
 * Whose waiting sales a session sends without being asked. `explicitKey` is one entry a person has
 * chosen to send, whoever made it (Try again, Send for). A session with no known user sends nothing
 * by itself: an unknown sender cannot be the maker. Left out, `sender` is the person the till
 * screens last noted (`noteQueueSender`), read when the send starts: a timer set before a sign-out
 * must not send the last person's sales on the next person's session.
 */
export type FlushOptions = { sender?: string | null; explicitKey?: string }

/** Who the mounted till screens say is signed in; null while none is mounted. */
let deviceSender: string | null = null

/**
 * Moves whenever the person the till screens name changes, and at sign-out. A run started under one
 * person sends nothing further once it has moved (PRV43-OFF L-1): sign-out does not wait for a slow
 * run, and the run's next POST would carry the next person's session, filing the first person's
 * LEGACY sale as theirs.
 */
let senderGeneration = 0

/** Set by the till screens while they are mounted, cleared when they go (sign-out included). */
export function noteQueueSender(userId: string | null) {
  if (userId !== deviceSender) senderGeneration += 1
  deviceSender = userId
}

/**
 * Called just before signing out, so a run still sending stops before its next sale. The one already
 * on the wire cannot be recalled: it went with the signing-out person's session and carries its own
 * key, so it is filed once, under them, whatever the next person does.
 */
export function stopQueueSendsForSignOut() {
  senderGeneration += 1
}

function sendsByItself(entry: QueuedSale, sender: string | null | undefined): boolean {
  return !!sender && entry.madeBy?.userId === sender
}

const QUEUE_KEY = 'fawtir.pos.queue'
const NUMBER_NOTES_KEY = 'fawtir.pos.numberNotes'
const legacyNextKey = (tillId: string) => `fawtir.pos.next.${tillId}`
const nextKey = (tillId: string, prefix: string) => `fawtir.pos.next.${tillId}.${prefix}`

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
    // A till without storage still sells online.
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
  // Held before issue (PENDING_VALIDATION): nothing is stored or numbered on the server, and the same
  // key goes through once the item has its HS code, which the server takes on the resend. It clears
  // only when a person adds the code, and every attempt is audited (PosOfflineSaleHeldForValidation),
  // so it backs off like an unknown refusal instead of `held`'s every-minute retry; Try again sends
  // it at once.
  if (code === 'POS_QUEUED_SALE_HS_CODE_REQUIRED') return 'unknown'
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

/** The queue text this tab last read or wrote; undefined until it has. */
let seenText: string | null | undefined
/** False once a write failed: this tab's memory then holds sales storage does not, and stays in charge. */
let storageHoldsQueue = true

/**
 * The queue as storage holds it now. Another tab of the till (or a second window) writes the same key,
 * and this tab used to keep the copy it loaded and write it back whole: a sale the other tab had queued,
 * printed and not yet sent vanished from the device, and its number with it (B37 OFF-4). Every change
 * is made to this fresh copy, in the same task as its write.
 */
function synced(): QueuedSale[] {
  if (typeof window === 'undefined' || !storageHoldsQueue) return queue
  let text: string | null
  try {
    text = window.localStorage.getItem(QUEUE_KEY)
  } catch {
    return queue
  }
  if (text === seenText) return queue
  try {
    queue = text ? (JSON.parse(text) as QueuedSale[]).map(revived) : []
    seenText = text
  } catch {
    // Unreadable text is never taken for an empty queue: this tab keeps what it has.
  }
  return queue
}

function save(next: QueuedSale[]) {
  queue = next
  const text = JSON.stringify(next)
  try {
    window.localStorage.setItem(QUEUE_KEY, text)
    seenText = text
    storageHoldsQueue = true
  } catch {
    // A till without storage still sells online; the queue lives in memory for this tab.
    storageHoldsQueue = false
  }
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== QUEUE_KEY && event.key !== null) return
    const before = queue
    if (synced() !== before) listeners.forEach((listener) => listener())
  })
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

/** `NZW-T01-INV-2026-000123` is `NZW-T01-INV-2026`: the series and year one sequence runs in. */
export function numberPrefix(invoiceNumber: string): string | null {
  const match = /^(.+-\d{4})-\d+$/.exec(invoiceNumber)
  return match ? match[1] : null
}

/**
 * The sale's year in the zone the server counts the till's series in (`series.timeZone`, the tenant's
 * business zone), so a tenant outside Oman is not numbered on Muscat's new year (B37 OFF-6). Asia/Muscat
 * only for a server that does not say. A zone this browser cannot read gives no year, so no offline
 * number, rather than a guess that could be refused for good.
 */
function businessYear(instant: string | undefined, timeZone: string | undefined): number | null {
  const at = instant ? new Date(instant) : new Date()
  try {
    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? BUSINESS_TIME_ZONE,
      year: 'numeric',
    }).format(Number.isNaN(at.getTime()) ? new Date() : at)
    return Number(year)
  } catch {
    return null
  }
}

function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing stored, nothing to forget.
  }
}

/**
 * A counter written before it was kept per series and year (B36 OFF-1) belongs to no year, so it is
 * adopted once, into the sequence in use now, and dropped. Adopting it at the first read after the
 * update, rather than ignoring it, keeps a till with a stale `nextValue` from reprinting a number it
 * has already used this year; it can only be wrong for a device left unused across both the update
 * and a new year, and then it prints too high (a gap the server refuses), never a repeat.
 */
function adoptLegacyCounter(tillId: string, prefix: string) {
  const legacy = read<number | null>(legacyNextKey(tillId), null)
  if (typeof legacy !== 'number') return
  if (legacy > read<number>(nextKey(tillId, prefix), 0)) write(nextKey(tillId, prefix), legacy)
  removeStored(legacyNextKey(tillId))
}

/**
 * The next number this till will print offline: the server's, or further on if it sold since.
 *
 * The server numbers each series per year from 1 and refuses a number whose year is not the sale's
 * business year (`InvoiceNumberAdapter.claimTillNumber`, POS_TILL_NUMBER_WRONG_SERIES), so only this
 * year's counter and this year's queued numbers count. When the till's series is of another year
 * than the sale (it was read before midnight and the till has been offline since) this device does
 * not know where the new year's sequence stands, and any number it printed could repeat one the
 * server already gave: no number, so no receipt, until the till is read again online (B36 OFF-1).
 * Before, the old year was printed on a new-year sale and refused for good, and once the year was
 * read again the old year's counter carried over and left a gap every later sale waited behind.
 */
export function nextTillNumber(till: PosTillDto, soldAt?: string): string | null {
  const series = till.series?.INVOICE
  if (!series) return null
  const year = businessYear(soldAt, series.timeZone)
  if (year == null || series.year !== year) return null
  const prefix = `${series.series}-${year}`
  adoptLegacyCounter(till.id, prefix)
  const local = read<number>(nextKey(till.id, prefix), 0)
  const queued = synced()
    .filter((entry) => entry.tillId === till.id && numberPrefix(entry.number) === prefix)
    .map((entry) => (numberValue(entry.number) ?? 0) + 1)
  const value = Math.max(series.nextValue, local, ...queued)
  return formatTillNumber(series.series, year, value)
}

/** After a sale is numbered, offline numbering continues from the one after it, in its own year. */
export function noteNumberUsed(tillId: string, invoiceNumber: string) {
  const value = numberValue(invoiceNumber)
  const prefix = numberPrefix(invoiceNumber)
  if (value == null || prefix == null) return
  adoptLegacyCounter(tillId, prefix)
  if (value + 1 > read<number>(nextKey(tillId, prefix), 0)) write(nextKey(tillId, prefix), value + 1)
}

export function queuedFor(tillId: string): QueuedSale[] {
  return synced()
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

/**
 * The queued body with its proof and printed totals, or as it was when this till cannot sign it
 * (owner M-6: capable tills sign, older tills stay compatible). `printed` is part of what is signed
 * and is sent only beside a proof: without one there is nothing it would add.
 */
async function signedIfPossible(
  till: PosTillDto,
  body: PosSaleRequest,
  key: string,
  printed: PosPrintedTotals | undefined,
): Promise<PosSaleRequest> {
  if (!printed || !till.openShift) return body
  const signed = await signQueuedSale({ ...body, printed }, key, {
    shiftId: till.openShift.shiftId,
    cashierUserId: till.openShift.cashier.userId,
  })
  return signed ? { ...signed.body, offlineProof: signed.offlineProof } : body
}

/** The buyer taken out of the entry, sealed on the device when it can be. */
async function sealed(entry: QueuedSale): Promise<QueuedSale> {
  const consumer = entry.body.customer.consumer
  if (!consumer || !(await sealBuyer(entry.key, consumer))) return entry
  const customer = { ...entry.body.customer }
  delete customer.consumer
  return { ...entry, body: { ...entry.body, customer }, sealed: true }
}

/**
 * The body as it is sent: the sealed buyer put back, held only for the request. Null when the sealed
 * buyer cannot be opened. The body used to go without them: the server refused it for good
 * (POS_CUSTOMER_MISMATCH), so a vault that failed for a moment stopped the sale until a person pressed
 * Try again, and a sale the server had already filed under this key came back POS_SALE_KEY_REUSED
 * instead of its replay (B38 OFF). A full invoice is never filed without its buyer either way.
 */
async function bodyToSend(entry: QueuedSale): Promise<PosSaleRequest | null> {
  const body = withMakerClaim(entry)
  if (!entry.sealed) return body
  const consumer = await openBuyer(entry.key)
  return consumer ? { ...body, customer: { ...body.customer, consumer } } : null
}

/**
 * The maker as a claim the server records and never trusts (owner Round 13, L-2). Added when the
 * entry is sent, not when it is queued, so an entry queued before this release carries it too; the
 * server keeps it out of its request hashes, so the same sale with or without it is one sale. Never
 * on a signed body: every field of one is signed, and adding a field after signing breaks the proof.
 * Never to a server that has not said it takes it: it would refuse the unknown field.
 */
function withMakerClaim(entry: QueuedSale): PosSaleRequest {
  const maker = entry.madeBy?.userId
  if (!maker || entry.body.offlineProof || takesClaim.get(entry.tillId) !== true) return entry.body
  return { ...entry.body, claimedMakerUnverified: maker }
}

/** Not a server refusal: this device could not open the buyer, so nothing was sent. */
export const BUYER_UNAVAILABLE = 'POS_QUEUED_BUYER_UNAVAILABLE'

/** Nothing personal is left of a sale the server has filed. */
async function forget(entry: QueuedSale) {
  await forgetBuyer(entry.key)
}

/**
 * A sale the server had already filed before its queued copy arrived (the online answer was lost)
 * can be filed under another number than its receipt. The server says so only on that replay, while
 * the queue sends in the background, so the till keeps it and tells the cashier on the next sale's
 * Done screen, with the other warnings. Every other warning of a queued sale is said the same way,
 * naming the sale: the server says it only on that send, nobody is looking at it then, and a warning
 * the server gives for a sale filed past a rule (stock below zero, a discount above the cashier's
 * limit, filed while restricted) is the one the manager is meant to see. Only the HS-code warning
 * used to be kept, so the rest were dropped on the floor (B37 OFF-8).
 */
type NumberNote = {
  tillId: string
  filed: string
  printed?: string
  code?: string
  line?: number | null
}

function noteForNextSale(entry: QueuedSale, sale: PosSaleDto) {
  const notes = (sale.warnings ?? []).map<NumberNote>((warning) =>
    warning.code === 'POS_PRINTED_NUMBER_DIFFERS'
      ? { tillId: entry.tillId, printed: entry.number, filed: sale.invoiceNumber }
      : { tillId: entry.tillId, filed: sale.invoiceNumber, code: warning.code, line: warning.line },
  )
  if (notes.length > 0) {
    write(NUMBER_NOTES_KEY, [...read<NumberNote[]>(NUMBER_NOTES_KEY, []), ...notes])
  }
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
      ...mine.map(({ printed, filed, code, line }) =>
        code
          ? { code, line: line ?? null, filed }
          : { code: 'POS_PRINTED_NUMBER_DIFFERS', line: null, printed, filed },
      ),
    ],
  }
}

/**
 * Sends one sale, or numbers it and keeps it when the till is offline (or already has a queue).
 * A refusal (`ApiError`) is not queued: it is the cashier's to put right, so it is thrown.
 * `photos` are bank slips scanned while offline: kept with the sale, attached once it is filed.
 * `maker` is the signed-in person: kept on a queued entry so only their session sends it by itself,
 * and the waiting sales sent first are theirs only.
 */
export async function submitSale(
  till: PosTillDto,
  body: PosSaleRequest,
  key: string,
  photos: SlipPhoto[] = [],
  printed?: PosPrintedTotals,
  maker: PosPerson | null = null,
): Promise<SubmitResult> {
  const enqueue = async (): Promise<SubmitResult> => {
    const number = nextTillNumber(till, body.soldAt)
    if (!number) throw new NetworkError('offline')
    // Taken now, before the awaits below: a second sale must not print the same number.
    noteNumberUsed(till.id, number)
    // Signed before the buyer is sealed, so the signed body is the body `bodyToSend` rebuilds (WEB-3).
    const entry = await sealed({
      key,
      tillId: till.id,
      number,
      body: await signedIfPossible(
        till,
        { ...body, queuedOffline: true, invoiceNumber: number },
        key,
        printed,
      ),
      refusal: null,
      ...(maker
        ? { madeBy: maker }
        : deviceSender
          ? { madeBy: { userId: deviceSender, name: null } }
          : {}),
    })
    save([...synced(), entry])
    return { queued: entry }
  }
  await holdSlipPhotos(key, till.id, photos)
  const canSkip = till.openNumbers === true
  capable.set(till.id, canSkip)
  // The older sales go first: once they are in, this one is sent as an ordinary online sale and
  // its receipt says so (E2E 29 Oct 2026, F-5). Only while some still wait does it join them.
  const outcome: FlushOutcome =
    queuedFor(till.id).length > 0
      ? await flushQueue(till.id, maker ? { sender: maker.userId } : {})
      : 'done'
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
/** Callers that found a run sending and wait for it to end rather than start a second one. */
const idleWaiters = new Set<() => void>()

function whenIdle(): Promise<void> {
  if (!flushing) return Promise.resolve()
  return new Promise((wake) => idleWaiters.add(wake))
}

/** Whether the server takes `skippedNumbers`, as the till last said (`openNumbers`). */
const capable = new Map<string, boolean>()
/** Whether the server takes `claimedMakerUnverified`, as the till last said (`takesMakerClaim`). */
const takesClaim = new Map<string, boolean>()

/** Tells the queue what this till's server allows; until then it keeps strict number order. */
export function noteTillServer(till: Pick<PosTillDto, 'id' | 'openNumbers' | 'takesMakerClaim'>) {
  capable.set(till.id, till.openNumbers === true)
  takesClaim.set(till.id, till.takesMakerClaim === true)
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

function nextTry(attempts: number): string {
  return new Date(
    Date.now() + Math.min(FIRST_GAP_MS * 2 ** (attempts - 1), LONGEST_GAP_MS),
  ).toISOString()
}

/** Held on the device like an unknown refusal: tried again with growing gaps, and at Try again. */
function buyerUnavailable(entry: QueuedSale): QueuedSale {
  const attempts = (entry.attempts ?? 0) + 1
  return {
    ...entry,
    refusal: BUYER_UNAVAILABLE,
    refusalType: null,
    refusalValues: {},
    refusedAt: new Date().toISOString(),
    attempts,
    notBefore: nextTry(attempts),
  }
}

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
    notBefore: attempts ? nextTry(attempts) : undefined,
    ...(final ? { final: true } : {}),
  }
  // Only a buyer this device could not seal: plain text does not stay for a sale that may never go.
  if (final && refused.body.customer.consumer) {
    const customer = { ...refused.body.customer }
    delete customer.consumer
    refused.body = { ...refused.body, customer }
    refused.buyerRemoved = true
  }
  return refused
}

/**
 * Sends the till's queued sales oldest number first. A sale the server would not take stays, with
 * its reason; later ones go past it only where the server allows that, and only when the refusal is
 * about that sale alone. Only the entries `sender` made go by themselves, and `explicitKey`; any
 * other entry is passed like one set aside, so in strict order it holds the later ones back.
 */
export async function flushQueue(
  tillId: string,
  { sender = deviceSender, explicitKey }: FlushOptions = {},
): Promise<FlushOutcome> {
  if (flushing) return 'busy'
  flushing = true
  const generation = senderGeneration
  const canSkip = capable.get(tillId) === true
  try {
    for (const entry of queuedFor(tillId)) {
      if (entry.key !== explicitKey && !sendsByItself(entry, sender)) {
        if (canSkip) continue
        return 'done'
      }
      const resting = entry.notBefore != null && Date.now() < Date.parse(entry.notBefore)
      if (entry.final || entry.setAside || resting) {
        if (canSkip) continue
        return 'done'
      }
      const body = await bodyToSend(entry)
      if (!body) {
        save(synced().map((other) => (other.key === entry.key ? buyerUnavailable(other) : other)))
        if (canSkip) continue
        return 'done'
      }
      // After the body is read, which can wait on the device's key store: the last moment before the
      // POST takes whichever session is current.
      if (senderGeneration !== generation) return 'done'
      try {
        const sale = await sendNumbered(body, entry.key, canSkip)
        noteForNextSale(entry, sale)
        save(synced().filter((other) => other.key !== entry.key))
        await forget(entry)
        void sendSlipPhotos(entry.key, sale.saleId, tillId)
      } catch (error) {
        const refusalOver = () =>
          save(
            synced().map((other) =>
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
          synced().map((other) =>
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
    idleWaiters.forEach((wake) => wake())
    idleWaiters.clear()
    void retrySlipPhotos(tillId)
  }
}

/**
 * - `offline`: the browser says it has no connection, so nothing was tried;
 * - `timeout`: the bound ran out while a send was still on its way. That send is not cancelled: it
 *   carries its own key, so whatever the server does with it, it is filed once, and the queue keeps
 *   the entry until it is.
 */
export type ShiftEndFlush = {
  outcome: FlushOutcome | 'timeout'
  left: QueuedSale[]
}

/**
 * One bounded attempt to send the till's waiting sales before its shift is closed or its cashier
 * signs out (OFFSEC41 §6.3, owner batch 42 OFF-4). A queued sale that reaches the server after its
 * shift has ended is not in that shift's close, and a signed one is held for a manager (O-1), so
 * sending it while the shift is still open saves a recount and a review.
 *
 * It only ever goes through `flushQueue`: the same single sender, the same keys, the same bodies
 * (signed, if at all, when they were queued; never again here), and the same backoff, so an entry a
 * person must look at first is not forced through. While another run is sending it waits for that
 * run rather than starting a second one. It never removes an entry the server has not filed, and it
 * never stops the close or the sign-out: what is left is the caller's to show (blocking the close is
 * a policy the owner has not approved). Only `sender`'s own entries go (owner round 5, P3b): whoever
 * else is closing sees the rest left, and sends them with Send for if they choose.
 */
export async function flushBeforeShiftEnd(
  tillId: string,
  { timeoutMs = 15_000, sender }: { timeoutMs?: number; sender?: string | null } = {},
): Promise<ShiftEndFlush> {
  if (queuedFor(tillId).length === 0) return { outcome: 'done', left: [] }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { outcome: 'offline', left: queuedFor(tillId) }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const run = (async (): Promise<FlushOutcome> => {
    const first = await flushQueue(tillId, { sender })
    if (first !== 'busy') return first
    await whenIdle()
    return flushQueue(tillId, { sender })
  })()
  try {
    const outcome = await Promise.race([run, deadline])
    return { outcome, left: queuedFor(tillId) }
  } finally {
    clearTimeout(timer)
  }
}

/** Every sale still on this device, on any till and whoever made it: what sign-out warns about. */
export function queuedOnDevice(): number {
  return synced().length
}

/**
 * Sign-out's turn at the same bounded attempt, for ONE till only, and only when the caller has
 * checked that the signed-in person holds that till's open shift (`TillState.mine`); pass null
 * otherwise and nothing is sent. A queued sale with no proof on a till that never registered a key
 * is filed under whoever sends it, into that till's open shift or a new one in the sender's name
 * (LEGACY). Sending another till's queue, or a till someone else is on, would file a colleague's
 * sales as the person signing out, which the owner's no-reattribution rule forbids (PRV42W-1).
 * Returns what is left on the whole device, so the warning covers the other tills too. Even on their
 * own till only the entries the person signing out made go (owner round 5, P3b).
 */
export async function flushBeforeSignOut(
  ownTillId: string | null,
  { timeoutMs = 10_000, sender }: { timeoutMs?: number; sender?: string | null } = {},
): Promise<{ left: number }> {
  if (ownTillId) await flushBeforeShiftEnd(ownTillId, { timeoutMs, sender })
  return { left: queuedOnDevice() }
}

/**
 * Try again, for a person who has put the cause right: the same sale with the same key, so a sale
 * the server already has is answered as it was and nothing is paid or filed twice. Also Send for: a
 * person's explicit choice to send an entry someone else made, or whose maker is unknown.
 */
export async function retryQueuedSale(
  tillId: string,
  key: string,
  sender?: string | null,
): Promise<FlushOutcome> {
  save(
    synced().map((entry) => {
      if (entry.key !== key) return entry
      const { final: _final, notBefore: _notBefore, setAside: _setAside, ...again } = entry
      void _final
      void _notBefore
      void _setAside
      return again
    }),
  )
  return flushQueue(tillId, { sender, explicitKey: key })
}

/** The server has it set aside: this device stops sending it by itself, and keeps it. */
export function markQueuedSaleSetAside(key: string) {
  save(synced().map((entry) => (entry.key === key ? { ...entry, setAside: true } : entry)))
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
  sender?: string | null,
): Promise<FlushOutcome> {
  save(
    synced().map((entry) => {
      if (entry.key !== key) return entry
      const { final: _final, notBefore: _notBefore, setAside: _setAside, ...again } = entry
      void _final
      void _notBefore
      void _setAside
      // The old proof covers the old payments, and nobody here may sign as the cashier again: the
      // corrected sale goes unsigned, with no printed totals either since the two travel together,
      // and a binding-capable server holds it for a manager (WEB-4).
      const { offlineProof: _proof, printed: _printed, ...unsigned } = again.body
      void _proof
      void _printed
      return { ...again, body: { ...unsigned, payments } }
    }),
  )
  return flushQueue(tillId, { sender, explicitKey: key })
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
 * by itself. Only the entries `sender` made (owner round 5, P3b).
 */
export function usePosQueue(tillId: string | null, sender: string | null = null): QueuedSale[] {
  const entries = useQueuedSales(tillId)
  useEffect(() => {
    noteQueueSender(sender)
    if (!tillId) return () => noteQueueSender(null)
    void flushQueue(tillId, { sender })
    const again = () => void flushQueue(tillId, { sender })
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
      noteQueueSender(null)
    }
  }, [tillId, sender])
  return entries
}

/** For tests. */
export function resetPosQueue() {
  deviceSender = null
  senderGeneration = 0
  flushing = false
  idleWaiters.forEach((wake) => wake())
  idleWaiters.clear()
  capable.clear()
  takesClaim.clear()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  save([])
}
