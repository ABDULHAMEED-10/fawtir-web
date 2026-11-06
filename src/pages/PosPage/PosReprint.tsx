import { useTranslation } from 'react-i18next'
import { Modal, Rial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { loadPosSale, POS_SALES_PATH, type PosMethod, type PosSaleDto } from '../../api/pos/pos'
import { omr, omrOfRials, omrSigned, receiptStamp, toBaisa } from '../../lib/pos'
import { receiptSellerHeader } from '../../lib/posReceiptSeller'
import { saleCashierLabel } from '../../lib/posAttribution'
import { ReceiptMasthead, ReceiptQr, ReceiptRow } from './PosReceiptParts'
import { receiptNotKept, reprintReady } from '../../lib/posReprint'
import { maskedIdentifier } from '../../lib/posSale'
import { PRINT_SHEET_CLASS } from '../../components/print/printSheet'

const METHOD_KEYS: Record<PosMethod, string> = {
  CASH: 'pos.pay.cash',
  CARD: 'pos.pay.card',
  TRANSFER: 'pos.pay.transfer',
  ON_ACCOUNT: 'pos.pay.account',
}

/**
 * "Print receipt" from the day's list (QR E-5): the receipt again, from `GET /pos/sales/{id}` only.
 *
 * The seller is the one frozen on the issued invoice and nothing else: a missing value prints as not
 * recorded, never from the live profile, because a reprint after a profile change would otherwise
 * name today's seller on yesterday's sale. The QR is the server's image, frozen at issue for an
 * online consumer sale. Nothing is printed unless the answer also carries the issued lines and, on a
 * full invoice, the buyer (`reprintReady`, ruling QW2R-1); while the reprint gate is off
 * (`REPRINT_LINES_SETTLED`) the dialog only says the reprint is not available. The sheet says COPY on paper, not only in the title.
 */
export function ReceiptReprint({
  saleId,
  branchName,
  onClose,
}: {
  saleId: string
  branchName: string | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const sale = useApiRead<PosSaleDto>(`${POS_SALES_PATH}/${encodeURIComponent(saleId)}`, () =>
    loadPosSale(saleId),
  )
  const answered = sale.read.status === 'ready' ? sale.read.data : null
  const ready = answered && reprintReady(answered) ? answered : null
  return (
    <Modal
      open
      onClose={onClose}
      title={t('pos.today.reprintTitle')}
      width={440}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!ready}
            onClick={() => window.print()}
            className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            {t('pos.done.printAgain')}
          </button>
        </div>
      }
    >
      {sale.read.status === 'loading' ? (
        <LoadingNotice />
      ) : sale.read.status === 'failed' ? (
        <ApiReadFailure error={sale.read.error} retry={sale.retry} />
      ) : ready ? (
        <ReprintPaper sale={ready} branchName={branchName} locale={locale} />
      ) : answered ? (
        <p className="text-sm font-medium text-text-tertiary">
          {t(receiptNotKept(answered) ? 'pos.today.reprintNotKept' : 'pos.today.reprintUnavailable')}
        </p>
      ) : null}
    </Modal>
  )
}

function ReprintPaper({
  sale,
  branchName,
  locale,
}: {
  sale: PosSaleDto
  branchName: string | null
  locale: string
}) {
  const { t } = useTranslation()
  // `?? null`: an older server without the key reads as nothing recorded, not as the live profile.
  const seller = receiptSellerHeader(sale.receipt.seller ?? null, null, null)
  const totals = sale.totals
  const change = sale.payments.reduce((sum, payment) => sum + toBaisa(payment.change ?? 0), 0)
  const buyer = sale.receipt.buyer
  return (
    <div className={`${PRINT_SHEET_CLASS} rounded-sm bg-white px-5 py-6 text-center shadow-sm`}>
      <ReceiptMasthead
        seller={seller}
        liveVatNumber={null}
        fullInvoice={sale.transactionType === 'FULL_TAX'}
        locale={locale}
      />
      {/* On the sheet itself: the modal's title does not reach the paper. */}
      <p className="mt-2 text-sm font-bold uppercase tracking-[0.12em] text-text-primary">
        {t('pos.today.reprintCopy')}
      </p>
      {locale === 'ar' ? null : <p className="font-arabic text-sm font-bold text-text-primary">نسخة</p>}

      <div className="mt-4 border-t border-dashed border-border-subtle pt-3 text-start">
        <ReceiptRow label={sale.invoiceNumber} value={receiptStamp(sale.soldAt, locale)} />
        <ReceiptRow
          label={t('pos.done.till', { number: sale.tillNumber, who: saleCashierLabel(sale, t) })}
          value={branchName ?? ''}
        />
        {buyer?.name ? (
          <>
            <ReceiptRow label={buyer.name} value="" />
            {buyer.vatNumber ? (
              <ReceiptRow label={t('pos.done.vat')} value={buyer.vatNumber} />
            ) : buyer.identifierScheme && buyer.identifierValue ? (
              <ReceiptRow
                label={t(`customerForm.identifier.schemes.${buyer.identifierScheme}`)}
                value={maskedIdentifier(buyer.identifierScheme, buyer.identifierValue)}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
        {(sale.receipt.lines ?? []).map((line, index) => (
          <ReceiptRow
            key={index}
            label={`${line.quantity} × ${line.description}`}
            value={omrOfRials(line.amount)}
          />
        ))}
      </div>

      <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
        <ReceiptRow label={t('pos.totals.items')} value={omr(toBaisa(totals.subtotal))} />
        {totals.itemDiscount > 0 ? (
          <ReceiptRow
            label={t('pos.totals.lineDiscounts')}
            value={omrSigned(-toBaisa(totals.itemDiscount))}
          />
        ) : null}
        {totals.headerDiscount > 0 ? (
          <ReceiptRow
            label={t('pos.totals.saleDiscount')}
            value={omrSigned(-toBaisa(totals.headerDiscount))}
          />
        ) : null}
        <ReceiptRow label={t('pos.done.beforeVat')} value={omr(toBaisa(totals.taxable))} />
        <ReceiptRow label={t('pos.totals.vatMixed')} value={omr(toBaisa(totals.vat))} />
        <ReceiptRow label={t('pos.pay.sale')} value={omr(toBaisa(sale.receipt.invoiceTotal))} />
        {sale.receipt.tip > 0 ? (
          <ReceiptRow label={t('pos.done.tipNoVat')} value={omr(toBaisa(sale.receipt.tip))} />
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-dashed border-border-subtle pt-3">
        <span className="text-sm font-semibold uppercase tracking-[0.04em] text-text-primary">
          {t('pos.total')}
        </span>
        <span className="inline-flex items-baseline gap-1 text-base font-semibold text-text-primary">
          <Rial />
          {omr(toBaisa(sale.receipt.invoiceTotal) + toBaisa(sale.receipt.tip))}
        </span>
      </div>

      <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
        {sale.payments.map((payment, index) => (
          <ReceiptRow
            key={index}
            label={
              payment.method === 'CARD' && payment.cardApprovalCode?.trim()
                ? t('pos.done.cardApproval', { code: payment.cardApprovalCode.trim() })
                : t(METHOD_KEYS[payment.method])
            }
            value={omr(toBaisa(payment.amount))}
          />
        ))}
        <ReceiptRow label={t('pos.done.change')} value={omr(change)} />
      </div>

      <div className="mt-5 flex flex-col items-center gap-2">
        <ReceiptQr saleId={sale.saleId} status={sale.receipt.qr.status} />
        <p className="mt-1 text-[11px] font-medium text-text-quaternary">
          {t('pos.done.thankYou')}
          {locale === 'ar' ? null : ' · شكراً لكم'}
        </p>
      </div>
    </div>
  )
}
