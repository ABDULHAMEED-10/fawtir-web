import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Rial, RialMark, Select, withRial } from '../../components/ui'
import { DebitChecks } from '../../components/debit/DebitChecks'
import {
  calculateInvoice,
  formatAtScale,
  projectInvoice,
  type DiscountType,
} from '../../lib/invoiceMath'
import {
  DEBIT_UPLOAD,
  REFUSAL_REASONS,
  debitValue,
  formatDebit,
  type DebitDecision,
} from '../../lib/supplierDebitNotes'
import { SUPPLIER_OPTIONS } from '../../lib/billCapture'
import fileIcon from '../../assets/bill-capture/file.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import billIcon from '../../assets/invoice-details/credit-note.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const SHELL = 'border-primary-300 bg-surface-tab-bar'
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5]

type Line = { id: string; description: string; qty: string; rate: string; vat: string }

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </span>
  )
}

/** The debit note as the supplier printed it. */
function DebitSheet({ zoom }: { zoom: number }) {
  const { t } = useTranslation()
  const doc = DEBIT_UPLOAD.sheet
  const mark = 'bg-primary-50 text-inherit'

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
              <mark className={mark}>{doc.supplier}</mark>
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
              VAT <mark className={mark}>{doc.vat}</mark>
            </p>
          </div>
          <div className="text-end">
            <p
              style={{ fontSize: 10 * zoom }}
              className="font-bold uppercase leading-[1.2] text-text-primary"
            >
              {t('supplierDebitNotes.upload.sheetKind')}
            </p>
            <p
              style={{ fontSize: 8.5 * zoom, marginTop: 4 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              No. <mark className={mark}>{doc.number}</mark>
            </p>
            <p
              style={{ fontSize: 8.5 * zoom, marginTop: 2 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              Date <mark className={mark}>{doc.date}</mark>
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
            {t('supplierDebitNotes.upload.sheetChargedTo')}
          </p>
          {doc.chargedTo.map((line) => (
            <p
              key={line}
              style={{ fontSize: 8.5 * zoom, marginTop: 3 * zoom }}
              className="font-medium leading-[1.3] text-text-tertiary"
            >
              {line}
            </p>
          ))}
        </div>

        <div style={{ marginTop: 14 * zoom }}>
          <p
            style={{ fontSize: 7 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
            className="font-semibold uppercase text-text-quaternary"
          >
            {t('supplierDebitNotes.upload.sheetAgainst')}
          </p>
          <p
            style={{ fontSize: 8.5 * zoom, marginTop: 3 * zoom }}
            className="font-medium leading-[1.3] text-text-tertiary"
          >
            Ref. <mark className={mark}>{doc.againstRef}</mark> {doc.againstDate}
          </p>
        </div>

        <div style={{ marginTop: 14 * zoom }}>
          <p
            style={{ fontSize: 7 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
            className="font-semibold uppercase text-text-quaternary"
          >
            {t('supplierDebitNotes.upload.sheetReason')}
          </p>
          <p
            style={{ fontSize: 8.5 * zoom, marginTop: 3 * zoom }}
            className="font-medium leading-[1.4] text-text-tertiary"
          >
            {doc.reason}
          </p>
        </div>

        <table style={{ marginTop: 14 * zoom }} className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-[#eceef2]">
              {['description', 'qty', 'rate', 'amount'].map((key, index) => (
                <th
                  key={key}
                  style={{ fontSize: 7 * zoom, paddingBottom: 5 * zoom }}
                  className={[
                    'font-semibold uppercase leading-[1.2] text-text-quaternary',
                    index === 0 ? 'text-start' : 'text-end',
                  ].join(' ')}
                >
                  {t(
                    key === 'amount'
                      ? 'supplierDebitNotes.upload.sheetAmount'
                      : `supplierDebitNotes.upload.col.${key}`,
                  )}
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
                  {line.qty}
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
            {[
              [t('supplierDebitNotes.upload.netCharged'), doc.net],
              [t('supplierDebitNotes.upload.vatRow'), doc.vatAmount],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ fontSize: 8.5 * zoom, paddingBlock: 4 * zoom }}
                className="flex justify-between font-medium text-text-tertiary"
              >
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div
              style={{ fontSize: 10.5 * zoom, marginTop: 5 * zoom, paddingTop: 6 * zoom }}
              className="flex justify-between border-t border-[#151c2d] font-bold text-text-primary"
            >
              <span>{withRial(t('supplierDebitNotes.upload.sheetTotalDue'))}</span>
              <mark className={mark}>{doc.total}</mark>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export function UploadDebitNotePage() {
  const { t } = useTranslation()
  const upload = DEBIT_UPLOAD

  const [supplier, setSupplier] = useState(upload.fields.supplier)
  const [number, setNumber] = useState(upload.fields.number)
  const [issued, setIssued] = useState(upload.fields.issued)
  const [lines, setLines] = useState<Line[]>(upload.fields.lines)
  /** The checks find two problems, so refusing is the reading the screen argues for. */
  const [decision, setDecision] = useState<DebitDecision>('refuse')
  const [reason, setReason] = useState(REFUSAL_REASONS[0].id)
  const [otherReason, setOtherReason] = useState('')
  const [zoomIndex, setZoomIndex] = useState(1)

  const zoom = ZOOM_STEPS[zoomIndex]

  /** Same engine as every other total in the app, so the charge reconciles the same way. */
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

  const addsUp = totals.total === upload.sheet.total
  const youdPay = formatDebit(debitValue(upload.bill.amount) + debitValue(totals.total))

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/debit-notes"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('supplierDebitNotes.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('supplierDebitNotes.upload.breadcrumb')}
          </span>
        </div>

        <div className="-mt-2">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('supplierDebitNotes.upload.title')}
          </h1>
          <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
            {t('supplierDebitNotes.upload.subtitle')}
          </p>
        </div>

        {/* A charge, not a credit — the file banner carries the sand tone, not the blue one. */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-pending-200 bg-pending-100 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={fileIcon} alt="" className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {upload.file.name}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('supplierDebitNotes.upload.fileMeta', upload.file)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
          >
            {t('uploadBill.replaceFile')}
          </button>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The file */}
          <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-surface-card xl:w-[440px] xl:shrink-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <img src={fileIcon} alt="" className="size-5" />
                {t('uploadBill.pageOf', { current: 1, total: upload.file.pages })}
              </p>
              <div className="flex items-center gap-1.5">
                {[
                  { icon: zoomOutIcon, label: t('invoiceDetails.zoomOut'), step: -1 },
                  { icon: zoomInIcon, label: t('invoiceDetails.zoomIn'), step: 1 },
                ].map((button) => (
                  <button
                    key={button.label}
                    type="button"
                    aria-label={button.label}
                    disabled={
                      button.step < 0 ? zoomIndex === 0 : zoomIndex === ZOOM_STEPS.length - 1
                    }
                    onClick={() =>
                      setZoomIndex((index) =>
                        Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + button.step)),
                      )
                    }
                    className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                  >
                    <img src={button.icon} alt="" className="size-5" />
                  </button>
                ))}
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
              <DebitSheet zoom={zoom} />
            </div>
          </section>

          {/* What we read */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.whoSentIt')}
              </h2>
              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel label={t('supplierDebitNotes.upload.supplier')} required />
                <Select
                  value={supplier}
                  onChange={setSupplier}
                  options={SUPPLIER_OPTIONS}
                  ariaLabel={t('supplierDebitNotes.upload.supplier')}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('supplierDebitNotes.upload.number')} required />
                  <input
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                    className={[
                      'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      SHELL,
                    ].join(' ')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('supplierDebitNotes.upload.issued')} required />
                  <DateField
                    value={issued}
                    onChange={setIssued}
                    ariaLabel={t('supplierDebitNotes.upload.issued')}
                  />
                </div>
              </div>
            </section>

            {/* Which bill */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.whichBill')}
              </h2>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white">
                    <img src={billIcon} alt="" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-[1.2] text-text-primary">
                      {upload.bill.id} · <Rial /> {upload.bill.amount}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.3] text-text-tertiary">
                      {t(upload.bill.noteKey)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('supplierDebitNotes.upload.chooseAnother')}
                </button>
              </div>

              <div className="mt-4 rounded-sm border border-pending-200 bg-pending-100 p-4">
                <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-pending-700">
                  {t('supplierDebitNotes.upload.whatWouldChange')}
                </p>
                <div className="mt-3 flex items-stretch gap-2.5">
                  {[
                    { key: 'theyBilled', value: upload.bill.amount, op: '+' },
                    { key: 'thisCharge', value: totals.total, op: '=' },
                    { key: 'youdPay', value: youdPay },
                  ].map((tile) => (
                    <div key={tile.key} className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="min-w-0 flex-1 rounded-sm border border-pending-200 bg-white px-3.5 py-3">
                        <p className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                          {t(`supplierDebitNotes.upload.${tile.key}`)}
                        </p>
                        <p className="mt-2 flex items-center gap-1 whitespace-nowrap text-lg font-semibold leading-[1.2] text-text-primary">
                          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                          {tile.value}
                        </p>
                      </div>
                      {tile.op ? (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-text-tertiary">
                          {tile.op}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* The automatic read */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.looksRight')}
              </h2>
              <DebitChecks
                checks={upload.checks}
                fineLabel={t('supplierDebitNotes.upload.fine')}
                checkLabel={t('supplierDebitNotes.upload.check')}
                summaryTitle={t('supplierDebitNotes.upload.summaryTitle')}
                summaryBody={t('supplierDebitNotes.upload.summaryBody')}
              />
            </section>

            {/* Lines */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.charging')}
              </h2>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      {['description', 'qty', 'rate', 'vat', 'charge'].map((key, index) => (
                        <th
                          key={key}
                          className={[
                            'pb-2 font-semibold',
                            index === 0 ? 'text-start' : 'text-end',
                          ].join(' ')}
                        >
                          {t(`supplierDebitNotes.upload.col.${key}`)}
                        </th>
                      ))}
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const lineTotal =
                        (Number(line.qty.replace(/,/g, '')) || 0) * (Number(line.rate) || 0)
                      return (
                        <tr key={line.id}>
                          <td className="py-1.5 pe-2">
                            <input
                              value={line.description}
                              onChange={(event) =>
                                setLines((current) =>
                                  current.map((l) =>
                                    l.id === line.id
                                      ? { ...l, description: event.target.value }
                                      : l,
                                  ),
                                )
                              }
                              aria-label={t('supplierDebitNotes.upload.col.description')}
                              className={[
                                'h-[42px] w-full rounded-sm border px-3 text-sm font-medium text-text-secondary outline-none',
                                SHELL,
                              ].join(' ')}
                            />
                          </td>
                          {(['qty', 'rate', 'vat'] as const).map((key) => (
                            <td key={key} className="px-1 py-1.5">
                              <input
                                value={line[key]}
                                inputMode="decimal"
                                onChange={(event) =>
                                  setLines((current) =>
                                    current.map((l) =>
                                      l.id === line.id ? { ...l, [key]: event.target.value } : l,
                                    ),
                                  )
                                }
                                aria-label={t(`supplierDebitNotes.upload.col.${key}`)}
                                className={[
                                  'h-[42px] w-[72px] rounded-sm border px-2 text-end text-sm font-medium text-text-secondary outline-none',
                                  SHELL,
                                ].join(' ')}
                              />
                            </td>
                          ))}
                          <td className="py-1.5 ps-1">
                            <span
                              className={[
                                'flex h-[42px] w-[86px] items-center justify-end rounded-sm border px-2 text-sm font-semibold text-text-secondary tabular-nums',
                                SHELL,
                              ].join(' ')}
                            >
                              {lineTotal.toFixed(3)}
                            </span>
                          </td>
                          <td className="py-1.5 ps-1">
                            <button
                              type="button"
                              onClick={() =>
                                setLines((current) => current.filter((l) => l.id !== line.id))
                              }
                              aria-label={t('supplierDebitNotes.upload.removeLine')}
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
                {t('supplierDebitNotes.upload.addLine')}
              </button>

              <dl className="ms-auto mt-5 w-full max-w-[320px]">
                {[
                  [t('supplierDebitNotes.upload.netCharged'), totals.net],
                  [t('supplierDebitNotes.upload.vatRow'), totals.vat],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                    <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                      +<img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('supplierDebitNotes.upload.totalCharged')}
                  </dt>
                  <dd className="flex items-center gap-1 text-[22px] font-semibold leading-[1.2] text-pending-700 tabular-nums">
                    +<RialMark className="w-5 shrink-0 text-pending-700" />
                    {totals.total}
                  </dd>
                </div>
              </dl>

              <div
                className={[
                  'mt-4 rounded-sm px-3.5 py-3',
                  addsUp ? 'bg-success-100' : 'bg-pending-100',
                ].join(' ')}
              >
                <p
                  className={[
                    'flex items-start gap-1.5 text-xs font-medium leading-[1.4]',
                    addsUp ? 'text-success-700' : 'text-pending-500',
                  ].join(' ')}
                >
                  <img
                    src={addsUp ? matchOkIcon : warnIcon}
                    alt=""
                    className="mt-px size-4 shrink-0"
                  />
                  {addsUp
                    ? t('supplierDebitNotes.upload.addsUp')
                    : t('supplierDebitNotes.upload.doesNotAddUp', { printed: upload.sheet.total })}
                </p>
              </div>
            </section>

            {/* The decision */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.decision')}
              </h2>

              <div className="mt-4 flex flex-col gap-3" role="radiogroup">
                {(
                  [
                    {
                      id: 'accept' as const,
                      title: t('supplierDebitNotes.upload.accept'),
                      note: t('supplierDebitNotes.upload.acceptNote', {
                        amount: totals.total,
                        bill: upload.bill.id,
                        total: youdPay,
                      }),
                      tone: 'plain' as const,
                    },
                    {
                      id: 'refuse' as const,
                      title: t('supplierDebitNotes.upload.refuse'),
                      note: t('supplierDebitNotes.upload.refuseNote'),
                      tone: 'danger' as const,
                    },
                    {
                      id: 'hold' as const,
                      title: t('supplierDebitNotes.upload.hold'),
                      note: t('supplierDebitNotes.upload.holdNote'),
                      tone: 'plain' as const,
                    },
                  ] as const
                ).map((option) => {
                  const active = decision === option.id
                  const danger = option.tone === 'danger'
                  return (
                    <div key={option.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDecision(option.id)}
                        className={[
                          'flex w-full items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                          active
                            ? danger
                              ? 'border-warning-700 bg-warning-100/60'
                              : 'border-primary-700 bg-primary-25'
                            : 'border-border-subtle bg-white hover:border-primary-300',
                          active && danger ? 'rounded-b-none' : '',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                            active
                              ? danger
                                ? 'border-warning-700'
                                : 'border-primary-700'
                              : 'border-border-default',
                          ].join(' ')}
                        >
                          {active ? (
                            <span
                              className={[
                                'size-2.5 rounded-full',
                                danger ? 'bg-warning-700' : 'bg-primary-700',
                              ].join(' ')}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={[
                              'text-base font-semibold leading-[1.2]',
                              active && danger ? 'text-warning-700' : 'text-text-primary',
                            ].join(' ')}
                          >
                            {option.title}
                          </span>{' '}
                          <span className="text-sm font-medium leading-[1.3] text-text-quaternary">
                            {withRial(option.note)}
                          </span>
                        </span>
                      </button>

                      {/* Refusing needs a reason, and it only appears once refusing is chosen. */}
                      {active && danger ? (
                        <div className="rounded-b-sm border border-t-0 border-warning-700 bg-warning-100/60 px-4 pb-4">
                          <div className="flex flex-wrap gap-2">
                            {REFUSAL_REASONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setReason(option.id)}
                                className={[
                                  'inline-flex h-[36px] items-center rounded-sm border px-3 text-sm font-medium transition-colors',
                                  reason === option.id
                                    ? 'border-warning-700 bg-white text-warning-700'
                                    : 'border-border-subtle bg-white text-text-secondary hover:border-warning-700',
                                ].join(' ')}
                              >
                                {t(option.labelKey)}
                              </button>
                            ))}
                          </div>
                          {reason === 'other' ? (
                            <input
                              value={otherReason}
                              onChange={(event) => setOtherReason(event.target.value)}
                              placeholder={t('supplierDebitNotes.refuse.otherPlaceholder')}
                              aria-label={t('supplierDebitNotes.refuse.otherPlaceholder')}
                              className="mt-2.5 h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-medium text-text-secondary outline-none focus:border-warning-700"
                            />
                          ) : null}
                          <p className="mt-2.5 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                            <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                            {t('supplierDebitNotes.upload.reasonNote')}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                to="/expenditure/debit-notes"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('supplierDebitNotes.upload.cancel')}
              </Link>
              <Link
                to="/expenditure/debit-notes"
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('supplierDebitNotes.upload.save')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
