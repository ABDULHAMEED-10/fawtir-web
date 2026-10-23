import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { PlanPage } from './PlanPage'

/**
 * Business Rules AL-9 on Plan and usage: the plan's documents and the extras apart, issued and
 * received apart, per branch and in total, every figure the server's `allowance`
 * (`GET /v1/settings/plan`, plan v4 §6), and the branches adding up to the company total.
 */
const READER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PUBLIC_PLANS = '/api/v1/public/plans'

const NOT_TRACKED = {
  tracked: false, access: 'NOT_TRACKED', restrictionsEnforced: false, today: '2026-10-08', planCode: 'STARTER',
  planName: 'Starter', billingCycle: null, periodPrice: '35.000', trialStartsOn: null, trialEndsOn: null,
  trialDay: null, trialDaysLeft: null, paidThrough: null, renewsOn: null, graceDays: 7, graceUntil: null,
  autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null, cancelAtPeriodEnd: false,
  accessEndsOn: null, scheduledChange: null,
}

/** Plan v4 §6's own example: "Plan 200, used 200 (150 issued, 50 received) · Extra this month 0". */
const ALLOWANCE = {
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  resetsOn: '2026-11-01',
  planDocuments: 200,
  extraDocuments: 0,
  totalAllowance: 200,
  issued: 150,
  resubmissions: 1,
  received: 50,
  receivedHidden: 0,
  used: 200,
  planUsed: 200,
  extraUsed: 0,
  left: 0,
  warningPercent: 100,
  issuingAllowed: false,
  extrasExpireOn: '2026-10-31',
  byBranch: [
    { branchId: 'b-1', branchName: 'Muscat', issued: 120, received: 0, total: 120 },
    { branchId: 'b-2', branchName: 'Salalah', issued: 28, received: 0, total: 28 },
    { branchId: null, branchName: null, issued: 2, received: 50, total: 52 },
  ],
}

const OVERVIEW = {
  plan: { code: 'STARTER', name: 'Starter', invoicesPerMonth: 200, peopleIncluded: 3, branchesIncluded: 2 },
  // The issued-only figure an older reading showed; the allowance is what the screen must use.
  usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-08' }, used: 150, resubmissions: 1, quota: 200, raisedToday: 5 },
  activePeople: 2,
  openInvitations: 0,
  activeBranches: 2,
  allowance: ALLOWANCE,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let answers: Record<string, () => Response>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  answers = {
    [PLAN]: () => json(200, OVERVIEW),
    [SUBSCRIPTION]: () => json(200, NOT_TRACKED),
    [PUBLIC_PLANS]: () => json(200, []),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, READER)
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPlan() {
  return render(
    <MemoryRouter initialEntries={['/settings/plan']}>
      <Routes>
        <Route path="/settings/plan" element={<PlanPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div')!

describe('AL-9: usage split on Plan and usage', () => {
  it('counts issued and received together in the headline, and shows the plan and extras apart', async () => {
    renderPlan()
    await screen.findByText('Your plan: Starter')
    // 150 issued plus 50 received: the headline reads the allowance, not the issued-only usage.
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('200')
    expect(screen.getByText(/of 200 documents/)).toBeTruthy()
    expect(screen.getByText('0 left')).toBeTruthy()
    expect(screen.getByText(/Resets on 1 Nov 2026/)).toBeTruthy()
    expect(within(stat('Plan documents')).getByText('200 of 200 used')).toBeTruthy()
    expect(within(stat('Extra this month')).getByText('0')).toBeTruthy()
    expect(within(stat('Extra this month')).getByText('None added this month')).toBeTruthy()
    expect(within(stat('Issued')).getByText('150')).toBeTruthy()
    expect(within(stat('Received')).getByText('50')).toBeTruthy()
    // A resend is of an issued document: one of the 150, not of the 200.
    expect(screen.getByText('1 of the 150')).toBeTruthy()
  })

  it('lists every branch, the received ones on "No branch", adding up to the company total', async () => {
    renderPlan()
    const section = (await screen.findByRole('heading', { name: 'Usage by branch' })).closest('section')!
    const rows = within(section).getAllByRole('row')
    const text = rows.map((row) => row.textContent)
    expect(text[1]).toBe('Muscat1200120')
    expect(text[2]).toBe('Salalah28028')
    expect(text[3]).toContain('No branch')
    expect(text[3]).toContain('Received documents, and documents issued without a branch')
    expect(text[3]?.endsWith('25052')).toBe(true)
    expect(text[4]).toBe('Company total15050200')
    const sum = ALLOWANCE.byBranch.reduce((total, row) => total + row.total, 0)
    expect(sum).toBe(ALLOWANCE.used)
  })

  it('shows extras with their end date, and how many received documents are waiting to open', async () => {
    answers[PLAN] = () =>
      json(200, {
        ...OVERVIEW,
        allowance: { ...ALLOWANCE, extraDocuments: 50, totalAllowance: 250, extraUsed: 10, used: 210, left: 40, received: 60, receivedHidden: 12 },
      })
    renderPlan()
    await screen.findByText('Your plan: Starter')
    expect(within(stat('Extra this month')).getByText('10 of 50 used')).toBeTruthy()
    expect(within(stat('Extra this month')).getByText('Extras end on 31 Oct 2026')).toBeTruthy()
    expect(within(stat('Received')).getByText('12 more are waiting to open')).toBeTruthy()
    expect(screen.getByText(/of 250 documents/)).toBeTruthy()
  })

  it('shows the usage alone, with no split or branch table, when the server sends no allowance', async () => {
    const { allowance: _ignored, ...older } = OVERVIEW
    void _ignored
    answers[PLAN] = () => json(200, older)
    renderPlan()
    await screen.findByText('Your plan: Starter')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('150')
    expect(screen.queryByText('Plan documents')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Usage by branch' })).toBeNull()
  })

  it('is in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    renderPlan()
    expect(await screen.findByRole('heading', { name: i18n.t('plan.byBranch.title') })).toBeTruthy()
    expect(screen.getByText(i18n.t('plan.byBranch.noBranch'))).toBeTruthy()
    expect(screen.getByText(i18n.t('plan.split.plan'))).toBeTruthy()
    expect(i18n.t('plan.byBranch.title')).not.toBe('plan.byBranch.title')
  })
})

describe('AL-8: the allowance warning on Plan and usage', () => {
  it('says at 100% that issuing stops and received documents are held until extras are bought', async () => {
    renderPlan()
    const warning = (await screen.findByText("You have used all of this period's documents.")).closest('p')!
    expect(warning.textContent).toContain('200 of 200')
    expect(warning.textContent).toContain(
      'Issuing has stopped, and the supplier documents you receive are held until extra documents are bought.',
    )
  })

  it('warns at 80% and 90% that received documents count too', async () => {
    answers[PLAN] = () =>
      json(200, { ...OVERVIEW, allowance: { ...ALLOWANCE, used: 180, planUsed: 180, left: 20, warningPercent: 90 } })
    renderPlan()
    const warning = (await screen.findByText("You have used 90% of this period's documents.")).closest('p')!
    expect(warning.textContent).toContain('supplier documents you receive count too')
  })

  it('draws no warning below 80%, or with no allowance', async () => {
    answers[PLAN] = () =>
      json(200, { ...OVERVIEW, allowance: { ...ALLOWANCE, used: 100, planUsed: 100, left: 100, warningPercent: null } })
    renderPlan()
    await screen.findByText('Your plan: Starter')
    expect(screen.queryByText(/of this period's documents\./)).toBeNull()
  })
})

describe('US-1, BR-3, ER-1: paid places and the add-on on Plan and usage', () => {
  const EXTRAS = '/api/v1/settings/plan/extras'
  const kind = (included: number, inUse: number, paid: number) => ({
    included, inUse, paidPlacesNow: paid, capacity: included + paid, unitMonthlyPrice: '2.500', offered: true,
  })
  const extras = (erpAddon: Record<string, unknown>) => ({
    open: true, users: kind(5, 5, 1), branches: kind(2, 2, 0), erpAddon, maxUsersPerOrder: 50,
    maxBranchesPerOrder: 20, outstanding: null, places: [],
  })

  it('shows users and branches against included plus paid places, and no add-on where the plan has none', async () => {
    answers[EXTRAS] = () => json(200, extras({ offered: false, monthlyPrice: null, status: null, endsOn: null }))
    renderPlan()
    expect(await screen.findByText(i18n.t('paidExtras.places.inUseOf', { inUse: '5', capacity: '6' }))).toBeTruthy()
    expect(screen.getByText(i18n.t('paidExtras.places.split', { included: '5', paid: '1' }))).toBeTruthy()
    // A reader is shown the places, not offered to buy them.
    expect(screen.getByRole('link', { name: i18n.t('paidExtras.planCard.view') }).getAttribute('href')).toBe(
      '/settings/plan/extras',
    )
    expect(screen.queryByText(i18n.t('plan.addons.title'))).toBeNull()
  })

  it('shows the add-on with its price and state where the plan offers it', async () => {
    answers[EXTRAS] = () => json(200, extras({ offered: true, monthlyPrice: '20.000', status: 'ACTIVE', endsOn: null }))
    renderPlan()
    expect(await screen.findByText(i18n.t('paidExtras.addon.status.ACTIVE'))).toBeTruthy()
    expect(screen.getByText('20.000')).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('paidExtras.planCard.manageAddon') }).getAttribute('href')).toBe(
      '/settings/plan/extras',
    )
  })

  it('keeps the earlier add-on card when the server has no paid-extras read', async () => {
    renderPlan()
    expect(await screen.findByText(i18n.t('plan.addons.state.managedByFawtir'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('paidExtras.planCard.title'))).toBeNull()
  })
})

describe('Plan and usage: today by branch and last month (SETTINGS.md rows 5.4, 5.5)', () => {
  const withUsage = (extra: Record<string, unknown>) => () =>
    json(200, { ...OVERVIEW, usage: { ...OVERVIEW.usage, ...extra } })

  it('splits "Raised today" by branch and shows last month against the plan then', async () => {
    answers[PLAN] = withUsage({
      raisedTodayByBranch: [
        { branchId: 'b-1', branchName: 'Muscat', count: 3 },
        { branchId: 'b-2', branchName: 'Nizwa', count: 1 },
        { branchId: null, branchName: null, count: 1 },
      ],
      lastMonthUsed: 16,
      lastMonthQuota: 10,
    })
    renderPlan()
    await screen.findByText('Your plan: Starter')
    expect(within(stat('Raised today')).getByText('Muscat 3 · Nizwa 1 · No branch 1')).toBeTruthy()
    expect(within(stat('Raised today')).queryByText('By branch: not available yet')).toBeNull()
    expect(within(stat('Last month')).getByText('16')).toBeTruthy()
    expect(within(stat('Last month')).getByText('Plan allowance then: 10')).toBeTruthy()
    expect(within(stat('Last month')).queryByText('Not available yet')).toBeNull()
  })

  it('shows a quiet day with no branch note, and a first month as 0', async () => {
    answers[PLAN] = withUsage({ raisedToday: 0, raisedTodayByBranch: [], lastMonthUsed: 0, lastMonthQuota: 200 })
    renderPlan()
    await screen.findByText('Your plan: Starter')
    expect(within(stat('Raised today')).queryByText('By branch: not available yet')).toBeNull()
    expect(within(stat('Last month')).getByText('0')).toBeTruthy()
  })

  it('names each branch in Arabic for an Arabic reader, as every other screen does (BR-1)', async () => {
    await i18n.changeLanguage('ar')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/v1/me/entitlements') {
          return json(200, { ...READER, permissions: ['tenant.plan.read', 'branch.manage'] })
        }
        if (url === '/api/v1/branches/overview') {
          return json(200, {
            openCount: 2,
            everCount: 2,
            branches: [
              { id: 'b-1', code: 'MCT', name: 'Muscat', nameAr: 'مسقط', active: true },
              { id: 'b-2', code: 'NZW', name: 'Nizwa', nameAr: 'نزوى', active: true },
            ],
          })
        }
        const answer = answers[url]
        return answer ? answer() : json(404, { type: 'about:blank' })
      }),
    )
    answers[PLAN] = withUsage({
      raisedTodayByBranch: [
        { branchId: 'b-1', branchName: 'Muscat', count: 3 },
        { branchId: 'b-2', branchName: 'Nizwa', count: 1 },
        { branchId: null, branchName: null, count: 1 },
      ],
    })
    try {
      renderPlan()
      const raisedToday = await screen.findByText(i18n.t('plan.stat.raisedToday'), { selector: 'dt' })
      const note = `مسقط 3 · نزوى 1 · ${i18n.t('plan.byBranch.noBranch')} 1`
      await vi.waitFor(() =>
        expect(within(raisedToday.closest('div')!).getByText(note)).toBeTruthy(),
      )
      expect(within(raisedToday.closest('div')!).queryByText(/Muscat|Nizwa/)).toBeNull()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('keeps "not available yet" for a server without the figures', async () => {
    renderPlan()
    await screen.findByText('Your plan: Starter')
    expect(within(stat('Raised today')).getByText('By branch: not available yet')).toBeTruthy()
    expect(within(stat('Last month')).getByText('Not available yet')).toBeTruthy()
  })
})
