import type { PosPrintedQr, PosPrintedTotals, PosQrProfile, PosSaleRequest } from '../api/pos/pos'
import { encodeQr, qrAmounts, qrIssueMoment, type QrFields } from './posQr'

/**
 * The receipt QR of a sale queued offline (QR E-1, design A), built on the till from exactly what the
 * server will file: the number the till claimed, the profile's seller name and VATIN, soldAt's date
 * in `issueDateZone` and its time in `issueTimeZone`, and the printed totals at `amountScale`. The
 * server builds its own after issue and compares the two byte for byte; a difference holds the
 * invoice (PRINTED_QR_DIFFERS), so nothing here may adjust a number, a time or a total to make a QR.
 *
 * Null means "QR to follow", exactly as before E-1: no profile (the server flag is off, or a value
 * could not be stated), a company buyer (a business or government buyer never gets a receipt QR),
 * anything the profile states that this build cannot honour, or any encoding check failing. A QR
 * never stops a sale.
 */
export async function offlinePrintedQr(
  profile: PosQrProfile | null | undefined,
  sale: Pick<PosSaleRequest, 'invoiceNumber' | 'soldAt' | 'customer'>,
  printed: PosPrintedTotals | undefined,
): Promise<PosPrintedQr | null> {
  try {
    if (!profile || !printed || !sale.invoiceNumber) return null
    const kind = sale.customer?.kind
    if (kind !== 'WALK_IN' && kind !== 'CONSUMER') return null
    // Profit margin ('02') is not sold offline; any other value is not a profile this build knows.
    if (profile.invoiceType !== '01') return null
    if (typeof profile.profileVersion !== 'string' || !/^[0-9a-f]{64}$/.test(profile.profileVersion)) return null
    const scale = profile.amountScale
    const taxable = atScale(printed.taxable, scale)
    const vat = atScale(printed.vat, scale)
    if (taxable === null || vat === null) return null
    const amounts = qrAmounts(taxable, vat, scale)
    // qrIssueMoment answers only for Asia/Muscat, so any other zone gives no QR (E-2, T-X6).
    const day = qrIssueMoment(sale.soldAt, profile.issueDateZone)
    const clock = qrIssueMoment(sale.soldAt, profile.issueTimeZone)
    if (!amounts || !day || !clock) return null
    const fields: QrFields = {
      qrVersion: profile.qrVersion,
      invoiceType: '01',
      invoiceNumber: sale.invoiceNumber,
      sellerName: profile.sellerName,
      sellerVatin: profile.sellerVatin,
      issueDate: day.issueDate,
      issueTime: clock.issueTime,
      totalWithVat: amounts.totalWithVat,
      vatTotal: amounts.vatTotal,
    }
    const qr = await encodeQr(fields)
    return qr
      ? { payload: qr.payload, sellerUuid: qr.sellerUuid, profileVersion: profile.profileVersion }
      : null
  } catch {
    return null
  }
}

/**
 * A printed total as plain decimal text at the profile's scale. The printed totals are JSON numbers;
 * one that does not sit exactly on that scale gives no QR rather than a rounded one, since rounding
 * here would put a figure on the QR the receipt does not print.
 */
function atScale(value: number, scale: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) return null
  const text = value.toFixed(scale)
  return Number(text) === value ? text : null
}
