import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../../components/feedback/ApiNotice'
import { Input } from '../../../components/ui'
import { useApiRead } from '../../../hooks/useApiRead'
import { formatCount } from '../../../lib/format'
import { businessToday, windowBounds, windowProblem } from '../../../lib/erp/reportingWindow'
import type { Page } from '../../../api/page'
import {
  DELIVERY_STATES,
  FAILURE_REASONS,
  PROCESSING_STATES,
  SOURCE_KINDS,
  documentListPath,
  documentSummaryPath,
  loadDocumentList,
  type DocumentFilters,
  type DocumentSummaryDto,
  type SourceDocumentDto,
} from '../../../api/erp/reporting'
import { SectionCard, SECONDARY_BUTTON, TEXT_BUTTON } from '../overview/idiom'
import {
  ConnectionFilter,
  DocumentsTable,
  FilterSelect,
  PastTheEnd,
  ReportingShell,
  ReportPager,
  WindowFields,
} from './reportingParts'
import {
  GLOBAL_LINKS,
  useConnectionNames,
  useEnumOptions,
  useReportReadable,
  type ReportLinks,
} from './reportingHooks'
import { readWindow, useReportQuery } from './reportingQuery'

const SORTS = ['RECEIVED_NEWEST', 'RECEIVED_OLDEST'] as const

/**
 * Every source document the ledger holds, from every channel, with the server's summary of the
 * same window above it.
 *
 * The list needs a bounded received-at window (`SourceDocumentReportQuery`): the ledger is never
 * pruned, so an unbounded read costs more every year. The screen therefore always has one,
 * defaulting to the last 30 days, and sends nothing while the one the reader typed is invalid.
 */
export function ErpDocumentsPage() {
  const { t } = useTranslation()
  return (
    <ReportingShell
      title={t('erp.reporting.documents.title')}
      subtitle={t('erp.reporting.documents.subtitle')}
    >
      <DocumentsReport />
    </ReportingShell>
  )
}

/**
 * The report itself, without a frame: the global report draws it in the reports' shell, and a
 * connection's Records tab draws it in the connection's shell with `connectionId` fixed, which
 * narrows every read to that connection and takes the connection filter away.
 */
export function DocumentsReport({
  connectionId: fixedConnection,
  links = GLOBAL_LINKS,
}: {
  connectionId?: string
  links?: ReportLinks
}) {
  const { t, i18n } = useTranslation()
  const { get, pick, page, update } = useReportQuery()
  const { names, options: connectionOptions } = useConnectionNames()
  const enumOptions = useEnumOptions()
  const count = (value: number) => formatCount(value, i18n.language)

  const range = readWindow(get)
  const problem = windowProblem(range.from, range.to, { required: true })
  const bounds = problem === null ? windowBounds(range.from, range.to) : null

  const filters: DocumentFilters = {
    sourceKind: pick('channel', SOURCE_KINDS),
    connectionId: fixedConnection ?? get('connection'),
    processingState: pick('state', PROCESSING_STATES),
    deliveryState: pick('delivery', DELIVERY_STATES),
    reasonCode: pick('reason', FAILURE_REASONS),
    retryable: pick('retryable', ['true', 'false'] as const),
    externalDocumentId: get('document'),
    invoiceNumber: get('invoice'),
    sort: pick('sort', SORTS) || 'RECEIVED_NEWEST',
  }
  const listOnly = Boolean(
    filters.processingState ||
    filters.deliveryState ||
    filters.reasonCode ||
    filters.retryable ||
    filters.externalDocumentId ||
    filters.invoiceNumber,
  )
  const [moreOpen, setMoreOpen] = useState(listOnly || filters.sort !== 'RECEIVED_NEWEST')

  const readable = useReportReadable()
  const listPath = readable && bounds ? documentListPath({ ...filters, ...bounds }, page - 1) : null
  const list = useApiRead<Page<SourceDocumentDto>>(listPath, () => loadDocumentList(listPath!))
  const summaryPath =
    readable && bounds
      ? documentSummaryPath({
          sourceKind: filters.sourceKind,
          connectionId: filters.connectionId,
          ...bounds,
        })
      : null
  const summary = useApiRead<DocumentSummaryDto>(summaryPath)

  return (
    <>
      <SectionCard title={t('erp.reporting.filters.title')}>
        <div className="grid gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <WindowFields
              from={range.from}
              to={range.to}
              problem={problem}
              max={businessToday()}
              onChange={(next) => update({ from: next.from, to: next.to })}
            />
          </div>
          <FilterSelect
            label={t('erp.reporting.filters.channel')}
            anyLabel={t('erp.reporting.filters.any')}
            value={filters.sourceKind ?? ''}
            options={enumOptions('sourceKind', SOURCE_KINDS)}
            onChange={(value) => update({ channel: value })}
          />
          {fixedConnection === undefined ? (
            <ConnectionFilter
              value={filters.connectionId ?? ''}
              options={connectionOptions}
              onChange={(value) => update({ connection: value })}
            />
          ) : null}
          <FilterSelect
            label={t('erp.reporting.filters.processing')}
            anyLabel={t('erp.reporting.filters.any')}
            value={filters.processingState ?? ''}
            options={enumOptions('processingState', PROCESSING_STATES)}
            onChange={(value) => update({ state: value })}
          />
          {moreOpen ? (
            <>
              <FilterSelect
                label={t('erp.reporting.filters.delivery')}
                anyLabel={t('erp.reporting.filters.any')}
                value={filters.deliveryState ?? ''}
                options={enumOptions('deliveryState', DELIVERY_STATES)}
                onChange={(value) => update({ delivery: value })}
              />
              <FilterSelect
                label={t('erp.reporting.filters.reason')}
                anyLabel={t('erp.reporting.filters.any')}
                value={filters.reasonCode ?? ''}
                options={enumOptions('reason', FAILURE_REASONS)}
                onChange={(value) => update({ reason: value })}
              />
              <FilterSelect
                label={t('erp.reporting.filters.retryable')}
                anyLabel={t('erp.reporting.filters.any')}
                value={filters.retryable ?? ''}
                options={[
                  { value: 'true', label: t('erp.reporting.filters.retryableYes') },
                  { value: 'false', label: t('erp.reporting.filters.retryableNo') },
                ]}
                onChange={(value) => update({ retryable: value })}
              />
              <FilterSelect
                label={t('erp.reporting.filters.sort')}
                anyLabel={t('erp.reporting.sort.RECEIVED_NEWEST')}
                value={filters.sort === 'RECEIVED_OLDEST' ? 'RECEIVED_OLDEST' : ''}
                options={[
                  { value: 'RECEIVED_OLDEST', label: t('erp.reporting.sort.RECEIVED_OLDEST') },
                ]}
                onChange={(value) => update({ sort: value })}
              />
              <ExactTextFilter
                label={t('erp.reporting.filters.document')}
                value={filters.externalDocumentId ?? ''}
                onApply={(value) => update({ document: value })}
              />
              <ExactTextFilter
                label={t('erp.reporting.filters.invoice')}
                value={filters.invoiceNumber ?? ''}
                onApply={(value) => update({ invoice: value })}
              />
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-surface-background px-5 py-3">
          <button
            type="button"
            className={TEXT_BUTTON}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            {moreOpen ? t('erp.reporting.filters.fewer') : t('erp.reporting.filters.more')}
          </button>
          <button
            type="button"
            className={TEXT_BUTTON}
            onClick={() =>
              update({
                from: null,
                to: null,
                channel: null,
                connection: null,
                state: null,
                delivery: null,
                reason: null,
                retryable: null,
                document: null,
                invoice: null,
                sort: null,
              })
            }
          >
            {t('erp.reporting.filters.reset')}
          </button>
        </div>
      </SectionCard>

      {summaryPath === null ? null : summary.read.status === 'loading' ? (
        <LoadingNotice />
      ) : summary.read.status === 'failed' ? (
        <ApiReadFailure error={summary.read.error} retry={summary.retry} />
      ) : (
        <SummaryCards summary={summary.read.data} count={count} />
      )}

      <SectionCard title={t('erp.reporting.documents.listTitle')}>
        {listPath === null ? (
          <p className="px-5 pb-5 text-sm font-medium text-text-secondary">
            {t('erp.reporting.window.fixToRead')}
          </p>
        ) : list.read.status === 'loading' ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : list.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : page > 1 && list.read.data.items.length === 0 && !list.read.data.hasMore ? (
          <PastTheEnd onFirst={() => update({ page: null })} />
        ) : (
          <>
            <DocumentsTable
              items={list.read.data.items}
              names={names}
              links={links}
              empty={
                listOnly || filters.sourceKind || (fixedConnection === undefined && filters.connectionId)
                  ? t('erp.reporting.documents.emptyFiltered')
                  : t('erp.reporting.documents.emptyWindow')
              }
            />
            <div className="flex justify-end px-5 py-4">
              <ReportPager
                page={page}
                hasMore={list.read.data.hasMore}
                onChange={(next) => update({ page: next === 1 ? null : String(next) })}
              />
            </div>
          </>
        )}
      </SectionCard>
    </>
  )
}

/**
 * An exact-match identifier filter, applied when the reader submits it rather than on every
 * keystroke: each keystroke would be a ledger query.
 */
function ExactTextFilter({
  label,
  value,
  onApply,
}: {
  label: string
  value: string
  onApply: (value: string) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [applied, setApplied] = useState(value)
  if (applied !== value) {
    setApplied(value)
    setDraft(value)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onApply(draft.trim())
  }
  return (
    <form onSubmit={submit} className="flex min-w-0 items-end gap-2">
      <Input
        label={label}
        hint={t('erp.reporting.filters.exactHint')}
        value={draft}
        maxLength={200}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" className={`${SECONDARY_BUTTON} mb-[22px] shrink-0`}>
        {t('erp.reporting.filters.apply')}
      </button>
    </form>
  )
}

function SummaryCards({
  summary,
  count,
}: {
  summary: DocumentSummaryDto
  count: (value: number) => string
}) {
  const { t } = useTranslation()
  const buckets = [
    ['accepted', summary.accepted],
    ['rejected', summary.rejected],
    ['duplicate', summary.duplicate],
    ['waiting_for_mapping', summary.waiting_for_mapping],
    ['retryable', summary.retryable],
    ['processing', summary.processing],
  ] as const
  const downstream = summary.downstream
  const flow = [
    ['queued', downstream.queued],
    ['sending', downstream.sending],
    ['sent', downstream.sent],
    ['delivered', downstream.delivered],
    ['delivered_unconfirmed', downstream.delivered_unconfirmed],
    ['delivery_failed', downstream.delivery_failed],
    ['off_network', downstream.off_network],
    ['without_invoice', downstream.without_invoice],
  ] as const
  return (
    <SectionCard title={t('erp.reporting.summary.title')} note={t('erp.reporting.summary.note')}>
      <div className="grid gap-5 px-5 pb-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          <div className="rounded-sm bg-primary-50 p-3">
            <dt className="text-xs font-medium text-text-secondary">
              {t('erp.reporting.summary.received')}
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{count(summary.received)}</dd>
          </div>
          {buckets.map(([key, value]) => (
            <div key={key} className="rounded-sm bg-surface-background p-3">
              <dt className="text-xs font-medium text-text-secondary">
                {t(`erp.reporting.summary.bucket.${key}`)}
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{count(value)}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h4 className="text-sm font-semibold text-text-primary">
            {t('erp.reporting.summary.downstreamTitle')}
          </h4>
          <p className="mt-0.5 text-xs text-text-quaternary">
            {t('erp.reporting.summary.downstreamNote')}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {flow.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2">
                <dt className="text-text-secondary">{t(`erp.reporting.downstream.${key}`)}</dt>
                <dd className="font-semibold tabular-nums">{count(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-text-quaternary">
          {t('erp.reporting.summary.events', {
            replays: count(summary.events.replays),
            conflicts: count(summary.events.conflicts),
          })}
        </p>
      </div>
    </SectionCard>
  )
}
