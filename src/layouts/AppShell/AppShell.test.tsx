import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { requireSession, useCan, useSession } from '../../lib/session/session'
import { signOut } from '../../lib/identity/logout'
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
  // AppShell now renders AccountSwitcher's own branches-overview read alongside entitlements;
  // a read left mid-flight by one test would otherwise answer the next from a torn-down mock
  // (`sharedRequest`'s own documented test-pollution gotcha).
  resetSharedRequests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppShell session guard', () => {
  it('sends a reader without a session to sign in', async () => {
    fetchMock.mockImplementation(async () =>
      json(401, { type: 'https://api.fawtir.om/problems/unauthenticated' }),
    )
    renderAt('/suppliers')
    expect(await screen.findByText('sign-in page')).toBeTruthy()
  })

  it('says it is checking, then shows the screen with the session', async () => {
    fetchMock.mockImplementation(async () => json(200, ACCOUNTANT))
    renderAt('/suppliers')
    expect(screen.getByText('Checking your access…').closest('[role="status"]')).toBeTruthy()
    expect(await screen.findByText('screen for layla.accounts cannot manage')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(ENTITLEMENTS_URL, expect.anything())
  })

  it('shows the signed-in user and hides what they cannot open', async () => {
    fetchMock.mockImplementation(async () => json(200, ACCOUNTANT))
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
    fetchMock.mockImplementation(async () => json(200, ACCOUNTANT))
    renderAt('/suppliers')
    await screen.findByText(/screen for/)
    expect(screen.getByText('Nizwa Dates Trading')).toBeTruthy()
    expect(screen.queryByText('Al Bahja Coffee')).toBeNull()
  })

  it('keeps the card readable when the server sends no workspace name', async () => {
    // Null is what the projection returns when row-level security hides the tenant row. A
    // generic label is honest here; a fabricated company name (this card's old fallback,
    // "Al Bahja Coffee") is not.
    fetchMock.mockImplementation(async () => json(200, { ...ACCOUNTANT, tenantName: null }))
    renderAt('/suppliers')
    await screen.findByText(/screen for/)
    expect(screen.getByText(i18n.t('shell.account.unnamed'))).toBeTruthy()
  })

  it('never names a fixture user or company while the session is loading', async () => {
    // TEST, 7 October 2026: an unguarded shell showed "Hafidh Saif / Owner / Your company" to
    // whoever was signed in. Loading must read as loading, not as somebody.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    renderAt('/suppliers')
    expect(screen.getAllByText('Loading…').length).toBeGreaterThanOrEqual(2)
    expect(document.body.textContent).not.toContain('Hafidh')
    expect(document.body.textContent).not.toContain(i18n.t('shell.account.unnamed'))
    expect(screen.queryByText(i18n.t('sessionRoles.member'))).toBeNull()
  })

  it('shows the next user, not the last one, after sign-out and a new sign-in', async () => {
    const OTHER: Entitlements = {
      ...ACCOUNTANT,
      userId: 'u-2',
      username: 'saji.khan',
      tenantId: 't-2',
      tenantName: 'Sohar Marine Supplies',
      roles: [{ id: 'r-2', code: 'ADMIN', name: 'Administrator', systemRole: true }],
    }
    let current: Entitlements = ACCOUNTANT
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/v1/auth/logout' ? json(204) : json(200, current),
    )
    const first = renderAt('/suppliers')
    expect(await screen.findByText('Nizwa Dates Trading')).toBeTruthy()
    first.unmount()

    await signOut()
    current = OTHER
    resetSharedRequests()
    renderAt('/suppliers')
    expect(await screen.findByText('Sohar Marine Supplies')).toBeTruthy()
    expect(screen.getByText('saji.khan')).toBeTruthy()
    expect(screen.getByText('Administrator')).toBeTruthy()
    expect(screen.queryByText('layla.accounts')).toBeNull()
    expect(screen.queryByText('Nizwa Dates Trading')).toBeNull()
  })

  it('names the user, role and company in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    fetchMock.mockImplementation(async () => json(200, ACCOUNTANT))
    renderAt('/suppliers')
    await screen.findByText(/screen for/)
    expect(screen.getByText('layla.accounts')).toBeTruthy()
    expect(screen.getByText('محاسب')).toBeTruthy()
    expect(screen.getByText('Nizwa Dates Trading')).toBeTruthy()
  })

  it('says loading in Arabic while the session is loading', async () => {
    await i18n.changeLanguage('ar')
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    renderAt('/suppliers')
    await waitFor(() => expect(screen.getAllByText('جارٍ التحميل…').length).toBeGreaterThanOrEqual(2))
  })

  it('offers a retry when the session check itself fails', async () => {
    fetchMock.mockImplementation(async () =>
      json(503, { type: 'https://api.fawtir.om/problems/internal-error', correlationId: 'c-42' }),
    )
    renderAt('/suppliers')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: c-42')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('requireSession', () => {
  it('always requires a session in a production build, whatever the variable says', () => {
    // The deployed build ran unguarded because the variable was never set; it must not matter.
    expect(requireSession(false, undefined)).toBe(true)
    expect(requireSession(false, 'false')).toBe(true)
    expect(requireSession(false, 'true')).toBe(true)
    expect(requireSession(false, '')).toBe(true)
  })

  it('lets only a development build switch the guard off, and only explicitly', () => {
    expect(requireSession(true, undefined)).toBe(true)
    expect(requireSession(true, 'true')).toBe(true)
    expect(requireSession(true, 'FALSE')).toBe(true)
    expect(requireSession(true, 'false')).toBe(false)
  })
})

describe('AppShell chrome carries no sample data', () => {
  it('draws the user’s initials instead of a shared photo, and no invented counts', async () => {
    fetchMock.mockImplementation(async () => json(200, ACCOUNTANT))
    const { container } = renderAt('/suppliers')
    await screen.findByText(/screen for/)

    expect(container.querySelector('img[src*="avatar"]')).toBeNull()
    expect(screen.getByRole('button', { name: /layla\.accounts/ }).textContent).toContain('L')
    // Income carried a fixed "3" and TDD & OTA a fixed "4" from the sample book.
    expect(screen.getByRole('button', { name: /Income/ }).textContent).not.toMatch(/\d/)
    for (const link of screen.queryAllByRole('link', { name: /TDD/ }))
      expect(link.textContent).not.toMatch(/\d/)
  })
})
