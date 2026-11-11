import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Pager, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  REJECTED_PAGE_SIZE,
  loadRejectedDocuments,
  rejectedDocumentsPath,
  type RejectedDocumentDto,
  type RejectedPageDto,
} from '../../api/expenditure/rejectedDocuments'
import { rejectedTypeKey, rejectionDelivery } from '../../lib/rejectedDocuments'
import { formatCount, formatInstant } from '../../lib/format'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * Expenditure › Bills › Rejected by Fawtir (`GET /v1/inbound-invoices/rejected`, batch 39 EXP).
 * No Figma frame: built from the Waiting supplier documents page beside it.
 *
 * Before this a refusal on arrival was visible only to the sender, so "my supplier says they sent
 * it" had no answer on screen. These are not bills: nothing here is owed, so the page offers no
 * pay, approve or hold, and a row is not a link because nothing else answers to its id. A document
 * held for an identity conflict is not an RE and is never listed here.
 */
export function RejectedDocumentsPage() {
  return (
    <AppShell>
      <RejectedScreen />
    </AppShell>
  )
}

function RejectedScreen() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const path = rejectedDocumentsPath(pageNumber - 1)
  const list = useApiRead<RejectedPageDto>(path, () => loadRejectedDocuments(path))

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
          {t('rejectedDocuments.breadcrumb')}
        </span>
      </div>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('rejectedDocuments.title')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {t('rejectedDocuments.subtitle')}
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
  const pageCount = Math.max(1, Math.ceil(data.total / (data.pageSize || REJECTED_PAGE_SIZE)))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}
      <section aria-labelledby="rejected-count" className="rounded-md bg-surface-card p-5">
        <h2 id="rejected-count" className="text-lg font-semibold leading-[1.2] text-text-primary">
          {data.total === 0
            ? t('rejectedDocuments.noneTitle')
            : t('rejectedDocuments.countTitle', {
                count: data.total,
                n: formatCount(data.total, i18n.language),
              })}
        </h2>
        <p className="mt-1 max-w-[720px] text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(data.total === 0 ? 'rejectedDocuments.noneBody' : 'rejectedDocuments.explain')}
        </p>
      </section>

      {data.total > 0 ? (
        <section className="overflow-hidden rounded-md bg-surface-card">
          <RejectedTable items={data.items} />
          {pageCount > 1 ? (
            <div className="flex justify-end px-6 py-4">
              <Pager
                page={pageNumber}
                pageCount={pageCount}
                onChange={(next) =>
                  setParams(next <= 1 ? {} : { page: String(next) }, { replace: true })
                }
                labels={{
                  nav: t('rejectedDocuments.pager.nav'),
                  previous: t('rejectedDocuments.pager.previous'),
                  next: t('rejectedDocuments.pager.next'),
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function RejectedTable({ items }: { items: RejectedDocumentDto[] }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const notStated = <span className="text-text-quaternary">{t('rejectedDocuments.notStated')}</span>
  const when = (iso: string | null) => (iso ? formatInstant(iso, language) : notStated)
  return (
    <RowsView>
      <table className="w-full min-w-[880px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="px-5 py-2.5 text-start font-semibold">
              {t('rejectedDocuments.col.sender')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('rejectedDocuments.col.type')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('rejectedDocuments.col.received')}
            </th>
            <th className="px-2 py-2.5 text-start font-semibold">
              {t('rejectedDocuments.col.rejected')}
            </th>
            <th className="px-2 py-2.5 pe-5 text-start font-semibold">
              {t('rejectedDocuments.col.delivery')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const delivery = rejectionDelivery(item)
            return (
              <tr
                key={item.messageId}
                data-testid="rejected-row"
                className="border-b border-surface-background last:border-0"
              >
                <td className="px-5 py-4 align-top">
                  <p dir="ltr" className="text-sm font-semibold text-text-primary rtl:text-end">
                    {item.senderParticipantId}
                  </p>
                </td>
                <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                  {t(rejectedTypeKey(item))}
                </td>
                <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                  {when(item.receivedAt)}
                </td>
                <td className="px-2 py-4 align-top text-sm font-medium text-text-secondary">
                  {when(item.rejectedAt)}
                </td>
                <td
                  data-testid="rejected-delivery"
                  className="px-2 py-4 pe-5 align-top text-sm font-medium text-text-secondary"
                >
                  {t(
                    delivery.key,
                    delivery.date ? { date: formatInstant(delivery.date, language) } : undefined,
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}
