import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { resetSharedRequests } from '../api'
import { usePlanUsage } from './usePlanUsage'
import { SessionContext } from '../lib/session/session'
import type { Entitlements } from '../lib/identity/entitlements'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const PLAN_READER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions: ['tenant.plan.read'],
  scopes: [],
  featureFlags: {},
}
let who: Entitlements = PLAN_READER
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionContext.Provider value={who}>
    <MemoryRouter>{children}</MemoryRouter>
  </SessionContext.Provider>
)
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetSharedRequests()
  who = PLAN_READER
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('usePlanUsage, the composers’ quota meter', () => {
  it('reads the plan’s real allowance and use', async () => {
    fetchMock.mockResolvedValue(json(200, { plan: {}, usage: { used: 7, quota: 100 } }))
    const { result } = renderHook(() => usePlanUsage(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ used: 7, allowance: 100, percent: 7 }))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/settings/plan')
  })

  it('counts the extra documents in the allowance (AL-9, EX-4): 10 of 15, not 10 of 10', async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        plan: {},
        usage: { used: 10, quota: 10 },
        allowance: { planDocuments: 10, extraDocuments: 5, totalAllowance: 15, used: 10 },
      }),
    )
    const { result } = renderHook(() => usePlanUsage(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ used: 10, allowance: 15, percent: 66.7 }))
  })

  it('draws no meter when the plan cannot be read, rather than a sample one', async () => {
    fetchMock.mockResolvedValue(
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' }),
    )
    const { result } = renderHook(() => usePlanUsage(), { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toBeNull()
  })
})

describe('usePlanUsage for a reader without tenant.plan.read (B-14)', () => {
  it('asks nothing and draws no meter', async () => {
    who = { ...PLAN_READER, permissions: ['invoice.read'] }
    const { result } = renderHook(() => usePlanUsage(), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
