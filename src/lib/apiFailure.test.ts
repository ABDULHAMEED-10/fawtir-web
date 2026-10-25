import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'

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
