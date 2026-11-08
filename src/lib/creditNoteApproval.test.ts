import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import type { BillDetailDto, BillRowDto } from '../api/expenditure/bills'
import {
  canRecordPayment,
  creditNoteRejected,
  decisionNoteOf,
  decisionsOf,
  standaloneCreditNote,
  vatNoticeOf,
} from './billDetail'
import { refusalMessageKey } from './expenditureRefusals'

// R5 approve or reject a standalone supplier credit note, R7 never auto-approve one, R8 a
// rejected note is not set against a bill (VAT-CN-R1-R8 plan §7.5).

type Approval = BillDetailDto['approvals'][number]
type NoteFields = { standalone?: boolean; vatNotice?: string | null }

const REJECTION: Approval = {
  id: 'a-1',
  decision: 'REJECTED',
  reason: 'Not agreed with the supplier',
  decidedBy: 'u-2',
  decidedAt: '2026-11-07T08:00:00Z',
  decidedByName: 'Salim',
}

function note(
  fields: NoteFields | null,
  approval: string | undefined,
  overrides: { documentTypeCode?: string; approvals?: Approval[]; hold?: BillDetailDto['hold'] } = {},
): BillDetailDto {
  // A note has no approval threshold: R7 says the server never reports it approved by amount.
  const readiness: BillRowDto['readiness'] = {
    state: approval === 'APPROVED' ? 'READY' : approval === 'REJECTED' ? 'REJECTED' : 'PENDING',
    distinctApprovals: approval === 'APPROVED' ? 1 : 0,
    required: 1,
    autoApproved: false,
  }
  return {
    bill: {
      id: 'cn-1',
      source: 'PEPPOL',
      supplierId: 's-1',
      supplierName: 'Qalhat Marine Supplies',
      documentTypeCode: overrides.documentTypeCode ?? '381',
      supplierBillNumber: 'QMS-CN-1',
      issueDate: '2026-11-01',
      dueDate: null,
      overdue: false,
      currencyCode: 'OMR',
      totalIncludingVat: 52.5,
      vatAmount: 2.5,
      paidAmount: 0,
      outstandingAmount: 0,
      purchaseOrderReference: null,
      workflowState: 'NEW',
      ...(approval === undefined ? {} : { approval }),
      readiness,
      match: null,
      hold: null,
      paymentRunReference: null,
      paidOnTheSpot: false,
      creditNote: {
        status: 'UNAPPLIED',
        usage: null,
        balance: { applied: 0, refunded: 0, remaining: 52.5 },
        ...(fields ?? {}),
      },
      inboundDeliveryId: null,
      networkVerified: true,
      amountDue: null,
      creditedAmount: 0,
      complianceObligation: 'NOT_APPLICABLE',
    },
    lines: [],
    readiness,
    approvals: overrides.approvals ?? (approval === 'REJECTED' ? [REJECTION] : []),
    hold: overrides.hold ?? null,
    holdHistory: [],
    settlement: {
      billTotal: 52.5,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: 0,
      currency: 'OMR',
      paymentState: 'UNPAID',
      overdue: false,
      dueDate: null,
    },
    payments: [],
    paymentRunReference: null,
    intake: null,
    compliance: { source: 'PEPPOL', networkVerified: true, obligation: 'NOT_APPLICABLE' },
    activity: [],
  } as BillDetailDto
}

const everything = () => true
const approverOnly = (permission: string) => permission === 'invoice.approve'
const STANDALONE: NoteFields = { standalone: true, vatNotice: null }
const TARGETED: NoteFields = { standalone: false, vatNotice: null }

function conflict(code: string): ApiError {
  return new ApiError({ status: 409, problemType: 'resource-conflict', code })
}

describe('which decisions a credit note offers (R5, R7)', () => {
  it.each([
    ['standalone, pending', STANDALONE, 'PENDING', { approve: true, reject: true, reopen: false }],
    ['standalone, approved', STANDALONE, 'APPROVED', { approve: false, reject: true, reopen: false }],
    ['standalone, rejected', STANDALONE, 'REJECTED', { approve: false, reject: false, reopen: true }],
    ['targeted, pending', TARGETED, 'PENDING', { approve: false, reject: false, reopen: false }],
    // Rejected before R5 while targeted (F11): the server reopens it, so the page offers it.
    ['targeted, rejected before R5', TARGETED, 'REJECTED', { approve: false, reject: false, reopen: true }],
  ] as const)('%s', (_, fields, approval, expected) => {
    expect(decisionsOf(note(fields, approval), everything)).toMatchObject({ ...expected, hold: false })
  })

  it('offers nothing new to a server before R5, whatever it says of the decision', () => {
    for (const approval of ['PENDING', 'APPROVED', 'REJECTED', undefined]) {
      expect(decisionsOf(note(null, approval), everything)).toEqual({
        approve: false,
        reject: false,
        hold: false,
        release: false,
        reopen: false,
      })
    }
  })

  it('treats a standalone flag that is not true as targeted', () => {
    expect(standaloneCreditNote(note({ standalone: false }, 'PENDING'))).toBe(false)
    expect(standaloneCreditNote(note({ standalone: true }, 'PENDING'))).toBe(true)
    expect(standaloneCreditNote(note(null, 'PENDING'))).toBe(false)
    // A 380 carrying the field by mistake is still a bill.
    expect(standaloneCreditNote(note(STANDALONE, 'PENDING', { documentTypeCode: '380' }))).toBe(false)
  })

  it('needs invoice.approve to decide and bill.reopen to reopen', () => {
    expect(decisionsOf(note(STANDALONE, 'PENDING'), () => false)).toMatchObject({
      approve: false,
      reject: false,
    })
    expect(decisionsOf(note(STANDALONE, 'REJECTED'), approverOnly).reopen).toBe(false)
  })

  it('offers no decision on a note held as a duplicate', () => {
    const held = note(STANDALONE, 'PENDING')
    // The open hold Fawtir placed on a later Peppol copy, as the page reads it (heldAsDuplicate).
    held.hold = { duplicateOfBillId: 'cn-0' } as BillDetailDto['hold']
    expect(decisionsOf(held, everything)).toMatchObject({ approve: false, reject: false, reopen: false })
  })

  it('decides a self-billed credit note (261) like a 381', () => {
    expect(
      decisionsOf(note(STANDALONE, 'PENDING', { documentTypeCode: '261' }), everything),
    ).toMatchObject({ approve: true, reject: true })
  })

  it('never offers a payment on a credit note, approved or not', () => {
    expect(canRecordPayment(note(STANDALONE, 'APPROVED'), everything)).toBe(false)
  })
})

describe('the decision sentence on a credit note', () => {
  it('says a standalone note is decided on its own, and when it was approved', () => {
    expect(decisionNoteOf(note(STANDALONE, 'PENDING'))).toEqual({
      key: 'billDetail.decision.creditNoteStandalone',
    })
    expect(decisionNoteOf(note(STANDALONE, 'APPROVED'))).toEqual({
      key: 'billDetail.decision.creditNoteApproved',
    })
  })

  it('names the rejection and who made it, but never the reader', () => {
    expect(decisionNoteOf(note(STANDALONE, 'REJECTED'), 'u-1')).toEqual({
      key: 'billDetail.decision.rejectedBy',
      values: { reason: 'Not agreed with the supplier', name: 'Salim' },
    })
    expect(decisionNoteOf(note(STANDALONE, 'REJECTED'), 'u-2')).toEqual({
      key: 'billDetail.decision.rejected',
      values: { reason: 'Not agreed with the supplier' },
    })
  })

  it('keeps the old sentence on a targeted note and on a server before R5', () => {
    expect(decisionNoteOf(note(TARGETED, 'PENDING'))).toEqual({ key: 'billDetail.decision.creditNote' })
    expect(decisionNoteOf(note(null, 'REJECTED'))).toEqual({ key: 'billDetail.decision.creditNote' })
  })
})

describe('a rejected note is not set against a bill (R8)', () => {
  it('reads the rejection only under the R5 contract', () => {
    expect(creditNoteRejected(note(STANDALONE, 'REJECTED'))).toBe(true)
    expect(creditNoteRejected(note(TARGETED, 'REJECTED'))).toBe(true)
    expect(creditNoteRejected(note(STANDALONE, 'APPROVED'))).toBe(false)
    expect(creditNoteRejected(note(STANDALONE, 'PENDING'))).toBe(false)
    expect(creditNoteRejected(note(null, 'REJECTED'))).toBe(false)
    expect(creditNoteRejected(null)).toBe(false)
  })

  it('says why a set-against was refused', () => {
    expect(refusalMessageKey(conflict('CREDIT_NOTE_REJECTED'))).toBe(
      'supplierCreditNotes.refused.rejected',
    )
  })
})

describe('the VAT notice on a credit note', () => {
  it.each([
    ['REJECTED_VAT_STILL_REDUCED', 'billDetail.vatNotice.REJECTED_VAT_STILL_REDUCED'],
    ['VAT_REDUCED_ON_RECEIPT', 'billDetail.vatNotice.VAT_REDUCED_ON_RECEIPT'],
  ])('%s', (code, key) => {
    expect(vatNoticeOf(note({ ...STANDALONE, vatNotice: code }, 'REJECTED'))).toEqual({ key })
  })

  it('says nothing for no notice, an unknown one, or a server before R5', () => {
    expect(vatNoticeOf(note(STANDALONE, 'PENDING'))).toBeNull()
    expect(vatNoticeOf(note({ ...STANDALONE, vatNotice: 'SOMETHING_NEW' }, 'PENDING'))).toBeNull()
    expect(vatNoticeOf(note(null, 'PENDING'))).toBeNull()
    expect(vatNoticeOf(note({ ...STANDALONE, vatNotice: 'VAT_REDUCED_ON_RECEIPT' }, 'PENDING', { documentTypeCode: '380' }))).toBeNull()
  })
})
