import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { resetSharedRequests } from '../../api'
import { PlanPage } from './PlanPage'
import { ExtraDocumentsPage } from './ExtraDocumentsPage'
import { PaidExtrasPage } from './PaidExtrasPage'

/**
 * Settings › Plan while the server says the subscription is read-only (suspended, cancelled, trial
 * ended unpaid). ST-2 (owner, 23 Oct 2026, third message; reverses E28's hiding here): the Plan page
 * stays fully open -- choosing a plan, upgrading, switching cycle and buying extras are all offered,
 * and the server decides; a refusal comes back in its own sentence. Buying extras says the
 * subscription stays read-only until it is paid. "In grace until" is no longer said once grace has
 * ended (E28). The state is the server's `restriction`.
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
const EXTRA_DOCUMENTS = '/api/v1/settings/plan/extra-documents'
const PREVIEW = '/api/v1/settings/plan/changes/preview'

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
/** Fawtir cancelled it at once (CA-7): no plan change online (PC-7, owner, 23 Oct 2026). */
const CANCELLED_BY_FAWTIR = {
  ...CANCELLED,
  cancelledByFawtir: { on: '2026-10-15', message: 'Repeated misuse' },
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

const EXTRA_DOCUMENTS_OVERVIEW = {
  planCode: 'BUSINESS',
  offered: true,
  unitPrice: '0.150',
  minPerPurchase: 10,
  maxPerPurchase: 5000,
  expiresOn: '2026-10-31',
  allowance: {
    periodStart: '2026-10-01', periodEnd: '2026-10-31', resetsOn: '2026-11-01', planDocuments: 1000,
    extraDocuments: 0, totalAllowance: 1000, issued: 412, resubmissions: 0, received: 0,
    receivedHidden: 0, used: 412, planUsed: 412, extraUsed: 0, left: 588, warningPercent: null,
    issuingAllowed: true, extrasExpireOn: '2026-10-31', byBranch: [],
  },
  outstanding: null,
  credits: [],
}

let subscription: unknown
let answers: Record<string, () => Response>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  subscription = ACTIVE
  answers = {
    [PLAN]: () => json(200, OVERVIEW),
    [SUBSCRIPTION]: () => json(200, subscription),
    [PUBLIC_PLANS]: () => json(200, CATALOGUE),
    [CHANGES]: () => json(200, { available: true, pending: null, history: [] }),
    [EXTRAS]: () => json(200, EXTRAS_OVERVIEW),
    [EXTRA_DOCUMENTS]: () => json(200, EXTRA_DOCUMENTS_OVERVIEW),
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

function renderPage(at = '/settings/plan') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/settings/plan" element={<PlanPage />} />
        <Route path="/settings/plan/extra-documents" element={<ExtraDocumentsPage />} />
        <Route path="/settings/plan/extras" element={<PaidExtrasPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const STAYS_READ_ONLY = 'Your subscription stays read-only until it is paid.'

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

// PC-7 (owner, 23 Oct 2026): a company that cancelled itself may choose its plan and cycle again
// once the cancellation has taken effect (the server quotes READ_ONLY_UPGRADE). Before that, while
// it is only "ending", Q6 still holds (keep it first).
describe.each([
  ['suspended', SUSPENDED, true],
  ['trial ended unpaid', TRIAL_ENDED, true],
  ['cancelled by the customer', CANCELLED, true],
])('E28: Settings › Plan while %s', (_, status, moves) => {
  it('hides nothing: buying extras, adding places, switching cycle and moving plan stay (ST-2)', async () => {
    subscription = status
    renderPage()
    await screen.findByRole('link', { name: i18n.t('extraDocuments.entry') })
    await screen.findByRole('heading', { name: 'Business Plus' })
    const shown = actions()
    expect(shown.buyDocuments).toBeTruthy()
    expect(shown.addPlaces).toBeTruthy()
    if (moves) {
      expect(shown.toAnnual).toBeTruthy()
      expect(shown.moveTo.length).toBeGreaterThan(0)
    }
  })

  it('says on Buy extra documents that the subscription stays read-only until paid, in Arabic too', async () => {
    subscription = status
    renderPage('/settings/plan/extra-documents')
    expect(await screen.findByText(STAYS_READ_ONLY)).toBeTruthy()
    await i18n.changeLanguage('ar')
    expect(await screen.findByText('يبقى اشتراكك للقراءة فقط حتى يُدفع.')).toBeTruthy()
  })

  it('says the same on buying extra users and branches', async () => {
    subscription = status
    renderPage('/settings/plan/extras')
    expect(await screen.findByText(STAYS_READ_ONLY)).toBeTruthy()
  })

  it('no longer says "In grace until" once grace has ended', async () => {
    subscription = status
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(screen.queryByText(/In grace until/)).toBeNull()
  })
})

describe('Buying extras while the subscription is usable', () => {
  it('says nothing about read-only', async () => {
    renderPage('/settings/plan/extra-documents')
    await screen.findByText(i18n.t('extraDocuments.buy.title'))
    expect(screen.queryByText(STAYS_READ_ONLY)).toBeNull()
  })
})

const CONTACT_FAWTIR = {
  en: "Your subscription can't be changed online. Please contact Fawtir.",
  ar: 'لا يمكن تغيير اشتراكك عبر الإنترنت. يرجى التواصل مع فوتر.',
}
const FIRST_PAYMENT = {
  en: 'Complete your first payment to choose your plan.',
  ar: 'أكمل دفعتك الأولى لاختيار باقتك.',
}

const refused = (code: string) => () =>
  json(409, {
    type: `https://api.fawtir.om/problems/${code}`,
    title: code,
    status: 409,
    detail: 'English detail',
  })

// PC-7 (owner, 23 Oct 2026, message D): the single "Pay your subscription first, then move up" is
// split in two. A server before its own codes sends plan-upgrade-requires-platform for both.
describe.each([
  ['suspended, refused with the older code', SUSPENDED, 'plan-upgrade-requires-platform', CONTACT_FAWTIR],
  ['never paid, refused with the older code', TRIAL_ENDED, 'plan-upgrade-requires-platform', FIRST_PAYMENT],
  ['never paid', TRIAL_ENDED, 'plan-change-first-payment-required', FIRST_PAYMENT],
  ['cancelled by Fawtir', SUSPENDED, 'plan-change-cancelled-by-fawtir', CONTACT_FAWTIR],
  ['cancelled by Fawtir (subscription code)', SUSPENDED, 'subscription-cancelled-by-fawtir', CONTACT_FAWTIR],
  ['cancelled by the customer, refused anyway', CANCELLED, 'plan-upgrade-requires-platform', CONTACT_FAWTIR],
])('Moving plan while %s', (_, status, code, wording) => {
  it("words the server's refusal in English and Arabic, never its detail", async () => {
    subscription = status
    answers[PREVIEW] = refused(code)
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    await userEvent.click(screen.getAllByRole('button', { name: /Move to/ })[0])
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(wording.en)).toBeTruthy()
    expect(within(dialog).queryByText('English detail')).toBeNull()
    expect(within(dialog).queryByText(/then move up/)).toBeNull()
    await i18n.changeLanguage('ar')
    expect(await within(dialog).findByText(wording.ar)).toBeTruthy()
  })
})

describe('Settings › Plan for a subscription Fawtir cancelled (PC-7)', () => {
  it('offers no plan or cycle change online', async () => {
    subscription = CANCELLED_BY_FAWTIR
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    const shown = actions()
    expect(shown.toAnnual).toBeNull()
    expect(shown.moveTo).toHaveLength(0)
  })
})

describe('Settings › Plan for a subscription the customer cancelled (PC-7)', () => {
  it('still offers no move while it is only ending (Q6: keep it first)', async () => {
    subscription = { ...ACTIVE, cancelAtPeriodEnd: true, accessEndsOn: '2026-10-31' }
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(actions().moveTo).toHaveLength(0)
  })
})
