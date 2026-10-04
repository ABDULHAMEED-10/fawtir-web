import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../../components/feedback/ApiNotice'
import { RowsView } from '../../../components/ui'
import { useApiRead } from '../../../hooks/useApiRead'
import { formatCount } from '../../../lib/format'
import { businessToday, windowBounds, windowProblem } from '../../../lib/erp/reportingWindow'
import type { Page } from '../../../api/page'
import {
  RUN_STATES,
  SOURCE_KINDS,
  loadRunList,
  runListPath,
  type RunDto,
} from '../../../api/erp/reporting'
import { EmptyRow, SectionCard, TBODY_ROW, THEAD_ROW, TEXT_BUTTON, Td, Th } from '../overview/idiom'
import {
  ConnectionFilter,
  ConnectionLabel,
  FilterSelect,
  PastTheEnd,
  ReportingShell,
  ReportPager,
  When,
  WindowFields,
} from './reportingParts'
import { useCode, useConnectionNames, useEnumOptions, useReportReadable } from './reportingHooks'
import { readWindow, useReportQuery } from './reportingQuery'

/**
 * Every extraction run, newest first, from every channel.
 *
 * The window is optional here, unlike the document list: the run list is bounded by its page
 * limit rather than by time (`ExtractionRunReportQuery`), so the screen opens on the latest runs
 * and a window narrows it when the reader wants one.
 */
export function ErpRunsPage() {
  const { t } = useTranslation()
  const { get, pick, page, update } = useReportQuery()
  const { names, options: connectionOptions } = useConnectionNames()
  const enumOptions = useEnumOptions()

  const range = readWindow(get, false)
  const problem = windowProblem(range.from, range.to, { required: false })
  const bounds =
    problem === null && range.from && range.to ? windowBounds(range.from, range.to) : {}
  const sourceKind = pick('channel', SOURCE_KINDS)
  const state = pick('state', RUN_STATES)
  const connectionId = get('connection')

  const readable = useReportReadable()
  const path =
    readable && problem === null
      ? runListPath({ sourceKind, state, connectionId, ...bounds }, page - 1)
      : null
  const list = useApiRead<Page<RunDto>>(path, () => loadRunList(path!))
  const filtered = Boolean(sourceKind || state || connectionId || range.from || range.to)

  return (
    <ReportingShell
      title={t('erp.reporting.runs.title')}
      subtitle={t('erp.reporting.runs.subtitle')}
    >
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
            value={sourceKind}
            options={enumOptions('sourceKind', SOURCE_KINDS)}
            onChange={(value) => update({ channel: value })}
          />
          <FilterSelect
            label={t('erp.reporting.filters.runState')}
            anyLabel={t('erp.reporting.filters.any')}
            value={state}
            options={enumOptions('runState', RUN_STATES)}
            onChange={(value) => update({ state: value })}
          />
          <ConnectionFilter
            value={connectionId}
            options={connectionOptions}
            onChange={(value) => update({ connection: value })}
          />
        </div>
        <div className="border-t border-surface-background px-5 py-3">
          <button
            type="button"
            className={TEXT_BUTTON}
            onClick={() =>
              update({ from: null, to: null, channel: null, state: null, connection: null })
            }
          >
            {t('erp.reporting.filters.reset')}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t('erp.reporting.runs.listTitle')}
        note={t('erp.reporting.runs.countersNote')}
      >
        {path === null ? (
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
            <RunsTable
              items={list.read.data.items}
              names={names}
              empty={
                filtered ? t('erp.reporting.runs.emptyFiltered') : t('erp.reporting.runs.empty')
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
    </ReportingShell>
  )
}

function RunsTable({
  items,
  names,
  empty,
}: {
  items: RunDto[]
  names: Map<string, string> | null
  empty: string
}) {
  const { t, i18n } = useTranslation()
  const code = useCode()
  const count = (value: number) => formatCount(value, i18n.language)
  return (
    <RowsView>
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">{t('erp.reporting.runs.listTitle')}</caption>
        <thead>
          <tr className={THEAD_ROW}>
            <Th first>{t('erp.reporting.col.started')}</Th>
            <Th>{t('erp.reporting.col.runState')}</Th>
            <Th>{t('erp.reporting.col.channel')}</Th>
            <Th>{t('erp.reporting.col.connection')}</Th>
            <Th align="end">{t('erp.reporting.counter.discovered')}</Th>
            <Th align="end">{t('erp.reporting.counter.accepted')}</Th>
            <Th align="end">{t('erp.reporting.counter.rejected')}</Th>
            <Th align="end">{t('erp.reporting.counter.duplicate')}</Th>
            <Th align="end">{t('erp.reporting.counter.unsettled')}</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyRow columns={9}>{empty}</EmptyRow>
          ) : (
            items.map((run) => (
              <tr key={run.run_id} className={TBODY_ROW}>
                <Td first>
                  <Link
                    to={`/settings/erp/runs/${encodeURIComponent(run.run_id)}`}
                    className="font-semibold text-primary-700 underline-offset-2 hover:underline"
                  >
                    <When at={run.created_at} />
                  </Link>
                </Td>
                <Td>
                  <span className="block">{code('runState', run.state)}</span>
                  {run.failure_reason ? (
                    <span className="block text-xs text-text-quaternary">
                      {code('reason', run.failure_reason)}
                    </span>
                  ) : null}
                </Td>
                <Td>{code('sourceKind', run.source_kind)}</Td>
                <Td>
                  <ConnectionLabel id={run.connection_id} names={names} />
                </Td>
                <Td align="end" className="tabular-nums">
                  {count(run.counters.discovered)}
                </Td>
                <Td align="end" className="tabular-nums">
                  {count(run.counters.accepted)}
                </Td>
                <Td align="end" className="tabular-nums">
                  {count(run.counters.rejected)}
                </Td>
                <Td align="end" className="tabular-nums">
                  {count(run.counters.duplicate)}
                </Td>
                <Td align="end" className="tabular-nums">
                  {count(run.counters.unsettled)}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </RowsView>
  )
}
