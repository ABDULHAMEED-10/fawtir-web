import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView, Switch } from '../../../components/ui'
import {
  EmptyRow,
  Mono,
  SectionCard,
  TBODY_ROW,
  TEXT_BUTTON,
  THEAD_ROW,
  Td,
  Th,
} from '../overview/idiom'
import { ConnectionShell, OutboxStatePill, connectionPath, useConnection } from './ConnectionShell'
import { Strip, dateTime } from './detailShared'
import {
  WRITEBACK_MAX_ATTEMPTS,
  connectorStore,
  outboxFor,
  useConnector,
  type Connection,
  type OutboxState,
  type Product,
} from '../../../lib/erpConnector'

/** The six fields the connector writes into the ERP record, and where each lands per product. */
const WRITTEN_FIELDS = [
  'status',
  'invoiceNumber',
  'uuid',
  'submittedAt',
  'rejectionReason',
  'qr',
] as const
type WrittenField = (typeof WRITTEN_FIELDS)[number]

const ERP_FIELD: Record<WrittenField, string> = {
  status: 'status',
  invoiceNumber: 'number',
  uuid: 'uuid',
  submittedAt: 'submitted_at',
  rejectionReason: 'rejection',
  qr: 'qr',
}
/** Odoo custom fields carry the `x_` studio prefix; ERPNext custom fields do not. */
const erpFieldName = (product: Product, field: WrittenField) =>
  `${product === 'ODOO' ? 'x_' : ''}fawtir_${ERP_FIELD[field]}`

const FILTERS = ['ALL', 'PENDING', 'SENT', 'FAILED', 'ABANDONED'] as const
type Filter = (typeof FILTERS)[number]

/**
 * Settings › Integration › Connected systems › connection › Write-back (docs/erp-and-console-plan.md
 * §3, Appendix B "Detail · Write-back").
 *
 * The switch, what is written and into which ERP field, then the outbox: every record with a
 * write-back, its attempts against the ceiling, and Re-queue for the ones that failed or were
 * given up on.
 */
export function ConnectionWriteBackPage() {
  const connection = useConnection()
  return (
    <ConnectionShell connection={connection}>
      {connection ? <WriteBackBody connection={connection} /> : null}
    </ConnectionShell>
  )
}

function WriteBackBody({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const state = useConnector()
  const canWrite = c.scopes.includes('WRITE')
  const outbox = outboxFor(state, c.id).sort(
    (a, b) =>
      (b.writeBack?.lastAttemptAt?.getTime() ?? b.updatedAt.getTime()) -
      (a.writeBack?.lastAttemptAt?.getTime() ?? a.updatedAt.getTime()),
  )
  const [filter, setFilter] = useState<Filter>('ALL')
  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f,
      f === 'ALL' ? outbox.length : outbox.filter((r) => r.writeBack?.state === f).length,
    ]),
  ) as Record<Filter, number>
  const shown = filter === 'ALL' ? outbox : outbox.filter((r) => r.writeBack?.state === filter)

  return (
    <>
      <SectionCard
        title={t('erp.connector.writeBackTab.title')}
        note={t('erp.connector.writeBackTab.note')}
        actions={
          <label className="flex items-center gap-3">
            <span className="text-sm font-semibold text-text-secondary">
              {c.writeBackEnabled
                ? t('erp.connector.writeBackTab.on')
                : t('erp.connector.writeBackTab.off')}
            </span>
            <Switch
              checked={c.writeBackEnabled}
              disabled={!canWrite || c.state === 'DISCONNECTED'}
              label={t('erp.connector.writeBackTab.switch')}
              onChange={(writeBackEnabled) => connectorStore.update(c.id, { writeBackEnabled })}
            />
          </label>
        }
      >
        {!canWrite ? (
          <div className="px-5 pb-5">
            <Strip
              tone="pending"
              action={
                <Link to={connectionPath(c.id, 'settings')} className={TEXT_BUTTON}>
                  {t('erp.connector.writeBackTab.openSettings')}
                </Link>
              }
            >
              {t('erp.connector.writeBackTab.needsWrite')}
            </Strip>
          </div>
        ) : null}

        <div className="border-t border-surface-background">
          <p className="px-5 pt-4 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
            {t('erp.connector.writeBackTab.fields.title', {
              product: t(`erp.connector.product.${c.product}`),
            })}
          </p>
          <dl className="grid px-5 pb-2 pt-2 md:grid-cols-2 md:gap-x-8">
            {WRITTEN_FIELDS.map((field) => (
              <div
                key={field}
                className="flex items-center justify-between gap-3 border-b border-surface-background py-2.5 last:border-0 md:[&:nth-last-child(2)]:border-0"
              >
                <dt className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t(`erp.connector.writeBackTab.fields.${field}.label`)}
                  </span>
                  <span className="block text-xs font-medium leading-[1.4] text-text-quaternary">
                    {t(`erp.connector.writeBackTab.fields.${field}.body`)}
                  </span>
                </dt>
                <dd className="shrink-0">
                  <Mono className="rounded-[3px] bg-surface-background px-1.5 py-0.5 text-text-secondary">
                    {erpFieldName(c.product, field)}
                  </Mono>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </SectionCard>

      <SectionCard
        title={t('erp.connector.writeBackTab.outbox.title')}
        note={t('erp.connector.writeBackTab.outbox.note', { max: WRITEBACK_MAX_ATTEMPTS })}
      >
        <div className="flex flex-wrap gap-2 border-t border-surface-background px-5 py-3">
          {FILTERS.map((f) => {
            const active = f === filter
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[30px] items-center gap-1.5 rounded-[3px] px-2.5 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-primary-700 text-white'
                    : 'bg-surface-background text-text-secondary hover:bg-primary-25',
                ].join(' ')}
              >
                {f === 'ALL'
                  ? t('erp.connector.writeBackTab.outbox.all')
                  : t(`erp.connector.outboxState.${f}`)}
                <span className={active ? 'text-white/80' : 'text-text-quaternary'}>
                  {counts[f]}
                </span>
              </button>
            )
          })}
        </div>
        <RowsView>
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.connector.writeBackTab.outbox.col.erpNumber')}</Th>
                <Th>{t('erp.connector.writeBackTab.outbox.col.invoice')}</Th>
                <Th>{t('erp.connector.writeBackTab.outbox.col.state')}</Th>
                <Th>{t('erp.connector.writeBackTab.outbox.col.attempts')}</Th>
                <Th>{t('erp.connector.writeBackTab.outbox.col.lastAttempt')}</Th>
                <Th>{t('erp.connector.writeBackTab.outbox.col.nextAttempt')}</Th>
                <Th>{t('erp.connector.writeBackTab.outbox.col.lastError')}</Th>
                <Th align="end">{t('erp.connector.writeBackTab.outbox.col.action')}</Th>
              </tr>
            </thead>
            <tbody>
              {!c.writeBackEnabled && outbox.length === 0 ? (
                <EmptyRow columns={8}>{t('erp.connector.writeBackTab.outbox.emptyOff')}</EmptyRow>
              ) : shown.length === 0 ? (
                <EmptyRow columns={8}>
                  {c.writeBackEnabled
                    ? t('erp.connector.writeBackTab.outbox.empty')
                    : t('erp.connector.writeBackTab.outbox.emptyOff')}
                </EmptyRow>
              ) : (
                shown.map((record) => {
                  const wb = record.writeBack!
                  const requeueable: OutboxState[] = ['FAILED', 'ABANDONED']
                  return (
                    <tr key={record.id} className={TBODY_ROW}>
                      <Td first>
                        <Link
                          to={`${connectionPath(c.id, 'records')}/${record.id}`}
                          className="hover:text-primary-800"
                        >
                          <Mono className="text-xs text-text-primary">{record.erpNumber}</Mono>
                        </Link>
                      </Td>
                      <Td>
                        {record.fawtirInvoiceId ? (
                          <Link
                            to={`/invoices/${record.fawtirInvoiceId}`}
                            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                          >
                            {record.fawtirInvoiceNo}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-text-quaternary">—</span>
                        )}
                      </Td>
                      <Td>
                        <OutboxStatePill state={wb.state} />
                      </Td>
                      <Td className="whitespace-nowrap text-sm font-medium text-text-secondary tabular-nums">
                        {t('erp.connector.writeBackTab.outbox.attemptsOf', {
                          count: wb.attempts,
                          max: WRITEBACK_MAX_ATTEMPTS,
                        })}
                      </Td>
                      <Td className="whitespace-nowrap text-sm font-medium text-text-secondary tabular-nums">
                        {wb.lastAttemptAt ? dateTime(wb.lastAttemptAt) : '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-sm font-medium text-text-secondary tabular-nums">
                        {wb.state === 'PENDING' || wb.state === 'FAILED'
                          ? wb.nextAttemptAt
                            ? dateTime(wb.nextAttemptAt)
                            : '—'
                          : '—'}
                      </Td>
                      <Td>
                        {wb.lastError ? (
                          <span className="block max-w-[280px] text-xs font-medium leading-[1.5] text-danger-700">
                            {wb.lastError}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-text-quaternary">—</span>
                        )}
                      </Td>
                      <Td align="end">
                        {requeueable.includes(wb.state) ? (
                          <button
                            type="button"
                            onClick={() => connectorStore.requeueWriteBack(record.id)}
                            className={`${TEXT_BUTTON} whitespace-nowrap`}
                          >
                            {t('erp.connector.writeBackTab.outbox.requeue')}
                          </button>
                        ) : null}
                      </Td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </RowsView>
      </SectionCard>
    </>
  )
}
