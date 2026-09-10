import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, withRial } from '../../components/ui'
import {
  RUN_INVOICES,
  RUN_SUPPLIERS,
  type RunInvoice,
  type RunInvoiceSource,
} from '../../lib/payments'
import printIcon from '../../assets/invoice-details/print.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import viewIcon from '../../assets/actions/view.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import statementIcon from '../../assets/actions/statement.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const SOURCE_STYLES: Record<RunInvoiceSource, { bg: string; fg: string; labelKey: string }> = {
  peppol: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'billsPage.source.peppol' },
  uploaded: { bg: 'bg-[#e3e4ea]', fg: 'text-[#474a5e]', labelKey: 'billsPage.source.uploaded' },
  scanned: { bg: 'bg-pending-100', fg: 'text-pending-700', labelKey: 'billsPage.source.scanned' },
}

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5]

function Amount({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
      <span className="text-sm font-semibold text-text-secondary">{value}</span>
    </span>
  )
}

/** The supplier's document, drawn from what was recorded off it. */
function InvoiceSheet({ invoice, zoom }: { invoice: RunInvoice; zoom: number }) {
  const { t } = useTranslation()
  const supplier = RUN_SUPPLIERS.find((s) => s.id === invoice.supplierId)!
  const sheet = invoice.sheet

  return (
    <article
      style={{ width: 480 * zoom, fontSize: 10 * zoom }}
      className="shrink-0 rounded-sm bg-white shadow-card"
    >
      <div style={{ padding: 26 * zoom }}>
        <header className="flex items-start justify-between gap-6">
          <div>
            <p
              style={{ fontSize: 15 * zoom }}
              className="font-bold leading-[1.2] text-text-primary"
            >
              {supplier.name}
            </p>
            {[sheet.address, `VAT ${sheet.vat}`, `CR ${sheet.cr}`].map((line) => (
              <p
                key={line}
                style={{ fontSize: 9 * zoom, marginTop: 4 * zoom }}
                className="font-medium leading-[1.3] text-text-tertiary"
              >
                {line}
              </p>
            ))}
          </div>
          <div className="text-end">
            <p
              style={{ fontSize: 13 * zoom }}
              className="font-bold uppercase leading-[1.2] text-text-primary"
            >
              {t('paymentsInvoices.taxInvoice')}
            </p>
            {[
              `No. ${invoice.reference}`,
              `${t('paymentsInvoices.issued')} ${sheet.issued}`,
              `${t('paymentsInvoices.due')} ${sheet.due}`,
            ].map((line) => (
              <p
                key={line}
                style={{ fontSize: 9 * zoom, marginTop: 4 * zoom }}
                className="font-medium leading-[1.3] text-text-tertiary"
              >
                {line}
              </p>
            ))}
          </div>
        </header>

        <div
          style={{ marginTop: 20 * zoom, paddingTop: 14 * zoom }}
          className="grid grid-cols-2 gap-6 border-t border-[#151c2d]"
        >
          <div>
            <p
              style={{ fontSize: 7.5 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
              className="font-semibold uppercase text-text-quaternary"
            >
              {t('paymentsInvoices.billedTo')}
            </p>
            {['Al Bahja Coffee LLC', 'Souq Street, Nizwa', 'VAT OM1100392000'].map((line) => (
              <p
                key={line}
                style={{ fontSize: 9 * zoom, marginTop: 4 * zoom }}
                className="font-medium leading-[1.3] text-text-tertiary"
              >
                {line}
              </p>
            ))}
          </div>
          <div>
            <p
              style={{ fontSize: 7.5 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
              className="font-semibold uppercase text-text-quaternary"
            >
              {t('paymentsInvoices.against')}
            </p>
            {[
              `${t('paymentsInvoices.yourOrder')} ${sheet.order}`,
              `${t('paymentsInvoices.delivered')} ${sheet.delivered}`,
              `${t('paymentsInvoices.receivedOn')} ${sheet.receipt}`,
            ].map((line) => (
              <p
                key={line}
                style={{ fontSize: 9 * zoom, marginTop: 4 * zoom }}
                className="font-medium leading-[1.3] text-text-tertiary"
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        <table style={{ marginTop: 18 * zoom }} className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-[#eceef2]">
              {['description', 'qty', 'unit', 'vat', 'amount'].map((key, index) => (
                <th
                  key={key}
                  style={{ fontSize: 7.5 * zoom, paddingBottom: 6 * zoom }}
                  className={[
                    'font-semibold uppercase leading-[1.2] text-text-quaternary',
                    index === 0 ? 'text-start' : 'text-end',
                  ].join(' ')}
                >
                  {t(`paymentsInvoices.col.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.lines.map((line) => (
              <tr key={line.description} className="border-b border-[#f3f3f3]">
                <td
                  style={{ fontSize: 9 * zoom, paddingBlock: 8 * zoom }}
                  className="font-medium leading-[1.3] text-text-secondary"
                >
                  {line.description}
                </td>
                {[line.qty, line.unit, line.vat, line.amount].map((cell, index) => (
                  <td
                    key={index}
                    style={{ fontSize: 9 * zoom, paddingBlock: 8 * zoom }}
                    className="text-end font-medium text-text-secondary"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14 * zoom }} className="flex justify-end">
          <div style={{ width: '55%' }}>
            {[
              [t('paymentsInvoices.net'), invoice.net],
              [t('paymentsInvoices.vatRate'), invoice.vat],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ fontSize: 9 * zoom, paddingBlock: 5 * zoom }}
                className="flex justify-between font-medium text-text-tertiary"
              >
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div
              style={{ fontSize: 11.5 * zoom, marginTop: 6 * zoom, paddingTop: 8 * zoom }}
              className="flex justify-between border-t border-[#eceef2] font-bold text-text-primary"
            >
              <span>{t('paymentsInvoices.total')}</span>
              <span>{invoice.amount}</span>
            </div>
          </div>
        </div>

        <div
          style={{ marginTop: 20 * zoom, paddingTop: 14 * zoom }}
          className="border-t border-[#eceef2]"
        >
          <p
            style={{ fontSize: 7.5 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
            className="font-semibold uppercase text-text-quaternary"
          >
            {t('paymentsInvoices.payment')}
          </p>
          <p
            style={{ fontSize: 9 * zoom, marginTop: 5 * zoom }}
            className="font-medium leading-[1.4] text-text-tertiary"
          >
            {sheet.paymentTerms}{' '}
            <span className="font-bold text-text-primary">{sheet.paymentBold}</span>
          </p>
          <p
            style={{ fontSize: 9 * zoom, marginTop: 3 * zoom }}
            className="font-medium leading-[1.4] text-text-tertiary"
          >
            {sheet.bank}
          </p>
        </div>
      </div>
    </article>
  )
}

export function PaymentRunInvoicesPage() {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState(RUN_INVOICES[0].id)
  const [zoomIndex, setZoomIndex] = useState(1)
  const [removed, setRemoved] = useState<string[]>([])

  const invoices = useMemo(
    () => RUN_INVOICES.filter((invoice) => !removed.includes(invoice.id)),
    [removed],
  )
  const index = Math.max(
    0,
    invoices.findIndex((invoice) => invoice.id === activeId),
  )
  const invoice = invoices[index] ?? invoices[0]
  const zoom = ZOOM_STEPS[zoomIndex]

  const go = (step: number) => {
    const next = invoices[index + step]
    if (next) setActiveId(next.id)
  }

  /**
   * Arrow keys move through the pile — the footer tells the user they can, so they have to.
   * Ignored while a field has focus so typing a value never jumps the document.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Suppliers that still have an invoice in the run, in the order the design groups them. */
  const groups = RUN_SUPPLIERS.map((supplier) => ({
    supplier,
    items: invoices.filter((item) => item.supplierId === supplier.id),
  })).filter((group) => group.items.length > 0)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/expenditure/payments"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
            >
              {t('paymentsPage.breadcrumb')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <Link
              to="/expenditure/payments"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
            >
              PR-0014
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <span className="text-2xl font-medium leading-[1.2] text-text-primary">
              {t('paymentsInvoices.breadcrumb')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('paymentsInvoices.title')}
            </h1>
            <div className="ms-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
              >
                <img src={printIcon} alt="" className="size-5" />
                {t('paymentsInvoices.printAll')}
              </button>
              <button
                type="button"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
              >
                <img src={downloadIcon} alt="" className="size-5" />
                {t('paymentsInvoices.downloadAll')}
              </button>
              <ActionMenu
                label={t('paymentsInvoices.moreActions')}
                items={[
                  {
                    id: 'open',
                    labelKey: 'paymentsInvoices.menu.openRun',
                    icon: viewIcon,
                    to: '/expenditure/payments',
                  },
                  {
                    id: 'export',
                    labelKey: 'paymentsInvoices.menu.exportList',
                    icon: statementIcon,
                  },
                  {
                    id: 'clear',
                    labelKey: 'paymentsInvoices.menu.emptyRun',
                    icon: deleteIcon,
                    danger: true,
                  },
                ]}
              />
            </div>
          </div>

          <p className="text-base font-medium leading-[1.3] text-text-quaternary">
            {t('paymentsInvoices.subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The pile */}
          <section className="w-full shrink-0 self-start overflow-hidden rounded-md bg-surface-card xl:w-[280px]">
            <div className="px-4 py-4">
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('paymentsInvoices.billsInRun', { count: invoices.length })}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.2] text-text-quaternary">
                {t('paymentsInvoices.groupedBySupplier')}
              </p>
            </div>

            {groups.map((group) => (
              <div key={group.supplier.id}>
                <div className="flex items-center gap-2 border-y border-border-subtle bg-surface-background px-4 py-2.5">
                  <span
                    className={[
                      'flex size-6 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold',
                      group.supplier.tint,
                    ].join(' ')}
                  >
                    {group.supplier.initials}
                  </span>
                  <span className="truncate text-sm font-medium text-text-secondary">
                    {group.supplier.name}
                  </span>
                </div>

                {group.items.map((item) => {
                  const active = item.id === invoice.id
                  const source = SOURCE_STYLES[item.source]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      aria-current={active}
                      className={[
                        'flex w-full flex-col gap-1 border-b border-border-subtle px-4 py-3 text-start transition-colors',
                        active
                          ? 'border-s-2 border-s-primary-700 bg-primary-25'
                          : 'hover:bg-surface-background',
                      ].join(' ')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={[
                            'text-sm font-semibold leading-[1.2]',
                            active ? 'text-primary-700' : 'text-text-primary',
                          ].join(' ')}
                        >
                          {item.reference}
                        </span>
                        <Amount value={item.amount} />
                      </span>
                      <span className="text-xs font-medium leading-[1.2] text-text-quaternary">
                        {item.dateLine}
                      </span>
                      <span
                        className={[
                          'mt-1 inline-flex w-fit items-center rounded-[2px] px-2 py-0.5 text-[10px] font-semibold uppercase leading-[1.4]',
                          source.bg,
                          source.fg,
                        ].join(' ')}
                      >
                        {t(source.labelKey)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </section>

          {/* The document */}
          <section className="flex min-w-0 flex-1 flex-col self-start overflow-hidden rounded-md bg-surface-card max-xl:w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <img src={fileIcon} alt="" className="size-5" />
                {t('paymentsInvoices.pageOf', { id: invoice.reference })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('invoiceDetails.zoomOut')}
                  disabled={zoomIndex === 0}
                  onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={zoomOutIcon} alt="" className="size-5" />
                </button>
                <span className="w-11 text-center text-xs font-medium text-text-tertiary tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.zoomIn')}
                  disabled={zoomIndex === ZOOM_STEPS.length - 1}
                  onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={zoomInIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.print')}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white"
                >
                  <img src={printIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.download')}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white"
                >
                  <img src={downloadIcon} alt="" className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex justify-center-safe overflow-auto bg-[#2c3342] p-6">
              <InvoiceSheet invoice={invoice} zoom={zoom} />
            </div>
          </section>

          {/* What we recorded */}
          <aside className="w-full shrink-0 self-start rounded-md bg-surface-card p-5 xl:w-[300px]">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('paymentsInvoices.whatRecorded')}
            </h2>

            <dl className="mt-4 flex flex-col gap-3">
              {[
                [
                  t('paymentsInvoices.supplier'),
                  RUN_SUPPLIERS.find((s) => s.id === invoice.supplierId)!.name,
                ],
                [t('paymentsInvoices.theirBillNo'), invoice.reference],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                  <dd className="truncate text-sm font-semibold text-text-primary">{value}</dd>
                </div>
              ))}
              {[
                [t('paymentsInvoices.net'), invoice.net],
                [t('paymentsInvoices.vat'), invoice.vat],
                [t('paymentsInvoices.total'), invoice.amount],
                [t('paymentsInvoices.payingInThisRun'), invoice.payingAmount],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                  <dd>
                    <Amount value={value} />
                  </dd>
                </div>
              ))}
            </dl>

            <ul className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle pt-4">
              {invoice.checks.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <span className="text-sm font-medium leading-[1.3] text-text-tertiary">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>

            {invoice.discountNoteKey ? (
              <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                <span>{withRial(t(invoice.discountNoteKey))}</span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2.5">
              <Link
                to={`/expenditure/bills/${invoice.id}`}
                className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('paymentsInvoices.openFullBill')}
              </Link>
              <button
                type="button"
                onClick={() => {
                  const next = invoices[index + 1] ?? invoices[index - 1]
                  setRemoved((current) => [...current, invoice.id])
                  if (next) setActiveId(next.id)
                }}
                disabled={invoices.length === 1}
                className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('paymentsInvoices.takeOut')}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
                {t('paymentsInvoices.previous')}
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={index === invoices.length - 1}
                className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('paymentsInvoices.next')}
                <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
              </button>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
              {t('paymentsInvoices.arrowHint', {
                current: index + 1,
                total: invoices.length,
              })}
            </p>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
