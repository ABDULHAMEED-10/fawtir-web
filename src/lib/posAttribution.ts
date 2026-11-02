import type { TFunction } from 'i18next'
import type { PosSaleDto } from '../api/pos/pos'

/**
 * Who a till sale is shown as made by (WEB-7, BINDING-DESIGN §9). A sale whose seller is not proven
 * is never shown under a name as if it were: PENDING_REVIEW (no cashier yet) says so, and LEGACY
 * names the signed-in sender with the qualifier that nothing proves they sold it. A server before
 * V530 sends no `attribution` and always a cashier, which reads as before.
 */
export function saleCashierLabel(
  sale: Pick<PosSaleDto, 'cashier' | 'filedBy' | 'attribution'>,
  t: TFunction,
): string {
  if (sale.attribution === 'PENDING_REVIEW' || !sale.cashier) return t('pos.offline.pending')
  if (sale.attribution === 'LEGACY') {
    return t('pos.offline.legacy', { name: (sale.filedBy ?? sale.cashier).name ?? '' })
  }
  return sale.cashier.name ?? ''
}
