import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import type { BillDetailDto, BillHoldDto, BillRowDto } from '../api/expenditure/bills'
import {
  duplicateActionsOf,
  duplicateCheckOf,
  isNoteRefusal,
  refusalMeansStale,
  rowDuplicateOf,
} from './billDuplicate'
import { activityOf, canRecordPayment, decisionNoteOf, decisionsOf, stepsOf } from './billDetail'
import { REFUSAL_FALLBACK_KEY, refusalMessageKey } from './expenditureRefusals'
import { BILL_TABS, rowActionOf, toBillListItem, twinOf, visibleBillTabs } from './billList'
import { billByNumber } from '../components/debit/noteBill'

const ORIGINAL = '22222222-2222-2222-2222-222222222222'

function row(overrides: Partial<BillRowDto> = {}): BillRowDto {
  return {
    id: 'b-2',
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '380',
    supplierBillNumber: 'QMS-7781',
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 100,
    vatAmount: 4.762,
    paidAmount: 0,
    outstandingAmount: 100,
    purchaseOrderReference: null,
    workflowState: 'ON_HOLD',
    readiness: { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false },
    match: null,
    hold: { reason: 'Possible duplicate of bill ' + ORIGINAL, openedAt: '2026-10-28T08:00:00Z' },
    paymentRunReference: null,
    paidOnTheSpot: false,
    ...overrides,
  }
}

function hold(overrides: Partial<BillHoldDto> = {}): BillHoldDto {
  return {
    id: 'h-1',
    reason: 'Possible duplicate of bill ' + ORIGINAL,
    openedBy: 'system',
    openedAt: '2026-10-28T08:00:00Z',
    releasedBy: null,
    releasedAt: null,
    duplicateOfBillId: ORIGINAL,
    duplicateResolution: null,
    duplicateResolvedBy: null,
    duplicateResolvedAt: null,
    duplicateResolutionNote: null,
    ...overrides,
  }
}

function detail(bill: BillRowDto, open: BillHoldDto | null, history: BillHoldDto[]): BillDetailDto {
  return {
    bill: {
      ...bill,
      inboundDeliveryId: 'd-2',
      networkVerified: true,
      amountDue: bill.totalIncludingVat,
      creditedAmount: 0,
      complianceObligation: 'REPORTED_BY_SENDER',
      match: null,
    },
    lines: [],
    readiness: bill.readiness,
    approvals: [],
    hold: open,
    holdHistory: history,
    settlement: {
      billTotal: bill.totalIncludingVat,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: bill.outstandingAmount,
      currency: 'OMR',
      paymentState: 'UNPAID',
      overdue: false,
      dueDate: bill.dueDate,
    },
    payments: [],
    paymentRunReference: null,
    intake: null,
    compliance: { source: 'PEPPOL', networkVerified: true, obligation: 'REPORTED_BY_SENDER' },
    activity: [],
  }
}

const conflict = (code: string) =>
  new ApiError({ status: 409, problemType: 'resource-conflict', code })
const refused = (code: string) =>
  new ApiError({ status: 400, problemType: 'expenditure-refused', code })

describe('a held duplicate, read from what the server sends', () => {
  it('reads duplicateHold when the server sends it', () => {
    expect(
      rowDuplicateOf(
        row({
          duplicateHold: {
            duplicateOfBillId: ORIGINAL,
            duplicateOfBillNumber: 'QMS-7781',
            resolution: null,
            sameDocumentUuid: true,
          },
        }),
      ),
    ).toEqual({
      originalId: ORIGINAL,
      originalNumber: 'QMS-7781',
      state: 'suspected',
      sameDocumentUuid: true,
    })
  })

  it("falls back to the hold's own duplicateOfBillId on a server before duplicateHold", () => {
    const fallback = rowDuplicateOf(
      row({ hold: { reason: 'x', openedAt: '2026-10-28T08:00:00Z', duplicateOfBillId: ORIGINAL } }),
    )
    expect(fallback).toEqual({
      originalId: ORIGINAL,
      originalNumber: null,
      state: 'suspected',
      sameDocumentUuid: null,
    })
  })

  it('says nothing of an ordinary hold', () => {
    expect(rowDuplicateOf(row({ hold: { reason: 'Disputed', openedAt: '2026-10-01T00:00:00Z' } }))).toBeNull()
    expect(rowDuplicateOf(row({ hold: null }))).toBeNull()
  })

  it('keeps a NOT_DUPLICATE decision on the page from the released hold in the history', () => {
    const released = hold({
      releasedBy: 'u-1',
      releasedAt: '2026-10-28T09:00:00Z',
      duplicateResolution: 'NOT_DUPLICATE',
      duplicateResolvedBy: 'u-1',
      duplicateResolvedAt: '2026-10-28T09:00:00Z',
      duplicateResolutionNote: 'Different delivery',
    })
    const check = duplicateCheckOf(detail(row({ workflowState: 'NEW', hold: null }), null, [released]))
    expect(check?.state).toBe('notDuplicate')
    expect(check?.hold?.duplicateResolutionNote).toBe('Different delivery')
  })

  it('reads a confirmed duplicate as final', () => {
    const open = hold({ duplicateResolution: 'CONFIRMED_DUPLICATE', duplicateResolvedBy: 'u-1', duplicateResolvedAt: '2026-10-28T09:00:00Z', duplicateResolutionNote: 'Resent' })
    const check = duplicateCheckOf(
      detail(row({ hold: { reason: 'x', openedAt: open.openedAt, duplicateOfBillId: ORIGINAL, duplicateResolution: 'CONFIRMED_DUPLICATE' } }), open, [open]),
    )
    expect(check?.state).toBe('confirmed')
    expect(duplicateActionsOf(check, true)).toEqual({ confirm: false, notDuplicate: false, sameUuidBlocked: false })
  })
})

describe('who may decide, and what', () => {
  const suspected = {
    originalId: ORIGINAL,
    originalNumber: null,
    state: 'suspected' as const,
    sameDocumentUuid: false,
    hold: null,
  }

  it('offers both decisions to an approver', () => {
    expect(duplicateActionsOf(suspected, true)).toEqual({ confirm: true, notDuplicate: true, sameUuidBlocked: false })
  })

  it('offers nothing without invoice.approve', () => {
    expect(duplicateActionsOf(suspected, false)).toEqual({ confirm: false, notDuplicate: false, sameUuidBlocked: false })
  })

  it('withholds "Not a duplicate" when both copies share a document UUID', () => {
    expect(duplicateActionsOf({ ...suspected, sameDocumentUuid: true }, true)).toEqual({
      confirm: true,
      notDuplicate: false,
      sameUuidBlocked: true,
    })
  })

  it('leaves the decision to the server when it did not say whether the UUIDs match', () => {
    expect(duplicateActionsOf({ ...suspected, sameDocumentUuid: null }, true).notDuplicate).toBe(true)
  })

  it('never offers the plain release on a duplicate hold, and still does on an ordinary one', () => {
    const open = hold()
    const held = detail(row({ hold: { reason: 'x', openedAt: open.openedAt, duplicateOfBillId: ORIGINAL } }), open, [open])
    expect(decisionsOf(held, () => true).release).toBe(false)
    const ordinary = hold({ duplicateOfBillId: null, reason: 'Disputed' })
    expect(decisionsOf(detail(row(), ordinary, [ordinary]), () => true).release).toBe(true)
  })

  it('offers no approval or rejection while a duplicate hold is open, decided or not', () => {
    const open = hold()
    const row_ = row({ hold: { reason: 'x', openedAt: open.openedAt, duplicateOfBillId: ORIGINAL } })
    const undecided = decisionsOf(detail(row_, open, [open]), () => true)
    expect([undecided.approve, undecided.reject]).toEqual([false, false])
    const confirmedHold = hold({ duplicateResolution: 'CONFIRMED_DUPLICATE' })
    const confirmed = decisionsOf(detail(row_, confirmedHold, [confirmedHold]), () => true)
    expect([confirmed.approve, confirmed.reject]).toEqual([false, false])
    // An ordinary hold keeps both, as before.
    const ordinary = hold({ duplicateOfBillId: null, reason: 'Disputed' })
    const plain = decisionsOf(detail(row(), ordinary, [ordinary]), () => true)
    expect([plain.approve, plain.reject]).toEqual([true, true])
  })

  it('words a held credit note by what it is withheld from', () => {
    const open = hold()
    const note = row({ documentTypeCode: '381', hold: { reason: 'x', openedAt: open.openedAt, duplicateOfBillId: ORIGINAL } })
    expect(decisionNoteOf(detail(note, open, [open]))).toEqual({ key: 'billDetail.duplicate.decision.suspectedCreditNote' })
    const confirmedHold = hold({ duplicateResolution: 'CONFIRMED_DUPLICATE' })
    const confirmedNote = { ...note, hold: { ...note.hold!, duplicateResolution: 'CONFIRMED_DUPLICATE' as const } }
    expect(decisionNoteOf(detail(confirmedNote, confirmedHold, [confirmedHold]))).toEqual({
      key: 'billDetail.duplicate.decision.confirmedCreditNote',
    })
  })

  it("words the decision panel itself instead of the server's English reason", () => {
    const open = hold()
    const held = detail(row({ hold: { reason: open.reason, openedAt: open.openedAt, duplicateOfBillId: ORIGINAL } }), open, [open])
    expect(decisionNoteOf(held)).toEqual({ key: 'billDetail.duplicate.decision.suspected' })
  })
})

describe('readiness and payment on a held copy', () => {
  const FORMAT = { day: (iso: string) => iso, instantDay: (iso: string) => iso }
  const approvedStep = (bill: BillDetailDto) => stepsOf(bill, FORMAT).find((step) => step.id === 'approved')!
  const ready = { state: 'READY' as const, distinctApprovals: 0, required: 1, autoApproved: true }

  it('never says approved or "not needed" on a held copy, even from a server that reports READY', () => {
    const open = hold()
    const held = detail(row({ readiness: ready, hold: { reason: 'x', openedAt: open.openedAt, duplicateOfBillId: ORIGINAL } }), open, [open])
    held.readiness = ready
    const step = approvedStep(held)
    expect(step.state).not.toBe('done')
    expect(step.detail?.key).not.toBe('billDetail.steps.notNeeded')
    expect(decisionNoteOf(held).key).toBe('billDetail.duplicate.decision.suspected')
  })

  it("reads the readiness's own heldAsDuplicate flag", () => {
    const flagged = detail(row({ workflowState: 'APPROVED', hold: null }), null, [])
    flagged.readiness = { ...ready, heldAsDuplicate: true }
    expect(approvedStep(flagged).state).not.toBe('done')
    // Without the flag the same readiness reads as approved by its amount, as before.
    flagged.readiness = ready
    expect(approvedStep(flagged).detail?.key).toBe('billDetail.steps.notNeeded')
  })

  it('offers no payment on a held copy, whatever its readiness', () => {
    const open = hold()
    const held = detail(row({ readiness: ready, hold: { reason: 'x', openedAt: open.openedAt, duplicateOfBillId: ORIGINAL } }), open, [open])
    held.readiness = ready
    expect(canRecordPayment(held, () => true)).toBe(false)
  })
})

describe('the refusals of the duplicate route', () => {
  it('names each through the shared refusal map: the 409s by code, the 400s as refusals', () => {
    expect(refusalMessageKey(conflict('BILL_DUPLICATE_ALREADY_RESOLVED'))).toBe('billDetail.duplicate.refused.alreadyResolved')
    expect(refusalMessageKey(conflict('BILL_NOT_HELD_AS_DUPLICATE'))).toBe('billDetail.duplicate.refused.notHeld')
    expect(refusalMessageKey(conflict('BILL_DUPLICATE_SAME_DOCUMENT_UUID'))).toBe('billDetail.duplicate.refused.sameDocumentUuid')
    expect(refusalMessageKey(conflict('BILL_HOLD_DUPLICATE_RELEASE_REFUSED'))).toBe('billDetail.duplicate.refused.releaseRefused')
    expect(refusalMessageKey(conflict('BILL_APPROVAL_HELD_AS_DUPLICATE'))).toBe('billDetail.duplicate.refused.approvalHeld')
    expect(refusalMessageKey(conflict('BILL_REJECTION_HELD_AS_DUPLICATE'))).toBe('billDetail.duplicate.refused.rejectionHeld')
    expect(refusalMessageKey(conflict('DEBIT_NOTE_HELD_AS_DUPLICATE'))).toBe('supplierDebitNotes.held.refused')
    expect(refusalMessageKey(refused('BILL_DUPLICATE_RESOLUTION_NOTE_REQUIRED'))).toBe('billDetail.duplicate.refused.noteRequired')
    expect(refusalMessageKey(refused('BILL_DUPLICATE_RESOLUTION_NOTE_TOO_LONG'))).toBe('billDetail.duplicate.refused.noteTooLong')
    // Not reachable from the screen, which always sends a known decision.
    expect(refusalMessageKey(refused('BILL_DUPLICATE_DECISION_INVALID'))).toBe(REFUSAL_FALLBACK_KEY)
    // An unmapped conflict keeps the generic conflict sentence, inherited names included.
    expect(refusalMessageKey(conflict('SOMETHING_ELSE'))).toBeNull()
    expect(refusalMessageKey(conflict('constructor'))).toBeNull()
    expect(refusalMessageKey(conflict('toString'))).toBeNull()
  })

  it('treats a conflict as stale and a note refusal as the field', () => {
    expect(refusalMeansStale(conflict('BILL_DUPLICATE_ALREADY_RESOLVED'))).toBe(true)
    expect(refusalMeansStale(new ApiError({ status: 403, problemType: 'forbidden' }))).toBe(false)
    expect(isNoteRefusal(refused('BILL_DUPLICATE_RESOLUTION_NOTE_REQUIRED'))).toBe(true)
    expect(refusalMeansStale(refused('BILL_DUPLICATE_RESOLUTION_NOTE_REQUIRED'))).toBe(false)
  })
})

describe('the hold history, as Activity steps', () => {
  it("words the duplicate hold and its decision, and keeps a person's own hold reason and note", () => {
    const decided = hold({
      duplicateResolution: 'CONFIRMED_DUPLICATE',
      duplicateResolvedBy: 'u-1',
      duplicateResolvedAt: '2026-10-28T09:00:00Z',
      duplicateResolutionNote: 'Same delivery sent twice',
    })
    const earlier = hold({ id: 'h-0', duplicateOfBillId: null, reason: 'Disputed', openedAt: '2026-10-01T08:00:00Z' })
    const bill = {
      ...detail(row(), decided, [decided, earlier]),
      activity: [
        { at: '2026-10-28T09:00:00Z', kind: 'CONFIRMED_DUPLICATE', detail: 'Same delivery sent twice', actor: 'u-1' },
        { at: '2026-10-28T08:00:00Z', kind: 'HELD', detail: decided.reason, actor: 'system' },
        { at: '2026-10-01T08:00:00Z', kind: 'HELD', detail: 'Disputed', actor: 'u-2' },
      ],
    } as unknown as BillDetailDto
    expect(activityOf(bill, 'u-1').map(({ key, detail: text, byYou }) => ({ key, text, byYou }))).toEqual([
      { key: 'billDetail.activity.kind.CONFIRMED_DUPLICATE', text: 'Same delivery sent twice', byYou: true },
      { key: 'billDetail.activity.kind.HELD_AS_DUPLICATE', text: null, byYou: false },
      { key: 'billDetail.activity.kind.HELD', text: 'Disputed', byYou: false },
    ])
  })
})

describe('the bill a supplier note names by number', () => {
  const original = row({ id: 'b-original', hold: null, workflowState: 'APPROVED' })
  const copy = row({
    id: 'b-copy',
    duplicateHold: { duplicateOfBillId: 'b-original', duplicateOfBillNumber: 'QMS-7781', resolution: null, sameDocumentUuid: false },
  })

  it('takes the bill, not its newer held copy', () => {
    expect(billByNumber([copy, original], 'QMS-7781', null)?.id).toBe('b-original')
  })

  it('reads a copy held on an older server from its hold', () => {
    const olderCopy = row({ id: 'b-copy', hold: { reason: 'x', openedAt: '2026-10-28T08:00:00Z', duplicateOfBillId: 'b-original' } })
    expect(billByNumber([olderCopy, original], ' qms-7781 ', null)?.id).toBe('b-original')
  })

  it('keeps the first match when no copy is held, and the copy when nothing else matches', () => {
    const other = row({ id: 'b-other', hold: null })
    expect(billByNumber([other, original], 'QMS-7781', null)?.id).toBe('b-other')
    expect(billByNumber([copy], 'QMS-7781', null)?.id).toBe('b-copy')
    expect(billByNumber([copy, original], 'QMS-0000', null)).toBeNull()
  })
})

describe('a held duplicate on the Bills list', () => {
  const held = row({
    duplicateHold: { duplicateOfBillId: ORIGINAL, duplicateOfBillNumber: 'QMS-7781', resolution: null, sameDocumentUuid: false },
  })

  it('shows its own chip, hides the English reason, and opens the bill to decide', () => {
    const item = toBillListItem(held)
    expect(item.status).toBe('suspectedDuplicate')
    expect(item.holdReason).toBeNull()
    expect(item.duplicate).toEqual({ originalId: ORIGINAL, originalNumber: 'QMS-7781' })
    expect(rowActionOf(item, { canApprove: false, canCapture: false })).toBe('reviewDuplicate')
  })

  it('says nothing of being queried: the copy was held by nobody', () => {
    const item = toBillListItem(held)
    expect(item.amountNote).toEqual({ key: 'billsPage.rows.inclVat', values: { amount: 4.762 } })
    const queried = toBillListItem(row({ hold: { reason: 'Disputed', openedAt: '2026-10-01T08:00:00Z' } }))
    expect(queried.amountNote).toEqual({ key: 'billsPage.rows.queried', values: { date: '2026-10-01T08:00:00Z' } })
  })

  it('offers nothing on a confirmed duplicate', () => {
    const item = toBillListItem({ ...held, duplicateHold: { ...held.duplicateHold!, resolution: 'CONFIRMED_DUPLICATE' } })
    expect(item.status).toBe('confirmedDuplicate')
    expect(rowActionOf(item, { canApprove: true, canCapture: true })).toBeNull()
  })

  it('offers the Duplicates tab only when the summary counts it', () => {
    const tabs = { needsAttention: 1, all: 2, awaitingApproval: 0, approved: 0, onHold: 1, paid: 0, truncated: false }
    expect(visibleBillTabs(tabs).map((tab) => tab.id)).not.toContain('heldDuplicate')
    expect(visibleBillTabs({ ...tabs, heldDuplicate: 0 }).map((tab) => tab.id)).toContain('heldDuplicate')
    expect(BILL_TABS.find((tab) => tab.id === 'heldDuplicate')?.filter).toBe('HELD_DUPLICATE')
  })
})

describe('a bill credit settled with nothing paid (B-12)', () => {
  const settled = row({ hold: null, workflowState: 'PAID', paidAmount: 0, outstandingAmount: 0 })
  const settledDetail = (): BillDetailDto => {
    const base = detail(settled, null, [])
    return {
      ...base,
      bill: { ...base.bill, creditedAmount: 100 },
      readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
      settlement: { ...base.settlement, creditedAmount: 100, outstandingAmount: 0, paymentState: 'PAID' },
    }
  }
  const format = { day: (iso: string) => iso, instantDay: (iso: string) => iso }

  it('reads Settled by credit, not Paid, in the chip, the panel and the last step', () => {
    expect(toBillListItem(settled).status).toBe('settledByCredit')
    expect(decisionNoteOf(settledDetail())).toEqual({ key: 'billDetail.decision.settledByCredit' })
    expect(stepsOf(settledDetail(), format).at(-1)).toMatchObject({
      id: 'paid',
      state: 'done',
      detail: { key: 'billDetail.steps.settledByCredit' },
    })
  })

  it('still reads Paid once any money was paid', () => {
    const paid = row({ hold: null, workflowState: 'PAID', paidAmount: 40, outstandingAmount: 0 })
    expect(toBillListItem(paid).status).toBe('paid')
    const base = settledDetail()
    expect(
      decisionNoteOf({ ...base, settlement: { ...base.settlement, paidAmount: 40, creditedAmount: 60 } }),
    ).toEqual({ key: 'billDetail.decision.paid' })
  })
})

describe('the duplicate-payable flag on the Bills list (EXP-38-1 interim)', () => {
  const OTHER = '33333333-3333-3333-3333-333333333333'
  const owed = { workflowState: 'AWAITING_APPROVAL' as const, hold: null }

  it('flags an upload the server reads as a sure copy of a Peppol bill, and links the other copy', () => {
    const item = toBillListItem(row({ ...owed, source: 'UPLOADED', duplicateOf: OTHER }))
    expect(item.twin).toEqual({ certainty: 'sure', otherId: OTHER })
    expect(item.status).toBe('awaitingApproval')
  })

  it('flags either side of a less certain pair as possible', () => {
    expect(toBillListItem(row({ ...owed, possibleDuplicateOf: OTHER })).twin).toEqual({
      certainty: 'possible',
      otherId: OTHER,
    })
  })

  it('says sure when the server sends both', () => {
    expect(twinOf({ duplicateOf: OTHER, possibleDuplicateOf: ORIGINAL })).toEqual({
      certainty: 'sure',
      otherId: OTHER,
    })
  })

  it('flags nothing on a plain bill, nor on a server before the fields', () => {
    expect(toBillListItem(row(owed)).twin).toBeNull()
    expect(toBillListItem(row({ ...owed, duplicateOf: null, possibleDuplicateOf: null })).twin).toBeNull()
  })

  it('leaves a held copy to its duplicate chip', () => {
    const held = row({
      possibleDuplicateOf: OTHER,
      duplicateHold: { duplicateOfBillId: ORIGINAL, duplicateOfBillNumber: 'QMS-7781', resolution: null, sameDocumentUuid: false },
    })
    expect(toBillListItem(held).twin).toBeNull()
  })

  it('changes no action the row offers', () => {
    const access = { canApprove: true, canCapture: true }
    const plain = toBillListItem(row(owed))
    const flagged = toBillListItem(row({ ...owed, duplicateOf: OTHER }))
    expect(rowActionOf(flagged, access)).toBe(rowActionOf(plain, access))
  })
})
