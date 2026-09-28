import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { CompanyProfilePage } from './CompanyProfilePage'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}

const PATH = '/api/v1/company-profile/industrial-classification'
const BRANDING_PATH = '/api/v1/company-profile/branding'
const INVOICE_DEFAULTS_PATH = '/api/v1/company-profile/invoice-defaults'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let stored: string | null
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  stored = null
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === '/api/v1/reference-data') return json(200, SEEDED_REFERENCE)
    if (url === BRANDING_PATH && (init?.method ?? 'GET') === 'GET') {
      return json(200, { logo: null, brandColour: null, receiptMonochrome: false })
    }
    if (url === INVOICE_DEFAULTS_PATH && (init?.method ?? 'GET') === 'GET') {
      return json(200, { language: null, currency: null, paymentTerms: null, footerNote: null })
    }
    if (url === PATH && (init?.method ?? 'GET') === 'GET') return json(200, { code: stored })
    if (url === PATH && init?.method === 'PUT') {
      const code = JSON.parse(init.body as string).code as string
      if (code === '999999') return json(400, { title: 'refused', status: 400 })
      stored = code
      return json(200, { code })
    }
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter>
        <CompanyProfilePage />
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
}

const put = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT')

describe('Settings › Company: business activity', () => {
  it('warns while none is set, and stores the one that is chosen', async () => {
    renderPage()
    expect(
      await screen.findByText(/Not set yet\. Business and government invoices cannot be created/),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Business activity (ISIC)' }))
    fireEvent.change(await screen.findByPlaceholderText('Search by activity name'), {
      target: { value: 'Restaurants' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Restaurants/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(put()).toHaveLength(1))
    expect(JSON.parse((put()[0][1] as RequestInit).body as string)).toEqual({ code: '561001' })
    await waitFor(() =>
      expect(
        screen.queryByText(/Not set yet\. Business and government invoices cannot be created/),
      ).toBeNull(),
    )
  })

  it('shows the stored activity and sends nothing when it is unchanged', async () => {
    stored = '561001'
    renderPage()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Business activity (ISIC)' }).textContent,
      ).toContain('Restaurants'),
    )
    expect(
      screen.queryByText(/Not set yet\. Business and government invoices cannot be created/),
    ).toBeNull()
    expect(put()).toHaveLength(0)
  })
})
