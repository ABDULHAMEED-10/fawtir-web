import { useSyncExternalStore } from 'react'
import { NO_SALE_DISCOUNT, OPEN_SALE, type SaleDiscount, type SaleLine } from './pos'

/**
 * The sale on the till, shared by the sale, company, payment and receipt screens, so a quantity
 * or a discount on the whole sale changed on one is what the next one charges and prints (owner,
 * 21 Oct 2026). It lives for the browser tab, as a till's open sale does; "Start a new sale"
 * clears it. It opens on the design's sample sale while the till sells the sample shelf.
 */
export type OpenSale = {
  lines: SaleLine[]
  saleDiscount: SaleDiscount
}

const START: OpenSale = { lines: OPEN_SALE, saleDiscount: NO_SALE_DISCOUNT }

let sale: OpenSale = START
const listeners = new Set<() => void>()

function update(next: Partial<OpenSale>) {
  sale = { ...sale, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const setSaleLines = (lines: SaleLine[] | ((current: SaleLine[]) => SaleLine[])) =>
  update({ lines: typeof lines === 'function' ? lines(sale.lines) : lines })
export const setSaleDiscount = (saleDiscount: SaleDiscount) => update({ saleDiscount })
/** After the receipt: an empty till, ready for the next customer. */
export const startNewSale = () => update({ lines: [], saleDiscount: NO_SALE_DISCOUNT })
/** Back to the sample sale. For tests. */
export const resetOpenSale = () => update(START)

export function useOpenSale(): OpenSale {
  return useSyncExternalStore(subscribe, () => sale)
}
