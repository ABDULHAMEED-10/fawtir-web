import type { BillDetailDto } from '../api/expenditure/bills'

/**
 * One supplier bill, opened (Figma 86:16520), written only from what `GET /bills/{id}` carries.
 *
 * The screen answers three questions in order: did it arrive cleanly, does it agree with what
 * was ordered and received, and should it be approved. Where the design shows something the API
 * does not hold (payment terms, an early-payment saving, the approver's name, a receiver-side tax
 * filing), it is left out rather than drawn from nothing (decisions of 2026-09-16).
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

export function stepsOf(detail: BillDetailDto, format: DateFormat): BillStep[] {
  const { bill, readiness, settlement, intake } = detail
  const match = bill.match
  const paid = settlement.paymentState === 'PAID'

  const arrived: BillStep = {
    id: 'arrived',
    labelKey: 'billDetail.steps.arrived',
    state: 'done',
    detail: intake
      ? { key: 'billDetail.steps.arrivedOn', values: { date: format.instantDay(intake.uploadedAt) } }
      : { key: `billDetail.steps.via.${bill.source}` },
  }

  const matched: BillStep = { id: 'matched', labelKey: 'billDetail.steps.matched', state: 'upcoming', detail: null }
  if (match?.verdict === 'MISMATCH') {
    matched.state = 'current'
    matched.detail = { key: 'billDetail.steps.differs' }
  } else if (match?.verdict === 'NO_ORDER') {
    matched.state = 'done'
    matched.detail = { key: 'billDetail.steps.noOrder' }
  } else if (match) {
    matched.state = 'done'
    matched.detail = {
      key: match.byHand || match.verdict === 'MATCHED_BY_HAND' ? 'billDetail.steps.byHand' : 'billDetail.steps.automatically',
    }
  }

  const approved: BillStep = { id: 'approved', labelKey: 'billDetail.steps.approved', state: 'upcoming', detail: null }
  if (readiness.state === 'READY') {
    approved.state = 'done'
    approved.detail = { key: readiness.autoApproved ? 'billDetail.steps.notNeeded' : 'billDetail.steps.approvedDone' }
  } else if (readiness.state === 'REJECTED') {
    approved.state = 'current'
    approved.detail = { key: 'billDetail.steps.rejected' }
  } else {
    approved.detail =
      readiness.required > 1
        ? { key: 'billDetail.steps.progress', values: { given: readiness.distinctApprovals, required: readiness.required } }
        : { key: 'billDetail.steps.waiting' }
  }

  const scheduled: BillStep = {
    id: 'scheduled',
    labelKey: 'billDetail.steps.scheduled',
    state: detail.paymentRunReference || paid ? 'done' : 'upcoming',
    detail: detail.paymentRunReference ? { key: 'billDetail.steps.inRun', values: { run: detail.paymentRunReference } } : null,
  }

  const lastPayment = detail.payments.find((entry) => entry.entryType === 'PAYMENT')
  const paidStep: BillStep = {
    id: 'paid',
    labelKey: 'billDetail.steps.paid',
    state: paid ? 'done' : 'upcoming',
    detail: paid
      ? lastPayment?.paymentDate
        ? { key: 'billDetail.steps.paidOn', values: { date: format.day(lastPayment.paymentDate) } }
        : null
      : settlement.dueDate
        ? { key: 'billDetail.steps.dueOn', values: { date: format.day(settlement.dueDate) } }
        : null,
  }

  const steps = [arrived, matched, approved, scheduled, paidStep]
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
  const approver = can('invoice.approve') && decidable
  const payer = can('invoice.payment.manage') && decidable
  return {
    approve: approver && detail.readiness.state !== 'READY',
    reject: approver && detail.readiness.state !== 'REJECTED',
    hold: payer && detail.hold === null,
    release: can('invoice.payment.manage') && detail.hold !== null,
  }
}

/** The sentence under the amount in the decision panel. */
export function decisionNoteOf(detail: BillDetailDto): Note {
  const { readiness, hold, settlement } = detail
  if (isCreditNote(detail)) return { key: 'billDetail.decision.creditNote' }
  if (settlement.paymentState === 'PAID') return { key: 'billDetail.decision.paid' }
  if (hold) return { key: 'billDetail.decision.held', values: { reason: hold.reason ?? '' } }
  if (readiness.state === 'REJECTED') {
    const rejection = detail.approvals.find((entry) => entry.decision === 'REJECTED')
    return { key: 'billDetail.decision.rejected', values: { reason: rejection?.reason ?? '' } }
  }
  if (readiness.state === 'READY') {
    return { key: readiness.autoApproved ? 'billDetail.decision.belowLimit' : 'billDetail.decision.approved' }
  }
  if (readiness.required > 1) {
    return { key: 'billDetail.decision.needsMore', values: { given: readiness.distinctApprovals, required: readiness.required } }
  }
  return { key: 'billDetail.decision.pending' }
}

/**
 * The compliance card from the one fact the platform holds: who, if anyone, reports the bill.
 * Nothing here claims a receiver-side filing, which the platform does not make.
 */
export function complianceOf(detail: BillDetailDto): Note[] {
  const { compliance } = detail
  const notes: Note[] = []
  if (compliance.source === 'PEPPOL' && compliance.networkVerified) notes.push({ key: 'billDetail.compliance.overPeppol' })
  switch (compliance.obligation) {
    case 'REPORTED_BY_SENDER':
      notes.push({
        key: compliance.source === 'PEPPOL' ? 'billDetail.compliance.reportedBySupplier' : 'billDetail.compliance.reportedBySender',
      })
      break
    case 'PENDING_COMPLIANCE_INPUT':
      notes.push({ key: 'billDetail.compliance.pendingInput' })
      break
    case 'NOT_APPLICABLE':
      notes.push({ key: 'billDetail.compliance.notApplicable' })
      break
  }
  return notes
}

export type ActivityEntry = { key: string; at: string | null; detail: string | null; byYou: boolean }

/**
 * Newest first, as the server orders it. The API names no actor, so only "you" can be said. The
 * server's own detail text leads with enum names for arrivals and matches ("UPLOADED x.pdf",
 * "MISMATCH — …"), so those two read from the structured fields instead.
 */
export function activityOf(detail: BillDetailDto, userId: string | null): ActivityEntry[] {
  const lookedAndFoundNothing = detail.bill.match?.verdict === 'NO_ORDER'
  return detail.activity.map((entry) => ({
    key:
      entry.kind === 'MATCHED' && lookedAndFoundNothing
        ? 'billDetail.activity.kind.NO_ORDER'
        : `billDetail.activity.kind.${entry.kind}`,
    at: entry.at,
    detail:
      entry.kind === 'ARRIVED'
        ? (detail.intake?.filename ?? null)
        : entry.kind === 'MATCHED'
          ? (detail.bill.match?.summary ?? null)
          : entry.detail,
    byYou: userId !== null && entry.actor === userId,
  }))
}

/** One VAT rate for the whole bill when every line has the same one; otherwise none is named. */
export function singleVatRate(detail: BillDetailDto): number | null {
  const rates = new Set(detail.lines.map((line) => line.vatRate).filter((rate): rate is number => rate !== null))
  return rates.size === 1 ? [...rates][0] : null
}
