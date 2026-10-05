import { ApiError } from '../api'
import type {
  InvoiceBuyerDeliveryDto,
  InvoiceDispatchDto,
  InvoiceDispatchStateDto,
  InvoiceSendResultDto,
} from '../api/invoices/detail'

/** A sentence key and its values; the values are tokens, so always strings. */
export type DispatchNote = { key: string; values?: Record<string, string> }

/**
 * What the screen says about an issued document's journey to the network, written only from
 * `InvoiceDispatchDto`. The server decides every state and whether Send may be pressed; this only
 * chooses the sentence.
 */

const STATE_KEYS: Record<InvoiceDispatchStateDto, string | null> = {
  // A draft owes nothing yet; the page says nothing rather than "not sent".
  NOT_OWED: null,
  NOT_SENT: 'invoiceDispatch.state.notSent',
  PROCESSING: 'invoiceDispatch.state.processing',
  RETRY_SCHEDULED: 'invoiceDispatch.state.retryScheduled',
  DEAD_LETTERED: 'invoiceDispatch.state.deadLettered',
  CANCELLED: 'invoiceDispatch.state.cancelled',
  DISPATCHED: 'invoiceDispatch.state.dispatched',
  QUEUED: 'invoiceDispatch.state.queued',
  SENDING: 'invoiceDispatch.state.sending',
  SENT: 'invoiceDispatch.state.sent',
  DELIVERED: 'invoiceDispatch.state.delivered',
  DELIVERED_UNCONFIRMED: 'invoiceDispatch.state.deliveredUnconfirmed',
  UNDELIVERABLE: 'invoiceDispatch.state.undeliverable',
}

/**
 * The sentence for each reason token the dispatcher records. A refusal about data frozen at issue
 * (an address, a line's classification) is final: the document cannot change, so the sentence says
 * what to do instead of "try again".
 */
export const DISPATCH_REASONS: Record<string, string> = {
  SELLER_ADDRESS_INCOMPLETE: 'invoiceDispatch.reason.sellerAddress',
  SELLER_CONTACT_INCOMPLETE: 'invoiceDispatch.reason.sellerContact',
  BUYER_ADDRESS_INCOMPLETE: 'invoiceDispatch.reason.buyerAddress',
  LINE_GOODS_OR_SERVICE_MISSING: 'invoiceDispatch.reason.lineClassification',
  LINE_INDUSTRIAL_CLASSIFICATION_MISSING: 'invoiceDispatch.reason.lineClassification',
  LINE_HS_CODE_MISSING: 'invoiceDispatch.reason.lineHsCode',
  LINE_TAX_REASON_CODE_MISSING: 'invoiceDispatch.reason.lineTaxReason',
  SELF_BILLED_SIMPLIFIED_UNSUPPORTED: 'invoiceDispatch.reason.unsupportedShape',
  THIRD_PARTY_SELF_BILLED_UNSUPPORTED: 'invoiceDispatch.reason.unsupportedShape',
  BTOM_032_CREDIT_NOTE_REASON_MISSING: 'invoiceDispatch.reason.correctionReason',
  PRECEDING_INVOICE_UNAVAILABLE: 'invoiceDispatch.reason.precedingUnavailable',
  PINT_OM_VALIDATION_FAILED: 'invoiceDispatch.reason.validationFailed',
  SUBMISSION_NOT_SUPPORTED: 'invoiceDispatch.reason.notSupported',
  AUTHORED_INVOICE_NOT_MAPPABLE: 'invoiceDispatch.reason.notSupported',
  DUPLICATE_SUBMISSION_CONFLICT: 'invoiceDispatch.reason.duplicateConflict',
  INVOICE_NO_LONGER_ISSUED: 'invoiceDispatch.reason.noLongerIssued',
  INVOICE_CANCELLED: 'invoiceDispatch.reason.noLongerIssued',
  AUTHORED_INVOICE_DISPATCH_ERROR: 'invoiceDispatch.reason.temporary',
}

function reasonNote(code: string | null): DispatchNote | null {
  if (!code) return null
  const key = DISPATCH_REASONS[code]
  return key ? { key } : { key: 'invoiceDispatch.reason.unknown', values: { code } }
}

/** The state sentence, and the reason beneath it when the server recorded one. */
export function dispatchNotes(dispatch: InvoiceDispatchDto): { state: DispatchNote | null; reason: DispatchNote | null } {
  const key = STATE_KEYS[dispatch.state]
  const failed =
    dispatch.state === 'RETRY_SCHEDULED' || dispatch.state === 'DEAD_LETTERED'
  return { state: key ? { key } : null, reason: failed ? reasonNote(dispatch.reasonCode) : null }
}

/** Whether the document has left Fawtir's hands, for the delivery bar's tick. */
export function dispatchSucceeded(dispatch: InvoiceDispatchDto | null): boolean {
  return (
    dispatch !== null &&
    (dispatch.state === 'SENT' ||
      dispatch.state === 'DELIVERED' ||
      dispatch.state === 'DELIVERED_UNCONFIRMED')
  )
}

/**
 * Re-read only while the server is mid-step: a send in flight, or a transmission under way. A
 * queued document waits on the transport schedule, which can be hours, so it is not watched.
 */
export function dispatchIsMoving(dispatch: InvoiceDispatchDto | null): boolean {
  return dispatch !== null && (dispatch.state === 'PROCESSING' || dispatch.state === 'SENDING')
}

/** What a completed Send says, from its outcome and reason. */
export function sendResultNote(result: InvoiceSendResultDto): DispatchNote {
  switch (result.outcome) {
    case 'DISPATCHED':
      return { key: 'invoiceDispatch.sent.dispatched' }
    case 'ALREADY_DISPATCHED':
      return { key: 'invoiceDispatch.sent.already' }
    case 'SUPERSEDED':
      return { key: 'invoiceDispatch.sent.superseded' }
    case 'RETRY_SCHEDULED':
    case 'REFUSED':
    case 'DEAD_LETTERED':
    default:
      return reasonNote(result.reasonCode) ?? { key: 'invoiceDispatch.sent.notSent' }
  }
}

/** Refusals of the Send request itself (`code` on the problem body), before anything was processed. */
export const SEND_REFUSALS: Record<string, string> = {
  INVOICE_NOT_SENDABLE: 'invoiceDispatch.refused.notSendable',
  DISPATCH_IN_PROGRESS: 'invoiceDispatch.refused.inProgress',
  DISPATCH_DEAD_LETTERED: 'invoiceDispatch.refused.deadLettered',
  DISPATCH_UNAVAILABLE: 'invoiceDispatch.refused.unavailable',
}

export function sendRefusalKey(error: unknown): string | null {
  return error instanceof ApiError && error.code ? (SEND_REFUSALS[error.code] ?? null) : null
}

const BUYER_KEYS: Record<InvoiceBuyerDeliveryDto, string> = {
  PEPPOL: 'invoiceDispatch.buyer.peppol',
  NOT_PERMITTED: 'invoiceDispatch.buyer.notPermitted',
  EMAIL_PENDING: 'invoiceDispatch.buyer.emailPending',
  EMAIL_HELD: 'invoiceDispatch.buyer.emailHeld',
  EMAIL_SENT: 'invoiceDispatch.buyer.emailSent',
  EMAIL_FAILED: 'invoiceDispatch.buyer.emailFailed',
  SENT_MANUALLY: 'invoiceDispatch.buyer.sentManually',
  PRINTED_RECEIPT: 'invoiceDispatch.buyer.printedReceipt',
  MANUAL_REQUIRED: 'invoiceDispatch.buyer.manualRequired',
  SELF_BILLING: 'invoiceDispatch.buyer.selfBilling',
}

/**
 * How the buyer is being reached, as the server recorded it. A registered Peppol receiver reads
 * "Peppol" whatever the customer preferred: the route is the network's, not the preference's.
 */
export function buyerDeliveryNote(dispatch: InvoiceDispatchDto | null): DispatchNote | null {
  return dispatch?.buyerDelivery ? { key: BUYER_KEYS[dispatch.buyerDelivery] } : null
}

/** Refusals of a held-e-mail release, by `code`. */
export const RELEASE_REFUSALS: Record<string, string> = {
  BUYER_EMAIL_NOT_HELD: 'invoiceDispatch.release.notHeld',
  BUYER_EMAIL_DELIVERY_DISABLED: 'invoiceDispatch.release.disabled',
}
