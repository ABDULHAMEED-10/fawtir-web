import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReportShell, useReportPeriod } from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  REPORT_LISTS_PATH,
  catalogueHref,
  downloadReport,
  loadListsCatalogue,
  type ListsCatalogueDto,
  type ListsDatasetDto,
} from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import { periodWindows } from '../../lib/reportPeriod'
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

type SectionId = 'sales' | 'purchases' | 'accountant' | 'more'

/**
 * The twelve lists the frame draws, in its order, each with the catalogue keys it answers to.
 * The server's catalogue decides what can be downloaded; this decides where a dataset sits and
 * what it is called in both languages.
 */
const FRAME_LISTS: {
  id: string
  section: SectionId
  icon: string
  tile: string
  keys: string[]
}[] = [
  {
    id: 'everyInvoice',
    section: 'sales',
    icon: invoiceIcon,
    tile: 'bg-primary-50',
    keys: ['invoices', 'every-invoice', 'authored-invoices'],
  },
  {
    id: 'customers',
    section: 'sales',
    icon: customersIcon,
    tile: 'bg-primary-50',
    keys: ['customers'],
  },
  {
    id: 'catalogLines',
    section: 'sales',
    icon: catalogIcon,
    tile: 'bg-primary-50',
    keys: ['catalog-lines', 'catalogue-lines', 'invoice-lines', 'lines'],
  },
  {
    id: 'paymentsReceived',
    section: 'sales',
    icon: paymentIcon,
    tile: 'bg-success-100',
    keys: ['payments-received', 'receipts'],
  },
  {
    id: 'everyBill',
    section: 'purchases',
    icon: billIcon,
    tile: 'bg-surface-background',
    keys: ['bills', 'every-bill'],
  },
  {
    id: 'suppliers',
    section: 'purchases',
    icon: supplierIcon,
    tile: 'bg-surface-background',
    keys: ['suppliers'],
  },
  {
    id: 'paymentsMade',
    section: 'purchases',
    icon: transferIcon,
    tile: 'bg-surface-background',
    keys: ['payments-made', 'payment-runs'],
  },
  {
    id: 'creditDebitNotes',
    section: 'purchases',
    icon: noteIcon,
    tile: 'bg-pending-100',
    keys: ['credit-debit-notes', 'notes', 'supplier-notes'],
  },
  {
    id: 'vatLedger',
    section: 'accountant',
    icon: vatIcon,
    tile: 'bg-pending-100',
    keys: ['vat-ledger', 'vat'],
  },
  {
    id: 'tddRegister',
    section: 'accountant',
    icon: tddIcon,
    tile: 'bg-success-100',
    keys: ['tax-document-register', 'tdd-register'],
  },
  {
    id: 'agedDebtors',
    section: 'accountant',
    icon: agedIcon,
    tile: 'bg-primary-50',
    keys: ['aged-debtors', 'aged-debtors-creditors', 'aging'],
  },
  {
    id: 'journal',
    section: 'accountant',
    icon: journalIcon,
    tile: 'bg-surface-background',
    keys: ['journal', 'journal-export'],
  },
]

const SECTIONS: SectionId[] = ['sales', 'purchases', 'accountant', 'more']

type Card = {
  key: string
  frameId: string | null
  icon: string
  tile: string
  dataset: ListsDatasetDto | null
}

/**
 * Reports › Lists (Figma 154:107791).
 *
 * The frame's three sections of four lists, each downloadable in Excel, CSV and PDF. **What can
 * be downloaded comes from the server's catalogue** (`/reports/lists`), which names each
 * dataset's permission, formats, URLs and parameters; the frame's list places and names them. A
 * frame list the catalogue does not publish keeps its card with its buttons off, and a dataset
 * the frame does not know appears under "More" in the server's own words, so neither side can
 * quietly lose one.
 *
 * A dataset the reader may not download is still shown, with the permission it wants: hiding it
 * would leave someone asking a colleague for a file nobody can see exists.
 */
export function ReportsListsPage() {
  const { t } = useTranslation()
  const catalogue = useApiRead<ListsCatalogueDto>(REPORT_LISTS_PATH, loadListsCatalogue)

  return (
    <ReportShell titleKey="reports.lists.title" subtitleKey="reports.lists.subtitle">
      {catalogue.read.status === 'loading' ? <LoadingNotice /> : null}
      {catalogue.read.status === 'failed' ? (
        <ApiReadFailure error={catalogue.read.error} retry={catalogue.retry} />
      ) : null}

      {catalogue.read.status === 'ready' ? (
        <Sections datasets={catalogue.read.data.datasets} t={t} />
      ) : null}
    </ReportShell>
  )
}

function Sections({
  datasets,
  t,
}: {
  datasets: ListsDatasetDto[]
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const sections = useMemo(() => {
    const claimed = new Set<string>()
    const bySection = new Map<SectionId, Card[]>(SECTIONS.map((id) => [id, []]))
    for (const list of FRAME_LISTS) {
      const dataset = datasets.find((entry) => list.keys.includes(entry.key)) ?? null
      if (dataset) claimed.add(dataset.key)
      bySection.get(list.section)!.push({
        key: list.id,
        frameId: list.id,
        icon: list.icon,
        tile: list.tile,
        dataset,
      })
    }
    for (const dataset of datasets) {
      if (claimed.has(dataset.key)) continue
      bySection.get('more')!.push({
        key: dataset.key,
        frameId: null,
        icon: journalIcon,
        tile: 'bg-surface-background',
        dataset,
      })
    }
    return SECTIONS.map((id) => ({ id, cards: bySection.get(id)! })).filter(
      (section) => section.cards.length > 0,
    )
  }, [datasets])

  return (
    <>
      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-4">
          <h2 className="mt-2 text-xl font-medium leading-[1.2] text-text-primary">
            {t(`reports.lists.sections.${section.id}`)}
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {section.cards.map((card) => (
              <ListCard key={card.key} card={card} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** The catalogue's href, carrying the header pill's window when the dataset takes one. */
function hrefFor(dataset: ListsDatasetDto, href: string, span: { from: string; to: string }) {
  const path = catalogueHref(href)
  if (!dataset.parameters.includes('from') || !dataset.parameters.includes('to')) return path
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('from', span.from)
  params.set('to', span.to)
  return `${base}?${params.toString()}`
}

function ListCard({ card }: { card: Card }) {
  const { t } = useTranslation()
  const session = useSession()
  const [period] = useReportPeriod()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const dataset = card.dataset
  const allowed = dataset ? can(session, dataset.permission) : true

  const hrefOf = (format: 'csv' | 'xlsx') => {
    if (!dataset || !dataset.formats.includes(format)) return null
    return format === 'csv' ? dataset.hrefCsv : dataset.hrefXlsx
  }

  const download = async (format: 'csv' | 'xlsx') => {
    const href = hrefOf(format)
    if (!dataset || !href) return
    setBusy(format)
    setFailed(false)
    try {
      const span = periodWindows(period, new Date()).current
      saveDownload(await downloadReport(hrefFor(dataset, href, span)), `${dataset.key}.${format}`)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  // A frame list reads in the frame's words, in both languages; a dataset the frame does not
  // know reads in the server's, rather than as a missing key.
  const title = card.frameId ? t(`reports.lists.items.${card.frameId}.title`) : dataset?.title
  const detail = card.frameId
    ? t(`reports.lists.items.${card.frameId}.detail`)
    : dataset?.description

  const secondary =
    'inline-flex h-[34px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <article className="flex min-w-0 flex-col rounded-md bg-surface-card p-5">
      <div className="flex items-start gap-3.5">
        <span
          className={[
            'flex size-[42px] shrink-0 items-center justify-center rounded-sm',
            card.tile,
          ].join(' ')}
        >
          <img src={card.icon} alt="" className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-medium leading-[1.2] text-text-primary">{title}</h3>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.5] text-text-quaternary">
            {detail}
          </p>
          {/* TODO(backend): row and column counts per dataset (asks 1.18); the frame's
              "1,624 rows - 18 columns" line carries the filters it takes instead. */}
          <p className="mt-2 text-xs font-medium text-text-quaternary">
            {!dataset
              ? t('reports.lists.notPublished')
              : dataset.parameters.length > 0
                ? t('reports.lists.filters', { list: dataset.parameters.join(', ') })
                : t('reports.lists.wholeList')}
          </p>

          {allowed ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null || !hrefOf('xlsx')}
                onClick={() => void download('xlsx')}
                className="inline-flex h-[34px] items-center gap-2 rounded-sm bg-primary-700 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <img src={catalogIcon} alt="" className="size-4 brightness-0 invert" />
                {busy === 'xlsx' ? t('common.saving') : t('reports.lists.downloadExcel')}
              </button>
              <button
                type="button"
                disabled={busy !== null || !hrefOf('csv')}
                onClick={() => void download('csv')}
                className={secondary}
              >
                {busy === 'csv' ? t('common.saving') : t('reports.lists.csv')}
              </button>
              {/* TODO(backend): a PDF rendering of each dataset (asks 1.19). */}
              <button
                type="button"
                disabled
                title={t('reports.lists.pdfPending')}
                className={secondary}
              >
                {t('reports.lists.pdf')}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-xs font-medium text-text-quaternary">
              {t('reports.lists.needsPermission', { permission: dataset?.permission })}
            </p>
          )}

          {failed ? (
            <p role="alert" className="mt-2 text-sm font-medium text-warning-700">
              {t('reports.controls.exportFailed')}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
