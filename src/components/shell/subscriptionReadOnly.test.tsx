import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { ApiError, resetSharedRequests } from '../../api'
import type { SubscriptionStatusDto } from '../../api/settings/subscription'
import type { Entitlements } from '../../lib/identity/entitlements'
import { SessionContext } from '../../lib/session/session'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  forgetSubscriptionStanding,
  readOnlyReason,
  useSubscriptionAllows,
} from '../../lib/subscriptionReadOnly'
import { SubscriptionReadOnlyLine } from './SubscriptionReadOnlyLine'

/**
 * The read-only line and the hidden actions (business rules ST-1, ST-2, TR-3, TR-4, SU-3, SU-5,
 * CA-3). The server decides the state: `restriction` is filled only while `restrictionsEnforced`
 * is on, and with the switch off nothing is hidden and no line is shown, whatever `access` says.
 */

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'OWNER', name: 'Owner', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage', 'invoice.read'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...OWNER, permissions: ['tenant.plan.read', 'invoice.read'] }
const CLERK: Entitlements = { ...OWNER, permissions: ['invoice.read'] }

const ACTIVE: SubscriptionStatusDto = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: true,
  today: '2026-10-16',
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
  restriction: null,
}
const LAPSED = { paidThrough: '2026-09-30', renewsOn: '2026-10-01', graceUntil: '2026-10-07' }
const SUSPENDED: SubscriptionStatusDto = {
  ...ACTIVE,
  ...LAPSED,
  access: 'PAYMENT_REQUIRED',
  restriction: 'SUBSCRIPTION_SUSPENDED',
}
const TRIAL_ENDED: SubscriptionStatusDto = {
  ...ACTIVE,
  access: 'PAYMENT_REQUIRED',
  restriction: 'SUBSCRIPTION_SUSPENDED',
  trialStartsOn: '2026-09-24',
  trialEndsOn: '2026-10-07',
  paidThrough: null,
  renewsOn: null,
}
const CANCELLED: SubscriptionStatusDto = {
  ...ACTIVE,
  ...LAPSED,
  access: 'CANCELLED',
  restriction: 'SUBSCRIPTION_CANCELLED',
  cancelAtPeriodEnd: true,
  accessEndsOn: '2026-09-30',
}
const NOT_STARTED: SubscriptionStatusDto = {
  ...ACTIVE,
  access: 'PAYMENT_REQUIRED',
  restriction: 'SUBSCRIPTION_NOT_STARTED',
  paidThrough: null,
  renewsOn: null,
}
const ENTERPRISE_TERMS: SubscriptionStatusDto = {
  ...NOT_STARTED,
  tracked: false,
  access: 'NOT_TRACKED',
  planCode: 'ENTERPRISE',
  planName: 'Enterprise',
  enterprise: { termsSet: false },
}
/** Suspended by its dates, but the restrictions switch is off: the server fills no restriction. */
const SWITCH_OFF: SubscriptionStatusDto = {
  ...SUSPENDED,
  restrictionsEnforced: false,
  restriction: null,
}

const SUBSCRIPTION = '/api/v1/settings/subscription'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let answer: () => Response
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetSubscriptionStanding()
  answer = () => json(200, ACTIVE)
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    return url === SUBSCRIPTION ? answer() : json(404, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  forgetSubscriptionStanding()
  await i18n.changeLanguage('en')
})

const subscriptionReads = () =>
  fetchMock.mock.calls.filter(([input]) => String(input) === SUBSCRIPTION).length

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

/** Stands for a screen's restricted action: drawn only while the subscription allows it. */
function IssueButton() {
  return useSubscriptionAllows('ISSUE_DOCUMENTS') ? <button type="button">Issue</button> : null
}

function renderLine(session: Entitlements | null = OWNER, at = '/invoices') {
  return render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={[at]}>
        <SubscriptionReadOnlyLine />
        <IssueButton />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  )
}

describe('readOnlyReason: the server decides, the screen only picks the sentence', () => {
  it('names each read-only restriction', () => {
    expect(readOnlyReason(SUSPENDED)).toBe('suspended')
    expect(readOnlyReason(TRIAL_ENDED)).toBe('trialEnded')
    expect(readOnlyReason(CANCELLED)).toBe('cancelled')
    expect(readOnlyReason(NOT_STARTED)).toBe('notStarted')
    expect(readOnlyReason(ENTERPRISE_TERMS)).toBe('enterpriseTerms')
    expect(readOnlyReason({ ...SUSPENDED, restriction: 'SUBSCRIPTION_SOMETHING_NEW' })).toBe('generic')
  })

  it('is null while usable, with the switch off, or from a server that sends no restriction', () => {
    expect(readOnlyReason(ACTIVE)).toBeNull()
    expect(readOnlyReason({ ...ACTIVE, access: 'GRACE', graceUntil: '2026-10-20' })).toBeNull()
    expect(readOnlyReason({ ...ACTIVE, access: 'TRIAL', trialEndsOn: '2026-10-20' })).toBeNull()
    expect(readOnlyReason(SWITCH_OFF)).toBeNull()
    // Never worked out from the dates: a PAYMENT_REQUIRED access with no restriction is not read-only.
    const { restriction: _ignored, ...older } = SUSPENDED
    void _ignored
    expect(readOnlyReason({ ...older, restrictionsEnforced: true })).toBeNull()
  })
})

describe('the read-only line', () => {
  it.each([
    [SUSPENDED, 'Your subscription is read-only until the renewal is paid.'],
    [TRIAL_ENDED, 'Your free trial has ended. Your subscription is read-only until you pay.'],
    [CANCELLED, 'Your subscription has ended and is read-only until you renew it.'],
    [NOT_STARTED, 'Your subscription is read-only until your payment is confirmed.'],
  ])('says why and offers Pay, and hides the restricted action (%#)', async (status, sentence) => {
    answer = () => json(200, status)
    renderLine()
    expect((await screen.findByRole('status')).textContent).toContain(sentence)
    const pay = screen.getByRole('link', { name: 'Pay' })
    expect(pay.getAttribute('href')).toBe('/settings/bills')
    expect(screen.queryByRole('button', { name: 'Issue' })).toBeNull()

    fireEvent.click(pay)
    expect(screen.getByTestId('where').textContent).toBe('/settings/bills')
  })

  it('offers no Pay for Enterprise without terms: there is nothing to pay yet (SU-5)', async () => {
    answer = () => json(200, ENTERPRISE_TERMS)
    renderLine()
    expect((await screen.findByRole('status')).textContent).toBe(
      'Your subscription is read-only until the Fawtir team sets your Enterprise terms.',
    )
    expect(screen.queryByRole('link', { name: 'Pay' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Issue' })).toBeNull()
  })

  it('tells someone who may not pay who can, instead of a Pay they would be refused', async () => {
    answer = () => json(200, SUSPENDED)
    renderLine(READER)
    expect((await screen.findByRole('status')).textContent).toBe(
      'Your subscription is read-only until the renewal is paid. An administrator of your company can pay.',
    )
    expect(screen.queryByRole('link', { name: 'Pay' })).toBeNull()
  })

  it('does not repeat Pay on the bills page itself', async () => {
    answer = () => json(200, SUSPENDED)
    renderLine(OWNER, '/settings/bills')
    await screen.findByRole('status')
    expect(screen.queryByRole('link', { name: 'Pay' })).toBeNull()
  })

  it('shows nothing and hides nothing while the subscription is usable', async () => {
    renderLine()
    await waitFor(() => expect(subscriptionReads()).toBe(1))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Issue' })).toBeTruthy()
  })

  it('shows nothing and hides nothing with the backend switch off', async () => {
    answer = () => json(200, SWITCH_OFF)
    renderLine()
    await waitFor(() => expect(subscriptionReads()).toBe(1))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Issue' })).toBeTruthy()
  })

  it('keeps every action when the subscription cannot be read: the server still refuses', async () => {
    answer = () => json(500, { status: 500 })
    renderLine()
    await waitFor(() => expect(subscriptionReads()).toBe(1))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Issue' })).toBeTruthy()
  })

  it('does not ask for the subscription without permission to read it', async () => {
    answer = () => json(200, SUSPENDED)
    renderLine(CLERK)
    expect(screen.getByRole('button', { name: 'Issue' })).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(subscriptionReads()).toBe(0)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('asks once for many readers on one screen', async () => {
    answer = () => json(200, SUSPENDED)
    render(
      <SessionContext.Provider value={OWNER}>
        <MemoryRouter>
          <SubscriptionReadOnlyLine />
          <IssueButton />
          <IssueButton />
          <IssueButton />
        </MemoryRouter>
      </SessionContext.Provider>,
    )
    await screen.findByRole('status')
    expect(subscriptionReads()).toBe(1)
  })

  it('speaks Arabic', async () => {
    await i18n.changeLanguage('ar')
    answer = () => json(200, SUSPENDED)
    renderLine()
    expect((await screen.findByRole('status')).textContent).toContain(
      'اشتراكك للقراءة فقط حتى تُدفع مطالبة التجديد.',
    )
    expect(screen.getByRole('link', { name: 'ادفع' })).toBeTruthy()
  })
})

describe('a SUBSCRIPTION_SUSPENDED refusal after the free trial ended (E26)', () => {
  const refused = () =>
    new ApiError({
      status: 409,
      problemType: 'subscription-restricted',
      code: 'SUBSCRIPTION_SUSPENDED',
      correlationId: 'corr-1',
      problem: { code: 'SUBSCRIPTION_SUSPENDED', action: 'ISSUE_DOCUMENTS' },
    })
  const sentence = () => i18n.t(describeApiFailure(refused()).key)

  it('says the trial ended, not that a renewal is unpaid, in English and Arabic', async () => {
    answer = () => json(200, TRIAL_ENDED)
    renderLine()
    await screen.findByRole('status')
    expect(sentence()).toBe(
      'Your free trial has ended and your subscription is read-only until you choose a plan and pay.',
    )
    await i18n.changeLanguage('ar')
    expect(sentence()).toBe(
      'انتهت الفترة التجريبية المجانية، واشتراكك الآن للقراءة فقط إلى أن تختار باقة وتدفع.',
    )
  })

  it('keeps the unpaid-bill sentence for a suspended paid subscription', async () => {
    answer = () => json(200, SUSPENDED)
    renderLine()
    await screen.findByRole('status')
    expect(describeApiFailure(refused()).key).toBe('apiErrors.subscriptionRestricted.suspended')
  })

  it('keeps the unpaid-bill sentence when the screen does not hold the subscription', async () => {
    answer = () => json(200, TRIAL_ENDED)
    renderLine(CLERK)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(describeApiFailure(refused()).key).toBe('apiErrors.subscriptionRestricted.suspended')
  })
})
