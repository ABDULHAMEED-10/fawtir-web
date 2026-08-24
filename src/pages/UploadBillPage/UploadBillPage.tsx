import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Select } from '../../components/ui'
import {
  calculateInvoice,
  formatAtScale,
  projectInvoice,
  type DiscountType,
} from '../../lib/invoiceMath'
import { UPLOADED_BILL, SUPPLIER_OPTIONS } from '../../lib/billCapture'
import fileIcon from '../../assets/bill-capture/file.svg'
import okCheckIcon from '../../assets/bill-detail/tick.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import orderDocIcon from '../../assets/create-invoice/doc-order.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * Amber marks a field the reader was not confident about.
 *
 * It is the whole point of this screen: the parse is a guess, and the guesses are singled out
 * so a person checks those rather than re-reading everything.
 */
const UNSURE = 'border-[#d8c9a8] bg-[#faf5ea]'
const SURE = 'border-primary-300 bg-surface-tab-bar'

type Line = {
  id: string
  description: string
  qty: string
  rate: string
  vat: string
  /** The reader could not find a rate or an amount for this line. */
  unsure?: boolean
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </span>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'ok' | 'info'; children: React.ReactNode }) {
  const icon = tone === 'warn' ? warnIcon : tone === 'ok' ? matchOkIcon : okCheckIcon
  return (
    <p
      className={[
        'flex items-start gap-1.5 text-xs font-medium leading-[1.4]',
        tone === 'warn'
          ? 'text-[#887147]'
          : tone === 'ok'
            ? 'text-success-700'
            : 'text-text-tertiary',
      ].join(' ')}
    >
      <img src={icon} alt="" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** The supplier's own document, drawn from what the reader pulled out of the file. */
function BillSheet({ zoom }: { zoom: number }) {
  const doc = UPLOADED_BILL.sheet
  return (
    <article
      style={{ width: 360 * zoom, fontSize: 10 * zoom }}
      className="shrink-0 rounded-sm bg-white shadow-card"
    >
      <div style={{ padding: 22 * zoom }}>
        <header className="flex items-start justify-between gap-4">
          <div>
            <p
              style={{ fontSize: 13 * zoom }}
              className="font-bold leading-[1.2] text-text-primary"
            >
              <mark className="bg-primary-50 text-text-primary">{doc.supplier}</mark>
            </p>
            <p
              style={{ fontSize: 8.5 * zoom, marginTop: 5 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              {doc.address}
            </p>
            <p
              style={{ fontSize: 8.5 * zoom, marginTop: 2 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              VAT <mark className="bg-primary-50 text-text-tertiary">{doc.vat}</mark>
            </p>
          </div>
          <div className="text-end">
            <p
              style={{ fontSize: 10 * zoom }}
              className="font-bold uppercase leading-[1.2] text-text-primary"
            >
              {doc.kind}
            </p>
            <p
              style={{ fontSize: 8.5 * zoom, marginTop: 4 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              No. <mark className="bg-primary-50 text-text-tertiary">{doc.number}</mark>
            </p>
            <p
              style={{ fontSize: 8.5 * zoom, marginTop: 2 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              Date <mark className="bg-primary-50 text-text-tertiary">{doc.date}</mark>
            </p>
          </div>
        </header>

        <div
          style={{ marginTop: 18 * zoom, paddingTop: 12 * zoom }}
          className="border-t border-[#eceef2]"
        >
          <p
            style={{ fontSize: 7 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
            className="font-semibold uppercase text-text-quaternary"
          >
            {doc.billedToLabel}
          </p>
          {doc.billedTo.map((line) => (
            <p
              key={line}
              style={{ fontSize: 8.5 * zoom, marginTop: 3 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              {line}
            </p>
          ))}
        </div>

        <table style={{ marginTop: 16 * zoom }} className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-[#eceef2]">
              {doc.columns.map((column, index) => (
                <th
                  key={column}
                  style={{ fontSize: 7 * zoom, paddingBottom: 5 * zoom }}
                  className={[
                    'font-semibold uppercase leading-[1.2] text-text-quaternary',
                    index === 0 ? 'text-start' : 'text-end',
                  ].join(' ')}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => (
              <tr key={line.description} className="border-b border-[#f3f3f3]">
                <td
                  style={{ fontSize: 8.5 * zoom, paddingBlock: 6 * zoom }}
                  className="font-medium leading-[1.3] text-text-secondary"
                >
                  {line.description}
                </td>
                <td
                  style={{ fontSize: 8.5 * zoom, paddingBlock: 6 * zoom }}
                  className="text-end font-medium text-text-secondary"
                >
                  <mark className="bg-primary-50 text-text-secondary">{line.qty}</mark>
                </td>
                <td
                  style={{ fontSize: 8.5 * zoom, paddingBlock: 6 * zoom }}
                  className="text-end font-medium text-text-secondary"
                >
                  {line.rate}
                </td>
                <td
                  style={{ fontSize: 8.5 * zoom, paddingBlock: 6 * zoom }}
                  className="text-end font-medium text-text-secondary"
                >
                  {line.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12 * zoom }} className="flex justify-end">
          <div style={{ width: '62%' }}>
            {doc.totals.map((row) => (
              <div
                key={row.label}
                style={{ fontSize: 8.5 * zoom, paddingBlock: 4 * zoom }}
                className="flex justify-between font-medium text-text-tertiary"
              >
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
            <div
              style={{ fontSize: 10.5 * zoom, marginTop: 5 * zoom, paddingTop: 6 * zoom }}
              className="flex justify-between border-t border-[#151c2d] font-bold text-text-primary"
            >
              <span>{doc.totalLabel}</span>
              <mark className="bg-primary-50 text-text-primary">{doc.total}</mark>
            </div>
          </div>
        </div>

        <div
          style={{ marginTop: 18 * zoom, paddingTop: 12 * zoom }}
          className="border-t border-[#eceef2]"
        >
          <p
            style={{ fontSize: 7 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
            className="font-semibold uppercase text-text-quaternary"
          >
            {doc.termsLabel}
          </p>
          <p
            style={{ fontSize: 8.5 * zoom, marginTop: 4 * zoom }}
            className="font-medium leading-[1.4] text-text-tertiary"
          >
            {doc.termsPrefix}{' '}
            <mark className="bg-primary-50 text-text-tertiary">{doc.termsHighlight}</mark>{' '}
            {doc.termsSuffix}
          </p>
        </div>
      </div>
    </article>
  )
}

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5]

export function UploadBillPage() {
  const { t } = useTranslation()
  const bill = UPLOADED_BILL

  const [supplier, setSupplier] = useState(bill.fields.supplier)
  const [billNumber, setBillNumber] = useState(bill.fields.billNumber)
  const [billDate, setBillDate] = useState(bill.fields.billDate)
  const [dueDate, setDueDate] = useState(bill.fields.dueDate)
  const [dueTouched, setDueTouched] = useState(false)
  const [lines, setLines] = useState<Line[]>(bill.fields.lines)
  const [zoomIndex, setZoomIndex] = useState(1)
  const [linked, setLinked] = useState<'suggested' | 'linked' | 'dismissed'>('suggested')

  const zoom = ZOOM_STEPS[zoomIndex]

  const setLine = (id: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) =>
        line.id === id
          ? // Filling in what the reader missed clears the amber on that row.
            { ...line, ...patch, unsure: line.unsure && !patch.rate ? line.unsure : false }
          : line,
      ),
    )

  /** Same engine the invoice screens use, so the arithmetic is the audited one. */
  const totals = useMemo(() => {
    const engineLines = lines.map((line, index) => ({
      id: line.id,
      lineNumber: index + 1,
      unitPrice: line.rate || '0',
      quantity: line.qty || '0',
      vatRate: line.vat.replace('%', '') || '0',
      discountType: 'PERCENTAGE' as DiscountType,
      discountValue: '0',
    }))
    const projected = projectInvoice(calculateInvoice(engineLines, 'PERCENTAGE', '0'))
    return {
      net: formatAtScale(projected.taxable),
      vat: formatAtScale(projected.vat),
      total: formatAtScale(projected.total),
    }
  }, [lines])

  const addsUp = totals.total === bill.sheet.totalPlain
  const unsureLines = lines.filter((line) => line.unsure).length

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/bills"
            className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800"
          >
            {t('billDetail.breadcrumb')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('uploadBill.breadcrumb')}
          </span>
        </div>

        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('uploadBill.title')}
          </h1>
          <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
            {t('uploadBill.subtitle')}
          </p>
        </div>

        {/* The file it read */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={fileIcon} alt="" className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {bill.file.name}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('uploadBill.fileMeta', bill.file)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('uploadBill.replaceFile')}
          </button>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The file itself */}
          <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-surface-card xl:w-[600px] xl:shrink-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <img src={fileIcon} alt="" className="size-5" />
                {t('uploadBill.pageOf', { current: 1, total: bill.file.pages })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('invoiceDetails.zoomOut')}
                  disabled={zoomIndex === 0}
                  onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={zoomOutIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.zoomIn')}
                  disabled={zoomIndex === ZOOM_STEPS.length - 1}
                  onClick={() =>
                    setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))
                  }
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={zoomInIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.fullscreen')}
                  onClick={() => setZoomIndex(ZOOM_STEPS.length - 1)}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white"
                >
                  <img src={fullscreenIcon} alt="" className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex flex-1 justify-center overflow-auto bg-surface-background p-5">
              <BillSheet zoom={zoom} />
            </div>
          </section>

          {/* What we read out of it */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('uploadBill.whoSentIt')}
              </h2>

              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel label={t('uploadBill.supplier')} required />
                <Select
                  value={supplier}
                  onChange={setSupplier}
                  options={SUPPLIER_OPTIONS}
                  ariaLabel={t('uploadBill.supplier')}
                />
                <Note tone="info">{t('uploadBill.vatMatches')}</Note>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('uploadBill.billNumber')} required />
                  <input
                    value={billNumber}
                    onChange={(event) => setBillNumber(event.target.value)}
                    className={[
                      'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      SURE,
                    ].join(' ')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('uploadBill.billDate')} required />
                  <DateField
                    value={billDate}
                    onChange={setBillDate}
                    ariaLabel={t('uploadBill.billDate')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('uploadBill.paymentDue')} required />
                  <DateField
                    value={dueDate}
                    onChange={(value) => {
                      setDueDate(value)
                      setDueTouched(true)
                    }}
                    ariaLabel={t('uploadBill.paymentDue')}
                    unsure={!dueTouched}
                  />
                </div>
              </div>

              {dueTouched ? null : (
                <div className="mt-3">
                  <Note tone="warn">{t('uploadBill.noDueDate')}</Note>
                </div>
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('uploadBill.whatTheyCharged')}
              </h2>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      <th className="pb-2 text-start font-semibold">
                        {t('uploadBill.col.description')}
                      </th>
                      <th className="pb-2 text-end font-semibold">{t('uploadBill.col.qty')}</th>
                      <th className="pb-2 text-end font-semibold">{t('uploadBill.col.rate')}</th>
                      <th className="pb-2 text-end font-semibold">{t('uploadBill.col.vat')}</th>
                      <th className="pb-2 text-end font-semibold">{t('uploadBill.col.amount')}</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const shell = line.unsure ? UNSURE : SURE
                      const lineTotal =
                        (Number(line.qty.replace(/,/g, '')) || 0) * (Number(line.rate) || 0)
                      return (
                        <tr key={line.id}>
                          <td className="py-1.5 pe-2">
                            <input
                              value={line.description}
                              onChange={(event) =>
                                setLine(line.id, { description: event.target.value })
                              }
                              aria-label={t('uploadBill.col.description')}
                              className={[
                                'h-[42px] w-full rounded-sm border px-3 text-sm font-medium text-text-secondary outline-none',
                                shell,
                              ].join(' ')}
                            />
                          </td>
                          {(
                            [
                              ['qty', line.qty],
                              ['rate', line.rate],
                              ['vat', line.vat],
                            ] as const
                          ).map(([key, value]) => (
                            <td key={key} className="px-1 py-1.5">
                              <input
                                value={value}
                                inputMode="decimal"
                                onChange={(event) =>
                                  setLine(line.id, { [key]: event.target.value })
                                }
                                aria-label={t(`uploadBill.col.${key}`)}
                                className={[
                                  'h-[42px] w-[72px] rounded-sm border px-2 text-end text-sm font-medium text-text-secondary outline-none',
                                  shell,
                                ].join(' ')}
                              />
                            </td>
                          ))}
                          <td className="ps-1 py-1.5">
                            <span
                              className={[
                                'flex h-[42px] w-[86px] items-center justify-end rounded-sm border px-2 text-sm font-semibold text-text-secondary tabular-nums',
                                shell,
                              ].join(' ')}
                            >
                              {lineTotal.toFixed(3)}
                            </span>
                          </td>
                          <td className="ps-1 py-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setLines((current) => current.filter((l) => l.id !== line.id))
                              }
                              aria-label={t('uploadBill.removeLine')}
                              className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-surface-background"
                            >
                              <img src={deleteIcon} alt="" className="size-5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      id: `l${current.length + 1}-${current.length}`,
                      description: '',
                      qty: '1',
                      rate: '',
                      vat: '5%',
                    },
                  ])
                }
                className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={plusIcon} alt="" className="size-4" />
                {t('uploadBill.addLine')}
              </button>

              {unsureLines > 0 ? (
                <div className="mt-3">
                  <Note tone="warn">{t('uploadBill.lineUnsure')}</Note>
                </div>
              ) : null}

              <dl className="mt-5 ms-auto w-full max-w-[300px]">
                {[
                  [t('uploadBill.net'), totals.net],
                  [t('uploadBill.vatRow', { rate: lines[0]?.vat ?? '5%' }), totals.vat],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                    <dd className="text-sm font-semibold text-text-secondary tabular-nums">
                      <span className="me-1 text-[10px] uppercase text-text-quaternary">OMR</span>
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('uploadBill.total')}
                  </dt>
                  <dd className="text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                    <span className="me-1 text-xs uppercase text-text-quaternary">OMR</span>
                    {totals.total}
                  </dd>
                </div>
              </dl>

              <div
                className={[
                  'mt-4 rounded-sm px-3.5 py-3',
                  addsUp ? 'bg-success-100' : 'bg-[#faf5ea]',
                ].join(' ')}
              >
                <Note tone={addsUp ? 'ok' : 'warn'}>
                  {addsUp
                    ? t('uploadBill.addsUp')
                    : t('uploadBill.doesNotAddUp', { printed: bill.sheet.total })}
                </Note>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('uploadBill.linkToOrder')}
              </h2>

              {linked === 'dismissed' ? (
                <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                  {t('uploadBill.leftUnlinked')}
                </p>
              ) : (
                <div
                  className={[
                    'mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border p-4',
                    linked === 'linked'
                      ? 'border-success-700 bg-success-100'
                      : 'border-primary-300 bg-primary-25',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white">
                      <img src={orderDocIcon} alt="" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold leading-[1.2] text-text-primary">
                        {linked === 'linked'
                          ? t('uploadBill.linkedTo', { order: bill.suggestedOrder })
                          : t('uploadBill.looksLike', { order: bill.suggestedOrder })}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-[1.4] text-text-tertiary">
                        {t('uploadBill.suggestionNote')}
                      </p>
                    </div>
                  </div>

                  {linked === 'suggested' ? (
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setLinked('dismissed')}
                        className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                      >
                        {t('uploadBill.notThisOne')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinked('linked')}
                        className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                      >
                        {t('uploadBill.linkIt')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinked('suggested')}
                      className="shrink-0 text-sm font-semibold text-primary-700 hover:text-primary-800"
                    >
                      {t('uploadBill.unlink')}
                    </button>
                  )}
                </div>
              )}

              <p className="mt-3 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                <img src={okCheckIcon} alt="" className="mt-px size-4 shrink-0" />
                {t('uploadBill.unlinkedHint')}
              </p>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                to="/expenditure/bills"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('uploadBill.cancel')}
              </Link>
              <Link
                to="/expenditure/bills"
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('uploadBill.saveBill')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
