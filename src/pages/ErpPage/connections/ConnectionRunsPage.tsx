import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OmAmount, Pager, RowsView } from '../../../components/ui'
import {
  ConnectionShell,
  RecordStatePill,
  RunStatePill,
  connectionPath,
  useConnection,
} from './ConnectionShell'
import {
  BackLink,
  Definitions,
  Figure,
  FilterChips,
  PAGE_SIZE,
  Strip,
  NotHere,
  durationLabel,
  pagerLabels,
  whenOf,
} from './ledger'
import {
  EmptyRow,
  Mono,
  SMALL_BUTTON,
  SectionCard,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from '../overview/idiom'
import { useErpMapping } from '../../../lib/erpMapping'
import {
  NOW,
  connectorStore,
  mappingStatusOf,
  recordsFor,
  runsFor,
  useConnector,
  type CollectResult,
  type Connection,
  type Run,
  type RunState,
} from '../../../lib/erpConnector'
import { shortDate } from '../../../lib/settings'

/**
 * Settings › Integration › Connected systems › connection › Runs
 * (docs/erp-and-console-plan.md §3, Appendix B "Detail · Runs").
 *
 * The list: every collection this connection ran, newest first, with what it fetched and where
 * the watermark moved, and the one button that starts a run by hand. The backend's 409 and 422
 * answers to that button become plain sentences here. The detail: one run's counts, its error
 * summary in words, and the records it created.
 */
export function ConnectionRunsPage() {
  const connection = useConnection()
  const { runId } = useParams<{ id: string; runId?: string }>()
  return (
    <ConnectionShell connection={connection}>
      {connection ? (
        runId ? (
          <RunDetail connection={connection} runId={runId} />
        ) : (
          <RunsList connection={connection} />
        )
      ) : null}
    </ConnectionShell>
  )
}

/* ------------------------------------------------------------------- list */

type Filter = 'all' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'skipped'
const FILTERS: Filter[] = ['all', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'skipped']

const matches = (run: Run, filter: Filter) =>
  filter === 'all'
    ? true
    : filter === 'skipped'
      ? run.state === 'SKIPPED_QUOTA' || run.state === 'SKIPPED_LEASE'
      : run.state === filter

const isToday = (d: Date) =>
  d.getFullYear() === NOW.getFullYear() &&
  d.getMonth() === NOW.getMonth() &&
  d.getDate() === NOW.getDate()

/** A skipped run has no duration to speak of. */
const runDuration = (t: ReturnType<typeof useTranslation>['t'], run: Run) =>
  run.state === 'SKIPPED_LEASE' || run.state === 'SKIPPED_QUOTA'
    ? '—'
    : durationLabel(t, run.startedAt, run.finishedAt)

/** The known error codes, in words; anything else is shown as its code alone. */
const ERROR_MEANING: Record<string, string> = {
  'BR-OM-06': 'buyerVatin',
  'BR-OM-10': 'sellerIsic',
  UNAUTHORIZED: 'unauthorized',
}

function RunsList({ connection }: { connection: Connection }) {
  const { t } = useTranslation()
  const state = useConnector()
  const mapping = useErpMapping()
  const runs = runsFor(state, connection.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [answer, setAnswer] = useState<CollectResult | null>(null)

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, runs.filter((r) => matches(r, f)).length])),
    [runs],
  ) as Record<Filter, number>
  const today = runs.filter((r) => isToday(r.startedAt)).length
  const problems = counts.PARTIAL + counts.FAILED

  const rows = runs.filter((r) => matches(r, filter))
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const collect = () => {
    setAnswer(connectorStore.collectNow(connection.id, mappingStatusOf(connection, mapping)))
    setFilter('all')
    setPage(1)
  }

  const refusalLink = (error: Exclude<CollectResult, { ok: true }>['error']) => {
    if (error === 'NOT_CERTIFIED')
      return {
        to: connectionPath(connection.id, 'mapping'),
        label: t('erp.connector.runs.refusedLink.NOT_CERTIFIED'),
      }
    if (error === 'CREDENTIALS')
      return {
        to: connectionPath(connection.id, 'settings'),
        label: t('erp.connector.runs.refusedLink.CREDENTIALS'),
      }
    if (error === 'PAUSED')
      return {
        to: connectionPath(connection.id, 'overview'),
        label: t('erp.connector.runs.refusedLink.PAUSED'),
      }
    return undefined
  }

  return (
    <SectionCard
      title={t('erp.connector.runs.title')}
      note={t('erp.connector.runs.note', { minutes: connection.scheduleMinutes })}
      actions={
        <button type="button" onClick={collect} className={SMALL_BUTTON}>
          {t('erp.connector.runs.collectNow')}
        </button>
      }
    >
      {/* The three counts */}
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-surface-background px-5 py-4">
        <Count label={t('erp.connector.runs.strip.today')} value={today} />
        <Count label={t('erp.connector.runs.strip.succeeded')} value={counts.SUCCEEDED} />
        <Count
          label={t('erp.connector.runs.strip.problems')}
          value={problems}
          tone={problems > 0 ? 'danger' : undefined}
        />
      </div>

      {answer ? (
        <div className="px-5 pb-4">
          {answer.ok ? (
            <Strip
              tone="success"
              link={{
                to: `${connectionPath(connection.id, 'runs')}/${answer.run.id}`,
                label: t('erp.connector.runs.collectedLink'),
              }}
            >
              {t('erp.connector.runs.collected', {
                id: answer.run.id,
                fetched: answer.run.fetched,
              })}
            </Strip>
          ) : (
            <Strip
              tone={answer.error === 'IN_PROGRESS' ? 'pending' : 'danger'}
              link={refusalLink(answer.error)}
            >
              {t(`erp.connector.runs.refused.${answer.error}`, {
                date: shortDate(state.addon.resetsOn),
              })}
            </Strip>
          )}
        </div>
      ) : null}

      <div className="px-5 pb-4">
        <FilterChips
          label={t('erp.connector.runs.filterLabel')}
          value={filter}
          onChange={(next) => {
            setFilter(next)
            setPage(1)
          }}
          options={FILTERS.map((f) => ({
            id: f,
            label: t(`erp.connector.runs.filter.${f}`),
            count: counts[f],
          }))}
        />
      </div>

      <RowsView>
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.connector.runs.col.started')}</Th>
              <Th>{t('erp.connector.runs.col.trigger')}</Th>
              <Th>{t('erp.connector.runs.col.state')}</Th>
              <Th align="end">{t('erp.connector.runs.col.fetched')}</Th>
              <Th align="end">{t('erp.connector.runs.col.new')}</Th>
              <Th align="end">{t('erp.connector.runs.col.duplicates')}</Th>
              <Th align="end">{t('erp.connector.runs.col.errors')}</Th>
              <Th>{t('erp.connector.runs.col.duration')}</Th>
              <Th>{t('erp.connector.runs.col.watermark')}</Th>
              <Th align="end">{t('erp.connector.runs.col.open')}</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow columns={10}>
                {runs.length === 0
                  ? t('erp.connector.runs.empty')
                  : t('erp.connector.runs.emptyFiltered')}
              </EmptyRow>
            ) : null}
            {visible.map((run) => (
              <tr key={run.id} className={TBODY_ROW}>
                <Td first>
                  <span className="text-sm font-semibold text-text-primary tabular-nums">
                    {whenOf(run.startedAt)}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm font-medium text-text-secondary">
                    {t(`erp.connector.runTrigger.${run.trigger}`)}
                  </span>
                </Td>
                <Td>
                  <RunStatePill state={run.state} />
                  {run.skipReason || run.state === 'SKIPPED_QUOTA' ? (
                    <p className="mt-1 text-xs font-medium text-text-quaternary">
                      {skipText(t, run)}
                    </p>
                  ) : null}
                </Td>
                <Num value={run.fetched} />
                <Num value={run.created} />
                <Num value={run.duplicates} />
                <Num value={run.errors} tone={run.errors > 0 ? 'danger' : undefined} />
                <Td>
                  <span className="text-sm font-medium text-text-secondary tabular-nums">
                    {runDuration(t, run)}
                  </span>
                </Td>
                <Td>
                  <Watermark run={run} />
                </Td>
                <Td align="end">
                  <Link
                    to={`${connectionPath(connection.id, 'runs')}/${run.id}`}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                  >
                    {t('erp.connector.runs.open')}
                    <span aria-hidden="true" className="rtl:rotate-180">
                      ›
                    </span>
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </RowsView>

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
          <span className="text-xs font-medium text-text-quaternary">
            {t('erp.connector.runs.showing', {
              from: (current - 1) * PAGE_SIZE + 1,
              to: Math.min(current * PAGE_SIZE, rows.length),
              total: rows.length,
            })}
          </span>
          <Pager page={current} pageCount={pageCount} onChange={setPage} labels={pagerLabels(t)} />
        </div>
      ) : null}
    </SectionCard>
  )
}

function skipText(t: ReturnType<typeof useTranslation>['t'], run: Run) {
  if (run.state === 'SKIPPED_LEASE')
    return t('erp.connector.runs.skip.SKIPPED_LEASE', { runId: run.skipReason ?? '' })
  if (run.state === 'SKIPPED_QUOTA') return t('erp.connector.runs.skip.SKIPPED_QUOTA')
  return run.skipReason
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={[
          'text-[22px] font-semibold leading-[1.2] tabular-nums',
          tone === 'danger' ? 'text-danger-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </span>
      <span className="text-xs font-medium text-text-quaternary">{label}</span>
    </div>
  )
}

function Num({ value, tone }: { value: number; tone?: 'danger' }) {
  return (
    <Td align="end">
      <span
        className={[
          'text-sm tabular-nums',
          tone === 'danger' ? 'font-semibold text-danger-700' : 'font-medium text-text-secondary',
        ].join(' ')}
      >
        {value}
      </span>
    </Td>
  )
}

/** "INV/…/0380 → INV/…/0386", or a dash when the run moved nothing. */
function Watermark({ run }: { run: Run }) {
  if (!run.watermarkAfter || run.watermarkBefore === run.watermarkAfter)
    return <span className="text-sm font-medium text-text-quaternary">—</span>
  return (
    <Mono className="whitespace-nowrap text-text-secondary">
      {run.watermarkBefore ?? '—'} → {run.watermarkAfter}
    </Mono>
  )
}

/* ----------------------------------------------------------------- detail */

function RunDetail({ connection, runId }: { connection: Connection; runId: string }) {
  const { t } = useTranslation()
  const state = useConnector()
  const run = runsFor(state, connection.id).find((r) => r.id === runId)
  const listPath = connectionPath(connection.id, 'runs')

  if (!run) {
    return (
      <NotHere
        title={t('erp.connector.runs.notFound.title')}
        body={t('erp.connector.runs.notFound.body')}
        back={{ to: listPath, label: t('erp.connector.runs.back') }}
      />
    )
  }

  const records = recordsFor(state, connection.id).filter((r) => r.runId === run.id)
  const before = run.watermarkBefore
  const after = run.watermarkAfter
  const moved = Boolean(after) && before !== after
  const runState: RunState = run.state

  return (
    <>
      <BackLink to={listPath}>{t('erp.connector.runs.back')}</BackLink>

      <SectionCard
        title={t('erp.connector.runs.detail.title', { id: run.id })}
        note={t('erp.connector.runs.detail.note', {
          trigger: t(`erp.connector.runTrigger.${run.trigger}`),
          when: whenOf(run.startedAt),
        })}
        actions={<RunStatePill state={runState} />}
      >
        <div className="border-t border-surface-background px-5 py-5">
          <Definitions
            items={[
              {
                label: t('erp.connector.runs.detail.trigger'),
                value: t(`erp.connector.runTrigger.${run.trigger}`),
              },
              { label: t('erp.connector.runs.detail.started'), value: whenOf(run.startedAt) },
              {
                label: t('erp.connector.runs.detail.finished'),
                value: run.finishedAt ? whenOf(run.finishedAt) : '—',
              },
              {
                label: t('erp.connector.runs.detail.duration'),
                value: runDuration(t, run),
              },
              {
                label: t('erp.connector.runs.detail.watermarkBefore'),
                value: before ? <Mono className="text-text-secondary">{before}</Mono> : '—',
              },
              {
                label: t('erp.connector.runs.detail.watermarkAfter'),
                value: after ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Mono className="text-text-secondary">{after}</Mono>
                    {!moved ? (
                      <span className="text-xs text-text-quaternary">
                        {t('erp.connector.runs.detail.unchanged')}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  '—'
                ),
              },
            ]}
          />
          {run.skipReason || run.state === 'SKIPPED_QUOTA' ? (
            <p className="mt-4 text-sm font-medium text-text-tertiary">{skipText(t, run)}</p>
          ) : null}
          <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Figure label={t('erp.connector.runs.col.fetched')} value={run.fetched} />
            <Figure label={t('erp.connector.runs.col.new')} value={run.created} />
            <Figure label={t('erp.connector.runs.col.duplicates')} value={run.duplicates} />
            <Figure
              label={t('erp.connector.runs.col.errors')}
              value={run.errors}
              tone={run.errors > 0 ? 'danger' : undefined}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t('erp.connector.runs.detail.errors')}
        note={t('erp.connector.runs.detail.errorsNote')}
      >
        <RowsView>
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.connector.runs.detail.col.code')}</Th>
                <Th>{t('erp.connector.runs.detail.col.meaning')}</Th>
                <Th align="end">{t('erp.connector.runs.detail.col.count')}</Th>
              </tr>
            </thead>
            <tbody>
              {run.errorSummary.length === 0 ? (
                <EmptyRow columns={3}>{t('erp.connector.runs.detail.noErrors')}</EmptyRow>
              ) : null}
              {run.errorSummary.map((error) => (
                <tr key={error.code} className={TBODY_ROW}>
                  <Td first>
                    <Mono className="text-text-secondary">{error.code}</Mono>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {ERROR_MEANING[error.code]
                        ? t(`erp.connector.runs.errorMeaning.${ERROR_MEANING[error.code]}`)
                        : '—'}
                    </span>
                  </Td>
                  <Td align="end">
                    <span className="text-sm font-semibold text-danger-700 tabular-nums">
                      {error.count}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>
      </SectionCard>

      <SectionCard
        title={t('erp.connector.runs.detail.records')}
        note={t('erp.connector.runs.detail.recordsNote', { count: records.length })}
      >
        <RowsView>
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.connector.runs.detail.col.erpNumber')}</Th>
                <Th>{t('erp.connector.runs.detail.col.customer')}</Th>
                <Th align="end">{t('erp.connector.runs.detail.col.total')}</Th>
                <Th>{t('erp.connector.runs.detail.col.state')}</Th>
                <Th>{t('erp.connector.runs.detail.col.fawtir')}</Th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <EmptyRow columns={5}>{t('erp.connector.runs.detail.noRecords')}</EmptyRow>
              ) : null}
              {records.map((record) => (
                <tr key={record.id} className={TBODY_ROW}>
                  <Td first>
                    <Link
                      to={`${connectionPath(connection.id, 'records')}/${record.id}`}
                      className="transition-colors hover:text-primary-800"
                    >
                      <Mono className="whitespace-nowrap text-primary-700">{record.erpNumber}</Mono>
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {record.customer}
                    </span>
                  </Td>
                  <Td align="end">
                    <OmAmount
                      size="xs"
                      amount={record.total.toLocaleString('en-US', {
                        minimumFractionDigits: 3,
                        maximumFractionDigits: 3,
                      })}
                      amountClassName="text-sm font-medium text-text-secondary tabular-nums"
                    />
                  </Td>
                  <Td>
                    <RecordStatePill state={record.state} />
                  </Td>
                  <Td>
                    {record.fawtirInvoiceNo ? (
                      <Mono className="text-text-secondary">{record.fawtirInvoiceNo}</Mono>
                    ) : (
                      <span className="text-sm font-medium text-text-quaternary">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>
      </SectionCard>
    </>
  )
}
