import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { formatAmount, formatDate } from '../../lib/format'
import { NOTE_ROUTES } from '../../lib/salesNote'
import type { RecentInvoiceDto } from '../../api/reports/dashboard'
import { DashboardCard } from './DashboardCard'
import { toNumber, type TileView } from './dashboardData'

type RowStatus =
  | 'draft'
  | 'cancelled'
  | 'issued'
  | 'toSend'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'notSent'
  | 'undelivered'

const STATUS_STYLES: Record<RowStatus, { bg: string; dot: string; text: string }> = {
  accepted: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
  rejected: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  notSent: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  undelivered: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  toSend: { bg: 'bg-primary-50', dot: 'bg-primary-700', text: 'text-primary-800' },
  sent: { bg: 'bg-primary-50', dot: 'bg-primary-700', text: 'text-primary-800' },
  issued: { bg: 'bg-primary-50', dot: 'bg-primary-700', text: 'text-primary-800' },
  draft: { bg: 'bg-neutral-25', dot: 'bg-text-quaternary', text: 'text-text-quaternary' },
  cancelled: { bg: 'bg-neutral-25', dot: 'bg-text-quaternary', text: 'text-text-quaternary' },
}

/**
 * Only what the row itself states: the buyer's answer when there is one, else whether it went out.
 * Nothing here says "reported": the row's TDD status is not read, and the frame's "Reported" was
 * a sample label.
 */
function statusOf(row: RecentInvoiceDto): RowStatus {
  if (row.state === 'DRAFT') return 'draft'
  // Read ahead of the dispatch: a cancelled invoice's dispatch can still say DEAD_LETTERED or
  // nothing, which painted it "Not sent" or "Issued" (TEST verification 2026-10-29).
  if (row.state === 'CANCELLED' || row.state === 'DISCARDED') return 'cancelled'
  if (row.invoiceAck === 'RE') return 'rejected'
  if (row.invoiceAck === 'AP' || row.invoiceAck === 'AB') return 'accepted'
  if (row.dispatch === 'DEAD_LETTERED') return 'notSent'
  // DISPATCHED is only the hand-over to the Peppol queue: it painted "Sent" over an invoice the
  // detail page reads as queued and the list as "To be sent" (A-4, local E2E 2026-10-29). The
  // submission's own state says whether anything left: SENT is the receiving access point's
  // receipt, and before it (QUEUED, SENDING, no submission yet) the invoice is still to be sent.
  if (row.transportState !== null && Object.hasOwn(TRANSPORT_STATUS, row.transportState))
    return TRANSPORT_STATUS[row.transportState]
  if (row.dispatch === 'DISPATCHED' || row.dispatch === 'PENDING') return 'toSend'
  return 'issued'
}

/** The Peppol submission states (`SubmissionState`) that settle the pill on their own. */
const TRANSPORT_STATUS: Record<string, RowStatus> = {
  SENT: 'sent',
  DELIVERED: 'accepted',
  DELIVERED_UNCONFIRMED: 'accepted',
  UNDELIVERABLE: 'undelivered',
  C4_UNREACHABLE: 'undelivered',
}

/** The list's "To be sent" is the same fact, so it is the same words. */
const STATUS_KEYS: Record<RowStatus, string> = {
  draft: 'dashboard.invoices.status.draft',
  cancelled: 'dashboard.invoices.status.cancelled',
  issued: 'dashboard.invoices.status.issued',
  toSend: 'invoicesPage.payment.toSend',
  sent: 'dashboard.invoices.status.sent',
  accepted: 'dashboard.invoices.status.accepted',
  rejected: 'dashboard.invoices.status.rejected',
  notSent: 'dashboard.invoices.status.notSent',
  undelivered: 'dashboard.invoices.status.undelivered',
}

/** A note opens on its own page, which shows the invoice it corrects, as from the invoices list. */
function documentPath(row: RecentInvoiceDto): string {
  return row.invoiceType === 'CREDIT_NOTE' || row.invoiceType === 'DEBIT_NOTE'
    ? `${NOTE_ROUTES[row.invoiceType]}/${row.id}`
    : `/invoices/${row.id}`
}

export function RecentInvoices({ invoices }: { invoices: TileView<RecentInvoiceDto[]> }) {
  const { t, i18n } = useTranslation()

  return (
    <DashboardCard title={t('dashboard.invoices.title')} bodyClassName="p-0">
      {invoices.kind !== 'ok' || invoices.data.length === 0 ? (
        <p className="p-5 text-sm font-medium text-text-quaternary">
          {invoices.kind === 'loading'
            ? t('dashboard.loading')
            : invoices.kind === 'unavailable'
              ? t('dashboard.notAvailableYet')
              : t('dashboard.invoices.none')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-start">
            <thead>
              <tr className="border-b border-border-subtle text-xs font-semibold uppercase tracking-wide text-text-quaternary">
                <th className="px-5 py-3 font-semibold">{t('dashboard.invoices.colInvoice')}</th>
                <th className="px-5 py-3 font-semibold">{t('dashboard.invoices.colCustomer')}</th>
                <th className="px-5 py-3 font-semibold">{t('dashboard.invoices.colStatus')}</th>
                <th className="px-5 py-3 font-semibold">{t('dashboard.invoices.colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.data.map((row) => {
                const status = statusOf(row)
                const style = STATUS_STYLES[status]
                return (
                  <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-5 py-4 text-base font-medium text-text-primary">
                      <Link to={documentPath(row)} className="hover:text-primary-700">
                        {row.invoiceNumber ?? t('dashboard.invoices.noNumber')}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-base font-medium text-text-primary">
                        {row.customerName ?? '—'}
                      </p>
                      {row.issueDate ? (
                        <p className="text-sm font-medium text-text-quaternary">
                          {formatDate(row.issueDate, i18n.language)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={[
                          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
                          style.bg,
                          style.text,
                        ].join(' ')}
                      >
                        <span className={['size-2 rounded-full', style.dot].join(' ')} />
                        {t(STATUS_KEYS[status])}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {/* A draft has no settled total yet; the server's 0 read as a priced 0.000. */}
                      {status === 'draft' ? (
                        <span className="text-base font-semibold text-text-primary">—</span>
                      ) : row.currency === 'OMR' ? (
                        <OmAmount
                          size="sm"
                          amount={formatAmount(toNumber(row.total), 'OMR', i18n.language)}
                          amountClassName="text-base font-semibold text-text-primary"
                        />
                      ) : (
                        <span className="text-base font-semibold text-text-primary">
                          {row.currency} {formatAmount(toNumber(row.total), row.currency, i18n.language)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  )
}
