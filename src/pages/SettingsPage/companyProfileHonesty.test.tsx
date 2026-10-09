import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const PATH = {
  profile: '/api/v1/company-profile',
  changes: '/api/v1/company-profile/changes',
  branding: '/api/v1/company-profile/branding',
  defaults: '/api/v1/company-profile/invoice-defaults',
  activity: '/api/v1/company-profile/industrial-classification',
}

const PROFILE = {
  tenantId: 't-1',
  tenantCode: 'T1',
  tenantName: 'Real Tenant',
  legalName: 'Real Tenant LLC',
  legalNameAr: null,
  tradingName: null,
  taxNumber: 'OM1199999999',
  commercialRegistrationNumber: '7654321',
  country: 'OM',
  registeredAddress: 'Way 1',
  registeredAddressLine2: 'Area',
  registeredAddressLine3: 'Building 2',
  registeredCity: 'Muscat',
  registeredPostalCode: '100',
  registeredCountrySubdivision: null,
  registeredPoBox: null,
  contactPersonName: null,
  contactPhone: '+96890000000',
  contactEmail: null,
  profileRevision: 3,
  verificationStatus: 'PENDING_VERIFICATION',
}

const CHANGER = '9b0c3a52-1111-4222-8333-444455556666'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

type Answer = () => Response | Promise<Response>
let answers: Partial<Record<keyof typeof PATH, Answer>>
let brandingPut: Answer
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  answers = {}
  brandingPut = () => json(200, { logo: null, brandColour: '#112233', receiptMonochrome: false })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === '/api/v1/reference-data') return json(200, SEEDED_REFERENCE)
    if (url === PATH.branding && method === 'PUT') return brandingPut()
    if (method !== 'GET') throw new Error(`unexpected ${method} ${url}`)
    const key = (Object.keys(PATH) as (keyof typeof PATH)[]).find((k) => PATH[k] === url)
    if (!key) throw new Error(`unexpected ${url}`)
    if (answers[key]) return answers[key]!()
    if (key === 'profile') return json(200, PROFILE)
    if (key === 'changes') return json(200, [])
    if (key === 'branding') return json(200, { logo: null, brandColour: null, receiptMonochrome: false })
    if (key === 'defaults')
      return json(200, { language: null, currency: null, paymentTerms: null, footerNote: null })
    return json(200, { code: null })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
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

const t = (key: string, values?: Record<string, unknown>) => i18n.t(key, values)
const ready = () => screen.findByDisplayValue('Real Tenant LLC')
const lastChanged = () =>
  screen.queryByRole('heading', { name: t('companyProfile.lastChanged') })?.closest('section')

describe('Settings › Company profile: only what the server holds', () => {
  it('shows no form, and no sample company, until the profile arrives', async () => {
    let release: (response: Response) => void = () => {}
    answers.profile = () => new Promise<Response>((resolve) => (release = resolve))
    renderPage()

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === PATH.profile)).toBe(true))
    expect(screen.queryByLabelText(t('companyProfile.registeredName'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('companyProfile.save') })).toBeNull()
    expect(document.body.textContent).not.toContain('Al Bahja')

    release(json(200, PROFILE))
    expect(await ready()).toBeTruthy()
  })

  it('says the reader has no access on a 403, with no form', async () => {
    answers.profile = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission', detail: 'x' })
    renderPage()

    expect(await screen.findByText(t('appAccess.missingPermission'))).toBeTruthy()
    expect(screen.queryByLabelText(t('companyProfile.registeredName'))).toBeNull()
  })

  it('offers a retry on a failure, with no form', async () => {
    answers.profile = () => json(503, { type: 'about:blank', correlationId: 'c-9' })
    renderPage()

    expect(await screen.findByRole('button', { name: t('appAccess.retry') })).toBeTruthy()
    expect(screen.queryByLabelText(t('companyProfile.registeredName'))).toBeNull()
  })

  it('draws the fields the API cannot hold yet as unfillable, and previews the real company with neutral lines', async () => {
    renderPage()
    await ready()

    // Designed fields kept, but none can be filled in or offers sample values until the API has them.
    expect((screen.getByLabelText('Website') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('VAT registered since') as HTMLInputElement).value).toBe(
      t('companyProfile.notAvailableYet'),
    )
    expect(screen.getByText('On a receipt')).toBeTruthy()
    for (const sample of ['1 April 2021', '1 April 2022', '1 January 2021'])
      expect(document.body.textContent).not.toContain(sample)
    expect(screen.queryByText(/See a full sample invoice/)).toBeNull()

    const preview = within(
      screen.getByRole('heading', { name: t('companyProfile.howItComesOut') }).closest('section')!,
    )
    expect(preview.getByText('Real Tenant LLC')).toBeTruthy()
    expect(preview.getByText(t('companyProfile.sampleNumber'))).toBeTruthy()
    expect(preview.getByText(/VAT OM1199999999/)).toBeTruthy()
    expect(preview.getByText(new RegExp(t('companyProfile.sampleLineOne')))).toBeTruthy()

    const text = document.body.textContent ?? ''
    for (const leak of ['Al Bahja', 'OM1100234567', 'Hafidh', 'INV-2047', 'House Blend', 'albahja'])
      expect(text).not.toContain(leak)
  })

  it('lists recorded changes by field and day, never by id, with no history link', async () => {
    answers.changes = () =>
      json(200, [
        { field: 'contactPhone', changedBy: CHANGER, changedAt: '2026-10-01T09:00:00Z' },
        { field: 'brandColour', changedBy: CHANGER, changedAt: '2026-10-05T09:00:00Z' },
        { field: 'somethingNew', changedBy: CHANGER, changedAt: '2026-09-01T09:00:00Z' },
      ])
    renderPage()
    await ready()

    const card = within(await waitFor(() => lastChanged()!))
    const rows = card.getAllByRole('term').map((term) => term.textContent)
    expect(rows).toEqual([
      t('companyProfile.brandColour'),
      t('companyProfile.phone'),
      t('companyProfile.changedOther'),
    ])
    expect(card.getByText('5 Oct 2026')).toBeTruthy()
    expect(document.body.textContent).not.toContain(CHANGER)
    expect(screen.queryByText(/See the full history/)).toBeNull()
  })

  it('says no changes are recorded yet when the log is empty', async () => {
    renderPage()
    await ready()

    expect(await screen.findByText(t('companyProfile.noChangesYet'))).toBeTruthy()
  })

  it('hides the card when the log cannot be read', async () => {
    answers.changes = () => json(500, { type: 'about:blank' })
    renderPage()
    await ready()

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === PATH.changes)).toBe(true),
    )
    expect(lastChanged()).toBeFalsy()
  })

  it('says "Saved" only after the server accepted the save, never after a refusal', async () => {
    brandingPut = () => json(500, { type: 'about:blank' })
    renderPage()
    await ready()

    const hex = screen.getAllByDisplayValue('#2C4EB7')[0]
    fireEvent.change(hex, { target: { value: '#112233' } })
    fireEvent.click(screen.getByRole('button', { name: t('companyProfile.save') }))
    expect(await screen.findAllByText(t('companyProfile.saveFailed'))).not.toHaveLength(0)
    expect(screen.queryByText(t('companyProfile.saved'))).toBeNull()

    brandingPut = () => json(200, { logo: null, brandColour: '#112233', receiptMonochrome: false })
    fireEvent.click(screen.getByRole('button', { name: t('companyProfile.save') }))
    expect(await screen.findByText(t('companyProfile.saved'))).toBeTruthy()
  })

  it('renders in Arabic from the same data', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    await ready()

    expect(await screen.findByText(t('companyProfile.noChangesYet'))).toBeTruthy()
    expect(t('companyProfile.noChangesYet')).not.toBe(i18n.getFixedT('en')('companyProfile.noChangesYet'))
    expect(document.body.textContent).not.toContain('Al Bahja')
  })
})
