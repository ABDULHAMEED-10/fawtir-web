import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEntitlements } from '../../hooks/useEntitlements'
import { openAreas } from '../../lib/erp/integrationAreas'

/**
 * The places of Settings › Integration, as one strip on every ERP screen (Phase 9), so the
 * connections, the two document channels, the mapping, the activity and the access screens read
 * as one area rather than five separate cards.
 *
 * **What a reader may open, not what exists.** Each area appears only to a holder of the
 * permission its first read needs, so nobody is led to a screen that answers "no access", and a
 * screen is never mislabelled "not set up" for a reader who simply may not see it. This decides
 * what is offered and nothing more: every request is authorised again by the server, which is the
 * only authority. Access & History is always offered, because it is where a reader learns what
 * they may do.
 *
 * Drawn in the mapping screens' own subnav idiom (ErpShell), so it adds no new visual element.
 */
export function IntegrationAreaNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { entitlements, ready } = useEntitlements()
  // Nothing until the snapshot is in, rather than a strip that changes under the reader.
  if (!ready) return null
  const areas = openAreas(entitlements)
  // ERP switched off for the company: an empty strip would only draw a rule above the notice.
  if (areas.length === 0) return null

  return (
    <nav
      aria-label={t('erp.area.label')}
      className="-mb-1 flex gap-1 overflow-x-auto border-b border-border-subtle max-md:flex-wrap max-md:overflow-x-visible"
    >
      {areas.map((area) => {
        const active = area.owns(pathname)
        return (
          <Link
            key={area.id}
            to={area.to}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex h-[46px] shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors max-md:h-[40px]',
              active
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(`erp.area.${area.id}`)}
          </Link>
        )
      })}
    </nav>
  )
}
