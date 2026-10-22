import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { resetSharedRequests } from '../../api'
import { PlanPage } from './PlanPage'

/**
 * E28 (22 Oct 2026), plan v4 §8 and §11: while the server says the subscription is read-only
 * (suspended, cancelled, trial ended unpaid, not started), Settings › Plan hides what cannot be
 * done -- buying extra documents, adding users or branches, switching cycle, moving plan -- and
 * no longer says "In grace until" once grace has ended. The state is the server's `restriction`.
 */
const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PUBLIC_PLANS = '/api/v1/public/plans'
const CHANGES = '/api/v1/settings/plan/changes'
const EXTRAS = '/api/v1/settings/plan/extras'

const ACTIVE = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: true,
  restriction: null,
  today: '2026-10-22',
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodPrice: '80.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-10-31',
  renewsOn: '2026-11-01',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
  enterprise: null,
}
const LAPSED = { paidThrough: '2026-10-14', renewsOn: '2026-10-15', graceUntil: '2026-10-21' }
const GRACE = { ...ACTIVE, ...LAPSED, access: 'GRACE' }
const SUSPENDED = {
  ...ACTIVE,
  ...LAPSED,
  access: 'PAYMENT_REQUIRED',
  restriction: 'SUBSCRIPTION_SUSPENDED',
}
const TRIAL_ENDED = {
  ...ACTIVE,
  access: 'PAYMENT_REQUIRED',
  restriction: 'SUBSCRIPTION_SUSPENDED',
  trialStartsOn: '2026-10-08',
  trialEndsOn: '2026-10-21',
  paidThrough: null,
  renewsOn: null,
}
const CANCELLED = {
  ...ACTIVE,
  ...LAPSED,
  access: 'CANCELLED',
  restriction: 'SUBSCRIPTION_CANCELLED',
  cancelAtPeriodEnd: true,
  accessEndsOn: '2026-10-14',
}
/** Suspended by its dates, but the server's restriction switch is off: nothing is hidden. */
const SWITCH_OFF = { ...SUSPENDED, restrictionsEnforced: false, restriction: null }

const OVERVIEW = {
  plan: {
    code: 'BUSINESS',
    name: 'Business',
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    branchesIncluded: 2,
    monthlyPrice: '80.000',
    overagePricePerInvoice: '0.150',
  },
  usage: {
    period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-22' },
    used: 412,
    resubmissions: 0,
    quota: 1000,
    raisedToday: 3,
  },
  activePeople: 3,
  openInvitations: 0,
  activeBranches: 2,
}

const catalogued = (code: string, nameEn: string, monthlyPrice: string, sortOrder: number) => ({
  code,
  nameEn,
  nameAr: null,
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  priceVersionId: `v-${code}`,
  monthlyPrice,
  annualPrice: '0.000',
  annualFreeMonths: 2,
  invoicesPerMonth: 1000,
  peopleIncluded: 3,
  extraPersonPrice: null,
  branchesIncluded: null,
  extraBranchPrice: null,
  overagePricePerInvoice: null,
  apiAccess: false,
  prioritySupport: false,
  recommended: false,
  trialDays: 14,
  trialDocuments: null,
  features: [],
  sortOrder,
})
const CATALOGUE = [
  catalogued('STARTER', 'Starter', '35.000', 1),
  catalogued('BUSINESS', 'Business', '80.000', 2),
  catalogued('BUSINESS_PLUS', 'Business Plus', '150.000', 3),
]

const kind = (over: Record<string, unknown> = {}) => ({
  included: 5,
  inUse: 5,
  paidPlacesNow: 0,
  capacity: 5,
  unitMonthlyPrice: '2.500',
  offered: true,
  ...over,
})
const EXTRAS_OVERVIEW = {
  open: true,
  users: kind(),
  branches: kind({ included: 2, inUse: 2, capacity: 2, unitMonthlyPrice: '5.000' }),
  erpAddon: { offered: false, monthlyPrice: null, status: null, endsOn: null },
  maxUsersPerOrder: 50,
  maxBranchesPerOrder: 20,
  outstanding: null,
  places: [],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let subscription: unknown

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  subscription = ACTIVE
  const answers: Record<string, () => Response> = {
    [PLAN]: () => json(200, OVERVIEW),
    [SUBSCRIPTION]: () => json(200, subscription),
    [PUBLIC_PLANS]: () => json(200, CATALOGUE),
    [CHANGES]: () => json(200, { available: true, pending: null, history: [] }),
    [EXTRAS]: () => json(200, EXTRAS_OVERVIEW),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
      const answer = answers[String(url).split('?')[0]]
      return answer ? answer() : json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  forgetSubscriptionStanding()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/plan']}>
      <Routes>
        <Route path="/settings/plan" element={<PlanPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const actions = () => ({
  buyDocuments: screen.queryByRole('link', { name: i18n.t('extraDocuments.entry') }),
  addPlaces: screen.queryByRole('link', { name: i18n.t('paidExtras.planCard.entry') }),
  toAnnual: screen.queryByRole('button', { name: i18n.t('planChange.toAnnual') }),
  moveTo: screen.queryAllByRole('button', { name: /Move to/ }),
})

describe('E28: Settings › Plan while the subscription is usable', () => {
  it('offers every action the owner may take', async () => {
    renderPage()
    await screen.findByRole('button', { name: i18n.t('planChange.toAnnual') })
    const shown = actions()
    expect(shown.buyDocuments).toBeTruthy()
    expect(shown.addPlaces).toBeTruthy()
    expect(shown.moveTo.length).toBeGreaterThan(0)
  })

  it('still says "In grace until" while the server reports grace', async () => {
    subscription = GRACE
    renderPage()
    expect(
      await screen.findByText(i18n.t('subscription.fact.graceUntil', { date: '21 Oct 2026' })),
    ).toBeTruthy()
  })

  it('hides nothing with the server restriction switch off', async () => {
    subscription = SWITCH_OFF
    renderPage()
    await screen.findByRole('button', { name: i18n.t('planChange.toAnnual') })
    expect(actions().buyDocuments).toBeTruthy()
  })
})

describe.each([
  ['suspended', SUSPENDED],
  ['trial ended unpaid', TRIAL_ENDED],
  ['cancelled', CANCELLED],
])('E28: Settings › Plan while %s', (_, status) => {
  it('hides buying extras, adding places, switching cycle and moving plan', async () => {
    subscription = status
    renderPage()
    // The places card stays, as a view of what is in use.
    expect(
      await screen.findByRole('link', { name: i18n.t('paidExtras.planCard.view') }),
    ).toBeTruthy()
    await screen.findByRole('heading', { name: 'Business Plus' })
    const shown = actions()
    expect(shown.buyDocuments).toBeNull()
    expect(shown.addPlaces).toBeNull()
    expect(shown.toAnnual).toBeNull()
    expect(shown.moveTo).toHaveLength(0)
  })

  it('no longer says "In grace until" once grace has ended', async () => {
    subscription = status
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(screen.queryByText(/In grace until/)).toBeNull()
  })
})
