import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
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

const ACTIVITY_PATH = '/api/v1/company-profile/industrial-classification'
const BRANDING_PATH = '/api/v1/company-profile/branding'
const DEFAULTS_PATH = '/api/v1/company-profile/invoice-defaults'
const PROFILE_PATH = '/api/v1/company-profile'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const baseProfile = (verificationStatus: string) => ({
  tenantId: 't-1',
  tenantCode: 'T1',
  tenantName: 'Test Co',
  legalName: 'Test Co LLC',
  legalNameAr: null,
  tradingName: null,
  taxNumber: 'OM1100000001',
  commercialRegistrationNumber: '1234567',
  country: 'OM',
  registeredAddress: 'Muscat, Oman',
  registeredAddressLine2: null,
  registeredAddressLine3: null,
  registeredCity: 'Muscat',
  registeredPostalCode: null,
  registeredCountrySubdivision: null,
  registeredPoBox: null,
  contactPersonName: 'Fahad',
  contactPhone: null,
  contactEmail: null,
  profileRevision: 3,
  verificationStatus,
})

let profile: ReturnType<typeof baseProfile>
let fetchMock: ReturnType<typeof vi.fn>

function setUp(verificationStatus: string) {
  profile = baseProfile(verificationStatus)
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === '/api/v1/reference-data') return json(200, SEEDED_REFERENCE)
    if (url === ACTIVITY_PATH && method === 'GET') return json(200, { code: '561001' })
    if (url === BRANDING_PATH && method === 'GET') {
      return json(200, { logo: null, brandColour: '#2C4EB7', receiptMonochrome: false })
    }
    if (url === DEFAULTS_PATH && method === 'GET') {
      return json(200, { language: 'AR_EN', currency: 'OMR', paymentTerms: 'NET30', footerNote: '' })
    }
    if (url === PROFILE_PATH && method === 'GET') return json(200, profile)
    if (url === PROFILE_PATH && method === 'PUT') {
      const body = JSON.parse(init!.body as string)
      if (body.expectedRevision !== profile.profileRevision) {
        return json(409, { title: 'stale', status: 409 })
      }
      profile = { ...profile, ...body, verificationStatus: profile.verificationStatus, profileRevision: profile.profileRevision + 1 }
      return json(200, profile)
    }
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
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

const putsToProfile = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === PROFILE_PATH && (init as RequestInit)?.method === 'PUT')

describe('Settings › Company profile: identity fields', () => {
  it('loads the real identity into the form while PENDING_VERIFICATION, and it is editable', async () => {
    setUp('PENDING_VERIFICATION')
    renderPage()
    const nameInput = await screen.findByDisplayValue('Test Co LLC')
    expect(nameInput).toHaveProperty('readOnly', false)
    expect(screen.getByDisplayValue('Muscat, Oman')).toBeTruthy()
  })

  it('saves a changed registered name, round-tripping unchanged fields and the tax number', async () => {
    setUp('PENDING_VERIFICATION')
    renderPage()
    const nameInput = await screen.findByDisplayValue('Test Co LLC')
    fireEvent.change(nameInput, { target: { value: 'Test Co LLC (renamed)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putsToProfile()).toHaveLength(1))
    const body = JSON.parse(putsToProfile()[0][1].body as string)
    expect(body).toMatchObject({
      expectedRevision: 3,
      legalName: 'Test Co LLC (renamed)',
      taxNumber: 'OM1100000001',
      commercialRegistrationNumber: '1234567',
      country: 'OM',
      registeredAddress: 'Muscat, Oman',
      contactPersonName: 'Fahad',
    })
  })

  it('shows the identity fields read-only once VERIFIED, and never sends a PUT for them', async () => {
    setUp('VERIFIED')
    renderPage()
    const nameInput = await screen.findByDisplayValue('Test Co LLC')
    expect(nameInput).toHaveProperty('readOnly', true)
    expect(screen.getAllByText(/Verified companies can't edit these details here yet/).length).toBeGreaterThan(0)

    // The field cannot actually change (read-only), so Save stays disabled for it.
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    expect(putsToProfile()).toHaveLength(0)
  })

  it('shows the real VAT number once loaded, still locked', async () => {
    setUp('PENDING_VERIFICATION')
    renderPage()
    const vat = await screen.findByDisplayValue('OM1100000001')
    expect(vat).toHaveProperty('readOnly', true)
  })
})
