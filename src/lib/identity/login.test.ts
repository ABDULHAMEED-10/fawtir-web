import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  buildLoginRequest,
  describeLoginFailure,
  isChallengeSpent,
  isSignInAgainState,
  toLoginOutcome,
  validateLoginForm,
} from './login'

const problem = (status: number, type: string, headers: Record<string, string> = {}) =>
  new ApiError({ status, problemType: type, fieldErrors: [], retryAfterSeconds: headers['Retry-After'] ? Number(headers['Retry-After']) : null })

describe('validateLoginForm', () => {
  it('asks for both fields', () => {
    expect(validateLoginForm({ username: '  ', password: '' })).toEqual({
      username: 'validation.required',
      password: 'validation.required',
    })
  })

  it('treats a whitespace-only password as missing, as the backend does', () => {
    expect(validateLoginForm({ username: 'hafidh', password: '   ' }).password).toBe('validation.required')
  })

  it('does not judge the username shape — legacy email-shaped usernames still sign in', () => {
    expect(validateLoginForm({ username: 'Owner@Example.test', password: 'x' })).toEqual({
      username: undefined,
      password: undefined,
    })
  })

  it('applies the server bounds', () => {
    expect(validateLoginForm({ username: 'a'.repeat(USERNAME_MAX_LENGTH), password: 'p'.repeat(PASSWORD_MAX_LENGTH) })).toEqual({
      username: undefined,
      password: undefined,
    })
    expect(validateLoginForm({ username: 'a'.repeat(USERNAME_MAX_LENGTH + 1), password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1) })).toEqual({
      username: 'validation.tooLong',
      password: 'validation.tooLong',
    })
  })

  it('measures the username after trimming, as it is sent', () => {
    expect(validateLoginForm({ username: ` ${'a'.repeat(USERNAME_MAX_LENGTH)} `, password: 'x' }).username).toBeUndefined()
  })
})

describe('buildLoginRequest', () => {
  it('sends the username trimmed, the password as typed, cookie mode on, and nothing else', () => {
    const request = buildLoginRequest({ username: '  hafidh.saif ', password: ' Correct-Horse9! ' })
    expect(request).toEqual({ username: 'hafidh.saif', password: ' Correct-Horse9! ', portalCookie: true })
    expect(Object.keys(request)).not.toContain('tenantCode')
  })
})

describe('toLoginOutcome', () => {
  it('turns the MFA answer into a challenge timed from receipt, not the server clock', () => {
    const outcome = toLoginOutcome(
      { mfaRequired: true, mfaChallengeToken: 'mfa.token', mfaChallengeExpiresIn: 300 },
      1_000,
    )
    expect(outcome).toEqual({ kind: 'code', challenge: { token: 'mfa.token', expiresAt: 301_000 } })
  })

  it('treats a password-only session as signed in', () => {
    expect(toLoginOutcome({ mfaRequired: false }, 0)).toEqual({ kind: 'signedIn' })
  })

  it.each([
    ['no body', undefined],
    ['no challenge token', { mfaRequired: true, mfaChallengeExpiresIn: 300 }],
    ['an empty challenge token', { mfaRequired: true, mfaChallengeToken: '', mfaChallengeExpiresIn: 300 }],
    ['no expiry', { mfaRequired: true, mfaChallengeToken: 'mfa.token' }],
    ['a spent expiry', { mfaRequired: true, mfaChallengeToken: 'mfa.token', mfaChallengeExpiresIn: 0 }],
  ])('refuses a response with %s', (_label, response) => {
    expect(() => toLoginOutcome(response as never, 0)).toThrow()
  })
})

describe('describeLoginFailure', () => {
  it('answers every refused credential alike', () => {
    expect(describeLoginFailure(problem(401, 'authentication-failed'))).toEqual({ key: 'login.failed' })
  })

  it.each([
    [problem(429, 'rate-limited', { 'Retry-After': '30' }), { key: 'identityErrors.rateLimitedFor', values: { seconds: 30 } }],
    [problem(503, 'internal-error'), { key: 'identityErrors.service' }],
    [problem(400, 'validation-failed'), { key: 'identityErrors.validation' }],
    [problem(400, 'malformed-request'), { key: 'identityErrors.unexpected' }],
    [new NetworkError('offline'), { key: 'identityErrors.network' }],
    [new NetworkError('timeout'), { key: 'identityErrors.timeout' }],
    [new Error('Unrecognised login response'), { key: 'identityErrors.unexpected' }],
  ])('falls back to the shared messages (%#)', (error, message) => {
    expect(describeLoginFailure(error)).toEqual(message)
  })
})

describe('isChallengeSpent', () => {
  it('is true only for a 401', () => {
    expect(isChallengeSpent(problem(401, 'authentication-failed'))).toBe(true)
    expect(isChallengeSpent(problem(429, 'rate-limited'))).toBe(false)
    expect(isChallengeSpent(new NetworkError('offline'))).toBe(false)
  })
})

describe('isSignInAgainState', () => {
  it('recognises only the exact notice', () => {
    expect(isSignInAgainState({ signInAgain: true })).toBe(true)
    expect(isSignInAgainState({ signInAgain: 'true' })).toBe(false)
    expect(isSignInAgainState(null)).toBe(false)
  })
})
