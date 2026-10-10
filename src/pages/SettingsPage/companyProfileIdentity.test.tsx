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
const AMEND_PATH = '/api/v1/company-profile/amendments'

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
  registeredAddressLine2: null as string | null,
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
/** How the next amendment POST answers; null = accept it. */
let amendAnswer: (() => Response) | null = null
let fetchMock: ReturnType<typeof vi.fn>

function setUp(verificationStatus: string) {
  profile = baseProfile(verificationStatus)
  amendAnswer = null
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
    if (url === AMEND_PATH && method === 'POST') {
      if (amendAnswer) return amendAnswer()
      const body = JSON.parse(init!.body as string)
      profile = { ...profile, ...body, profileRevision: profile.profileRevision + 1 }
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
    expect(screen.getAllByText(/legal and tax identity is verified and locked/).length).toBeGreaterThan(0)

    // The field cannot actually change (read-only), so Save stays disabled for it.
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    expect(putsToProfile()).toHaveLength(0)
  })

  it('shows the real VAT number once loaded, still locked', async () => {
    setUp('PENDING_VERIFICATION')
    renderPage()
    const vat = await screen.findByDisplayValue('OM1100000001')
    expect(vat).toHaveProperty('readOnly', true)
    expect(screen.queryByText(/Peppol/)).toBeNull()
  })
})

const amendments = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === AMEND_PATH && (init as RequestInit)?.method === 'POST')

/** Fills every address part and the phone, as a verified company's invoices need them. */
async function completeTheAddress() {
  const line3 = await screen.findByRole('textbox', { name: /Building or address line 3/ })
  fireEvent.change(screen.getByRole('textbox', { name: /Additional street or area/ }), {
    target: { value: 'Al Khuwair' },
  })
  fireEvent.change(line3, { target: { value: 'Building 7' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Postal code/ }), { target: { value: '133' } })
  fireEvent.change(screen.getByRole('textbox', { name: /^Phone/ }), {
    target: { value: '+96824000000' },
  })
}

describe('Settings › Company profile: verified-company amendment', () => {
  it('lets a VERIFIED company amend its address and contact, and sends only those fields', async () => {
    setUp('VERIFIED')
    renderPage()
    expect(await screen.findByDisplayValue('Test Co LLC')).toHaveProperty('readOnly', true)
    expect(screen.getByText(/Changes apply to invoices you issue from now on/)).toBeTruthy()

    await completeTheAddress()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(amendments()).toHaveLength(1))
    const body = JSON.parse(amendments()[0][1].body as string)
    expect(body).toEqual({
      expectedRevision: 3,
      registeredAddress: 'Muscat, Oman',
      registeredAddressLine2: 'Al Khuwair',
      registeredAddressLine3: 'Building 7',
      registeredCity: 'Muscat',
      registeredPostalCode: '133',
      registeredPoBox: null,
      registeredCountrySubdivision: null,
      registeredCountrySubdivisionCode: null,
      contactPersonName: 'Fahad',
      contactPhone: '+96824000000',
      contactEmail: null,
    })
    expect(putsToProfile()).toHaveLength(0)
  })

  it('on a stale revision, reloads the company and says someone else saved first', async () => {
    setUp('VERIFIED')
    renderPage()
    await completeTheAddress()
    amendAnswer = () => {
      // Another administrator saved first: the server now holds their address at revision 4.
      profile = { ...profile, registeredAddressLine2: 'Ruwi', profileRevision: 4 }
      return json(409, { title: 'Company profile revision is stale', status: 409 })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Someone else updated the company details/)).toBeTruthy()
    expect(screen.getByDisplayValue('Ruwi')).toBeTruthy()
    expect(screen.queryByDisplayValue('Al Khuwair')).toBeNull()
  })

  it('names the fields the server refused', async () => {
    setUp('VERIFIED')
    renderPage()
    await completeTheAddress()
    amendAnswer = () =>
      json(400, {
        title: 'Validation failed',
        status: 400,
        errors: [{ field: 'registeredAddressLine3', code: 'REQUIRED', message: 'required' }],
      })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Complete these before saving: Building or address line 3/)).toBeTruthy()
  })

  it('shows the amendment in Arabic, right to left', async () => {
    await i18n.changeLanguage('ar')
    setUp('VERIFIED')
    renderPage()
    expect(await screen.findByText(/تسري التغييرات على الفواتير التي تصدرها من الآن/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /المبنى أو سطر العنوان 3/ })).toHaveProperty('readOnly', false)
  })
})
