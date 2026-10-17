import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Pager, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  WAITING_PAGE_SIZE,
  loadWaitingDocuments,
  waitingDocumentsPath,
  type WaitingDocumentDto,
  type WaitingPageDto,
  type WaitingReason,
} from '../../api/expenditure/waitingDocuments'
import {
  reasonsPresent,
  waitingReasonExplanationKey,
  waitingReasonKey,
  waitingTypeKey,
  waitingWayOut,
} from '../../lib/waitingDocuments'
import { formatCount, formatDate, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

/** The reason badge: the Bills list's 4 px badge, in the colour its state reads as. */
const REASON_STYLE: Record<WaitingReason, string> = {
  NO_DOCUMENTS_LEFT: 'bg-pending-100 text-pending-700',
  SUBSCRIPTION_ENDED: 'bg-danger-100 text-danger-700',
  COMPANY_NOT_ACTIVE: 'bg-surface-background text-text-tertiary',
}

const OUTLINE_LINK =
  'inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25'

/**
 * Expenditure › Bills › Waiting supplier documents (`GET /v1/inbound-invoices/waiting`). No Figma
 * frame: built to the house standard from the Bills list it sits under (breadcrumb as on Upload a
 * bill, the list's table and badges).
 *
 * Business Rules AL-7: at 0 left the supplier documents keep arriving and are reported to the Tax
 * Authority, but are held. The company sees that they arrived (supplier, number, date and a count)
 * and cannot open or process them until the reason is gone; each reason says what opens them and,
 * to whoever may act on it, where. A row is not a link: the document answers 404 until released.
 */
export function WaitingDocumentsPage() {
  return (
    <AppShell>
      <WaitingScreen />
    </AppShell>
  )
}

function WaitingScreen() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const path = waitingDocumentsPath(pageNumber - 1)
  const list = useApiRead<WaitingPageDto>(path, () => loadWaitingDocuments(path))
  const count = (value: number) => formatCount(value, i18n.language)

  const header = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/expenditure/bills"
          className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
        >
          {t('billDetail.breadcrumb')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t('waitingDocuments.breadcrumb')}
        </span>
      </div>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('waitingDocuments.title')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {t('waitingDocuments.subtitle')}
        </p>
      </div>
    </>
  )

  if (list.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {header}
        {list.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={list.read.error} retry={list.retry} />
        )}
      </div>
    )
  }

  const data = list.read.data
  const pageCount = Math.max(1, Math.ceil(data.total / (data.pageSize || WAITING_PAGE_SIZE)))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}
      <section
        aria-labelledby="waiting-count"
        className="flex flex-col gap-5 rounded-md bg-surface-card p-5"
      >
        <div>
          <h2 id="waiting-count" className="text-lg font-semibold leading-[1.2] text-text-primary">
            {data.total === 0
              ? t('waitingDocuments.noneTitle')
              : t('waitingDocuments.countTitle', { count: data.total, n: count(data.total) })}
          </h2>
          <p className="mt-1 max-w-[720px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {t(data.total === 0 ? 'waitingDocuments.noneBody' : 'waitingDocuments.reported')}
          </p>
        </div>
        {reasonsPresent(data.byReason).map(({ reason, count: held }) => (
          <ReasonCallout key={reason} reason={reason} count={held} />
        ))}
      </section>

      {data.total > 0 ? (
        <section className="overflow-hidden rounded-md bg-surface-card">
          <WaitingTable items={data.items} />
          {pageCount > 1 ? (
            <div className="flex justify-end px-6 py-4">
              <Pager
                page={pageNumber}
                pageCount={pageCount}
                onChange={(next) =>
                  setParams(next <= 1 ? {} : { page: String(next) }, { replace: true })
                }
                labels={{
                  nav: t('waitingDocuments.pager.nav'),
                  previous: t('waitingDocuments.pager.previous'),
                  next: t('waitingDocuments.pager.next'),
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

/**
 * One reason, its count, what opens the documents and, for someone who can act on it, the way
 * there. Someone who cannot is told who can, rather than shown a link to "no access".
 */
function ReasonCallout({ reason, count }: { reason: WaitingReason; count: number }) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const wayOut = waitingWayOut(reason)
  const mayAct = wayOut !== null && can(session, wayOut.permission)
  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-3 rounded-sm px-4 py-3',
        reason === 'COMPANY_NOT_ACTIVE'
          ? 'bg-surface-background text-text-secondary'
          : 'bg-pending-100 text-pending-700',
      ].join(' ')}
    >
      <p className="min-w-0 flex-1 text-sm font-medium leading-[1.6] md:min-w-[320px]">
        <b className="font-semibold">
          {t(waitingReasonKey(reason))}: {formatCount(count, i18n.language)}
        </b>{' '}
        {t(waitingReasonExplanationKey(reason))}
        {wayOut !== null && !mayAct ? ` ${t('waitingDocuments.askAdministrator')}` : null}
      </p>
      {wayOut !== null && mayAct ? (
        <Link to={wayOut.to} className={OUTLINE_LINK}>
          {t(wayOut.labelKey)}
        </Link>
      ) : null}
    </div>
  )
}

function WaitingTable({ items }: { items: WaitingDocumentDto[] }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const notStated = <span className="text-text-quaternary">{t('waitingDocuments.notStated')}</span>
  return (
    <RowsView>
      <table className="w-full min-w-[880px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="px-5 py-2.5 text-start font-semibold">
              {t('waitingDocuments.col.supplier')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('waitingDocuments.col.number')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('waitingDocuments.col.type')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('waitingDocuments.col.issued')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('waitingDocuments.col.received')}
            </th>
            <th className="px-2 py-2.5 pe-5 text-start font-semibold">
              {t('waitingDocuments.col.reason')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-surface-background last:border-0">
              <td className="px-5 py-4 align-top">
                <p className="text-sm font-semibold text-text-primary">
                  {item.supplierName ?? notStated}
                </p>
                {item.supplierParticipantId ? (
                  <p
                    dir="ltr"
                    className="mt-0.5 text-xs font-medium text-text-quaternary rtl:text-end"
                  >
                    {item.supplierParticipantId}
                  </p>
                ) : null}
              </td>
              <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                {item.invoiceNumber ? <span dir="ltr">{item.invoiceNumber}</span> : notStated}
              </td>
              <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                {t(waitingTypeKey(item.documentType))}
              </td>
              <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                {item.issueDate ? formatDate(item.issueDate, language) : notStated}
              </td>
              <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                {formatInstant(item.receivedAt, language)}
              </td>
              <td className="px-2 py-4 pe-5 align-top">
                <span
                  className={[
                    'inline-flex h-[24px] items-center rounded-[4px] px-2 text-xs font-semibold',
                    REASON_STYLE[item.reason],
                  ].join(' ')}
                >
                  {t(waitingReasonKey(item.reason))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RowsView>
  )
}
