import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetEntitlements, type Entitlements } from './entitlements'
import { CONSOLE_ROUTE, SIGNED_IN_ROUTE, landingRoute } from './login'

const base: Entitlements = {
  userId: 'u-1',
  username: 'someone',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
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

describe('landingRoute', () => {
  it('sends a Fawtir operator to the console', async () => {
    fetchMock.mockResolvedValue(
      ok({ ...base, username: 'mohammed.albahri', permissions: ['platform.tenants.manage'] }),
    )
    await expect(landingRoute()).resolves.toBe(CONSOLE_ROUTE)
  })

  it('sends a tenant user to the dashboard', async () => {
    fetchMock.mockResolvedValue(ok({ ...base, permissions: ['invoice.read', 'customer.read'] }))
    await expect(landingRoute()).resolves.toBe(SIGNED_IN_ROUTE)
  })

  it('falls back to the dashboard when the entitlements cannot be read', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(landingRoute()).resolves.toBe(SIGNED_IN_ROUTE)
  })

  it('sends a tenant user back to the till they switched user on', async () => {
    fetchMock.mockResolvedValue(ok({ ...base, permissions: ['pos.sell'] }))
    await expect(landingRoute('/pos')).resolves.toBe('/pos')
  })

  it('never sends an operator anywhere but the console, nor anyone off the app', async () => {
    fetchMock.mockResolvedValue(ok({ ...base, permissions: ['platform.tenants.manage'] }))
    await expect(landingRoute('/pos')).resolves.toBe(CONSOLE_ROUTE)
    forgetEntitlements()
    fetchMock.mockResolvedValue(ok({ ...base, permissions: ['invoice.read'] }))
    await expect(landingRoute('//evil.example')).resolves.toBe(SIGNED_IN_ROUTE)
  })
})
