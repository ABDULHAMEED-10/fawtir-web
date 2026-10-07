import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Pager, RowsView } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill, type ConsolePillTone } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import {
  REVIEW_PERMISSION,
  VERIFICATION_ROUTE,
  queuePath,
  type CompanySummary,
  type CompanySummaryPage,
  type TenantStatus,
} from '../../lib/console/companyVerification'
import { countryName, formatDay, localeFor } from '../../lib/console/format'
import {
  CONSOLE_CARD,
  CONSOLE_LINK,
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_ROWS,
  CONSOLE_TABLE,
  CONSOLE_TABLE_BODY,
  CONSOLE_THEAD,
  ConsolePageHeader,
} from '../../layouts/ConsoleShell/consoleStyle'

const TENANTS_ROUTE = '/console/tenants'

/**
 * The tone each tenant lifecycle state carries. Keyed on the backend's own
 * `TenantStatus`, so a state the backend adds shows as neutral rather than
 * crashing the row.
 */
const STATUS_TONE: Record<TenantStatus, ConsolePillTone> = {
  ACTIVE: 'success',
  PENDING: 'pending',
  SUSPENDED: 'danger',
  CLOSED: 'neutral',
}

/** Reads the page from the URL. One-based in the URL, zero-based to the backend. */
function tenantsPage(params: URLSearchParams): number {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * The platform's operational register of tenant records (read-only).
 *
 * Distinct from {@link VerificationPage}, which owns the onboarding decision
 * workflow: this screen lists every tenant the platform holds, whatever its
 * verification state, and never offers attest or reject.
 *
 * Paged and ordered by the backend alone. The prototype's plan, quota, filing
 * health and monthly revenue columns are absent because
 * `GET /api/v1/platform/companies` publishes no such fields and no other
 * endpoint does either — rendering them would have meant inventing commercial
 * figures for real businesses. Search, filters, sort and export went for the
 * same reason: the endpoint's only parameters are `status`, `page` and `size`.
 */
export function TenantsPage() {
  return (
    <ConsoleShell requires={REVIEW_PERMISSION}>
      <TenantsRegister />
    </ConsoleShell>
  )
}

function TenantsRegister() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const page = tenantsPage(params)
  // 'all' sends no status filter, which is what an operational register wants:
  // every tenant, not only the ones awaiting a decision.
  const { read, retry } = useConsoleRead<CompanySummaryPage>(queuePath('all', page - 1))
  const number = new Intl.NumberFormat(localeFor(i18n.language))

  const goTo = (next: number) => {
    const params = new URLSearchParams()
    if (next > 1) params.set('page', String(next))
    setParams(params)
  }

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.tenants.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.items.length === 0) {
    body =
      read.data.totalElements === 0 ? (
        <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
          {t('console.tenants.empty')}
        </p>
      ) : (
        <ConsoleNotice
          body={t('console.tenants.pastEnd')}
          action={{ label: t('console.tenants.firstPage'), onClick: () => goTo(1) }}
        />
      )
  } else {
    body = <TenantsTable rows={read.data.items} />
  }

  const loaded = read.status === 'ready' && read.data.items.length > 0 ? read.data : null

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.tenants' }]} />
      <ConsolePageHeader
        title={t('console.tenants.title')}
        subtitle={
          read.status === 'ready'
            ? t('console.tenants.registered', {
                total: number.format(read.data.totalElements),
              })
            : t('console.tenants.subtitlePlain')
        }
        actions={
          <Link to="/console/tenants/new" className={CONSOLE_PRIMARY}>
            {t('console.tenants.onboard')}
          </Link>
        }
      />

      <section className={`flex flex-col overflow-hidden ${CONSOLE_CARD}`}>
        {/* The table runs to the card's edges; a notice keeps the card's padding. */}
        <div className={CONSOLE_TABLE_BODY}>{body}</div>

        {loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-5 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {t('console.tenants.showingRange', {
                from: number.format(loaded.page * loaded.size + 1),
                to: number.format(loaded.page * loaded.size + loaded.items.length),
                total: number.format(loaded.totalElements),
              })}
            </p>
            {loaded.totalPages > 1 ? (
              <Pager
                page={loaded.page + 1}
                pageCount={loaded.totalPages}
                onChange={goTo}
                labels={{
                  nav: t('console.tenants.pager.label'),
                  previous: t('console.tenants.pager.previous'),
                  next: t('console.tenants.pager.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function TenantsTable({ rows }: { rows: CompanySummary[] }) {
  const { t, i18n } = useTranslation()
  const none = t('console.tenants.none')

  return (
    <RowsView className={CONSOLE_ROWS}>
      <table className={`${CONSOLE_TABLE} min-w-[760px]`}>
        <thead>
          <tr className={CONSOLE_THEAD}>
            <th className="px-4 py-3 text-start font-semibold">
              {t('console.tenants.col.business')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">{t('console.tenants.col.code')}</th>
            <th className="px-2 py-3 text-start font-semibold">{t('console.tenants.col.status')}</th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.tenants.col.registered')}
            </th>
            <th className="px-2 py-3 text-end font-semibold">
              {t('console.tenants.col.action')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tenant) => (
            <tr key={tenant.tenantId} className="border-b border-border-subtle last:border-b-0">
              <td className="px-4 py-4">
                <Link
                  to={`${TENANTS_ROUTE}/${tenant.tenantId}`}
                  className="text-[15.5px] font-semibold leading-[1.2] text-text-primary hover:text-primary-800"
                >
                  {tenant.tenantName}
                </Link>
                <span className="mt-1 block text-xs font-medium text-text-muted">
                  {tenant.legalName ?? t('console.tenants.noLegalName')}
                  {tenant.country ? ` · ${countryName(tenant.country, i18n.language)}` : ''}
                </span>
              </td>
              <td className="px-2 py-4 text-sm font-medium text-text-secondary [overflow-wrap:anywhere]">
                <bdi dir="ltr">{tenant.tenantCode}</bdi>
              </td>
              <td className="px-2 py-4">
                <span className="flex flex-wrap items-center gap-1.5">
                  {tenant.tenantStatus ? (
                    <ConsoleStatusPill
                      tone={STATUS_TONE[tenant.tenantStatus] ?? 'neutral'}
                      label={t(`console.tenants.status.${tenant.tenantStatus}`)}
                    />
                  ) : (
                    <span className="text-sm font-medium text-text-secondary">{none}</span>
                  )}
                  {/*
                    A refused registration keeps its account pending, so "Pending" alone would read
                    as still waiting. The verification outcome the row already carries says why.
                  */}
                  {tenant.verificationStatus === 'REJECTED' ? (
                    <ConsoleStatusPill
                      tone="danger"
                      label={t('console.verification.status.REJECTED')}
                    />
                  ) : null}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-4 text-sm font-medium text-text-secondary">
                {tenant.submittedAt ? formatDay(tenant.submittedAt, i18n.language) : none}
              </td>
              {/* On a phone card, a row with nothing to do drops the empty "Action" line. */}
              <td className="px-2 py-4 text-end [.rows-cards_&:empty]:!hidden">
                {/*
                  A company awaiting a decision is work, and the decision belongs to the
                  verification queue alone — this directory links to it rather than carrying a
                  second attest/reject implementation.
                */}
                {tenant.verificationStatus === 'PENDING_VERIFICATION' ||
                tenant.verificationStatus === 'REJECTED' ? (
                  <Link
                    to={`${VERIFICATION_ROUTE}/${tenant.tenantId}`}
                    className={`whitespace-nowrap ${CONSOLE_LINK}`}
                  >
                    {/* A refused company has nothing left to review; its record says why. */}
                    {t(
                      tenant.verificationStatus === 'REJECTED'
                        ? 'console.tenants.seeDecision'
                        : 'console.tenants.review',
                    )}
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RowsView>
  )
}
