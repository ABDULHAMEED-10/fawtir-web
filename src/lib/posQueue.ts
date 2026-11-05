import { useEffect, useSyncExternalStore } from 'react'
import { ApiError, NetworkError, serverCode } from '../api'
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
import {
  beginNumbering,
  ensureTillLock,
  PosTillLockUnavailable,
  releaseTillLocks,
  subscribeTillLocks,
  tillLockState,
  type TillLockState,
} from './posTillLock'

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
 * till, open, until it is filed. Later sales never go past it: this build keeps strict number
 * order whatever the server says (`opensNumbers`, Q-27), so they wait behind it, in order, and are
 * numbered and printed meanwhile.
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
  /**
   * An earlier build's record that a manager set it aside on a server with open numbers: not sent
   * by itself, still open, still shown. This build never sets it (Q-27).
   */
  setAside?: boolean
  /**
   * Try again or a correction cleared `setAside`. Kept only so the till can still say so, as a note
   * from this device: it is never sent (only `body` goes to the server), decides nothing here, and
   * is not evidence (DES43 §5.6 option (b), NF7R).
   */
  setAsideSeen?: true
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
  // The next person may open the till in another tab; this one stops numbering offline for it.
  releaseTillLocks()
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

/**
 * Why this device's storage could not be trusted with an offline sale (POS-MEMQ):
 * - `quota`: the write was refused for space;
 * - `denied`: storage threw anything else, private browsing and blocked site data included;
 * - `mismatch`: the write was accepted but reading it back gave something else;
 * - `unreadable`: what is stored cannot be read as what was written there.
 */
export type StorageFailureReason = 'quota' | 'denied' | 'mismatch' | 'unreadable'
export type StorageWrite = 'ok' | StorageFailureReason

function failureOf(error: unknown): StorageFailureReason {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown }
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota'
  if (code === 22 || code === 1014) return 'quota'
  return 'denied'
}

/**
 * A write counts only once it reads back: a browser can accept `setItem` and keep nothing, and a
 * sale whose number is printed must not rest on a write nobody saw land (DES43 R-MEMQ).
 */
function writeText(key: string, text: string): StorageWrite {
  try {
    window.localStorage.setItem(key, text)
  } catch (error) {
    return failureOf(error)
  }
  try {
    return window.localStorage.getItem(key) === text ? 'ok' : 'mismatch'
  } catch (error) {
    return failureOf(error)
  }
}

/** Non-essential copies (the notes for the next sale) ignore the answer; a till still sells online. */
function write(key: string, value: unknown): StorageWrite {
  return writeText(key, JSON.stringify(value))
}

/** A read that says when it failed, instead of answering the fallback as if nothing were stored. */
function readStrict<T>(
  key: string,
  fallback: T,
): { ok: true; value: T } | { ok: false; reason: StorageFailureReason } {
  let text: string | null
  try {
    text = window.localStorage.getItem(key)
  } catch (error) {
    return { ok: false, reason: failureOf(error) }
  }
  if (text === null) return { ok: true, value: fallback }
  try {
    return { ok: true, value: JSON.parse(text) as T }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}

/** A stored counter, or the reason it cannot be read; anything but a whole number is unreadable. */
function readCounter(key: string): { ok: true; value: number | null } | { ok: false; reason: StorageFailureReason } {
  const stored = readStrict<unknown>(key, null)
  if (!stored.ok) return stored
  if (stored.value === null) return { ok: true, value: null }
  return Number.isSafeInteger(stored.value)
    ? { ok: true, value: stored.value as number }
    : { ok: false, reason: 'unreadable' }
}

/**
 * Raises a counter to at least `atLeast`, never lowers it. Another tab of the till may raise the same
 * key between the write and its read-back, so the check is "covers it", not "is what I wrote".
 */
function raiseCounter(key: string, atLeast: number): StorageWrite {
  const current = readCounter(key)
  if (!current.ok) return current.reason
  if ((current.value ?? 0) >= atLeast) return 'ok'
  const written = write(key, atLeast)
  if (written !== 'mismatch') return written
  const after = readCounter(key)
  return after.ok && (after.value ?? 0) >= atLeast ? 'ok' : 'mismatch'
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
  // The same hold for a line that states neither goods nor services (backend 8f04050ab, IBR-078-OM).
  // Unlike the HS code, the server does not fill this from the product on the resend, and nothing on
  // this device may choose it for the cashier, so it does not clear by itself. Kept as 'unknown', never
  // 'final': a final entry would read as given up on, and the sale must stay queued, unnumbered and
  // listed until someone deals with it.
  if (code === 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED') return 'unknown'
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
/** Why the last read of the queue failed; null when it was read. */
let queueReadFailure: StorageFailureReason | null = null

/**
 * A change of `queueReadFailure` is a change of the selling gate, so its subscribers are told and
 * the sell controls grey out at once rather than at the next refused sale (review XW-4). Told on a
 * microtask: `synced` also runs while a screen renders (`queuedFor`), and a store must not notify
 * React in the middle of a render.
 */
function noteQueueRead(next: StorageFailureReason | null) {
  if (queueReadFailure === next) return
  queueReadFailure = next
  queueMicrotask(() => blockListeners.forEach((listener) => listener()))
}

/**
 * The queue as storage holds it now. Another tab of the till (or a second window) writes the same key,
 * and this tab used to keep the copy it loaded and write it back whole: a sale the other tab had queued,
 * printed and not yet sent vanished from the device, and its number with it (B37 OFF-4). Every change
 * is made to this fresh copy, in the same task as its write.
 */
function synced(): QueuedSale[] {
  if (typeof window === 'undefined') return queue
  let text: string | null
  try {
    text = window.localStorage.getItem(QUEUE_KEY)
  } catch (error) {
    noteQueueRead(failureOf(error))
    return queue
  }
  if (text === seenText) {
    noteQueueRead(null)
    return queue
  }
  try {
    const parsed = text ? (JSON.parse(text) as QueuedSale[]).map(revived) : []
    queue = parsed
    seenText = text
    noteQueueRead(null)
  } catch {
    // Unreadable text is never taken for an empty queue: this tab keeps what it has, and `save`
    // will not write over it.
    noteQueueRead('unreadable')
  }
  return queue
}

type SaveResult = StorageWrite | 'conflict'

/**
 * Writes the queue only on top of the copy this tab last read (`seenText`), and keeps it in memory
 * only once it reads back. The queue used to fall back to this tab's memory when a write failed:
 * printed, paid sales then lived nowhere a reload or a closed tab would keep, the counter beside them
 * was lost with them, and the same numbers were printed again; and when storage came back the whole
 * memory copy was written over whatever another tab had queued meanwhile (POS-MEMQ, A8-G2). Now a
 * failed write changes nothing here: memory stays what storage last confirmed.
 */
function save(next: QueuedSale[]): SaveResult {
  if (typeof window === 'undefined') {
    queue = next
    listeners.forEach((listener) => listener())
    return 'ok'
  }
  let current: string | null
  try {
    current = window.localStorage.getItem(QUEUE_KEY)
  } catch (error) {
    return noteStorageFailure(failureOf(error))
  }
  if (current !== seenText) return 'conflict'
  const text = JSON.stringify(next)
  const written = writeText(QUEUE_KEY, text)
  // A read-back that differs is judged by `update`, which knows what this write was for: another
  // tab may have written between the two, and that is not a storage fault (IMPL2-M1).
  if (written === 'mismatch') return written
  if (written !== 'ok') return noteStorageFailure(written)
  queue = next
  seenText = text
  noteQueueRead(null)
  listeners.forEach((listener) => listener())
  return 'ok'
}

/**
 * Every change to the queue: made to the copy storage holds now, and made again once from a fresh
 * read if another tab wrote in between. Rebuilding from storage, never from this tab's memory, is
 * what keeps a sale another tab queued, and keeps out one another tab has filed and removed.
 *
 * `landed` says whether storage, read again, holds this change's own effect (its entry there, or
 * gone). A read-back that differs only because another tab wrote right after this write is then
 * accepted; without `landed`, or when the effect is not there, it blocks offline numbering as any
 * storage failure does (IMPL2-M1: verify this write, never weaken fail-closed).
 */
function update(
  change: (entries: QueuedSale[]) => QueuedSale[],
  landed?: (entries: QueuedSale[]) => boolean,
): StorageWrite {
  let written = change(synced())
  const first = save(written)
  const result =
    first !== 'conflict'
      ? first
      : (() => {
          written = change(synced())
          const second = save(written)
          // Still not what this tab read: the stored text cannot be read, and is never written over.
          return second === 'conflict' ? noteStorageFailure(queueReadFailure ?? 'unreadable') : second
        })()
  if (result !== 'mismatch') return result
  const now = synced()
  // A queue read back empty (or with its key gone, which reads the same) after a write that kept
  // entries is a wiped store, not another tab's write: a removal check is vacuously true on [],
  // and accepting it would let this tab number on from a counter that may be gone too (W2-M1).
  const wiped = now.length === 0 && written.length > 0
  if (landed && !queueReadFailure && !wiped && landed(now)) {
    // `save` returned before telling anyone and `synced` tells no one, so the screens would show
    // the list from before this write until some later change (W2-M2).
    listeners.forEach((listener) => listener())
    return 'ok'
  }
  return noteStorageFailure('mismatch')
}

/**
 * Selling is off for this tab, online and offline, once storage has failed (OQ-XT2-STORAGE,
 * OA:2773: "Block both online and offline POS selling when the offline queue, numbering counter or
 * durable high-water state cannot be read or trusted"). That supersedes POS-MEMQ's "online is
 * unchanged": an online sale needs the queue and the counter read to know what this device has
 * printed (DES43 rev 4.7 D.9). Sending, retrying and correcting sales already numbered stay
 * allowed. It comes back only through `checkStorageAgain`, or a reload.
 */
let storageFailure: StorageFailureReason | null = null

/**
 * The server said this device's numbering report named another series or year
 * (POS_NUMBERING_REPORT_STALE): its date or time is likely wrong. Selling stops until Check again
 * or a reload, and nothing is renumbered (D.9).
 */
let reportStale = false

/**
 * A number this tab advanced the till's counter past and then could not queue or roll back: no
 * receipt carries it, and the server will refuse the next number as a gap until it is used. It
 * stops all selling on the till, and neither Check again nor an online sale clears it, until the
 * server acknowledges burns (`burnBlocks`, owner ruling on the burn). Owner decision OQ-W1
 * (2026-11-05): numbering fails closed and a lost number goes to a durable, auditable gap
 * reconciliation; it is never reused, released or silently skipped. That reconciliation is the
 * server's, and waits for the DES43 alignment and its review, so nothing durable is recorded here
 * and the burn is held in memory only. After a reload it is a held POS_TILL_NUMBER_GAP, recovered
 * through §10.1.
 */
const burnt = new Map<string, { prefix: string; value: number }>()
const blockListeners = new Set<() => void>()

function noteStorageFailure(reason: StorageFailureReason): StorageFailureReason {
  if (storageFailure !== reason) {
    storageFailure = reason
    blockListeners.forEach((listener) => listener())
  }
  return reason
}

/** Whether a sale is to be sent to the server or numbered and kept on this device. */
export type SalePath = 'online' | 'offline'

/**
 * Whether the server acknowledges a burnt number: durably fences it so it cannot be allocated
 * again. Owner ruling on the burn (OA, final entry, item 6): reading (a), "a known state that an
 * online sale heals", only "when the burnt number is durably fenced, acknowledged by the
 * authoritative server state, and cannot be allocated again ... If those guarantees cannot be
 * proven, retain a fail-closed blocker." No such server fence exists, so this stays false. Enabled
 * only once the backend acknowledges burnt numbers (DES43 backend).
 */
const BURN_ACKNOWLEDGED_BY_SERVER = false

/**
 * Whether a burnt number stops selling on `path`. Fail closed while the server does not
 * acknowledge burns: both paths. Reading (a), offline only, is the disabled branch.
 */
export function burnBlocks(path: SalePath): boolean {
  return BURN_ACKNOWLEDGED_BY_SERVER ? path === 'offline' : true
}

/** Whether an online sale filing the burnt number (or a later one) lifts the burn: only under (a). */
function burnHealsOnline(): boolean {
  return BURN_ACKNOWLEDGED_BY_SERVER
}

/** What stops this device's storage side from selling on `tillId`, if anything. */
export type OfflineBlock = StorageFailureReason | 'reportStale' | 'burnt'

/** The one selling gate (D.9): the till lock first, then storage, then a burn. */
export type SellingBlock = Exclude<TillLockState, 'held'> | OfflineBlock

/** The storage side of the gate, for `path`; offline by default, where a burn always counts. */
export function offlineBlock(tillId: string | null, path: SalePath = 'offline'): OfflineBlock | null {
  if (storageFailure) return storageFailure
  if (queueReadFailure) return queueReadFailure
  if (reportStale) return 'reportStale'
  return tillId && burnt.has(tillId) && burnBlocks(path) ? 'burnt' : null
}

/** Whether this tab may sell on `tillId` by `path` now, and if not, why. */
export function sellingBlock(tillId: string, path: SalePath): SellingBlock | null {
  const lock = tillLockState(tillId)
  if (lock !== 'held') return lock
  return offlineBlock(tillId, path)
}

function subscribeBlocks(listener: () => void) {
  blockListeners.add(listener)
  return () => {
    blockListeners.delete(listener)
  }
}

/** For the storage notice: what blocks this device's storage side on this till, and why. */
export function useStorageFailure(tillId: string | null = null): OfflineBlock | null {
  return useSyncExternalStore(subscribeBlocks, () => offlineBlock(tillId))
}

/**
 * For the sell controls: what stops a sale on this till by any path. Online is the path asked,
 * since it is the one every sale starts on; anything that stops offline only (a burn, were the
 * server to acknowledge burns) is refused when the sale actually falls back to offline.
 */
export function useSellingBlock(tillId: string | null): SellingBlock | null {
  return useSyncExternalStore(
    (listener) => {
      const offBlocks = subscribeBlocks(listener)
      const offLocks = subscribeTillLocks(listener)
      return () => {
        offBlocks()
        offLocks()
      }
    },
    () => (tillId ? sellingBlock(tillId, 'online') : null),
  )
}

/**
 * Thrown before any number is printed when this device cannot keep or know its sales. `requested`:
 * the sale's own request had already gone out (its connection dropped, then it could not be kept
 * offline), so the server may have filed it; otherwise nothing was sent.
 */
export class PosStorageUnavailable extends Error {
  readonly reason: OfflineBlock
  readonly requested: boolean

  constructor(reason: OfflineBlock, requested = false) {
    super(`This device cannot safely sell now (${reason})`)
    this.name = 'PosStorageUnavailable'
    this.reason = reason
    this.requested = requested
  }
}

const PROBE_KEY = 'fawtir.pos.storageProbe'

/**
 * "Check again": a probe write that reads back, then the queue saved again on top of what storage
 * holds. Both must land before selling is allowed again; a stale-report block is lifted with it.
 * Returns what still blocks it. A burnt number is never cleared here (owner ruling on the burn,
 * final-approval item 6: Check again must not clear an unverified number).
 */
export function checkStorageAgain(): StorageFailureReason | null {
  const probe = writeText(PROBE_KEY, `${Date.now()}`)
  if (probe !== 'ok') return noteStorageFailure(probe)
  try {
    window.localStorage.removeItem(PROBE_KEY)
  } catch {
    // The probe itself proved the write; a leftover probe key holds nothing.
  }
  const resaved = update((entries) => entries)
  if (resaved !== 'ok') return noteStorageFailure(resaved)
  if (storageFailure !== null || reportStale) {
    storageFailure = null
    reportStale = false
    blockListeners.forEach((listener) => listener())
  }
  return null
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
function adoptLegacyCounter(tillId: string, prefix: string): StorageWrite {
  const legacy = readCounter(legacyNextKey(tillId))
  // Storage that cannot be read blocks numbering; a value that is not a counter was ignored before
  // and still is, so a stray key cannot stop the till for good.
  if (!legacy.ok) return legacy.reason === 'unreadable' ? 'ok' : legacy.reason
  if (legacy.value === null) return 'ok'
  const raised = raiseCounter(nextKey(tillId, prefix), legacy.value)
  // Dropped only once the per-year counter is confirmed to cover it, or the number is lost.
  if (raised === 'ok') removeStored(legacyNextKey(tillId))
  return raised
}

/** What numbering offline on this till comes to: a number, none (no year to number in), or a block. */
type Numbering = { number: string | null } | { blocked: StorageFailureReason }

function tillNumber(till: PosTillDto, soldAt?: string): Numbering {
  const series = till.series?.INVOICE
  if (!series) return { number: null }
  const year = businessYear(soldAt, series.timeZone)
  if (year == null || series.year !== year) return { number: null }
  const prefix = `${series.series}-${year}`
  const adopted = adoptLegacyCounter(till.id, prefix)
  if (adopted !== 'ok') return { blocked: adopted }
  // A counter or queue that cannot be read is never taken for zero or empty: either could hold
  // numbers already printed (POS-MEMQ, fail closed).
  const local = readCounter(nextKey(till.id, prefix))
  if (!local.ok) return { blocked: local.reason }
  const entries = synced()
  if (queueReadFailure) return { blocked: queueReadFailure }
  const queued = entries
    .filter((entry) => entry.tillId === till.id && numberPrefix(entry.number) === prefix)
    .map((entry) => (numberValue(entry.number) ?? 0) + 1)
  const value = Math.max(series.nextValue, local.value ?? 0, ...queued)
  return { number: formatTillNumber(series.series, year, value) }
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
 * Null too when the counter or the queue cannot be read (POS-MEMQ).
 */
export function nextTillNumber(till: PosTillDto, soldAt?: string): string | null {
  const numbering = tillNumber(till, soldAt)
  return 'number' in numbering ? numbering.number : null
}

/**
 * After a sale is numbered, offline numbering continues from the one after it, in its own year.
 * `ok` only once storage is confirmed to cover it: the counter is what stops this device printing
 * the number again after the sale has left the queue (POS-MEMQ).
 */
export function noteNumberUsed(tillId: string, invoiceNumber: string): StorageWrite {
  const value = numberValue(invoiceNumber)
  const prefix = numberPrefix(invoiceNumber)
  if (value == null || prefix == null) return 'ok'
  const adopted = adoptLegacyCounter(tillId, prefix)
  if (adopted !== 'ok') return adopted
  return raiseCounter(nextKey(tillId, prefix), value + 1)
}

/**
 * A sale filed online took `invoiceNumber`. The counter is raised past it; if that cannot be kept,
 * selling stops for this tab, since a stale counter could print the number again. A number burnt
 * on this till is healed by it only under reading (a) of the burn (`burnHealsOnline`).
 */
function noteFiledOnline(tillId: string, invoiceNumber: string) {
  const noted = noteNumberUsed(tillId, invoiceNumber)
  if (noted !== 'ok') noteStorageFailure(noted)
  if (!burnHealsOnline()) return
  const burn = burnt.get(tillId)
  const value = numberValue(invoiceNumber)
  if (burn && value != null && numberPrefix(invoiceNumber) === burn.prefix && value >= burn.value) {
    burnt.delete(tillId)
    blockListeners.forEach((listener) => listener())
  }
}

/**
 * Takes `number` on the till's counter before anything is awaited, so neither this tab nor another
 * can print it again meanwhile (the R-TABS window stays as narrow as before). The rollback undoes it
 * only while the counter still says exactly what this took: another tab that moved it on has
 * numbered past it, and lowering it under that tab could reprint its numbers.
 */
function reserveNumber(
  tillId: string,
  number: string,
):
  | { ok: true; rollback: () => StorageWrite; prefix: string; value: number }
  | { ok: false; reason: StorageFailureReason } {
  const value = numberValue(number)
  const prefix = numberPrefix(number)
  if (value == null || prefix == null) return { ok: false, reason: 'unreadable' }
  const key = nextKey(tillId, prefix)
  const before = readCounter(key)
  if (!before.ok) return { ok: false, reason: before.reason }
  const previous = before.value
  const reserved = noteNumberUsed(tillId, number)
  if (reserved !== 'ok') return { ok: false, reason: reserved }
  const rollback = (): StorageWrite => {
    if (previous !== null && previous >= value + 1) return 'ok'
    const now = readCounter(key)
    if (!now.ok) return now.reason
    if (now.value !== value + 1) return 'mismatch'
    if (previous !== null) return writeText(key, JSON.stringify(previous))
    try {
      window.localStorage.removeItem(key)
      return window.localStorage.getItem(key) === null ? 'ok' : 'mismatch'
    } catch (error) {
      return failureOf(error)
    }
  }
  return { ok: true, rollback, prefix, value }
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
 * Sends one numbered sale. The gap retry naming `skippedNumbers` runs only with `canSkip`, which
 * this build never passes (`opensNumbers`, Q-27): a gap refusal is thrown and the sale waits.
 */
async function sendNumbered(
  body: PosSaleRequest,
  key: string,
  canSkip: boolean,
  generation: number,
) {
  try {
    return await sendWithClaimFallback(body, key, generation)
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
    // The retry is a second POST, and it would go with whichever session is current by now; the
    // refused first one filed nothing, so stopping here loses nothing (PRV43-OFF2 N-7).
    if (senderGeneration !== generation) throw new SenderChanged()
    return sendWithClaimFallback({ ...claimAsTheServerTakes(body), skippedNumbers }, key, generation)
  }
}

/** The person the till screens name changed mid-run: the run stops without marking the entry. */
class SenderChanged extends Error {}

/**
 * During a rolling deploy or a rollback the till can still believe a server takes the claim that no
 * longer does, and that server refuses the whole request as malformed. The claim is audit-only, so the
 * same sale goes again once without it, under the same key, with nothing else changed; the queue does
 * not stall behind a field that decides nothing (PRV43-OFF2 N-6). The till stops sending the claim
 * until it next reads what the server allows (`noteTillServer`).
 */
async function sendWithClaimFallback(body: PosSaleRequest, key: string, generation: number) {
  try {
    return await createPosSale(body, key)
  } catch (error) {
    const claimRefused =
      body.claimedMakerUnverified !== undefined &&
      error instanceof ApiError &&
      error.status === 400 &&
      error.problemType === 'malformed-request'
    if (!claimRefused) throw error
    takesClaim.set(body.tillId, false)
    if (senderGeneration !== generation) throw new SenderChanged()
    return createPosSale(claimAsTheServerTakes(body), key)
  }
}

function claimAsTheServerTakes(body: PosSaleRequest): PosSaleRequest {
  if (body.claimedMakerUnverified === undefined || takesClaim.get(body.tillId) === true) return body
  const { claimedMakerUnverified: _claim, ...without } = body
  void _claim
  return without
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

const LOCK_BLOCKS: ReadonlySet<string> = new Set<Exclude<TillLockState, 'held'>>([
  'pending',
  'otherTab',
  'unsupported',
  'released',
  'finishing',
])

function isLockBlock(block: SellingBlock): block is Exclude<TillLockState, 'held'> {
  return LOCK_BLOCKS.has(block)
}

/**
 * Per till, this tab's sales run one at a time (XT2-1). The Web Lock excludes other tabs, not two
 * submissions in this one: without this, a sale rung while another is being sent could number k
 * offline while the first's online request is being issued k. A chain of promises, so a sale that
 * fails still lets the next one in.
 */
const sections = new Map<string, Promise<void>>()

async function inTillSection<T>(tillId: string, run: () => Promise<T>): Promise<T> {
  const before = sections.get(tillId) ?? Promise.resolve()
  let leave: () => void = () => {}
  const mine = new Promise<void>((done) => {
    leave = done
  })
  const tail = before.then(() => mine)
  sections.set(tillId, tail)
  await before
  try {
    return await run()
  } finally {
    leave()
    if (sections.get(tillId) === tail) sections.delete(tillId)
  }
}

/**
 * The device's numbering report for an online sale (DES43 D.2): the highest number of the sale's
 * series and business year that this device has printed and not yet seen filed, i.e. the highest
 * queued for that prefix, or null. A burnt number is in no queue, so it does not count. Read from
 * the queue and the counter as storage holds them now; either unreadable is a block, never a guess
 * (OQ-XT2-STORAGE). Not sent until the backend accepts the field (R47-1).
 */
export function deviceNumbering(
  till: PosTillDto,
  soldAt?: string,
): { status: 'KNOWN'; highestUnfiled: string | null } | { blocked: StorageFailureReason } {
  const entries = synced()
  if (queueReadFailure) return { blocked: queueReadFailure }
  const series = till.series?.INVOICE
  // No series: the server numbers the sale and this device has numbered nothing of it.
  if (!series) return { status: 'KNOWN', highestUnfiled: null }
  const year = businessYear(soldAt, series.timeZone)
  if (year == null) return { blocked: 'unreadable' }
  const prefix = `${series.series}-${year}`
  const counter = readCounter(nextKey(till.id, prefix))
  if (!counter.ok) return { blocked: counter.reason }
  let highestUnfiled: string | null = null
  let highest = -1
  for (const entry of entries) {
    if (entry.tillId !== till.id || numberPrefix(entry.number) !== prefix) continue
    const value = numberValue(entry.number) ?? -1
    if (value > highest) {
      highest = value
      highestUnfiled = entry.number
    }
  }
  return { status: 'KNOWN', highestUnfiled }
}

/**
 * Refusals about the device's own numbering state (D.9). Neither can arrive while the report is not
 * sent (R47-1); they are handled so that a backend which starts answering them fails closed here.
 * STALE blocks with the date-and-time message; its refresh-and-retry-once needs the report on the
 * wire and lands with it. UNKNOWN sets the storage block.
 */
function noteNumberingRefusal(error: unknown) {
  if (!(error instanceof ApiError)) return
  if (error.code === 'POS_TILL_DEVICE_STATE_UNKNOWN') noteStorageFailure('unreadable')
  if (error.code === 'POS_NUMBERING_REPORT_STALE' && !reportStale) {
    reportStale = true
    blockListeners.forEach((listener) => listener())
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
  // Set once this sale's own request has gone out: a refusal after it (the NetworkError fallback
  // could not keep the sale) must not tell the cashier that nothing was sent, since the server may
  // have filed it (review XW-2).
  let requested = false
  // No number, so no receipt.
  const refuseOffline = (reason: OfflineBlock): never => {
    void dropSlipPhotos(key)
    if (reason !== 'burnt' && reason !== 'reportStale') noteStorageFailure(reason)
    throw new PosStorageUnavailable(reason, requested)
  }
  /*
   * POS-MEMQ order (Gate A W-MEMQ S5): counter, then sign and seal, then the entry. A receipt prints
   * only from the result returned at the end, so only once both the counter and the whole entry read
   * back from storage. The counter goes first because an entry kept without a receipt would invite
   * the sale being rung again, and because taking the number before the awaits keeps the R-TABS
   * window as it was. If the entry cannot be kept the counter is rolled back; if even that cannot be
   * confirmed the number is burnt: never printed, never reused, a gap the server holds.
   *
   * XT-2 (DES43 rev 4.7 D.3, OA:2673): every sale, online or offline, runs in one span: the till's
   * lock held, this tab's section for the till entered, then `beginNumbering`, then the gate; it
   * ends only once the sale is filed, kept or refused. So no other tab sells while the holder does,
   * a handover waits for the sale in flight, and inside the holder an offline number cannot be
   * printed while its own online request is being issued that number. It guards this browser's
   * tabs only; the server's GAP and REPEATED checks remain the guard across devices.
   */
  const refuseTab = (reason: Exclude<TillLockState, 'held'>): never => {
    void dropSlipPhotos(key)
    throw new PosTillLockUnavailable(reason)
  }
  const refuse = (block: SellingBlock): never =>
    isLockBlock(block) ? refuseTab(block) : refuseOffline(block)
  const span = async (path: SalePath, run: () => Promise<SubmitResult>): Promise<SubmitResult> => {
    const lock = await ensureTillLock(till.id)
    if (lock !== 'held') return refuseTab(lock)
    return inTillSection(till.id, async () => {
      // The lock may have gone while this sale waited behind another in the section. Synchronous
      // from here to the request or the counter's reservation: no handover can happen between.
      const end = beginNumbering(till.id)
      if (!end) {
        const now = tillLockState(till.id)
        return refuseTab(now === 'held' ? 'released' : now)
      }
      try {
        const blocked = sellingBlock(till.id, path)
        if (blocked) return refuse(blocked)
        return await run()
      } finally {
        end()
      }
    })
  }
  const enqueue = () => span('offline', () => numberAndKeep())
  const sendOnline = () =>
    span('online', async () => {
      // What this device has printed must be read before the server numbers the sale (D.9 (4)).
      // The report is computed and deliberately not sent: today's backend rejects unknown fields,
      // so `deviceNumbering` on the wire would refuse every online sale (R47-1).
      const known = deviceNumbering(till, body.soldAt)
      if ('blocked' in known) return refuseOffline(known.blocked)
      try {
        requested = true
        const sale = await createPosSale(body, key)
        noteFiledOnline(till.id, sale.invoiceNumber)
        void sendSlipPhotos(key, sale.saleId, till.id)
        return { sale: withNumberNotes(till.id, sale) }
      } catch (error) {
        // Kept inside the same span, so the fallback number is taken under the same lock.
        if (error instanceof NetworkError) return numberAndKeep()
        noteNumberingRefusal(error)
        void dropSlipPhotos(key)
        throw error
      }
    })
  const numberAndKeep = async (): Promise<SubmitResult> => {
    const blocked = offlineBlock(till.id)
    if (blocked) return refuseOffline(blocked)
    const numbering = tillNumber(till, body.soldAt)
    if ('blocked' in numbering) return refuseOffline(numbering.blocked)
    const number = numbering.number
    if (!number) throw new NetworkError('offline')
    const reservation = reserveNumber(till.id, number)
    if (!reservation.ok) return refuseOffline(reservation.reason)
    let saved = 'denied' as StorageWrite
    let entry: QueuedSale | null = null
    try {
      // Signed before the buyer is sealed, so the signed body is the body `bodyToSend` rebuilds (WEB-3).
      entry = await sealed({
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
      const kept = entry
      // Kept only once storage, read again, holds this very entry.
      saved = update(
        (entries) => [...entries, kept],
        (entries) => entries.some((other) => other.key === key),
      )
    } finally {
      if (saved !== 'ok') {
        if (reservation.rollback() !== 'ok') {
          burnt.set(till.id, { prefix: reservation.prefix, value: reservation.value })
          blockListeners.forEach((listener) => listener())
        }
        if (entry?.sealed) void forgetBuyer(key)
      }
    }
    if (saved !== 'ok' || !entry) return refuseOffline(saved === 'ok' ? 'denied' : saved)
    return { queued: entry }
  }
  // The gate before anything is sent, the waiting sales' flush included: a tab that may not sell
  // sends nothing for this sale (D.8 (vii), (iv)). The flush on its own stays allowed (D.9).
  const lock = await ensureTillLock(till.id)
  if (lock !== 'held') return refuseTab(lock)
  const blocked = sellingBlock(till.id, 'online')
  if (blocked) return refuse(blocked)
  await holdSlipPhotos(key, till.id, photos)
  const canSkip = opensNumbers()
  // The older sales go first: once they are in, this one is sent as an ordinary online sale and
  // its receipt says so (E2E 29 Oct 2026, F-5). Only while some still wait does it join them.
  const outcome: FlushOutcome =
    queuedFor(till.id).length > 0
      ? await flushQueue(till.id, maker ? { sender: maker.userId } : {})
      : 'done'
  const waiting = queuedFor(till.id)
  if (waiting.length === 0) return sendOnline()
  if (outcome === 'offline' || outcome === 'busy') return enqueue()
  // Unreachable while `opensNumbers()` is false (Q-27): an unnumbered online sale past stuck entries
  // would take the refused number a customer already holds (NF-1).
  if (outcome === 'done' && canSkip) return sendOnline()
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

/**
 * Whether this build skips stuck numbers: never. A literal, not derived from the till, its cached
 * copy, storage, the URL, env or config, so no server answer, forged flag or #831 backend can
 * turn skipping on (owner P0-3, Q-27 hard-disable; DES43 rev 4.3.4 §5.6). Re-enabling it is a
 * reviewed change to this function, never a setting.
 */
export function opensNumbers(): false {
  return false
}

/** Whether the server takes `claimedMakerUnverified`, as the till last said (`takesMakerClaim`). */
const takesClaim = new Map<string, boolean>()

/**
 * Tells the queue what this till's server allows. `openNumbers` stays in the type only so older
 * callers still fit; it is not read (Q-27).
 */
export function noteTillServer(till: Pick<PosTillDto, 'id' | 'openNumbers' | 'takesMakerClaim'>) {
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

/**
 * What a refused entry keeps as its refusal: the server's code, else `HTTP_<status>`. A reason
 * phrase in `error` (a gateway's "Internal Server Error") is no code; kept, it would be read back
 * by `revived` and the panel as one (review W5-SHARED). The verdict still reads `error.code`.
 */
export function storedRefusal(error: ApiError): string {
  return serverCode(error) ?? `HTTP_${error.status}`
}

function refusedEntry(entry: QueuedSale, error: ApiError, verdict: RefusalVerdict): QueuedSale {
  const final = verdict === 'final'
  const attempts = verdict === 'unknown' ? (entry.attempts ?? 0) + 1 : 0
  const refused: QueuedSale = {
    ...entry,
    refusal: storedRefusal(error),
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
 * its reason, and later ones wait behind it: the `canSkip` branches below are dead while
 * `opensNumbers()` is false (Q-27). Only the entries `sender` made go by themselves, and
 * `explicitKey`; any other entry stops the run, so in strict order it holds the later ones back.
 */
export async function flushQueue(
  tillId: string,
  { sender = deviceSender, explicitKey }: FlushOptions = {},
): Promise<FlushOutcome> {
  if (flushing) return 'busy'
  flushing = true
  const generation = senderGeneration
  const canSkip = opensNumbers()
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
        update((entries) =>
          entries.map((other) => (other.key === entry.key ? buyerUnavailable(other) : other)),
        )
        if (canSkip) continue
        return 'done'
      }
      // After the body is read, which can wait on the device's key store: the last moment before the
      // POST takes whichever session is current.
      if (senderGeneration !== generation) return 'done'
      try {
        const sale = await sendNumbered(body, entry.key, canSkip, generation)
        noteForNextSale(entry, sale)
        // The entry is this device's record that its number was used; it goes only once the counter
        // is confirmed past both the printed and the filed number, or a later offline sale could
        // print one of them again (POS-MEMQ S6). Kept, it is sent again and answered as the same
        // sale under its key, so its sealed buyer stays until it really leaves.
        const printedNoted = noteNumberUsed(tillId, entry.number)
        const filedNoted = noteNumberUsed(tillId, sale.invoiceNumber)
        const covered = printedNoted === 'ok' ? filedNoted : printedNoted
        if (covered !== 'ok') noteStorageFailure(covered)
        else if (
          update(
            (entries) => entries.filter((other) => other.key !== entry.key),
            (entries) => entries.every((other) => other.key !== entry.key),
          ) === 'ok'
        ) {
          await forget(entry)
        }
        void sendSlipPhotos(entry.key, sale.saleId, tillId)
      } catch (error) {
        if (error instanceof SenderChanged) return 'done'
        const refusalOver = () =>
          update((entries) =>
            entries.map((other) =>
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
        update((entries) =>
          entries.map((other) =>
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
  update((entries) =>
    entries.map((entry) => {
      if (entry.key !== key) return entry
      const { final: _final, notBefore: _notBefore, setAside: _setAside, ...again } = entry
      void _final
      void _notBefore
      // The flag goes so the entry can be sent, in strict order; keeping it would leave a head
      // no action could ever send (NF7R option (a), rejected). The marker keeps the note only.
      return _setAside ? { ...again, setAsideSeen: true as const } : again
    }),
  )
  return flushQueue(tillId, { sender, explicitKey: key })
}

/** The server has it set aside: this device stops sending it by itself, and keeps it. */
export function markQueuedSaleSetAside(key: string) {
  update((entries) =>
    entries.map((entry) => (entry.key === key ? { ...entry, setAside: true } : entry)),
  )
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
  update((entries) =>
    entries.map((entry) => {
      if (entry.key !== key) return entry
      const { final: _final, notBefore: _notBefore, setAside: _setAside, ...again } = entry
      void _final
      void _notBefore
      const cleared = _setAside ? { ...again, setAsideSeen: true as const } : again
      // The old proof covers the old payments, and nobody here may sign as the cashier again: the
      // corrected sale goes unsigned, with no printed totals either since the two travel together,
      // and a binding-capable server holds it for a manager (WEB-4).
      const { offlineProof: _proof, printed: _printed, ...unsigned } = cleared.body
      void _proof
      void _printed
      return { ...cleared, body: { ...unsigned, payments } }
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
  takesClaim.clear()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  storageFailure = null
  reportStale = false
  sections.clear()
  burnt.clear()
  releaseTillLocks()
  queueReadFailure = null
  // A test starts from whatever storage holds now, and empties it.
  queue = []
  try {
    seenText = window.localStorage.getItem(QUEUE_KEY)
  } catch {
    seenText = undefined
  }
  save([])
}
