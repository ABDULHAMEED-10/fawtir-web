import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { OrderFormsPage } from './OrderFormsPage'

/**
 * The page is mounted the way the app mounts it: bare, with the shell it draws itself asking who
 * is signed in. No session is handed in from outside, so what the page reads is what a reader gets.
 */

const AGREEMENTS = '/api/v1/self-billing-agreements'
const NONE_ON_RECORD =
  'Self-billing needs a signed, active self-billing agreement with this supplier. None is on record.'
const CANNOT_CHECK =
  'Self-billing needs a signed, active agreement with this supplier, and you cannot view self-billing agreements to check it.'

const person = (code: string, permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'reader',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code, name: code, systemRole: true }],
  permissions,
  scopes: [],
  featureFlags: {},
})
/** The Viewer role as the server seeds it (`DefaultRoleCatalogue`). */
const VIEWER = person('VIEWER', ['invoice.read', 'reports.read'])
const ADMIN = person('ADMIN', ['invoice.read', 'reports.read', 'selfbilling.agreement.manage'])

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements

const agreementReads = () => fetchMock.mock.calls.filter(([url]) => String(url) === AGREEMENTS)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    // The server's own answer: the read needs `selfbilling.agreement.manage`.
    if (url === AGREEMENTS)
      return who.permissions.includes('selfbilling.agreement.manage')
        ? json(200, [])
        : json(403, { type: 'https://api.fawtir.om/problems/forbidden', status: 403 })
    return json(404, { type: 'https://api.fawtir.om/problems/resource-not-found' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trade-documents/order-forms']}>
      <Routes>
        <Route path="/trade-documents/order-forms" element={<OrderFormsPage />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Order forms, for who is signed in', () => {
  it('does not ask a viewer\'s session for the self-billing agreements it may not read', async () => {
    who = VIEWER
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Order forms' })).toBeTruthy()
    const selfBill = (await screen.findAllByRole('button', { name: 'Self-bill supplier' }))[0]
    expect(selfBill.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(selfBill)
    // The reason given is the true one: the agreements were never read, not "none on record".
    expect(await screen.findByText(CANNOT_CHECK)).toBeTruthy()
    expect(screen.queryByText(NONE_ON_RECORD)).toBeNull()
    expect(agreementReads()).toHaveLength(0)
  })

  it('reads the agreements for someone who may, and says none is on record', async () => {
    who = ADMIN
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Order forms' })).toBeTruthy()
    const selfBill = (await screen.findAllByRole('button', { name: 'Self-bill supplier' }))[0]
    expect(selfBill.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(selfBill)
    expect(await screen.findByText(NONE_ON_RECORD)).toBeTruthy()
    expect(screen.queryByText(CANNOT_CHECK)).toBeNull()
    expect(agreementReads()).toHaveLength(1)
  })
})
