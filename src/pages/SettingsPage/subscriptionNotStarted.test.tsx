import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { PlanPage } from './PlanPage'
import { BillingPage } from './BillingPage'
import { SettingsPage } from './SettingsPage'

/**
 * A bank-transfer sign-up approved before Finance verified the transfer (retest 15 Oct 2026,
 * K-BC03 and K-BC05): the server answers PAYMENT_REQUIRED with nothing ever covered, no bill yet,
 * and a usage period that is only the calendar month.
 */
const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Bank Signup LLC',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const BILLING = '/api/v1/settings/billing'

const PLAN_OVERVIEW = {
  plan: { code: 'STARTER', name: 'Starter', invoicesPerMonth: 200, peopleIncluded: 3, branchesIncluded: 1 },
  usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-15' }, used: 0, resubmissions: 0, quota: 200, raisedToday: 0 },
  activePeople: 1,
  openInvitations: 0,
  activeBranches: 1,
}

const NOT_STARTED = {
  tracked: true, access: 'PAYMENT_REQUIRED', restrictionsEnforced: false, today: '2026-10-15', planCode: 'STARTER',
  planName: 'Starter', billingCycle: 'MONTHLY', periodPrice: '36.500', trialStartsOn: null, trialEndsOn: null,
  trialDay: null, trialDaysLeft: null, paidThrough: null, renewsOn: null, graceDays: 7, graceUntil: null,
  autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null, cancelAtPeriodEnd: false,
  accessEndsOn: null, scheduledChange: null,
}

/** Lapsed after a paid period: payment really is due, and the old notice must stay. */
const LAPSED = { ...NOT_STARTED, paidThrough: '2026-09-30' }

const ACTIVE = { ...NOT_STARTED, access: 'ACTIVE', paidThrough: '2026-11-14', renewsOn: '2026-11-15' }

const OVERVIEW_NO_BILLS = {
  bills: [],
  nextBillsCursor: null,
  beneficiary: null,
  methods: { bankTransfer: true, bankTransferStatus: 'AVAILABLE', cash: true },
  proofMaximumBytes: 1000000,
  signupMethod: 'BANK_TRANSFER',
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
    [PLAN]: () => json(200, PLAN_OVERVIEW),
    [SUBSCRIPTION]: () => json(200, NOT_STARTED),
    [BILLING]: () => json(200, OVERVIEW_NO_BILLS),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/plan" element={<PlanPage />} />
        <Route path="/settings/bills" element={<BillingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function billsCard() {
  return screen.getByRole('link', { name: new RegExp(i18n.t('settings.card.billsTitle')) })
}

describe('K-BC03: a subscription that has not started', () => {
  it('says it has not started, and that the transfer sent at sign-up is being checked', async () => {
    renderAt('/settings/bills')

    expect(await screen.findByText(i18n.t('subscription.access.NOT_STARTED'))).toBeTruthy()
    expect(screen.getByText(i18n.t('subscription.notice.notStartedBilling'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('subscription.notice.paymentRequiredBilling'))).toBeNull()

    expect(await screen.findByText(i18n.t('billing.signupWaiting.BANK_TRANSFER'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.nothingDue'))).toBeNull()
    // The server refuses another bill while the sign-up payment is with Fawtir.
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
  })

  it('names cash and card sign-up payments by their own method', async () => {
    answers[BILLING] = () => json(200, { ...OVERVIEW_NO_BILLS, signupMethod: 'CASH' })
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('billing.signupWaiting.CASH'))).toBeTruthy()
  })

  it('still offers to prepare a bill when nothing was paid at sign-up', async () => {
    answers[BILLING] = () => json(200, { ...OVERVIEW_NO_BILLS, signupMethod: null })
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('billing.nothingDue'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('billing.prepare') })).toBeTruthy()
  })

  it('keeps "payment is due" for a subscription that lapsed after a paid period', async () => {
    answers[SUBSCRIPTION] = () => json(200, LAPSED)
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('subscription.notice.paymentRequiredBilling'))).toBeTruthy()
    expect(screen.getByText(i18n.t('subscription.access.PAYMENT_REQUIRED'))).toBeTruthy()
  })

  it('takes the server restriction code when restrictions are enforced', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, { ...NOT_STARTED, restrictionsEnforced: true, restriction: 'SUBSCRIPTION_NOT_STARTED' })
    renderAt('/settings/plan')
    expect(await screen.findByText(i18n.t('subscription.notice.notStartedPlan'))).toBeTruthy()
  })

  it('shows the Settings Bills card with the subscription state, never a sample "Paid up"', async () => {
    renderAt('/settings')
    await waitFor(() =>
      expect(within(billsCard()).getByText(i18n.t('subscription.access.NOT_STARTED'))).toBeTruthy(),
    )
    expect(within(billsCard()).queryByText(i18n.t('settings.card.billsPill'))).toBeNull()
  })

  it('says Active on the Bills card once the subscription is paid', async () => {
    answers[SUBSCRIPTION] = () => json(200, ACTIVE)
    renderAt('/settings')
    await waitFor(() =>
      expect(within(billsCard()).getByText(i18n.t('subscription.access.ACTIVE'))).toBeTruthy(),
    )
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/settings/bills')
    expect(await screen.findByText('لم يبدأ')).toBeTruthy()
    expect(await screen.findByText(/يجري التحقق من تحويلك/)).toBeTruthy()
  })
})

describe('K-BC03 with the sign-up payment status (backend #533)', () => {
  const withSignup = (signupPayment: unknown) => () => json(200, { ...OVERVIEW_NO_BILLS, signupPayment })
  const PAYMENT = { method: 'BANK_TRANSFER', amount: '36.750', submittedAt: '2026-10-15T15:50:00Z' }

  it('says the transfer is being checked while it is SUBMITTED', async () => {
    answers[BILLING] = withSignup({ ...PAYMENT, status: 'SUBMITTED' })
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('billing.signupWaiting.BANK_TRANSFER'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
  })

  it.each(['FUNDS_VERIFIED', 'CONFIRMED'])('says the payment is confirmed, not being checked, when %s', async (status) => {
    answers[BILLING] = withSignup({ ...PAYMENT, status })
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('billing.signupConfirmed'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.signupWaiting.BANK_TRANSFER'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('billing.prepare') })).toBeNull()
  })

  it("names a rejection with Finance's reason and keeps the way to pay again", async () => {
    answers[BILLING] = withSignup({ ...PAYMENT, status: 'REJECTED', rejectionReason: 'The amount on the receipt is 30.000.' })
    renderAt('/settings/bills')
    const alert = await screen.findByRole('alert')
    // One full stop: the reason's own is dropped before the sentence closes.
    expect(alert.textContent).toBe(i18n.t('billing.rejected', { reason: 'The amount on the receipt is 30.000' }))
    expect(alert.textContent).not.toContain('..')
    expect(screen.getByRole('button', { name: i18n.t('billing.prepare') })).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.signupWaiting.BANK_TRANSFER'))).toBeNull()
    expect(screen.queryByText(i18n.t('billing.nothingDue'))).toBeNull()
  })

  it('trusts an explicit null over signupMethod: nothing was paid at sign-up', async () => {
    answers[BILLING] = withSignup(null)
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('billing.nothingDue'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('billing.signupWaiting.BANK_TRANSFER'))).toBeNull()
  })

  it('falls back to signupMethod when the field is absent (server before #533)', async () => {
    renderAt('/settings/bills')
    expect(await screen.findByText(i18n.t('billing.signupWaiting.BANK_TRANSFER'))).toBeTruthy()
  })
})

describe('K-BC05: no usage period before the subscription starts', () => {
  const periodText = () =>
    i18n.t('people.plan.period', { start: '1 Oct 2026', end: '31 Oct 2026' })

  it('leaves out the calendar period, its reset date and the days-left forecast', async () => {
    renderAt('/settings/plan')
    expect(await screen.findByText(i18n.t('plan.invoicesThisMonth'))).toBeTruthy()
    await screen.findByText(i18n.t('subscription.notice.notStartedPlan'))
    await waitFor(() => expect(screen.queryByText(/Resets on/)).toBeNull())
    expect(document.body.textContent).not.toContain(periodText())
    expect(screen.queryByText(i18n.t('plan.comfortableHeadlinePeriod'))).toBeNull()
  })

  it('shows the period once the subscription has started', async () => {
    answers[SUBSCRIPTION] = () => json(200, ACTIVE)
    renderAt('/settings/plan')
    expect(await screen.findByText(/Resets on 1 Nov 2026/)).toBeTruthy()
  })

  it('drops "This period ends" from the Settings Plan card before the start', async () => {
    renderAt('/settings')
    const card = await screen.findByRole('link', { name: new RegExp(i18n.t('settings.card.planTitle')) })
    // Both reads have landed once the plan name and the Bills card's state are drawn.
    await waitFor(() => expect(within(card).getByText('Starter')).toBeTruthy())
    await waitFor(() =>
      expect(within(billsCard()).getByText(i18n.t('subscription.access.NOT_STARTED'))).toBeTruthy(),
    )
    expect(within(card).queryByText(/This period ends/)).toBeNull()
  })

  it('keeps "This period ends" on the Settings Plan card once started', async () => {
    answers[SUBSCRIPTION] = () => json(200, ACTIVE)
    renderAt('/settings')
    const card = await screen.findByRole('link', { name: new RegExp(i18n.t('settings.card.planTitle')) })
    await waitFor(() => expect(within(card).getByText(/This period ends/)).toBeTruthy())
  })
})
