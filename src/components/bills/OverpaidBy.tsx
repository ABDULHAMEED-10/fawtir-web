import { useTranslation } from 'react-i18next'
import { Rial } from '../ui'

/**
 * "Overpaid by {amount}" (owner's answer 13, 8 Oct 2026) with the rial sign before its figure, in
 * either language's word order. One sentence for the bill, the supplier and the statement. The
 * amount comes formatted, at the currency's three decimals.
 */
export function OverpaidBy({ amount }: { amount: string }) {
  const { t } = useTranslation()
  const [before, after = ''] = t('billDetail.overpaid.overpaidBy', { amount: '¤' }).split('¤')
  return (
    <>
      {before}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Rial />
        {amount}
      </span>
      {after}
    </>
  )
}
