import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks/useApiRead'
import { useCan } from '../../lib/session/session'
import {
  INVOICING_READINESS_PATH,
  type InvoicingReadinessDto,
  type ReadinessItem,
} from '../../api/invoicing/readiness'

/** Where the company fixes each item it owns. */
const FIX_AT: Record<string, string> = {
  COMPANY_VERIFIED: '/settings/company',
  REGISTERED_ADDRESS: '/settings/company',
  CONTACT_PHONE: '/settings/company',
  BUSINESS_ACTIVITY: '/settings/company',
  PARTICIPANT_VERIFIED: '/settings/peppol',
  ACTIVE_BRANCH: '/settings/branches/new',
}

const KNOWN = new Set(Object.keys(FIX_AT))

/**
 * Every place above saves through a settings write (`admin.settings.manage`), so a reader without
 * it is told the item needs doing, not offered a page whose Save would refuse them.
 */
const FIX_PERMISSION = 'admin.settings.manage'

/**
 * What still stands between the company and issuing invoices, while anything does. Shown only on
 * an answer that says "not ready": loading, a 403, a 404 from a backend without the route, or any
 * other failure shows nothing, so the card never claims readiness or its absence on no evidence.
 */
export function InvoicingReadinessCard() {
  const { t } = useTranslation()
  const read = useApiRead<InvoicingReadinessDto>(INVOICING_READINESS_PATH).read
  if (read.status !== 'ready' || read.data.ready) return null
  const open = read.data.items.filter((item) => item.status !== 'DONE')
  if (open.length === 0) return null

  return (
    <section
      aria-labelledby="invoicing-readiness-title"
      className="rounded-md border border-warning-100 bg-surface-card p-5"
    >
      <h2 id="invoicing-readiness-title" className="text-lg font-semibold text-text-primary">
        {t('readiness.title')}
      </h2>
      <p className="mt-0.5 text-sm font-medium text-text-quaternary">{t('readiness.subtitle')}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {open.map((item) => (
          <Item key={item.code} item={item} />
        ))}
      </ul>
    </section>
  )
}

function Item({ item }: { item: ReadinessItem }) {
  const { t } = useTranslation()
  const label = KNOWN.has(item.code) ? t(`readiness.item.${item.code}`) : t('readiness.item.other')
  const to = FIX_AT[item.code]
  const canFix = useCan(FIX_PERMISSION)

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-background px-3 py-2.5">
      <span className="text-sm font-semibold text-text-primary">{label}</span>
      {item.status === 'AWAITING_PLATFORM' ? (
        <span className="text-sm font-medium text-text-tertiary">{t('readiness.awaitingFawtir')}</span>
      ) : item.owner === 'COMPANY' && to && canFix ? (
        <Link to={to} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('readiness.fix')}
        </Link>
      ) : (
        <span className="text-sm font-medium text-text-tertiary">{t('readiness.actionRequired')}</span>
      )}
    </li>
  )
}
