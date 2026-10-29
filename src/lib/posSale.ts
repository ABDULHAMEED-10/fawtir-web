import { useSyncExternalStore } from 'react'
import type { PosSaleDto } from '../api/pos/pos'
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
}

/** A walk-in named for a full invoice (over 500, or an ID asked for): printed as the buyer. */
export type SaleBuyer = {
  name: string
  identifierScheme: string
  identifierValue: string
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
  finishedAt: string
}

const START: OpenSale = {
  lines: [],
  saleDiscount: NO_SALE_DISCOUNT,
  company: null,
  startedAt: null,
}

let sale: OpenSale = START
let finished: FinishedSale | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function update(next: Partial<OpenSale>) {
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
  sale = START
  finished = null
  notify()
}

/** For tests. */
export const resetOpenSale = (lines: SaleLine[] = []) => {
  sale = { ...START, lines, startedAt: lines.length ? '2026-09-04T10:26:00Z' : null }
  finished = null
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
