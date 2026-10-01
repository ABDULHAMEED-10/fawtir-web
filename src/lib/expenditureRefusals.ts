import { ApiError } from '../api'

/**
 * The Expenditure module's named refusals, as sentences a person can act on.
 *
 * `ExpenditureApprovalException` answers `400` with a problem document whose `type` ends in
 * `expenditure-refused` and whose `error` names the rule that was broken. Until this existed every
 * one of them rendered as "Something went wrong. Please try again." — which is not merely unhelpful
 * but wrong: none of these succeed on a retry. They are decisions, not faults.
 *
 * **Keyed on `error`, never on `detail`.** The detail is English prose built from ids and amounts
 * and must never reach an Arabic screen.
 *
 * **Deliberately partial.** The module defines over two hundred codes, and the great majority are
 * internal invariants ("a bill must name its tenant") that no screen can provoke — a person only
 * ever sees them if something else is already broken. Mapped here are the refusals the built
 * screens can actually produce; everything else falls to {@link REFUSAL_FALLBACK_KEY}, which says
 * the server refused the request and offers the reference, rather than inviting a retry that
 * cannot work. Add a code here when a screen starts being able to cause it.
 */
export const REFUSAL_FALLBACK_KEY = 'apiErrors.refused.generic'

const REFUSALS: Record<string, string> = {
  // Applying a received credit note (CreditNoteApplyGuard).
  CREDIT_NOTE_SUPPLIER_MISMATCH: 'apiErrors.refused.creditNoteSupplierMismatch',
  CREDIT_NOTE_CURRENCY_MISMATCH: 'apiErrors.refused.creditNoteCurrencyMismatch',
  CREDIT_NOTE_ALREADY_APPLIED_TO_BILL: 'apiErrors.refused.creditNoteAlreadyApplied',
  CREDIT_NOTE_APPLY_EXCEEDS_BILL: 'apiErrors.refused.creditNoteExceedsBill',
  CREDIT_NOTE_APPLY_EXCEEDS_CREDIT: 'apiErrors.refused.creditNoteExceedsCredit',
  CREDIT_NOTE_TARGET_NOT_PAYABLE: 'apiErrors.refused.creditNoteTargetNotPayable',
  CREDIT_NOTE_APPLY_AMOUNT_INVALID: 'apiErrors.refused.applyAmountInvalid',
  // Refunding one.
  CREDIT_NOTE_REFUND_EXCEEDS_CREDIT: 'apiErrors.refused.creditNoteExceedsCredit',
  CREDIT_NOTE_REFUND_AMOUNT_INVALID: 'apiErrors.refused.refundAmountInvalid',
  CREDIT_NOTE_REFUND_DATE_REQUIRED: 'apiErrors.refused.refundDateRequired',

  // Deciding on a supplier's debit note.
  DEBIT_NOTE_ALREADY_DECIDED: 'apiErrors.refused.debitNoteAlreadyDecided',
  DEBIT_NOTE_REFUSAL_REASON_REQUIRED: 'apiErrors.refused.debitNoteReasonRequired',
  DEBIT_NOTE_REASON_TOO_LONG: 'apiErrors.refused.debitNoteReasonTooLong',

  // Walking a purchase order through its states.
  PURCHASE_ORDER_TRANSITION_INVALID: 'apiErrors.refused.orderTransitionInvalid',
  PURCHASE_ORDER_NOT_EDITABLE: 'apiErrors.refused.orderNotEditable',
  PURCHASE_ORDER_CONCURRENT_UPDATE: 'apiErrors.refused.orderConcurrentUpdate',
  PURCHASE_ORDER_LINES_REQUIRED: 'apiErrors.refused.orderLinesRequired',

  // Booking goods in against one.
  GOODS_RECEIPT_OVER_RECEIPT: 'apiErrors.refused.overReceipt',
  GOODS_RECEIPT_LINES_REQUIRED: 'apiErrors.refused.receiptLinesRequired',
  GOODS_RECEIPT_LINE_QUANTITY_INVALID: 'apiErrors.refused.receiptQuantityInvalid',
  GOODS_RECEIPT_DATE_REQUIRED: 'apiErrors.refused.receiptDateRequired',

  // Saving reminder rules.
  REMINDER_RULE_NEEDS_RECIPIENT: 'apiErrors.refused.reminderNeedsRecipient',
  REMINDER_RULE_NOT_CONFIGURABLE: 'apiErrors.refused.reminderNotConfigurable',
  REMINDER_RULE_REPEAT_OUT_OF_RANGE: 'apiErrors.refused.reminderRepeatOutOfRange',
  REMINDER_RULE_TOO_MANY_RECIPIENTS: 'apiErrors.refused.reminderTooManyRecipients',
  REMINDER_RULE_ESCALATION_NOT_ALLOWED: 'apiErrors.refused.reminderEscalationNotAllowed',
  REMINDER_RULE_DUPLICATE: 'apiErrors.refused.reminderDuplicate',
  // The page stops a rule with no timing itself and says so under the rule; the server's refusal
  // of one (an older tab, someone else's change) says the same sentence, from the same key.
  REMINDER_RULE_EMPTY: 'expenditureReminders.error.noTiming',
  REMINDER_RULE_REPEAT_NOT_ALLOWED: 'apiErrors.refused.reminderRepeatNotAllowed',
  // A null among the people: the same sentence as a rule that names nobody.
  REMINDER_RULE_RECIPIENT_REQUIRED: 'apiErrors.refused.reminderNeedsRecipient',
  REMINDER_RULE_RECIPIENT_UNKNOWN: 'apiErrors.refused.reminderRecipientUnknown',
  REMINDER_RULE_OFFSET_OUT_OF_RANGE: 'apiErrors.refused.reminderDaysOutOfRange',
  REMINDER_RULE_ESCALATION_OUT_OF_RANGE: 'apiErrors.refused.reminderDaysOutOfRange',

  // Bills and payments reachable from the same screens.
  BILL_NOT_FOUND: 'apiErrors.refused.billNotFound',
  BILL_NOT_READY_FOR_PAYMENT: 'apiErrors.refused.billNotReadyForPayment',
  BILL_HOLD_ALREADY_OPEN: 'apiErrors.refused.holdAlreadyOpen',
  BILL_HOLD_NOT_OPEN: 'apiErrors.refused.holdNotOpen',
  BILL_HOLD_ON_PAID_REFUSED: 'apiErrors.refused.holdOnPaid',
  BILL_PAYMENT_CURRENCY_MISMATCH: 'apiErrors.refused.paymentCurrencyMismatch',
  BILL_PAYMENT_ALREADY_REVERSED: 'apiErrors.refused.paymentAlreadyReversed',
  APPROVAL_ALREADY_GIVEN: 'apiErrors.refused.approvalAlreadyGiven',
  APPROVAL_REJECTION_REASON_REQUIRED: 'apiErrors.refused.approvalReasonRequired',
  // Exporting or marking paid a run that holds a held bill. Draft wording, pending the owner
  // (Wording-For-Abdul.md row 17). The payment run screens name this code themselves
  // (`RUN_REFUSALS`), so this is what any other screen says.
  PAYMENT_RUN_BILL_ON_HOLD: 'apiErrors.refused.paymentRunBillOnHold',
  // Reachable from Settings > Bill approvals since E-17.
  APPROVAL_POLICY_INVALID: 'apiErrors.refused.approvalPolicyInvalid',
}

/** A refusal the Expenditure module made by name, as opposed to a validation or transport failure. */
export function isExpenditureRefusal(error: unknown): error is ApiError {
  return error instanceof ApiError && error.problemType === 'expenditure-refused'
}

/**
 * The message key for a refusal, or null when this is not one.
 *
 * An unmapped code still resolves — to the fallback — because a screen must never render a raw
 * code, and i18next answers a missing key with the key itself.
 */
export function refusalMessageKey(error: unknown): string | null {
  if (!isExpenditureRefusal(error)) return null
  const code = error.code
  if (code === null) return REFUSAL_FALLBACK_KEY
  return REFUSALS[code] ?? REFUSAL_FALLBACK_KEY
}

/** The codes this build has a sentence for. Exported so a test can pin the set. */
export const MAPPED_REFUSAL_CODES = Object.freeze(Object.keys(REFUSALS))
