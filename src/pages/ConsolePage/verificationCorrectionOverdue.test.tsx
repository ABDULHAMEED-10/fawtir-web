import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  correctionOverdueSince,
  isCorrectionOverdue,
  queuePath,
  type CompanyDetail,
  type CompanySummary,
} from '../../lib/console/companyVerification'
import { formatDate } from '../../lib/format'
import { VerificationCompanyPage } from './VerificationCompanyPage'
import { VerificationPage } from './VerificationPage'

const ID = '11111111-1111-4111-8111-111111111111'
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const PENDING_URL = '/api/v1/platform/companies?status=PENDING_VERIFICATION&page=0&size=25'
const OVERDUE_URL = '/api/v1/platform/companies?correctionOverdue=true&page=0&size=25'
const DETAIL_URL = `/api/v1/platform/companies/${ID}`
const HISTORY_URL = `/api/v1/platform/companies/${ID}/verification-history`
const PAYMENT_URL = `/api/v1/platform/companies/${ID}/signup-payment`
const REJECT_URL = `/api/v1/tenants/${ID}/company-verification/rejection`
const PID_CURRENT_PATH =
  /^\/api\/v1\/platform\/peppol\/smp\/tenants\/[^/]+\/data-submissions\/current$/
const CSRF = 'csrf-token-value'

const OPERATOR: Entitlements = {
  userId: 'u-operator',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
  ],
  permissions: ['platform.tenants.manage'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}

const ROW: CompanySummary = {
  tenantId: ID,
  tenantCode: 'FT3GDWM54D',
  tenantName: 'Al Noor Bakery',
  legalName: 'Al Noor Bakery LLC',
  country: 'OM',
  verificationStatus: 'REJECTED',
  tenantStatus: 'PENDING',
  profileRevision: 2,
  submittedAt: '2026-09-12T05:10:00Z',
  decidedAt: '2026-09-13T05:10:00Z',
  correctableUntil: '2026-10-12',
  correctionOverdue: true,
}

const ON_TIME: CompanySummary = {
  ...ROW,
  tenantId: '22222222-2222-4222-8222-222222222222',
  tenantName: 'Sohar Traders',
  correctableUntil: '2026-11-30',
  correctionOverdue: false,
}

const OVERDUE: CompanyDetail = {
  tenantId: ID,
  tenantCode: 'FT3GDWM54D',
  tenantName: 'Al Noor Bakery',
  legalName: 'Al Noor Bakery LLC',
  taxNumber: 'OM1100000001',
  commercialRegistrationNumber: '1234567',
  country: 'OM',
  registeredAddress: 'Building 4, Way 2301, Sohar',
  timezone: 'Asia/Muscat',
  verificationStatus: 'REJECTED',
  verificationMethod: null,
  rejectionReason: 'REGISTERED_ADDRESS_EVIDENCE_MISSING',
  tenantStatus: 'PENDING',
  identityStatus: 'READY',
  profileRevision: 2,
  expectedRevision: 2,
  submittedAt: '2026-09-12T05:10:00Z',
  submittedBy: 'u-registrant',
  decidedAt: '2026-09-13T05:10:00Z',
  decidedBy: 'u-other',
  attestationReference: null,
  evidenceReference: null,
  evidenceRecorded: false,
  signupAdministrator: { userId: 'u-registrant', signInEnabled: false, emailVerified: true },
  createdAt: '2026-09-12T04:00:00Z',
  updatedAt: '2026-09-13T05:10:00Z',
  correctableUntil: '2026-10-12',
  correctionOverdue: true,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const page = (items: CompanySummary[]) => ({
  items,
  page: 0,
  size: 25,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
})

/** The same company as a server that predates the overdue flag sends it. */
function olderServer<T extends { correctableUntil?: string | null; correctionOverdue?: boolean }>(
  company: T,
): T {
  const copy = { ...company }
  delete copy.correctableUntil
  delete copy.correctionOverdue
  return copy
}

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

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
    if (url.endsWith('/signup-payment')) return json(200, { payment: null, refundCase: null })
    throw new Error(`unexpected request to ${url}`)
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/onboarding" element={<VerificationPage />} />
        <Route path="/console/onboarding/:companyId" element={<VerificationCompanyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const overdueTab = () =>
  screen.queryByRole('button', { name: i18n.t('console.verification.tab.correctionOverdue') })

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('correction overdue helpers', () => {
  it('counts only the server flag, and only with its date', () => {
    expect(isCorrectionOverdue(ROW)).toBe(true)
    expect(isCorrectionOverdue(ON_TIME)).toBe(false)
    expect(isCorrectionOverdue({ correctionOverdue: true, correctableUntil: null })).toBe(false)
    expect(isCorrectionOverdue({})).toBe(false)
  })

  it('is overdue from the day after the last day, across a month end', () => {
    expect(correctionOverdueSince('2026-10-12')).toBe('2026-10-13')
    expect(correctionOverdueSince('2026-10-31')).toBe('2026-11-01')
  })

  it('asks the backend for its own overdue filter', () => {
    expect(queuePath('correctionOverdue', 0)).toBe(
      '/v1/platform/companies?correctionOverdue=true&page=0&size=25',
    )
  })
})

describe('Queue', () => {
  it('badges an overdue row and offers the filter once the server reports the flag', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [PENDING_URL]: () => json(200, page([ROW, ON_TIME])),
      [OVERDUE_URL]: () => json(200, page([ROW])),
    })
    renderAt('/console/onboarding')
    await screen.findByText('Al Noor Bakery')

    const rows = screen.getAllByRole('row')
    const overdueRow = rows.find((row) => within(row).queryByText('Al Noor Bakery'))!
    const onTimeRow = rows.find((row) => within(row).queryByText('Sohar Traders'))!
    expect(
      within(overdueRow).getByText(i18n.t('console.verification.correctionOverdue.badge')),
    ).toBeTruthy()
    expect(
      within(onTimeRow).queryByText(i18n.t('console.verification.correctionOverdue.badge')),
    ).toBeNull()

    fireEvent.click(overdueTab()!)
    await waitFor(() => expect(callsTo(OVERDUE_URL)).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('Sohar Traders')).toBeNull())
    expect(screen.getByText('Al Noor Bakery')).toBeTruthy()
  })

  it('shows neither badge nor filter when the server does not report the flag', async () => {
    const older = olderServer(ROW)
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [PENDING_URL]: () => json(200, page([older])),
    })
    renderAt('/console/onboarding')
    await screen.findByText('Al Noor Bakery')

    expect(overdueTab()).toBeNull()
    expect(screen.queryByText(i18n.t('console.verification.correctionOverdue.badge'))).toBeNull()
  })

  it('on the overdue tab, an older server answering every company lists none of them', async () => {
    const older = olderServer(ROW)
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERDUE_URL]: () => json(200, page([older])),
    })
    renderAt('/console/onboarding?status=correctionOverdue')

    expect(
      await screen.findByText(i18n.t('console.verification.empty.correctionOverdue')),
    ).toBeTruthy()
    expect(screen.queryByText('Al Noor Bakery')).toBeNull()
  })
})

describe('Detail', () => {
  it('says since when the correction is overdue, and that closing it refunds the payment', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: () => json(200, OVERDUE),
      [HISTORY_URL]: () => json(200, []),
    })
    renderAt(`/console/onboarding/${ID}`)

    expect(
      await screen.findByText(
        i18n.t('console.verification.correctionOverdue.since', {
          date: formatDate('2026-10-13', 'en'),
        }),
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(i18n.t('console.verification.correctionOverdue.refund'), { exact: false }),
    ).toBeTruthy()
    // Only the close path: nothing to verify, no evidence to file.
    expect(
      screen.queryByRole('button', { name: i18n.t('console.verification.decision.verify') }),
    ).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('closes with the existing final rejection, always FINAL, and reads the company again', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: [
        () => json(200, OVERDUE),
        () => json(200, { ...OVERDUE, correctableUntil: null, correctionOverdue: false }),
      ],
      [HISTORY_URL]: () => json(200, []),
      [PAYMENT_URL]: [
        () => json(200, { payment: null, refundCase: null }),
        () =>
          json(200, {
            payment: null,
            refundCase: { reason: 'FINAL_REJECTION', amount: '84.000', status: 'OPEN' },
          }),
      ],
      [REJECT_URL]: () =>
        json(200, {
          tenantId: ID,
          verificationStatus: 'REJECTED',
          verificationMethod: null,
          tenantStatus: 'PENDING',
          decidedAt: '2026-10-18T06:00:00Z',
        }),
    })
    renderAt(`/console/onboarding/${ID}`)

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('console.verification.correctionOverdue.close'),
      }),
    )
    const dialog = screen.getByRole('dialog', {
      name: i18n.t('console.verification.decision.rejectTitle'),
    })
    // No choice of classification: an overdue correction is only ever closed.
    expect(within(dialog).queryByRole('radio')).toBeNull()
    expect(
      within(dialog).getByText(i18n.t('console.verification.decision.rejectBodyFinal')),
    ).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.reason') }),
    )
    fireEvent.click(
      screen.getByRole('option', {
        name: i18n.t('console.verification.detail.reason.COMPANY_PROFILE_MISMATCH'),
      }),
    )
    fireEvent.change(
      within(dialog).getByLabelText(i18n.t('console.verification.decision.finalReason')),
      { target: { value: 'No answer to two reminders' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: i18n.t('console.verification.decision.rejectConfirm'),
      }),
    )

    const banner = await screen.findByText(i18n.t('console.verification.decision.rejectedFinal'), {
      exact: false,
    })
    expect(JSON.parse(callsTo(REJECT_URL)[0][1].body as string)).toEqual({
      expectedRevision: 2,
      reason: 'COMPANY_PROFILE_MISMATCH',
      classification: 'FINAL',
      finalReason: 'No answer to two reminders',
    })
    await waitFor(() =>
      expect(banner.textContent).toContain(i18n.t('console.verification.decision.refundOpened')),
    )
    expect(
      screen.queryByRole('button', {
        name: i18n.t('console.verification.correctionOverdue.close'),
      }),
    ).toBeNull()
  })

  it('shows nothing about a correction when the server sends no flag', async () => {
    const older = olderServer(OVERDUE)
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: () => json(200, older),
      [HISTORY_URL]: () => json(200, []),
    })
    renderAt(`/console/onboarding/${ID}`)
    await screen.findByRole('heading', { level: 1, name: 'Al Noor Bakery' })

    expect(
      screen.queryByRole('button', {
        name: i18n.t('console.verification.correctionOverdue.close'),
      }),
    ).toBeNull()
    expect(
      screen.queryByText(i18n.t('console.verification.correctionOverdue.refund'), { exact: false }),
    ).toBeNull()
  })

  it('speaks Arabic', async () => {
    await i18n.changeLanguage('ar')
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [DETAIL_URL]: () => json(200, OVERDUE),
      [HISTORY_URL]: () => json(200, []),
    })
    renderAt(`/console/onboarding/${ID}`)

    expect(
      await screen.findByRole('button', {
        name: i18n.t('console.verification.correctionOverdue.close'),
      }),
    ).toBeTruthy()
    expect(i18n.t('console.verification.correctionOverdue.close')).toBe('إغلاق برفض نهائي')
  })
})
