import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { ConsoleCompanyContactPage } from './ConsoleCompanyContactPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const CONTACT = '/api/v1/platform/company-contact'
const HISTORY = '/api/v1/platform/company-contact/history?limit=50'

const MANAGER: Entitlements = {
  userId: 'u-admin',
  username: 'super.admin',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
  ],
  permissions: ['platform.billing.read', 'platform.billing.manage'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...MANAGER, permissions: ['platform.billing.read'] }

function contact(over: Record<string, unknown> = {}) {
  return {
    id: 'c-2',
    version: 2,
    supportEmail: 'fawtara@insight.om',
    supportPhone: '+968 0000 0000',
    websiteUrl: 'https://www.fawtir.om',
    addressEn: 'Al Rusayl 124, Sultanate of Oman',
    addressAr: 'الرسيل 124، سلطنة عُمان',
    linkedinUrl: null,
    instagramUrl: null,
    reason: 'Placeholders',
    createdBy: 'u-other',
    createdAt: '2026-10-18T05:00:00Z',
    ...over,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  who = MANAGER
  answers = {
    [CONTACT]: () => json(200, contact()),
    [HISTORY]: () =>
      json(200, [
        contact(),
        contact({
          id: 'c-1',
          version: 1,
          supportEmail: 'old@insight.om',
          reason: 'Seeded',
          createdBy: '00000000-0000-0000-0000-000000000000',
        }),
      ]),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/console/company-contact']}>
      <Routes>
        <Route path="/console/company-contact" element={<ConsoleCompanyContactPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const C = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`console.companyContact.${key}`, options)
const box = (key: string) => screen.getByRole('textbox', { name: C(key) })
const save = () => screen.getByRole('button', { name: i18n.t('console.settings.save') })

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call ? { init: call[1] as RequestInit, body: JSON.parse(String(call[1]?.body)) } : null
}

describe('Console › Contact details (CS-1)', () => {
  it('saves a change with the version read and a reason, sending emptied fields as null', async () => {
    answers[`PUT ${CONTACT}`] = () => json(200, contact({ version: 3 }))
    const user = userEvent.setup({ delay: null })
    renderPage()

    const email = await screen.findByRole('textbox', { name: C('supportEmail') })
    expect((email as HTMLInputElement).value).toBe('fawtara@insight.om')
    await user.clear(email)
    await user.type(email, 'support@fawtir.om')
    await user.clear(box('websiteUrl'))
    await user.type(box('linkedinUrl'), 'https://www.linkedin.com/company/fawtir')
    await user.type(box('reason'), 'Real support address')
    await user.click(save())

    await waitFor(() => expect(sent('PUT', CONTACT)).not.toBeNull())
    const put = sent('PUT', CONTACT)!
    expect((put.init.headers as Record<string, string>)['If-Match']).toBe('"2"')
    expect(put.body).toEqual({
      supportEmail: 'support@fawtir.om',
      supportPhone: '+968 0000 0000',
      websiteUrl: null,
      addressEn: 'Al Rusayl 124, Sultanate of Oman',
      addressAr: 'الرسيل 124، سلطنة عُمان',
      linkedinUrl: 'https://www.linkedin.com/company/fawtir',
      instagramUrl: null,
      reason: 'Real support address',
    })
  })

  it('lists the earlier versions, the seeded one as the system', async () => {
    renderPage()
    expect(
      await screen.findByText(`${C('version', { version: 1 })} · old@insight.om · +968 0000 0000`),
    ).toBeTruthy()
    expect(screen.queryByText(new RegExp(`^${C('version', { version: 2 })} ·`))).toBeNull()
    expect(screen.getByText(new RegExp(i18n.t('console.plans.history.system')))).toBeTruthy()
  })

  it('checks the email, phone and links before sending', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()

    const email = await screen.findByRole('textbox', { name: C('supportEmail') })
    await user.clear(email)
    await user.type(email, 'not-an-email')
    await user.clear(box('supportPhone'))
    await user.type(box('supportPhone'), '24000000')
    await user.type(box('instagramUrl'), 'http://instagram.com/fawtir')
    await user.click(save())

    expect(await screen.findByText(C('error.email'))).toBeTruthy()
    expect(screen.getByText(C('error.phone'))).toBeTruthy()
    expect(screen.getByText(C('error.url'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.settings.error.required'))).toBeTruthy()
    expect(sent('PUT', CONTACT)).toBeNull()
  })

  it('says someone else changed the details on a version conflict, and reads them again', async () => {
    answers[`PUT ${CONTACT}`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/company-contact-version-conflict' })
    const user = userEvent.setup({ delay: null })
    renderPage()

    await user.type(await screen.findByRole('textbox', { name: C('reason') }), 'Change')
    await user.clear(box('addressAr'))
    await user.click(save())

    expect(await screen.findByText(C('refusal.conflict'))).toBeTruthy()
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === CONTACT).length).toBeGreaterThan(1),
    )
  })

  it('names a lapsed sign-in code or missing permission on a 403', async () => {
    answers[`PUT ${CONTACT}`] = () => json(403, { type: 'about:blank', status: 403 })
    const user = userEvent.setup({ delay: null })
    renderPage()

    await user.type(await screen.findByRole('textbox', { name: C('reason') }), 'Change')
    await user.clear(box('websiteUrl'))
    await user.click(save())
    expect((await screen.findByRole('alert')).textContent).toBe(C('refusal.forbidden'))
  })

  it('is read-only without the manage permission', async () => {
    who = READER
    renderPage()

    expect(await screen.findByText(C('readOnly'))).toBeTruthy()
    expect(box('supportEmail').matches(':disabled')).toBe(true)
    expect(screen.queryByRole('textbox', { name: C('reason') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('console.settings.save') })).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByRole('heading', { name: C('card') })).toBeTruthy()
    expect(box('supportEmail').getAttribute('dir')).toBe('ltr')
  })
})
