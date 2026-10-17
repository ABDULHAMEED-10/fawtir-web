import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { CONSOLE_ITEMS } from '../../../lib/consoleNav'
import { CompanySubscriptionCards } from './CompanySubscriptionCards'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const TENANT = '11111111-1111-4111-8111-111111111111'
const SUBSCRIPTION = `/api/v1/platform/companies/${TENANT}/subscription`
const EXTRA = `/api/v1/platform/companies/${TENANT}/extra-documents`
const COUNTING = `/api/v1/platform/companies/${TENANT}/received-document-counting`
const PLAN = `/api/v1/platform/companies/${TENANT}/plan`
const CANCELLATIONS = `${SUBSCRIPTION}/fawtir-cancellations`
const PLANS = '/api/v1/platform/plans'
const PAID = `/api/v1/platform/companies/${TENANT}/paid-extras`

const ADMIN: Entitlements = {
  userId: 'u-admin',
  username: 'tenant.admin',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform', systemRole: true }],
  permissions: [
    'platform.tenants.manage',
    'platform.billing.read',
    'platform.billing.manage',
    'platform.plans.read',
    'platform.plans.manage',
  ],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = {
  ...ADMIN,
  userId: 'u-support',
  roles: [{ id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Support', systemRole: true }],
  permissions: ['platform.billing.read', 'platform.plans.read'],
}

function status(over: Record<string, unknown> = {}) {
  return {
    tracked: true, access: 'TRIAL', restrictionsEnforced: false, today: '2026-10-16', planCode: 'BUSINESS',
    planName: 'Business', billingCycle: 'MONTHLY', periodPrice: '80.000', trialStartsOn: '2026-10-10',
    trialEndsOn: '2026-10-23', trialDay: 7, trialDaysLeft: 8, paidThrough: null, renewsOn: null, graceDays: 7,
    graceUntil: null, autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null,
    cancelAtPeriodEnd: false, accessEndsOn: null, scheduledChange: null, ...over,
  }
}

function subscription(
  over: Record<string, unknown> = {},
  events: unknown[] = [],
  extra: Record<string, unknown> = {},
) {
  return { status: status(over), events, fawtirCancellation: null, fawtirCancellationEnabled: true, ...extra }
}

function cancellation(over: Record<string, unknown> = {}) {
  return {
    id: 'fc-1', tenantId: TENANT, tenantName: null, status: 'PROPOSED', category: 'FRAUD',
    internalReason: 'Chargeback ring', customerMessage: 'Fraudulent invoices were sent.',
    proposedBy: 'u-other', proposedByName: 'Nasser Al Hinai', proposedAt: '2026-10-16T09:00:00Z',
    confirmedBy: null, confirmedByName: null, confirmedAt: null, effectiveOn: null, withdrawnBy: null,
    withdrawnByName: null, withdrawnAt: null, withdrawalReason: null,
    outcome: { voidedBills: [], refundCases: [] }, ...over,
  }
}

function plan(code: string, sortOrder: number, active = true) {
  return { code, nameEn: code[0] + code.slice(1).toLowerCase(), nameAr: null, sortOrder, active }
}

function allowance(over: Record<string, unknown> = {}) {
  return {
    periodStart: '2026-10-10', periodEnd: '2026-11-09', resetsOn: '2026-11-10', planDocuments: 1000,
    extraDocuments: 50, totalAllowance: 1050, issued: 300, resubmissions: 0, received: 20, receivedHidden: 0,
    used: 320, planUsed: 320, extraUsed: 0, left: 730, warningPercent: null, issuingAllowed: true,
    extrasExpireOn: '2026-11-09', ...over,
  }
}

function extras(credits: unknown[] = [], over: Record<string, unknown> = {}) {
  return { tenantId: TENANT, allowance: allowance(over), credits, givenBack: [] }
}

function counting(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT, enterprise: true, planCode: 'ENTERPRISE', version: 0, monthStartedOn: '2026-10-10',
    countsReceivedNow: true, nextSubscriptionOn: '2026-11-10', countsReceivedFromNext: true, history: [], ...over,
  }
}

function paidExtras(over: Record<string, unknown> = {}, erpAddon: unknown = null) {
  const kind = (included: number, inUse: number, paid: number) => ({
    included, inUse, paidPlacesNow: paid, capacity: included + paid, unitMonthlyPrice: '2.500', offered: true,
  })
  return {
    tenantId: TENANT,
    extras: {
      open: true, users: kind(10, 11, 1), branches: kind(5, 3, 0),
      erpAddon: { offered: true, monthlyPrice: '20.000', status: null, endsOn: null },
      maxUsersPerOrder: 50, maxBranchesPerOrder: 20, outstanding: null,
      places: [{
        id: 'pl-1', kind: 'USER', quantity: 1, source: 'PURCHASE', status: 'ACTIVE', unitPeriodPrice: '2.500',
        netAmount: '1.694', planCode: 'BUSINESS_PLUS', billingCycle: 'MONTHLY', coversFrom: '2026-10-11',
        coversTo: '2026-10-31', billId: 'b-1', reason: null, createdAt: '2026-10-11T08:00:00Z',
        activatedAt: '2026-10-11T08:10:00Z', cancelledAt: null,
      }],
      ...over,
    },
    erpAddon,
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
  who = ADMIN
  answers = {
    [SUBSCRIPTION]: () => json(200, subscription()),
    [EXTRA]: () => json(200, extras()),
    [COUNTING]: () => json(200, counting({ enterprise: false })),
    [PAID]: () => json(200, paidExtras()),
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

const C = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`console.companySubscription.${key}`, options)

function renderCards() {
  return render(
    <MemoryRouter>
      <CompanySubscriptionCards tenantId={TENANT} tenantCode="FT1111" />
    </MemoryRouter>,
  )
}

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call ? { init: call[1] as RequestInit, body: JSON.parse(String(call[1]?.body)) } : null
}

async function card(title: string) {
  return waitFor(() => {
    const section = screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
    expect(within(section).queryByRole('status')).toBeNull()
    return within(section)
  })
}

describe('Console › Tenant › Subscription', () => {
  it('shows the state, plan, trial day and price from the server', async () => {
    renderCards()
    const sub = await card(C('title'))

    expect(sub.getByText(C('access.TRIAL'))).toBeTruthy()
    expect(sub.getByText(C('planWithCycle', { plan: 'Business', cycle: C('cycle.MONTHLY') }))).toBeTruthy()
    expect(sub.getByText('80.000')).toBeTruthy()
    // 10 to 23 October inclusive is a 14-day trial.
    expect(sub.getByText(C('trialDay', { day: 7, length: 14 }))).toBeTruthy()
  })

  it('grants trial days with the reason, and shows the answer and its history row', async () => {
    answers[`POST ${SUBSCRIPTION}/trial-exception`] = () =>
      json(200, subscription({ trialEndsOn: '2026-10-30', trialDaysLeft: 15 }, [
        { id: 'e-1', tenantId: TENANT, kind: 'TRIAL_EXTENDED', details: {}, reason: 'Onboarding delay', actorId: 'u-admin', occurredAt: '2026-10-16T08:00:00Z' },
      ]))
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('trialException.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(C('trialException.days')) }), '7')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Onboarding delay')
    await user.click(within(dialog).getByRole('button', { name: C('trialException.confirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('POST', `${SUBSCRIPTION}/trial-exception`)!.body).toEqual({ days: 7, reason: 'Onboarding delay' })
    const history = await card(C('history.title'))
    expect(history.getByText(C('history.kind.TRIAL_EXTENDED'))).toBeTruthy()
    expect(
      history.getByText(`${i18n.t('console.plans.history.by')} ${i18n.t('console.plans.history.you')}`),
    ).toBeTruthy()
  })

  it('refuses more than 90 days before sending', async () => {
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('trialException.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(C('trialException.days')) }), '91')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Too long')
    await user.click(within(dialog).getByRole('button', { name: C('trialException.confirm') }))

    expect(await within(dialog).findByText(C('error.wholeBetween', { min: 1, max: 90 }))).toBeTruthy()
    expect(sent('POST', `${SUBSCRIPTION}/trial-exception`)).toBeNull()
  })

  it('says in words why a paid company cannot get trial days', async () => {
    answers[`POST ${SUBSCRIPTION}/trial-exception`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/subscription-state-conflict' })
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('trialException.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(C('trialException.days')) }), '7')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Late')
    await user.click(within(dialog).getByRole('button', { name: C('trialException.confirm') }))

    expect(await within(dialog).findByText(C('refusal.alreadyPaid'))).toBeTruthy()
  })

  it('offers no trial exception for a company without a lifecycle', async () => {
    answers[SUBSCRIPTION] = () => json(200, subscription({ tracked: false, access: 'NOT_TRACKED', trialDay: null }))
    renderCards()

    const sub = await card(C('title'))
    expect(sub.getByText(C('notTrackedBody'))).toBeTruthy()
    expect(sub.queryByRole('button', { name: C('trialException.open') })).toBeNull()
  })

  it('shows support the cards without any action', async () => {
    who = SUPPORT
    answers[COUNTING] = () => json(200, counting())
    renderCards()

    expect((await card(C('title'))).queryByRole('button')).toBeNull()
    expect((await card(C('allowance.title'))).queryByRole('button', { name: C('grant.open') })).toBeNull()
    expect((await card(C('counting.title'))).queryByRole('button', { name: C('counting.open') })).toBeNull()
  })

  it('requests nothing without platform.billing.read or platform.plans.read', async () => {
    who = { ...ADMIN, permissions: ['platform.tenants.manage'] }
    renderCards()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(ENTITLEMENTS_URL, expect.anything()))
    expect(screen.queryByRole('heading', { name: C('title') })).toBeNull()
    expect(fetchMock.mock.calls.filter(([url]) => url !== ENTITLEMENTS_URL)).toHaveLength(0)
  })
})

describe('Console › Tenant › Upgrade at no charge', () => {
  it('offers only bigger published plans and sends the plan with the reason', async () => {
    answers[PLANS] = () =>
      json(200, [plan('STARTER', 1), plan('BUSINESS', 2), plan('PRO', 3), plan('LEGACY', 4, false), plan('ENTERPRISE_X', 5)])
    answers[`PUT ${PLAN}`] = () => json(200, {})
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('upgrade.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: C('upgrade.plan') }))
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent)
    expect(options).toEqual(['Pro', 'Enterprise_x'])
    await user.click(screen.getByRole('option', { name: 'Pro' }))
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Goodwill after the outage')
    await user.click(within(dialog).getByRole('button', { name: C('upgrade.confirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('PUT', PLAN)!.body).toEqual({ planCode: 'PRO', reason: 'Goodwill after the outage' })
    // The plan route answers with the plan, so the card reads the subscription again.
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === SUBSCRIPTION)).toHaveLength(2))
  })

  it('does not send without a plan', async () => {
    answers[PLANS] = () => json(200, [plan('BUSINESS', 2), plan('PRO', 3)])
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('upgrade.open') }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('button', { name: C('upgrade.plan') })
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Goodwill')
    await user.click(within(dialog).getByRole('button', { name: C('upgrade.confirm') }))

    expect(await within(dialog).findAllByText(C('upgrade.planRequired'))).not.toHaveLength(0)
    expect(sent('PUT', PLAN)).toBeNull()
  })

  it('is not offered without platform.tenants.manage', async () => {
    who = { ...ADMIN, permissions: ADMIN.permissions.filter((p) => p !== 'platform.tenants.manage') }
    renderCards()

    expect((await card(C('title'))).queryByRole('button', { name: C('upgrade.open') })).toBeNull()
  })
})

describe('Console › Tenant › Cancel at once', () => {
  it('refuses a mistyped company code before sending, then proposes with the grounds, message and internal reason', async () => {
    answers[`POST ${CANCELLATIONS}`] = () => json(201, cancellation({ proposedBy: 'u-admin' }))
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('cancel.open') }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(new RegExp(C('cancel.restrictionsOff')))).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: C('cancel.category') }))
    await user.click(await screen.findByRole('option', { name: C('cancel.categories.FRAUD') }))
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(C('cancel.message')) }), 'Fraudulent invoices were sent.')
    const code = within(dialog).getByRole('textbox', { name: new RegExp(C('cancel.code', { code: 'FT1111' })) })
    await user.type(code, 'FT9999')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Chargeback ring')
    await user.click(within(dialog).getByRole('button', { name: C('cancel.confirm') }))

    expect(await within(dialog).findByText(C('cancel.codeMismatch'))).toBeTruthy()
    expect(sent('POST', CANCELLATIONS)).toBeNull()

    await user.clear(code)
    await user.type(code, 'ft1111')
    await user.click(within(dialog).getByRole('button', { name: C('cancel.confirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('POST', CANCELLATIONS)!.body).toEqual({
      category: 'FRAUD', internalReason: 'Chargeback ring', customerMessage: 'Fraudulent invoices were sent.', confirmTenantCode: 'ft1111',
    })
  })

  it('shows another operator the proposal with Confirm and Withdraw, and confirms it', async () => {
    answers[SUBSCRIPTION] = () => json(200, subscription({}, [], { fawtirCancellation: cancellation() }))
    answers[`POST ${CANCELLATIONS}/fc-1/confirmation`] = () => json(200, cancellation({ status: 'CONFIRMED' }))
    const user = userEvent.setup({ delay: null })
    renderCards()

    const sub = await card(C('title'))
    expect(sub.getByText(/Nasser Al Hinai/)).toBeTruthy()
    expect(sub.getByText(`${C('cancel.internal')}: Chargeback ring`)).toBeTruthy()
    expect(sub.queryByRole('button', { name: C('cancel.open') })).toBeNull()
    expect(sub.getByRole('button', { name: C('cancel.withdrawOpen') })).toBeTruthy()
    await user.click(sub.getByRole('button', { name: C('cancel.confirmOpen') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: C('cancel.confirmButton') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fetchMock.mock.calls.some(([url, init]) => url === `${CANCELLATIONS}/fc-1/confirmation` && init?.method === 'POST')).toBe(true)
  })

  it('shows the proposer that a second operator must confirm, without a Confirm button', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, subscription({}, [], { fawtirCancellation: cancellation({ proposedBy: 'u-admin' }) }))
    renderCards()

    const sub = await card(C('title'))
    expect(sub.getByText(C('cancel.waiting'))).toBeTruthy()
    expect(sub.queryByRole('button', { name: C('cancel.confirmOpen') })).toBeNull()
    expect(sub.getByRole('button', { name: C('cancel.withdrawOpen') })).toBeTruthy()
  })

  it('says in words that the proposer cannot confirm when the server refuses it', async () => {
    answers[SUBSCRIPTION] = () => json(200, subscription({}, [], { fawtirCancellation: cancellation() }))
    answers[`POST ${CANCELLATIONS}/fc-1/confirmation`] = () =>
      json(403, { type: 'https://api.fawtir.om/problems/same-operator' })
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('cancel.confirmOpen') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: C('cancel.confirmButton') }))

    expect(await within(dialog).findByText(C('refusal.sameOperator'))).toBeTruthy()
  })

  it('withdraws a proposal with a reason', async () => {
    answers[SUBSCRIPTION] = () => json(200, subscription({}, [], { fawtirCancellation: cancellation() }))
    answers[`POST ${CANCELLATIONS}/fc-1/withdrawal`] = () => json(200, cancellation({ status: 'WITHDRAWN' }))
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('title'))).getByRole('button', { name: C('cancel.withdrawOpen') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Wrong company')
    await user.click(within(dialog).getByRole('button', { name: C('cancel.withdrawConfirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('POST', `${CANCELLATIONS}/fc-1/withdrawal`)!.body).toEqual({ reason: 'Wrong company' })
  })

  it('shows a confirmed cancellation with who proposed and confirmed it, and offers no further action on it', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, subscription({ access: 'CANCELLED', trialDay: null, cancelAtPeriodEnd: true, accessEndsOn: '2026-10-15' }, [], {
        fawtirCancellation: cancellation({
          status: 'CONFIRMED', confirmedBy: 'u-admin', confirmedByName: 'Badr Billing', effectiveOn: '2026-10-16',
          outcome: { voidedBills: ['FB-2026-000123'], refundCases: [] },
        }),
      }))
    renderCards()

    const sub = await card(C('title'))
    expect(sub.getByText(new RegExp(C('cancel.cancelledTitle')))).toBeTruthy()
    expect(sub.getByText(/Badr Billing/)).toBeTruthy()
    expect(sub.getByText('FB-2026-000123')).toBeTruthy()
    expect(sub.queryByRole('button', { name: C('cancel.open') })).toBeNull()
    expect(sub.queryByRole('button', { name: C('cancel.confirmOpen') })).toBeNull()
    expect(sub.queryByRole('button', { name: C('upgrade.open') })).toBeNull()
  })

  it('is not offered while the server has it switched off, or to support', async () => {
    answers[SUBSCRIPTION] = () => json(200, subscription({}, [], { fawtirCancellationEnabled: false }))
    renderCards()
    expect((await card(C('title'))).queryByRole('button', { name: C('cancel.open') })).toBeNull()
  })
})

describe('Console › Tenant › Documents this month', () => {
  it('shows the allowance and the credits, and grants documents ending with the month', async () => {
    answers[EXTRA] = () =>
      json(200, extras([
        { id: 'c-1', source: 'PURCHASE', status: 'ACTIVE', documents: 50, netAmount: '5.000', startsOn: '2026-10-12', expiresOn: '2026-11-09', reason: null, createdBy: 'u-customer', createdAt: '2026-10-12T06:00:00Z' },
      ]))
    answers[`POST ${EXTRA}/grants`] = () => json(200, extras([], { extraDocuments: 150, totalAllowance: 1150 }))
    const user = userEvent.setup({ delay: null })
    renderCards()

    const docs = await card(C('allowance.title'))
    expect(docs.getByText(C('allowance.usedValue', { used: '320', total: '1,050', plan: '1,000', extra: '50' }))).toBeTruthy()
    expect(docs.getByText(C('allowance.creditLine', { source: C('allowance.source.PURCHASE'), documents: '50' }))).toBeTruthy()

    await user.click(docs.getByRole('button', { name: C('grant.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(C('grant.documents')) }), '100')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Platform outage')
    await user.click(within(dialog).getByRole('button', { name: C('grant.confirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // The server's default and latest expiry is the end of the allowance month.
    expect(sent('POST', `${EXTRA}/grants`)!.body).toEqual({ documents: 100, expiresOn: '2026-11-09', reason: 'Platform outage' })
    expect(
      (await card(C('allowance.title'))).getByText(C('allowance.usedValue', { used: '320', total: '1,150', plan: '1,000', extra: '150' })),
    ).toBeTruthy()
  })

  it('refuses a grant of 0 documents before sending', async () => {
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('allowance.title'))).getByRole('button', { name: C('grant.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(C('grant.documents')) }), '0')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Nothing')
    await user.click(within(dialog).getByRole('button', { name: C('grant.confirm') }))

    expect(await within(dialog).findByText(C('error.wholeBetween', { min: 1, max: '100,000' }))).toBeTruthy()
    expect(sent('POST', `${EXTRA}/grants`)).toBeNull()
  })
})

describe('Console › Tenant › Count received documents', () => {
  it('is not shown for a company that follows its plan', async () => {
    renderCards()

    await card(C('allowance.title'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === COUNTING)).toBe(true))
    expect(screen.queryByRole('heading', { name: C('counting.title') })).toBeNull()
  })

  it('switches it off for an Enterprise company with If-Match and the reason', async () => {
    answers[COUNTING] = () => json(200, counting({ version: 2, history: [
      { id: 'o-2', tenantId: TENANT, version: 2, countsReceived: true, effectiveFrom: '2026-10-10', reason: 'Contract', createdBy: 'u-other', createdAt: '2026-10-01T00:00:00Z' },
    ] }))
    answers[`PUT ${COUNTING}`] = () => json(200, counting({ version: 3, countsReceivedFromNext: false, history: [
      { id: 'o-3', tenantId: TENANT, version: 3, countsReceived: false, effectiveFrom: '2026-11-10', reason: 'New contract', createdBy: 'u-admin', createdAt: '2026-10-16T08:00:00Z' },
    ] }))
    const user = userEvent.setup({ delay: null })
    renderCards()

    const box = await card(C('counting.title'))
    // This month, from the next date, and the company's own setting.
    expect(box.getAllByText(C('counting.choice.on'))).toHaveLength(3)
    await user.click(box.getByRole('button', { name: C('counting.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: C('counting.setting') }))
    await user.click(await screen.findByRole('option', { name: C('counting.choice.off') }))
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'New contract')
    await user.click(within(dialog).getByRole('button', { name: C('counting.confirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const put = sent('PUT', COUNTING)!
    expect((put.init.headers as Record<string, string>)['If-Match']).toBe('"2"')
    expect(put.body).toEqual({ countsReceived: false, reason: 'New contract' })
  })

  it('says someone else changed it on a version conflict', async () => {
    answers[COUNTING] = () => json(200, counting())
    answers[`PUT ${COUNTING}`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/received-counting-version-conflict' })
    const user = userEvent.setup({ delay: null })
    renderCards()

    await user.click((await card(C('counting.title'))).getByRole('button', { name: C('counting.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: new RegExp(i18n.t('console.operators.reason.label')) }), 'Retry')
    await user.click(within(dialog).getByRole('button', { name: C('counting.confirm') }))

    expect(await within(dialog).findByText(C('refusal.countingConflict'))).toBeTruthy()
    // The withdrawn override is sent as null: back to the plan's setting.
    expect(sent('PUT', COUNTING)!.body).toEqual({ countsReceived: null, reason: 'Retry' })
  })
})

describe('Console › navigation', () => {
  it('no longer lists the sample-data Subscriptions screen', () => {
    expect(CONSOLE_ITEMS.map((item) => item.to)).not.toContain('/console/subscriptions')
  })
})

describe('Console › company › paid extras (P2-1 §3.14, read only)', () => {
  it('shows users and branches against included plus paid places, and the places, with no action', async () => {
    renderCards()
    const card = await screen.findByRole('region', { name: C('paidExtras.title') })
    expect(
      await within(card).findByText(C('paidExtras.kindValue', { inUse: '11', capacity: '11', included: '10', paid: '1' })),
    ).toBeTruthy()
    expect(within(card).getByText(C('paidExtras.addonNone'))).toBeTruthy()
    expect(within(card).getByText('1.694')).toBeTruthy()
    expect(within(card).queryByRole('button')).toBeNull()
  })

  it('says whether the add-on granted ERP, and why it ended', async () => {
    answers[PAID] = () =>
      json(200, paidExtras({ erpAddon: { offered: true, monthlyPrice: '20.000', status: 'ENDING', endsOn: '2026-10-31' } }, {
        tenantId: TENANT, status: 'ENDING', startedOn: '2026-10-02', endsOn: '2026-10-31', endReason: 'PLAN_DOWNGRADE',
        grantedEntitlement: true, changedBy: 'u-1', changedAt: '2026-10-12T08:00:00Z', version: 2,
      }))
    renderCards()
    const card = await screen.findByRole('region', { name: C('paidExtras.title') })
    expect(await within(card).findByText(C('paidExtras.grantedByAddon'))).toBeTruthy()
    expect(within(card).getByText(C('paidExtras.endReason.PLAN_DOWNGRADE'))).toBeTruthy()
  })

  it('is hidden without platform.billing.read', async () => {
    who = { ...ADMIN, permissions: ['platform.plans.read'] }
    renderCards()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(ENTITLEMENTS_URL, expect.anything()))
    expect(screen.queryByRole('region', { name: C('paidExtras.title') })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === PAID)).toBe(false)
  })
})
