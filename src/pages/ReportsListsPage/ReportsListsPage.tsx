import { useTranslation } from 'react-i18next'
import { ReportShell } from '../../components/reports'
import { LIST_SECTIONS, formatCount, type ExportList } from '../../lib/reports'
import invoiceIcon from '../../assets/reports/list-invoice.svg'
import customersIcon from '../../assets/reports/list-customers.svg'
import catalogIcon from '../../assets/reports/list-catalog.svg'
import paymentIcon from '../../assets/reports/list-payment.svg'
import billIcon from '../../assets/reports/list-bill.svg'
import supplierIcon from '../../assets/reports/list-supplier.svg'
import transferIcon from '../../assets/reports/list-transfer.svg'
import noteIcon from '../../assets/reports/list-note.svg'
import vatIcon from '../../assets/reports/list-vat.svg'
import tddIcon from '../../assets/reports/list-tdd.svg'
import agedIcon from '../../assets/reports/list-aged.svg'
import journalIcon from '../../assets/reports/list-journal.svg'
import excelIcon from '../../assets/reports/list-catalog.svg'

const ICONS: Record<ExportList['icon'], string> = {
  invoice: invoiceIcon,
  customers: customersIcon,
  catalog: catalogIcon,
  payment: paymentIcon,
  bill: billIcon,
  supplier: supplierIcon,
  transfer: transferIcon,
  note: noteIcon,
  vat: vatIcon,
  tdd: tddIcon,
  aged: agedIcon,
  journal: journalIcon,
}

/** The accountant's three exports sit on a warmer tile than the trading ones. */
const WARM_TILES = new Set<ExportList['icon']>(['vat', 'tdd', 'aged'])

function ListCard({ list }: { list: ExportList }) {
  const { t } = useTranslation()
  return (
    <article className="flex flex-col rounded-md bg-surface-card p-5">
      <div className="flex items-start gap-3.5">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-sm',
            WARM_TILES.has(list.icon) ? 'bg-pending-100' : 'bg-primary-50',
          ].join(' ')}
        >
          <img src={ICONS[list.icon]} alt="" className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
            {t(`reports.lists.items.${list.id}.title`)}
          </h3>
          <p className="mt-1.5 text-sm font-medium leading-[1.5] text-text-quaternary">
            {t(`reports.lists.items.${list.id}.detail`)}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-text-secondary tabular-nums">
              {t('reports.lists.rows', {
                count: list.rows,
                formattedCount: formatCount(list.rows),
              })}
            </span>
            <span className="text-xs font-medium text-text-quaternary">
              {t('reports.lists.columns', { count: list.columns })}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className="inline-flex h-[42px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={excelIcon} alt="" className="size-[18px] brightness-0 invert" />
          {t('reports.lists.downloadExcel')}
        </button>
        {(['csv', 'pdf'] as const).map((format) => (
          <button
            key={format}
            type="button"
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t(`reports.lists.${format}`)}
          </button>
        ))}
      </div>
    </article>
  )
}

export function ReportsListsPage() {
  const { t } = useTranslation()

  return (
    <ReportShell titleKey="reports.lists.title" subtitleKey="reports.lists.subtitle">
      {LIST_SECTIONS.map((section) => (
        <section key={section.id} className="flex flex-col gap-4">
          <h2 className="text-xl font-medium leading-[1.2] text-text-primary">
            {t(`reports.lists.sections.${section.id}`)}
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {section.lists.map((list) => (
              <ListCard key={list.id} list={list} />
            ))}
          </div>
        </section>
      ))}
    </ReportShell>
  )
}
