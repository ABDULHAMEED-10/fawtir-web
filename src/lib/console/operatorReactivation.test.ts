import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  DEACTIVATED_OPERATORS_PATH,
  describeReactivateFailure,
  reactivateOperator,
  withReactivated,
} from './operatorReactivation'
import type { PlatformUser } from './platformOperators'

const user = (id: string, createdAt: string): PlatformUser => ({
  id,
  username: `${id}.name`,
  email: `${id}@example.test`,
  firstName: null,
  lastName: null,
  enabled: true,
  roles: [],
  createdAt,
  mfaEnabled: false,
  locked: false,
  lockedUntil: null,
})

describe('the deactivated list', () => {
  it('asks only for deactivated accounts, most recently deactivated first, in one page', () => {
    expect(DEACTIVATED_OPERATORS_PATH).toBe('/v1/users?status=DEACTIVATED&page=0&size=50&sort=deletedAt,desc')
  })
})

describe('reactivating', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    document.cookie = 'FAWTIR_CSRF=csrf-token-value; path=/'
    fetchMock = vi.fn(async () => new Response(JSON.stringify(user('u-1', '2026-09-01T08:00:00Z')), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it('posts the reason and nothing else to the operator endpoint, with the CSRF header', async () => {
    await reactivateOperator(user('u 1', '2026-09-01T08:00:00Z'), 'Returned from leave')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/platform/operators/u%201/reactivate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Returned from leave' })
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token-value')
  })
})

describe('withReactivated', () => {
  const a = user('a', '2026-09-01T08:00:00Z')
  const c = user('c', '2026-09-03T08:00:00.123456Z')

  it('places a returning person by creation, reading instants with any number of fraction digits', () => {
    const b = user('b', '2026-09-02T08:00:00.5Z')
    expect(withReactivated([a, c], [b]).map((u) => u.id)).toEqual(['a', 'b', 'c'])
    // As text, "…00.5Z" sorts after "…00.123456Z" of the same second; as instants it is later.
    const sameSecond = user('s', '2026-09-03T08:00:00.5Z')
    expect(withReactivated([a, c], [sameSecond]).map((u) => u.id)).toEqual(['a', 'c', 's'])
  })

  it('never lists someone twice, and leaves the team untouched when nobody returned', () => {
    expect(withReactivated([a, c], [a]).map((u) => u.id)).toEqual(['a', 'c'])
    expect(withReactivated([c, a], []).map((u) => u.id)).toEqual(['c', 'a'])
  })

  it('replaces an older copy with the answer: someone brought back here has no role', () => {
    const stale = { ...a, roles: ['PLATFORM_SUPPORT'] }
    expect(withReactivated([stale, c], [a])[0].roles).toEqual([])
  })

  it('on a paged team, replaces copies but places nobody new', () => {
    const b = user('b', '2026-09-02T08:00:00Z')
    expect(withReactivated([a, c], [b], false).map((u) => u.id)).toEqual(['a', 'c'])
    expect(withReactivated([{ ...a, roles: ['X'] }], [a], false)[0].roles).toEqual([])
  })
})

describe('refusals', () => {
  it.each([
    [400, 'console.operators.reason.invalid'],
    [409, 'console.operators.reactivate.error.active'],
    [404, 'console.operators.reactivate.error.gone'],
    [403, 'console.operators.error.refused'],
    [500, 'identityErrors.service'],
  ])('reads a %s', (status, key) => {
    expect(describeReactivateFailure(new ApiError({ status, problemType: null })).key).toBe(key)
  })

  it('reads a rate limit and a lost connection with the shared messages', () => {
    expect(describeReactivateFailure(new ApiError({ status: 429, problemType: null })).key).toBe(
      'identityErrors.rateLimited',
    )
    expect(describeReactivateFailure(new NetworkError('offline')).key).toBe('identityErrors.network')
  })
})
