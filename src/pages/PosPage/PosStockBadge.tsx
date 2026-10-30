import { useTranslation } from 'react-i18next'
import type { StockFlag } from '../../lib/posShelf'

const STOCK_TONE: Record<StockFlag, string> = {
  LOW: 'bg-pending-100 text-pending-700',
  OUT: 'bg-danger-100 text-danger-700',
  BELOW_ZERO: 'bg-danger-100 text-danger-700',
}

/** "Low", "Out of stock" or "Below zero" on a tile or a size; it never stops the sale. */
export function StockBadge({ flag, className = '' }: { flag: StockFlag; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={[
        'rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]',
        STOCK_TONE[flag],
        className,
      ].join(' ')}
    >
      {t(`pos.badge.stock.${flag}`)}
    </span>
  )
}
