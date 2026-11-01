import type {
  BillDetailDto,
  BillMatchDto,
  BillRowDto,
  ReceiptReportDto,
} from '../api/expenditure/bills'
import type { ActivityItemDto } from '../api/compliance/activity'
import type { CreditNoteRowDto } from '../api/expenditure/notes'
import type { InboundInvoiceDto } from '../api/expenditure/inboundInvoice'
import { canResubmit, correctionHeld } from './activityLedger'
import { tddReportStateOf } from './taxAuthorityReport'
import { duplicateCheckOf, heldAsDuplicate } from './billDuplicate'
import { settledWithoutPayment } from './billList'

/**
 * One supplier bill, opened (Figma 86:16520), written only from what `GET /bills/{id}` carries.
 *
 * The screen answers three questions in order: did it arrive cleanly, does it agree with what
 * was ordered and received, and should it be approved. Where the design shows something the API
 * does not hold (payment terms, an early-payment saving, the approver's name), it is left out
 * rather than drawn from nothing (decisions of 2026-09-16). Our own receipt report to the Tax
 * Authority is read from the response when it carries one, and otherwise said to be unknown.
 */

export type Note = { key: string; values?: Record<string, string | number> }

/** Where the bill has got to. Only one step is ever `current`. */
export type BillStepState = 'done' | 'current' | 'upcoming'

export type BillStep = {
  id: 'arrived' | 'matched' | 'approved' | 'scheduled' | 'paid'
  labelKey: string
  detail: Note | null
  state: BillStepState
}

/** How dates reach the notes: the page formats them in the reader's language. */
export type DateFormat = { day: (isoDate: string) => string; instantDay: (iso: string) => string }

/** 381 credit note, 261 self-billed credit note: they lower what is owed, and nothing is owed on them. */
export function isCreditNote(detail: BillDetailDto): boolean {
  return detail.bill.documentTypeCode === '381' || detail.bill.documentTypeCode === '261'
}

/** In a payment run that is still open: draft and exported runs alike. */
export function inPaymentRun(detail: BillDetailDto): boolean {
  return detail.bill.workflowState === 'IN_PAYMENT_RUN' || detail.paymentRunReference !== null
}

export function stepsOf(detail: BillDetailDto, format: DateFormat): BillStep[] {
  const { bill, readiness, settlement, intake } = detail
  const match = bill.match
  const paid = settlement.paymentState === 'PAID'

  // "29 Jul · Peppol": the day it came in and how. An upload knows its time; a network bill's
  // arrival is its ARRIVED event. Without either the step names only how it came: the issue date
  // stood in and read "Arrived 11 Sept" over a bill that arrived on 29 Oct (B-9).
  const arrivedEvent = detail.activity.find((entry) => entry.kind === 'ARRIVED' && entry.at)
  const arrivedDay = intake
    ? format.instantDay(intake.uploadedAt)
    : arrivedEvent?.at
      ? format.instantDay(arrivedEvent.at)
      : null
  const arrived: BillStep = {
    id: 'arrived',
    labelKey: 'billDetail.steps.arrived',
    state: 'done',
    detail: arrivedDay
      ? { key: 'billDetail.steps.arrivedVia', values: { date: arrivedDay, source: bill.source } }
      : { key: `billDetail.steps.via.${bill.source}` },
  }

  const matched: BillStep = {
    id: 'matched',
    labelKey: 'billDetail.steps.matched',
    state: 'upcoming',
    detail: null,
  }
  if (match?.verdict === 'MISMATCH') {
    matched.state = 'current'
    matched.detail = { key: 'billDetail.steps.differs' }
  } else if (match?.verdict === 'NO_ORDER') {
    matched.state = 'done'
    matched.detail = { key: 'billDetail.steps.noOrder' }
  } else if (match) {
    matched.state = 'done'
    matched.detail = {
      key:
        match.byHand || match.verdict === 'MATCHED_BY_HAND'
          ? 'billDetail.steps.byHand'
          : 'billDetail.steps.automatically',
    }
  }

  const approved: BillStep = {
    id: 'approved',
    labelKey: 'billDetail.steps.approved',
    state: 'upcoming',
    detail: null,
  }
  // A held copy is never "approved" or "not needed", whatever an older server's readiness says:
  // nothing pays it until the duplicate check is decided.
  const held = readiness.heldAsDuplicate === true || heldAsDuplicate(detail)
  if (readiness.state === 'READY' && !held) {
    approved.state = 'done'
    approved.detail = {
      key: readiness.autoApproved ? 'billDetail.steps.notNeeded' : 'billDetail.steps.approvedDone',
    }
  } else if (readiness.state === 'REJECTED') {
    approved.state = 'current'
    approved.detail = { key: 'billDetail.steps.rejected' }
  } else {
    approved.detail =
      readiness.required > 1
        ? {
            key: 'billDetail.steps.progress',
            values: { given: readiness.distinctApprovals, required: readiness.required },
          }
        : { key: 'billDetail.steps.waiting' }
  }

  const scheduled: BillStep = {
    id: 'scheduled',
    labelKey: 'billDetail.steps.scheduled',
    state: detail.paymentRunReference || paid ? 'done' : 'upcoming',
    detail: detail.paymentRunReference
      ? { key: 'billDetail.steps.inRun', values: { run: detail.paymentRunReference } }
      : null,
  }

  const lastPayment = detail.payments.find((entry) => entry.entryType === 'PAYMENT')
  // A part-paid bill says how far it has got: "Paid {paid} of {total}" (owner, 12 Oct 2026, P4).
  // The amounts stay numbers here; the page writes them in the reader's language with the sign.
  const total = settlement.billTotal ?? bill.totalIncludingVat
  const partPaid = !paid && settlement.paidAmount > 0 && total !== null
  const paidStep: BillStep = {
    id: 'paid',
    labelKey: 'billDetail.steps.paid',
    state: paid ? 'done' : 'upcoming',
    detail: paid
      ? settledWithoutPayment(settlement)
        ? { key: 'billDetail.steps.settledByCredit' }
        : lastPayment?.paymentDate
        ? { key: 'billDetail.steps.paidOn', values: { date: format.day(lastPayment.paymentDate) } }
        : null
      : partPaid
        ? {
            key: 'billDetail.steps.paidOf',
            values: { paid: settlement.paidAmount, total, currency: bill.currencyCode },
          }
        : settlement.dueDate
          ? { key: 'billDetail.steps.dueOn', values: { date: format.day(settlement.dueDate) } }
          : null,
  }

  // A refused debit note is not owed and is never scheduled or paid (unless it already was): the
  // steps it will not reach are left out rather than shown as "Not yet".
  const steps =
    refusedDebitNote(detail) && !paid && !detail.paymentRunReference
      ? [arrived, matched, approved]
      : [arrived, matched, approved, scheduled, paidStep]
  // The first step not yet done is the one the bill is waiting at, and only one is ever current.
  const at = steps.findIndex((step) => step.state !== 'done')
  return steps.map((step, index) => ({
    ...step,
    state: step.state === 'done' ? 'done' : index === at ? 'current' : 'upcoming',
  }))
}

/** What the design's decision panel may offer, from the bill's state and the reader's permissions. */
export function decisionsOf(
  detail: BillDetailDto,
  can: (permission: string) => boolean,
): { approve: boolean; reject: boolean; hold: boolean; release: boolean } {
  const settled = detail.settlement.paymentState === 'PAID'
  const decidable = !settled && !isCreditNote(detail)
  // Not while a duplicate hold is open. The server's approval reads no hold, so approving an
  // undecided copy would leave it payable the moment it is decided not a duplicate, and approving
  // or rejecting a confirmed one decides nothing (review of #319).
  const approver = can('invoice.approve') && decidable && !heldAsDuplicate(detail)
  const payer = can('invoice.payment.manage') && decidable
  return {
    // Rejected is final (Abdul, 1 Nov 2026): there is no step that reopens it. The server itself does
    // not refuse an approval after a rejection, so this is the screen's rule.
    approve:
      approver && detail.readiness.state !== 'READY' && detail.readiness.state !== 'REJECTED',
    // Not once any payment is recorded or the bill is in a payment run: a bill part paid, or
    // about to be paid, is not rejected (owner decision 2026-10-01; the server refuses it too).
    reject:
      approver &&
      detail.readiness.state !== 'REJECTED' &&
      detail.settlement.paidAmount <= 0 &&
      !inPaymentRun(detail),
    hold: payer && detail.hold === null,
    // A duplicate hold is released only by deciding it is not a duplicate; the plain release is
    // refused (BILL_HOLD_DUPLICATE_RELEASE_REFUSED), so the page offers the decision instead.
    release: can('invoice.payment.manage') && detail.hold !== null && !heldAsDuplicate(detail),
  }
}

/**
 * The supplier's credit notes that stand on this bill. No bill read names them, so they come from
 * the supplier's list, by the one bill each note reduces (`credits.billId`): null on a note released
 * from its bill (backend #827) and on one spread over several. A held copy credits nothing.
 */
export function creditNotesOn(
  billId: string,
  rows: readonly CreditNoteRowDto[],
): CreditNoteRowDto[] {
  return rows.filter((row) => row.credits.billId === billId && row.heldAsDuplicate !== true)
}

/**
 * The stored match verdict says the bill does not agree with its order. Until that is resolved
 * (matched by hand, the match taken off, or matched again and agreeing) the bill is not ready to
 * pay, whoever or whatever approved it: the server refuses a single payment with
 * `BILL_PAYMENT_MISMATCHED`, as a payment run always has (owner's answer 2, 2 Oct 2026).
 */
export function mismatchUnresolved(detail: BillDetailDto): boolean {
  return detail.bill.match?.verdict === 'MISMATCH'
}

/**
 * A supplier debit note (383) whose current decision is REFUSED: a disputed charge, not owed. The
 * server refuses a payment on it (`BILL_PAYMENT_DEBIT_NOTE_REFUSED`) until it is accepted again.
 */
export function refusedDebitNote(detail: BillDetailDto): boolean {
  return detail.bill.documentTypeCode === '383' && detail.bill.debitNoteDecision === 'REFUSED'
}

/**
 * A supplier debit note (383) nobody has accepted or refused yet: not owed until accepted, so the
 * server refuses a payment on it (`BILL_PAYMENT_DEBIT_NOTE_NOT_ACCEPTED`, backend #480; owner,
 * 10 Oct 2026). A server that does not send `debitNoteDecision` at all decides for itself.
 */
export function undecidedDebitNote(detail: BillDetailDto): boolean {
  return detail.bill.documentTypeCode === '383' && detail.bill.debitNoteDecision === null
}

/**
 * Whether a payment can be recorded on this bill now: it is approved, not on hold, does not
 * disagree with its order, is not in a payment run, is not a refused or undecided debit note, still owes
 * money, and the reader may settle bills (`bill.settle`: the Finance Manager pays what the
 * Accountant prepared, RL-4). Anything else and the action is not offered at all
 * (owner decision 2026-10-01: hidden, not disabled). A held bill is released first; a mismatch is
 * resolved first; a bill in a run is paid there, or taken out of the run; a refused debit note is
 * accepted first (owner, 8 Oct 2026).
 */
export function canRecordPayment(
  detail: BillDetailDto,
  can: (permission: string) => boolean,
): boolean {
  return (
    can('bill.settle') &&
    !isCreditNote(detail) &&
    detail.readiness.state === 'READY' &&
    detail.hold === null &&
    !mismatchUnresolved(detail) &&
    !inPaymentRun(detail) &&
    !refusedDebitNote(detail) &&
    !undecidedDebitNote(detail) &&
    detail.settlement.paymentState !== 'PAID' &&
    detail.settlement.outstandingAmount > 0
  )
}

/**
 * The early-payment discount a payment run took, shown as its own line beside what was paid
 * (owner, 8 Oct 2026): the bill's `DISCOUNT` entries in its own currency, summed. It settles the
 * bill but is not money paid, so the Paid figure stays the server's `paidAmount`, and the bill's
 * totals and VAT never change because of it. Zero when none was taken.
 */
export function discountLineOf(detail: BillDetailDto): number {
  const currency = detail.settlement.currency
  const total = detail.payments
    .filter((entry) => entry.entryType === 'DISCOUNT' && (!currency || entry.currency === currency))
    .reduce((sum, entry) => sum + entry.amount, 0)
  return Math.round(total * 1000) / 1000
}

/**
 * A discount was taken and the supplier's credit note for it has not arrived yet: a state to
 * follow up, not an error. Once a credit note covers it nothing more is said.
 */
export function awaitingDiscountCreditNote(detail: BillDetailDto): boolean {
  return (detail.discountTaken?.creditNoteOutstanding ?? 0) > 0
}

/** The sentence under the amount in the decision panel. */
export function decisionNoteOf(detail: BillDetailDto): Note {
  const { readiness, hold, settlement } = detail
  // First, and for a credit note too: its own sentence would invite a use the server withholds
  // from a held copy. The hold's reason is the server's English sentence naming a bill id, so the
  // sentence is worded here.
  const duplicate = hold ? duplicateCheckOf(detail) : null
  const kind = isCreditNote(detail) ? 'CreditNote' : ''
  if (duplicate?.state === 'confirmed') return { key: `billDetail.duplicate.decision.confirmed${kind}` }
  if (duplicate?.state === 'suspected') return { key: `billDetail.duplicate.decision.suspected${kind}` }
  if (isCreditNote(detail)) return { key: 'billDetail.decision.creditNote' }
  if (settlement.paymentState === 'PAID')
    return {
      key: settledWithoutPayment(settlement)
        ? 'billDetail.decision.settledByCredit'
        : 'billDetail.decision.paid',
    }
  // A refused debit note says its refusal, as its own page does, whatever approval it went through.
  if (refusedDebitNote(detail)) return { key: 'supplierDebitNotes.detail.refusedBody' }
  // Not payable until accepted (owner, 10 Oct 2026): what to do first, in place of the approval.
  if (undecidedDebitNote(detail)) return { key: 'apiErrors.refused.debitNoteNotAccepted' }
  if (hold) return { key: 'billDetail.decision.held', values: { reason: hold.reason ?? '' } }
  if (readiness.state === 'REJECTED') {
    const rejection = detail.approvals.find((entry) => entry.decision === 'REJECTED')
    return { key: 'billDetail.decision.rejected', values: { reason: rejection?.reason ?? '' } }
  }
  if (readiness.state === 'READY') {
    // Approved, by people or by its amount, but it still differs from its order: nothing pays it
    // until that is resolved, so the panel does not say it can be paid. It says what the match
    // card says (owner's Round 5 answer 1, 2 Oct 2026: keep showing Mismatch).
    if (mismatchUnresolved(detail)) return { key: 'billDetail.match.differs' }
    // Already in a run: the sentence for an approved bill nobody has scheduled would contradict it.
    if (!readiness.autoApproved && detail.paymentRunReference)
      return { key: 'billDetail.decision.inRun', values: { run: detail.paymentRunReference } }
    return {
      key: readiness.autoApproved
        ? 'billDetail.decision.belowLimit'
        : 'billDetail.decision.approved',
    }
  }
  if (readiness.required > 1) {
    return {
      key: 'billDetail.decision.needsMore',
      values: { given: readiness.distinctApprovals, required: readiness.required },
    }
  }
  return { key: 'billDetail.decision.pending' }
}

/**
 * Our own report of a received document to the Tax Authority. Under PINT-OM the receiving side's
 * service provider reports each document it receives as a Tax Data Document with reporter role
 * 02 Receiver and the receipt date and time (om-tdd), so a supplier's report never covers it.
 * Absent, the line says the status is not known; it never claims a filing.
 *
 * TODO(backend): EXPENDITURE.md R.1. The receipt report's status and date on the response.
 */
export function receiptReportNote(
  report: ReceiptReportDto | null | undefined,
  instantDay: (iso: string) => string,
): Note & { ok: boolean } {
  if (!report) return { key: 'billDetail.compliance.receipt.unavailable', ok: false }
  switch (report.status) {
    case 'ACCEPTED':
      return report.reportedAt
        ? {
            key: 'billDetail.compliance.receipt.accepted',
            values: { date: instantDay(report.reportedAt) },
            ok: true,
          }
        : { key: 'billDetail.compliance.receipt.acceptedUndated', ok: true }
    case 'SUBMITTED':
      return { key: 'billDetail.compliance.receipt.submitted', ok: false }
    case 'REJECTED':
      return { key: 'billDetail.compliance.receipt.rejected', ok: false }
    default:
      return { key: 'billDetail.compliance.receipt.notSubmitted', ok: false }
  }
}

/** A compliance line. `link` is where the value named `{{reference}}` in its sentence leads. */
export type ComplianceNote = Note & { ok: boolean; link?: string }

/** The page of the self-billing document a self-billed bill was raised from. */
export function selfBillPath(issuedInvoiceId: string): string {
  return `/expenditure/self-billing/${encodeURIComponent(issuedInvoiceId)}`
}

/**
 * What the delivery record and the compliance record say about a bill received over Peppol, read
 * beside the bill because `GET /bills/{id}` carries neither (G3, and EXPENDITURE.md R.1 still
 * open). `unavailable` covers a person limited to some branches (the inbound routes answer 404
 * and the ledger 403 for them) and any failed read: the lines then say "not available", never
 * a filing or a reply nobody can see. `record` is null when the compliance record could not be
 * read or could not be proven to be this delivery's (provesReceived).
 */
export type ReceivedFacts =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; inbound: InboundInvoiceDto; record: ActivityItemDto | null }

/** The compliance record of one document (Compliance › Activity). */
export function activityRecordPath(invoiceUuid: string): string {
  return `/compliance/activity/${encodeURIComponent(invoiceUuid)}`
}

/**
 * Our own receipt report as the compliance record has it, by the same report state the issued
 * side reads (tddReportStateOf). The line leads to the record, where C5's reason and any
 * resubmission the server offers are.
 */
export function receiptLegNote(
  record: ActivityItemDto,
  instantDay: (iso: string) => string,
): ComplianceNote {
  const leg = record.tdd_leg
  const link = activityRecordPath(record.invoice_uuid)
  const note = (key: string, ok: boolean, values?: Record<string, string>): ComplianceNote => ({
    key: `billDetail.compliance.receipt.${key}`,
    ok,
    link,
    ...(values ? { values } : {}),
  })
  switch (tddReportStateOf(leg)) {
    case 'NOT_RAISED':
      return note('notRaised', false)
    case 'NEVER_SUBMITTED':
      return note(leg?.sla_met === false ? 'notSubmittedLate' : 'notSubmitted', false)
    case 'AWAITING_RESPONSE':
      return note('submitted', false)
    case 'ANSWERED':
      // AB is final but unconfirmed, and the ledger never counts it as accepted: no tick.
      if (leg?.ack !== 'AP') return note('deliveredUnconfirmed', false)
      return leg.ack_at
        ? note('accepted', true, { date: instantDay(leg.ack_at) })
        : note('acceptedUndated', true)
    case 'AUTHORITY_REJECTED':
      if (canResubmit(record)) return note('rejectedResubmit', false)
      return note(correctionHeld(record) ? 'rejectedHeld' : 'rejected', false)
    case 'INTERNALLY_STOPPED':
      return note('stopped', false)
  }
}

/**
 * Transport states of our MLS row short of delivery that are not failures (MessageState). Worded
 * "not delivered yet", not "on its way": behind an outbound hold a PENDING row does not move
 * (review of #250, N1).
 */
const REPLY_UNDELIVERED: ReadonlySet<string> = new Set(['PENDING', 'SENDING', 'SENT_AWAITING_MDN'])
const REPLY_RETRYING: ReadonlySet<string> = new Set(['RETRY_SCHEDULED'])
/**
 * MDN_FAILED is terminal in practice: the backend's claims select only PENDING and RETRY_SCHEDULED,
 * so nothing sends that row again (backend MessageState; BC-6). Saying "will be retried" there
 * would promise a retry that never comes.
 */
const REPLY_FAILED: ReadonlySet<string> = new Set(['MDN_FAILED', 'DEAD_LETTERED'])

/**
 * The MLS our access point answered the supplier's with. `ack` is the status decided, which is
 * not proof it left: only a DELIVERED transport row says the supplier's access point has it
 * (InboundDetailResponse, inbound audit 2026-10-13 F3). No status recorded is not a failure.
 */
export function replyNote(
  ack: 'AP' | 'AB' | 'RE' | 'NONE' | null,
  transportState: string | null,
): ComplianceNote {
  const note = (key: string, ok: boolean): ComplianceNote => ({
    key: `billDetail.compliance.reply.${key}`,
    ok,
  })
  if (ack === null || ack === 'NONE') return note('none', false)
  if (transportState === null) return note('notQueued', false)
  if (transportState === 'DELIVERED') return note(ack, ack !== 'RE')
  if (REPLY_UNDELIVERED.has(transportState)) return note('notDeliveredYet', false)
  if (REPLY_RETRYING.has(transportState)) return note('retrying', false)
  if (REPLY_FAILED.has(transportState)) return note('failed', false)
  return note('unknown', false)
}

/** The record's own leg when the record was proven, else the delivery record's columns. */
function replyOf(received: Extract<ReceivedFacts, { kind: 'ready' }>): ComplianceNote {
  const leg = received.record?.invoice_leg
  return leg
    ? replyNote(leg.ack, leg.transport_state ?? null)
    : replyNote(received.inbound.mlsCode, received.inbound.mlsTransportState)
}

/** Whether the server may still move the reply on its own, so the page keeps re-reading. */
export function replyIsPending(ack: string | null, transportState: string | null): boolean {
  if (ack === null || ack === 'NONE') return false
  return (
    transportState !== null &&
    (REPLY_UNDELIVERED.has(transportState) || REPLY_RETRYING.has(transportState))
  )
}

/**
 * The compliance card's four lines (Figma 163:23284: validity, PINT-OM, tax reporting, the
 * archive), each written from a fact the platform holds. A line whose fact is missing says so
 * rather than claiming it. For a bill received over Peppol the reporting line is our own receipt
 * report (om-tdd, reporter role 02), not the supplier's.
 *
 * With `received`, a bill that came over Peppol also says how we answered the supplier's access
 * point (a fifth line, in the card's own list), and the reporting line is read from the compliance
 * record. A delivery record that says validation failed outranks `networkVerified`.
 *
 * A self-billed bill is this company's own document, issued through Fawtir on the supplier's
 * behalf: it did not "arrive" and has no supplier's file, so the three lines that said "not
 * validated", "no PINT-OM" and "no original" give way to who issued it, the agreement it was
 * issued under (linking to the self-billing document) and its tax standing (owner decision
 * 2026-10-01, in his words). Those three are the whole block: "Reported by the sender" is not
 * said of a document this company issued itself.
 */
export function complianceOf(
  detail: BillDetailDto,
  instantDay: (iso: string) => string = (iso) => iso.slice(0, 10),
  received?: ReceivedFacts,
): ComplianceNote[] {
  const { compliance, intake, bill } = detail
  if (compliance.source === 'SELF_BILLED') {
    const issued = detail.selfBilling ?? null
    const documentId = issued?.issuedInvoiceId ?? bill.issuedInvoiceId ?? null
    const link = documentId ? selfBillPath(documentId) : undefined
    return [
      { key: 'billDetail.compliance.selfBilled.issuedByYou', ok: true },
      // An older document may have no agreement on record: the line stays, without a reference.
      issued?.agreementReference
        ? {
            key: 'billDetail.compliance.selfBilled.agreement',
            values: { reference: issued.agreementReference },
            ok: true,
            link,
          }
        : { key: 'billDetail.compliance.selfBilled.agreementNoReference', ok: true, link },
      { key: 'billDetail.compliance.selfBilled.validTaxInvoice', ok: true },
    ]
  }
  const peppol = compliance.source === 'PEPPOL'
  const facts = peppol && received?.kind === 'ready' ? received : null
  const verified = peppol && compliance.networkVerified
  const failedOnArrival = facts !== null && !facts.inbound.validationPassed
  const reporting: ComplianceNote =
    facts?.record
      ? receiptLegNote(facts.record, instantDay)
      : peppol
        ? receiptReportNote(compliance.receiptReport, instantDay)
        : compliance.obligation === 'REPORTED_BY_SENDER'
          ? { key: 'billDetail.compliance.reportedBySender', ok: true }
          : compliance.obligation === 'PENDING_COMPLIANCE_INPUT'
            ? { key: 'billDetail.compliance.pendingInput', ok: false }
            : { key: 'billDetail.compliance.notApplicable', ok: true }
  const kept = intake !== null || bill.inboundDeliveryId !== null
  const lines: ComplianceNote[] = [
    verified
      ? { key: 'billDetail.compliance.overPeppol', ok: true }
      : { key: 'billDetail.compliance.notValidated', ok: false },
    failedOnArrival
      ? { key: 'billDetail.compliance.failedOnArrival', ok: false }
      : verified
        ? { key: 'billDetail.compliance.passedPintOm', ok: true }
        : { key: 'billDetail.compliance.noPintOm', ok: false },
    ...(facts
      ? [replyOf(facts)]
      : peppol && received?.kind === 'unavailable'
        ? [{ key: 'billDetail.compliance.reply.unavailable', ok: false }]
        : []),
    reporting,
    kept
      ? { key: 'billDetail.compliance.originalKept', ok: true }
      : { key: 'billDetail.compliance.noOriginal', ok: false },
  ]
  return lines
}

export type ThreeWayTile = {
  id: 'ordered' | 'received' | 'billed'
  /** "300 KG", or a line count when the lines do not share a unit. */
  quantity: Note
  /** "7.400 per KG · PO-0031", "GRN-0087", "7.400 per KG · this bill". */
  note: Note | null
  /** Whether this side agrees with the order. */
  ok: boolean
}

type ComparisonLine = BillMatchDto['comparison'][number]

/**
 * The design's three tiles ("You ordered", "You received", "They billed") from the per-line
 * comparison, summed. One unit across the lines gives a quantity in that unit; one price gives
 * "x per unit"; anything else names the line count and leaves the price out.
 */
export function threeWayOf(comparison: BillMatchDto, currency: string): ThreeWayTile[] | null {
  const lines = comparison.comparison
  if (lines.length === 0) return null
  // One unit across the lines gives a total in that unit. Mixed units (300 KG of beans and
  // 12 EA of sacks) cannot be added, so the tiles lead with the first line, as the frame does,
  // and say how many more lines there are.
  const units = new Set(lines.map((line) => line.unit ?? ''))
  const mixed = units.size > 1
  const unit = mixed ? (lines[0].unit ?? '') : [...units][0]
  const counted = mixed ? [lines[0]] : lines
  const sum = (pick: (line: ComparisonLine) => number | null) =>
    counted.reduce<number | null>((total, line) => {
      const value = pick(line)
      return total === null || value === null ? null : total + value
    }, 0)
  const quantity = (value: number | null): Note =>
    value === null
      ? { key: 'billDetail.notStated' }
      : mixed
        ? {
            key: 'billDetail.match.quantityUnitMore',
            values: { quantity: value, unit, count: lines.length - 1 },
          }
        : { key: 'billDetail.match.quantityUnit', values: { quantity: value, unit } }
  const onePrice = (pick: (line: ComparisonLine) => number | null): number | null => {
    const prices = new Set(counted.map(pick))
    const [only] = [...prices]
    return prices.size === 1 && only !== null && only !== undefined ? only : null
  }
  const ordered = sum((line) => line.orderedQuantity)
  const received = sum((line) => line.receivedQuantity)
  const billed = sum((line) => line.billedQuantity)
  const orderedPrice = onePrice((line) => line.orderedUnitPrice)
  const billedPrice = onePrice((line) => line.billedUnitPrice)
  const perUnit = (price: number | null, tail: string): Note | null =>
    price !== null
      ? { key: 'billDetail.match.perUnit', values: { price, unit, currency, tail } }
      : null
  const quantitiesAgree =
    ordered !== null && billed !== null && ordered === billed && received === billed
  const pricesAgree = lines.every(
    (line) =>
      line.orderedUnitPrice === null ||
      line.billedUnitPrice === null ||
      line.orderedUnitPrice === line.billedUnitPrice,
  )
  return [
    {
      id: 'ordered',
      quantity: quantity(ordered),
      note: perUnit(orderedPrice, comparison.purchaseOrderNumber ?? ''),
      ok: true,
    },
    {
      id: 'received',
      quantity: quantity(received),
      // TODO(backend): the design says "Checked in 28 Jul"; the comparison carries no receipt date.
      note: comparison.goodsReceiptNumber
        ? { key: 'billDetail.match.onReceipt', values: { receipt: comparison.goodsReceiptNumber } }
        : null,
      ok: received === null || ordered === null || received === ordered,
    },
    {
      id: 'billed',
      quantity: quantity(billed),
      note: perUnit(billedPrice, ''),
      ok: quantitiesAgree && pricesAgree,
    },
  ]
}

/** "Net 30 days": the terms as the gap between the bill's dates, when both are known. */
export function termsDaysOf(detail: BillDetailDto): number | null {
  const { issueDate, dueDate } = detail.bill
  if (!issueDate || !dueDate) return null
  return Math.round((Date.parse(dueDate) - Date.parse(issueDate)) / 86_400_000)
}

export type ActivityEntry = {
  key: string
  at: string | null
  detail: string | null
  byYou: boolean
  /** On an overpayment step, its amount for the rial sign and the rest of its detail. */
  overpayment?: { amount: number; currency: string; rest: string | null } | null
}

/**
 * The kinds this page has wording for, under `billDetail.activity.kind`: the bill's own events,
 * and the steps of the self-billed document a self-billed bill was raised from (`DRAFT_CREATED`,
 * `ISSUED`, `CANCELLED`; owner's answer 3, 2 Oct 2026: "take it from the self-billed document's
 * history"). Those three are the invoice history's own event names and carry the same words the
 * self-bill page uses for them (`invoiceDetails.event.*`). `TAKEN_OUT_OF_PAYMENT_RUN` and
 * `PAYMENT_RUN_CANCELLED` are a sent payment run's two ways out; their detail names the run and
 * the reason given. The four `OVERPAYMENT_*` kinds are what became of what the bill was overpaid
 * by (owner's answer 13, 8 Oct 2026: both ways of settling it are recorded in Activity); their
 * amount is drawn with the rial sign ({@link overpaymentStepOf}).
 *
 * TODO(backend): EXPENDITURE.md row 1.23. The full history of the self-billed document in
 * `activity[]` (owner's Round 5 answer 4: created, issued and cancelled are enough for now).
 */
const KNOWN_KINDS = new Set([
  'ARRIVED',
  'CONFIRMED',
  'MATCHED',
  'APPROVED',
  'REJECTED',
  'HELD',
  'RELEASED',
  'PAID',
  'REVERSED',
  'TAKEN_OUT_OF_PAYMENT_RUN',
  'PAYMENT_RUN_CANCELLED',
  'OVERPAYMENT_REFUNDED',
  'OVERPAYMENT_KEPT_AS_CREDIT',
  'OVERPAYMENT_CREDIT_APPLIED',
  'OVERPAYMENT_CREDIT_RECEIVED',
  'DRAFT_CREATED',
  'ISSUED',
  'CANCELLED',
  'CONFIRMED_DUPLICATE',
  'NOT_DUPLICATE',
])

/** A kind this page has no wording for reads "Recorded", as the invoice history does; never the key. */
function activityKey(kind: string): string {
  return KNOWN_KINDS.has(kind) ? `billDetail.activity.kind.${kind}` : 'invoiceDetails.event.other'
}

/** A self-billed bill: this company's own document, issued on the supplier's behalf. */
/**
 * The "Not counted in VAT" caption for a document the server leaves out of input VAT, or null.
 * Only the three reasons with approved wording say anything (owner, 12 Oct 2026); any other
 * reason, a counted document and a server that does not send `inputVat` say nothing.
 */
export function inputVatNoteKey(inputVat: BillRowDto['inputVat'] | null | undefined): string | null {
  if (!inputVat || inputVat.counted) return null
  return Object.hasOwn(INPUT_VAT_NOTES, inputVat.reason) ? INPUT_VAT_NOTES[inputVat.reason] : null
}

const INPUT_VAT_NOTES: Record<string, string> = {
  DEBIT_NOTE_NOT_ACCEPTED: 'billDetail.inputVat.debitNoteNotAccepted',
  REJECTED: 'billDetail.inputVat.rejected',
  NO_SUPPLIER_TAX_INVOICE: 'billDetail.inputVat.noSupplierTaxInvoice',
}

export function isSelfBilled(detail: BillDetailDto): boolean {
  return detail.bill.source === 'SELF_BILLED'
}

/**
 * Newest first, as the server orders it. The API names no actor, so only "you" can be said. The
 * server's own detail text leads with enum names for arrivals and matches ("UPLOADED x.pdf",
 * "MISMATCH — …"), so those two read from the structured fields instead.
 */
export function activityOf(detail: BillDetailDto, userId: string | null): ActivityEntry[] {
  const lookedAndFoundNothing = detail.bill.match?.verdict === 'NO_ORDER'
  // A duplicate hold's HELD step carries the server's English sentence naming a bill id. The step
  // names no hold, so it is known by the instant the hold opened, which both are written from.
  const duplicateOpenings = new Set(
    detail.holdHistory.filter((hold) => hold.duplicateOfBillId).map((hold) => hold.openedAt),
  )
  return detail.activity.map((entry) => {
    const duplicateHeld =
      entry.kind === 'HELD' && entry.at !== null && duplicateOpenings.has(entry.at)
    return {
      key: duplicateHeld
        ? 'billDetail.activity.kind.HELD_AS_DUPLICATE'
        : entry.kind === 'MATCHED' && lookedAndFoundNothing
          ? 'billDetail.activity.kind.NO_ORDER'
          : activityKey(entry.kind),
      at: entry.at,
      detail: duplicateHeld
        ? null
        : entry.kind === 'ARRIVED'
          ? (detail.intake?.filename ?? null)
          : entry.kind === 'MATCHED'
            ? // NO_ORDER's summary is the matcher's fixed English sentence; the step's own key
              // already says it, in the reader's language.
              lookedAndFoundNothing
              ? null
              : (detail.bill.match?.summary ?? null)
            : entry.detail,
      byYou: userId !== null && entry.actor === userId,
      overpayment: overpaymentStepOf(entry.kind, entry.detail),
    }
  })
}

type BillLine = BillDetailDto['lines'][number]

/** The line's VAT category (CL-04-OM), standard when the response does not name one. */
function categoryOf(line: BillLine): string {
  return (line.taxCategoryCode ?? 'S').toUpperCase()
}

/**
 * What a line's VAT cell says: the rate, and for a zero-rated, exempt or out-of-scope line its
 * category and the reason it carries (VATZR-OM-nn, VATEX-OM-nn, or free text on O). A line with
 * no category keeps the rate alone.
 *
 * The category is on the response. TODO(backend): EXPENDITURE.md R.2, the exemption reason.
 */
export function lineVatOf(line: BillLine): {
  rate: number | null
  categoryKey: string | null
  reason: string | null
} {
  const category = categoryOf(line)
  if (!line.taxCategoryCode || category === 'S') {
    return { rate: line.vatRate, categoryKey: null, reason: null }
  }
  return {
    rate: line.vatRate ?? 0,
    categoryKey:
      category === 'Z' || category === 'E' || category === 'O'
        ? `invoiceDetails.category.${category}`
        : null,
    reason: line.exemptionReasonCode ?? line.exemptionReason ?? null,
  }
}

/**
 * One VAT rate for the whole bill when every line has the same rate and the same category;
 * otherwise none is named (a zero-rated and an exempt line both at 0% are still two kinds).
 */
export function singleVatRate(detail: BillDetailDto): number | null {
  const rates = new Set(
    detail.lines.map((line) => line.vatRate).filter((rate): rate is number => rate !== null),
  )
  const categories = new Set(detail.lines.map(categoryOf))
  return rates.size === 1 && categories.size <= 1 ? [...rates][0] : null
}

/**
 * "Overpaid by" (owner's answer 13, 8 Oct 2026): what the supplier still holds of what payments
 * and credits paid beyond the bill, as the server works it out. Zero for a server before it.
 */
export function overpaidOf(detail: BillDetailDto): number {
  return detail.settlement.overpaidAmount ?? 0
}

/**
 * Payments and credits came to more than the bill: it was overpaid at some point, even when the
 * supplier has since refunded all of it and "Overpaid by" is back to zero (P5, 12 Oct 2026).
 */
export function paidBeyondTotal(detail: BillDetailDto): boolean {
  const total = detail.settlement.billTotal ?? detail.bill.totalIncludingVat
  if (total === null || isCreditNote(detail)) return false
  return detail.settlement.paidAmount + detail.settlement.creditedAmount - total > 0.0005
}

const OVERPAYMENT_STEPS = new Set([
  'OVERPAYMENT_REFUNDED',
  'OVERPAYMENT_KEPT_AS_CREDIT',
  'OVERPAYMENT_CREDIT_APPLIED',
  'OVERPAYMENT_CREDIT_RECEIVED',
])

/**
 * The amount on an overpayment step, read out of the server's "{amount} {currency} · {other}" so
 * the page can draw it with the rial sign and three decimals instead of the currency code. Null
 * for any other step, or a detail not in that shape (then it is shown as sent).
 */
export function overpaymentStepOf(
  kind: string,
  detail: string | null,
): { amount: number; currency: string; rest: string | null } | null {
  if (!OVERPAYMENT_STEPS.has(kind) || !detail) return null
  const match = /^(-?\d+(?:\.\d+)?) ([A-Z]{3})(?: · (.+))?$/.exec(detail.trim())
  if (!match) return null
  return { amount: Number(match[1]), currency: match[2], rest: match[3] ?? null }
}

/**
 * The bills the kept credit can be set against, of those a search returned: the same supplier and
 * currency (the server refuses any other), not this bill and not a credit note, still owing
 * something, and not one the server would refuse outright (held, rejected or a refused debit
 * note). A bill in a run whose bank file is made is not told apart here; the server's sentence
 * says so.
 */
export function creditTargetsOf(detail: BillDetailDto, rows: readonly BillRowDto[]): BillRowDto[] {
  const { bill } = detail
  const CREDIT_NOTE_CODES = ['381', '261']
  return rows.filter(
    (row) =>
      row.id !== bill.id &&
      bill.supplierId !== null &&
      row.supplierId === bill.supplierId &&
      row.currencyCode === bill.currencyCode &&
      !CREDIT_NOTE_CODES.includes(row.documentTypeCode ?? '') &&
      row.outstandingAmount > 0 &&
      row.hold === null &&
      row.readiness.state !== 'REJECTED' &&
      // Kept credit spent on a bill pays it, and a supplier debit note is owed only once accepted
      // (BILL_OVERPAYMENT_TARGET_DEBIT_NOTE_NOT_ACCEPTED), so an undecided one is not offered.
      (row.documentTypeCode !== '383' || row.debitNoteDecision === 'ACCEPTED'),
  )
}
