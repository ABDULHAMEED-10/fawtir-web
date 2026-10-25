import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { ApiError, resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { TenantDetailPage } from '../TenantDetailPage'
import { describeErpEntitlementFailure, type ErpEntitlementStatus } from '../../../lib/console/erpEntitlement'

/**
 * The console's ERP entitlement card against the real platform API shape. Every state on screen
 * is the backend's answer: what GET returned, then what PUT or DELETE returned. Nothing is shown
 * as granted or revoked before the backend says so.
 */
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_CODE = 'FT3GDWM54D'
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const OVERVIEW_URL = `/api/v1/platform/companies/${TENANT_ID}/overview`
const ENTITLEMENT_URL = `/api/v1/platform/tenants/${TENANT_ID}/erp-entitlement`

const OPERATOR: Entitlements = {
  userId: 'u-1',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform', systemRole: true }],
  permissions: ['platform.tenants.manage'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}

const OVERVIEW = {
  identity: { tenantId: TENANT_ID, tenantCode: TENANT_CODE, tenantName: 'Al Noor Bakery', tenantStatus: 'ACTIVE', identityStatus: 'READY' },
  company: { legalName: 'Al Noor Bakery LLC', legalNameAr: null, tradingName: null, commercialRegistrationNumber: null, taxNumber: null, country: 'OM', registeredAddressLine1: null, registeredAddressLine2: null, registeredAddressLine3: null, registeredCity: null, registeredPostalCode: null, registeredCountrySubdivision: null, registeredPoBox: null, timezone: 'Asia/Muscat', contactPersonName: null, contactPhone: null, contactEmail: null },
  verification: { status: 'VERIFIED', method: null, rejectionReason: null, attestationReference: null, evidenceRecorded: true, profileRevision: 1, submittedAt: null, submittedBy: null, decidedAt: null, decidedBy: null },
  subscription: { planCode: 'STANDARD', planName: 'Standard', monthlyPrice: '39.000', invoicesPerMonth: 500, overageEnabled: false, implicitDefault: false, startedOn: '2026-09-01', changedAt: '2026-09-01T00:00:00Z' },
  operational: { ready: true, reasonCode: null },
}

const OFF: ErpEntitlementStatus = { tenantId: TENANT_ID, entitled: false, grantedBy: null, grantedAt: null, revokedBy: null, revokedAt: null }
const ON: ErpEntitlementStatus = { ...OFF, entitled: true, grantedBy: 'u-1', grantedAt: '2026-10-09T05:00:00Z' }

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let who: Entitlements
let current: ErpEntitlementStatus
let calls: Array<{ url: string; method: string; body: unknown }>

beforeEach(() => {
  who = OPERATOR
  current = OFF
  calls = []
  forgetEntitlements()
  resetSharedRequests()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === OVERVIEW_URL) return json(200, OVERVIEW)
    if (url === ENTITLEMENT_URL && method === 'GET') return json(200, current)
    if (url === ENTITLEMENT_URL && method === 'PUT') return json(200, (current = ON))
    if (url === ENTITLEMENT_URL && method === 'DELETE') {
      return json(200, (current = { ...ON, entitled: false, revokedBy: 'u-1', revokedAt: '2026-10-09T06:00:00Z' }))
    }
    return json(404)
  }))
  void i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/console/tenants/${TENANT_ID}`]}>
      <Routes>
        <Route path="/console/tenants/:id" element={<TenantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const writes = () => calls.filter((call) => call.url === ENTITLEMENT_URL && call.method !== 'GET')

describe('the ERP entitlement card', () => {
  it('shows the state the backend holds and grants only after a confirmed reason', async () => {
    renderDetail()
    const card = (await screen.findByRole('heading', { name: 'ERP integration' })).closest('section')!
    expect(await within(card).findByText('Not enabled')).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { name: 'Enable ERP integration' }))
    const dialog = await screen.findByRole('dialog')
    expect(writes()).toHaveLength(0)
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Contract signed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable' }))

    await waitFor(() => expect(within(card).getByText('Enabled')).toBeTruthy())
    expect(writes()).toEqual([{ url: ENTITLEMENT_URL, method: 'PUT', body: { reason: 'Contract signed' } }])
  })

  it('revokes only when the tenant code is typed, and says nothing is deleted', async () => {
    current = ON
    renderDetail()
    const card = (await screen.findByRole('heading', { name: 'ERP integration' })).closest('section')!
    fireEvent.click(await within(card).findByRole('button', { name: 'Disable ERP integration' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Nothing is deleted/)).toBeTruthy()

    const [code, reason] = within(dialog).getAllByRole('textbox')
    fireEvent.change(reason, { target: { value: 'Contract ended' } })
    fireEvent.change(code, { target: { value: 'WRONG' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    expect(await within(dialog).findByText('Type the tenant code exactly as shown.')).toBeTruthy()
    expect(writes()).toHaveLength(0)

    fireEvent.change(code, { target: { value: TENANT_CODE } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(within(card).getByText('Not enabled')).toBeTruthy())
    expect(writes()).toEqual([{ url: ENTITLEMENT_URL, method: 'DELETE', body: { reason: 'Contract ended' } }])
  })

  it('re-reads the subscription cards after a grant, whose add-on card says who granted ERP', async () => {
    const SUBSCRIPTION_URL = `/api/v1/platform/companies/${TENANT_ID}/subscription`
    const extrasReads = () => calls.filter((call) => call.url === SUBSCRIPTION_URL && call.method === 'GET').length
    who = { ...OPERATOR, permissions: [...OPERATOR.permissions, 'platform.billing.read'] }
    renderDetail()
    const card = (await screen.findByRole('heading', { name: 'ERP integration' })).closest('section')!
    await within(card).findByText('Not enabled')
    await waitFor(() => expect(extrasReads()).toBeGreaterThan(0))
    const before = extrasReads()

    fireEvent.click(within(card).getByRole('button', { name: 'Enable ERP integration' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Contract signed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable' }))

    await waitFor(() => expect(within(card).getByText('Enabled')).toBeTruthy())
    await waitFor(() => expect(extrasReads()).toBeGreaterThan(before))
  })

  it('keeps the state and says so when the grant is refused', async () => {
    const fetchMock = vi.mocked(fetch)
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === ENTITLEMENT_URL && init?.method === 'PUT') {
        calls.push({ url: ENTITLEMENT_URL, method: 'PUT', body: JSON.parse(String(init.body)) })
        return json(500, { type: 'https://api.fawtir.om/problems/internal-error' })
      }
      return base(input, init)
    })
    renderDetail()
    const card = (await screen.findByRole('heading', { name: 'ERP integration' })).closest('section')!
    fireEvent.click(await within(card).findByRole('button', { name: 'Enable ERP integration' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Contract signed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable' }))

    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(within(card).getByText('Not enabled')).toBeTruthy()
    expect(writes()).toHaveLength(1)
  })

  it('is not shown, and the entitlement is never read, without platform.tenants.manage', async () => {
    who = { ...OPERATOR, permissions: ['platform.support'], scopes: ['platform.support'] }
    renderDetail()
    await screen.findByText('ops.reviewer')
    expect(screen.queryByRole('heading', { name: 'ERP integration' })).toBeNull()
    expect(calls.filter((call) => call.url === ENTITLEMENT_URL)).toHaveLength(0)
  })
})

describe('describeErpEntitlementFailure', () => {
  const refusal = (status: number, problemType?: string) =>
    new ApiError({ status, problemType: problemType ?? null })

  it('names the platform fences the backend reports', () => {
    expect(describeErpEntitlementFailure(refusal(403, 'production-platform-realm-required')).key).toBe('console.erpEntitlement.error.realm')
    expect(describeErpEntitlementFailure(refusal(403, 'impersonation-not-allowed')).key).toBe('console.erpEntitlement.error.impersonation')
    expect(describeErpEntitlementFailure(refusal(403)).key).toBe('console.erpEntitlement.error.refused')
    expect(describeErpEntitlementFailure(refusal(404)).key).toBe('console.erpEntitlement.error.gone')
    expect(describeErpEntitlementFailure(refusal(400)).key).toBe('console.erpEntitlement.error.invalid')
  })
})
