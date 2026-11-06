import { useTranslation } from 'react-i18next'
import { posSaleQrPath, type PosSaleDto } from '../../api/pos/pos'
import { API_BASE_URL } from '../../config/api'
import { initialsOf } from '../../lib/posTill'
import type { ReceiptSellerHeader } from '../../lib/posReceiptSeller'

/**
 * The parts of a till receipt that the receipt after a sale and its reprint share (QR E-5), so a
 * reprint cannot word or lay out the seller, a row or the QR differently from the original.
 */

export function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
      <span dir="ltr" className="text-xs font-semibold tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  )
}

/** The seller and the document's title at the top of the paper. */
export function ReceiptMasthead({
  seller,
  liveVatNumber,
  fullInvoice,
  locale,
}: {
  seller: ReceiptSellerHeader
  /** The live profile's VAT number, printed only when the server stated no frozen seller. */
  liveVatNumber: string | null
  fullInvoice: boolean
  locale: string
}) {
  const { t } = useTranslation()
  const name = seller.name ?? ''
  const address = seller.address
  return (
    <>
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
        {initialsOf(name || 'F')}
      </span>
      <p className="mt-3 text-base font-semibold text-text-primary">
        {seller.source === 'frozen' && seller.name == null
          ? t('pos.done.sellerNameNotRecorded')
          : name}
      </p>
      <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
        {address}
        {seller.source === 'frozen' ? (
          <>
            {address ? <br /> : null}
            {t('pos.done.vat')}{' '}
            {seller.vatNumber != null ? (
              <span dir="ltr">{seller.vatNumber}</span>
            ) : (
              t('pos.done.notRecorded')
            )}
          </>
        ) : liveVatNumber != null ? (
          <>
            <br />
            {t('pos.done.vat')} <span dir="ltr">{liveVatNumber}</span>
          </>
        ) : null}
      </p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
        {fullInvoice ? t('pos.done.taxInvoice') : t('pos.done.simplifiedInvoice')}
      </p>
      {locale === 'ar' ? null : (
        <p className="font-arabic text-xs text-text-secondary">
          {fullInvoice ? 'فاتورة ضريبية' : 'فاتورة ضريبية مبسطة'}
        </p>
      )}
    </>
  )
}

/**
 * The QR a sale queued offline printed (QR E-1): the image of the `printedQr.payload` sent with it,
 * drawn as it is. The page encodes it (`useServerQrImage`) so its heading and Print wait for the
 * image, and shows no receipt at all when it cannot be drawn (QW3R-3, owner directive 2026-11-06).
 */
export function OfflineReceiptQr({ image }: { image: string }) {
  const { t } = useTranslation()
  return (
    <>
      <img src={image} alt={t('pos.done.qrAlt')} className="size-[132px]" />
      <p className="text-[11px] font-medium leading-[1.5] text-text-quaternary">
        {t('pos.done.scanToCheck')}
      </p>
    </>
  )
}

/**
 * The receipt QR as the server serves it: the PNG of `GET /pos/sales/{id}/qr`, which reads the
 * payload frozen at issue, then the filed one, then a live build. Never encoded on the device, so
 * a reprint shows the QR the customer was given, not one recomputed from today's data.
 */
export function ReceiptQr({
  saleId,
  status,
}: {
  saleId: string
  status: PosSaleDto['receipt']['qr']['status']
}) {
  const { t } = useTranslation()
  if (status === 'READY') {
    return (
      <>
        <img
          src={`${API_BASE_URL}${posSaleQrPath(saleId)}`}
          alt={t('pos.done.qrAlt')}
          className="size-[132px]"
        />
        <p className="text-[11px] font-medium leading-[1.5] text-text-quaternary">
          {t('pos.done.scanToCheck')}
        </p>
      </>
    )
  }
  if (status === 'PENDING') {
    return (
      <p className="text-[11px] font-medium leading-[1.5] text-text-quaternary">
        {t('pos.done.qrPending')}
      </p>
    )
  }
  return null
}
