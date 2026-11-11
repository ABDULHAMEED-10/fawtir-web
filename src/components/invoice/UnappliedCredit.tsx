import { useTranslation } from 'react-i18next'
import { OmAmount } from '../ui'
import { formatAmount } from '../../lib/format'

/**
 * The credit a customer or a document holds (D-30(a)), on a line of its own, and the net balance
 * when one is given. The credit is never folded into the figure beside it: a reader sees what is
 * owed, what is held, and the net, each named. A screen with no credit to show renders nothing.
 */
export function UnappliedCredit({
  credit,
  net = null,
  currency,
  customers = null,
  hint = false,
  className = '',
}: {
  credit: number
  net?: number | null
  currency: string
  /** Customers holding credit (already formatted), for a figure across the directory. */
  customers?: string | null
  hint?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const money = (value: number) => formatAmount(value, currency, i18n.language)
  return (
    <div
      data-testid="unapplied-credit"
      className={['flex flex-col gap-1 text-sm font-medium text-text-tertiary', className]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="flex flex-wrap items-center gap-1.5">
        <span>{t('receivableCredit.unapplied')}</span>
        <OmAmount
          size="xs"
          amount={money(credit)}
          amountClassName="font-semibold text-text-primary tabular-nums"
        />
        {customers !== null ? (
          <span>· {t('receivableCredit.customers', { customers })}</span>
        ) : null}
      </p>
      {net !== null ? (
        <p className="flex flex-wrap items-center gap-1.5">
          <span>{t('receivableCredit.net')}</span>
          <OmAmount
            size="xs"
            amount={money(net)}
            amountClassName="font-semibold text-text-primary tabular-nums"
          />
        </p>
      ) : null}
      {hint ? <p className="text-xs leading-[1.4]">{t('receivableCredit.hint')}</p> : null}
    </div>
  )
}
