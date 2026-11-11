import { useSyncExternalStore } from 'react'
import type { PosPerson, PosPrintedTotals, PosSaleDto, PosSaleRequest } from '../api/pos/pos'
import type { SlipPhoto } from './posSlipOutbox'
import type { QueuedSeller } from './posReceiptSeller'
import { NO_SALE_DISCOUNT, type SaleDiscount, type SaleLine, type SaleTotals } from './pos'
import { openHeld, sealHeld, type SealedText } from './posVault'

/**
 * The sale on the till, shared by the sale, company, payment and receipt screens, so a quantity
 * or a discount on the whole sale changed on one is what the next one charges and prints (owner,
 * 21 Oct 2026). It lives for the browser tab, as a till's open sale does; "Start a new sale"
 * clears it.
 */

/** The company a sale was put on (`/pos/company`): a full tax invoice to it over Peppol. */
export type SaleCompany = {
  id: string
  name: string
  kind: 'BUSINESS' | 'GOVERNMENT'
  /** Printed on the receipt under the buyer's name, when the company has one. */
  vat?: string | null
  /** Printed instead of a VAT number for a company without one (CR and the like). */
  identifier?: { scheme: string; value: string } | null
}

/** A walk-in named for a full invoice (over 500, or an ID asked for): printed as the buyer. */
export type SaleBuyer = {
  name: string
  identifierScheme: string
  identifierValue: string
}

/** Schemes the server treats as personal data (`BuyerIdentifierScheme`, V480). */
const PERSONAL_SCHEMES = new Set(['CID', 'PASNUM'])
const MASK = '••••'

/**
 * A buyer's identifier as a receipt shows it (Abdul, 1 Nov 2026): a person's civil ID or passport
 * number masked the way the server masks it for a reader, to its last four characters, and whole
 * when it has four or fewer. For display only: the invoice data keeps the number.
 */
export function maskedIdentifier(scheme: string, value: string): string {
  if (!PERSONAL_SCHEMES.has(scheme) || value.startsWith(MASK)) return value
  const compact = value.replace(/\s+/g, '')
  return compact.length <= 4 ? MASK : `${MASK} ${compact.slice(-4)}`
}

export type OpenSale = {
  lines: SaleLine[]
  saleDiscount: SaleDiscount
  company: SaleCompany | null
  /** When the first item went on, for the panel's "started 14:26". */
  startedAt: string | null
}

/** What the receipt prints: the sale as filed, or as queued on a till that was offline. */
export type FinishedSale = {
  lines: SaleLine[]
  totals: SaleTotals
  tip: number
  change: number
  company: SaleCompany | null
  /** The named buyer of a full invoice to a person; null for a walk-in or a company. */
  buyer?: SaleBuyer | null
  payments: { method: string; amount: number; approvalCode?: string }[]
  /** The server's answer; null while the sale waits in the offline queue. */
  sale: PosSaleDto | null
  /** The number the till gave a sale made offline. */
  queuedNumber: string | null
  /**
   * The QR a sale queued offline printed (QR E-1, `printedQr.payload`). Absent on a consumer's
   * queued sale only when the QR could not be built after numbering: no receipt is shown (item C).
   */
  queuedQr?: string | null
  /**
   * The seller in the till's QR profile a queued sale was numbered with, the one its QR names; the
   * receipt header prints it in place of the live company profile (QA-F11, owner decision 3 of
   * OWNER-RC5-DECISIONS-20261107g).
   */
  queuedSeller?: QueuedSeller | null
  /** Queued behind a sale the server would not take, not because the till is offline. */
  queuedBehind?: boolean
  finishedAt: string
}

/**
 * A sale whose own request went out with no definite answer (Stage B E-01): exactly what was sent,
 * so it can only be sent again as it was, under the same key, and what its receipt prints if it
 * then succeeds. While it is held the open sale cannot be changed, since a changed basket or
 * payment is a new sale with a new key, and a customer whose first sale was recorded would be
 * charged twice. It belongs to its till: kept per tenant and till across a reload, a re-login, a
 * take-over or a restored tab (E01R-1, RBW2-1, RBW2-6), and never shown on another till (RBW2-4).
 */
export type HeldSend = {
  request: PosSaleRequest
  slipPhotos: SlipPhoto[]
  printed: PosPrintedTotals
  maker: PosPerson | null
  receipt: Omit<FinishedSale, 'sale' | 'queuedNumber' | 'queuedQr' | 'queuedSeller' | 'queuedBehind' | 'finishedAt'>
}

export type UncertainSale = {
  tenantId: string | null
  tillId: string
  /** Data only: a reload or a take-over may read the till under a new shift (RBW2-1). */
  shiftId: string | null
  /** The till's name, for the warning another till shows; never personal. */
  tillLabel: string
  key: string
  /** Null while a stored hold is opened, and when only its lock could be kept (RBW2-2 b). */
  send: HeldSend | null
  /**
   * What a reload would find: `sealed` the whole sale, `lock` the key and the lock only, `none`
   * nothing (no storage), `pending` the lock while the sale is being sealed.
   */
  kept: 'pending' | 'sealed' | 'lock' | 'none'
  /** A stored hold whose sealed sale is still being opened: locked, nothing can be sent yet. */
  restoring: boolean
  /** The sale carried a card slip photo, which is never stored (RBW2-5). */
  hadSlips: boolean
  /**
   * What the cashier matches the sale by on Today when only the lock came back (RBW3-1): its
   * total, currency and time. Not personal, so kept in clear. Null for an entry from before it.
   */
  summary: HeldSummary | null
}

export type HeldSummary = { total: number; currency: string; soldAt: string }

/** A hold as the payment screen makes it, before it is stored. */
export type NewHold = Omit<UncertainSale, 'send' | 'kept' | 'restoring' | 'hadSlips' | 'summary'> & {
  send: HeldSend
  hadSlips?: boolean
}

const START: OpenSale = {
  lines: [],
  saleDiscount: NO_SALE_DISCOUNT,
  company: null,
  startedAt: null,
}

let sale: OpenSale = START
let finished: FinishedSale | null = null
let uncertain: UncertainSale | null = null
const listeners = new Set<() => void>()
/** Counts every change, for readers that compute from storage (useOtherTillHolds). */
let changes = 0

function notify() {
  changes += 1
  listeners.forEach((listener) => listener())
}

function update(next: Partial<OpenSale>) {
  // Refused here as well as hidden on the screens, so no path changes a sale whose outcome is
  // unknown (E-01).
  if (uncertain) return
  sale = { ...sale, ...next }
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const setSaleLines = (lines: SaleLine[] | ((current: SaleLine[]) => SaleLine[])) => {
  const next = typeof lines === 'function' ? lines(sale.lines) : lines
  update({
    lines: next,
    startedAt: next.length === 0 ? null : (sale.startedAt ?? new Date().toISOString()),
  })
}
export const setSaleDiscount = (saleDiscount: SaleDiscount) => update({ saleDiscount })
export const setSaleCompany = (company: SaleCompany | null) => update({ company })

/** After the receipt: an empty till, ready for the next customer. */
export const startNewSale = () => {
  if (uncertain) return
  sale = START
  finished = null
  notify()
}

/** For tests: also drops any stored hold, so one test's held sale never reaches the next. */
export const resetOpenSale = (lines: SaleLine[] = []) => {
  sale = { ...START, lines, startedAt: lines.length ? '2026-09-04T10:26:00Z' : null }
  finished = null
  uncertain = null
  parked.clear()
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(HELD_PREFIX) || key.startsWith(LEGACY_PREFIX)) window.sessionStorage.removeItem(key)
    }
  } catch {
    // No storage, nothing stored.
  }
  notify()
}

/** For tests: what a reload loses, the tab's memory, while sessionStorage stays. */
export const forgetTabMemory = () => {
  sale = START
  finished = null
  uncertain = null
  parked.clear()
  notify()
}

export const setFinishedSale = (done: FinishedSale) => {
  finished = done
  notify()
}

export function useOpenSale(): OpenSale {
  return useSyncExternalStore(subscribe, () => sale)
}

export function useFinishedSale(): FinishedSale | null {
  return useSyncExternalStore(subscribe, () => finished)
}

/*
 * Tab-scoped on purpose, as a paid-out's attempt is (posPaidOut.ts, review W4-2): another tab is
 * another attempt. Keyed by tenant and till only (RBW2-1): a hold made before a shift was read, or
 * taken over under a new shift, is still this till's. Signing out does not clear it (RBW2-6): the
 * next person on the till gets the same lock, since clearing it would let the sale be rung twice.
 *
 * The entry in clear holds no personal data: ids, the till's name, the key and whether a slip photo
 * was taken. The request, the receipt and the basket are sealed with the device's vault key
 * (RBW2-2); a device that cannot seal keeps the lock alone, which after a reload offers only
 * Today. Slip photos are never stored (quota): the cashier is told to attach them again (RBW2-5).
 */
const HELD_PREFIX = 'fawtir.pos.heldSale.'
/** The first release's entries, keyed by till and shift and in clear (b2fb881a); read once, moved. */
const LEGACY_PREFIX = 'fawtir.pos.uncertainSale.'
const heldKey = (tenantId: string | null, tillId: string) => `${HELD_PREFIX}${tenantId ?? '-'}.${tillId}`

type StoredEntry = {
  v: 2
  tenantId: string | null
  tillId: string
  shiftId: string | null
  tillLabel: string
  key: string
  hadSlips: boolean
  summary?: HeldSummary | null
  sealed: SealedText | null
}
type SealedHold = { send: Omit<HeldSend, 'slipPhotos'>; basket: OpenSale }
type LegacyHold = {
  held: Omit<HeldSend, 'slipPhotos'> & { tillId: string; shiftId: string | null; key: string }
  basket: OpenSale
}

/** Holds of other tills this tab left with the sidebar, so coming back finds them as they were. */
const parked = new Map<string, { hold: UncertainSale; basket: OpenSale }>()

function writeEntry(entry: StoredEntry): boolean {
  try {
    window.sessionStorage.setItem(heldKey(entry.tenantId, entry.tillId), JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

function readEntry(tenantId: string | null, tillId: string): StoredEntry | null {
  try {
    const raw = window.sessionStorage.getItem(heldKey(tenantId, tillId))
    const entry = raw ? (JSON.parse(raw) as StoredEntry) : null
    return entry && entry.v === 2 && entry.tillId === tillId && typeof entry.key === 'string'
      ? entry
      : null
  } catch {
    return null
  }
}

function removeEntry(tenantId: string | null, tillId: string): void {
  try {
    window.sessionStorage.removeItem(heldKey(tenantId, tillId))
  } catch {
    // Nothing could be stored either.
  }
}

const entryOf = (hold: UncertainSale, sealed: SealedText | null): StoredEntry => ({
  v: 2,
  tenantId: hold.tenantId,
  tillId: hold.tillId,
  shiftId: hold.shiftId,
  tillLabel: hold.tillLabel,
  key: hold.key,
  hadSlips: hold.hadSlips,
  summary: hold.summary,
  sealed,
})

/**
 * The lock is written first, in the same call, so a tab that dies while the sale is being sealed
 * still comes back locked; the sealed sale replaces it once sealing answers, unless the hold was
 * settled in the meantime.
 */
function keep(hold: UncertainSale, basket: OpenSale): UncertainSale {
  if (!writeEntry(entryOf(hold, null))) return { ...hold, kept: 'none' }
  const { request, printed, maker, receipt } = hold.send!
  const send = { request, printed, maker, receipt }
  void sealHeld({ send, basket } satisfies SealedHold).then((sealed) => {
    const stored = readEntry(hold.tenantId, hold.tillId)
    if (stored?.key !== hold.key) return
    const kept = sealed !== null && writeEntry(entryOf(hold, sealed)) ? 'sealed' : 'lock'
    const held = parked.get(hold.tillId)
    if (held?.hold.key === hold.key) held.hold = { ...held.hold, kept }
    if (uncertain?.key === hold.key) {
      uncertain = { ...uncertain, kept }
      notify()
    }
  })
  return { ...hold, kept: 'pending' }
}

export const holdUncertainSale = (held: NewHold) => {
  uncertain = keep(
    {
      ...held,
      kept: 'pending',
      restoring: false,
      hadSlips: held.hadSlips === true || held.send.slipPhotos.length > 0,
      summary: summaryOf(held.send),
    },
    sale,
  )
  notify()
}

/** The outcome is known: the sale was recorded, kept, or definitely refused under its key. */
export const settleUncertainSale = () => {
  if (uncertain) {
    removeEntry(uncertain.tenantId, uncertain.tillId)
    parked.delete(uncertain.tillId)
  }
  uncertain = null
  notify()
}

/**
 * The server decided this key (RESEND-AUTH): released only if it is still the hold on the till, so
 * an answer that comes back after the hold changed releases nothing else. True only when this call
 * released it (RW6-4): a caller shows the outcome only for a hold it actually released.
 */
export const settleHeldKey = (key: string): boolean => {
  if (uncertain?.key !== key) return false
  settleUncertainSale()
  return true
}

/** The first release's entry for this till, moved under the tenant and till and sealed. */
function migrateLegacy(tenantId: string | null, tillId: string, tillLabel: string): boolean {
  let legacy: LegacyHold | null = null
  const legacyNames: string[] = []
  try {
    for (const name of Object.keys(window.sessionStorage)) {
      if (!name.startsWith(`${LEGACY_PREFIX}${tillId}.`)) continue
      const raw = window.sessionStorage.getItem(name)
      const parsed = raw ? (JSON.parse(raw) as LegacyHold) : null
      if (
        parsed?.held &&
        typeof parsed.held.key === 'string' &&
        parsed.held.request?.tillId === tillId &&
        parsed.held.receipt &&
        Array.isArray(parsed.basket?.lines)
      ) {
        legacy = parsed
        legacyNames.push(name)
      } else {
        window.sessionStorage.removeItem(name)
      }
    }
  } catch {
    return false
  }
  if (!legacy) return false
  const { held, basket } = legacy
  sale = basket
  finished = null
  uncertain = keep(
    {
      tenantId,
      tillId,
      shiftId: held.shiftId,
      tillLabel,
      key: held.key,
      send: {
        request: held.request,
        slipPhotos: [],
        printed: held.printed,
        maker: held.maker,
        receipt: held.receipt,
      },
      kept: 'pending',
      restoring: false,
      hadSlips: false,
      summary: summaryOf(held),
    },
    basket,
  )
  // RBW3-4: the old entry goes only once the new lock is written, so a tab that dies in between
  // still comes back locked; if the lock could not be written, the old entry stays as the lock.
  if (uncertain.kept !== 'none') {
    try {
      for (const name of legacyNames) window.sessionStorage.removeItem(name)
    } catch {
      // Storage refused: the old entry stays, and the next restore migrates it again.
    }
  }
  return true
}

/**
 * Every till screen calls this with its till. A hold of another till is put aside, never shown or
 * sent here (RBW2-4); this till's hold comes back from the tab's memory, or from storage: locked at
 * once, then opened, so nothing can be rung while the sealed sale is read (RBW2-2).
 */
export function restoreUncertainSale(
  tenantId: string | null,
  tillId: string,
  tillLabel: string,
): void {
  if (uncertain?.tillId === tillId) return
  if (uncertain) {
    parked.set(uncertain.tillId, { hold: uncertain, basket: sale })
    uncertain = null
    sale = START
    finished = null
  }
  const left = parked.get(tillId)
  if (left) {
    parked.delete(tillId)
    uncertain = left.hold
    sale = left.basket
    finished = null
    notify()
    return
  }
  const entry = readEntry(tenantId, tillId)
  if (!entry) {
    migrateLegacy(tenantId, tillId, tillLabel)
    notify()
    return
  }
  const hold: UncertainSale = {
    tenantId,
    tillId,
    shiftId: entry.shiftId,
    tillLabel: entry.tillLabel,
    key: entry.key,
    send: null,
    kept: entry.sealed ? 'sealed' : 'lock',
    restoring: entry.sealed !== null,
    hadSlips: entry.hadSlips === true,
    summary: entry.summary ?? null,
  }
  uncertain = hold
  sale = START
  finished = null
  notify()
  if (!entry.sealed) return
  void openHeld<SealedHold>(entry.sealed).then((opened) => {
    if (uncertain?.key !== hold.key || uncertain.tillId !== tillId) return
    if (opened?.send?.request?.tillId === tillId && Array.isArray(opened.basket?.lines)) {
      uncertain = { ...uncertain, send: { ...opened.send, slipPhotos: [] }, restoring: false }
      sale = opened.basket
    } else {
      uncertain = { ...uncertain, restoring: false, kept: 'lock' }
    }
    notify()
  })
}

// The till sells in rials only: every figure it prints and sends is formatted as OMR.
function summaryOf(send: Pick<HeldSend, 'request' | 'printed'>): HeldSummary | null {
  const total = send.printed?.total
  return typeof total === 'number' && typeof send.request?.soldAt === 'string'
    ? { total, currency: 'OMR', soldAt: send.request.soldAt }
    : null
}

/** This till's hold; a hold of another till is not this screen's (RBW2-4). */
export function useUncertainSale(tillId: string): UncertainSale | null {
  return useSyncExternalStore(subscribe, () => (uncertain?.tillId === tillId ? uncertain : null))
}

/**
 * The other tills of this tenant with a held sale, stored or put aside in this tab, so the till in
 * use says to check Today on them before anything is rung there again (RBW2-4).
 */
export function otherTillHolds(tenantId: string | null, tillId: string): string[] {
  const labels = new Map<string, string>()
  try {
    const prefix = `${HELD_PREFIX}${tenantId ?? '-'}.`
    for (const name of Object.keys(window.sessionStorage)) {
      if (!name.startsWith(prefix)) continue
      const entry = readEntry(tenantId, name.slice(prefix.length))
      if (entry && entry.tillId !== tillId) labels.set(entry.tillId, entry.tillLabel)
    }
  } catch {
    // Without storage only the tab's own holds are known.
  }
  for (const [id, { hold }] of parked) {
    if (id !== tillId && hold.tenantId === tenantId) labels.set(id, hold.tillLabel)
  }
  if (uncertain && uncertain.tillId !== tillId) labels.set(uncertain.tillId, uncertain.tillLabel)
  return [...labels.values()].sort()
}

export function useOtherTillHolds(tenantId: string | null, tillId: string): string[] {
  useSyncExternalStore(subscribe, () => changes)
  return otherTillHolds(tenantId, tillId)
}
