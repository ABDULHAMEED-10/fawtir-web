import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'
import {
  REFUSAL_FALLBACK_KEY,
  refusalMessageKey,
  refusalMessageValues,
} from './expenditureRefusals'
import { salesApprovalMessageKey } from './salesApproval'
import { SUBSCRIPTION_RESTRICTED, subscriptionRestrictedMessageKey } from './subscriptionRestricted'
import { taxReasonRefusalKey } from './taxReasonRefusals'

const error = (status: number, problemType: string | null) => new ApiError({ status, problemType })

describe('describeApiFailure', () => {
  it('words ERP switched off for the company apart from a missing permission', () => {
    expect(describeApiFailure(error(403, 'erp-entitlement-required')).key).toBe(
      'apiErrors.erpNotEnabled',
    )
    expect(describeApiFailure(error(403, 'insufficient-permission')).key).toBe('apiErrors.forbidden')
    expect(describeApiFailure(error(403, 'csrf-rejected')).key).toBe('apiErrors.csrf')
  })
})

// A record keyed by the server's code answers prototype members ("constructor", "toString") too:
// each mapper in this chain reads own keys only, or a crafted code renders a function as a key.
describe('a code that names a prototype member', () => {
  const PROTOTYPE_CODES = ['constructor', 'toString', '__proto__', 'hasOwnProperty']
  const coded = (status: number, problemType: string | null, code: string) =>
    new ApiError({ status, problemType, code })

  it.each(PROTOTYPE_CODES)('is no refusal any mapper knows (%s)', (code) => {
    expect(salesApprovalMessageKey(coded(409, 'resource-conflict', code))).toBeNull()
    expect(taxReasonRefusalKey(coded(400, 'validation-failed', code))).toBeNull()
    expect(refusalMessageKey(coded(409, 'resource-conflict', code))).toBeNull()
    expect(refusalMessageKey(coded(400, 'expenditure-refused', code))).toBe(REFUSAL_FALLBACK_KEY)
    expect(refusalMessageValues(coded(400, 'expenditure-refused', code))).toBeUndefined()
    expect(subscriptionRestrictedMessageKey(coded(409, SUBSCRIPTION_RESTRICTED, code))).toBe(
      'apiErrors.subscriptionRestricted.generic',
    )
  })

  it.each(PROTOTYPE_CODES)('falls through to the generic conflict sentence (%s)', (code) => {
    expect(describeApiFailure(coded(409, 'resource-conflict', code)).key).toBe('apiErrors.conflict')
  })
})
