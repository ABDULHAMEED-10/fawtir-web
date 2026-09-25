import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { useCan, useSession } from '../../lib/session/session'
import { AppShell } from './AppShell'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'

const ACCOUNTANT: Entitlements = {
  userId: 'u-1',
  username: 'layla.accounts',
  tenantId: 't-1',
  tenantName: 'Nizwa Dates Trading',
  roles: [{ id: 'r-1', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: ['invoice.read', 'reports.read'],
  scopes: [],
  featureFlags: {},
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

function Child() {
  const session = useSession()
  const mayManage = useCan('supplier.manage')
  return (
    <p>
      screen for {session?.username} {mayManage ? 'can manage' : 'cannot manage'}
    </p>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/suppliers"
          element={
            <AppShell>
              <Child />
            </AppShell>
          }
        />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppShell session guard', () => {
  it('sends a reader without a session to sign in', async () => {
    fetchMock.mockResolvedValue(json(401, { type: 'https://api.fawtir.om/problems/unauthenticated' }))
    renderAt('/suppliers')
    expect(await screen.findByText('sign-in page')).toBeTruthy()
  })

  it('says it is checking, then shows the screen with the session', async () => {
    fetchMock.mockResolvedValue(json(200, ACCOUNTANT))
    renderAt('/suppliers')
    expect(screen.getByText('Checking your access…').closest('[role="status"]')).toBeTruthy()
    expect(await screen.findByText('screen for layla.accounts cannot manage')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(ENTITLEMENTS_URL, expect.anything())
  })

  it('shows the signed-in user and hides what they cannot open', async () => {
    fetchMock.mockResolvedValue(json(200, ACCOUNTANT))
    renderAt('/suppliers')
    await screen.findByText(/screen for/)
    expect(screen.getByText('layla.accounts')).toBeTruthy()
    expect(screen.getByText('Accountant')).toBeTruthy()
    // No supplier.read, customer.read or product.read: those entries are not offered.
    expect(screen.queryByRole('link', { name: /^Suppliers$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Customers$/ })).toBeNull()
    // invoice.read keeps Income.
    expect(screen.getByRole('button', { name: /Income/ })).toBeTruthy()
  })

  it('names the workspace the session belongs to, not a fixture', async () => {
    // The card used to read the first entry of a demo branch list, so every tenant saw the
    // same company. The name now comes from /me/entitlements.
    fetchMock.mockResolvedValue(json(200, ACCOUNTANT))
    renderAt('/suppliers')
    await screen.findByText(/screen for/)
    expect(screen.getByText('Nizwa Dates Trading')).toBeTruthy()
    expect(screen.queryByText('Al Bahja Coffee')).toBeNull()
  })

  it('keeps the card readable when the server sends no workspace name', async () => {
    // Null is what the projection returns when row-level security hides the tenant row. A
    // label is not worth an empty card, so the previous name stands.
    fetchMock.mockResolvedValue(json(200, { ...ACCOUNTANT, tenantName: null }))
    renderAt('/suppliers')
    await screen.findByText(/screen for/)
    expect(screen.getByText('Al Bahja Coffee')).toBeTruthy()
  })

  it('offers a retry when the session check itself fails', async () => {
    fetchMock.mockResolvedValue(json(503, { type: 'https://api.fawtir.om/problems/internal-error', correlationId: 'c-42' }))
    renderAt('/suppliers')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: c-42')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
