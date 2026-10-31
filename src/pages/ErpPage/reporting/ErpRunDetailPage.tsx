import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../../components/feedback/ApiNotice'
import { useApiRead } from '../../../hooks/useApiRead'
import { formatCount } from '../../../lib/format'
import type { Page } from '../../../api/page'
import {
  documentListPath,
  loadDocumentList,
  runDetailPath,
  type RunDetailDto,
  type SourceDocumentDto,
} from '../../../api/erp/reporting'
import { SectionCard } from '../overview/idiom'
import {
  ConnectionLabel,
  DocumentsTable,
  PastTheEnd,
  ReportingShell,
  ReportPager,
  When,
} from './reportingParts'
import {
  GLOBAL_LINKS,
  useCode,
  useConnectionNames,
  useReportReadable,
  type ReportLinks,
} from './reportingHooks'
import { useReportQuery } from './reportingQuery'

/**
 * One run: what it recorded when it ran, where its accepted documents stand now, and the documents
 * themselves.
 *
 * The counters and the downstream breakdown are two blocks on purpose — the first is history and
 * never moves after the run ends, the second is read now — so a current number is never mistaken
 * for a historical one. The document list is the source-document report narrowed by `run_id`,
 * which needs no window: a run is already a bounded set. It lists the documents the run holds now,
 * so a document taken over by a later run is listed there instead.
 */
export function ErpRunDetailPage() {
  const { t } = useTranslation()
  const { runId = '' } = useParams<{ runId: string }>()
  return (
    <ReportingShell
      title={t('erp.reporting.run.title')}
      subtitle={t('erp.reporting.run.subtitle')}
      back={{ to: '/settings/erp/runs', label: t('erp.reporting.run.back') }}
    >
      <RunDetailBody runId={runId} />
    </ReportingShell>
  )
}

/**
 * The run's sections without a frame, for the reports' shell and for a connection's Runs tab,
 * whose document links stay under the connection.
 */
export function RunDetailBody({
  runId,
  links = GLOBAL_LINKS,
}: {
  runId: string
  links?: ReportLinks
}) {
  const { t, i18n } = useTranslation()
  const { page, update } = useReportQuery()
  const { names } = useConnectionNames()
  const code = useCode()
  const count = (value: number) => formatCount(value, i18n.language)

  const readable = useReportReadable()
  const detail = useApiRead<RunDetailDto>(readable ? runDetailPath(runId) : null)
  const documentsPath = readable ? documentListPath({ runId }, page - 1) : null
  const documents = useApiRead<Page<SourceDocumentDto>>(documentsPath, () =>
    loadDocumentList(documentsPath!),
  )

  return (
    <>
      {detail.read.status === 'loading' ? (
        <LoadingNotice />
      ) : detail.read.status === 'failed' ? (
        <ApiReadFailure error={detail.read.error} retry={detail.retry} notFoundOn400 />
      ) : (
        <RunSummary detail={detail.read.data} names={names} code={code} count={count} />
      )}
      {detail.read.status === 'failed' ? null : (
        <SectionCard
          title={t('erp.reporting.run.documentsTitle')}
          note={t('erp.reporting.run.documentsNote')}
        >
          {documents.read.status === 'loading' ? (
            <div className="px-5 pb-5">
              <LoadingNotice />
            </div>
          ) : documents.read.status === 'failed' ? (
            <div className="px-5 pb-5">
              <ApiReadFailure error={documents.read.error} retry={documents.retry} />
            </div>
          ) : page > 1 && documents.read.data.items.length === 0 && !documents.read.data.hasMore ? (
            <PastTheEnd onFirst={() => update({ page: null })} />
          ) : (
            <>
              <DocumentsTable
                items={documents.read.data.items}
                names={names}
                links={links}
                empty={t('erp.reporting.run.documentsEmpty')}
              />
              <div className="flex justify-end px-5 py-4">
                <ReportPager
                  page={page}
                  hasMore={documents.read.data.hasMore}
                  onChange={(next) => update({ page: next === 1 ? null : String(next) })}
                />
              </div>
            </>
          )}
        </SectionCard>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-sm bg-surface-background p-3">
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function RunSummary({
  detail,
  names,
  code,
  count,
}: {
  detail: RunDetailDto
  names: Map<string, string> | null
  code: (group: string, value: string | null | undefined) => string
  count: (value: number) => string
}) {
  const { t } = useTranslation()
  const { run, downstream } = detail
  return (
    <>
      <SectionCard title={t('erp.reporting.run.metadata')}>
        <dl className="grid gap-x-6 gap-y-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          {(
            [
              ['state', <span key="state">{code('runState', run.state)}</span>],
              ['channel', code('sourceKind', run.source_kind)],
              [
                'connection',
                <ConnectionLabel key="connection" id={run.connection_id} names={names} />,
              ],
              ['created', <When key="created" at={run.created_at} />],
              ['started', <When key="started" at={run.started_at} />],
              ['completed', <When key="completed" at={run.completed_at} />],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs font-medium text-text-quaternary">
                {t(`erp.reporting.run.field.${key}`)}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-text-primary">{value}</dd>
            </div>
          ))}
          {run.failure_reason ? (
            <div className="min-w-0">
              <dt className="text-xs font-medium text-text-quaternary">
                {t('erp.reporting.run.field.failure')}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-danger-700">
                {code('reason', run.failure_reason)}
              </dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>

      <SectionCard
        title={t('erp.reporting.run.countersTitle')}
        note={t('erp.reporting.runs.countersNote')}
      >
        <dl className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-5">
          {(['discovered', 'accepted', 'rejected', 'duplicate', 'unsettled'] as const).map(
            (key) => (
              <Stat
                key={key}
                label={t(`erp.reporting.counter.${key}`)}
                value={count(run.counters[key])}
              />
            ),
          )}
        </dl>
      </SectionCard>

      <SectionCard
        title={t('erp.reporting.run.downstreamTitle')}
        note={t('erp.reporting.summary.downstreamNote')}
      >
        <dl className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4 xl:grid-cols-5">
          <Stat label={t('erp.reporting.downstream.total')} value={count(downstream.total)} />
          {(
            [
              'queued',
              'sending',
              'sent',
              'delivered',
              'delivered_unconfirmed',
              'delivery_failed',
              'off_network',
              'without_invoice',
            ] as const
          ).map((key) => (
            <Stat
              key={key}
              label={t(`erp.reporting.downstream.${key}`)}
              value={count(downstream[key])}
            />
          ))}
        </dl>
      </SectionCard>
    </>
  )
}
