import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetEntitlements,
  hasPermission,
  isPlatformOperator,
  loadEntitlements,
  peekEntitlements,
  type Entitlements,
} from './entitlements'
import { signOut } from './logout'

const ENTITLEMENTS: Entitlements = {
  userId: 'u-1',
  username: 'ops.reviewer',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform tenant administrator', systemRole: true }],
  permissions: ['platform.tenants.manage', 'role.read'],
  scopes: ['platform.tenants.manage', 'role.read'],
  featureFlags: {},
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  forgetEntitlements()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadEntitlements', () => {
  it('asks once and shares the answer, in flight and afterwards', async () => {
    fetchMock.mockResolvedValue(ok(ENTITLEMENTS))

    const [a, b] = await Promise.all([loadEntitlements(), loadEntitlements()])
    const c = await loadEntitlements()

    expect(a).toEqual(ENTITLEMENTS)
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/me/entitlements')
    expect(peekEntitlements()).toEqual(ENTITLEMENTS)
  })

  it('does not keep a failure, so the next visit asks again', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(ok(ENTITLEMENTS))

    await expect(loadEntitlements()).rejects.toThrow()
    expect(peekEntitlements()).toBeNull()
    await expect(loadEntitlements()).resolves.toEqual(ENTITLEMENTS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never lets an answer for a forgotten session become the current one', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
    const stale = loadEntitlements()

    forgetEntitlements()
    answer(ok(ENTITLEMENTS))
    await stale

    expect(peekEntitlements()).toBeNull()
  })

  it('is forgotten once the backend confirms sign-out, and kept when sign-out fails', async () => {
    fetchMock.mockResolvedValueOnce(ok(ENTITLEMENTS))
    await loadEntitlements()

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ type: 'x/internal-error' }), { status: 503 }))
    await expect(signOut()).rejects.toThrow()
    expect(peekEntitlements()).not.toBeNull()

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await signOut()
    expect(peekEntitlements()).toBeNull()
  })
})

describe('permission helpers', () => {
  it('reads permissions only from the backend answer', () => {
    expect(hasPermission(ENTITLEMENTS, 'platform.tenants.manage')).toBe(true)
    expect(hasPermission(ENTITLEMENTS, 'platform.operators.manage')).toBe(false)
  })

  it('recognises an operator by a platform permission, never by a role name', () => {
    expect(isPlatformOperator(ENTITLEMENTS)).toBe(true)
    expect(
      isPlatformOperator({
        ...ENTITLEMENTS,
        roles: [{ id: 'r', code: 'PLATFORM_ADMIN', name: 'Super Admin', systemRole: true }],
        permissions: ['invoice.read'],
      }),
    ).toBe(false)
  })
})
