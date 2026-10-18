import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks/useApiRead'
import { BILLING_PATH, loadBillingOverview, type BillingOverviewDto } from '../../api/settings/billing'
import { OmAmount } from '../ui'
import { usePayingHeldUntilReconnected } from '../../hooks/usePayingHeldUntilReconnected'

/**
 * Brings a customer with an unpaid subscription bill to it. After approval a pay-now company gets
 * its first bill (owner, 12 Oct 2026: approval first, pay after), and this is how it finds it
 * after signing in. Only an OPEN bill counts: once a receipt or a cash request is sent the bill is
 * waiting for Fawtir, not for the customer. Loading, a 403 for a user who cannot pay, or any
 * failure shows nothing.
 */
export function BillDueCard() {
  const { t } = useTranslation()
  const read = useApiRead<BillingOverviewDto>(BILLING_PATH, loadBillingOverview).read
  // LV-6: a company that has left Fawtir is not sent to pay (A3.8); the bill is still named.
  const held = usePayingHeldUntilReconnected()
  if (read.status !== 'ready') return null
  const open = read.data.bills.find((entry) => entry.bill.status === 'OPEN')?.bill
  if (!open) return null
  return (
    <section
      aria-labelledby="bill-due-title"
      className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-primary-100 bg-surface-card p-5"
    >
      <div className="min-w-0">
        <h2 id="bill-due-title" className="text-lg font-semibold text-text-primary">
          {t('billDue.title')}
        </h2>
        <p className="mt-1 flex flex-wrap items-baseline gap-1 text-sm font-medium text-text-tertiary">
          <span>{t('billDue.body', { number: open.number })}</span>
          <OmAmount size="xs" amount={open.total} amountClassName="font-semibold text-text-primary" />
        </p>
        <p className="mt-1 text-sm font-medium text-text-quaternary">{t('billDue.activation')}</p>
      </div>
      {held ? null : (
        <Link
          to="/settings/bills"
          className="inline-flex items-center rounded-sm bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800"
        >
          {t('billDue.cta')}
        </Link>
      )}
    </section>
  )
}
