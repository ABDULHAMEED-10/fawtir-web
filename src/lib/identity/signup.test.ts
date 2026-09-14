import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  buildSignupRequest,
  describeSignupFailure,
  toLanguageCode,
  validateSignupForm,
  type SignupFormValues,
} from './signup'

const VALUES: SignupFormValues = {
  fullName: '  Hafidh Saif ',
  username: ' hafidh.saif ',
  email: ' hafidh@example.test ',
  phone: '9123 4567',
  password: ' Correct-Horse9 ',
  confirmPassword: ' Correct-Horse9 ',
  consent: true,
}

describe('buildSignupRequest', () => {
  it('sends exactly the fields the backend accepts', () => {
    const request = buildSignupRequest(VALUES, 'en')

    expect(Object.keys(request).sort()).toEqual(
      [
        'email',
        'fullName',
        'languageCode',
        'password',
        'phone',
        'privacyAccepted',
        'termsAccepted',
        'username',
      ].sort(),
    )
    expect(request).not.toHaveProperty('confirmPassword')
    expect(request).not.toHaveProperty('tenantCode')
    expect(request).not.toHaveProperty('consent')
  })

  it('does not let an extra form property reach the wire', () => {
    const withExtras = { ...VALUES, tenantCode: 'ACME', roleCodes: ['ADMIN'] } as SignupFormValues

    const serialized = JSON.stringify(buildSignupRequest(withExtras, 'en'))
    expect(serialized).not.toContain('tenantCode')
    expect(serialized).not.toContain('roleCodes')
    expect(serialized).not.toContain('confirmPassword')
  })

  it('trims text, keeps the password exactly as typed and normalises the phone', () => {
    expect(buildSignupRequest(VALUES, 'en')).toEqual({
      fullName: 'Hafidh Saif',
      username: 'hafidh.saif',
      email: 'hafidh@example.test',
      phone: '+96891234567',
      password: ' Correct-Horse9 ',
      languageCode: 'en',
      termsAccepted: true,
      privacyAccepted: true,
    })
  })

  it('never records consent the user did not give', () => {
    const request = buildSignupRequest({ ...VALUES, consent: false }, 'en')
    expect(request.termsAccepted).toBe(false)
    expect(request.privacyAccepted).toBe(false)
  })
})

describe('toLanguageCode', () => {
  it.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['ar', 'ar'],
    ['ar-OM', 'ar'],
    ['fr', 'en'],
  ])('maps %s to %s', (input, expected) => {
    expect(toLanguageCode(input)).toBe(expected)
  })
})

describe('validateSignupForm', () => {
  it('blocks an unticked consent box', () => {
    expect(validateSignupForm({ ...VALUES, consent: false }).consent).toBe('validation.agreeRequired')
  })

  it('reports a mismatched confirmation', () => {
    expect(validateSignupForm({ ...VALUES, confirmPassword: 'Other-Horse9' }).confirmPassword).toBe(
      'validation.passwordMismatch',
    )
  })
})

describe('describeSignupFailure', () => {
  it('puts a 409 conflict on the username field', () => {
    const failure = describeSignupFailure(new ApiError({ status: 409, problemType: 'resource-conflict' }))
    expect(failure).toEqual({ fieldErrors: { username: 'validation.usernameTaken' }, formError: null })
  })

  it('maps field-attributed validation to localized keys, never the server sentence', () => {
    const failure = describeSignupFailure(
      new ApiError({
        status: 400,
        problemType: 'validation-failed',
        fieldErrors: [
          { field: 'username', message: 'Username must be 3 to 64 characters' },
          { field: 'termsAccepted', message: 'The Terms of Service must be accepted' },
        ],
      }),
    )
    expect(failure).toEqual({
      fieldErrors: { username: 'validation.usernameInvalid', consent: 'validation.agreeRequired' },
      formError: null,
    })
  })

  it('adds a form-level message when a field has no input to attach to', () => {
    const failure = describeSignupFailure(
      new ApiError({
        status: 400,
        problemType: 'validation-failed',
        fieldErrors: [{ field: 'languageCode', message: 'Language code must be 10 characters or fewer' }],
      }),
    )
    expect(failure).toEqual({ fieldErrors: {}, formError: { key: 'identityErrors.validation' } })
  })

  it('reports unattributed validation at form level', () => {
    const failure = describeSignupFailure(new ApiError({ status: 400, problemType: 'validation-failed' }))
    expect(failure.formError).toEqual({ key: 'identityErrors.validation' })
  })

  it('carries Retry-After into the rate-limit message', () => {
    const failure = describeSignupFailure(
      new ApiError({ status: 429, problemType: 'rate-limited', retryAfterSeconds: 42 }),
    )
    expect(failure.formError).toEqual({ key: 'identityErrors.rateLimitedFor', values: { seconds: 42 } })
  })

  it('falls back to a generic rate-limit message without Retry-After', () => {
    const failure = describeSignupFailure(new ApiError({ status: 429, problemType: 'rate-limited' }))
    expect(failure.formError).toEqual({ key: 'identityErrors.rateLimited' })
  })

  it.each([
    [new NetworkError('offline'), 'identityErrors.network'],
    [new NetworkError('timeout'), 'identityErrors.timeout'],
    [new ApiError({ status: 500, problemType: 'internal-error' }), 'identityErrors.service'],
    [new ApiError({ status: 503, problemType: null }), 'identityErrors.service'],
    [new ApiError({ status: 400, problemType: 'malformed-request' }), 'identityErrors.unexpected'],
    [new Error('boom'), 'identityErrors.unexpected'],
  ])('maps %o to %s', (error, key) => {
    expect(describeSignupFailure(error)).toEqual({ fieldErrors: {}, formError: { key } })
  })
})
