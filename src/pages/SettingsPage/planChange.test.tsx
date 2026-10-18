import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { resetSharedRequests } from '../../api'
import { resetLeftFawtirRefusal } from '../../lib/leftFawtirRefusal'
import { PlanPage } from './PlanPage'

/**
 * Settings › Plan: self-service plan and billing-cycle changes (backend P2-2). The Business Rules
 * plan-change table, PC-1 (what a smaller plan takes away, before confirming), PC-2 (monthly to
 * yearly at once, yearly to monthly at the year end), PC-4 ("includes today"), PY-2 (every amount
 * the server's) and D3 (keeping the plan after a downgrade paid early, `KEEP_PLAN`). Behind the
 * server's switch: while it is off nothing new is shown.
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
const READER: Entitlements = { ...MANAGER, permissions: ['tenant.plan.read'] } as Entitlements

const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PUBLIC_PLANS = '/api/v1/public/plans'
const CHANGES = '/api/v1/settings/plan/changes'
const PREVIEW = `${CHANGES}/preview`
const REQUEST = `POST ${CHANGES}`
const BILLING = '/api/v1/settings/billing'

const ACTIVE = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: false,
  today: '2026-10-11',
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

const OVERVIEW = {
  plan: {
    code: 'BUSINESS',
    name: 'Business',
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    branchesIncluded: 2,
    monthlyPrice: '80.000',
  },
  usage: {
    period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-11' },
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

const side = (planCode: string, planName: string, cycle: string, periodPrice: string) => ({
  planCode,
  planName,
  planVersionId: `pv-${planCode}`,
  cycle,
  periodPrice,
})

/**
 * Odd figures on purpose: 70.000 for 21 of 31 days is 47.419, so a screen printing 47.111 can only
 * be showing the server's amount (PY-2).
 */
function upgrade(over: Record<string, unknown> = {}) {
  return {
    kind: 'UPGRADE',
    applies: 'AT_ONCE_WHEN_PAID',
    effectiveOn: '2026-10-11',
    from: side('BUSINESS', 'Business', 'MONTHLY', '80.000'),
    to: side('BUSINESS_PLUS', 'Business Plus', 'MONTHLY', '150.000'),
    charge: {
      windowStartsOn: '2026-10-11',
      windowEndsOn: '2026-10-31',
      daysLeft: 21,
      includesToday: true,
      periods: [
        {
          startsOn: '2026-10-01',
          endsOn: '2026-10-31',
          totalDays: 31,
          remainingDays: 21,
          fromPrice: '80.000',
          toPrice: '150.000',
          amount: '47.111',
        },
      ],
      credit: '0.000',
      extras: [],
      subtotal: '47.111',
      vatRate: '0.05000',
      vatAmount: '2.356',
      total: '49.467',
      currency: 'OMR',
      newPaidThrough: null,
    },
    cycleChangeOn: null,
    subscriptionDate: 1,
    allowance: { now: 1000, used: 412, afterChange: 3000 },
    lostFeatures: [],
    erpAddonStops: false,
    users: null,
    branches: null,
    blockers: [],
    ...over,
  }
}

function downgrade(over: Record<string, unknown> = {}) {
  return {
    kind: 'DOWNGRADE',
    applies: 'ON_DATE',
    effectiveOn: '2026-11-01',
    from: side('BUSINESS', 'Business', 'MONTHLY', '80.000'),
    to: side('STARTER', 'Starter', 'MONTHLY', '35.000'),
    charge: null,
    cycleChangeOn: null,
    subscriptionDate: 1,
    allowance: { now: 1000, used: 412, afterChange: 200 },
    lostFeatures: ['approvals', 'stock', 'somethingNew'],
    erpAddonStops: true,
    users: { included: 2, inUse: 3, overBy: 1, defaultSwitchOff: ['u-9'] },
    branches: { included: 1, inUse: 2, overBy: 1, defaultSwitchOff: ['b-2'] },
    blockers: [],
    ...over,
  }
}

function annual(over: Record<string, unknown> = {}) {
  return upgrade({
    kind: 'CYCLE_TO_ANNUAL',
    to: side('BUSINESS', 'Business', 'ANNUAL', '800.000'),
    charge: {
      windowStartsOn: '2026-10-11',
      windowEndsOn: '2027-09-30',
      daysLeft: 355,
      includesToday: true,
      periods: [],
      credit: '80.000',
      extras: [
        {
          type: 'USER',
          count: 1,
          annualUnitPrice: '25.000',
          credit: '2.500',
          amount: '22.500',
          coversFrom: '2026-11-01',
          coversTo: '2027-09-30',
        },
      ],
      subtotal: '742.500',
      vatRate: '0.05000',
      vatAmount: '37.125',
      total: '779.625',
      currency: 'OMR',
      newPaidThrough: '2027-09-30',
    },
    allowance: { now: 1000, used: 412, afterChange: 1000 },
    ...over,
  })
}

const BILL = {
  id: 'b-pc',
  number: 'FWT-SUB-2026-000061',
  planCode: 'BUSINESS_PLUS',
  planName: 'Business Plus',
  billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-11',
  periodEndsOn: '2026-10-31',
  subtotal: '47.111',
  vatRate: '0.05000',
  vatAmount: '2.356',
  total: '49.467',
  currency: 'OMR',
  taxDocumentStatus: 'NOT_A_TAX_INVOICE',
  status: 'OPEN',
  dueOn: '2026-10-11',
  issuedAt: '2026-10-11T08:00:00Z',
  paidAt: null,
  appliedPaidThrough: null,
  voidReason: null,
  version: 0,
}

const PENDING = {
  id: 'pc-1',
  kind: 'UPGRADE',
  status: 'PENDING_PAYMENT',
  applies: 'AT_ONCE_WHEN_PAID',
  effectiveOn: '2026-10-11',
  fromPlanCode: 'BUSINESS',
  fromCycle: 'MONTHLY',
  toPlanCode: 'BUSINESS_PLUS',
  toPlanVersionId: 'pv-BUSINESS_PLUS',
  toCycle: 'MONTHLY',
  cycleChangeOn: null,
  windowStartsOn: '2026-10-11',
  windowEndsOn: '2026-10-31',
  daysLeft: 21,
  newPaidThrough: null,
  credit: '0.000',
  net: '47.111',
  bill: BILL,
  requestedAt: '2026-10-11T08:00:00Z',
  closedAt: null,
  closeReason: null,
}

const BILLING_OVERVIEW = {
  bills: [
    {
      bill: BILL,
      payments: [],
      card: { available: true, purpose: 'SUBSCRIPTION_UPGRADE', reason: null },
      kind: 'PLAN_CHANGE',
    },
  ],
  nextBillsCursor: null,
  beneficiary: {
    legalName: 'Fawtir LLC',
    bankName: 'Bank Muscat',
    iban: 'OM810180000001299123456',
    swiftCode: 'BMUSOMMX',
  },
  methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true, card: true },
  proofMaximumBytes: 1000000,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

function problem(status: number, slug: string, extra: Record<string, unknown> = {}) {
  return json(status, {
    type: `https://api.fawtir.om/problems/${slug}`,
    title: slug,
    status,
    detail: 'English detail',
    ...extra,
  })
}

let me: Entitlements
let answers: Record<string, (url: string, init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  resetLeftFawtirRefusal()
  forgetEntitlements()
  forgetSubscriptionStanding()
  me = MANAGER
  answers = {
    [PLAN]: () => json(200, OVERVIEW),
    [SUBSCRIPTION]: () => json(200, ACTIVE),
    [PUBLIC_PLANS]: () => json(200, CATALOGUE),
    [CHANGES]: () => json(200, { available: true, pending: null, history: [] }),
    [PREVIEW]: (url) => {
      const query = new URL(url, 'http://x').searchParams
      if (query.get('planCode') === 'STARTER') return json(200, downgrade())
      if (query.get('billingCycle') === 'ANNUAL') return json(200, annual())
      return json(200, upgrade())
    },
    [REQUEST]: () => json(201, PENDING),
    [BILLING]: () => json(200, BILLING_OVERVIEW),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, me)
    const method = init?.method ?? 'GET'
    const path = String(url).split('?')[0]
    const answer = answers[method === 'GET' ? path : `${method} ${path}`]
    return answer ? answer(String(url), init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

function calls(key: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const method = (init as RequestInit | undefined)?.method ?? 'GET'
    const path = String(url).split('?')[0]
    return (method === 'GET' ? path : `${method} ${path}`) === key
  })
}

const moveTo = (plan: string) =>
  screen.findByRole('button', { name: i18n.t('planChange.moveTo', { plan }) })
const dialog = () => screen.findByRole('dialog')
/** A sentence whose amount carries the rial sign, so its text is split across elements. */
const sentence = (pattern: RegExp) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && pattern.test(element.textContent ?? '')

describe('Plan changes: behind the server switch', () => {
  it('shows nothing new while the switch is off: no move buttons, the old wording, no preview', async () => {
    answers[CHANGES] = () => json(200, { available: false, pending: null, history: [] })
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(screen.getByText(/To change your plan, contact the Fawtir team/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('planChange.toAnnual') })).toBeNull()
    expect(calls(PREVIEW)).toHaveLength(0)
  })

  it('falls back the same way on a server without the routes (404)', async () => {
    delete answers[CHANGES]
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(screen.getByText(/To change your plan, contact the Fawtir team/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
  })

  it('offers no move to someone who may only read the plan', async () => {
    me = READER
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
    expect(screen.queryByText(i18n.t('planChange.rule'))).toBeNull()
  })

  it('keeps the Enterprise notice and offers no self-service move (D4)', async () => {
    answers[PLAN] = () => json(200, { ...OVERVIEW, enterprise: { termsSet: true } })
    answers[SUBSCRIPTION] = () => json(200, { ...ACTIVE, enterprise: { termsSet: true } })
    renderPage()
    expect(await screen.findByText(i18n.t('plan.enterprise.agreed'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
  })

  it('hides the moves while the subscription is ending (Q6: keep it first)', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, { ...ACTIVE, cancelAtPeriodEnd: true, accessEndsOn: '2026-10-31' })
    renderPage()
    await screen.findByRole('heading', { name: 'Business Plus' })
    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
  })
})

describe('Plan changes: an upgrade (plan-change table, PC-4, PY-2)', () => {
  it('shows the server\'s charge for the days left, with "includes today", and nothing it worked out itself', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect((await box.findAllByText('47.111')).length).toBeGreaterThan(0)
    expect(box.getAllByText('2.356').length).toBeGreaterThan(0)
    expect(box.getAllByText('49.467').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/47\.419/)
    expect(
      box.getByText(
        sentence(/49\.467 now for the 21 days left until 31 Oct 2026 \(includes today\)/),
      ),
    ).toBeTruthy()
    expect(
      box.getByText(i18n.t('planChange.fact.allowanceAtOnce', { after: '3,000', used: '412' })),
    ).toBeTruthy()
    expect(box.getByText(i18n.t('planChange.fact.withdrawUntilPaid'))).toBeTruthy()
    expect(String(calls(PREVIEW).at(-1)?.[0])).toBe(
      `${PREVIEW}?planCode=BUSINESS_PLUS&billingCycle=MONTHLY`,
    )
  })

  it('confirms with the shown total, the version and an idempotency key, then shows the bill to pay', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await moveTo('Business Plus'))
    await within(await dialog()).findAllByText('49.467')
    answers[CHANGES] = () => json(200, { available: true, pending: PENDING, history: [] })
    await user.click(
      screen.getByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    )
    await waitFor(() => expect(calls(REQUEST)).toHaveLength(1))
    const init = calls(REQUEST)[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      planCode: 'BUSINESS_PLUS',
      billingCycle: 'MONTHLY',
      expectedTotal: '49.467',
      expectedPlanVersionId: 'pv-BUSINESS_PLUS',
    })
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^plan-change-/)
    expect(await screen.findByText(i18n.t('planChange.done.billIssued'))).toBeTruthy()
    // The bill is paid with the same form as Bills and payment; no move is offered meanwhile.
    expect(await screen.findByText(i18n.t('planChange.pending.title'))).toBeTruthy()
    expect(
      await screen.findByText(i18n.t('planChange.pending.line.UPGRADE', { plan: 'Business Plus' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('billing.method.CASH.title'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
  })

  it('shows the new figures when the price moved, and confirms them with a fresh key (SU-4)', async () => {
    const user = userEvent.setup({ delay: null })
    const moved = upgrade({
      charge: { ...upgrade().charge, total: '52.000', vatAmount: '2.476', subtotal: '49.524' },
    })
    answers[REQUEST] = () => problem(409, 'plan-change-quote-changed', { preview: moved })
    renderPage()
    await user.click(await moveTo('Business Plus'))
    await within(await dialog()).findAllByText('49.467')
    await user.click(
      screen.getByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    )
    expect(await screen.findByText(i18n.t('planChange.dialog.priceChanged'))).toBeTruthy()
    expect(screen.getAllByText('52.000').length).toBeGreaterThan(0)
    answers[REQUEST] = () => json(201, PENDING)
    await user.click(
      screen.getByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    )
    await waitFor(() => expect(calls(REQUEST)).toHaveLength(2))
    const [first, second] = calls(REQUEST).map(([, init]) => init as RequestInit)
    expect(JSON.parse(String(second.body)).expectedTotal).toBe('52.000')
    const key = (init: RequestInit) => (init.headers as Record<string, string>)['Idempotency-Key']
    expect(key(second)).not.toBe(key(first))
  })

  it('names each blocker in our own words and offers no confirm (enterprise-terms-scheduled-by-fawtir)', async () => {
    const user = userEvent.setup({ delay: null })
    answers[PREVIEW] = () =>
      json(
        200,
        upgrade({ blockers: ['enterprise-terms-scheduled-by-fawtir', 'billing-not-configured'] }),
      )
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect(
      await box.findByText(i18n.t('planChange.refusal.enterprise-terms-scheduled-by-fawtir')),
    ).toBeTruthy()
    expect(box.getByText(i18n.t('planChange.refusal.billing-not-configured'))).toBeTruthy()
    expect(
      box.queryByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeNull()
    expect(document.body.textContent).not.toMatch(/English detail|enterprise-terms-scheduled/)
  })

  it('says the change is not available when the preview is refused, never the server text', async () => {
    const user = userEvent.setup({ delay: null })
    answers[PREVIEW] = () => problem(409, 'plan-change-unavailable')
    renderPage()
    await user.click(await moveTo('Business Plus'))
    expect(
      await within(await dialog()).findByText(i18n.t('planChange.refusal.plan-change-unavailable')),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/English detail/)
  })
})

describe('Plan changes: a downgrade (PC-1)', () => {
  it('shows the date, the features lost in words, the ERP add-on stopping and who goes over the new plan', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await moveTo('Starter'))
    const box = within(await dialog())
    expect(
      await box.findByText(
        i18n.t('planChange.kind.DOWNGRADE', {
          from: 'Business',
          to: 'Starter',
          date: '1 Nov 2026',
        }),
      ),
    ).toBeTruthy()
    expect(box.getByText(en.plan.featureName.approvals)).toBeTruthy()
    expect(box.getByText(en.plan.featureName.stock)).toBeTruthy()
    // A key the web has no words for is never shown as a code.
    expect(box.getByText(i18n.t('planChange.loss.otherFeatures'))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/somethingNew/)
    expect(box.getByText(i18n.t('planChange.loss.erp', { date: '1 Nov 2026' }))).toBeTruthy()
    expect(
      box.getByText(
        i18n.t('planChange.loss.users', {
          count: 1,
          plan: 'Starter',
          included: '2',
          inUse: '3',
          n: '1',
          date: '1 Nov 2026',
        }),
      ),
    ).toBeTruthy()
    expect(
      box.getByText(
        i18n.t('planChange.loss.branches', {
          count: 1,
          plan: 'Starter',
          included: '1',
          inUse: '2',
          n: '1',
          date: '1 Nov 2026',
        }),
      ),
    ).toBeTruthy()
    expect(
      box.getByText(i18n.t('planChange.fact.withdrawBefore', { date: '1 Nov 2026' })),
    ).toBeTruthy()
  })

  it('schedules it without a total, and the page then reads the subscription again', async () => {
    const user = userEvent.setup({ delay: null })
    answers[REQUEST] = () =>
      json(201, {
        ...PENDING,
        id: null,
        kind: 'DOWNGRADE',
        status: null,
        applies: 'ON_DATE',
        effectiveOn: '2026-11-01',
        toPlanCode: 'STARTER',
        bill: null,
      })
    renderPage()
    await user.click(await moveTo('Starter'))
    await within(await dialog()).findByText(en.plan.featureName.approvals)
    const before = calls(SUBSCRIPTION).length
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          planCode: 'STARTER',
          planName: 'Starter',
          billingCycle: 'MONTHLY',
          periodPrice: '35.000',
          effectiveOn: '2026-11-01',
        },
      })
    await user.click(
      screen.getByRole('button', { name: i18n.t('planChange.dialog.confirm.DOWNGRADE') }),
    )
    await waitFor(() => expect(calls(REQUEST)).toHaveLength(1))
    const body = JSON.parse(String((calls(REQUEST)[0][1] as RequestInit).body))
    expect(body).toEqual({
      planCode: 'STARTER',
      billingCycle: 'MONTHLY',
      expectedPlanVersionId: 'pv-STARTER',
    })
    expect(
      await screen.findByText(
        i18n.t('planChange.done.scheduled', { plan: 'Starter', date: '1 Nov 2026' }),
      ),
    ).toBeTruthy()
    await waitFor(() => expect(calls(SUBSCRIPTION).length).toBeGreaterThan(before))
    expect(
      await screen.findByText(
        i18n.t('subscription.scheduledChange', { plan: 'Starter', date: '1 Nov 2026' }),
      ),
    ).toBeTruthy()
  })
})

describe('Plan changes: monthly and yearly billing (PC-2, PL-4)', () => {
  it('quotes yearly billing as the yearly price less what was paid, with extras at monthly × 10', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: i18n.t('planChange.toAnnual') }))
    const box = within(await dialog())
    expect((await box.findAllByText('800.000')).length).toBeGreaterThan(0)
    expect(box.getByText(i18n.t('planChange.charge.credit'))).toBeTruthy()
    expect(box.getAllByText('80.000').length).toBeGreaterThan(0)
    expect(box.getAllByText('22.500').length).toBeGreaterThan(0)
    expect(box.getAllByText('779.625').length).toBeGreaterThan(0)
    expect(box.getByText(sentence(/paid until 30 Sept? 2027/))).toBeTruthy()
    expect(String(calls(PREVIEW).at(-1)?.[0])).toBe(
      `${PREVIEW}?planCode=BUSINESS&billingCycle=ANNUAL`,
    )
  })

  it('switches the cycle inside the dialog and quotes again', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await moveTo('Business Plus'))
    await within(await dialog()).findAllByText('49.467')
    await user.click(screen.getByRole('tab', { name: i18n.t('subscription.cycle.ANNUAL') }))
    await waitFor(() =>
      expect(String(calls(PREVIEW).at(-1)?.[0])).toBe(
        `${PREVIEW}?planCode=BUSINESS_PLUS&billingCycle=ANNUAL`,
      ),
    )
  })

  it('words a waiting yearly-to-monthly change as the billing, not the plan', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        billingCycle: 'ANNUAL',
        periodPrice: '800.000',
        paidThrough: '2027-09-30',
        scheduledChange: {
          planCode: 'BUSINESS',
          planName: 'Business',
          billingCycle: 'MONTHLY',
          periodPrice: '80.000',
          effectiveOn: '2027-10-01',
        },
      })
    renderPage()
    expect(
      await screen.findByText(i18n.t('planChange.waiting.toMonthly', { date: '1 Oct 2027' })),
    ).toBeTruthy()
  })
})

/**
 * R1 (Abdul, 18 Oct 2026, D6): paying for a bigger plan in the trial ends the trial at once, the
 * paid period starts on the payment date and unused trial days are not carried over. The figures
 * are the server's; the screen only stops promising "the difference for the days left" and "your
 * subscription date does not change", which hold for paid time, not for a trial.
 */
const TRIAL = {
  ...ACTIVE,
  access: 'TRIAL',
  trialStartsOn: '2026-10-01',
  trialEndsOn: '2026-10-14',
  trialDay: 11,
  trialDaysLeft: 4,
  paidThrough: null,
  renewsOn: null,
}

function trialUpgrade(over: Record<string, unknown> = {}) {
  return upgrade({
    charge: {
      windowStartsOn: '2026-10-11',
      windowEndsOn: '2026-11-10',
      daysLeft: 31,
      includesToday: true,
      periods: [
        {
          startsOn: '2026-10-11',
          endsOn: '2026-11-10',
          totalDays: 31,
          remainingDays: 31,
          fromPrice: '0.000',
          toPrice: '150.000',
          amount: '150.000',
        },
      ],
      credit: '0.000',
      extras: [],
      subtotal: '150.000',
      vatRate: '0.05000',
      vatAmount: '7.500',
      total: '157.500',
      currency: 'OMR',
      newPaidThrough: '2026-11-10',
    },
    subscriptionDate: 11,
    ...over,
  })
}

describe('Plan changes: a bigger plan in the free trial (R1, D6)', () => {
  it('says paying ends the trial at once, from the payment date, with no carry-over', async () => {
    const user = userEvent.setup({ delay: null })
    answers[SUBSCRIPTION] = () => json(200, TRIAL)
    answers[PREVIEW] = () => json(200, trialUpgrade())
    renderPage()
    expect(await screen.findByText(i18n.t('planChange.ruleTrial'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('planChange.rule'))).toBeNull()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect((await box.findAllByText('157.500')).length).toBeGreaterThan(0)
    expect(box.getByText(i18n.t('planChange.fact.endsTrial'))).toBeTruthy()
    expect(box.queryByText(i18n.t('planChange.fact.subscriptionDate', { day: '11' }))).toBeNull()
    expect(
      box.getByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeTruthy()
  })

  it('says nothing about the trial ending while the server still refuses the upgrade', async () => {
    const user = userEvent.setup({ delay: null })
    answers[SUBSCRIPTION] = () => json(200, TRIAL)
    answers[PREVIEW] = () =>
      json(200, upgrade({ charge: null, blockers: ['plan-upgrade-requires-platform'] }))
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect(
      await box.findByText(i18n.t('planChange.refusal.plan-upgrade-requires-platform')),
    ).toBeTruthy()
    expect(box.queryByText(i18n.t('planChange.fact.endsTrial'))).toBeNull()
    expect(
      box.queryByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeNull()
  })

  it('keeps the paid-time wording outside the trial', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    expect(await screen.findByText(i18n.t('planChange.rule'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('planChange.ruleTrial'))).toBeNull()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    await box.findAllByText('49.467')
    expect(box.queryByText(i18n.t('planChange.fact.endsTrial'))).toBeNull()
    expect(box.getByText(i18n.t('planChange.fact.subscriptionDate', { day: '1' }))).toBeTruthy()
  })

  it('words the change waiting for payment as ending the trial, not keeping the date', async () => {
    answers[SUBSCRIPTION] = () => json(200, TRIAL)
    answers[CHANGES] = () => json(200, { available: true, pending: PENDING, history: [] })
    renderPage()
    expect(
      await screen.findByText(
        i18n.t('planChange.pending.noteTrial.UPGRADE', { plan: 'Business Plus' }),
      ),
    ).toBeTruthy()
    expect(
      screen.queryByText(i18n.t('planChange.pending.note.UPGRADE', { plan: 'Business Plus' })),
    ).toBeNull()
  })

  it('has the trial sentences in Arabic, with no em dash', async () => {
    await i18n.changeLanguage('ar')
    for (const key of [
      'planChange.ruleTrial',
      'planChange.fact.endsTrial',
      'planChange.pending.noteTrial.UPGRADE',
    ]) {
      const text = i18n.t(key, { plan: 'x' })
      expect(text).not.toBe(key)
      expect(text).toMatch(/تنتهي الفترة التجريبية/)
      expect(text).not.toMatch(/—/)
    }
  })
})

describe('Plan changes: once the company has left Fawtir (A3.8, LV-6)', () => {
  const DISCONNECTION = '/api/v1/settings/fawtir-disconnection'
  const ADMIN: Entitlements = {
    ...MANAGER,
    permissions: ['admin.settings.manage', 'tenant.plan.read', 'tenant.plan.manage'],
  } as Entitlements
  const LEFT = {
    companyName: 'Real Trading LLC',
    connected: false,
    canRequest: false,
    canWithdraw: false,
    canReconnect: true,
    reconnection: null,
    request: {
      path: 'ALREADY_DISCONNECTED',
      status: 'DISCONNECTED',
      origin: 'CUSTOMER',
      askedVia: null,
      requestedAt: '2026-10-05T06:00:00Z',
      portalRequestRaisedAt: null,
      approvalDueAt: null,
      approvalExpired: false,
      disconnectedAt: '2026-10-06T09:00:00Z',
      smpRemovedAt: '2026-10-06T10:00:00Z',
      notCompletedReason: null,
      closedAt: null,
      subscriptionEndsOn: '2099-11-08',
      steps: [],
    },
  }
  const leftOnBilling = () =>
    json(200, { ...BILLING_OVERVIEW, fawtirConnection: { leftFawtir: true } })

  it('offers no confirm for a charged change, and says to reconnect first', async () => {
    const user = userEvent.setup({ delay: null })
    me = ADMIN
    answers[DISCONNECTION] = () => json(200, LEFT)
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    await box.findAllByText('49.467')
    expect(await box.findByText(i18n.t('fawtirReconnection.beforePaying.note'))).toBeTruthy()
    expect(
      box.queryByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeNull()
    expect(calls(REQUEST)).toHaveLength(0)
  })

  it('still offers a change that charges nothing (a downgrade)', async () => {
    const user = userEvent.setup({ delay: null })
    me = ADMIN
    answers[DISCONNECTION] = () => json(200, LEFT)
    renderPage()
    await user.click(await moveTo('Starter'))
    const box = within(await dialog())
    expect(
      await box.findByRole('button', { name: i18n.t('planChange.dialog.confirm.DOWNGRADE') }),
    ).toBeTruthy()
    expect(box.queryByText(i18n.t('fawtirReconnection.beforePaying.note'))).toBeNull()
  })

  it('holds the confirm back for a role that learns it from Settings › Billing', async () => {
    const user = userEvent.setup({ delay: null })
    answers[BILLING] = leftOnBilling
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect(await box.findByText(i18n.t('billing.refusal.disconnected-from-fawtir'))).toBeTruthy()
    expect(
      box.queryByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeNull()
  })

  it('shows the waiting change with no way to pay it, but it can still be withdrawn', async () => {
    answers[CHANGES] = () => json(200, { available: true, pending: PENDING, history: [] })
    answers[BILLING] = leftOnBilling
    renderPage()
    expect(await screen.findByText('FWT-SUB-2026-000061')).toBeTruthy()
    expect(await screen.findByText(i18n.t('billing.refusal.disconnected-from-fawtir'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.method.CASH.title'))).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('planChange.pending.withdraw') })).toBeTruthy()
  })

  it('offers the charged change as before while the company is connected', async () => {
    const user = userEvent.setup({ delay: null })
    me = ADMIN
    answers[DISCONNECTION] = () =>
      json(200, { ...LEFT, connected: true, canRequest: true, canReconnect: false, request: null })
    renderPage()
    await user.click(await moveTo('Business Plus'))
    expect(
      await within(await dialog()).findByRole('button', {
        name: i18n.t('planChange.dialog.confirm.UPGRADE'),
      }),
    ).toBeTruthy()
  })
})

describe('Plan changes: the change waiting for payment', () => {
  it('can be withdrawn while its bill is open and nothing was sent for it', async () => {
    const user = userEvent.setup({ delay: null })
    answers[CHANGES] = () => json(200, { available: true, pending: PENDING, history: [] })
    answers[`DELETE ${CHANGES}/pc-1`] = () => json(200, { ...PENDING, status: 'WITHDRAWN' })
    renderPage()
    const withdraw = await screen.findByRole('button', {
      name: i18n.t('planChange.pending.withdraw'),
    })
    answers[CHANGES] = () => json(200, { available: true, pending: null, history: [] })
    await user.click(withdraw)
    expect(await screen.findByText(i18n.t('planChange.pending.withdrawn'))).toBeTruthy()
    expect(calls(`DELETE ${CHANGES}/pc-1`)).toHaveLength(1)
    expect(await moveTo('Business Plus')).toBeTruthy()
  })

  it('cannot be withdrawn once a payment was sent for it ("not after it is paid")', async () => {
    answers[CHANGES] = () => json(200, { available: true, pending: PENDING, history: [] })
    answers[BILLING] = () =>
      json(200, {
        ...BILLING_OVERVIEW,
        bills: [
          {
            bill: { ...BILL, status: 'PENDING_VERIFICATION' },
            kind: 'PLAN_CHANGE',
            payments: [
              {
                id: 'p-1',
                billId: 'b-pc',
                method: 'CASH',
                status: 'SUBMITTED',
                amount: '49.467',
                submittedAt: '2026-10-11T09:00:00Z',
                reference: null,
                customerNote: null,
                proofContentType: null,
                receiptNumber: null,
                receivedAmount: null,
                receivedAt: null,
                rejectionReason: null,
                version: 0,
              },
            ],
            card: null,
          },
        ],
      })
    renderPage()
    expect(await screen.findByText(i18n.t('billing.waiting.CASH.SUBMITTED'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('planChange.pending.withdraw') })).toBeNull()
  })

  it('is shown read-only to someone who may only read the plan', async () => {
    me = READER
    answers[CHANGES] = () => json(200, { available: true, pending: PENDING, history: [] })
    renderPage()
    expect(await screen.findByText(i18n.t('planChange.pending.title'))).toBeTruthy()
    expect(await screen.findByText('FWT-SUB-2026-000061')).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('planChange.pending.withdraw') })).toBeNull()
    expect(screen.queryByText(i18n.t('billing.method.CASH.title'))).toBeNull()
  })
})

describe('Plan changes: keeping the plan after a downgrade paid early (D3, KEEP_PLAN)', () => {
  it('offers to keep the plan for the difference instead of a free withdrawal', async () => {
    const user = userEvent.setup({ delay: null })
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        paidThrough: '2026-11-30',
        renewsOn: '2026-12-01',
        scheduledChange: {
          planCode: 'STARTER',
          planName: 'Starter',
          billingCycle: 'MONTHLY',
          periodPrice: '35.000',
          effectiveOn: '2026-11-01',
        },
      })
    answers[PREVIEW] = () =>
      json(
        200,
        upgrade({
          kind: 'KEEP_PLAN',
          to: side('BUSINESS', 'Business', 'MONTHLY', '80.000'),
          charge: {
            ...upgrade().charge,
            windowStartsOn: '2026-11-01',
            windowEndsOn: '2026-11-30',
            daysLeft: 30,
            includesToday: false,
            periods: [
              {
                startsOn: '2026-11-01',
                endsOn: '2026-11-30',
                totalDays: 30,
                remainingDays: 30,
                fromPrice: '35.000',
                toPrice: '80.000',
                amount: '45.000',
              },
            ],
            subtotal: '45.000',
            vatAmount: '2.250',
            total: '47.250',
          },
          allowance: { now: 1000, used: 412, afterChange: 1000 },
        }),
      )
    renderPage()
    expect(screen.queryByRole('button', { name: i18n.t('subscription.withdrawChange') })).toBeNull()
    await user.click(
      await screen.findByRole('button', { name: i18n.t('planChange.keep', { plan: 'Business' }) }),
    )
    const box = within(await dialog())
    expect((await box.findAllByText('47.250')).length).toBeGreaterThan(0)
    expect(
      box.getByText(sentence(/47\.250 now for the 30 days from 1 Nov 2026 to 30 Nov 2026\./)),
    ).toBeTruthy()
    expect(String(calls(PREVIEW).at(-1)?.[0])).toBe(
      `${PREVIEW}?planCode=BUSINESS&billingCycle=MONTHLY`,
    )
    expect(
      box.getByRole('button', { name: i18n.t('planChange.dialog.confirm.KEEP_PLAN') }),
    ).toBeTruthy()
  })

  it('keeps the free withdrawal while the lower-priced period is not paid yet', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          planCode: 'STARTER',
          planName: 'Starter',
          billingCycle: 'MONTHLY',
          periodPrice: '35.000',
          effectiveOn: '2026-11-01',
        },
      })
    renderPage()
    expect(
      await screen.findByRole('button', { name: i18n.t('subscription.withdrawChange') }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('planChange.keep', { plan: 'Business' }) }),
    ).toBeNull()
  })
})

/**
 * Backend #614: `scheduledChange` says what waits (`kind`), whether its first period is paid
 * (`paidFor`) and how it is taken back (`withdrawal`), so the screen stops inferring both. Each case
 * below is set up so the old inference would have answered differently.
 */
const STARTER_WAITING = {
  planCode: 'STARTER',
  planName: 'Starter',
  billingCycle: 'MONTHLY',
  periodPrice: '35.000',
  effectiveOn: '2026-11-01',
}
const keepButton = () =>
  screen.queryByRole('button', { name: i18n.t('planChange.keep', { plan: 'Business' }) })
const withdrawButton = () =>
  screen.queryByRole('button', { name: i18n.t('subscription.withdrawChange') })
const downgradeLine = i18n.t('subscription.scheduledChange', {
  plan: 'Starter',
  date: '1 Nov 2026',
})

describe('Plan changes: the waiting change from the server (backend #614)', () => {
  it('words a DOWNGRADE by its plan, even where the old guess would have said monthly billing', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        billingCycle: 'ANNUAL',
        paidThrough: '2027-09-30',
        scheduledChange: {
          ...STARTER_WAITING,
          planCode: 'BUSINESS',
          planName: 'Business',
          effectiveOn: '2027-10-01',
          kind: 'DOWNGRADE',
          paidFor: false,
          withdrawal: 'FREE',
        },
      })
    renderPage()
    expect(
      await screen.findByText(
        i18n.t('subscription.scheduledChange', { plan: 'Business', date: '1 Oct 2027' }),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Monthly billing starts/)).toBeNull()
  })

  it('words CYCLE_TO_MONTHLY as the billing, not the plan', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        billingCycle: 'ANNUAL',
        paidThrough: '2027-09-30',
        scheduledChange: {
          planCode: 'BUSINESS',
          planName: 'Business',
          billingCycle: 'MONTHLY',
          periodPrice: '80.000',
          effectiveOn: '2027-10-01',
          kind: 'CYCLE_TO_MONTHLY',
          paidFor: false,
          withdrawal: 'FREE',
        },
      })
    renderPage()
    expect(
      await screen.findByText(i18n.t('planChange.waiting.toMonthly', { date: '1 Oct 2027' })),
    ).toBeTruthy()
    expect(
      await screen.findByRole('button', { name: i18n.t('subscription.withdrawChange') }),
    ).toBeTruthy()
  })

  it('words ENTERPRISE_TERMS as terms Fawtir set, with no way to take them back (NONE)', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          planCode: 'ENT-REAL',
          planName: 'Enterprise',
          billingCycle: 'MONTHLY',
          periodPrice: '450.000',
          effectiveOn: '2026-11-01',
          kind: 'ENTERPRISE_TERMS',
          paidFor: false,
          withdrawal: 'NONE',
        },
      })
    renderPage()
    expect(await screen.findByText(sentence(/your Enterprise terms change to/))).toBeTruthy()
    expect(screen.queryByText(/You move to/)).toBeNull()
    expect(withdrawButton()).toBeNull()
    expect(keepButton()).toBeNull()
  })

  it('offers the free withdrawal for FREE, even with the period inside paidThrough', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        paidThrough: '2026-11-30',
        scheduledChange: {
          ...STARTER_WAITING,
          kind: 'DOWNGRADE',
          paidFor: true,
          withdrawal: 'FREE',
        },
      })
    renderPage()
    expect(await screen.findByText(downgradeLine)).toBeTruthy()
    expect(
      await screen.findByRole('button', { name: i18n.t('subscription.withdrawChange') }),
    ).toBeTruthy()
    expect(keepButton()).toBeNull()
  })

  it('offers "Keep {plan}" for KEEP_PLAN while the changes say available', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          ...STARTER_WAITING,
          kind: 'DOWNGRADE',
          paidFor: true,
          withdrawal: 'KEEP_PLAN',
        },
      })
    renderPage()
    expect(
      await screen.findByRole('button', { name: i18n.t('planChange.keep', { plan: 'Business' }) }),
    ).toBeTruthy()
    expect(withdrawButton()).toBeNull()
  })

  it('shows no action for KEEP_PLAN while the changes say not available', async () => {
    answers[CHANGES] = () => json(200, { available: false, pending: null, history: [] })
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          ...STARTER_WAITING,
          kind: 'DOWNGRADE',
          paidFor: true,
          withdrawal: 'KEEP_PLAN',
        },
      })
    renderPage()
    expect(await screen.findByText(downgradeLine)).toBeTruthy()
    await waitFor(() => expect(calls(CHANGES).length).toBeGreaterThan(0))
    expect(keepButton()).toBeNull()
    expect(withdrawButton()).toBeNull()
  })

  it('shows no action for NONE', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          ...STARTER_WAITING,
          kind: 'DOWNGRADE',
          paidFor: false,
          withdrawal: 'NONE',
        },
      })
    renderPage()
    expect(await screen.findByText(downgradeLine)).toBeTruthy()
    expect(keepButton()).toBeNull()
    expect(withdrawButton()).toBeNull()
  })

  it('falls back to the old inference when the server sends no kind, paidFor or withdrawal', async () => {
    // A server before #614: annual to monthly is recognised by the plan code, and a period inside
    // paidThrough offers "Keep" (self-service open) instead of the free withdrawal.
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        billingCycle: 'ANNUAL',
        paidThrough: '2027-10-31',
        scheduledChange: {
          planCode: 'BUSINESS',
          planName: 'Business',
          billingCycle: 'MONTHLY',
          periodPrice: '80.000',
          effectiveOn: '2027-10-01',
        },
      })
    renderPage()
    expect(
      await screen.findByText(i18n.t('planChange.waiting.toMonthly', { date: '1 Oct 2027' })),
    ).toBeTruthy()
    expect(
      await screen.findByRole('button', { name: i18n.t('planChange.keep', { plan: 'Business' }) }),
    ).toBeTruthy()
    expect(withdrawButton()).toBeNull()
  })
})

describe("Plan changes: the company's own Enterprise terms (plan-change-via-fawtir)", () => {
  it('says plan changes go through Fawtir and offers no move when the preview lists it first', async () => {
    const user = userEvent.setup({ delay: null })
    answers[PREVIEW] = () =>
      json(200, upgrade({ blockers: ['plan-change-via-fawtir', 'billing-not-configured'] }))
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect(await box.findByText(i18n.t('planChange.refusal.plan-change-via-fawtir'))).toBeTruthy()
    expect(box.getByRole('link', { name: i18n.t('plans.talkToTeam') }).getAttribute('href')).toBe(
      '/contact',
    )
    expect(box.queryByText(i18n.t('planChange.refusal.billing-not-configured'))).toBeNull()
    expect(
      box.queryByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeNull()
    expect(box.queryByRole('tab', { name: i18n.t('subscription.cycle.ANNUAL') })).toBeNull()
    expect(document.body.textContent).not.toMatch(/English detail|plan-change-via-fawtir/)
  })

  it('words the 409 refusal of the request the same way and offers no retry', async () => {
    const user = userEvent.setup({ delay: null })
    answers[REQUEST] = () => problem(409, 'plan-change-via-fawtir')
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    await user.click(
      await box.findByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    )
    expect(await box.findByText(i18n.t('planChange.refusal.plan-change-via-fawtir'))).toBeTruthy()
    expect(box.getByRole('link', { name: i18n.t('plans.talkToTeam') })).toBeTruthy()
    expect(
      box.queryByRole('button', { name: i18n.t('planChange.dialog.confirm.UPGRADE') }),
    ).toBeNull()
    expect(document.body.textContent).not.toMatch(/English detail/)
  })

  it('has the sentence in Arabic, with no em dash', async () => {
    await i18n.changeLanguage('ar')
    const line = i18n.t('planChange.refusal.plan-change-via-fawtir')
    expect(line).toMatch(/فوتر/)
    expect(line).not.toMatch(/—/)
  })
})

describe('Plan changes: wording', () => {
  it('says "includes today" in Arabic too, and has every key in both languages', async () => {
    await i18n.changeLanguage('ar')
    expect(
      i18n.t('planChange.charge.payNow', { count: 21, total: '49.467', n: '21', date: 'x' }),
    ).toMatch(/يشمل اليوم/)
    const keys = (tree: object, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([key, value]) =>
        value && typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
      )
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '')
    expect(new Set(keys(ar.planChange).map(base))).toEqual(new Set(keys(en.planChange).map(base)))
    expect(JSON.stringify(en.planChange) + JSON.stringify(ar.planChange)).not.toMatch(/—/)
  })
})

/**
 * TR-5 (D6, D15): in the free trial the server quotes a bigger plan as TRIAL_UPGRADE (backend
 * #626): a whole first period of the new plan from the day the customer pays, nothing credited
 * and nothing pro-rated. Every sentence is ours; no raw `planChange.` key may reach the screen.
 */
function trialUpgradeKind(over: Record<string, unknown> = {}) {
  return trialUpgrade({
    kind: 'TRIAL_UPGRADE',
    from: side('STARTER', 'Starter', 'MONTHLY', '35.000'),
    allowance: { now: 200, used: 0, afterChange: 3000 },
    endsTrial: true,
    ...over,
  })
}

const TRIAL_PENDING = {
  ...PENDING,
  kind: 'TRIAL_UPGRADE',
  fromPlanCode: 'STARTER',
  windowEndsOn: '2026-11-10',
  daysLeft: 31,
  newPaidThrough: '2026-11-10',
}

const noRawKey = () =>
  expect(document.body.textContent ?? '').not.toMatch(/planChange\.|subscription\.|billing\./)

describe('Plan changes: TRIAL_UPGRADE from the server (TR-5, D6, D15)', () => {
  for (const language of ['en', 'ar']) {
    it(`words the dialog as a whole first period, with no raw key and no pro-rata (${language})`, async () => {
      const user = userEvent.setup({ delay: null })
      await i18n.changeLanguage(language)
      answers[SUBSCRIPTION] = () =>
        json(200, { ...TRIAL, planCode: 'STARTER', planName: 'Starter' })
      answers[PREVIEW] = () => json(200, trialUpgradeKind())
      renderPage()
      await user.click(
        await screen.findByRole('button', {
          name: i18n.t('planChange.moveTo', { plan: 'Business Plus' }),
        }),
      )
      const box = within(await dialog())
      expect((await box.findAllByText('157.500')).length).toBeGreaterThan(0)
      noRawKey()
      expect(
        box.getByRole('button', { name: i18n.t('planChange.dialog.confirm.TRIAL_UPGRADE') }),
      ).toBeTruthy()
      expect(box.getByText(i18n.t('planChange.fact.endsTrial'))).toBeTruthy()
      // Not "31 of 31 days left", "the difference for the days left" or "the 0 already used".
      const text = (await dialog()).textContent ?? ''
      expect(text).not.toContain(
        i18n.t('planChange.charge.period', {
          start: '11 Oct 2026',
          end: '10 Nov 2026',
          remaining: '31',
          total: '31',
        }),
      )
      expect(text).not.toContain(
        i18n.t('planChange.fact.allowanceAtOnce', { after: '3,000', used: '0' }),
      )
      expect(text).not.toMatch(/—/)
    })
  }

  it("says the paid month runs from the day of payment, with the server's dates", async () => {
    const user = userEvent.setup({ delay: null })
    answers[SUBSCRIPTION] = () => json(200, { ...TRIAL, planCode: 'STARTER', planName: 'Starter' })
    answers[PREVIEW] = () => json(200, trialUpgradeKind())
    renderPage()
    await user.click(await moveTo('Business Plus'))
    const box = within(await dialog())
    expect(
      await box.findByText(
        sentence(/one whole month of Business Plus: 11 Oct 2026 to 10 Nov 2026\.$/),
      ),
    ).toBeTruthy()
    expect(box.getByText(i18n.t('planChange.fact.allowanceTrial', { after: '3,000' }))).toBeTruthy()
  })

  for (const language of ['en', 'ar']) {
    it(`words the change waiting for payment with no raw key (${language})`, async () => {
      await i18n.changeLanguage(language)
      answers[SUBSCRIPTION] = () =>
        json(200, { ...TRIAL, planCode: 'STARTER', planName: 'Starter' })
      answers[CHANGES] = () => json(200, { available: true, pending: TRIAL_PENDING, history: [] })
      renderPage()
      expect(
        await screen.findByText(
          i18n.t('planChange.pending.note.TRIAL_UPGRADE', { plan: 'Business Plus' }),
        ),
      ).toBeTruthy()
      await waitFor(() => expect(screen.queryByText(/FWT-SUB-2026-000061/)).toBeTruthy())
      noRawKey()
    })
  }
})

describe('Plan page: the trial period row (F2)', () => {
  it('shows the trial period while the server reports a trial', async () => {
    answers[SUBSCRIPTION] = () => json(200, TRIAL)
    renderPage()
    expect(await screen.findByText(i18n.t('subscription.fact.trial'))).toBeTruthy()
  })

  it('drops it once the subscription is Active, even with the trial dates still sent', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, { ...ACTIVE, trialStartsOn: '2026-10-01', trialEndsOn: '2026-10-14' })
    renderPage()
    await screen.findByText(i18n.t('subscription.fact.paidThrough'))
    expect(screen.queryByText(i18n.t('subscription.fact.trial'))).toBeNull()
  })
})

describe('Plan page: the sentence after a change (F3)', () => {
  it('clears the earlier "Done" when the booked change is then withdrawn', async () => {
    const user = userEvent.setup({ delay: null })
    answers[REQUEST] = () =>
      json(201, {
        ...PENDING,
        id: null,
        kind: 'DOWNGRADE',
        status: null,
        applies: 'ON_DATE',
        effectiveOn: '2026-11-01',
        toPlanCode: 'STARTER',
        bill: null,
      })
    renderPage()
    await user.click(await moveTo('Starter'))
    await within(await dialog()).findByText(en.plan.featureName.approvals)
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...ACTIVE,
        scheduledChange: {
          planCode: 'STARTER',
          planName: 'Starter',
          billingCycle: 'MONTHLY',
          periodPrice: '35.000',
          effectiveOn: '2026-11-01',
          withdrawal: 'FREE',
        },
      })
    await user.click(
      screen.getByRole('button', { name: i18n.t('planChange.dialog.confirm.DOWNGRADE') }),
    )
    const done = i18n.t('planChange.done.scheduled', { plan: 'Starter', date: '1 Nov 2026' })
    expect(await screen.findByText(done)).toBeTruthy()
    answers[`DELETE ${SUBSCRIPTION}/scheduled-change`] = () => json(200, ACTIVE)
    await user.click(
      await screen.findByRole('button', { name: i18n.t('subscription.withdrawChange') }),
    )
    await waitFor(() => expect(calls(`DELETE ${SUBSCRIPTION}/scheduled-change`)).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText(done)).toBeNull())
  })
})
