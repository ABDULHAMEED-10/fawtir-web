import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { RowsView } from '../../components/ui'
import {
  EmptyRow,
  SectionCard,
  SecondaryLink,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import { Pill } from './ErpShell'
import { CollectionCell, ConnectionStatePill } from './connections/connectionParts'
import { SummaryCards } from './reporting/ErpDocumentsPage'
import { WindowFields, When } from './reporting/reportingParts'
import { readWindow, useReportQuery } from './reporting/reportingQuery'
import { useCode } from './reporting/reportingHooks'
import { useApiRead } from '../../hooks/useApiRead'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { formatCount } from '../../lib/format'
import { businessToday, windowBounds, windowProblem } from '../../lib/erp/reportingWindow'
import { DEFAULT_TRANSACTION_TYPE } from '../../lib/erp/mappingState'
import { buildChecklists, progressOf, type StepState } from '../../lib/erp/setupChecklist'
import { erpOverviewPath, loadErpOverview, type ErpOverviewDto } from '../../api/erp/overview'
import { listErpConnections, type ErpConnectionDto } from '../../api/erp/connections'
import {
  RECONCILIATION_LABELS,
  documentSummaryPath,
  type DocumentSummaryDto,
  type ReconciliationLabel,
  type RunDto,
  type SourceKind,
} from '../../api/erp/reporting'
import { API_KEYS_PATH, listApiKeys, type ApiKeySummaryDto } from '../../api/settings/apiKeys'
import { certificationStatusPath, loadCertificationStatus } from '../../api/erp/mapping'
import type { ErpConnectionState } from '../../api/erp/connections'

const STEP_TONE: Record<StepState, 'success' | 'pending' | 'neutral'> = {
  done: 'success',
  todo: 'pending',
  unknown: 'neutral',
  info: 'neutral',
}

/**
 * Settings › Integration › Overview (`/settings/erp`): the organisation's ERP integration on one
 * screen, from `GET /v1/erp/overview` (backend Phase 6).
 *
 * **Every figure is the server's.** The documents, the attention counts, the connection counts and
 * health, the mapping readiness and the runs are drawn as the overview answers them; nothing is
 * totalled here. The window is the reports' own, in the URL, and always sent: the server has no
 * default and refuses a window over 367 days.
 *
 * **Requests, bounded.** One overview read per window, plus, for the setup checklist, the
 * connection list (one), the three channels' document summaries (one each), and, for a reader
 * who may see them, the API keys and the invoice route's certification (one each). Connection
 * health comes from the overview and the list, never from one status read per connection.
 */
export function ErpHomePage() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  const canRead =
    entitlements !== null &&
    hasPermission(entitlements, 'erp.connection.read') &&
    hasPermission(entitlements, 'invoice.read')

  return (
    <SettingsShell group="integration">
      <SettingsHeader title={t('erp.home.title')} subtitle={t('erp.home.subtitle')} />
      {!ready ? (
        <LoadingNotice />
      ) : !canRead ? (
        <Notice badge={t('appAccess.noAccess')} body={t('erp.home.noAccess')} />
      ) : (
        <Overview
          canManageKeys={hasPermission(entitlements!, 'admin.settings.manage')}
          canReadMapping={
            hasPermission(entitlements!, 'admin.settings.manage') ||
            hasPermission(entitlements!, 'mapping.read')
          }
        />
      )}
    </SettingsShell>
  )
}

function Overview({
  canManageKeys,
  canReadMapping,
}: {
  canManageKeys: boolean
  canReadMapping: boolean
}) {
  const { t, i18n } = useTranslation()
  const { get, update } = useReportQuery()
  const range = readWindow(get)
  const problem = windowProblem(range.from, range.to, { required: true })
  const bounds = problem === null ? windowBounds(range.from, range.to) : null
  const count = (value: number) => formatCount(value, i18n.language)

  const overviewPath = bounds ? erpOverviewPath(bounds) : null
  const overview = useApiRead<ErpOverviewDto>(overviewPath, () => loadErpOverview(overviewPath!))

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t('erp.home.window')}>
        <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
          <WindowFields
            from={range.from}
            to={range.to}
            problem={problem}
            max={businessToday()}
            onChange={(next) => update({ from: next.from, to: next.to })}
          />
        </div>
      </SectionCard>

      {overview.read.status === 'loading' ? (
        bounds ? (
          <LoadingNotice />
        ) : null
      ) : overview.read.status === 'failed' ? (
        <ApiReadFailure error={overview.read.error} retry={overview.retry} />
      ) : (
        <>
          {!overview.read.data.entitled ? (
            <Notice badge={t('erp.home.notEntitled')} body={t('erp.home.notEntitledBody')} />
          ) : null}
          {!overview.read.data.scheduler_globally_enabled ? (
            <p className="text-sm font-medium leading-[1.6] text-text-quaternary">
              {t('erp.home.automationOff')}
            </p>
          ) : null}
          <SummaryCards summary={overview.read.data.documents} count={count} />
          <AttentionCard overview={overview.read.data} range={range} count={count} />
          <ConnectionsCard overview={overview.read.data} count={count} />
          <MappingCard overview={overview.read.data} />
          <Checklist
            overview={overview.read.data}
            bounds={bounds!}
            canManageKeys={canManageKeys}
            canReadMapping={canReadMapping}
          />
          <RunsCard overview={overview.read.data} />
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------- attention */

function AttentionCard({
  overview,
  range,
  count,
}: {
  overview: ErpOverviewDto
  range: { from: string; to: string }
  count: (value: number) => string
}) {
  const { t } = useTranslation()
  const code = useCode()
  const link = (label: ReconciliationLabel) =>
    `/settings/erp/attention?label=${label}&from=${range.from}&to=${range.to}`
  const evaluated = RECONCILIATION_LABELS.filter(
    (label) => !overview.attention.unevaluated.includes(label),
  )

  return (
    <SectionCard title={t('erp.home.attention.title')} note={t('erp.home.attention.note')}>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to={link('DELIVERY_FAILED')}
            className="rounded-sm bg-surface-background p-3 transition-colors hover:bg-primary-25"
          >
            <span className="block text-xs font-medium text-text-secondary">
              {t('erp.home.attention.deliveryFailed')}
            </span>
            <span className="mt-1 block text-xl font-semibold tabular-nums">
              {count(overview.attention.delivery_failed)}
            </span>
          </Link>
          <Link
            to={link('TAX_REPORT_ATTENTION')}
            className="rounded-sm bg-surface-background p-3 transition-colors hover:bg-primary-25"
          >
            <span className="block text-xs font-medium text-text-secondary">
              {t('erp.home.attention.taxReport')}
            </span>
            <span className="mt-1 block text-xl font-semibold tabular-nums">
              {count(overview.attention.tax_report_attention)}
            </span>
          </Link>
        </div>
        <ul className="flex flex-col divide-y divide-surface-background text-sm">
          {evaluated.map((label) => (
            <li key={label} className="flex items-center justify-between gap-3 py-2">
              <Link
                to={link(label)}
                className="font-medium text-primary-700 transition-colors hover:text-primary-800"
              >
                {code('label', label)}
              </Link>
              <span className="font-semibold tabular-nums text-text-primary">
                {count(overview.attention.labels[label] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
        {overview.attention.unevaluated.length > 0 ? (
          <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
            {t('erp.home.attention.unevaluated', {
              labels: overview.attention.unevaluated
                .map((label) => code('label', label))
                .join(', '),
            })}
          </p>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* -------------------------------------------------------------------- connections */

function ConnectionsCard({
  overview,
  count,
}: {
  overview: ErpOverviewDto
  count: (value: number) => string
}) {
  const { t } = useTranslation()
  return (
    <SectionCard
      title={t('erp.home.connections.title')}
      note={t('erp.home.connections.note', { count: overview.connections.total })}
      actions={
        <SecondaryLink to="/settings/erp/connections">
          {t('erp.home.connections.open')}
        </SecondaryLink>
      }
    >
      <div className="relative max-md:px-5 max-md:pb-5">
        <RowsView>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.home.connections.name')}</Th>
                <Th>{t('erp.home.connections.state')}</Th>
                <Th>{t('erp.home.connections.collection')}</Th>
                <Th>{t('erp.home.connections.lastCompleted')}</Th>
                <Th>{t('erp.home.connections.lastFailed')}</Th>
              </tr>
            </thead>
            <tbody>
              {overview.channels.length === 0 ? (
                <EmptyRow columns={5}>{t('erp.home.connections.empty')}</EmptyRow>
              ) : (
                overview.channels.map((channel) => (
                  <tr key={channel.connection_id} className={TBODY_ROW}>
                    <Td first>
                      <Link
                        to={`/settings/erp/connections/${encodeURIComponent(channel.connection_id)}`}
                        className="font-semibold text-primary-700 transition-colors hover:text-primary-800 [overflow-wrap:anywhere]"
                      >
                        {channel.name}
                      </Link>
                      <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                        {t(`erp.connections.mode.${channel.health.connectionMode}`)}
                      </p>
                    </Td>
                    <Td>
                      <ConnectionStatePill state={channel.state as ErpConnectionState} />
                    </Td>
                    <Td>
                      <CollectionCell health={channel.health} />
                    </Td>
                    <Td>
                      <When at={channel.health.lastCompletedRunAt} />
                    </Td>
                    <Td>
                      <When at={channel.health.lastFailedRunAt} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </RowsView>
      </div>
      <p className="px-5 pb-5 text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('erp.home.connections.counts', {
          ready: count(overview.connections.by_state.READY ?? 0),
          draft: count(overview.connections.by_state.DRAFT ?? 0),
          disabled: count(overview.connections.by_state.DISABLED ?? 0),
        })}
      </p>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------------ mapping */

function MappingCard({ overview }: { overview: ErpOverviewDto }) {
  const { t } = useTranslation()
  const ready = overview.mapping.active_json_profile
  return (
    <SectionCard title={t('erp.home.mapping.title')}>
      <div className="flex flex-col items-start gap-3 px-5 pb-5 text-sm font-medium leading-[1.6] text-text-tertiary">
        <Pill
          tone={ready ? 'success' : 'pending'}
          label={ready ? t('erp.home.mapping.active') : t('erp.home.mapping.none')}
        />
        {overview.mapping.uncertified_channels > 0 ? (
          <p>
            {t('erp.home.mapping.uncertified', { count: overview.mapping.uncertified_channels })}
          </p>
        ) : null}
        <SecondaryLink to="/settings/erp-mapping">{t('erp.home.mapping.open')}</SecondaryLink>
      </div>
    </SectionCard>
  )
}

/* ---------------------------------------------------------------------- checklist */

function Checklist({
  overview,
  bounds,
  canManageKeys,
  canReadMapping,
}: {
  overview: ErpOverviewDto
  bounds: { from: string; to: string }
  canManageKeys: boolean
  canReadMapping: boolean
}) {
  const { t } = useTranslation()
  const code = useCode()
  const connections = useApiRead<ErpConnectionDto[]>('erp-home-connections', () =>
    listErpConnections(false).then((page) => page.connections),
  )
  const keys = useApiRead<ApiKeySummaryDto[]>(canManageKeys ? API_KEYS_PATH : null, listApiKeys)
  const certificationQuery = {
    route: 'INVOICE' as const,
    documentKind: 'STANDARD_INVOICE' as const,
    transactionType: DEFAULT_TRANSACTION_TYPE.INVOICE,
  }
  const certification = useApiRead(
    canReadMapping ? certificationStatusPath('JSON', certificationQuery) : null,
    () => loadCertificationStatus('JSON', certificationQuery),
  )
  const pull = useChannelSummary('MANAGED_PULL', bounds)
  const bridge = useChannelSummary('BRIDGE_UPLOAD', bounds)
  const push = useChannelSummary('API_PUSH', bounds)

  const ready = <T,>(read: { status: string; data?: T }) =>
    read.status === 'ready' ? (read as { data: T }).data : null
  const checklists = buildChecklists({
    overview,
    connections: ready<ErpConnectionDto[]>(connections.read),
    apiKeys: ready<ApiKeySummaryDto[]>(keys.read),
    certified: certification.read.status === 'ready' ? certification.read.data.certified : null,
    summaries: {
      MANAGED_PULL: ready<DocumentSummaryDto>(pull.read),
      BRIDGE_UPLOAD: ready<DocumentSummaryDto>(bridge.read),
      API_PUSH: ready<DocumentSummaryDto>(push.read),
    },
  })

  return (
    <SectionCard title={t('erp.home.checklist.title')} note={t('erp.home.checklist.note')}>
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-3">
        {checklists.map((list) => {
          const progress = progressOf(list.steps)
          return (
            <section
              key={list.channel}
              aria-labelledby={`erp-checklist-${list.channel}`}
              className="min-w-0"
            >
              <h4
                id={`erp-checklist-${list.channel}`}
                className="text-sm font-semibold text-text-primary"
              >
                {code('sourceKind', list.channel)}
              </h4>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('erp.home.checklist.progress', progress)}
                {list.channel !== 'MANAGED_PULL' ? ` ${t('erp.home.checklist.noConnection')}` : ''}
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {list.steps.map((step) => (
                  <li key={step.id} className="flex items-start justify-between gap-3">
                    <Link
                      to={step.to}
                      className="min-w-0 text-sm font-medium text-text-secondary transition-colors hover:text-primary-800"
                    >
                      {t(`erp.home.checklist.step.${step.id}`)}
                    </Link>
                    <Pill
                      tone={STEP_TONE[step.state]}
                      label={t(`erp.home.checklist.state.${step.state}`)}
                    />
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
      <p className="px-5 pb-5 text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('erp.home.checklist.windowNote')}
      </p>
    </SectionCard>
  )
}

function useChannelSummary(channel: SourceKind, bounds: { from: string; to: string }) {
  return useApiRead<DocumentSummaryDto>(documentSummaryPath({ sourceKind: channel, ...bounds }))
}

/* --------------------------------------------------------------------------- runs */

function RunsCard({ overview }: { overview: ErpOverviewDto }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <RunList title={t('erp.home.runs.latest')} runs={overview.latest_runs} />
      <RunList title={t('erp.home.runs.failed')} runs={overview.latest_failed_runs} failed />
    </div>
  )
}

function RunList({
  title,
  runs,
  failed = false,
}: {
  title: string
  runs: RunDto[]
  failed?: boolean
}) {
  const { t } = useTranslation()
  const code = useCode()
  return (
    <SectionCard
      title={title}
      actions={<SecondaryLink to="/settings/erp/runs">{t('erp.home.runs.open')}</SecondaryLink>}
    >
      <ul className="flex flex-col divide-y divide-surface-background px-5 pb-5 text-sm">
        {runs.length === 0 ? (
          <li className="py-2 text-text-quaternary">
            {failed ? t('erp.home.runs.noneFailed') : t('erp.home.runs.none')}
          </li>
        ) : (
          runs.map((run) => (
            <li key={run.run_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link
                to={`/settings/erp/runs/${encodeURIComponent(run.run_id)}`}
                className="min-w-0 font-medium text-primary-700 transition-colors hover:text-primary-800"
              >
                {code('sourceKind', run.source_kind)} · <When at={run.created_at} />
              </Link>
              <span className="flex items-center gap-2">
                {run.failure_reason ? (
                  <span className="text-xs font-medium text-text-quaternary">
                    {code('reason', run.failure_reason)}
                  </span>
                ) : null}
                <Pill
                  tone={
                    run.state === 'FAILED'
                      ? 'danger'
                      : run.state === 'COMPLETED'
                        ? 'success'
                        : 'neutral'
                  }
                  label={code('runState', run.state)}
                />
              </span>
            </li>
          ))
        )}
      </ul>
    </SectionCard>
  )
}
