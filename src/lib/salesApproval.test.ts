import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/errors'
import type { SalesApprovalDto, SalesApprovalRuleDto } from '../api/invoices/salesApproval'
import {
  coversProblem,
  editWaitsOnApproval,
  isSalesApprovalUnavailable,
  issueWaitsOnApproval,
  ruleChangeOf,
  ruleChanged,
  ruleFormOf,
  salesApprovalAvailable,
  salesApprovalIsOn,
  salesApprovalMessageKey,
  tooFewApprovers,
} from './salesApproval'
import { describeApiFailure } from './apiFailure'

const RULE: SalesApprovalRuleDto = {
  version: 4,
  enabled: true,
  covers: { invoice: true, creditNote: false, debitNote: false, selfBilled: false },
  requiredApprovals: 2,
  autoApproveBelow: 100,
  reason: null,
  updatedBy: null,
  updatedAt: null,
  approverCount: 3,
  available: true,
}

const approval = (status: SalesApprovalDto['status']): SalesApprovalDto => ({
  status,
  requiredApprovals: 1,
  distinctApprovals: 0,
  draftVersion: 2,
  payableAmount: 10,
  currency: 'OMR',
  requestedBy: null,
  requestedAt: null,
  lastDecision: null,
  callerMayRequest: false,
  callerMayDecide: false,
})

const refusal = (status: number, code: string | null) => new ApiError({ status, problemType: null, code })

describe('sales approval rule form', () => {
  it('sends the whole rule against the version it was read at', () => {
    const form = ruleFormOf(RULE)
    expect(ruleChangeOf({ ...form, requiredApprovals: '3' }, RULE.version)).toEqual({
      expectedVersion: 4,
      enabled: true,
      covers: RULE.covers,
      requiredApprovals: 3,
      autoApproveBelow: 100,
    })
  })

  it('clears the threshold with an explicit null', () => {
    const change = ruleChangeOf({ ...ruleFormOf(RULE), mode: 'EVERY_BILL' }, 4)
    expect(change?.autoApproveBelow).toBeNull()
    expect(ruleChanged(RULE, change!)).toBe(true)
  })

  it('refuses a rule that is on and covers nothing, as the server does', () => {
    const empty = {
      ...ruleFormOf(RULE),
      covers: { invoice: false, creditNote: false, debitNote: false, selfBilled: false },
    }
    expect(coversProblem(empty)).toBe('coversNothing')
    expect(ruleChangeOf(empty, 4)).toBeNull()
    // Off, it may cover nothing.
    expect(ruleChangeOf({ ...empty, enabled: false }, 4)).not.toBeNull()
  })

  it('is unchanged until something differs', () => {
    expect(ruleChanged(RULE, ruleChangeOf(ruleFormOf(RULE), 4)!)).toBe(false)
  })

  it('warns when fewer people can approve than a request would need beside its preparer', () => {
    expect(tooFewApprovers(2, 2)).toBe(true)
    expect(tooFewApprovers(3, 2)).toBe(false)
    expect(tooFewApprovers(null, 2)).toBe(false)
  })
})

describe('whether the deployment offers sales approval', () => {
  it('needs the server to say available: true, and the rule on for the queue', () => {
    expect(salesApprovalAvailable(RULE)).toBe(true)
    expect(salesApprovalIsOn(RULE)).toBe(true)
    expect(salesApprovalIsOn({ ...RULE, enabled: false })).toBe(false)
    // Switched off, even with a rule left on from before.
    expect(salesApprovalAvailable({ ...RULE, available: false })).toBe(false)
    expect(salesApprovalIsOn({ ...RULE, available: false })).toBe(false)
    expect(salesApprovalAvailable(null)).toBe(false)
  })

  it('reads a server that omits the field as off', () => {
    const older: SalesApprovalRuleDto = { ...RULE }
    delete older.available
    expect(salesApprovalAvailable(older)).toBe(false)
    expect(salesApprovalIsOn(older)).toBe(false)
  })
})

describe('what a draft offers', () => {
  it('holds Issue until approved, and Edit while waiting', () => {
    expect(issueWaitsOnApproval(null)).toBe(false)
    expect(issueWaitsOnApproval(approval('NOT_REQUIRED'))).toBe(false)
    expect(issueWaitsOnApproval(approval('APPROVED'))).toBe(false)
    expect(issueWaitsOnApproval(approval('NOT_REQUESTED'))).toBe(true)
    expect(issueWaitsOnApproval(approval('PENDING'))).toBe(true)
    expect(issueWaitsOnApproval(approval('REJECTED'))).toBe(true)
    expect(editWaitsOnApproval(approval('PENDING'))).toBe(true)
    expect(editWaitsOnApproval(approval('APPROVED'))).toBe(false)
  })
})

describe('refusals', () => {
  it('maps each server code to our own sentence, from any screen', () => {
    expect(salesApprovalMessageKey(refusal(403, 'SALES_APPROVER_IS_PREPARER'))).toBe(
      'salesApproval.refused.preparer',
    )
    expect(describeApiFailure(refusal(409, 'SALES_APPROVAL_REQUIRED')).key).toBe(
      'salesApproval.refused.required',
    )
    expect(salesApprovalMessageKey(refusal(409, 'SOMETHING_ELSE'))).toBeNull()
  })

  it('reads only the 503 SALES_APPROVAL_UNAVAILABLE as switched off', () => {
    expect(isSalesApprovalUnavailable(refusal(503, 'SALES_APPROVAL_UNAVAILABLE'))).toBe(true)
    expect(isSalesApprovalUnavailable(refusal(409, 'SALES_APPROVAL_PENDING'))).toBe(false)
    // Any other 503 is an outage, not the switch.
    expect(isSalesApprovalUnavailable(refusal(503, 'DISPATCH_UNAVAILABLE'))).toBe(false)
    expect(isSalesApprovalUnavailable(refusal(503, null))).toBe(false)
  })
})
