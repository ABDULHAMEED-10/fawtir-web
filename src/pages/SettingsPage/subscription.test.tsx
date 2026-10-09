import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { PlanPage } from './PlanPage'
import { BillingPage } from './BillingPage'

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

const PLAN_OVERVIEW = {
  plan: { code: 'STARTER', name: 'Starter', invoicesPerMonth: 200, peopleIncluded: 3, branchesIncluded: 1 },
  usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-18' }, used: 12, resubmissions: 0, quota: 200, raisedToday: 1 },
  activePeople: 1,
  openInvitations: 0,
  activeBranches: 1,
}

/** Day 10 of a 14-day trial that began on 9 October. */
const TRIAL_DAY_10 = {
  tracked: true, access: 'TRIAL', restrictionsEnforced: false, today: '2026-10-18', planCode: 'STARTER',
  planName: 'Starter', billingCycle: 'MONTHLY', periodPrice: '35.000', trialStartsOn: '2026-10-09',
  trialEndsOn: '2026-10-22', trialDay: 10, trialDaysLeft: 5, paidThrough: null, renewsOn: '2026-10-23',
  graceDays: 7, graceUntil: null, autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null,
  cancelAtPeriodEnd: false, accessEndsOn: null, scheduledChange: null,
}

const ACTIVE_WITH_DOWNGRADE = {
  ...TRIAL_DAY_10, access: 'ACTIVE', planCode: 'BUSINESS', planName: 'Business', periodPrice: '80.000',
  trialDay: null, trialDaysLeft: null, paidThrough: '2026-11-22', renewsOn: '2026-11-23',
  scheduledChange: { planCode: 'STARTER', planName: 'Starter', billingCycle: 'MONTHLY', periodPrice: '35.000', effectiveOn: '2026-11-23' },
}

const PAYMENT_REQUIRED = {
  ...TRIAL_DAY_10, access: 'PAYMENT_REQUIRED', trialDay: null, trialDaysLeft: null, renewsOn: null,
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
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  who = MANAGER
  answers = {
    [PLAN]: () => json(200, PLAN_OVERVIEW),
    [SUBSCRIPTION]: () => json(200, TRIAL_DAY_10),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/plan" element={<PlanPage />} />
        <Route path="/settings/bills" element={<BillingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function section() {
  return screen.getByRole('region', { name: i18n.t('subscription.title') })
}

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
}

describe('Settings › Plan: the subscription', () => {
  it('shows the trial, its day-10 reminder, the renewal date and the price with the rial sign', async () => {
    renderAt('/settings/plan')
    expect(await screen.findByText(i18n.t('subscription.access.TRIAL'))).toBeTruthy()
    const region = section()

    expect(within(region).getByRole('status').textContent).toBe(
      i18n.t('subscription.notice.trialEnding', { date: '22 Oct 2026', count: 5 }),
    )
    expect(within(region).getByText('9 Oct 2026 to 22 Oct 2026')).toBeTruthy()
    expect(within(region).getByText('23 Oct 2026')).toBeTruthy()
    expect(within(region).getByText('35.000')).toBeTruthy()
    expect(region.textContent).not.toMatch(/OMR/)
    expect(within(region).getByText(i18n.t('subscription.fact.autoRenewUnavailable'))).toBeTruthy()
  })

  it('offers no way to pay and no auto-renew switch, because neither exists yet', async () => {
    answers[SUBSCRIPTION] = () => json(200, PAYMENT_REQUIRED)
    renderAt('/settings/plan')
    expect(await screen.findByText(i18n.t('subscription.notice.paymentRequired'))).toBeTruthy()

    expect(within(section()).queryByRole('button', { name: /pay/i })).toBeNull()
    expect(within(section()).queryByRole('switch')).toBeNull()
    expect(within(section()).queryByRole('button', { name: i18n.t('subscription.cancel') })).toBeNull()
  })

  it('cancels at the end of the period only after confirming, and offers to keep it after', async () => {
    answers[`POST ${SUBSCRIPTION}/cancellation`] = () =>
      json(200, { ...TRIAL_DAY_10, cancelAtPeriodEnd: true, accessEndsOn: '2026-10-22', renewsOn: null })
    const user = userEvent.setup({ delay: null })
    renderAt('/settings/plan')

    await user.click(await screen.findByRole('button', { name: i18n.t('subscription.cancel') }))
    expect(writes()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: i18n.t('subscription.cancelConfirm.confirm') }))

    expect(
      await within(section()).findByText(i18n.t('subscription.notice.cancelScheduled', { date: '22 Oct 2026' })),
    ).toBeTruthy()
    expect(writes()).toHaveLength(1)
    expect(within(section()).getByRole('button', { name: i18n.t('subscription.keep') })).toBeTruthy()
    expect(within(section()).getByText(i18n.t('subscription.fact.notRenewing'))).toBeTruthy()
  })

  it('shows a downgrade waiting for renewal and withdraws it on request', async () => {
    answers[SUBSCRIPTION] = () => json(200, ACTIVE_WITH_DOWNGRADE)
    answers[`DELETE ${SUBSCRIPTION}/scheduled-change`] = () =>
      json(200, { ...ACTIVE_WITH_DOWNGRADE, scheduledChange: null })
    const user = userEvent.setup({ delay: null })
    renderAt('/settings/plan')

    expect(
      await screen.findByText(i18n.t('subscription.scheduledChange', { plan: 'Starter', date: '23 Nov 2026' })),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('subscription.withdrawChange') }))

    await waitFor(() =>
      expect(screen.queryByText(i18n.t('subscription.scheduledChange', { plan: 'Starter', date: '23 Nov 2026' }))).toBeNull(),
    )
    expect(writes()).toHaveLength(1)
  })

  it('says a payment being checked is why the downgrade cannot be withdrawn yet', async () => {
    answers[SUBSCRIPTION] = () => json(200, ACTIVE_WITH_DOWNGRADE)
    answers[`DELETE ${SUBSCRIPTION}/scheduled-change`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/subscription-change-blocked-by-payment' })
    const user = userEvent.setup({ delay: null })
    renderAt('/settings/plan')

    await user.click(await screen.findByRole('button', { name: i18n.t('subscription.withdrawChange') }))

    expect(await within(section()).findByText(i18n.t('subscription.blockedByPayment'))).toBeTruthy()
    expect(within(section()).queryByText(i18n.t('subscription.actionFailed'))).toBeNull()
  })

  it('shows the facts but no actions to someone who may only read the plan', async () => {
    who = READER
    answers[SUBSCRIPTION] = () => json(200, ACTIVE_WITH_DOWNGRADE)
    renderAt('/settings/plan')
    expect(await screen.findByText(i18n.t('subscription.access.ACTIVE'))).toBeTruthy()

    expect(within(section()).queryAllByRole('button')).toHaveLength(0)
  })

  it('says in words that an untracked company is managed by Fawtir, with no dates invented', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, { ...TRIAL_DAY_10, tracked: false, access: 'NOT_TRACKED', trialStartsOn: null, trialEndsOn: null, trialDay: null, trialDaysLeft: null, renewsOn: null })
    renderAt('/settings/plan')

    expect(await screen.findByText(i18n.t('subscription.notice.notTracked'))).toBeTruthy()
    expect(within(section()).queryByText(i18n.t('subscription.fact.renewsOn'))).toBeNull()
  })

  it('reads in Arabic with Latin digits', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/settings/plan')

    expect(await screen.findByText('الاشتراك')).toBeTruthy()
    expect(within(section()).getByText('35.000')).toBeTruthy()
    expect(section().textContent).not.toMatch(/[٠-٩]/)
  })
})

describe('Settings › Bills and payment', () => {
  it('shows the real subscription and charges, with no sample bills, ribbon, Pay now or Download all', async () => {
    answers['/api/v1/settings/billing'] = () =>
      json(200, { bills: [], beneficiary: null, methods: { bankTransfer: false, cash: false }, proofMaximumBytes: 1000000 })
    renderAt('/settings/bills')

    expect(await screen.findByText(i18n.t('subscription.access.TRIAL'))).toBeTruthy()
    expect(await screen.findByText(i18n.t('billing.nothingDue'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('demoModule.ribbon'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('bills.pay.payNow') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('bills.downloadAll') })).toBeNull()
  })
})
