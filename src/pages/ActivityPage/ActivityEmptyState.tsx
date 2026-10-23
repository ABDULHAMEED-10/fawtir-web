import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { InvoicingReadinessCard } from '../../components/readiness/InvoicingReadinessCard'
import emptyIcon from '../../assets/activity/empty.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

/**
 * Activity before the first invoice (Figma 154:110456), drawn under the page's own header when
 * the ledger holds no document at all.
 *
 * Above it, only what the server says still stands between the company and reporting
 * (`GET /v1/invoicing/readiness`), and nothing when it is ready. It used to print a "connected to
 * the Tax Authority" banner with a sample company's VAT number, Participant ID and a connection
 * latency no endpoint measures (asks row 2.8).
 */
export function ActivityEmptyState() {
  const { t } = useTranslation()
  // No new drafts while the subscription is read-only (ST-2, CA-3).
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')

  return (
    <>
      <InvoicingReadinessCard />

      <section className="flex min-h-[620px] flex-col items-center justify-center rounded-md bg-surface-card px-6 py-20 text-center md:min-h-[860px]">
        <img src={emptyIcon} alt="" className="h-auto w-[190px]" />
        <h2 className="mt-9 text-2xl font-medium leading-[1.2] text-text-primary">
          {t('activity.emptyState.title')}
        </h2>
        <p className="mt-4 max-w-[640px] text-sm font-medium leading-[1.7] text-text-secondary">
          {t('activity.emptyState.body')}
        </p>
        {mayDraft ? (
          <Link
            to="/invoices/new"
            className="mt-8 inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
            {t('activity.emptyState.action')}
          </Link>
        ) : null}
      </section>
    </>
  )
}
