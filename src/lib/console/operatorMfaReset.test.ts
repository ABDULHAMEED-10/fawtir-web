import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { describeMfaResetFailure, resetOperatorMfa } from './operatorMfaReset'

describe('resetting', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    document.cookie = 'FAWTIR_CSRF=csrf-token-value; path=/'
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ userId: 'u-1', username: 'a', revokedSessions: 2, resetAt: '2026-09-14T10:00:00Z', resetBy: 'u-2' }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it('posts the reason and nothing else to the operator endpoint, with the CSRF header', async () => {
    const answer = await resetOperatorMfa({ id: 'u 1' }, 'Lost phone')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/platform/operators/u%201/mfa-reset')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Lost phone' })
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token-value')
    expect(answer.revokedSessions).toBe(2)
  })
})

describe('refusals', () => {
  it.each([
    [400, 'console.operators.reason.invalid'],
    [403, 'console.operators.mfaReset.error.refused'],
    [404, 'console.operators.error.gone'],
    [500, 'identityErrors.service'],
  ])('reads a %s', (status, key) => {
    expect(describeMfaResetFailure(new ApiError({ status, problemType: null })).key).toBe(key)
  })

  it('reads a rate limit and a lost connection with the shared messages', () => {
    expect(describeMfaResetFailure(new ApiError({ status: 429, problemType: null })).key).toBe('identityErrors.rateLimited')
    expect(describeMfaResetFailure(new NetworkError('timeout')).key).toBe('identityErrors.timeout')
  })
})
