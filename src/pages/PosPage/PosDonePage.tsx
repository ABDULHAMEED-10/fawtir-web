import { useEffect, useRef, useState } from 'react'
import { startNewSale, useOpenSale } from '../../lib/posSale'
import { useWorkingBranch } from '../../components/branch/BranchPicker'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { AppShell } from '../../layouts/AppShell'
import { withRial } from '../../components/ui'
import { LULL, TILL, itemById, omr, omrSigned, totalsFor, unitPrice } from '../../lib/pos'
import {
  FILING_STEPS,
  RECEIPT,
  RECEIPT_WAYS,
  TAKEN,
  changeDue,
  roundUpTip,
  toPay,
} from '../../lib/posPayment'

/** The QR the customer scans to check the invoice with the Tax Authority. */
function ReceiptQr({ value }: { value: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current) void QRCode.toCanvas(canvas.current, value, { width: 132, margin: 0 })
  }, [value])
  return <canvas ref={canvas} className="size-[132px]" aria-hidden="true" />
}

/*
 * TODO(backend): this screen shows the sample's filing steps. The invoice the sale files is built
 * by `posInvoiceRequest` (src/lib/posInvoice.ts) and is sent once the till sells from the real
 * catalogue and the backend takes a till sale in one call (INCOME.md row P.12).
 */
export function PosDonePage() {
  const { t } = useTranslation()
  // The till's branch is the one picked on the sale screen; the sample's until branches load.
  const branchName = useWorkingBranch().branch?.name ?? TILL.branch
  const navigate = useNavigate()
  const [way, setWay] = useState('print')

  const { lines, saleDiscount } = useOpenSale()
  const totals = totalsFor(lines, saleDiscount)
  const tip = roundUpTip(totals.sale)
  const total = toPay(totals.sale, tip)
  const change = changeDue(TAKEN)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-success-100 px-6 py-5">
          <div className="flex min-w-0 flex-1 items-start gap-4 max-md:basis-full">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success-700 text-xl text-white">
              ✓
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-medium leading-[1.2] text-text-primary">
                {t('pos.done.title')}
              </h1>
              <p className="mt-1.5 text-sm font-medium leading-[1.6] text-text-tertiary">
                {t('pos.done.summary', {
                  invoice: RECEIPT.invoice,
                  seconds: RECEIPT.seconds,
                  change: omr(change),
                })}
              </p>
            </div>
          </div>
          <div className="text-end max-md:basis-full max-md:text-start">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
              {t('pos.pay.changeToGive')}
            </p>
            <p className="mt-1 text-[30px] font-semibold leading-none text-success-700">
              {omr(change)}
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[320px] flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
                <div>
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.done.whatHappened')}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.done.underTwoSeconds')}
                  </p>
                </div>
                <Link
                  to="/compliance/activity"
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                >
                  {t('pos.done.seeFilingRecord')}
                </Link>
              </div>
              <ol className="flex flex-wrap gap-4 px-6 py-5">
                {FILING_STEPS.map((step, index) => (
                  <li
                    key={step.id}
                    className="flex min-w-[132px] flex-1 flex-col items-center gap-2 text-center"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-success-700 text-sm text-white">
                      ✓
                    </span>
                    <span className="text-sm font-semibold text-text-primary">
                      {t(step.labelKey)}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {t(step.noteKey, {
                        invoice: RECEIPT.invoice,
                        sent: RECEIPT.sentAt,
                        accepted: RECEIPT.acceptedAt,
                      })}
                    </span>
                    <span className="sr-only">{index + 1}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.done.giveReceipt')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.done.qrAlreadyUp')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 px-6 py-4 max-md:grid-cols-1">
                {RECEIPT_WAYS.map((option) => {
                  const chosen = option.id === way
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setWay(option.id)}
                      aria-pressed={chosen}
                      className={[
                        'flex items-center gap-3 rounded-md border px-4 py-3.5 text-start transition-colors',
                        chosen
                          ? 'border-success-700 bg-success-100'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-text-tertiary">
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                          <rect
                            x="4"
                            y="3"
                            width="12"
                            height="14"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-text-primary">
                          {t(option.labelKey)}
                        </span>{' '}
                        <span className="text-xs font-medium text-text-quaternary">
                          {t(option.noteKey)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-text-quaternary">
                        {option.hotkey}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-6 py-4">
                <p className="min-w-[240px] flex-1 text-sm font-medium leading-[1.6] text-text-tertiary">
                  {t('pos.done.rungUpWrong')}
                </p>
                <Link
                  to="/pos/refund"
                  className="inline-flex h-11 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('pos.done.refundOrVoid')}
                </Link>
              </div>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card px-6 py-5">
              <div>
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.done.readyNext')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.done.clearsItself')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  startNewSale()
                  navigate('/pos')
                }}
                className="inline-flex h-[52px] shrink-0 items-center rounded-sm bg-primary-700 px-6 text-base font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('pos.done.startNew')}
              </button>
            </section>
          </div>

          <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.done.theirReceipt')}
              </h2>
              <button type="button" className="text-sm font-semibold text-primary-700">
                {t('pos.done.printAgain')}
              </button>
            </div>

            <div className="m-5 rounded-sm border border-border-subtle px-5 py-6 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
                AB
              </span>
              <p className="mt-3 text-base font-semibold text-text-primary">
                {RECEIPT.business.name}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {RECEIPT.business.address}
                <br />
                {RECEIPT.business.town} · {t('pos.done.vat')} {RECEIPT.business.vat}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
                {t('pos.done.simplifiedInvoice')}
              </p>
              <p className="font-arabic text-xs text-text-secondary">فاتورة ضريبية مبسطة</p>

              <div className="mt-4 border-t border-dashed border-border-subtle pt-3 text-start">
                <ReceiptRow label={RECEIPT.invoice} value={`${RECEIPT.date} · ${RECEIPT.time}`} />
                <ReceiptRow
                  label={t('pos.done.till', { number: TILL.number, who: 'Maryam' })}
                  value={branchName}
                />
              </div>

              <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
                {lines.map((line) => {
                  const item = itemById(line.itemId)
                  const size = item.sizes?.find((s) => s.id === line.sizeId)
                  return (
                    <ReceiptRow
                      key={line.id}
                      label={`${line.qty} × ${item.name}${size ? ` (${t(size.labelKey).charAt(0)})` : ''}`}
                      value={omr(unitPrice(line) * line.qty)}
                    />
                  )
                })}
              </div>

              <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
                <ReceiptRow label={t('pos.totals.items')} value={omr(totals.items)} />
                {totals.discount > 0 ? (
                  <ReceiptRow
                    label={t('pos.totals.lullShort', { percent: LULL.percent })}
                    value={omrSigned(-totals.discount)}
                  />
                ) : null}
                {totals.saleDiscount > 0 ? (
                  <ReceiptRow
                    label={t('pos.totals.saleDiscount')}
                    value={omrSigned(-totals.saleDiscount)}
                  />
                ) : null}
                <ReceiptRow label={t('pos.done.beforeVat')} value={omr(totals.beforeVat)} />
                <ReceiptRow
                  label={
                    totals.vatRates.length === 1
                      ? t('pos.totals.vatAt', { rate: totals.vatRates[0] })
                      : t('pos.totals.vatMixed')
                  }
                  value={omr(totals.vat)}
                />
                <ReceiptRow label={t('pos.pay.sale')} value={omr(totals.sale)} />
                <ReceiptRow label={t('pos.done.tipNoVat')} value={omr(tip)} />
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-dashed border-border-subtle pt-3">
                <span className="text-sm font-semibold text-text-primary">
                  {withRial(t('pos.done.totalOmr'))}
                </span>
                <span className="text-base font-semibold text-text-primary">{omr(total)}</span>
              </div>

              <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
                {TAKEN.map((payment) => (
                  <ReceiptRow
                    key={payment.id}
                    label={t(`pos.pay.${payment.method}`)}
                    value={omr(payment.amount)}
                  />
                ))}
                <ReceiptRow label={t('pos.done.change')} value={omr(change)} />
              </div>

              <div className="mt-5 flex flex-col items-center gap-2">
                <ReceiptQr value={`https://tax.gov.om/verify/${RECEIPT.otaReference}`} />
                <p className="text-[11px] font-medium leading-[1.5] text-text-quaternary">
                  {t('pos.done.scanToCheck')}
                </p>
                <p className="font-mono text-[11px] text-text-tertiary">{RECEIPT.otaReference}</p>
                <p className="mt-1 text-[11px] font-medium text-text-quaternary">
                  {t('pos.done.thankYou')} · شكراً لكم
                </p>
                <p className="text-[11px] font-medium text-text-quaternary">
                  {RECEIPT.business.site}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  )
}
