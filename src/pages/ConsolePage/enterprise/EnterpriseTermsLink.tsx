import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { CONSOLE_SECONDARY } from '../../../layouts/ConsoleShell/consoleStyle'
import { hasPermission } from '../../../lib/identity/entitlements'
import { BILLING_READ, enterpriseTermsRoute } from '../../../lib/console/enterpriseTerms'

/**
 * "Enterprise terms" in the tenant page's header (P2-5 §3.9). It moves into the company's
 * subscription section once that section carries its own actions. Hidden without the read the
 * terms page needs.
 */
export function EnterpriseTermsLink({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { entitlements } = useEntitlements()
  if (entitlements === null || !hasPermission(entitlements, BILLING_READ)) return null
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <Link to={enterpriseTermsRoute(tenantId)} className={CONSOLE_SECONDARY}>
        {t('console.enterpriseTerms.open')}
      </Link>
    </div>
  )
}
