import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { RECENT_INVOICES, type InvoiceStatus } from '../../lib/dashboard'
import { DashboardCard } from './DashboardCard'

const STATUS_STYLES: Record<
  InvoiceStatus,
  { bg: string; dot: string; text: string; labelKey: string }
> = {
  reported: {
    bg: 'bg-success-100',
    dot: 'bg-success-700',
    text: 'text-success-700',
    labelKey: 'dashboard.invoices.status.reported',
  },
  rejected: {
    bg: 'bg-danger-100',
    dot: 'bg-danger-700',
    text: 'text-danger-700',
    labelKey: 'dashboard.invoices.status.rejected',
  },
  sent: {
    bg: 'bg-primary-50',
    dot: 'bg-primary-700',
    text: 'text-primary-800',
    labelKey: 'dashboard.invoices.status.sent',
  },
  draft: {
    bg: 'bg-neutral-25',
    dot: 'bg-text-quaternary',
    text: 'text-text-quaternary',
    labelKey: 'dashboard.invoices.status.draft',
  },
}

export function RecentInvoices() {
  const { t } = useTranslation()

  return (
    <DashboardCard title={t('dashboard.invoices.title')} bodyClassName="p-0">
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
            {RECENT_INVOICES.map((row) => {
              const status = STATUS_STYLES[row.status]
              return (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-5 py-4 text-base font-medium text-text-primary">
                    <Link to={`/invoices/${row.id}`} className="hover:text-primary-700">
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-base font-medium text-text-primary">{row.customer}</p>
                    <p className="text-sm font-medium text-text-quaternary">{row.meta}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
                        status.bg,
                        status.text,
                      ].join(' ')}
                    >
                      <span className={['size-2 rounded-full', status.dot].join(' ')} />
                      {t(status.labelKey)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <OmAmount
                      size="sm"
                      amount={row.amount}
                      amountClassName="text-base font-semibold text-text-primary"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  )
}
