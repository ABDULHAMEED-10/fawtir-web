import type { TFunction } from 'i18next'
import type { PosSaleDto } from '../api/pos/pos'

/**
 * Who a till sale is shown as made by (WEB-7, BINDING-DESIGN §9). A sale whose seller is not proven
 * is never shown under a name as if it were: PENDING_REVIEW (no cashier yet) says so, and LEGACY
 * names the signed-in sender with the qualifier that nothing proves they sold it. A server before
 * V530 sends no `attribution` and always a cashier, which reads as before for a sale made online.
 */
export function saleCashierLabel(
  sale: {
    cashier: { userId: string | null; name: string | null } | null
    filedBy?: PosSaleDto['filedBy']
    attribution?: PosSaleDto['attribution']
    queuedOffline?: boolean
  },
  t: TFunction,
): string {
  if (sale.attribution === 'PENDING_REVIEW' || !sale.cashier || sale.cashier.userId === null) {
    return t('pos.offline.pending')
  }
  if (unprovenSender(sale)) {
    return t('pos.offline.legacy', { name: (sale.filedBy ?? sale.cashier).name ?? '' })
  }
  return sale.cashier.name ?? ''
}

/**
 * A queued sale with no attribution was filed before V530, or by a pre-V530 node during a rolling
 * deploy (SEC-R B39-SR-11): its cashier is whoever sent the queue, which is exactly what LEGACY
 * records. BINDING-DESIGN §12.2 reads those rows as LEGACY, and owner M-6 point 4 forbids showing a
 * LEGACY sender as a proven cashier, so only an online sale keeps the pre-V530 plain name (OFF43).
 */
export function unprovenSender(sale: {
  attribution?: PosSaleDto['attribution']
  queuedOffline?: boolean
}): boolean {
  if (sale.attribution === 'LEGACY') return true
  return sale.attribution == null && sale.queuedOffline === true
}
