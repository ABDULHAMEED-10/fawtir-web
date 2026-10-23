import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { DashboardPage } from './DashboardPage'
import { DashboardHeader } from './KpiSection'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'layla.accounts',
  tenantId: 't-1',
  tenantName: 'Real Tenant',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'reports.read', 'tenant.plan.read'],
  scopes: [],
  featureFlags: {},
}

const URL = {
  dashboard: '/api/v1/dashboard',
  bills: '/api/v1/bills/summary',
  plan: '/api/v1/settings/plan',
  readiness: '/api/v1/invoicing/readiness',
  subscription: '/api/v1/settings/subscription',
}

const ok = <T,>(data: T) => ({ status: 'OK', data })
const UNAVAILABLE = { status: 'UNAVAILABLE', data: null }

const DASHBOARD = {
  asOf: '2026-10-08',
  timeZone: 'Asia/Muscat',
  branchId: null,
  receivables: ok([
    { currency: 'OMR', outstanding: 812.5, overdue: 100, overdueCount: 1, openCount: 4, dueThisMonth: 50 },
  ]),
  cash: ok({
    from: '2026-10-01',
    to: '2026-10-08',
    previousFrom: '2026-09-01',
    previousTo: '2026-09-08',
    byCurrency: [{ currency: 'OMR', received: 77.25, previousReceived: 10 }],
  }),
  vat: ok({
    from: '2026-10-01',
    to: '2026-12-31',
    branchScoped: false,
    output: [{ side: 'OUTPUT', currency: 'OMR', vatAmount: 40 }],
    input: [{ side: 'INPUT', currency: 'OMR', vatAmount: 15 }],
    net: [{ side: 'NET', currency: 'OMR', vatAmount: 25 }],
  }),
  volumeTrend: ok({
    from: '2025-11-01',
    to: '2026-10-31',
    months: [
      { period: '2026-09', periodStart: '2026-09-01', currency: 'OMR', documents: 2, totalAmount: 300 },
      { period: '2026-10', periodStart: '2026-10-01', currency: 'OMR', documents: 1, totalAmount: 120 },
    ],
  }),
  compliance: ok({
    from: '2026-10-01T00:00:00Z',
    to: '2026-10-08T00:00:00Z',
    scope: 'TENANT',
    documents: 3,
    outboundInvoiceAck: { ap: 2, ab: 0, re: 1, none: 0 },
    deliverySuccessRate: 2 / 3,
    deadLettered: 0,
    attention: 0,
  }),
  recentInvoices: ok([
    {
      id: 'inv-1',
      invoiceNumber: 'RT-0007',
      invoiceType: 'INVOICE',
      state: 'ISSUED',
      issueDate: '2026-10-07',
      customerName: 'Real Buyer LLC',
      currency: 'OMR',
      total: 120,
      dispatch: 'DISPATCHED',
      transportState: null,
      invoiceAck: 'AP',
    },
  ]),
  alerts: ok([{ code: 'OVERDUE_INVOICES', severity: 'WARNING', count: 1 }]),
}

const BILLS = { currencyCode: 'OMR', openCount: 2, openTotal: 64.5, overdueCount: 1, dueThisWeekCount: 1 }
const PLAN = {
  plan: { code: 'STARTER', name: 'Starter', invoicesPerMonth: 100, peopleIncluded: 2, branchesIncluded: 1 },
  usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-08' }, used: 7, resubmissions: 0, quota: 100, raisedToday: 1 },
  activePeople: 1,
  openInvitations: 0,
  activeBranches: 1,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

type Answers = Partial<Record<keyof typeof URL, () => Response>>
let fetchMock: ReturnType<typeof vi.fn>

function answer(answers: Answers = {}) {
  const all: Required<Answers> = {
    dashboard: () => json(200, DASHBOARD),
    bills: () => json(200, BILLS),
    plan: () => json(200, PLAN),
    readiness: () => json(404, { type: 'about:blank' }),
    subscription: () => json(404, { type: 'about:blank' }),
    ...answers,
  }
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    const key = (Object.keys(URL) as (keyof typeof URL)[]).find((k) => URL[k] === url)
    // The shell's own reads (branches, notifications…) are not under test here.
    return key ? all[key]() : json(404, { type: 'about:blank' })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

const t = (key: string, values?: Record<string, unknown>) => i18n.t(key, values)
const card = (title: string) => within(screen.getByText(title).closest('article, section')!)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  forgetSubscriptionStanding()
  resetSharedRequests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
})

describe('Dashboard, from the server', () => {
  it('draws every card from the dashboard, bills and plan reads', async () => {
    answer()
    renderPage()

    await screen.findByText('RT-0007')
    // "Today's sales" has no tile yet; the card says so and shows the month's cash beneath it.
    expect(card(t('dashboard.kpi.sales')).getByText(t('dashboard.notAvailableYet'))).toBeTruthy()
    expect(card(t('dashboard.kpi.sales')).getByText('77.250')).toBeTruthy()
    expect(card(t('dashboard.kpi.receivables')).getByText('812.500')).toBeTruthy()
    expect(card(t('dashboard.kpi.receivables')).getByText(t('dashboard.kpi.open', { count: 4 }))).toBeTruthy()
    expect(card(t('dashboard.kpi.payables')).getByText('64.500')).toBeTruthy()
    expect(screen.getByText('Real Buyer LLC')).toBeTruthy()
    expect(screen.getByText(t('dashboard.invoices.status.accepted'))).toBeTruthy()
    expect(screen.getByText('66.7%')).toBeTruthy()
    expect(card(t('dashboard.quota.title')).getByText('7')).toBeTruthy()
    expect(card(t('dashboard.vat.title')).getByText('25.000')).toBeTruthy()
    expect(screen.getByRole('link', { name: /1 invoice is overdue/ }).getAttribute('href')).toBe('/invoices')
    expect(fetchMock.mock.calls.filter(([url]) => url === URL.dashboard)).toHaveLength(1)
  })

  it('prints none of the sample company or its figures', async () => {
    answer()
    renderPage()
    await screen.findByText('RT-0007')

    const text = document.body.textContent ?? ''
    for (const leak of ['Al Bahja', 'OM1100234567', 'Hafidh', '14,320', '1,240', '6,780', '28,450', 'Muscat Grand Hotel', '98.7%', '342', 'Saturday, 18 July 2026'])
      expect(text).not.toContain(leak)
    expect(screen.getByText(t('dashboard.kpi.sales'))).toBeTruthy()
  })

  it('says "Not available yet" per tile the server marks UNAVAILABLE, and still draws the rest', async () => {
    answer({
      dashboard: () =>
        json(200, { ...DASHBOARD, cash: UNAVAILABLE, compliance: UNAVAILABLE, vat: UNAVAILABLE }),
    })
    renderPage()
    await screen.findByText('RT-0007')

    expect(card(t('dashboard.kpi.sales')).getByText(t('dashboard.notAvailableYet'))).toBeTruthy()
    expect(card(t('dashboard.kpi.sales')).queryByText(/77\.250/)).toBeNull()
    expect(card(t('dashboard.vat.title')).getByText(t('dashboard.notAvailableYet'))).toBeTruthy()
    expect(card(t('dashboard.kpi.receivables')).getByText('812.500')).toBeTruthy()
  })

  it('says "Not available yet" everywhere it cannot read, and never shows a figure', async () => {
    const forbidden = () => json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    answer({ dashboard: forbidden, bills: forbidden, plan: forbidden })
    renderPage()

    await waitFor(() =>
      expect(screen.getAllByText(t('dashboard.notAvailableYet')).length).toBeGreaterThanOrEqual(7),
    )
    expect(document.body.textContent).not.toMatch(/\d+\.\d{3}/)
  })

  it('hides the readiness card on 404, on 403 and when ready', async () => {
    for (const readiness of [
      () => json(404, { type: 'about:blank' }),
      () => json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' }),
      () => json(200, { ready: true, items: [] }),
    ]) {
      resetSharedRequests()
      answer({ readiness })
      const view = renderPage()
      await screen.findByText('RT-0007')
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === URL.readiness)).toBe(true))
      expect(screen.queryByText(t('readiness.title'))).toBeNull()
      view.unmount()
    }
  })

  it('lists what is not ready, links what the company fixes, and waits on Fawtir for the rest', async () => {
    ADMIN.permissions = [...ADMIN.permissions, 'admin.settings.manage']
    answer({
      readiness: () =>
        json(200, {
          ready: false,
          items: [
            { code: 'COMPANY_VERIFIED', status: 'AWAITING_PLATFORM', owner: 'PLATFORM' },
            { code: 'REGISTERED_ADDRESS', status: 'ACTION_REQUIRED', owner: 'COMPANY' },
            { code: 'ACTIVE_BRANCH', status: 'ACTION_REQUIRED', owner: 'COMPANY' },
            { code: 'PARTICIPANT_VERIFIED', status: 'ACTION_REQUIRED', owner: 'COMPANY' },
            { code: 'CONTACT_PHONE', status: 'DONE', owner: 'COMPANY' },
          ],
        }),
    })
    renderPage()

    const section = within(
      (await screen.findByText(t('readiness.title'))).closest('section')!,
    )
    const fixes = section.getAllByRole('link', { name: t('readiness.fix') }).map((link) => link.getAttribute('href'))
    expect(fixes).toEqual(['/settings/company', '/settings/branches/new', '/settings/peppol'])
    expect(section.getByText(t('readiness.awaitingFawtir'))).toBeTruthy()
    expect(section.queryByText(t('readiness.item.CONTACT_PHONE'))).toBeNull()
    ADMIN.permissions = ADMIN.permissions.filter((code) => code !== 'admin.settings.manage')
  })

  it('offers no "Fix this" to a reader who cannot change settings', async () => {
    answer({
      readiness: () =>
        json(200, {
          ready: false,
          items: [{ code: 'REGISTERED_ADDRESS', status: 'ACTION_REQUIRED', owner: 'COMPANY' }],
        }),
    })
    renderPage()

    const section = within(
      (await screen.findByText(t('readiness.title'))).closest('section')!,
    )
    await waitFor(() => expect(section.getByText(t('readiness.actionRequired'))).toBeTruthy())
    expect(section.queryByRole('link', { name: t('readiness.fix') })).toBeNull()
  })

  it('keeps the revenue switch: Month draws the months, Day and Week say "Not available yet"', async () => {
    answer()
    renderPage()
    await screen.findByText('RT-0007')
    const revenue = card(t('dashboard.revenue.title'))
    expect(revenue.queryByText(t('dashboard.notAvailableYet'))).toBeNull()
    revenue.getByRole('tab', { name: t('dashboard.revenue.week') }).click()
    await waitFor(() => expect(revenue.getByText(t('dashboard.notAvailableYet'))).toBeTruthy())
  })

  it('renders in Arabic', async () => {
    await i18n.changeLanguage('ar')
    answer()
    renderPage()

    expect(await screen.findByText(t('dashboard.kpi.sales'))).toBeTruthy()
    expect(t('dashboard.kpi.sales')).not.toBe(i18n.getFixedT('en')('dashboard.kpi.sales'))
    expect(document.body.textContent).not.toContain('Al Bahja')
  })
})

describe('E24: the allowance card while the subscription is read-only', () => {
  const standing = (restriction: string | null, extra: Record<string, unknown> = {}) => ({
    tracked: true,
    access: restriction ? 'PAYMENT_REQUIRED' : 'TRIAL',
    restrictionsEnforced: true,
    restriction,
    today: '2026-10-22',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodPrice: '80.000',
    trialStartsOn: '2026-10-08',
    trialEndsOn: '2026-10-21',
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: null,
    renewsOn: null,
    graceDays: 7,
    graceUntil: null,
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: null,
    enterprise: null,
    ...extra,
  })
  const periodEnds = () => t('dashboard.quota.periodEnds', { date: '31 Oct 2026' })

  it('shows the count and the period end while the subscription is usable', async () => {
    answer({ subscription: () => json(200, standing(null)) })
    renderPage()
    await screen.findByText('RT-0007')
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === URL.subscription)).toBe(true),
    )
    expect(card(t('dashboard.quota.title')).getByText('7')).toBeTruthy()
    expect(card(t('dashboard.quota.title')).getByText(periodEnds())).toBeTruthy()
    expect(screen.queryByText(t('dashboard.quota.readOnly'))).toBeNull()
  })

  it.each([
    ['trial ended unpaid', standing('SUBSCRIPTION_SUSPENDED')],
    ['suspended', standing('SUBSCRIPTION_SUSPENDED', { paidThrough: '2026-10-14', trialEndsOn: null })],
    ['cancelled', standing('SUBSCRIPTION_CANCELLED', { access: 'CANCELLED' })],
  ])('says nothing can be issued instead of a count and period while %s', async (_, status) => {
    answer({ subscription: () => json(200, status) })
    renderPage()
    expect(await screen.findByText(t('dashboard.quota.readOnly'))).toBeTruthy()
    expect(card(t('dashboard.quota.title')).queryByText(periodEnds())).toBeNull()
    expect(card(t('dashboard.quota.title')).queryByText('7')).toBeNull()
  })
})

describe('Dashboard header date', () => {
  it('prints today in the reader’s language, not a fixed sample date', async () => {
    const now = new Date('2026-10-08T06:00:00Z')
    const { unmount } = render(<DashboardHeader now={now} />)
    expect(screen.getByText(/^Thursday,? 8 October 2026$/)).toBeTruthy()
    unmount()

    await i18n.changeLanguage('ar')
    render(<DashboardHeader now={now} />)
    expect(screen.getByText(/أكتوبر/)).toBeTruthy()
  })
})
