import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { CompanySummary } from '../../lib/console/companyVerification'
import { TenantsPage } from './TenantsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const LIST_URL = '/api/v1/platform/companies?page=0&size=25'
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PENDING_ID = '22222222-2222-4222-8222-222222222222'

const OPERATOR: Entitlements = {
  userId: 'u-1',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform', systemRole: true }],
  permissions: ['platform.tenants.manage'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}

/** Holds a platform permission, so the console opens, but not the one this screen needs. */
const SUPPORT_ONLY: Entitlements = {
  ...OPERATOR,
  username: 'ops.support',
  permissions: ['platform.support'],
  scopes: ['platform.support'],
}

const TENANT: CompanySummary = {
  tenantId: TENANT_ID,
  tenantCode: 'FT3GDWM54D',
  tenantName: 'Al Noor Bakery',
  legalName: 'Al Noor Bakery LLC',
  country: 'OM',
  verificationStatus: 'VERIFIED',
  tenantStatus: 'ACTIVE',
  profileRevision: 2,
  submittedAt: '2026-09-12T05:10:00Z',
  decidedAt: '2026-09-13T05:10:00Z',
}

/** Awaiting a decision, so the directory must offer the route to the verification queue. */
const PENDING: CompanySummary = {
  ...TENANT,
  tenantId: PENDING_ID,
  tenantCode: 'FTKHFZ94JU',
  tenantName: 'Sadam Company',
  verificationStatus: 'PENDING_VERIFICATION',
  tenantStatus: 'PENDING',
  decidedAt: null,
}

const pageOf = (items: CompanySummary[]) => ({
  items,
  page: 0,
  size: 25,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler>) {
  fetchMock.mockImplementation(async (url: string) => {
    const handler = handlers[url]
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)

function renderAt(path: string, { strict = false }: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/tenants" element={<TenantsPage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Tenants register', () => {
  it('lists tenants from the backend and shows no prototype rows', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([TENANT])),
    })
    renderAt('/console/tenants')

    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
    expect(screen.getByText('FT3GDWM54D')).toBeTruthy()
    // The fixture the screen used to render must be gone entirely.
    expect(document.body.textContent).not.toContain('Sur Trading Co')
  })

  it('renders no plan, quota, filing-health or revenue figures', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([TENANT])),
    })
    renderAt('/console/tenants')
    await screen.findByText('Al Noor Bakery')

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Business', 'Code', 'Status', 'Submitted', 'Action'])
    // OMR would only appear if a commercial figure were being invented.
    expect(document.body.textContent).not.toContain('OMR')
  })

  it('asks the backend once per screen, even under StrictMode', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([TENANT])),
    })
    renderAt('/console/tenants', { strict: true })

    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
    expect(callsTo(LIST_URL)).toHaveLength(1)
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
  })

  it('never asks for tenants without platform.tenants.manage', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, SUPPORT_ONLY) })
    renderAt('/console/tenants')

    await screen.findByText('ops.support')
    expect(callsTo(LIST_URL)).toHaveLength(0)
    expect(document.body.textContent).not.toContain('Al Noor Bakery')
  })

  it('shows an empty state rather than an empty table', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([])),
    })
    renderAt('/console/tenants')

    expect(await screen.findByText('No tenants on the platform yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('offers a retry when the read fails, and shows no backend prose', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () =>
        json(500, {
          type: 'https://api.fawtir.om/problems/internal',
          detail: 'Server prose that must not be shown.',
        }),
    })
    renderAt('/console/tenants')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose that must not be shown.')
  })
})

describe('Approval stays with the verification queue', () => {
  it('routes a pending company to Verification and offers no decision of its own', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([PENDING])),
    })
    renderAt('/console/tenants')
    await screen.findByText('Sadam Company')

    const review = screen.getByRole('link', { name: 'Review' })
    expect(review.getAttribute('href')).toBe(`/console/onboarding/${PENDING_ID}`)
    // A second attest/reject implementation must never appear in the directory.
    for (const absent of ['Attest', 'Approve', 'Reject']) {
      expect(document.body.textContent).not.toContain(absent)
    }
  })

  it('offers no Review for a company that has already been decided', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([TENANT])),
    })
    renderAt('/console/tenants')
    await screen.findByText('Al Noor Bakery')

    expect(screen.queryByRole('link', { name: 'Review' })).toBeNull()
  })

  it('keeps the established tenant detail route for normal tenant management', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [LIST_URL]: () => json(200, pageOf([TENANT])),
    })
    renderAt('/console/tenants')

    const name = await screen.findByRole('link', { name: 'Al Noor Bakery' })
    expect(name.getAttribute('href')).toBe(`/console/tenants/${TENANT_ID}`)
  })
})
