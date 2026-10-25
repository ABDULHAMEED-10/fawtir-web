import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import {
  forgetEntitlements,
  peekEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'
import type {
  CompanyDetail,
  CompanySummary,
  HistoryEntry,
} from '../../lib/console/companyVerification'
import { VerificationCompanyPage } from './VerificationCompanyPage'
import { VerificationPage } from './VerificationPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const QUEUE_URL = '/api/v1/platform/companies?status=PENDING_VERIFICATION&page=0&size=25'
const SUBMITTED_ID = '11111111-1111-4111-8111-111111111111'
const SHELL_ID = '22222222-2222-4222-8222-222222222222'
const DETAIL_URL = `/api/v1/platform/companies/${SUBMITTED_ID}`
const HISTORY_URL = `/api/v1/platform/companies/${SUBMITTED_ID}/verification-history`

const OPERATOR: Entitlements = {
  userId: 'u-1',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
    { id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true },
  ],
  permissions: ['platform.tenants.manage', 'platform.support', 'role.read'],
  scopes: ['platform.tenants.manage', 'platform.support', 'role.read'],
  featureFlags: {},
}

const SUBMITTED: CompanySummary = {
  tenantId: SUBMITTED_ID,
  tenantCode: 'FT3GDWM54D',
  tenantName: 'Al Noor Bakery',
  legalName: 'Al Noor Bakery LLC',
  country: 'OM',
  verificationStatus: 'PENDING_VERIFICATION',
  tenantStatus: 'PENDING',
  profileRevision: 1,
  submittedAt: '2026-09-12T05:10:00Z',
  decidedAt: null,
}

const SHELL: CompanySummary = {
  ...SUBMITTED,
  tenantId: SHELL_ID,
  tenantCode: 'FTKHFZ94JU',
  tenantName: 'Unfinished Registration',
  legalName: null,
  country: null,
  profileRevision: 0,
  submittedAt: null,
}

const DETAIL: CompanyDetail = {
  tenantId: SUBMITTED_ID,
  tenantCode: 'FT3GDWM54D',
  tenantName: 'Al Noor Bakery',
  legalName: 'Al Noor Bakery LLC',
  taxNumber: 'OM1100000001',
  commercialRegistrationNumber: '1234567',
  country: 'OM',
  registeredAddress: 'Building 4, Way 2301, Sohar',
  timezone: 'Asia/Muscat',
  verificationStatus: 'PENDING_VERIFICATION',
  verificationMethod: null,
  rejectionReason: null,
  tenantStatus: 'PENDING',
  identityStatus: 'READY',
  profileRevision: 1,
  expectedRevision: 1,
  submittedAt: '2026-09-12T05:10:00Z',
  submittedBy: 'u-registrant',
  decidedAt: null,
  decidedBy: null,
  attestationReference: null,
  evidenceReference: null,
  evidenceRecorded: false,
  signupAdministrator: { userId: 'u-registrant', signInEnabled: false, emailVerified: true },
  createdAt: '2026-09-12T04:00:00Z',
  updatedAt: '2026-09-12T05:10:00Z',
}

const HISTORY: HistoryEntry[] = [
  {
    event: 'PROFILE_SUBMITTED',
    profileRevision: 1,
    verificationStatus: 'PENDING_VERIFICATION',
    verificationMethod: null,
    rejectionReason: null,
    attestationReference: null,
    evidenceReference: null,
    performedBy: 'u-registrant',
    occurredAt: '2026-09-12T05:10:00Z',
  },
]

const page = (
  items: CompanySummary[],
  extra: Partial<{ page: number; totalElements: number; totalPages: number }> = {},
) => ({
  items,
  page: 0,
  size: 25,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
  ...extra,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    detail: 'Server prose that must not be shown.',
  })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

/**
 * The Participant ID card beside the decision panel reads this for every submitted company; none
 * of this file's cases are about that card, so an unmocked read here answers "nothing filed yet"
 * rather than failing loudly like a genuinely missed mock would.
 */
const PID_CURRENT_PATH = /^\/api\/v1\/platform\/peppol\/smp\/tenants\/[^/]+\/data-submissions\/current$/

/** Answers each URL from its own handler; an unexpected URL fails the request loudly. */
function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([url, handler]) => [
      url,
      Array.isArray(handler) ? [...handler] : handler,
    ]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (handler) return handler()
    if (PID_CURRENT_PATH.test(url)) return json(200, null)
    // The signup payment panel (#185) reads beside the company; no payment unless a test says so.
    if (url.endsWith('/signup-payment')) return json(200, { payment: null, refundCase: null })
    throw new Error(`unexpected request to ${url}`)
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const urls = () => fetchMock.mock.calls.map(([url]) => url as string)

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderAt(path: string, { strict = false }: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/onboarding" element={<VerificationPage />} />
        <Route path="/console/onboarding/:companyId" element={<VerificationCompanyPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const QUEUE_READY = {
  [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
  [QUEUE_URL]: () => json(200, page([SUBMITTED, SHELL])),
}
const table = () => screen.getByRole('table')

beforeEach(async () => {
  // A test that ends while its queue read is still settling leaves the read in the shared
  // registry, and every later queue test joins it and waits out its timeout (see `inflight.ts`).
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Console access', () => {
  it('asks for entitlements once on entry, even under StrictMode, and shows the real username', async () => {
    answer(QUEUE_READY)
    renderAt('/console/onboarding', { strict: true })

    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
    expect(callsTo(QUEUE_URL)).toHaveLength(1)
    expect(screen.getByText('ops.reviewer')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Super Admin')
    expect(document.body.textContent).not.toContain('Nasser Al Habsi')
  })

  it('asks the queue only once access is known, and never asks it for a reader without the permission', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, { ...OPERATOR, permissions: ['platform.support'] }),
    })
    renderAt('/console/onboarding')

    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.access.noAccess'))).toBeTruthy()
    expect(callsTo(QUEUE_URL)).toHaveLength(0)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('tells a customer account the console is not for it', async () => {
    answer({
      [ENTITLEMENTS_URL]: () =>
        json(200, { ...OPERATOR, permissions: ['invoice.read', 'tenant.plan.read'] }),
    })
    renderAt('/console/onboarding')

    expect(await screen.findByText(i18n.t('console.access.notOperator'))).toBeTruthy()
    expect(urls()).toEqual([ENTITLEMENTS_URL])
    // The platform's menu, Plans and rates included, is never drawn for a company account.
    expect(screen.queryByRole('link', { name: i18n.t('console.nav.plans') })).toBeNull()
    expect(screen.queryByRole('link', { name: i18n.t('console.nav.tenants') })).toBeNull()
    expect(screen.queryByRole('link', { name: i18n.t('console.nav.bottomSettings') })).toBeNull()
  })

  it('shows Plans and rates only to an operator the catalogue read permission covers', async () => {
    answer(QUEUE_READY)
    const view = renderAt('/console/onboarding')
    expect(await screen.findByRole('link', { name: i18n.t('console.nav.tenants') })).toBeTruthy()
    expect(screen.queryByRole('link', { name: i18n.t('console.nav.plans') })).toBeNull()
    view.unmount()

    resetSharedRequests()
    forgetEntitlements()
    answer({
      ...QUEUE_READY,
      [ENTITLEMENTS_URL]: () =>
        json(200, { ...OPERATOR, permissions: [...OPERATOR.permissions, 'platform.plans.read'] }),
    })
    renderAt('/console/onboarding')
    expect(await screen.findByRole('link', { name: i18n.t('console.nav.plans') })).toBeTruthy()
  })

  it("lists for a Support operator only the screens that operator's permissions open", async () => {
    answer({
      [ENTITLEMENTS_URL]: () =>
        json(200, { ...OPERATOR, permissions: ['platform.support', 'platform.plans.read'] }),
    })
    renderAt('/console/onboarding')
    expect(await screen.findByRole('link', { name: i18n.t('console.nav.plans') })).toBeTruthy()
    // Validation policies are opened from Console › Settings (owner, 24 Oct 2026).
    expect(screen.getByRole('link', { name: i18n.t('console.nav.bottomSettings') })).toBeTruthy()
    for (const hidden of ['console.nav.tenants', 'console.nav.verification', 'console.settingsHub.card.operatorsTitle']) {
      expect(screen.queryByRole('link', { name: i18n.t(hidden) })).toBeNull()
    }
  })

  it('sends a visitor without a session to Login', async () => {
    answer({ [ENTITLEMENTS_URL]: () => problem(401, 'unauthenticated') })
    renderAt('/console/onboarding')

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(peekEntitlements()).toBeNull()
  })

  it('offers a retry when entitlements cannot be read, then asks once more', async () => {
    answer({
      [ENTITLEMENTS_URL]: [
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => json(200, OPERATOR),
      ],
      [QUEUE_URL]: () => json(200, page([SUBMITTED])),
    })
    renderAt('/console/onboarding')

    fireEvent.click(await screen.findByRole('button', { name: i18n.t('console.access.retry') }))
    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(2)
  })
})

describe('Verification queue', () => {
  it('asks the backend for exactly the first page of pending work', async () => {
    answer(QUEUE_READY)
    renderAt('/console/onboarding')
    await screen.findByText('Al Noor Bakery')

    expect(callsTo(QUEUE_URL)).toHaveLength(1)
    expect(new URL(QUEUE_URL, 'http://x').searchParams.get('size')).toBe('25')
  })

  it('shows a loading state while the page is on its way', async () => {
    let release: (response: Response) => void = () => {}
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: () => new Promise<Response>((resolve) => (release = resolve)),
    })
    renderAt('/console/onboarding')

    expect(await screen.findByText(i18n.t('console.verification.loading'))).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    // Settled so the shared in-flight request does not outlive the test.
    await act(async () => release(json(200, page([SUBMITTED]))))
    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
  })

  it('labels a registration that was never submitted and offers it no decision', async () => {
    answer(QUEUE_READY)
    renderAt('/console/onboarding')
    await screen.findByText('Unfinished Registration')

    const shellRow = screen.getByText('Unfinished Registration').closest('tr')!
    expect(
      within(shellRow).getByText(i18n.t('console.verification.status.notSubmitted')),
    ).toBeTruthy()
    expect(within(shellRow).getByText(i18n.t('console.verification.noLegalName'))).toBeTruthy()
    expect(
      within(shellRow).queryByText(i18n.t('console.verification.status.PENDING_VERIFICATION')),
    ).toBeNull()

    const submittedRow = screen.getByText('Al Noor Bakery').closest('tr')!
    expect(
      within(submittedRow).getByText(i18n.t('console.verification.status.PENDING_VERIFICATION')),
    ).toBeTruthy()

    // Read-only: no row carries any action, and nothing on the page offers a decision.
    expect(within(table()).queryAllByRole('button')).toHaveLength(0)
    expect(
      screen.queryByRole('button', { name: /approve|verify company|upload|evidence/i }),
    ).toBeNull()
  })

  it('keeps the backend totals exactly and pages on the server', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: () => json(200, page([SUBMITTED, SHELL], { totalElements: 57, totalPages: 3 })),
      '/api/v1/platform/companies?status=PENDING_VERIFICATION&page=1&size=25': () =>
        json(200, page([SUBMITTED], { page: 1, totalElements: 57, totalPages: 3 })),
    })
    renderAt('/console/onboarding')
    await screen.findByText('Al Noor Bakery')

    expect(screen.getByText('Showing 1–2 of 57')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '2' }))

    expect(await screen.findByText('Showing 26–26 of 57')).toBeTruthy()
    expect(urls().filter((url) => url.startsWith('/api/v1/platform/companies'))).toEqual([
      QUEUE_URL,
      '/api/v1/platform/companies?status=PENDING_VERIFICATION&page=1&size=25',
    ])
  })

  it('filters by status on the server, and "All" sends no status', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: () => json(200, page([SUBMITTED])),
      '/api/v1/platform/companies?status=VERIFIED&page=0&size=25': () => json(200, page([])),
      '/api/v1/platform/companies?page=0&size=25': () => json(200, page([SUBMITTED, SHELL])),
    })
    renderAt('/console/onboarding')
    await screen.findByText('Al Noor Bakery')

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('console.verification.tab.verified') }),
    )
    expect(await screen.findByText(i18n.t('console.verification.empty.verified'))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.verification.tab.all') }))
    expect(await screen.findByText('Unfinished Registration')).toBeTruthy()
  })

  it('says the queue is empty only when the backend says so', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: () => json(200, page([])),
    })
    renderAt('/console/onboarding')

    expect(await screen.findByText(i18n.t('console.verification.empty.pending'))).toBeTruthy()
  })

  it('shows a refusal as no access — never as an empty queue', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: () => problem(403, 'insufficient-permission'),
    })
    renderAt('/console/onboarding')

    expect(await screen.findByText(i18n.t('console.access.noAccess'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.verification.empty.pending'))).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it.each([
    [
      'a network failure',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'identityErrors.network',
    ],
    ['a 5xx', () => problem(503, 'internal-error'), 'identityErrors.service'],
  ])('reports %s with a retry that asks exactly once more', async (_label, fail, key) => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: [fail, () => json(200, page([SUBMITTED]))],
    })
    renderAt('/console/onboarding')

    expect(await screen.findByText(i18n.t(key))).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.verification.empty.pending'))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.access.retry') }))

    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
    expect(callsTo(QUEUE_URL)).toHaveLength(2)
  })

  it('sends a session that died mid-visit to Login', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [QUEUE_URL]: () => problem(401, 'unauthenticated'),
    })
    renderAt('/console/onboarding')

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(peekEntitlements()).toBeNull()
  })

  it('offers a way back when the URL points past the last page', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      '/api/v1/platform/companies?status=PENDING_VERIFICATION&page=8&size=25': () =>
        json(200, page([], { page: 8, totalElements: 2, totalPages: 1 })),
      [QUEUE_URL]: () => json(200, page([SUBMITTED, SHELL])),
    })
    renderAt('/console/onboarding?page=9')

    fireEvent.click(
      await screen.findByRole('button', { name: i18n.t('console.verification.firstPage') }),
    )
    expect(await screen.findByText('Al Noor Bakery')).toBeTruthy()
  })
})

describe('Company detail', () => {
  it('opens from its row and asks for the detail and the history in parallel, once each', async () => {
    let releaseDetail: (response: Response) => void = () => {}
    answer({
      ...QUEUE_READY,
      [DETAIL_URL]: () => new Promise<Response>((resolve) => (releaseDetail = resolve)),
      [HISTORY_URL]: () => json(200, HISTORY),
    })
    renderAt('/console/onboarding', { strict: true })
    fireEvent.click(await screen.findByRole('link', { name: 'Al Noor Bakery' }))

    // The history is asked before the detail has answered: nothing waits on anything else.
    await waitFor(() => expect(callsTo(HISTORY_URL)).toHaveLength(1))
    expect(callsTo(DETAIL_URL)).toHaveLength(1)
    await act(async () => releaseDetail(json(200, DETAIL)))

    expect(await screen.findByRole('heading', { level: 1, name: 'Al Noor Bakery' })).toBeTruthy()
    expect(screen.getByText('OM1100000001')).toBeTruthy()
    expect(
      screen.getByText(i18n.t('console.verification.detail.event.PROFILE_SUBMITTED')),
    ).toBeTruthy()
    expect(callsTo(ENTITLEMENTS_URL)).toHaveLength(1)
    expect(callsTo(DETAIL_URL)).toHaveLength(1)
    expect(callsTo(HISTORY_URL)).toHaveLength(1)
    // A submitted registration waiting for review offers the decision — and nothing is written
    // until the reviewer acts: opening the company is reads only.
    const verify = screen.getByRole('button', {
      name: i18n.t('console.verification.decision.verify'),
    })
    expect((verify as HTMLButtonElement).disabled).toBe(true)
    expect(
      fetchMock.mock.calls.every(
        ([, init]) =>
          !init || !(init as RequestInit).method || (init as RequestInit).method === 'GET',
      ),
    ).toBe(true)
  })

  it('returns to the same queue page it came from', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      '/api/v1/platform/companies?status=VERIFIED&page=1&size=25': () =>
        json(
          200,
          page([{ ...SUBMITTED, verificationStatus: 'VERIFIED' }], {
            page: 1,
            totalElements: 30,
            totalPages: 2,
          }),
        ),
      [DETAIL_URL]: () => json(200, DETAIL),
      [HISTORY_URL]: () => json(200, HISTORY),
    })
    renderAt('/console/onboarding?status=verified&page=2')
    fireEvent.click(await screen.findByRole('link', { name: 'Al Noor Bakery' }))
    await screen.findByRole('heading', { level: 1, name: 'Al Noor Bakery' })

    // The breadcrumb's Verification crumb is the way back, and it keeps the queue's place.
    expect(
      within(screen.getByRole('navigation', { name: i18n.t('console.crumb.label') }))
        .getByRole('link', { name: i18n.t('console.nav.verification') })
        .getAttribute('href'),
    ).toBe('/console/onboarding?status=verified&page=2')
  })

  it('says an unfinished registration has nothing to decide', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [`/api/v1/platform/companies/${SHELL_ID}`]: () =>
        json(200, {
          ...DETAIL,
          tenantId: SHELL_ID,
          submittedAt: null,
          legalName: null,
          taxNumber: null,
        }),
      [`/api/v1/platform/companies/${SHELL_ID}/verification-history`]: () => json(200, []),
    })
    renderAt(`/console/onboarding/${SHELL_ID}`)

    expect(await screen.findByText(i18n.t('console.verification.detail.notSubmitted'))).toBeTruthy()
    expect(
      screen.getAllByText(i18n.t('console.verification.status.notSubmitted')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(i18n.t('console.verification.detail.historyEmpty'))).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /approve|reject|verify|evidence|upload/i }),
    ).toBeNull()
  })

  it('answers an unknown company as not found', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: () => problem(404, 'resource-not-found'),
      [HISTORY_URL]: () => problem(404, 'resource-not-found'),
    })
    renderAt(`/console/onboarding/${SUBMITTED_ID}`)

    expect(await screen.findByText(i18n.t('console.verification.detail.notFound'))).toBeTruthy()
  })

  it('answers a malformed id as not found without asking the backend', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt('/console/onboarding/not-a-company')

    expect(await screen.findByText(i18n.t('console.verification.detail.notFound'))).toBeTruthy()
    expect(urls()).toEqual([ENTITLEMENTS_URL])
  })

  it('shows a refused detail as no access', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: () => problem(403, 'insufficient-permission'),
      [HISTORY_URL]: () => problem(403, 'insufficient-permission'),
    })
    renderAt(`/console/onboarding/${SUBMITTED_ID}`)

    expect(await screen.findByText(i18n.t('console.access.noAccess'))).toBeTruthy()
  })

  it('keeps the company on screen when only the history fails, and retries only the history', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: () => json(200, DETAIL),
      [HISTORY_URL]: [() => problem(503, 'internal-error'), () => json(200, HISTORY)],
    })
    renderAt(`/console/onboarding/${SUBMITTED_ID}`)

    expect(await screen.findByText(i18n.t('identityErrors.service'))).toBeTruthy()
    expect(screen.getByText('OM1100000001')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.access.retry') }))

    expect(
      await screen.findByText(i18n.t('console.verification.detail.event.PROFILE_SUBMITTED')),
    ).toBeTruthy()
    expect(callsTo(DETAIL_URL)).toHaveLength(1)
    expect(callsTo(HISTORY_URL)).toHaveLength(2)
  })
})

describe('Privacy and language', () => {
  it('keeps company data out of storage and the console', async () => {
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level),
    )
    answer({
      ...QUEUE_READY,
      [DETAIL_URL]: () => json(200, DETAIL),
      [HISTORY_URL]: () => json(200, HISTORY),
    })
    renderAt('/console/onboarding')
    fireEvent.click(await screen.findByRole('link', { name: 'Al Noor Bakery' }))
    await screen.findByText('OM1100000001')

    const stored = JSON.stringify({ ...sessionStorage, ...localStorage })
    for (const value of ['OM1100000001', '1234567', 'Al Noor Bakery', 'ops.reviewer', 'Sohar']) {
      expect(stored).not.toContain(value)
      for (const spy of consoleCalls) expect(JSON.stringify(spy.mock.calls)).not.toContain(value)
    }
    expect(urls().every((url) => !url.includes('OM1100000001'))).toBe(true)
  })

  it('speaks Arabic, including the statuses and the country', async () => {
    await i18n.changeLanguage('ar')
    answer({
      ...QUEUE_READY,
      [DETAIL_URL]: () => json(200, DETAIL),
      [HISTORY_URL]: () => json(200, HISTORY),
    })
    renderAt('/console/onboarding')
    await screen.findByText('Al Noor Bakery')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('التحقق')
    expect(screen.getByText('لم يُرسَل بعد')).toBeTruthy()
    expect(screen.getByText('بانتظار المراجعة')).toBeTruthy()
    expect(table().textContent).not.toMatch(/Waiting for review|Not submitted/)

    fireEvent.click(screen.getByRole('link', { name: 'Al Noor Bakery' }))
    expect(await screen.findByText('الشركة كما أُرسلت')).toBeTruthy()
    expect(
      screen.getByText(new Intl.DisplayNames(['ar'], { type: 'region' }).of('OM')!),
    ).toBeTruthy()
  })
})
