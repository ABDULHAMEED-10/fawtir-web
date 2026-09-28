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

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let branding: { logo: null; brandColour: string | null; receiptMonochrome: boolean }
let defaults: {
  language: string | null
  currency: string | null
  paymentTerms: string | null
  footerNote: string | null
}
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  branding = { logo: null, brandColour: '#2C4EB7', receiptMonochrome: false }
  defaults = { language: 'AR_EN', currency: 'OMR', paymentTerms: 'NET30', footerNote: 'Thanks!' }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url === '/api/v1/reference-data') return json(200, SEEDED_REFERENCE)
    if (url === ACTIVITY_PATH && method === 'GET') return json(200, { code: '561001' })
    if (url === BRANDING_PATH && method === 'GET') return json(200, branding)
    if (url === BRANDING_PATH && method === 'PUT') {
      const body = JSON.parse(init!.body as string)
      if (body.brandColour === '#BADHEX') return json(400, { title: 'refused', status: 400 })
      branding = { ...branding, brandColour: body.brandColour, receiptMonochrome: body.receiptMonochrome }
      return json(200, branding)
    }
    if (url === DEFAULTS_PATH && method === 'GET') return json(200, defaults)
    if (url === DEFAULTS_PATH && method === 'PUT') {
      const body = JSON.parse(init!.body as string)
      if (body.footerNote?.length > 2000) return json(400, { title: 'refused', status: 400 })
      defaults = body
      return json(200, defaults)
    }
    throw new Error(`unexpected ${method} ${url}`)
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

const putsTo = (path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => url === path && (init as RequestInit)?.method === 'PUT')

describe('Settings › Company profile: branding and invoice defaults', () => {
  it('loads the stored brand colour and invoice defaults into the form, unchanged sends nothing', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByDisplayValue('#2C4EB7')).toBeTruthy())
    await waitFor(() => expect(screen.getByDisplayValue('Thanks!')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(putsTo(BRANDING_PATH)).toHaveLength(0)
    expect(putsTo(DEFAULTS_PATH)).toHaveLength(0)
  })

  it('saves a changed brand colour, round-tripping the stored receiptMonochrome unchanged', async () => {
    branding.receiptMonochrome = true
    renderPage()
    const colourInput = await screen.findByDisplayValue('#2C4EB7')
    fireEvent.change(colourInput, { target: { value: '#111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putsTo(BRANDING_PATH)).toHaveLength(1))
    expect(JSON.parse(putsTo(BRANDING_PATH)[0][1].body as string)).toEqual({
      brandColour: '#111111',
      receiptMonochrome: true,
    })
    expect(putsTo(DEFAULTS_PATH)).toHaveLength(0)
  })

  it('saves a changed footer note, mapping the screen language to the API code', async () => {
    renderPage()
    const note = await screen.findByDisplayValue('Thanks!')
    fireEvent.change(note, { target: { value: 'New note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putsTo(DEFAULTS_PATH)).toHaveLength(1))
    expect(JSON.parse(putsTo(DEFAULTS_PATH)[0][1].body as string)).toEqual({
      language: 'AR_EN',
      currency: 'OMR',
      paymentTerms: 'NET30',
      footerNote: 'New note',
    })
    expect(putsTo(BRANDING_PATH)).toHaveLength(0)
  })

  it('shows a failure message and keeps the field editable when the branding save is refused', async () => {
    renderPage()
    const colourInput = await screen.findByDisplayValue('#2C4EB7')
    fireEvent.change(colourInput, { target: { value: '#BADHEX' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('That did not save. Check your connection and try again.')).toBeTruthy()
  })

  it('uploads a new logo and shows the initial-letter fallback after removing it', async () => {
    renderPage()
    await screen.findByDisplayValue('#2C4EB7')

    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/v1/company-profile/branding/logo' && init?.method === 'POST',
        ),
      ).toBe(true),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove it' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/v1/company-profile/branding/logo' && init?.method === 'DELETE',
        ),
      ).toBe(true),
    )
  })
})
