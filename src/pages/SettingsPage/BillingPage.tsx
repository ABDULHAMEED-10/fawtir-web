import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { SubscriptionStatusSection } from './SubscriptionStatusSection'
import { SubscriptionBillingSection } from './SubscriptionBillingSection'

/**
 * Settings › Bills and payment, real throughout since V271: where the subscription stands
 * (`/v1/settings/subscription`), then the charge and how to pay it (`/v1/settings/billing`).
 *
 * The prototype that stood here (Figma 135:40971) drew a sample company's bills, a "Pay now" that
 * did nothing and a card link sent by email or WhatsApp. It is gone rather than kept beside real
 * data: a sample bill next to a real one is exactly the confusion the mock-data policy forbids,
 * and the self-service link choice is replaced by Paymob checkout in a later phase.
 */
export function BillingPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="billing">
      <SettingsHeader
        title={t('bills.title')}
        subtitle={t('bills.subtitle')}
        actions={
          <Link
            to="/settings/plan"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('bills.planAndUsage')}
          </Link>
        }
      />
      <SubscriptionStatusSection page="billing" />
      <SubscriptionBillingSection />
    </SettingsShell>
  )
}
