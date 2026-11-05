import { ApiError } from '../api'
import type { InvoiceDetailDto, InvoiceDispatchDto } from '../api/invoices/detail'

/** CL-08-OM-HS lists it as "Other": the code for goods no closer code describes (owner v2 A1). */
export const OTHER_HS_CODE = '000000000000'

/** The dispatcher's token for a goods line issued without an HS code (AuthoredInvoiceDispatchOutboxAdapter). */
const HS_CODE_HOLD = 'LINE_HS_CODE_MISSING'

/**
 * Held at dispatch for a missing HS code: the only hold POST held-hs-codes releases. A hold for any
 * other reason is refused there (INVOICE_HELD_FOR_ANOTHER_REASON), so the action is not offered.
 */
export function isHeldForHsCode(dispatch: InvoiceDispatchDto | null): boolean {
  return dispatch?.state === 'DEAD_LETTERED' && dispatch.reasonCode === HS_CODE_HOLD
}

/** The goods lines issued with no HS code: the only lines the server lets take one. */
export function missingHsLines(invoice: Pick<InvoiceDetailDto, 'lines'>): InvoiceDetailDto['lines'] {
  return invoice.lines.filter(
    (line) => line.classification?.goodsOrService === 'G' && !line.classification?.hsCode,
  )
}

/** Refusals of `POST /authored-invoices/{id}/held-hs-codes` (HeldInvoiceHsCodeService, Invoice.amendHeldHsCodes). */
const REFUSALS: Record<string, string> = {
  STALE_INVOICE_VERSION: 'heldHs.refused.stale',
  INVOICE_NOT_HELD: 'heldHs.refused.notHeld',
  INVOICE_RECEIPT_ISSUED_AT_TILL: 'heldHs.refused.tillReceipt',
  INVOICE_DELIVERED_TO_BUYER: 'heldHs.refused.delivered',
  HELD_INVOICE_ALREADY_SENT: 'heldHs.refused.alreadySent',
  DELIVERY_STATE_UNAVAILABLE: 'heldHs.refused.stateUnavailable',
  DISPATCH_IN_PROGRESS: 'heldHs.refused.inProgress',
  INVOICE_HELD_FOR_ANOTHER_REASON: 'heldHs.refused.otherHold',
  INVOICE_UNDER_LEGAL_HOLD: 'heldHs.refused.legalHold',
  HS_CODE_AMENDMENT_REASON_REQUIRED: 'heldHs.refused.reasonRequired',
  HS_CODE_AMENDMENT_EMPTY: 'heldHs.refused.empty',
}

/** The same refusals, about one line; each has a sentence for a body that does not name it. */
const LINE_REFUSALS: Record<string, string> = {
  HS_CODE_INVALID: 'heldHs.refused.invalid',
  HS_CODE_AMENDMENT_LINE_UNKNOWN: 'heldHs.refused.lineUnknown',
  HS_CODE_AMENDMENT_NOT_GOODS: 'heldHs.refused.notGoods',
  HS_CODE_AMENDMENT_ALREADY_SET: 'heldHs.refused.alreadySet',
  HS_CODE_AMENDMENT_LINE_REPEATED: 'heldHs.refused.repeated',
}

/** Its sentence, or null for a refusal this page does not word (the caller's general failure). */
export function heldHsRefusal(error: unknown): { key: string; values: Record<string, string> } | null {
  if (!(error instanceof ApiError) || !error.code) return null
  if (Object.hasOwn(REFUSALS, error.code)) return { key: REFUSALS[error.code], values: {} }
  if (!Object.hasOwn(LINE_REFUSALS, error.code)) return null
  const line = error.problem.line
  // Only a whole number is put in the sentence; otherwise the sentence that names no line.
  return typeof line === 'number' && Number.isInteger(line) && line > 0
    ? { key: `${LINE_REFUSALS[error.code]}.line`, values: { line: String(line) } }
    : { key: `${LINE_REFUSALS[error.code]}.any`, values: {} }
}
