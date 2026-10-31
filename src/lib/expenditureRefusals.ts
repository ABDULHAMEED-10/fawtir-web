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
  // A bill that cannot take a credit now (owner's sentences, 6 Oct 2026). Raised by the apply and
  // by an upload confirm that names a bill, which applies the credit in the same request.
  CREDIT_NOTE_TARGET_ON_HOLD: 'apiErrors.refused.creditNoteTargetOnHold',
  CREDIT_NOTE_TARGET_IN_PAYMENT_RUN: 'apiErrors.refused.creditNoteTargetInRun',
  CREDIT_NOTE_TARGET_REJECTED: 'apiErrors.refused.creditNoteTargetRejected',
  CREDIT_NOTE_TARGET_DEBIT_NOTE_REFUSED: 'apiErrors.refused.creditNoteTargetDebitNoteRefused',
  CREDIT_NOTE_TARGET_CANCELLED: 'apiErrors.refused.creditNoteTargetCancelled',
  CREDIT_NOTE_TARGET_FULLY_CREDITED: 'apiErrors.refused.creditNoteTargetFullyCredited',
  // Refunding one.
  CREDIT_NOTE_REFUND_EXCEEDS_CREDIT: 'apiErrors.refused.creditNoteExceedsCredit',
  CREDIT_NOTE_REFUND_AMOUNT_INVALID: 'apiErrors.refused.refundAmountInvalid',
  CREDIT_NOTE_REFUND_DATE_REQUIRED: 'apiErrors.refused.refundDateRequired',
  CREDIT_NOTE_REFUND_DATE_IN_FUTURE: 'apiErrors.refused.refundDateInFuture',
  CREDIT_NOTE_REFUND_DATE_BEFORE_NOTE: 'apiErrors.refused.refundDateBeforeNote',

  // Deciding on a supplier's debit note.
  DEBIT_NOTE_ALREADY_DECIDED: 'apiErrors.refused.debitNoteAlreadyDecided',
  DEBIT_NOTE_REFUSAL_REASON_REQUIRED: 'apiErrors.refused.debitNoteReasonRequired',
  DEBIT_NOTE_REASON_TOO_LONG: 'apiErrors.refused.debitNoteReasonTooLong',
  // Refusing a note already paid in full (owner's sentence, 8 Oct 2026).
  DEBIT_NOTE_ALREADY_PAID: 'apiErrors.refused.debitNoteAlreadyPaid',
  // Refusing a note paid in part (owner's sentence, 8 Oct 2026).
  DEBIT_NOTE_PARTLY_PAID: 'apiErrors.refused.debitNotePartlyPaid',

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
  // A single payment on a bill whose mismatch is unresolved (owner's answer 2, 2 Oct 2026): the
  // payment run's own sentence for the same refusal (`PAYMENT_RUN_BILL_MISMATCHED`).
  BILL_PAYMENT_MISMATCHED: 'paymentRuns.refused.mismatched',
  // A single payment on a supplier debit note that was refused (owner's sentence, 8 Oct 2026).
  BILL_PAYMENT_DEBIT_NOTE_REFUSED: 'apiErrors.refused.billPaymentDebitNoteRefused',
  // A debit note nobody has accepted is not owed yet (backend #480, 10 Oct 2026).
  BILL_PAYMENT_DEBIT_NOTE_NOT_ACCEPTED: 'apiErrors.refused.debitNoteNotAccepted',
  BILL_PAYMENT_CURRENCY_MISMATCH: 'apiErrors.refused.paymentCurrencyMismatch',
  BILL_PAYMENT_ALREADY_REVERSED: 'apiErrors.refused.paymentAlreadyReversed',
  // Reversing a payment of a bill in a run whose bank file is made (owner's sentence, 8 Oct 2026).
  BILL_PAYMENT_REVERSAL_IN_SENT_RUN: 'apiErrors.refused.paymentReversalInSentRun',
  // 409 on reversing the bill side of a till paid-out (backend V536, FIN-M3 §4.3.6): its correction is
  // open question OQ-F18, so the sentence offers no other route.
  BILL_PAYMENT_PAID_FROM_TILL: 'apiErrors.refused.paymentPaidFromTill',
  APPROVAL_ALREADY_GIVEN: 'apiErrors.refused.approvalAlreadyGiven',
  APPROVAL_REJECTION_REASON_REQUIRED: 'apiErrors.refused.approvalReasonRequired',
  // Reopening a rejected bill (backend V523) with no reason.
  APPROVAL_REOPEN_REASON_REQUIRED: 'billDetail.refused.reopenReasonRequired',
  // Exporting or marking paid a run that holds a held bill. The payment run screens name this
  // code themselves (`RUN_REFUSALS`), so this is what any other screen says.
  PAYMENT_RUN_BILL_ON_HOLD: 'apiErrors.refused.paymentRunBillOnHold',
  // The supplier import, a file whose header row is neither template's (owner's Round 5
  // answer 5, 2 Oct 2026: his sentence in both languages). The detail names the column, in English.
  SUPPLIER_IMPORT_HEADER_NOT_RECOGNISED: 'stagedImport.refused.headerNotRecognised',
  // Reachable from Settings > Bill approvals since E-17.
  APPROVAL_POLICY_INVALID: 'apiErrors.refused.approvalPolicyInvalid',
  // The note a decision on a held Peppol copy carries (backend V493).
  BILL_DUPLICATE_RESOLUTION_NOTE_REQUIRED: 'billDetail.duplicate.refused.noteRequired',
  BILL_DUPLICATE_RESOLUTION_NOTE_TOO_LONG: 'billDetail.duplicate.refused.noteTooLong',
}

/**
 * The refusals whose sentence names a value the server sends beside the code. The run is read as
 * the bill pages read it: an empty run where a server sends none.
 */
const REFUSAL_VALUES: Record<
  string,
  (problem: Readonly<Record<string, unknown>>) => Record<string, string>
> = {
  CREDIT_NOTE_TARGET_IN_PAYMENT_RUN: (problem) => ({
    run: String(problem.paymentRunReference ?? ''),
  }),
  CREDIT_NOTE_RELEASE_BILL_IN_PAYMENT_RUN: (problem) => ({
    run: String(problem.paymentRunReference ?? ''),
  }),
  BILL_PAYMENT_REVERSAL_IN_SENT_RUN: (problem) => ({
    run: String(problem.paymentRunReference ?? ''),
  }),
}

/** A refusal the Expenditure module made by name, as opposed to a validation or transport failure. */
export function isExpenditureRefusal(error: unknown): error is ApiError {
  return error instanceof ApiError && error.problemType === 'expenditure-refused'
}

/**
 * The module's codes that answer 409 `resource-conflict` rather than `expenditure-refused`
 * (`ExpenditureExceptionHandler.CONFLICT_CODES`), so {@link isExpenditureRefusal} never sees them.
 * Only the ones a screen here can provoke; any other 409 keeps the generic conflict sentence.
 */
const CONFLICT_REFUSALS: Record<string, string> = {
  // `/apply` or `/refund` on a note held as a later Peppol copy (backend V493), reached when the
  // hold opened after the screen was read.
  CREDIT_NOTE_HELD_AS_DUPLICATE: 'supplierCreditNotes.held.refused',
  // A keyed `/refund` (backend P0, 2026-10-31): the key was used for other figures, or its first
  // request is still running. Neither is "reload and try again": the first needs the person to
  // check what was recorded, the second to press again unchanged, which the server replays.
  CREDIT_NOTE_REFUND_IDEMPOTENCY_KEY_REUSED: 'supplierCreditNoteDetail.refundKeyReused',
  CREDIT_NOTE_REFUND_IN_PROGRESS: 'supplierCreditNoteDetail.refundInProgress',
  // Releasing a note's credit from a bill (backend #827), each about what the two hold now.
  CREDIT_NOTE_NOT_APPLIED_TO_BILL: 'supplierCreditNoteDetail.release.refused.changed',
  CREDIT_NOTE_APPLICATION_ALREADY_RELEASED: 'supplierCreditNoteDetail.release.refused.changed',
  CREDIT_NOTE_RELEASE_BILL_IN_PAYMENT_RUN: 'supplierCreditNoteDetail.release.refused.inRun',
  CREDIT_NOTE_RELEASE_OVERPAYMENT_SETTLED: 'supplierCreditNoteDetail.release.refused.overpayment',
  CREDIT_NOTE_RELEASE_DEBIT_NOTE_TARGET: 'supplierCreditNoteDetail.release.refused.debitNote',
  // Setting a note against the bill it was released from.
  CREDIT_NOTE_RELEASED_FROM_BILL: 'supplierCreditNoteDetail.release.refused.reapply',
  // A held Peppol copy (backend V493): deciding it, and the plain release it refuses.
  BILL_DUPLICATE_ALREADY_RESOLVED: 'billDetail.duplicate.refused.alreadyResolved',
  BILL_NOT_HELD_AS_DUPLICATE: 'billDetail.duplicate.refused.notHeld',
  BILL_DUPLICATE_SAME_DOCUMENT_UUID: 'billDetail.duplicate.refused.sameDocumentUuid',
  // Backend batch 43 round 19 maker-checker: the reviewer recorded one of the two documents.
  BILL_DUPLICATE_DECIDER_IS_RECORDER: 'billDetail.duplicate.refused.deciderIsRecorder',
  // Backend batch 43 round 20: a person recorded one of the pair after V229 but no recorder is
  // stored, so the server refuses rather than guess who the maker was.
  BILL_DUPLICATE_RECORDER_UNKNOWN: 'billDetail.duplicate.refused.recorderUnknown',
  // Backend batch 43 round 28: the potential coincidences changed after the page read them.
  BILL_DUPLICATE_EVIDENCE_CHANGED: 'billDetail.duplicate.refused.evidenceChanged',
  BILL_HOLD_DUPLICATE_RELEASE_REFUSED: 'billDetail.duplicate.refused.releaseRefused',
  // Approving a copy that became a held duplicate after the screen was read.
  BILL_APPROVAL_HELD_AS_DUPLICATE: 'billDetail.duplicate.refused.approvalHeld',
  // Rejecting one, likewise.
  BILL_REJECTION_HELD_AS_DUPLICATE: 'billDetail.duplicate.refused.rejectionHeld',
  // Accepting a debit note that became a held duplicate after the screen was read.
  DEBIT_NOTE_HELD_AS_DUPLICATE: 'supplierDebitNotes.held.refused',
  // A rejection is taken back by a reopen, never by an approval (backend V523, owner batch 29).
  BILL_APPROVAL_REJECTED_NEEDS_REOPEN: 'billDetail.refused.needsReopen',
  BILL_REOPEN_NOT_REJECTED: 'billDetail.refused.changed',
  BILL_REOPEN_HELD_AS_DUPLICATE: 'billDetail.duplicate.refused.reopenHeld',
  // R8: `/apply`, `/apply-what-fits` or `/apply-on-recording` on a rejected note. A row whose
  // `approval` reads REJECTED offers no "Set against" (5160f592), so this answers the rest: a note
  // rejected after the screen was read, or a row from a server that sends no `approval`.
  CREDIT_NOTE_REJECTED: 'supplierCreditNotes.refused.rejected',
  // Rejecting a standalone note that names the document it corrects, or a self-billed note tied
  // to an issued invoice (backend 1afc80536, review finding B1): once that document is on file
  // the credit is set against it whatever the decision, so the server refuses the rejection,
  // interim and fail-closed pending an owner decision. Approval is not refused, so the sentence
  // offers it.
  CREDIT_NOTE_REJECTION_NAMES_PRECEDING_DOCUMENT: 'billDetail.refused.creditNotePrecedingDocument',
  // Booking goods in (backend V519, DEC-30-08): the whole receipt is refused and nothing is received.
  PRODUCT_STOCK_UNIT_MISMATCH: 'apiErrors.refused.receiptStockUnitMismatch',
  // A line written before V519 recorded no unit, and the receipt stated none (`statedUnit`): the
  // sentence asks for the unit the goods were counted in, the one way past it (DEC-30-08).
  GOODS_RECEIPT_STOCK_UNIT_REQUIRED: 'apiErrors.refused.receiptStockUnitRequired',
}

function conflictRefusalKey(error: unknown): string | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    error.problemType !== 'resource-conflict' ||
    error.code === null
  ) {
    return null
  }
  // Own keys only: a code such as "constructor" must not resolve a prototype member.
  return Object.hasOwn(CONFLICT_REFUSALS, error.code) ? CONFLICT_REFUSALS[error.code] : null
}

/**
 * The message key for a refusal, or null when this is not one.
 *
 * An unmapped code still resolves — to the fallback — because a screen must never render a raw
 * code, and i18next answers a missing key with the key itself.
 */
export function refusalMessageKey(error: unknown): string | null {
  const conflict = conflictRefusalKey(error)
  if (conflict !== null) return conflict
  if (!isExpenditureRefusal(error)) return null
  const code = error.code
  if (code === null) return REFUSAL_FALLBACK_KEY
  return Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : REFUSAL_FALLBACK_KEY
}

/** The values a refusal's sentence names, or undefined when it names none. */
export function refusalMessageValues(error: unknown): Record<string, string> | undefined {
  if (!(error instanceof ApiError) || error.code === null) return undefined
  if (!isExpenditureRefusal(error) && conflictRefusalKey(error) === null) return undefined
  return Object.hasOwn(REFUSAL_VALUES, error.code)
    ? REFUSAL_VALUES[error.code](error.problem)
    : undefined
}

/** The codes this build has a sentence for. Exported so a test can pin the set. */
export const MAPPED_REFUSAL_CODES = Object.freeze(Object.keys(REFUSALS))
