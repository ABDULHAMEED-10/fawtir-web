import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { CompanyProfilePage } from './CompanyProfilePage'
import { resetSharedRequests } from '../../api'
import { SIGNUP_BUSINESS_TYPES } from '../../test/businessTypes'

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
const PROFILE_PATH = '/api/v1/company-profile'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const TYPE_PATH = '/api/v1/company-profile/business-type'

type Stored = { code: string; nameEn: string; retired: boolean; isic: string | null } | null

let storedSub: Stored
let putAnswer: ((code: string | null) => Response) | null

const typeBody = (sub: Stored) => ({
  businessType: sub
    ? {
        code: 'FOOD_AND_BEVERAGE',
        nameEn: 'Food & Beverage',
        nameAr: 'Food & Beverage',
        retired: false,
      }
    : null,
  subBusinessType: sub
    ? {
        code: sub.code,
        nameEn: sub.nameEn,
        nameAr: sub.nameEn,
        retired: sub.retired,
        suggestedIsic: sub.isic
          ? { code: sub.isic, nameEn: 'Restaurants', nameAr: 'Restaurants' }
          : null,
      }
    : null,
})

let fetchMock: ReturnType<typeof vi.fn>
let answer: (url: string, init?: RequestInit) => Promise<Response>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  storedSub = { code: 'COFFEE_SHOP', nameEn: 'Coffee shop', retired: false, isic: null }
  putAnswer = null
  answer = async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === '/api/v1/reference-data') return json(200, SEEDED_REFERENCE)
    if (url === BRANDING_PATH && (init?.method ?? 'GET') === 'GET') {
      return json(200, { logo: null, brandColour: null, receiptMonochrome: false })
    }
    if (url === INVOICE_DEFAULTS_PATH && (init?.method ?? 'GET') === 'GET') {
      return json(200, { language: null, currency: null, paymentTerms: null, footerNote: null })
    }
    if (url === PROFILE_PATH && (init?.method ?? 'GET') === 'GET') {
      return json(200, {
        tenantId: 't-1',
        tenantCode: 'T1',
        tenantName: 'Test Co',
        legalName: 'Test Co LLC',
        legalNameAr: null,
        tradingName: null,
        taxNumber: 'OM1100000001',
        commercialRegistrationNumber: '1234567',
        country: 'OM',
        registeredAddress: 'Muscat',
        registeredAddressLine2: null,
        registeredAddressLine3: null,
        registeredCity: 'Muscat',
        registeredPostalCode: null,
        registeredCountrySubdivision: null,
        registeredPoBox: null,
        contactPersonName: null,
        contactPhone: null,
        contactEmail: null,
        profileRevision: 1,
        verificationStatus: 'PENDING_VERIFICATION',
      })
    }
    if (url === PATH) return json(200, { code: '563001' })
    if (url === '/api/v1/auth/signup/business-types') return json(200, SIGNUP_BUSINESS_TYPES)
    if (url === TYPE_PATH && (init?.method ?? 'GET') === 'GET')
      return json(200, typeBody(storedSub))
    if (url === TYPE_PATH && init?.method === 'PUT') {
      const code = JSON.parse(init.body as string).subBusinessTypeCode as string | null
      if (putAnswer) return putAnswer(code)
      storedSub = code
        ? { code, nameEn: code === 'RESTAURANT' ? 'Restaurant' : code, retired: false, isic: null }
        : null
      return json(200, typeBody(storedSub))
    }
    return json(404, { title: 'Not found', status: 404 })
  }
  fetchMock = vi.fn(answer)
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

const typePuts = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === TYPE_PATH && (init as RequestInit)?.method === 'PUT',
  )
const picker = () => screen.getByRole('button', { name: 'Business type' })

describe('Settings › Company: business type (Catalogue guide 1A)', () => {
  it('shows the stored sub type and changes it with the footer Save', async () => {
    renderPage()
    await waitFor(() => expect(picker().textContent).toContain('Coffee shop'))

    fireEvent.click(picker())
    fireEvent.click(await screen.findByRole('option', { name: /^Restaurant/ }))
    // The activity the new sub type suggests is a hint only: the stored activity is unchanged.
    expect(
      await screen.findByText((text) => text.includes('Suggested for') && text.includes('561001')),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(typePuts()).toHaveLength(1))
    expect(JSON.parse((typePuts()[0][1] as RequestInit).body as string)).toEqual({
      subBusinessTypeCode: 'RESTAURANT',
    })
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === PATH && (init as RequestInit)?.method === 'PUT',
      ),
    ).toBe(false)
  })

  it('clears it for a company that does not use POS', async () => {
    renderPage()
    await waitFor(() => expect(picker().textContent).toContain('Coffee shop'))
    fireEvent.click(picker())
    fireEvent.click(await screen.findByRole('option', { name: /I don't use Fawtir POS/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(typePuts()).toHaveLength(1))
    expect(JSON.parse((typePuts()[0][1] as RequestInit).body as string)).toEqual({
      subBusinessTypeCode: null,
    })
  })

  it('keeps a retired sub type named, and says so when the server refuses a closed one', async () => {
    storedSub = { code: 'DETAILING', nameEn: 'Detailing', retired: true, isic: null }
    putAnswer = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/business-type-not-available',
        status: 400,
      })
    renderPage()
    await waitFor(() => expect(picker().textContent).toContain('Detailing (no longer offered)'))

    fireEvent.click(picker())
    fireEvent.click(await screen.findByRole('option', { name: /^Bakery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(i18n.t('companyProfile.subBusinessTypeNotAvailable')),
    ).toBeTruthy()
  })

  it('is not drawn when the business type cannot be read', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === TYPE_PATH) return json(403, { title: 'Forbidden', status: 403 })
      return answer(url, init)
    })
    renderPage()
    await screen.findByRole('button', { name: 'Business activity (ISIC)' })
    expect(screen.queryByRole('button', { name: 'Business type' })).toBeNull()
  })
})
