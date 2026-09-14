import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { describeEmailChangeFailure, isSameEmail, requestOperatorEmailChange } from './operatorEmailChange'

describe('requesting', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    document.cookie = 'FAWTIR_CSRF=csrf-token-value; path=/'
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'PENDING_CONFIRMATION' }), { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it('puts the address it replaces, the new one and the reason — nothing else — with the CSRF header', async () => {
    await requestOperatorEmailChange({ id: 'u 1', email: 'old@example.test' }, 'new@example.test', 'Moved team')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/platform/operators/u%201/email')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      expectedCurrentEmail: 'old@example.test',
      newEmail: 'new@example.test',
      reason: 'Moved team',
    })
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token-value')
  })
})

it('compares addresses as the backend does: trimmed and case-insensitive', () => {
  expect(isSameEmail(' Noor@Example.test ', 'noor@example.test')).toBe(true)
  expect(isSameEmail('noor@example.test', 'noor2@example.test')).toBe(false)
})

describe('refusals', () => {
  it.each([
    [409, 'console.operators.emailChange.error.conflict'],
    [400, 'console.operators.emailChange.error.rejected'],
    [403, 'console.operators.emailChange.error.refused'],
    [404, 'console.operators.error.gone'],
    [500, 'identityErrors.service'],
  ])('reads a %s', (status, key) => {
    expect(describeEmailChangeFailure(new ApiError({ status, problemType: null })).key).toBe(key)
  })

  it('reads a lost connection with the shared message', () => {
    expect(describeEmailChangeFailure(new NetworkError('offline')).key).toBe('identityErrors.network')
  })
})
