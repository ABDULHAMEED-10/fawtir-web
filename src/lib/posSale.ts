import { useSyncExternalStore } from 'react'
import type { PosPerson, PosPrintedTotals, PosSaleDto, PosSaleRequest } from '../api/pos/pos'
import type { SlipPhoto } from './posSlipOutbox'
import { NO_SALE_DISCOUNT, type SaleDiscount, type SaleLine, type SaleTotals } from './pos'

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
  /** Queued behind a sale the server would not take, not because the till is offline. */
  queuedBehind?: boolean
  finishedAt: string
}

/**
 * A sale whose own request went out with no definite answer (Stage B E-01): exactly what was sent,
 * so it can only be sent again as it was, under the same key, and what its receipt prints if it
 * then succeeds. While it is held the open sale cannot be changed, since a changed basket or
 * payment is a new sale with a new key, and a customer whose first sale was recorded would be
 * charged twice. Kept in sessionStorage per till and shift with the basket it was sent from, so a
 * reload, a re-login or a restored tab still offers only the same sale (review E01R-1).
 */
export type UncertainSale = {
  tillId: string
  shiftId: string | null
  key: string
  request: PosSaleRequest
  slipPhotos: SlipPhoto[]
  printed: PosPrintedTotals
  maker: PosPerson | null
  receipt: Omit<FinishedSale, 'sale' | 'queuedNumber' | 'queuedQr' | 'queuedBehind' | 'finishedAt'>
  /** Set when the hold could not be stored: a reload would forget it, so the screen says so. */
  unsaved?: boolean
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

function notify() {
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
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(HELD_PREFIX)) window.sessionStorage.removeItem(key)
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
 * another attempt. Slip photos are not stored (a scanned slip can outgrow the quota); a restored
 * hold sends the sale again without them. Storage may be absent or refuse (private mode, quota):
 * the hold then lives in memory and says that a reload would forget it.
 */
const HELD_PREFIX = 'fawtir.pos.uncertainSale.'
const heldKey = (tillId: string, shiftId: string | null) => `${HELD_PREFIX}${tillId}.${shiftId ?? '-'}`

type StoredHold = { held: Omit<UncertainSale, 'slipPhotos' | 'unsaved'>; basket: OpenSale }

export const holdUncertainSale = (held: UncertainSale) => {
  let unsaved = false
  try {
    const stored: StoredHold = {
      held: {
        tillId: held.tillId,
        shiftId: held.shiftId,
        key: held.key,
        request: held.request,
        printed: held.printed,
        maker: held.maker,
        receipt: held.receipt,
      },
      basket: sale,
    }
    window.sessionStorage.setItem(heldKey(held.tillId, held.shiftId), JSON.stringify(stored))
  } catch {
    unsaved = true
  }
  uncertain = { ...held, unsaved }
  notify()
}

/** The outcome is known: the sale was recorded, kept, or definitely refused under its key. */
export const settleUncertainSale = () => {
  if (uncertain) {
    try {
      window.sessionStorage.removeItem(heldKey(uncertain.tillId, uncertain.shiftId))
    } catch {
      // Nothing could be stored either.
    }
  }
  uncertain = null
  notify()
}

/**
 * After a reload, a re-login or a restored tab: the stored hold of this till and shift comes back
 * with the basket it was sent from, and the till again offers only the same sale (E01R-1). A hold
 * already in memory is kept as it is.
 */
export function restoreUncertainSale(tillId: string, shiftId: string | null): void {
  if (uncertain) return
  let stored: StoredHold
  try {
    const raw = window.sessionStorage.getItem(heldKey(tillId, shiftId))
    if (!raw) return
    stored = JSON.parse(raw) as StoredHold
  } catch {
    return
  }
  const held = stored?.held
  if (
    !held ||
    typeof held.key !== 'string' ||
    !held.request ||
    held.request.tillId !== tillId ||
    !held.receipt ||
    !Array.isArray(stored.basket?.lines)
  ) {
    return
  }
  uncertain = { ...held, tillId, shiftId, slipPhotos: [] }
  sale = stored.basket
  finished = null
  notify()
}

export function useUncertainSale(): UncertainSale | null {
  return useSyncExternalStore(subscribe, () => uncertain)
}
