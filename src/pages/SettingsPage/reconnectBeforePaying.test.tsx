import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { mustReconnectBeforePaying } from '../../lib/fawtirDisconnection'
import type { CompanyDisconnectionDto } from '../../api/settings/fawtirDisconnection'
import { ReconnectBeforePayingNote, RECONNECT_ROUTE } from './ReconnectBeforePayingNote'

/**
 * Plan v4 A3.8: the bills and pay screens tell a company that has left Fawtir to reconnect before
 * paying, with a link to the danger zone. Hidden unless the server reports a completed
 * disconnection with no reconnection in effect, so nothing changes on a server that does not.
 */
const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage', 'tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
}
const ACCOUNTANT: Entitlements = {
  ...ADMIN,
  roles: [{ id: 'r-2', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
}

const PATH = '/api/v1/settings/fawtir-disconnection'

const DISCONNECTION = {
  path: 'ALREADY_DISCONNECTED',
  status: 'DISCONNECTED',
  origin: 'CUSTOMER',
  askedVia: null,
  requestedAt: '2026-10-12T06:00:00Z',
  portalRequestRaisedAt: null,
  approvalDueAt: null,
  approvalExpired: false,
  disconnectedAt: '2026-10-13T09:00:00Z',
  smpRemovedAt: '2026-10-13T10:00:00Z',
  notCompletedReason: null,
  closedAt: null,
  subscriptionEndsOn: '2099-11-08',
  steps: [],
}

const LEFT = {
  companyName: 'Real Trading LLC',
  connected: false,
  canRequest: false,
  canWithdraw: false,
  canReconnect: true,
  reconnection: null,
  request: DISCONNECTION,
}

const reconnection = (extra: Record<string, unknown> = {}) => ({
  status: 'REQUESTED',
  origin: 'CUSTOMER',
  requestedAt: '2026-10-15T06:00:00Z',
  acceptedAt: null,
  effectiveFrom: null,
  effectiveDue: false,
  connectedAt: null,
  smpAddedAt: null,
  notCompletedReason: null,
  closedAt: null,
  steps: [],
  ...extra,
})

const view = (over: Record<string, unknown>) =>
  ({ ...LEFT, ...over }) as unknown as CompanyDisconnectionDto

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let me: Entitlements
let answer: () => Response
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  me = ADMIN
  answer = () => json(200, LEFT)
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, me)
    if (url === PATH) return answer()
    return json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderNote() {
  return render(
    <MemoryRouter>
      <ReconnectBeforePayingNote />
    </MemoryRouter>,
  )
}

const readCalls = () => fetchMock.mock.calls.filter(([url]) => url === PATH)

async function expectNoNote() {
  await waitFor(() => expect(readCalls().length).toBeGreaterThan(0))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(screen.queryByText(i18n.t('fawtirReconnection.beforePaying.note'))).toBeNull()
}

describe('Billing screens: reconnect before paying (A3.8)', () => {
  it('tells a company that has left to reconnect first, linking to the danger zone', async () => {
    renderNote()
    expect(await screen.findByText(/Reconnect to Fawtir before paying/)).toBeTruthy()
    const link = screen.getByRole('link', { name: i18n.t('fawtirReconnection.beforePaying.link') })
    expect(link.getAttribute('href')).toBe(RECONNECT_ROUTE)
    expect(RECONNECT_ROUTE).toBe('/settings/company#danger-zone')
  })

  it('still says it while the request to come back waits or is accepted for a later date', async () => {
    answer = () => json(200, { ...LEFT, canReconnect: false, reconnection: reconnection() })
    renderNote()
    expect(await screen.findByText(/Reconnect to Fawtir before paying/)).toBeTruthy()
    expect(
      mustReconnectBeforePaying(
        view({
          canReconnect: false,
          reconnection: reconnection({ status: 'ACCEPTED', effectiveFrom: '2099-01-01T00:00:00Z' }),
        }),
      ),
    ).toBe(true)
  })

  it('says nothing once the reconnection is in effect', async () => {
    answer = () =>
      json(200, {
        ...LEFT,
        canReconnect: false,
        reconnection: reconnection({ status: 'CONNECTED', connectedAt: '2026-10-17T06:00:00Z' }),
      })
    renderNote()
    await expectNoNote()
    expect(
      mustReconnectBeforePaying(
        view({
          canReconnect: false,
          reconnection: reconnection({ status: 'ACCEPTED', effectiveDue: true }),
        }),
      ),
    ).toBe(false)
  })

  it('says nothing while reconnecting is switched off, or on a server older than it', async () => {
    answer = () => json(200, { ...LEFT, canReconnect: false })
    renderNote()
    await expectNoNote()
    const older: Record<string, unknown> = { ...LEFT }
    delete older.canReconnect
    delete older.reconnection
    expect(mustReconnectBeforePaying(older as unknown as CompanyDisconnectionDto)).toBe(false)
  })

  it('says nothing to a connected company, or when the read fails', async () => {
    expect(
      mustReconnectBeforePaying(view({ connected: true, canRequest: true, request: null })),
    ).toBe(false)
    answer = () => json(500, { type: 'about:blank' })
    renderNote()
    await expectNoNote()
  })

  it('reads nothing for someone outside the danger zone (LV-1)', async () => {
    me = ACCOUNTANT
    renderNote()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/me/entitlements')).toBe(true),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(readCalls()).toHaveLength(0)
    expect(screen.queryByText(i18n.t('fawtirReconnection.beforePaying.note'))).toBeNull()
  })

  it('has the note in Arabic, with no em dash', () => {
    const english = JSON.stringify(en.fawtirReconnection.beforePaying)
    const arabic = JSON.stringify(ar.fawtirReconnection.beforePaying)
    expect(Object.keys(ar.fawtirReconnection.beforePaying)).toEqual(
      Object.keys(en.fawtirReconnection.beforePaying),
    )
    expect(arabic).toMatch(/قبل الدفع/)
    expect(english + arabic).not.toMatch(/—/)
  })
})
