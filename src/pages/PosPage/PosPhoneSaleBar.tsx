import { useTranslation } from 'react-i18next'
import { Rial } from '../../components/ui'
import { omr, totalsFor, type SaleLine } from '../../lib/pos'
import { useOpenSale } from '../../lib/posSale'
import { useEntitlements } from '../../hooks/useEntitlements'
import { discountBreach } from '../../lib/posDiscountLimit'

/** The sale panel's id, which the bar's summary scrolls to. */
export const POS_SALE_PANEL_ID = 'pos-this-sale'

/**
 * On a phone the sale panel sits under the whole shelf, thousands of pixels down with a full
 * catalogue. This bar keeps the sale in reach there: the count and total (a tap goes to the panel)
 * and Take payment, which does what the panel's own button does. Nothing on the sale, no bar.
 * The figures are the panel's, from the same lines and the same engine, and so is the guard: a
 * discount over the cashier's limit stops Take payment here as it does there, and the summary
 * leads to the panel that says why.
 */
export function PosPhoneSaleBar({
  lines,
  onTakePayment,
}: {
  lines: SaleLine[]
  onTakePayment: () => void
}) {
  const { t } = useTranslation()
  const { saleDiscount } = useOpenSale()
  const { entitlements } = useEntitlements()
  if (lines.length === 0) return null
  const limit = entitlements?.discountLimits?.['pos.sell'] ?? null
  const blocked = discountBreach(lines, saleDiscount, limit) !== null
  const items = lines.reduce((sum, line) => sum + line.qty, 0)
  const totals = totalsFor(lines, saleDiscount)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border-subtle bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <button
        type="button"
        onClick={() =>
          document.getElementById(POS_SALE_PANEL_ID)?.scrollIntoView?.({ behavior: 'smooth' })
        }
        aria-label={t('pos.phoneBar.seeSale')}
        className="min-h-11 min-w-0 flex-1 text-start"
      >
        <span className="block truncate text-xs font-medium text-text-quaternary">
          {t('pos.phoneBar.itemCount', { count: items })}
        </span>
        <span className="mt-0.5 inline-flex items-baseline gap-1 text-lg font-semibold leading-none text-text-primary">
          <Rial />
          {omr(totals.sale)}
        </span>
      </button>
      <button
        type="button"
        onClick={onTakePayment}
        disabled={blocked}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('pos.takePayment')}
      </button>
    </div>
  )
}
