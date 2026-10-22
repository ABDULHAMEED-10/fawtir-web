import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import { BILLING_SETTINGS_PATH, type BillingSettingsDto } from '../../lib/console/billingSettings'
import { PLANS_PATH, type CatalogueAdminPlan } from '../../lib/console/planCatalogue'
import { MONTHS_OF, type SubscriptionPlanId, type Term } from '../../lib/consoleSubscriptions'
import { PLAN } from '../../lib/plans'

/** What the first period bills, VAT included, or null when it cannot be priced. */
export type FirstInvoiceTotal = (plan: SubscriptionPlanId, term: Term) => number | null

/**
 * The first period's price from the console's own records (GEN-2, PL-3): the plan's current
 * price version from `GET /platform/plans` and the VAT rate from `GET /platform/billing/settings`.
 * Until both are read, if either read fails, or for Enterprise (priced per contract), there is no
 * figure: the screen shows a dash and never a launch price.
 */
export function useFirstInvoiceTotal(): FirstInvoiceTotal {
  const { read: plans } = useConsoleRead<CatalogueAdminPlan[]>(PLANS_PATH)
  const { read: settings } = useConsoleRead<BillingSettingsDto>(BILLING_SETTINGS_PATH)
  return (plan, term) => {
    if (plan === 'enterprise' || plans.status !== 'ready' || settings.status !== 'ready') return null
    const version = plans.data.find((entry) => entry.code === PLAN[plan].code)?.currentVersion
    const rate = settings.data.vatRate === null ? NaN : Number(settings.data.vatRate)
    if (!version || !Number.isFinite(rate)) return null
    const net =
      term === 'annual'
        ? Number(version.annualPrice)
        : Number(version.monthlyPrice) * MONTHS_OF[term]
    if (!Number.isFinite(net)) return null
    return Math.round(net * (1 + rate) * 1000) / 1000
  }
}
