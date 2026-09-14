import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { afterLifecycle, changeOperatorLifecycle, describeLifecycleFailure } from './operatorLifecycle'
import type { PlatformUser } from './platformOperators'

const noor: PlatformUser = {
  id: 'u-noor',
  username: 'noor.support',
  email: 'noor@example.test',
  firstName: 'Noor',
  lastName: null,
  enabled: true,
  roles: ['PLATFORM_SUPPORT'],
  createdAt: '2026-09-02T08:00:00Z',
  mfaEnabled: false,
  locked: false,
  lockedUntil: null,
}

describe('changing an operator’s standing', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    document.cookie = 'FAWTIR_CSRF=csrf-token-value; path=/'
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it.each(['lock', 'unlock', 'deactivate'] as const)(
    'sends %s to the operator path as one POST carrying only the reason, with the CSRF header',
    async (action) => {
      await changeOperatorLifecycle({ id: 'u 1' }, action, 'Left the rotation')

      const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(calledUrl).toBe(`/api/v1/platform/operators/u%201/${action}`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ reason: 'Left the rotation' })
      expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token-value')
    },
  )
})

describe('afterLifecycle', () => {
  it('shows a lock as an administrator’s lock, and an unlock as none', () => {
    expect(afterLifecycle(noor, 'lock')).toMatchObject({ locked: true, lockedUntil: null })
    expect(afterLifecycle({ ...noor, locked: true, lockedUntil: '2026-09-14T10:15:00Z' }, 'unlock')).toMatchObject({
      locked: false,
      lockedUntil: null,
    })
  })

  it('shows a deactivated person as the deactivated list does: signed-in off, no role', () => {
    expect(afterLifecycle(noor, 'deactivate')).toMatchObject({ enabled: false, roles: [] })
  })
})

describe('describeLifecycleFailure', () => {
  it('names the last administrator by its problem type, and any other 403 as a refusal', () => {
    expect(describeLifecycleFailure(new ApiError({ status: 403, problemType: 'last-administrator' })).key).toBe(
      'console.operators.lastAdmin',
    )
    expect(describeLifecycleFailure(new ApiError({ status: 403, problemType: 'insufficient-permission' })).key).toBe(
      'console.operators.lifecycle.error.refused',
    )
  })

  it('reads a person who has gone and a reason the backend rejects, and leaves the rest to the shared messages', () => {
    expect(describeLifecycleFailure(new ApiError({ status: 404, problemType: 'resource-not-found' })).key).toBe(
      'console.operators.error.gone',
    )
    expect(describeLifecycleFailure(new ApiError({ status: 400, problemType: 'validation-failed' })).key).toBe(
      'console.operators.reason.invalid',
    )
    expect(describeLifecycleFailure(new ApiError({ status: 500, problemType: null })).key).toBe('identityErrors.service')
    expect(describeLifecycleFailure(new NetworkError('offline')).key).toBe('identityErrors.network')
  })
})
