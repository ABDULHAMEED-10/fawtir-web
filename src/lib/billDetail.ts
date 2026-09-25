import type { BillDetailDto, BillMatchDto } from '../api/expenditure/bills'

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

  // "29 Jul · Peppol": the day it came in and how. An upload knows its time; a network bill's
  // arrival is its ARRIVED event, and failing that the day it was issued.
  const arrivedEvent = detail.activity.find((entry) => entry.kind === 'ARRIVED' && entry.at)
  const arrivedDay = intake
    ? format.instantDay(intake.uploadedAt)
    : arrivedEvent?.at
      ? format.instantDay(arrivedEvent.at)
      : bill.issueDate
        ? format.day(bill.issueDate)
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
  if (readiness.state === 'READY') {
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
 * The compliance card's four lines (Figma 163:23284: validity, PINT-OM, tax reporting, the
 * archive), each written from a fact the platform holds. A line whose fact is missing says so
 * rather than claiming it; nothing here claims a receiver-side filing, which the platform does
 * not make.
 */
export function complianceOf(detail: BillDetailDto): (Note & { ok: boolean })[] {
  const { compliance, intake, bill } = detail
  const verified = compliance.source === 'PEPPOL' && compliance.networkVerified
  const reporting: Note & { ok: boolean } =
    compliance.obligation === 'REPORTED_BY_SENDER'
      ? {
          key:
            compliance.source === 'PEPPOL'
              ? 'billDetail.compliance.reportedBySupplier'
              : 'billDetail.compliance.reportedBySender',
          ok: true,
        }
      : compliance.obligation === 'PENDING_COMPLIANCE_INPUT'
        ? { key: 'billDetail.compliance.pendingInput', ok: false }
        : { key: 'billDetail.compliance.notApplicable', ok: true }
  const kept = intake !== null || bill.inboundDeliveryId !== null
  return [
    verified
      ? { key: 'billDetail.compliance.overPeppol', ok: true }
      : { key: 'billDetail.compliance.notValidated', ok: false },
    verified
      ? { key: 'billDetail.compliance.passedPintOm', ok: true }
      : { key: 'billDetail.compliance.noPintOm', ok: false },
    reporting,
    kept
      ? { key: 'billDetail.compliance.originalKept', ok: true }
      : { key: 'billDetail.compliance.noOriginal', ok: false },
  ]
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
}

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
  const rates = new Set(
    detail.lines.map((line) => line.vatRate).filter((rate): rate is number => rate !== null),
  )
  return rates.size === 1 ? [...rates][0] : null
}
