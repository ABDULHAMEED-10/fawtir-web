import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Pager, RowsView } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import {
  QUEUE_TABS,
  REVIEW_PERMISSION,
  VERIFICATION_ROUTE,
  isCorrectionOverdue,
  isQueueTab,
  isSubmitted,
  queuePath,
  reportsCorrectionOverdue,
  type CompanySummary,
  type CompanySummaryPage,
  type QueueReturn,
  type QueueTab,
} from '../../lib/console/companyVerification'
import { countryName, formatDay, localeFor } from '../../lib/console/format'
import { VerificationStatusPill } from './verification/VerificationStatusPill'
import { ConsoleStatusPill } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { CONSOLE_PAGE, CONSOLE_ROWS, CONSOLE_TABLE, CONSOLE_TABLE_BODY, CONSOLE_TAB_BAR, CONSOLE_TAB_LINE, CONSOLE_THEAD, ConsolePageHeader } from '../../layouts/ConsoleShell/consoleStyle'
import { consoleTab } from '../../layouts/ConsoleShell/consoleTones'

const DEFAULT_TAB: QueueTab = 'pending'

/** Reads the queue's place from the URL, falling back to the first page of pending work. */
function queuePlace(params: URLSearchParams): { tab: QueueTab; page: number } {
  const status = params.get('status')
  const page = Number(params.get('page'))
  return {
    tab: isQueueTab(status) ? status : DEFAULT_TAB,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/**
 * The platform's company-verification queue (read-only): every registration and where it stands.
 *
 * Paged, filtered and ordered by the backend alone — it has a status filter and nothing else, so
 * the design's search, filter and sort controls are absent rather than pretending to work.
 */
export function VerificationPage() {
  return (
    <ConsoleShell requires={REVIEW_PERMISSION}>
      <VerificationQueue />
    </ConsoleShell>
  )
}

function VerificationQueue() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { tab, page } = queuePlace(params)
  const { read, retry } = useConsoleRead<CompanySummaryPage>(queuePath(tab, page - 1))
  const number = new Intl.NumberFormat(localeFor(i18n.language))

  const goTo = (nextTab: QueueTab, nextPage: number) => {
    const next = new URLSearchParams()
    if (nextTab !== DEFAULT_TAB) next.set('status', nextTab)
    if (nextPage > 1) next.set('page', String(nextPage))
    setParams(next)
  }

  // The overdue tab exists only on a server that reports the flag: an older one ignores the filter
  // and would answer with every company under that name.
  const reported = read.status === 'ready' && reportsCorrectionOverdue(read.data.items)
  const unsupportedTab = tab === 'correctionOverdue' && read.status === 'ready' && !reported
  const tabs = QUEUE_TABS.filter(
    (entry) => entry !== 'correctionOverdue' || tab === 'correctionOverdue' || reported,
  )

  let body
  if (unsupportedTab) {
    body = (
      <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.verification.empty.correctionOverdue')}
      </p>
    )
  } else if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.verification.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.items.length === 0) {
    body =
      read.data.totalElements === 0 ? (
        <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
          {t(`console.verification.empty.${tab}`)}
        </p>
      ) : (
        <ConsoleNotice
          body={t('console.verification.pastEnd')}
          action={{ label: t('console.verification.firstPage'), onClick: () => goTo(tab, 1) }}
        />
      )
  } else {
    body = <QueueTable rows={read.data.items} returnTo={{ queueSearch: location.search }} />
  }

  const loaded =
    read.status === 'ready' && read.data.items.length > 0 && !unsupportedTab ? read.data : null

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.verification' }]} />
      <ConsolePageHeader
        title={t('console.verification.title')}
        subtitle={t('console.verification.subtitle')}
      />

      <section className="flex flex-col rounded-sm bg-surface-card">
        <div className={CONSOLE_TAB_BAR}>
          {tabs.map((entry) => {
            const active = entry === tab
            return (
              <button
                key={entry}
                type="button"
                onClick={() => goTo(entry, 1)}
                aria-pressed={active}
                className={consoleTab(active)}
              >
                {t(`console.verification.tab.${entry}`)}
                {active ? (
                  <span className={CONSOLE_TAB_LINE} />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className={CONSOLE_TABLE_BODY}>{body}</div>

        {loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-5 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {t('console.verification.showing', {
                from: number.format(loaded.page * loaded.size + 1),
                to: number.format(loaded.page * loaded.size + loaded.items.length),
                total: number.format(loaded.totalElements),
              })}
            </p>
            {loaded.totalPages > 1 ? (
              <Pager
                page={loaded.page + 1}
                pageCount={loaded.totalPages}
                onChange={(next) => goTo(tab, next)}
                labels={{
                  nav: t('console.verification.pager.label'),
                  previous: t('console.verification.pager.previous'),
                  next: t('console.verification.pager.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function QueueTable({ rows, returnTo }: { rows: CompanySummary[]; returnTo: QueueReturn }) {
  const { t, i18n } = useTranslation()
  const none = t('console.verification.detail.none')

  return (
    <RowsView className={CONSOLE_ROWS}>
      <table className={`${CONSOLE_TABLE} min-w-[760px]`}>
        <thead>
          <tr className={CONSOLE_THEAD}>
            <th className="px-4 py-3 text-start font-semibold">
              {t('console.verification.col.company')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.verification.col.code')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.verification.col.submitted')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.verification.col.status')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.verification.col.decided')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((company) => {
            const submitted = isSubmitted(company)
            return (
              <tr key={company.tenantId} className="border-b border-[#f3f3f3] last:border-b-0">
                <td className="px-4 py-4">
                  <Link
                    to={`${VERIFICATION_ROUTE}/${company.tenantId}`}
                    state={returnTo}
                    className="text-base font-medium leading-[1.2] text-text-primary hover:text-primary-800"
                  >
                    {company.tenantName}
                  </Link>
                  <span className="mt-1 block text-xs font-medium text-text-quaternary">
                    {company.legalName ?? t('console.verification.noLegalName')}
                    {company.country ? ` · ${countryName(company.country, i18n.language)}` : ''}
                  </span>
                </td>
                <td className="px-2 py-4 text-sm font-medium text-text-secondary [overflow-wrap:anywhere]">
                  <bdi dir="ltr">{company.tenantCode}</bdi>
                </td>
                <td className="whitespace-nowrap px-2 py-4 text-sm font-medium text-text-secondary">
                  {company.submittedAt ? formatDay(company.submittedAt, i18n.language) : none}
                </td>
                <td className="px-2 py-4">
                  {isCorrectionOverdue(company) ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <VerificationStatusPill
                        status={company.verificationStatus}
                        submitted={submitted}
                      />
                      <ConsoleStatusPill
                        tone="pending"
                        label={t('console.verification.correctionOverdue.badge')}
                      />
                    </span>
                  ) : (
                    <VerificationStatusPill
                      status={company.verificationStatus}
                      submitted={submitted}
                    />
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-4 text-sm font-medium text-text-secondary">
                  {company.decidedAt ? formatDay(company.decidedAt, i18n.language) : none}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}
