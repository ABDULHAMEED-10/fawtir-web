import { Fragment, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../../components/feedback/ApiNotice'
import { RowsView } from '../../../components/ui'
import { formatCount } from '../../../lib/format'
import {
  MAX_VALIDATION_FINDINGS,
  TIMELINE_AUDIT_EVENT_LIMIT,
  type SourceDocumentDetailDto,
  type TimelineItemDto,
  type ValidationFindingDto,
} from '../../../api/erp/reporting'
import {
  deliveryStateIsMeaningful,
  displayStatusTone,
  recipientAckTone,
} from '../../../lib/erp/reportingStatus'
import {
  EmptyRow,
  Mono,
  SectionCard,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from '../overview/idiom'
import { ConnectionLabel, ReportingShell, TonePill, When } from './reportingParts'
import { RecoveryCard, RecoveryNoticeBanner } from './DocumentRecovery'
import { useDocumentRecovery } from './useDocumentRecovery'
import {
  GLOBAL_LINKS,
  useCode,
  useConnectionNames,
  useDocumentDetail,
  type ReportLinks,
} from './reportingHooks'

/**
 * One source document, every dimension in its own section.
 *
 * The badge at the top is the server's one-word `display_status` and is labelled as a summary;
 * the sections below are the ledgers' own states and are what the reader should act on. Where two
 * of them disagree — a delivered invoice whose tax report was refused — both are shown as they
 * are, because the disagreement is the information.
 *
 * Read-only but for one action. A stuck claim is released by the platform's own recovery, and a
 * document is sent again from the ERP, where the ledger recognises it and never invoices it twice.
 * The exception is a Managed Pull document that ran out of attempts after the channel's cursor
 * moved past it, which nothing would ever fetch again: the Recovery card asks the server to replay
 * the request that returned it (Phase 10, `RecoveryCard`).
 */
export function ErpDocumentDetailPage() {
  const { t } = useTranslation()
  const { recordId = '' } = useParams<{ recordId: string }>()
  const detail = useDocumentDetail(recordId)

  const title =
    detail.read.status === 'ready'
      ? detail.read.data.document.external_document_id
      : t('erp.reporting.detail.title')

  return (
    <ReportingShell
      title={title}
      subtitle={t('erp.reporting.detail.subtitle')}
      back={{ to: '/settings/erp/documents', label: t('erp.reporting.detail.back') }}
    >
      <DocumentDetailBody detail={detail} />
    </ReportingShell>
  )
}

/**
 * The document's sections without a frame, for the reports' shell and for a connection's Records
 * tab, whose links stay under the connection.
 */
export function DocumentDetailBody({
  detail,
  links = GLOBAL_LINKS,
}: {
  detail: ReturnType<typeof useDocumentDetail>
  links?: ReportLinks
}) {
  const { names } = useConnectionNames()
  const recovery = useDocumentRecovery(detail.recordId, detail.retry)
  return (
    <>
      {recovery.notice ? <RecoveryNoticeBanner notice={recovery.notice} /> : null}
      {detail.read.status === 'loading' ? (
        <LoadingNotice />
      ) : detail.read.status === 'failed' ? (
        <ApiReadFailure error={detail.read.error} retry={detail.retry} />
      ) : (
        <DocumentDetail
          detail={detail.read.data}
          names={names}
          links={links}
          recovery={recovery}
        />
      )}
    </>
  )
}

function Fields({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-quaternary">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-text-primary">{children}</dd>
    </div>
  )
}

function DocumentDetail({
  detail,
  names,
  links,
  recovery,
}: {
  detail: SourceDocumentDetailDto
  names: Map<string, string> | null
  links: ReportLinks
  recovery: ReturnType<typeof useDocumentRecovery>
}) {
  const { t, i18n } = useTranslation()
  const code = useCode()
  const document = detail.document
  const invoice = document.invoice
  const delivery = detail.delivery
  const response = detail.recipient_response
  const tax = detail.tax_report
  const findings = detail.validation_findings
  const showFindings = findings.items.length > 0 || document.processing_state === 'REJECTED'

  return (
    <>
      <SectionCard
        title={t('erp.reporting.detail.overall')}
        note={t('erp.reporting.detail.overallNote')}
      >
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
          <TonePill
            tone={displayStatusTone(document.display_status)}
            label={code('displayStatus', document.display_status)}
          />
          <span className="text-sm text-text-secondary">
            {t(`erp.reporting.displayExplain.${document.display_status}`, { defaultValue: '' })}
          </span>
        </div>
      </SectionCard>

      <RecoveryCard document={document} busy={recovery.busy} onRecover={recovery.recover} />

      <SectionCard title={t('erp.reporting.detail.source')}>
        <Fields>
          <Field label={t('erp.reporting.col.document')}>
            <bdi dir="ltr" className="break-words">
              {document.external_document_id}
            </bdi>
          </Field>
          <Field label={t('erp.reporting.detail.version')}>
            {document.external_version ? (
              <bdi dir="ltr" className="break-words">
                {document.external_version}
              </bdi>
            ) : (
              <span className="text-text-quaternary">—</span>
            )}
          </Field>
          <Field label={t('erp.reporting.col.channel')}>
            {code('sourceKind', document.source_kind)}
          </Field>
          <Field label={t('erp.reporting.col.connection')}>
            <ConnectionLabel id={document.connection_id} names={names} />
          </Field>
          <Field label={t('erp.reporting.detail.run')}>
            {document.run_id ? (
              <Link
                to={links.run(document.run_id)}
                className="font-semibold text-primary-700 underline-offset-2 hover:underline"
              >
                {t('erp.reporting.detail.openRun')}
              </Link>
            ) : (
              <span className="text-text-quaternary">—</span>
            )}
          </Field>
          <Field label={t('erp.reporting.col.processing')}>
            {code('processingState', document.processing_state)}
          </Field>
          {document.reason_code ? (
            <Field label={t('erp.reporting.detail.reason')}>
              <span className="block">{code('reason', document.reason_code)}</span>
              {document.stage ? (
                <span className="block text-xs text-text-quaternary">
                  {t('erp.reporting.detail.stage', { stage: code('stage', document.stage) })}
                </span>
              ) : null}
            </Field>
          ) : null}
          {document.failure_class ? (
            <Field label={t('erp.reporting.detail.failureClass')}>
              {code('failureClass', document.failure_class)}
            </Field>
          ) : null}
          {document.reason_code ? (
            <Field label={t('erp.reporting.detail.retryable')}>
              {document.retryable
                ? t('erp.reporting.detail.retryableYes')
                : t('erp.reporting.detail.retryableNo')}
            </Field>
          ) : null}
          <Field label={t('erp.reporting.detail.attempts')}>
            {t('erp.reporting.detail.attemptsOf', {
              count: document.attempt_count,
              used: formatCount(document.attempt_count, i18n.language),
              max: formatCount(detail.max_attempts, i18n.language),
            })}
          </Field>
          <Field label={t('erp.reporting.col.received')}>
            <When at={document.received_at} />
          </Field>
          <Field label={t('erp.reporting.detail.settled')}>
            <When at={document.settled_at} />
          </Field>
          <Field label={t('erp.reporting.detail.updated')}>
            <When at={document.updated_at} />
          </Field>
        </Fields>
      </SectionCard>

      <SectionCard title={t('erp.reporting.detail.invoice')}>
        {invoice === null ? (
          <p className="px-5 pb-5 text-sm text-text-secondary">
            {document.processing_state === 'ACCEPTED'
              ? t('erp.reporting.detail.acceptedNoInvoice')
              : t('erp.reporting.detail.noInvoice')}
          </p>
        ) : (
          <Fields>
            <Field label={t('erp.reporting.col.invoice')}>
              {invoice.invoice_number ? (
                <bdi dir="ltr" className="break-words">
                  {invoice.invoice_number}
                </bdi>
              ) : (
                <span className="text-text-quaternary">—</span>
              )}
            </Field>
            {invoice.missing ? (
              <Field label={t('erp.reporting.detail.anomaly')}>
                <span className="text-danger-700">{t('erp.reporting.invoiceMissing')}</span>
              </Field>
            ) : null}
            {invoice.invoice_uuid && !invoice.missing ? (
              <Field label={t('erp.reporting.detail.compliance')}>
                <Link
                  to={`/compliance/activity/${encodeURIComponent(invoice.invoice_uuid)}`}
                  className="font-semibold text-primary-700 underline-offset-2 hover:underline"
                >
                  {t('erp.reporting.detail.openCompliance')}
                </Link>
              </Field>
            ) : null}
          </Fields>
        )}
      </SectionCard>

      {delivery ? (
        <SectionCard
          title={t('erp.reporting.detail.delivery')}
          note={
            deliveryStateIsMeaningful(delivery.route)
              ? undefined
              : t('erp.reporting.detail.offNetworkNote')
          }
        >
          <Fields>
            <Field label={t('erp.reporting.detail.route')}>{code('route', delivery.route)}</Field>
            <Field label={t('erp.reporting.detail.ledgerState')}>
              {code('deliveryState', delivery.state)}
            </Field>
            {delivery.failure_reason ? (
              <Field label={t('erp.reporting.detail.ledgerReason')}>
                <Mono>{delivery.failure_reason}</Mono>
              </Field>
            ) : null}
            <Field label={t('erp.reporting.detail.validatedAt')}>
              <When at={delivery.validated_at} />
            </Field>
            <Field label={t('erp.reporting.detail.sentAt')}>
              <When at={delivery.sent_at} />
            </Field>
            <Field label={t('erp.reporting.detail.deliveredAt')}>
              <When at={delivery.delivered_at} />
            </Field>
          </Fields>
        </SectionCard>
      ) : null}

      {response ? (
        <SectionCard
          title={t('erp.reporting.detail.response')}
          note={t('erp.reporting.detail.responseNote')}
        >
          <div className="px-5 pb-5">
            {!response.applicable ? (
              <p className="text-sm text-text-secondary">
                {t('erp.reporting.detail.responseNotApplicable')}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <TonePill
                  tone={recipientAckTone(response.code)}
                  label={code('ack', response.code)}
                />
                {response.received_at ? <When at={response.received_at} /> : null}
                {response.code === 'NONE' ? (
                  <span className="text-sm text-text-secondary">
                    {t('erp.reporting.detail.responseNone')}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      {invoice !== null && !invoice.missing ? (
        <SectionCard title={t('erp.reporting.detail.tax')} note={t('erp.reporting.detail.taxNote')}>
          {tax === null ? (
            <p className="px-5 pb-5 text-sm text-text-secondary">
              {t('erp.reporting.detail.taxNone')}
            </p>
          ) : (
            <Fields>
              <Field label={t('erp.reporting.detail.taxStatus')}>
                {code('taxStatus', tax.status)}
              </Field>
              <Field label={t('erp.reporting.detail.taxVariant')}>
                {code('taxVariant', tax.variant)}
              </Field>
              <Field label={t('erp.reporting.detail.taxDeadline')}>
                <When at={tax.sla_deadline} />
              </Field>
              <Field label={t('erp.reporting.detail.taxSubmitted')}>
                <When at={tax.submitted_at} />
              </Field>
              <Field label={t('erp.reporting.detail.taxSla')}>
                {tax.sla_met === null
                  ? t('erp.reporting.detail.taxSlaOpen')
                  : tax.sla_met
                    ? t('erp.reporting.detail.taxSlaMet')
                    : t('erp.reporting.detail.taxSlaMissed')}
              </Field>
              <Field label={t('erp.reporting.detail.taxObligations')}>
                {formatCount(tax.obligations, i18n.language)}
              </Field>
            </Fields>
          )}
        </SectionCard>
      ) : null}

      {showFindings ? <FindingsCard items={findings.items} truncated={findings.truncated} /> : null}

      <TimelineCard items={detail.timeline.items} truncated={detail.timeline.truncated} />
    </>
  )
}

/**
 * The validator's verdict by layer, rule and field, with a sentence of Fawtir's. The validator's
 * own message and the XPath are not in the response — they can quote the document — and nothing
 * here tries to rebuild them.
 */
export function FindingsCard({
  items,
  truncated,
}: {
  items: ValidationFindingDto[]
  truncated: boolean
}) {
  const { t } = useTranslation()
  return (
    <SectionCard
      title={t('erp.reporting.findings.title')}
      note={
        truncated
          ? t('erp.reporting.findings.truncated', { count: MAX_VALIDATION_FINDINGS })
          : undefined
      }
    >
      <RowsView>
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <caption className="sr-only">{t('erp.reporting.findings.title')}</caption>
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.reporting.findings.layer')}</Th>
              <Th>{t('erp.reporting.findings.rule')}</Th>
              <Th>{t('erp.reporting.findings.field')}</Th>
              <Th>{t('erp.reporting.findings.explanation')}</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <EmptyRow columns={4}>{t('erp.reporting.findings.none')}</EmptyRow>
            ) : (
              items.map((item, index) => (
                <tr key={index} className={TBODY_ROW}>
                  <Td first>{item.layer ?? '—'}</Td>
                  <Td>
                    <bdi dir="ltr" className="font-mono text-xs [overflow-wrap:anywhere]">
                      {item.rule_id ?? '—'}
                    </bdi>
                  </Td>
                  <Td>
                    <bdi dir="ltr" className="font-mono text-xs [overflow-wrap:anywhere]">
                      {item.field_path ? <PathWithBreaks path={item.field_path} /> : '—'}
                    </bdi>
                  </Td>
                  {/* The sentence can come back in the server's English: `auto` keeps its full
                      stop at its end in an Arabic page instead of moving it to the start. */}
                  <Td className="break-words">
                    {item.explanation ? <span dir="auto">{item.explanation}</span> : '—'}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </RowsView>
    </SectionCard>
  )
}

/**
 * An XPath that wraps at its steps, `/Invoice/cac:LegalMonetaryTotal/…`, rather than in the middle
 * of a name. A step longer than the column still breaks, as a last resort.
 */
function PathWithBreaks({ path }: { path: string }) {
  const steps = path.split('/')
  return (
    <>
      {steps.map((step, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <>
              <wbr />/
            </>
          ) : null}
          {step}
        </Fragment>
      ))}
    </>
  )
}

/** Which vocabulary a timeline item's code belongs to, by the item's type. */
const TIMELINE_CODE_GROUP: Partial<Record<string, string>> = {
  SOURCE_DEFERRED: 'reason',
  SOURCE_REJECTED: 'reason',
  REPLAY: 'reason',
  RECOVERY: 'recovery',
  OPERATOR_RECOVERY: 'operatorRecovery',
  DELIVERY_STATE: 'deliveryState',
  RECIPIENT_RESPONSE: 'ack',
  TAX_REPORT: 'timelineTax',
}

/**
 * What happened, as the ledgers and the audit trail recorded it, in the server's order (oldest
 * first, ties broken by the server). Every item is a recorded time; a state nobody recorded a time
 * for is in the sections above and absent here, and nothing is inserted to fill a gap.
 */
export function TimelineCard({
  items,
  truncated,
}: {
  items: TimelineItemDto[]
  truncated: boolean
}) {
  const { t } = useTranslation()
  const code = useCode()
  const [newestFirst, setNewestFirst] = useState(false)
  const shown = newestFirst ? [...items].reverse() : items
  return (
    <SectionCard
      title={t('erp.reporting.timeline.title')}
      note={t('erp.reporting.timeline.note')}
      actions={
        items.length > 1 ? (
          <button
            type="button"
            aria-pressed={newestFirst}
            onClick={() => setNewestFirst((value) => !value)}
            className="text-sm font-semibold text-primary-700"
          >
            {newestFirst
              ? t('erp.reporting.timeline.oldestFirst')
              : t('erp.reporting.timeline.newestFirst')}
          </button>
        ) : undefined
      }
    >
      {truncated ? (
        <p
          role="note"
          className="mx-5 mb-3 rounded-sm bg-pending-100 px-3 py-2 text-xs font-medium text-pending-700"
        >
          {t('erp.reporting.timeline.truncated', { count: TIMELINE_AUDIT_EVENT_LIMIT })}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-text-secondary">{t('erp.reporting.timeline.empty')}</p>
      ) : (
        <ol
          className="flex flex-col gap-0 px-5 pb-5"
          aria-label={t('erp.reporting.timeline.title')}
        >
          {shown.map((item, index) => {
            const group = TIMELINE_CODE_GROUP[item.type]
            const refined = item.code ? (group ? code(group, item.code) : item.code) : null
            return (
              <li
                key={`${item.at}-${item.type}-${index}`}
                className="relative border-s-2 border-border-subtle ps-4 pb-4 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className={[
                    'absolute -start-[5px] top-1.5 size-2 rounded-full',
                    item.origin === 'AUDIT_TRAIL' ? 'bg-pending-700' : 'bg-primary-700',
                  ].join(' ')}
                />
                <p className="text-sm font-semibold text-text-primary">
                  {code('timeline', item.type)}
                  {refined ? (
                    <span className="font-medium text-text-secondary"> · {refined}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-quaternary">
                  <When at={item.at} />
                  <span>{code('origin', item.origin)}</span>
                  {item.actor_type ? <span>{code('actor', item.actor_type)}</span> : null}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </SectionCard>
  )
}
