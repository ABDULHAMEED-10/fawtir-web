import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import { localeFor } from '../../lib/console/format'
import {
  BLOCKERS_PATH,
  POLICY_CONSOLE_PERMISSION,
  needsMyAction,
  policyRoute,
  type BlockerOverviewEntry,
  type BlockerVersionSummary,
} from '../../lib/console/validationPolicies'
import { PolicyQueueLabel } from './policies/PolicyQueueLabel'
import { PolicyStatusPill } from './policies/PolicyStatusPill'

const FILTERS = ['all', 'mine'] as const
type Filter = (typeof FILTERS)[number]

const waitsForReader = (entry: BlockerOverviewEntry) =>
  entry.latest !== null && needsMyAction(entry.latest.allowedActions)

/**
 * The platform's validation policies and where each one stands: what is in force, what the newest
 * version is waiting for, and whether that is waiting for the reader.
 *
 * One read. Which types appear, and what the reader may do to each, is the server's answer; the
 * "needs my action" filter only narrows rows already on screen by the server's own
 * `allowedActions`. There is no Figma frame for this screen: it is built from the console's
 * existing table, pill and notice.
 */
export function ValidationPoliciesPage() {
  return (
    <ConsoleShell requires={POLICY_CONSOLE_PERMISSION}>
      <PolicyOverview />
    </ConsoleShell>
  )
}

function PolicyOverview() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const filter: Filter = params.get('filter') === 'mine' ? 'mine' : 'all'
  const { read, retry } = useConsoleRead<BlockerOverviewEntry[]>(BLOCKERS_PATH)
  const number = new Intl.NumberFormat(localeFor(i18n.language))

  const choose = (next: Filter) => {
    const search = new URLSearchParams()
    if (next !== 'all') search.set('filter', next)
    setParams(search)
  }

  const entries = read.status === 'ready' ? read.data : null
  const mine = entries ? entries.filter(waitsForReader) : []
  const rows = entries ? (filter === 'mine' ? mine : entries) : []

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.policies.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.length === 0) {
    // Not "no policies exist": the server lists only the types this operator may read.
    body = (
      <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.policies.empty')}
      </p>
    )
  } else if (rows.length === 0) {
    body = (
      <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.policies.emptyMine')}
      </p>
    )
  } else {
    body = <PolicyTable rows={rows} />
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.policies' }]} />
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('console.policies.title')}
        </h1>
        <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
          {t('console.policies.subtitle')}
        </p>
      </div>

      <section className="flex flex-col rounded-md bg-surface-card">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {FILTERS.map((entry) => {
              const active = entry === filter
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => choose(entry)}
                  aria-pressed={active}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-tertiary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(`console.policies.filter.${entry}`)}
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
                  ) : null}
                </button>
              )
            })}
          </div>
          {entries && entries.length > 0 ? (
            <p className="pb-3 text-sm font-medium text-text-tertiary">
              {t('console.policies.summary', {
                mine: number.format(mine.length),
                total: number.format(entries.length),
              })}
            </p>
          ) : null}
        </div>

        <div className="px-6 py-4">{body}</div>
      </section>
    </div>
  )
}

function VersionCell({ version, empty }: { version: BlockerVersionSummary | null; empty: string }) {
  const { t, i18n } = useTranslation()
  if (version === null)
    return <span className="text-sm font-medium text-text-quaternary">{empty}</span>
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-text-secondary">
        {t('console.policies.version', {
          number: new Intl.NumberFormat(localeFor(i18n.language)).format(version.versionNumber),
        })}
      </span>
      <PolicyStatusPill status={version.status} />
    </span>
  )
}

function PolicyTable({ rows }: { rows: BlockerOverviewEntry[] }) {
  const { t } = useTranslation()

  return (
    <RowsView>
      <table className="w-full min-w-[760px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="px-4 py-3 text-start font-semibold">
              {t('console.policies.col.policy')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.policies.col.inForce')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.policies.col.latest')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.policies.col.queue')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.type} className="border-b border-[#f3f3f3] last:border-b-0">
              <td className="px-4 py-4">
                <Link
                  to={policyRoute(entry.type)}
                  className="text-base font-medium leading-[1.2] text-text-primary hover:text-primary-800"
                >
                  {t(`console.policies.type.${entry.type}`)}
                </Link>
                {/* The code is inline inside a block so it keeps its own direction and still starts
                    where the name above it starts, in either language. */}
                <span className="mt-1 block text-xs font-medium text-text-quaternary">
                  <span dir="ltr" className="break-all font-mono">
                    {entry.type}
                  </span>
                </span>
              </td>
              <td className="px-2 py-4">
                <VersionCell version={entry.active} empty={t('console.policies.noneInForce')} />
              </td>
              <td className="px-2 py-4">
                <VersionCell version={entry.latest} empty={t('console.policies.noVersion')} />
              </td>
              <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                {entry.latest ? (
                  <PolicyQueueLabel version={entry.latest} />
                ) : (
                  t('console.policies.noVersion')
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RowsView>
  )
}
