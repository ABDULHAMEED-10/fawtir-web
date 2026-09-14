import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { describeVerificationFailure, formatCountdown, isSignupVerificationState } from './verification'

describe('describeVerificationFailure', () => {
  const unauthorized = new ApiError({ status: 401, problemType: 'authentication-failed' })

  it('reads the uniform 401 as an expired code once the server-given expiry has passed', () => {
    expect(describeVerificationFailure(unauthorized, true)).toEqual({ key: 'verifyCode.expired' })
    expect(describeVerificationFailure(unauthorized, false)).toEqual({ key: 'verifyCode.invalid' })
  })

  it('falls back to the shared messages for everything else', () => {
    expect(describeVerificationFailure(new NetworkError('timeout'), false)).toEqual({ key: 'identityErrors.timeout' })
    expect(
      describeVerificationFailure(new ApiError({ status: 429, problemType: 'rate-limited', retryAfterSeconds: 30 }), false),
    ).toEqual({ key: 'identityErrors.rateLimitedFor', values: { seconds: 30 } })
  })
})

describe('isSignupVerificationState', () => {
  it('accepts only the complete signup hand-off', () => {
    const state = {
      from: 'signup',
      tenantCode: 'TNT-1',
      email: 'a@example.test',
      emailVerificationExpiresAt: '2026-09-12T10:10:00Z',
      resendAvailableAt: '2026-09-12T10:01:00Z',
    }
    expect(isSignupVerificationState(state)).toBe(true)
    expect(isSignupVerificationState({ ...state, tenantCode: undefined })).toBe(false)
    expect(isSignupVerificationState({ from: 'forgot-password', contact: 'a@example.test' })).toBe(false)
    expect(isSignupVerificationState(null)).toBe(false)
  })
})

describe('formatCountdown', () => {
  it('renders m:ss and never goes negative', () => {
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(9)).toBe('0:09')
    expect(formatCountdown(-3)).toBe('0:00')
  })
})
