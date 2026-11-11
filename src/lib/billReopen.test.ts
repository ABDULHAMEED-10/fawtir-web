import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import type { BillDetailDto, BillRowDto } from '../api/expenditure/bills'
import {
  activityOf,
  decisionNoteOf,
  decisionsOf,
  inputVatNoteKey,
  reopenedAwaitingApproval,
  stepsOf,
} from './billDetail'
import { refusalMessageKey } from './expenditureRefusals'

type Approval = BillDetailDto['approvals'][number]

const REJECTION: Approval = {
  id: 'a-1',
  decision: 'REJECTED',
  reason: 'Wrong quantity',
  decidedBy: 'u-1',
  decidedAt: '2026-11-01T08:00:00Z',
}
const REOPEN: Approval = {
  id: 'a-2',
  decision: 'REOPENED',
  reason: 'Supplier sent the corrected count',
  decidedBy: 'u-2',
  decidedAt: '2026-11-01T09:00:00Z',
}

function detail(
  state: BillRowDto['readiness']['state'],
  approvals: Approval[],
  overrides: Partial<BillRowDto['readiness']> = {},
): BillDetailDto {
  const readiness = { state, distinctApprovals: 0, required: 1, autoApproved: false, ...overrides }
  return {
    bill: {
      id: 'b-1',
      source: 'UPLOADED',
      supplierId: 's-1',
      supplierName: 'Qalhat Marine Supplies',
      documentTypeCode: '380',
      supplierBillNumber: 'QMS-1',
      issueDate: '2026-10-01',
      dueDate: '2026-11-30',
      overdue: false,
      currencyCode: 'OMR',
      totalIncludingVat: 105,
      vatAmount: 5,
      paidAmount: 0,
      outstandingAmount: 105,
      purchaseOrderReference: null,
      workflowState: 'AWAITING_APPROVAL',
      readiness,
      match: null,
      hold: null,
      paymentRunReference: null,
      paidOnTheSpot: false,
      inboundDeliveryId: null,
      networkVerified: false,
      amountDue: 105,
      creditedAmount: 0,
      complianceObligation: 'NOT_APPLICABLE',
    },
    lines: [],
    readiness,
    approvals,
    hold: null,
    holdHistory: [],
    settlement: {
      billTotal: 105,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: 105,
      currency: 'OMR',
      paymentState: 'UNPAID',
      overdue: false,
      dueDate: '2026-11-30',
    },
    payments: [],
    paymentRunReference: null,
    intake: null,
    compliance: { source: 'UPLOADED', networkVerified: false, obligation: 'NOT_APPLICABLE' },
    activity: [],
  }
}

const everything = () => true
const approverOnly = (permission: string) => permission === 'invoice.approve'

describe('a rejected bill (backend V523)', () => {
  const rejected = detail('REJECTED', [REJECTION])

  it('offers no Approve, whatever the reader may do', () => {
    expect(decisionsOf(rejected, everything).approve).toBe(false)
  })

  it('offers Reopen only with bill.reopen, never through invoice.approve alone', () => {
    expect(decisionsOf(rejected, everything).reopen).toBe(true)
    expect(decisionsOf(rejected, approverOnly).reopen).toBe(false)
    expect(decisionsOf(rejected, (p) => p === 'bill.reopen').reopen).toBe(true)
  })

  it('offers no Reopen on a bill that is not rejected', () => {
    expect(decisionsOf(detail('PENDING', []), everything).reopen).toBe(false)
    expect(decisionsOf(detail('READY', []), everything).reopen).toBe(false)
    expect(decisionsOf(detail('PENDING', [REOPEN, REJECTION]), everything).reopen).toBe(false)
  })
})

describe('a reopened bill nobody has approved since', () => {
  const reopened = detail('PENDING', [REOPEN, REJECTION])

  it('reads as reopened, not as approved and not as a fresh bill', () => {
    expect(reopenedAwaitingApproval(reopened)).toBe(true)
    expect(decisionNoteOf(reopened)).toEqual({
      key: 'billDetail.decision.reopened',
      values: { reason: REOPEN.reason, required: 1 },
    })
    const approvedStep = stepsOf(reopened, { day: (d) => d, instantDay: (d) => d }).find(
      (step) => step.id === 'approved',
    )
    expect(approvedStep?.state).not.toBe('done')
    expect(approvedStep?.detail).toEqual({ key: 'billDetail.steps.reopened' })
  })

  it('says how many approvals it needs again under a multi-approver policy', () => {
    const many = detail('PENDING', [REOPEN, REJECTION], { required: 2 })
    expect(decisionNoteOf(many).key).toBe('billDetail.decision.reopenedNeedsMore')
  })

  it('can be approved again', () => {
    expect(decisionsOf(reopened, everything).approve).toBe(true)
  })

  it('stops reading as reopened once someone approves it', () => {
    const approved: Approval = { ...REJECTION, id: 'a-3', decision: 'APPROVED', reason: null }
    expect(reopenedAwaitingApproval(detail('READY', [approved, REOPEN, REJECTION]))).toBe(false)
  })

  it('words its input VAT caption for the reopen, not "while rejected"', () => {
    const vat = { counted: false, reason: 'REJECTED' } as BillRowDto['inputVat']
    expect(inputVatNoteKey(vat, true)).toBe('billDetail.inputVat.reopened')
    expect(inputVatNoteKey(vat)).toBe('billDetail.inputVat.rejected')
  })

  it('lists the reopen in the activity with its reason', () => {
    const withActivity = {
      ...reopened,
      activity: [
        { at: REOPEN.decidedAt, kind: 'REOPENED' as const, detail: REOPEN.reason, actor: 'u-2' },
      ],
    }
    expect(activityOf(withActivity, 'u-2')[0]).toMatchObject({
      key: 'billDetail.activity.kind.REOPENED',
      detail: REOPEN.reason,
      byYou: true,
    })
  })
})

describe('the reopen refusals', () => {
  const conflict = (code: string) =>
    new ApiError({ status: 409, problemType: 'resource-conflict', code })

  it('word each 409 by code', () => {
    expect(refusalMessageKey(conflict('BILL_APPROVAL_REJECTED_NEEDS_REOPEN'))).toBe(
      'billDetail.refused.needsReopen',
    )
    expect(refusalMessageKey(conflict('BILL_REOPEN_NOT_REJECTED'))).toBe(
      'billDetail.refused.changed',
    )
    expect(refusalMessageKey(conflict('BILL_REOPEN_HELD_AS_DUPLICATE'))).toBe(
      'billDetail.duplicate.refused.reopenHeld',
    )
  })

  it('words the missing reason', () => {
    const refused = new ApiError({
      status: 400,
      problemType: 'expenditure-refused',
      code: 'APPROVAL_REOPEN_REASON_REQUIRED',
    })
    expect(refusalMessageKey(refused)).toBe('billDetail.refused.reopenReasonRequired')
  })
})
