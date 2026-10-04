import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../../components/feedback/ApiNotice'
import { RowsView } from '../../../components/ui'
import { useApiRead } from '../../../hooks/useApiRead'
import { businessToday, windowBounds, windowProblem } from '../../../lib/erp/reportingWindow'
import { LABEL_GROUPS, reconciliationTone } from '../../../lib/erp/reportingStatus'
import {
  RECONCILIATION_LABELS,
  SOURCE_KINDS,
  loadReconciliation,
  reconciliationPath,
  type ReconciliationItemDto,
  type ReconciliationPage,
} from '../../../api/erp/reporting'
import { EmptyRow, SectionCard, TBODY_ROW, THEAD_ROW, TEXT_BUTTON, Td, Th } from '../overview/idiom'
import {
  ConnectionFilter,
  ConnectionLabel,
  DisplayStatusPill,
  FilterSelect,
  PastTheEnd,
  ReportingShell,
  ReportPager,
  TonePill,
  When,
  WindowFields,
} from './reportingParts'
import { useCode, useConnectionNames, useEnumOptions, useReportReadable } from './reportingHooks'
import { readWindow, useReportQuery } from './reportingQuery'

/**
 * Documents that have not arrived where they should have, read at the moment of asking.
 *
 * Nothing here is stored, acknowledged or resolved: the server derives each label from the
 * ledgers' current state, and a document drops off the list as soon as that state moves on. The
 * three groups in the filter are a reading aid only; the request always names the server's label.
 *
 * No label is computed here and no wait is timed here. `RESPONSE_PENDING` in particular is only
 * ever the server's: while no approved recipient-response window is configured the server does not
 * evaluate it, says so in `unevaluated_labels`, and the screen repeats that rather than guessing.
 */
export function ErpAttentionPage() {
  const { t } = useTranslation()
  const { get, pick, page, update } = useReportQuery()
  const { names, options: connectionOptions } = useConnectionNames()
  const enumOptions = useEnumOptions()
  const code = useCode()

  const range = readWindow(get)
  const problem = windowProblem(range.from, range.to, { required: true })
  const bounds = problem === null ? windowBounds(range.from, range.to) : null
  const label = pick('label', RECONCILIATION_LABELS)
  const sourceKind = pick('channel', SOURCE_KINDS)
  const connectionId = get('connection')

  const readable = useReportReadable()
  const path =
    readable && bounds
      ? reconciliationPath({ label, sourceKind, connectionId, ...bounds }, page - 1)
      : null
  const list = useApiRead<ReconciliationPage>(path, () => loadReconciliation(path!))

  const labelOptions = LABEL_GROUPS.flatMap((group) =>
    group.labels.map((value) => ({
      value,
      label: code('label', value),
      hint: t(`erp.reporting.labelGroup.${group.id}`),
    })),
  )

  return (
    <ReportingShell
      title={t('erp.reporting.attention.title')}
      subtitle={t('erp.reporting.attention.subtitle')}
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
            label={t('erp.reporting.filters.label')}
            anyLabel={t('erp.reporting.filters.anyLabel')}
            value={label}
            options={labelOptions}
            onChange={(value) => update({ label: value })}
          />
          <FilterSelect
            label={t('erp.reporting.filters.channel')}
            anyLabel={t('erp.reporting.filters.any')}
            value={sourceKind}
            options={enumOptions('sourceKind', SOURCE_KINDS)}
            onChange={(value) => update({ channel: value })}
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
              update({ from: null, to: null, label: null, channel: null, connection: null })
            }
          >
            {t('erp.reporting.filters.reset')}
          </button>
        </div>
      </SectionCard>

      <LabelGuide />

      <SectionCard title={t('erp.reporting.attention.listTitle')}>
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
        ) : (
          <>
            {list.read.data.unevaluatedLabels.length > 0 ? (
              <p
                role="note"
                className="mx-5 mb-3 rounded-sm bg-surface-background px-3 py-2 text-xs font-medium text-text-secondary"
              >
                {t('erp.reporting.attention.unevaluated', {
                  labels: list.read.data.unevaluatedLabels
                    .map((value) => code('label', value))
                    .join(', '),
                })}
                {list.read.data.unevaluatedLabels.includes('RESPONSE_PENDING')
                  ? ` ${t('erp.reporting.attention.responsePendingUnevaluated')}`
                  : ''}
              </p>
            ) : null}
            {page > 1 && list.read.data.items.length === 0 && !list.read.data.hasMore ? (
              <PastTheEnd onFirst={() => update({ page: null })} />
            ) : (
              <>
                <AttentionTable
                  items={list.read.data.items}
                  names={names}
                  empty={
                    label || sourceKind || connectionId
                      ? t('erp.reporting.attention.emptyFiltered')
                      : t('erp.reporting.attention.empty')
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
          </>
        )}
      </SectionCard>
    </ReportingShell>
  )
}

/** What each label means, in words that say only what the server's evidence says. */
function LabelGuide() {
  const { t } = useTranslation()
  const code = useCode()
  return (
    <SectionCard title={t('erp.reporting.attention.guideTitle')}>
      <details className="px-5 pb-5">
        <summary className="cursor-pointer text-sm font-semibold text-primary-700">
          {t('erp.reporting.attention.guideOpen')}
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {LABEL_GROUPS.map((group) => (
            <section key={group.id}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                {t(`erp.reporting.labelGroup.${group.id}`)}
              </h4>
              <dl className="mt-2 flex flex-col gap-2">
                {group.labels.map((value) => (
                  <div key={value}>
                    <dt className="text-sm font-semibold text-text-primary">
                      {code('label', value)}
                    </dt>
                    <dd className="text-xs text-text-secondary">
                      {t(`erp.reporting.labelExplain.${value}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </details>
    </SectionCard>
  )
}

function AttentionTable({
  items,
  names,
  empty,
}: {
  items: ReconciliationItemDto[]
  names: Map<string, string> | null
  empty: string
}) {
  const { t } = useTranslation()
  const code = useCode()
  return (
    <RowsView>
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">{t('erp.reporting.attention.listTitle')}</caption>
        <thead>
          <tr className={THEAD_ROW}>
            <Th first>{t('erp.reporting.col.document')}</Th>
            <Th>{t('erp.reporting.col.labels')}</Th>
            <Th>{t('erp.reporting.col.status')}</Th>
            <Th>{t('erp.reporting.col.invoice')}</Th>
            <Th>{t('erp.reporting.col.channel')}</Th>
            <Th>{t('erp.reporting.col.connection')}</Th>
            <Th>{t('erp.reporting.col.received')}</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyRow columns={7}>{empty}</EmptyRow>
          ) : (
            items.map((item) => (
              <tr key={item.record_id} className={TBODY_ROW}>
                <Td first>
                  <Link
                    to={`/settings/erp/documents/${encodeURIComponent(item.record_id)}`}
                    className="font-semibold text-primary-700 underline-offset-2 hover:underline break-all"
                  >
                    <span dir="ltr">{item.external_document_id}</span>
                  </Link>
                </Td>
                <Td>
                  <ul className="flex flex-col gap-1.5">
                    {item.findings.map((finding) => (
                      <li key={finding.label} className="flex flex-col items-start gap-0.5">
                        <TonePill
                          tone={reconciliationTone(finding.label)}
                          label={code('label', finding.label)}
                        />
                        {finding.since ? (
                          <span className="text-xs text-text-quaternary">
                            {t('erp.reporting.attention.since')} <When at={finding.since} />
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td>
                  <DisplayStatusPill status={item.display_status} />
                  <span className="mt-1 block text-xs text-text-quaternary">
                    {code('processingState', item.processing_state)}
                    {item.reason_code ? ` · ${code('reason', item.reason_code)}` : ''}
                  </span>
                </Td>
                <Td>
                  {item.invoice?.invoice_number ? (
                    <span dir="ltr" className="break-all">
                      {item.invoice.invoice_number}
                    </span>
                  ) : item.invoice?.missing ? (
                    <span className="text-danger-700">{t('erp.reporting.invoiceMissing')}</span>
                  ) : (
                    <span className="text-text-quaternary">{t('erp.reporting.noInvoice')}</span>
                  )}
                  {item.delivery_route ? (
                    <span className="block text-xs text-text-quaternary">
                      {code('route', item.delivery_route)}
                      {item.delivery_state && item.delivery_route !== 'OUTSIDE_PEPPOL'
                        ? ` · ${code('deliveryState', item.delivery_state)}`
                        : ''}
                    </span>
                  ) : null}
                  {item.tax_report_status ? (
                    <span className="block text-xs text-text-quaternary">
                      {t('erp.reporting.attention.tax', {
                        status: code('taxStatus', item.tax_report_status),
                      })}
                    </span>
                  ) : null}
                </Td>
                <Td>{code('sourceKind', item.source_kind)}</Td>
                <Td>
                  <ConnectionLabel id={item.connection_id} names={names} />
                </Td>
                <Td>
                  <When at={item.received_at} />
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </RowsView>
  )
}
