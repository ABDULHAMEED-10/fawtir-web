import type {
  InvoiceDetailDto,
  InvoiceHistoryDto,
  InvoiceReceivableDto,
} from '../api/invoices/detail'
import type { AgreementDto } from '../api/selfBilling/agreements'
import { lineTotals, timelineOf } from './invoiceDetail'
import { lapsed } from './selfBillingAgreements'

/**
 * Self-billed invoice detail (Figma 154:167694), written from what the API holds.
 *
 * The frame draws three independent tracks at the top: how the document reached the supplier
 * over Peppol, whether the Tax Authority accepted it, and whether the supplier has confirmed it.
 * The platform answers only the first (`deliveryState`, and the response code when it is
 * reported). TODO(backend): no OTA verdict and no supplier confirmation or dispute exist on any
 * response (docs/backend-guides/INCOME.md §7.2), so those two tracks, the status
 * pill's "Awaiting confirmation" and the open item at the top of the history are drawn as the
 * design draws them, from the delivery facts, until the states arrive.
 */

export type TrackTone = 'success' | 'pending' | 'danger' | 'muted'

export type SelfBillTrack = {
  id: 'peppol' | 'ota' | 'supplier'
  labelKey: string
  valueKey: string
  values?: Record<string, string | number>
  tone: TrackTone
  /** The Peppol response code chip beside the value, when one was reported. */
  code: string | null
  noteKey: string
  noteValues?: Record<string, string | number>
}

export type SelfBillStatusTone = 'muted' | 'info' | 'pending' | 'success'

/** Whole days from `from` (an ISO day or instant) to `today`, never negative. */
export function daysSince(from: string | null, today: string): number {
  if (!from) return 0
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${today}T00:00:00Z`)
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

export function isDelivered(invoice: InvoiceDetailDto): boolean {
  return invoice.deliveryState === 'DELIVERED' || Boolean(invoice.peppolResponse)
}

/**
 * The status pill under the number. A draft, a cancellation and a paid document are the API's
 * own words; an issued document that nobody has confirmed reads as the design's "Awaiting
 * confirmation" (TODO(backend): no confirmation state), or "To be sent" while it has not left.
 */
export function selfBillStatus(
  invoice: InvoiceDetailDto,
  receivable: InvoiceReceivableDto | null,
): { key: string; tone: SelfBillStatusTone } {
  if (invoice.authoringState === 'DRAFT')
    return { key: 'selfBillDetail.status.draft', tone: 'muted' }
  if (invoice.authoringState === 'CANCELLED' || invoice.authoringState === 'DISCARDED')
    return { key: 'selfBillDetail.status.cancelled', tone: 'muted' }
  if (receivable?.paymentState === 'PAID')
    return { key: 'selfBillDetail.status.paid', tone: 'success' }
  if (invoice.deliveryState === 'NOT_SUBMITTED')
    return { key: 'selfBillDetail.status.toBeSent', tone: 'info' }
  return { key: 'selfBillDetail.status.awaitingConfirmation', tone: 'pending' }
}

const RESPONSE_NOTE: Record<string, string> = {
  AB: 'selfBillDetail.peppol.acceptedWithWarnings',
  AP: 'selfBillDetail.peppol.accepted',
  RE: 'selfBillDetail.peppol.rejected',
}

export function selfBillTracks(
  invoice: InvoiceDetailDto,
  context: { supplier: string; today: string; deliveredAt: string | null },
): SelfBillTrack[] {
  const draft = invoice.authoringState === 'DRAFT'
  const delivered = isDelivered(invoice)
  const code = invoice.peppolResponse ?? null

  const peppol: SelfBillTrack = draft
    ? {
        id: 'peppol',
        labelKey: 'selfBillDetail.tracks.peppol',
        valueKey: 'selfBillDetail.peppol.notSent',
        tone: 'muted',
        code: null,
        noteKey: 'selfBillDetail.peppol.afterIssue',
      }
    : delivered
      ? {
          id: 'peppol',
          labelKey: 'selfBillDetail.tracks.peppol',
          valueKey:
            code === 'RE'
              ? 'selfBillDetail.peppol.rejectedValue'
              : 'selfBillDetail.peppol.delivered',
          tone: code === 'RE' ? 'danger' : 'success',
          code,
          noteKey: code ? RESPONSE_NOTE[code] : 'selfBillDetail.peppol.deliveredNote',
          noteValues: { when: context.deliveredAt ?? '' },
        }
      : invoice.deliveryState === 'SENT_MANUALLY'
        ? {
            id: 'peppol',
            labelKey: 'selfBillDetail.tracks.peppol',
            valueKey: 'selfBillDetail.peppol.sentManually',
            tone: 'success',
            code: null,
            noteKey: 'selfBillDetail.peppol.sentManuallyNote',
          }
        : {
            id: 'peppol',
            labelKey: 'selfBillDetail.tracks.peppol',
            valueKey: 'selfBillDetail.peppol.notSent',
            tone: 'pending',
            code: null,
            noteKey: 'selfBillDetail.peppol.notSentNote',
          }

  // TODO(backend): the Tax Authority's verdict is not reported on any response.
  const ota: SelfBillTrack = {
    id: 'ota',
    labelKey: 'selfBillDetail.tracks.ota',
    valueKey: 'selfBillDetail.ota.notReported',
    tone: draft || !delivered ? 'muted' : 'pending',
    code: null,
    noteKey:
      draft || !delivered
        ? 'selfBillDetail.ota.afterDelivery'
        : 'selfBillDetail.ota.notReportedNote',
  }

  // TODO(backend): nothing records a supplier's confirmation or dispute.
  const supplier: SelfBillTrack =
    draft || !delivered
      ? {
          id: 'supplier',
          labelKey: 'selfBillDetail.tracks.supplier',
          valueKey: 'selfBillDetail.supplier.notAsked',
          tone: 'muted',
          code: null,
          noteKey: 'selfBillDetail.supplier.afterDelivery',
        }
      : {
          id: 'supplier',
          labelKey: 'selfBillDetail.tracks.supplier',
          valueKey: 'selfBillDetail.supplier.awaiting',
          values: { count: daysSince(invoice.deliveredAt ?? invoice.issueDate, context.today) },
          tone: 'pending',
          code: null,
          noteKey: 'selfBillDetail.supplier.awaitingNote',
          noteValues: { supplier: context.supplier },
        }

  return [peppol, ota, supplier]
}

/** The note under the Agreement field: how long the agreement on file has left, if it is ending. */
export function agreementNote(
  agreement: AgreementDto | null,
  today: string,
): { key: string; values?: Record<string, number>; tone: 'pending' | 'danger' } | null {
  if (!agreement || agreement.effectiveTo === null) return null
  if (lapsed(agreement, today)) return { key: 'selfBillDetail.agreementLapsed', tone: 'danger' }
  const left = daysSince(today, agreement.effectiveTo)
  return left <= 30
    ? { key: 'selfBillDetail.agreementExpiresIn', values: { count: left }, tone: 'pending' }
    : null
}

export type SelfBillItem = {
  lineNumber: number
  description: string
  unit: string
  productCode: string | null
  unitPrice: number
  vatRate: number | null
  quantity: number
  discountLabel: string
  total: number
}

export function selfBillItems(invoice: InvoiceDetailDto): SelfBillItem[] {
  const totals = lineTotals(invoice)
  return invoice.lines.map((line) => ({
    lineNumber: line.lineNumber,
    description: line.description,
    unit: line.unitCode,
    productCode: line.productCode,
    unitPrice: line.unitPrice,
    vatRate: line.taxRate,
    quantity: line.quantity,
    discountLabel:
      line.discountValue === 0
        ? '0'
        : line.discountType === 'PERCENTAGE'
          ? `${line.discountValue}%`
          : String(line.discountValue),
    total: totals.get(line.lineNumber) ?? 0,
  }))
}

export type SelfBillEvent = {
  id: string
  titleKey: string
  titleValues?: Record<string, string | number>
  detailKey: string | null
  detailValues?: Record<string, string | number>
  /** An ISO instant, or null for the open item whose "timestamp" is how long it has been open. */
  at: string | null
  openForDays?: number
  tone: 'current' | 'done'
}

/**
 * The history, newest first as the frame draws it. The open item at the top (waiting for the
 * supplier) is drawn while the document is with the supplier and nothing has been recorded since;
 * TODO(backend): it is the design's, not a recorded event, until a confirmation state exists.
 */
export function selfBillTimeline(
  invoice: InvoiceDetailDto,
  history: InvoiceHistoryDto,
  context: { userId: string | null; supplier: string; today: string; paid: boolean },
): SelfBillEvent[] {
  const recorded: SelfBillEvent[] = timelineOf(history, context.userId)
    .map((entry, index) => ({
      id: `h-${index}`,
      titleKey: entry.key,
      detailKey: entry.outcome
        ? 'selfBillDetail.history.outcome'
        : entry.byYou
          ? 'selfBillDetail.history.byYou'
          : null,
      detailValues: entry.outcome ? { outcome: entry.outcome } : undefined,
      at: entry.at,
      tone: 'done' as const,
    }))
    .sort((a, b) => (a.at! < b.at! ? 1 : -1))
  const waiting = invoice.authoringState === 'ISSUED' && isDelivered(invoice) && !context.paid
  if (!waiting) return recorded
  return [
    {
      id: 'open',
      titleKey: 'selfBillDetail.history.waitingTitle',
      titleValues: { supplier: context.supplier },
      detailKey: 'selfBillDetail.history.waitingDetail',
      at: null,
      openForDays: daysSince(invoice.deliveredAt ?? invoice.issueDate, context.today),
      tone: 'current',
    },
    ...recorded,
  ]
}
