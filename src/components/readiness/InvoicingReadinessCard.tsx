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

/** What the reader can do now comes first, then what Fawtir is checking, then what is done. */
const ORDER: Record<ReadinessItem['status'], number> = {
  ACTION_REQUIRED: 0,
  AWAITING_PLATFORM: 1,
  DONE: 2,
}

/**
 * What still stands between the company and issuing invoices, while anything does. Shown only on
 * an answer that says "not ready": loading, a 403, a 404 from a backend without the route, or any
 * other failure shows nothing, so the card never claims readiness or its absence on no evidence.
 *
 * On the dashboard it is the company's setup list (no Figma frame; drawn in the house style,
 * handbook 3.3): every step the server lists, with how many are done, a status mark, why the step
 * matters and a button to the page that does it. In the composer it explains, before Issue, why
 * issuing would be refused, and lists only what is still open. It never disables Issue: the
 * server's issuance checks stay the authority, and this answer can be a moment stale.
 */
export function InvoicingReadinessCard({
  context = 'dashboard',
}: {
  context?: 'dashboard' | 'composer'
}) {
  const { t } = useTranslation()
  const composer = context === 'composer'
  const copy = composer ? 'readiness.composer' : 'readiness'
  const read = useApiRead<InvoicingReadinessDto>(INVOICING_READINESS_PATH).read
  if (read.status !== 'ready' || read.data.ready) return null
  const items = read.data.items
  const open = items.filter((item) => item.status !== 'DONE')
  if (open.length === 0) return null
  const shown = [...(composer ? open : items)].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const done = items.length - open.length

  return (
    <section
      aria-labelledby="invoicing-readiness-title"
      className="rounded-md border border-border-default bg-surface-card"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 p-5">
        <div className="min-w-0">
          <h2 id="invoicing-readiness-title" className="text-lg font-semibold text-text-primary">
            {t(`${copy}.title`)}
          </h2>
          <p className="mt-0.5 text-sm font-medium text-text-quaternary">{t(`${copy}.subtitle`)}</p>
        </div>
        {composer ? null : (
          <div className="flex w-full flex-col gap-1.5 sm:w-56">
            <span className="text-sm font-semibold text-text-secondary">
              {t('readiness.progress', { done, total: items.length })}
            </span>
            <div
              role="progressbar"
              aria-label={t('readiness.progressLabel')}
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={done}
              className="h-2 overflow-hidden rounded-full bg-neutral-100"
            >
              <div
                className="h-full rounded-full bg-success-700"
                style={{ width: `${(done / items.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <ul className="border-t border-border-default">
        {shown.map((item) => (
          <Item key={item.code} item={item} />
        ))}
      </ul>
    </section>
  )
}

function Item({ item }: { item: ReadinessItem }) {
  const { t } = useTranslation()
  const known = KNOWN.has(item.code)
  const label = known ? t(`readiness.item.${item.code}`) : t('readiness.item.other')
  const to = Object.hasOwn(FIX_AT, item.code) ? FIX_AT[item.code] : undefined
  const canFix = useCan(FIX_PERMISSION)
  const done = item.status === 'DONE'

  let end
  if (done)
    end = <span className="text-sm font-semibold text-success-700">{t('readiness.done')}</span>
  else if (item.status === 'AWAITING_PLATFORM')
    end = (
      <span className="text-sm font-medium text-text-tertiary">
        {t('readiness.awaitingFawtir')}
      </span>
    )
  else if (item.owner === 'COMPANY' && to && canFix)
    end = (
      <Link
        to={to}
        className="inline-flex h-9 shrink-0 items-center rounded-sm border border-border-brand-subtle bg-surface-card px-3 text-sm font-semibold text-text-brand hover:bg-primary-25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-brand"
      >
        {known ? t(`readiness.action.${item.code}`) : t('readiness.fix')}
      </Link>
    )
  else
    end = (
      <span className="text-sm font-medium text-warning-700">{t('readiness.actionRequired')}</span>
    )

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-border-default px-5 py-3.5 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <StatusMark status={item.status} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${done ? 'text-text-tertiary' : 'text-text-primary'}`}>
          {label}
        </p>
        {known && !done ? (
          <p className="mt-0.5 text-sm font-medium text-text-quaternary">
            {t(`readiness.hint.${item.code}`)}
          </p>
        ) : null}
      </div>
      <div className="col-start-2 sm:col-start-auto">{end}</div>
    </li>
  )
}

/** A tick for done, a clock while Fawtir checks, an exclamation mark for the company to act. */
function StatusMark({ status }: { status: ReadinessItem['status'] }) {
  const tone =
    status === 'DONE'
      ? 'bg-success-100 text-success-700'
      : status === 'AWAITING_PLATFORM'
        ? 'bg-neutral-100 text-text-tertiary'
        : 'bg-warning-100 text-warning-700'
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {status === 'DONE' ? (
          <path
            d="m3.5 8.3 2.8 2.8 6-6.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : status === 'AWAITING_PLATFORM' ? (
          <>
            <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 5v3.2l2 1.3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path d="M8 3.8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="8" cy="11.6" r="1" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  )
}
