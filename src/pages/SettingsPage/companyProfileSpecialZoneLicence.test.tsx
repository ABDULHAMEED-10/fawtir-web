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

const LICENCE_PATH = '/api/v1/company-profile/special-zone-licence'
const LABEL = 'Special zone licence number'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let licences: { method: string; body?: unknown }[]
let licenceRoute: boolean
let putAnswer: (() => Response) | null
let deleteAnswer: (() => Response) | null
/** Every write the page sends, on any route, in order. */
let writes: { method: string; url: string }[]

function setUp(subdivisionCode: string | null, stored: string | null = null) {
  licences = []
  licenceRoute = true
  putAnswer = null
  deleteAnswer = null
  writes = []
  const profile = {
    tenantId: 't-1',
    tenantCode: 'T1',
    tenantName: 'Test Co',
    legalName: 'Test Co LLC',
    legalNameAr: null,
    tradingName: null,
    taxNumber: 'OM1100000001',
    commercialRegistrationNumber: '1234567',
    country: 'OM',
    registeredAddress: 'Way 1',
    registeredAddressLine2: 'Area',
    registeredAddressLine3: 'Building',
    registeredCity: 'Muscat',
    registeredPostalCode: '133',
    registeredCountrySubdivision: null,
    registeredPoBox: null,
    registeredCountrySubdivisionCode: subdivisionCode,
    contactPersonName: 'Fahad',
    contactPhone: '+96824000000',
    contactEmail: null,
    profileRevision: 3,
    verificationStatus: 'VERIFIED',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method !== 'GET') writes.push({ method, url })
      if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
      if (url === '/api/v1/reference-data') return json(200, SEEDED_REFERENCE)
      if (url === '/api/v1/company-profile' && method === 'GET') return json(200, profile)
      if (url === LICENCE_PATH) {
        if (!licenceRoute) return json(404, { title: 'Not found', status: 404 })
        if (method === 'GET') {
          return json(200, {
            specialZoneLicenceNumber: stored,
            countrySubdivisionCode: subdivisionCode,
            inSpecialZone: subdivisionCode !== null && subdivisionCode !== 'MO',
          })
        }
        licences.push({ method, body: init?.body ? JSON.parse(init.body as string) : undefined })
        if (method === 'DELETE') return deleteAnswer ? deleteAnswer() : json(204)
        if (putAnswer) return putAnswer()
        return json(200, {
          specialZoneLicenceNumber: JSON.parse(init!.body as string).specialZoneLicenceNumber,
          countrySubdivisionCode: subdivisionCode,
          inSpecialZone: true,
        })
      }
      return json(404, { title: 'Not found', status: 404 })
    }),
  )
}

function renderPage() {
  return render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter>
        <CompanyProfilePage />
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
}

/** The field comes after the page's other reads; the address field means the page has rendered. */
async function pageReady() {
  await screen.findByDisplayValue('Way 1')
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(LICENCE_PATH, expect.anything()))
}

describe('Settings > Company: Special Zone licence', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    forgetEntitlements()
    resetSharedRequests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is shown for a company in a special zone, and saved on its own route', async () => {
    setUp('SHRFZ')
    renderPage()
    const input = await screen.findByRole('textbox', { name: LABEL })
    fireEvent.change(input, { target: { value: ' SZLN-42 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(licences).toHaveLength(1))
    expect(licences[0]).toEqual({ method: 'PUT', body: { specialZoneLicenceNumber: 'SZLN-42' } })
    expect(await screen.findByDisplayValue('SZLN-42')).toBeTruthy()
  })

  it('emptied, clears it', async () => {
    setUp('SEZAD', 'SZ-1')
    renderPage()
    const input = await screen.findByDisplayValue('SZ-1')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(licences).toEqual([{ method: 'DELETE', body: undefined }]))
  })

  it.each([['MO'], [null]])('is not shown for subdivision %s', async (code) => {
    setUp(code)
    renderPage()
    await pageReady()
    expect(screen.queryByRole('textbox', { name: LABEL })).toBeNull()
  })

  it('is not shown by a server without the route', async () => {
    setUp('SHRFZ')
    licenceRoute = false
    renderPage()
    await pageReady()
    expect(screen.queryByRole('textbox', { name: LABEL })).toBeNull()
  })

  it('says so when the server refuses it', async () => {
    setUp('SHRFZ')
    putAnswer = () =>
      json(400, { title: 'Invalid', status: 400, code: 'SPECIAL_ZONE_LICENCE_INVALID' })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: LABEL }), {
      target: { value: 'SZ-2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/The licence number was not accepted/)).toBeTruthy()
  })

  describe('while the server has setting it switched off (Z17)', () => {
    const unavailable = () =>
      json(409, { title: 'Conflict', status: 409, code: 'SPECIAL_ZONE_LICENCE_UNAVAILABLE' })
    const MESSAGE =
      'Setting or clearing the Special Zone licence is not available yet, so the licence was not changed. Your other changes were not saved either. To save them, put the licence number back as it was and save again.'

    /** A later save in the same click: the invoice defaults are written after the licence. */
    function changeBottomNote() {
      fireEvent.change(screen.getByLabelText(/Note at the bottom of every invoice/), {
        target: { value: 'Thank you' },
      })
    }

    async function refusedThenUndone(stored: string) {
      expect(await screen.findByText(MESSAGE)).toBeTruthy()
      expect(screen.queryByText(/Check your connection/)).toBeNull()
      expect(screen.queryByText(/The licence number was not accepted/)).toBeNull()
      expect(screen.queryByText('Saved')).toBeNull()
      // The refusal stops the click: nothing after the licence is sent.
      expect(writes).toEqual([{ method: licences[0].method, url: LICENCE_PATH }])
      fireEvent.click(screen.getByRole('button', { name: 'Undo the changes' }))
      expect(await screen.findByDisplayValue(stored)).toBeTruthy()
      expect(screen.getByText('Nothing changed yet')).toBeTruthy()
    }

    it('says setting it is not available when the PUT is refused', async () => {
      setUp('SHRFZ', 'SZ-1')
      putAnswer = unavailable
      renderPage()
      fireEvent.change(await screen.findByDisplayValue('SZ-1'), { target: { value: 'SZ-2' } })
      changeBottomNote()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(licences).toHaveLength(1))
      expect(licences[0]).toEqual({ method: 'PUT', body: { specialZoneLicenceNumber: 'SZ-2' } })
      expect(screen.getByDisplayValue('SZ-2')).toBeTruthy()
      await refusedThenUndone('SZ-1')
    })

    it('says clearing it is not available when the DELETE is refused', async () => {
      setUp('SEZAD', 'SZ-1')
      deleteAnswer = unavailable
      renderPage()
      fireEvent.change(await screen.findByDisplayValue('SZ-1'), { target: { value: '' } })
      changeBottomNote()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(licences).toEqual([{ method: 'DELETE', body: undefined }]))
      await refusedThenUndone('SZ-1')
    })
  })

  it('shows in Arabic', async () => {
    await i18n.changeLanguage('ar')
    setUp('SHRFZ')
    renderPage()
    expect(await screen.findByRole('textbox', { name: /رقم ترخيص المنطقة الخاصة/ })).toBeTruthy()
  })
})
