import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { SessionContext } from '../../lib/session/session'
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

const VIEWER: Entitlements = {
  ...ADMIN,
  userId: 'u-2',
  username: 'demo_viewer',
  roles: [{ id: 'r-2', code: 'VIEWER', name: 'Viewer', systemRole: true }],
  permissions: ['invoice.read'],
}

const ACTIVITY_PATH = '/api/v1/company-profile/industrial-classification'
const BRANDING_PATH = '/api/v1/company-profile/branding'
const DEFAULTS_PATH = '/api/v1/company-profile/invoice-defaults'
const PROFILE_PATH = '/api/v1/company-profile'
const AMEND_PATH = '/api/v1/company-profile/amendments'
const LEGAL_NAME_EN_PATH = '/api/v1/company-profile/legal-name-en'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

function refusal(code: string, fieldCode: string) {
  return json(400, {
    type: 'https://api.fawtir.om/problems/validation-failed',
    title: 'Validation failed',
    status: 400,
    code,
    errors: [{ field: 'legalNameEn', code: fieldCode, message: 'refused' }],
  })
}

const baseProfile = (legalNameEn: string | null) => ({
  tenantId: 't-1',
  tenantCode: 'T1',
  tenantName: 'Test Co',
  legalName: 'شركة الاختبار ش.م.م',
  legalNameAr: 'شركة الاختبار ش.م.م',
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
  verificationStatus: 'VERIFIED',
  legalNameEn,
})

let profile: ReturnType<typeof baseProfile>
/** How the next legal-name-en PUT answers; null = what the server does with an accepted name. */
let legalNameAnswer: (() => Response) | null = null
let fetchMock: ReturnType<typeof vi.fn>

function setUp(legalNameEn: string | null) {
  profile = baseProfile(legalNameEn)
  legalNameAnswer = null
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
    if (url === LEGAL_NAME_EN_PATH && method === 'PUT') {
      if (legalNameAnswer) return legalNameAnswer()
      const requested = (JSON.parse(init!.body as string).legalNameEn ?? '').trim()
      profile = { ...profile, legalNameEn: requested === '' ? null : requested }
      return json(200, { legalNameEn: profile.legalNameEn })
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

function renderPage(session: Entitlements | null = ADMIN) {
  return render(
    <SessionContext.Provider value={session}>
      <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
        <MemoryRouter>
          <CompanyProfilePage />
        </MemoryRouter>
      </ReferenceDataContext.Provider>
    </SessionContext.Provider>,
  )
}

const field = () => screen.getByRole('textbox', { name: /Legal name in English/ })

const putsToLegalName = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === LEGAL_NAME_EN_PATH && (init as RequestInit)?.method === 'PUT',
  )

const otherWrites = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      (url === PROFILE_PATH || url === AMEND_PATH) &&
      ((init as RequestInit)?.method ?? 'GET') !== 'GET',
  )

/** Waits for the stored company to be on screen, so the field holds the stored value. */
async function loaded() {
  await screen.findByDisplayValue('Muscat, Oman')
}

describe('Settings › Company profile: legal name in English', () => {
  it('shows the field empty when none is set, editable although the company is verified', async () => {
    setUp(null)
    renderPage()
    await loaded()
    expect(field()).toHaveProperty('value', '')
    expect(field()).toHaveProperty('readOnly', false)
    expect(field().getAttribute('dir')).toBe('ltr')
    expect(screen.getByText(/Used only for bank files\./)).toBeTruthy()
    // The legal name beside it stays locked.
    for (const legalName of screen.getAllByDisplayValue('شركة الاختبار ش.م.م')) {
      expect(legalName).toHaveProperty('readOnly', true)
    }
  })

  it('shows the name the company has set', async () => {
    setUp('Test Company LLC')
    renderPage()
    expect(await screen.findByDisplayValue('Test Company LLC')).toBe(field())
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
  })

  it('saves the name on its own route, trimmed, and touches nothing else', async () => {
    setUp(null)
    renderPage()
    await loaded()
    fireEvent.change(field(), { target: { value: '  Test Company (Oman) LLC  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putsToLegalName()).toHaveLength(1))
    expect(JSON.parse(putsToLegalName()[0][1].body as string)).toEqual({
      legalNameEn: 'Test Company (Oman) LLC',
    })
    expect(otherWrites()).toHaveLength(0)
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(field()).toHaveProperty('value', 'Test Company (Oman) LLC')
  })

  it('clears the name by saving it empty', async () => {
    setUp('Test Company LLC')
    renderPage()
    await screen.findByDisplayValue('Test Company LLC')
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putsToLegalName()).toHaveLength(1))
    expect(JSON.parse(putsToLegalName()[0][1].body as string)).toEqual({ legalNameEn: null })
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(field()).toHaveProperty('value', '')
  })

  it('says "&" is not allowed while typing, and sends nothing', async () => {
    setUp(null)
    renderPage()
    await loaded()
    fireEvent.change(field(), { target: { value: 'Test & Sons LLC' } })
    expect(
      screen.getByText(
        `Use English letters, digits and . , - / ( ) ' + : ? only. "&" is not allowed; write "and".`,
      ),
    ).toBeTruthy()
    expect(field().getAttribute('aria-invalid')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(putsToLegalName()).toHaveLength(0)
  })

  it('says the 70-character limit while typing, and sends nothing', async () => {
    setUp(null)
    renderPage()
    await loaded()
    fireEvent.change(field(), { target: { value: 'A'.repeat(71) } })
    expect(screen.getByText('Use at most 70 characters.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(putsToLegalName()).toHaveLength(0)

    fireEvent.change(field(), { target: { value: 'A'.repeat(70) } })
    expect(screen.queryByText('Use at most 70 characters.')).toBeNull()
  })

  it('shows the server refusing the characters', async () => {
    setUp(null)
    renderPage()
    await loaded()
    legalNameAnswer = () => refusal('COMPANY_LEGAL_NAME_EN_NOT_LATIN', 'INVALID_CHARACTERS')
    fireEvent.change(field(), { target: { value: 'Test Company LLC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/"&" is not allowed; write "and"\./)).toBeTruthy()
    expect(screen.queryByText('Saved')).toBeNull()
    // Editing the name again takes the refusal away until the next save.
    fireEvent.change(field(), { target: { value: 'Test Company' } })
    expect(screen.queryByText(/"&" is not allowed/)).toBeNull()
  })

  it('shows the server refusing the length', async () => {
    setUp(null)
    renderPage()
    await loaded()
    legalNameAnswer = () => refusal('COMPANY_LEGAL_NAME_EN_TOO_LONG', 'TOO_LONG')
    fireEvent.change(field(), { target: { value: 'Test Company LLC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Use at most 70 characters.')).toBeTruthy()
  })

  it('reads a refusal by its top-level code when it names no field', async () => {
    setUp(null)
    renderPage()
    await loaded()
    legalNameAnswer = () =>
      json(400, { title: 'Validation failed', status: 400, code: 'COMPANY_LEGAL_NAME_EN_TOO_LONG' })
    fireEvent.change(field(), { target: { value: 'Test Company LLC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Use at most 70 characters.')).toBeTruthy()
  })

  it('says it did not save when the server fails for another reason', async () => {
    setUp(null)
    renderPage()
    await loaded()
    legalNameAnswer = () => json(500, { title: 'Server error', status: 500 })
    fireEvent.change(field(), { target: { value: 'Test Company LLC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('That did not save. Check your connection and try again.'),
    ).toBeTruthy()
  })

  it('is not shown to someone without admin.settings.manage', async () => {
    setUp('Test Company LLC')
    renderPage(VIEWER)
    await loaded()
    expect(screen.queryByRole('textbox', { name: /Legal name in English/ })).toBeNull()
    expect(screen.queryByText('Legal name in English')).toBeNull()
    expect(screen.queryByDisplayValue('Test Company LLC')).toBeNull()
  })

  it('shows the field and its refusal in Arabic', async () => {
    await i18n.changeLanguage('ar')
    setUp(null)
    renderPage()
    await loaded()
    const input = screen.getByRole('textbox', { name: /الاسم القانوني بالإنجليزية/ })
    expect(screen.getByText(/يُستخدم في الملفات البنكية فقط\./)).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Test & Sons' } })
    expect(screen.getByText(/الرمز "&" غير مسموح؛ اكتب "and"\./)).toBeTruthy()
    fireEvent.change(input, { target: { value: 'A'.repeat(71) } })
    expect(screen.getByText('استخدم 70 حرفًا كحدّ أقصى.')).toBeTruthy()
  })

  it('names the change in the activity log in both languages', async () => {
    expect(i18n.t('activityLog.event.CompanyLegalNameEnChanged')).toBe(
      'Legal name in English changed',
    )
    await i18n.changeLanguage('ar')
    expect(i18n.t('activityLog.event.CompanyLegalNameEnChanged')).toBe(
      'تغيّر الاسم القانوني بالإنجليزية',
    )
  })
})
