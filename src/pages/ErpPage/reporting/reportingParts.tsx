import { useId, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../../SettingsPage/SettingsShell'
import { DateField, Pager, RowsView, Select, type SelectOption } from '../../../components/ui'
import { LoadingNotice, PermissionDeniedNotice } from '../../../components/feedback/ApiNotice'
import { Pill } from '../ErpShell'
import { EmptyRow, Mono, TBODY_ROW, THEAD_ROW, Td, Th } from '../overview/idiom'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { formatInstant } from '../../../lib/format'
import { REPORT_MAX_PAGE, type SourceDocumentDto } from '../../../api/erp/reporting'
import { displayStatusTone, shortId, type Tone } from '../../../lib/erp/reportingStatus'
import type { WindowProblem } from '../../../lib/erp/reportingWindow'
import { REPORT_READ, useCode } from './reportingHooks'
import { TEXT_BUTTON } from '../overview/idiom'

const REPORT_TABS = [
  { id: 'documents', to: '/settings/erp/documents' },
  { id: 'attention', to: '/settings/erp/attention' },
  { id: 'runs', to: '/settings/erp/runs' },
] as const

function ReportTabs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return (
    <nav
      aria-label={t('erp.reporting.tabs.label')}
      className="flex gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {REPORT_TABS.map((tab) => {
        const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`)
        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex h-[46px] shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(`erp.reporting.tabs.${tab.id}`)}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Settings' Integration frame with the reports' own tabs, and the read gate.
 *
 * A snapshot without `invoice.read` is refused here without asking the server. A snapshot that
 * could not be fetched is not treated as a refusal: the read is harmless, so it goes ahead and
 * the server's own 403 is what the reader sees.
 */
export function ReportingShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { entitlements, ready } = useEntitlements()
  const denied = ready && entitlements !== null && !hasPermission(entitlements, REPORT_READ)
  return (
    <SettingsShell group="integration">
      <SettingsHeader title={title} subtitle={subtitle} actions={actions} />
      <ReportTabs />
      {!ready ? <LoadingNotice /> : denied ? <PermissionDeniedNotice /> : children}
    </SettingsShell>
  )
}

export function ConnectionLabel({
  id,
  names,
}: {
  id: string | null
  names: Map<string, string> | null
}) {
  const { t } = useTranslation()
  // Bridge uploads and API pushes have no connection; that is the model, not missing data.
  if (id === null)
    return <span className="text-text-quaternary">{t('erp.reporting.noConnection')}</span>
  const name = names?.get(id)
  if (name) return <span className="break-words">{name}</span>
  return (
    <span title={id}>
      <Mono>{shortId(id)}</Mono>
    </span>
  )
}

export function DisplayStatusPill({ status }: { status: string }) {
  const code = useCode()
  return <Pill tone={displayStatusTone(status)} label={code('displayStatus', status)} />
}

export function TonePill({ tone, label }: { tone: Tone; label: string }) {
  return <Pill tone={tone} label={label} />
}

export function When({ at }: { at: string | null | undefined }) {
  const { i18n } = useTranslation()
  if (!at) return <span className="text-text-quaternary">—</span>
  return (
    <time dateTime={at} className="whitespace-nowrap tabular-nums">
      {formatInstant(at, i18n.language)}
    </time>
  )
}

/** A labelled dropdown filter. `''` is the "any" option. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  anyLabel: string
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={id} className="text-xs font-medium text-text-secondary">
        {label}
      </span>
      <Select
        value={value}
        onChange={onChange}
        options={[{ value: '', label: anyLabel }, ...options]}
        ariaLabel={label}
        compact
      />
    </div>
  )
}

/** The received-at window: two business-zone days, both included. */
export function WindowFields({
  from,
  to,
  onChange,
  problem,
  max,
}: {
  from: string
  to: string
  onChange: (next: { from: string; to: string }) => void
  problem: WindowProblem | null
  max?: string
}) {
  const { t } = useTranslation()
  const errorId = useId()
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-text-secondary">
        {t('erp.reporting.window.label')}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[170px] max-w-full">
          <DateField
            value={from}
            onChange={(value) => onChange({ from: value, to })}
            ariaLabel={t('erp.reporting.window.from')}
            ariaDescribedBy={problem ? errorId : undefined}
            ariaInvalid={problem !== null}
            max={max}
          />
        </div>
        <span aria-hidden="true" className="text-text-quaternary">
          –
        </span>
        <div className="w-[170px] max-w-full">
          <DateField
            value={to}
            onChange={(value) => onChange({ from, to: value })}
            ariaLabel={t('erp.reporting.window.to')}
            ariaDescribedBy={problem ? errorId : undefined}
            ariaInvalid={problem !== null}
            max={max}
          />
        </div>
      </div>
      {problem ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-700">
          {t(`erp.reporting.window.problem.${problem}`)}
        </p>
      ) : null}
    </fieldset>
  )
}

/**
 * The pages a has-more list can name: the ones seen, and the next while the server says there is
 * one. The route refuses pages past {@link REPORT_MAX_PAGE}, so the pager stops there.
 */
export function ReportPager({
  page,
  hasMore,
  onChange,
}: {
  /** One-based. */
  page: number
  hasMore: boolean
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const pageCount = Math.min(page + (hasMore ? 1 : 0), REPORT_MAX_PAGE + 1)
  if (pageCount <= 1) return null
  return (
    <Pager
      page={page}
      pageCount={pageCount}
      onChange={onChange}
      labels={{
        nav: t('erp.reporting.pager'),
        previous: t('common.previous'),
        next: t('common.next'),
      }}
    />
  )
}

/** A filtered list past its last page: say so, and offer the first, instead of an empty table. */
export function PastTheEnd({ onFirst }: { onFirst: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 pb-5 text-sm font-medium text-text-secondary">
      <span>{t('erp.reporting.pastTheEnd')}</span>
      <button type="button" onClick={onFirst} className="font-semibold text-primary-700 underline">
        {t('erp.reporting.firstPage')}
      </button>
    </div>
  )
}

/** The documents table, shared by the document list and a run's documents. */
export function DocumentsTable({
  items,
  names,
  empty,
}: {
  items: SourceDocumentDto[]
  names: Map<string, string> | null
  empty: string
}) {
  const { t } = useTranslation()
  const code = useCode()
  return (
    <RowsView>
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">{t('erp.reporting.documents.caption')}</caption>
        <thead>
          <tr className={THEAD_ROW}>
            <Th first>{t('erp.reporting.col.document')}</Th>
            <Th>{t('erp.reporting.col.status')}</Th>
            <Th>{t('erp.reporting.col.processing')}</Th>
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
                  {item.external_version ? (
                    <span className="ms-1 text-xs text-text-quaternary">
                      {t('erp.reporting.version', { version: item.external_version })}
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <DisplayStatusPill status={item.display_status} />
                </Td>
                <Td>
                  <span className="block">{code('processingState', item.processing_state)}</span>
                  {item.reason_code ? (
                    <span className="block text-xs text-text-quaternary">
                      {code('reason', item.reason_code)}
                    </span>
                  ) : null}
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
                  {item.delivery_state ? (
                    <span className="block text-xs text-text-quaternary">
                      {code('deliveryState', item.delivery_state)}
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

/** The connection filter: a list of names when they may be read, otherwise the id from the URL. */
export function ConnectionFilter({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  if (options.length > 0) {
    return (
      <FilterSelect
        label={t('erp.reporting.filters.connection')}
        anyLabel={t('erp.reporting.filters.any')}
        value={value}
        options={options}
        onChange={onChange}
      />
    )
  }
  if (!value) return null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">
        {t('erp.reporting.filters.connection')}
      </span>
      <div className="flex min-h-[42px] items-center gap-2">
        <span dir="ltr" className="truncate font-mono text-xs" title={value}>
          {value}
        </span>
        <button type="button" className={TEXT_BUTTON} onClick={() => onChange('')}>
          {t('erp.reporting.filters.clear')}
        </button>
      </div>
    </div>
  )
}
