import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Input, OmAmount, Pager, RowsView, Select } from '../../../components/ui'
import { ConnectionShell, RecordStatePill, connectionPath, useConnection } from './ConnectionShell'
import {
  BackLink,
  Definitions,
  FilterChips,
  NotHere,
  PAGE_SIZE,
  Strip,
  pagerLabels,
  whenOf,
} from './ledger'
import {
  EmptyRow,
  Mono,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  SectionCard,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from '../overview/idiom'
import { JsonTree } from '../shared/JsonTree'
import {
  NOW,
  RECORD_STATES,
  WRITEBACK_MAX_ATTEMPTS,
  connectorStore,
  recordCounts,
  recordsFor,
  useConnector,
  type Connection,
  type ErpRecord,
  type RecordState,
} from '../../../lib/erpConnector'
import searchIcon from '../../../assets/invoices/search.svg'
import openIcon from '../../../assets/settings/menu-list.svg'
import retryIcon from '../../../assets/settings/refresh.svg'
import requeueIcon from '../../../assets/settings/handover.svg'

/**
 * Settings › Integration › Connected systems › connection › Records
 * (docs/erp-and-console-plan.md §3, Appendix B "Detail · Records").
 *
 * The list: every ERP invoice the connector collected, with where it got to — mapped, submitted,
 * accepted, written back — and the Fawtir invoice it became. The detail: the record's story by
 * state (why it was rejected and Retry; the write-back and Re-queue; the superseded warning),
 * and the payload exactly as it came from the ERP.
 */
export function ConnectionRecordsPage() {
  const connection = useConnection()
  const { recordId } = useParams<{ id: string; recordId?: string }>()
  return (
    <ConnectionShell connection={connection}>
      {connection ? (
        recordId ? (
          <RecordDetail connection={connection} recordId={recordId} />
        ) : (
          <RecordsList connection={connection} />
        )
      ) : null}
    </ConnectionShell>
  )
}

/* ------------------------------------------------------------------- list */

type StateFilter = 'all' | RecordState
type DateFilter = 'today' | '7' | '30' | 'all'
const DATE_FILTERS: DateFilter[] = ['today', '7', '30', 'all']
const DAY = 24 * 60 * 60 * 1000

function since(filter: DateFilter, now = NOW) {
  if (filter === 'all') return undefined
  if (filter === 'today') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getTime() - Number(filter) * DAY)
}

const invoicePath = (record: ErpRecord) =>
  record.fawtirInvoiceId ? `/invoices/${record.fawtirInvoiceId}` : undefined

/** The one line the list gives a record that needs a person — rejection, failed write-back, change. */
function noteFor(t: ReturnType<typeof useTranslation>['t'], record: ErpRecord) {
  if (record.state === 'REJECTED' && record.rejection?.[0]) {
    const finding = record.rejection[0]
    return { tone: 'danger' as const, text: `${finding.rule} · ${finding.message}` }
  }
  if (record.state === 'WRITEBACK_FAILED' && record.writeBack?.lastError)
    return { tone: 'danger' as const, text: record.writeBack.lastError }
  if (record.state === 'SUPERSEDED')
    return { tone: 'pending' as const, text: t('erp.connector.records.note.SUPERSEDED') }
  return undefined
}

function RecordsList({ connection }: { connection: Connection }) {
  const { t } = useTranslation()
  const state = useConnector()
  const all = recordsFor(state, connection.id)
  const counts = recordCounts(all)
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const rows = useMemo(() => {
    const from = since(dateFilter)
    const q = query.trim().toLowerCase()
    return all.filter(
      (r) =>
        (stateFilter === 'all' || r.state === stateFilter) &&
        (!from || r.collectedAt >= from) &&
        (!q ||
          r.erpNumber.toLowerCase().includes(q) ||
          r.customer.toLowerCase().includes(q) ||
          (r.fawtirInvoiceNo ?? '').toLowerCase().includes(q)),
    )
  }, [all, stateFilter, dateFilter, query])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const listPath = connectionPath(connection.id, 'records')

  const chips = [
    { id: 'all' as StateFilter, label: t('erp.connector.records.filter.all'), count: all.length },
    ...RECORD_STATES.filter((s) => counts[s] > 0).map((s) => ({
      id: s as StateFilter,
      label: t(`erp.connector.recordState.${s}`),
      count: counts[s],
    })),
  ]

  return (
    <SectionCard
      title={t('erp.connector.records.title')}
      note={t('erp.connector.records.note.list', { count: all.length })}
    >
      <div className="flex flex-col gap-4 border-t border-surface-background px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Input
              bordered
              label={t('erp.connector.records.search.label')}
              placeholder={t('erp.connector.records.search.placeholder')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              leadingIcon={<img src={searchIcon} alt="" className="size-[18px] opacity-60" />}
            />
          </div>
          <div className="flex w-[220px] flex-col gap-1 max-md:w-full">
            <span className="text-sm font-medium text-text-primary">
              {t('erp.connector.records.date.label')}
            </span>
            <Select
              ariaLabel={t('erp.connector.records.date.label')}
              value={dateFilter}
              onChange={(value) => {
                setDateFilter(value as DateFilter)
                setPage(1)
              }}
              options={DATE_FILTERS.map((f) => ({
                value: f,
                label: t(`erp.connector.records.date.${f}`),
              }))}
            />
          </div>
        </div>
        <FilterChips
          label={t('erp.connector.records.filterLabel')}
          value={stateFilter}
          onChange={(next) => {
            setStateFilter(next)
            setPage(1)
          }}
          options={chips}
        />
      </div>

      <RowsView>
        <table className="w-full min-w-[1120px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.connector.records.col.erpNumber')}</Th>
              <Th>{t('erp.connector.records.col.collected')}</Th>
              <Th>{t('erp.connector.records.col.customer')}</Th>
              <Th align="end">{t('erp.connector.records.col.total')}</Th>
              <Th>{t('erp.connector.records.col.state')}</Th>
              <Th>{t('erp.connector.records.col.fawtir')}</Th>
              <Th>{t('erp.connector.records.col.note')}</Th>
              <Th align="end">{t('erp.connector.records.col.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow columns={8}>
                {all.length === 0
                  ? t('erp.connector.records.empty')
                  : t('erp.connector.records.emptyFiltered')}
              </EmptyRow>
            ) : null}
            {visible.map((record) => {
              const note = noteFor(t, record)
              const invoice = invoicePath(record)
              return (
                <tr key={record.id} className={TBODY_ROW}>
                  <Td first>
                    <Link
                      to={`${listPath}/${record.id}`}
                      className="transition-colors hover:text-primary-800"
                    >
                      <Mono className="whitespace-nowrap text-primary-700">{record.erpNumber}</Mono>
                    </Link>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap text-sm font-medium text-text-secondary tabular-nums">
                      {whenOf(record.collectedAt)}
                    </span>
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
                    {record.fawtirInvoiceNo && invoice ? (
                      <Link to={invoice} className="transition-colors hover:text-primary-800">
                        <Mono className="whitespace-nowrap text-primary-700">
                          {record.fawtirInvoiceNo}
                        </Mono>
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-text-quaternary">—</span>
                    )}
                  </Td>
                  <Td>
                    {note ? (
                      <span
                        title={note.text}
                        className={[
                          'block max-w-[260px] truncate text-xs font-medium leading-[1.5]',
                          note.tone === 'danger' ? 'text-danger-700' : 'text-pending-700',
                        ].join(' ')}
                      >
                        {note.text}
                      </span>
                    ) : null}
                  </Td>
                  <Td align="end">
                    <ActionMenu
                      floating
                      label={t('erp.connector.records.rowActions')}
                      items={[
                        {
                          id: 'open',
                          labelKey: 'erp.connector.records.menu.open',
                          icon: openIcon,
                          to: `${listPath}/${record.id}`,
                        },
                        ...(record.state === 'REJECTED'
                          ? [
                              {
                                id: 'retry',
                                labelKey: 'erp.connector.records.menu.retry',
                                icon: retryIcon,
                                onSelect: () => connectorStore.retryRecord(record.id),
                              },
                            ]
                          : []),
                        ...(record.state === 'WRITEBACK_FAILED'
                          ? [
                              {
                                id: 'requeue',
                                labelKey: 'erp.connector.records.menu.requeue',
                                icon: requeueIcon,
                                onSelect: () => connectorStore.requeueWriteBack(record.id),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </RowsView>

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
          <span className="text-xs font-medium text-text-quaternary">
            {t('erp.connector.records.showing', {
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

/* ----------------------------------------------------------------- detail */

type Done = { kind: 'retried' } | { kind: 'requeued'; at: Date }

function RecordDetail({ connection, recordId }: { connection: Connection; recordId: string }) {
  const { t } = useTranslation()
  const state = useConnector()
  const record = state.records.find((r) => r.id === recordId && r.connectionId === connection.id)
  const listPath = connectionPath(connection.id, 'records')
  const [done, setDone] = useState<Done | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!record) {
    return (
      <NotHere
        title={t('erp.connector.records.notFound.title')}
        body={t('erp.connector.records.notFound.body')}
        back={{ to: listPath, label: t('erp.connector.records.back') }}
      />
    )
  }

  const invoice = invoicePath(record)
  const writeBack = record.writeBack

  const retry = () => {
    connectorStore.retryRecord(record.id)
    setDone({ kind: 'retried' })
  }
  const requeue = () => {
    connectorStore.requeueWriteBack(record.id)
    setDone({ kind: 'requeued', at: new Date(Date.now() + 60 * 1000) })
  }
  const copy = () => {
    navigator.clipboard?.writeText(JSON.stringify(record.payload, null, 2))
    setCopied(true)
  }

  return (
    <>
      <BackLink to={listPath}>{t('erp.connector.records.back')}</BackLink>

      {/* The header card */}
      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
              <Mono className="text-[18px]">{record.erpNumber}</Mono>
            </h3>
            <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('erp.connector.records.detail.subtitle', { id: record.erpId })}
            </p>
          </div>
          <RecordStatePill state={record.state} />
        </div>
        <div className="border-t border-surface-background px-5 py-5">
          <Definitions
            items={[
              { label: t('erp.connector.records.detail.customer'), value: record.customer },
              {
                label: t('erp.connector.records.detail.total'),
                value: (
                  <OmAmount
                    size="md"
                    amount={record.total.toLocaleString('en-US', {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })}
                    amountClassName="text-[20px] font-semibold text-text-primary tabular-nums"
                  />
                ),
              },
              {
                label: t('erp.connector.records.detail.collected'),
                value: whenOf(record.collectedAt),
              },
              {
                label: t('erp.connector.records.detail.run'),
                value: (
                  <Link
                    to={`${connectionPath(connection.id, 'runs')}/${record.runId}`}
                    className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                  >
                    {record.runId}
                  </Link>
                ),
              },
              {
                label: t('erp.connector.records.detail.fawtirInvoice'),
                value:
                  record.fawtirInvoiceNo && invoice ? (
                    <Link to={invoice} className="transition-colors hover:text-primary-800">
                      <Mono className="text-[12px] text-primary-700">{record.fawtirInvoiceNo}</Mono>
                    </Link>
                  ) : (
                    <span className="text-text-quaternary">
                      {t('erp.connector.records.detail.noInvoice')}
                    </span>
                  ),
              },
              {
                label: t('erp.connector.records.detail.uuid'),
                value: record.fawtirUuid ? (
                  <Mono className="break-all text-text-secondary">{record.fawtirUuid}</Mono>
                ) : (
                  <span className="text-text-quaternary">—</span>
                ),
              },
            ]}
          />
        </div>
      </section>

      {done?.kind === 'retried' ? (
        <Strip tone="success">{t('erp.connector.records.rejected.retried')}</Strip>
      ) : null}
      {done?.kind === 'requeued' ? (
        <Strip tone="success">
          {t('erp.connector.records.writeBack.requeued', {
            time: whenOf(writeBack?.nextAttemptAt ?? done.at),
          })}
        </Strip>
      ) : null}

      {record.state === 'REJECTED' ? (
        <SectionCard
          title={t('erp.connector.records.rejected.title')}
          note={t('erp.connector.records.rejected.note')}
          actions={
            <button type="button" onClick={retry} className={PRIMARY_BUTTON}>
              {t('erp.connector.records.rejected.retry')}
            </button>
          }
        >
          <RowsView>
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <Th first>{t('erp.connector.records.rejected.col.rule')}</Th>
                  <Th>{t('erp.connector.records.rejected.col.path')}</Th>
                  <Th>{t('erp.connector.records.rejected.col.message')}</Th>
                </tr>
              </thead>
              <tbody>
                {(record.rejection ?? []).length === 0 ? (
                  <EmptyRow columns={3}>{t('erp.shared.noFindings')}</EmptyRow>
                ) : null}
                {(record.rejection ?? []).map((finding, index) => (
                  <tr key={`${finding.rule}-${index}`} className={TBODY_ROW}>
                    <Td first>
                      <span
                        dir="ltr"
                        className="inline-flex h-[24px] items-center whitespace-nowrap rounded-[3px] bg-surface-background px-2 font-mono text-[11px] font-semibold text-text-tertiary"
                      >
                        {finding.rule}
                      </span>
                    </Td>
                    <Td>
                      <Mono className="text-text-secondary">{finding.path}</Mono>
                    </Td>
                    <Td>
                      <span className="text-sm font-medium leading-[1.5] text-text-secondary">
                        {finding.message}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RowsView>
        </SectionCard>
      ) : null}

      {record.state === 'WRITEBACK_FAILED' && writeBack ? (
        <SectionCard
          title={t('erp.connector.records.writeBack.title')}
          note={t('erp.connector.records.writeBack.failedNote')}
          actions={
            <button type="button" onClick={requeue} className={PRIMARY_BUTTON}>
              {t('erp.connector.records.writeBack.requeue')}
            </button>
          }
        >
          <div className="border-t border-surface-background px-5 py-5">
            <Definitions
              items={[
                {
                  label: t('erp.connector.records.writeBack.attempts'),
                  value: t('erp.connector.records.writeBack.attemptsValue', {
                    done: writeBack.attempts,
                    max: WRITEBACK_MAX_ATTEMPTS,
                  }),
                },
                {
                  label: t('erp.connector.records.writeBack.lastAttempt'),
                  value: writeBack.lastAttemptAt ? whenOf(writeBack.lastAttemptAt) : '—',
                },
                {
                  label: t('erp.connector.records.writeBack.nextAttempt'),
                  value: writeBack.nextAttemptAt ? whenOf(writeBack.nextAttemptAt) : '—',
                },
              ]}
            />
            {writeBack.lastError ? (
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                {t('erp.connector.records.writeBack.lastError')}
              </p>
            ) : null}
            {writeBack.lastError ? (
              <p className="mt-1 text-sm font-medium leading-[1.5] text-danger-700">
                {writeBack.lastError}
              </p>
            ) : null}
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connector.records.writeBack.fields')}
            </p>
            <WriteBackFields fields={writeBack.fields} />
          </div>
        </SectionCard>
      ) : null}

      {record.state === 'SUPERSEDED' && record.supersededBy ? (
        <Strip tone="pending">
          {t('erp.connector.records.superseded.banner', {
            note: record.supersededBy.note,
            time: whenOf(record.supersededBy.changedAt),
          })}
        </Strip>
      ) : null}

      {record.state === 'WRITTEN_BACK' || record.state === 'ACCEPTED' ? (
        <Strip tone="success">
          {writeBack?.state === 'SENT'
            ? t('erp.connector.records.success.writtenBack', {
                time: writeBack.lastAttemptAt ? whenOf(writeBack.lastAttemptAt) : '—',
                status: writeBack.fields.fawtirStatus,
                invoice: writeBack.fields.invoiceNumber ?? record.fawtirInvoiceNo ?? '—',
                uuid: writeBack.fields.uuid ?? record.fawtirUuid ?? '—',
              })
            : writeBack?.state === 'PENDING'
              ? t('erp.connector.records.success.queued', {
                  invoice: record.fawtirInvoiceNo ?? '—',
                  time: writeBack.nextAttemptAt ? whenOf(writeBack.nextAttemptAt) : '—',
                })
              : t('erp.connector.records.success.accepted', {
                  invoice: record.fawtirInvoiceNo ?? '—',
                  uuid: record.fawtirUuid ?? '—',
                })}
        </Strip>
      ) : null}

      <SectionCard
        title={t('erp.connector.records.payload.title')}
        note={t('erp.connector.records.payload.note')}
        actions={
          <button type="button" onClick={copy} className={SMALL_BUTTON}>
            {copied ? t('erp.shared.copied') : t('erp.shared.copyJson')}
          </button>
        }
      >
        <div className="border-t border-surface-background p-5">
          <JsonTree value={record.payload} copyable={false} openDepth={2} />
        </div>
      </SectionCard>
    </>
  )
}

const FIELD_ORDER = [
  'fawtirStatus',
  'invoiceNumber',
  'uuid',
  'submittedAt',
  'rejectionReason',
  'qr',
] as const

/** What the connector will put into the ERP record, one line per field. */
function WriteBackFields({ fields }: { fields: NonNullable<ErpRecord['writeBack']>['fields'] }) {
  const { t } = useTranslation()
  const rows = FIELD_ORDER.filter((key) => fields[key] !== undefined && fields[key] !== '')
  return (
    <ul className="mt-2 flex flex-col divide-y divide-surface-background">
      {rows.map((key) => {
        const value = fields[key]
        return (
          <li
            key={key}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2"
          >
            <span className="text-sm font-medium text-text-secondary">
              {t(`erp.connector.records.writeBack.field.${key}`)}
            </span>
            {value instanceof Date ? (
              <span className="text-sm font-medium text-text-tertiary tabular-nums">
                {whenOf(value)}
              </span>
            ) : typeof value === 'boolean' ? (
              <span className="text-sm font-medium text-text-tertiary">
                {value ? t('common.yes') : t('common.no')}
              </span>
            ) : (
              <Mono className="break-all text-text-tertiary">{String(value)}</Mono>
            )}
          </li>
        )
      })}
    </ul>
  )
}
