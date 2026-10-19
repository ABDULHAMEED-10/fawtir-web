import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { formatDate } from '../../lib/format'
import { cancellationPreview, type SubscriptionStatusDto } from '../../api/settings/subscription'
import { PlanPage } from './PlanPage'

/**
 * CA-1: the cancel dialog's date is the server's `cancellationEndsOn`, the end of the period in
 * progress, and a period paid in advance (that end before `paidThrough`) is said to be refunded.
 * A server without the field keeps the earlier date: paid-through while paid, else the trial's end.
 * After cancelling, the end shown is `accessEndsOn`.
 */
const MANAGER = {
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

const PLAN_OVERVIEW = {
  plan: {
    code: 'BUSINESS',
    name: 'Business',
    invoicesPerMonth: 500,
    peopleIncluded: 5,
    branchesIncluded: 2,
  },
  usage: {
    period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-18' },
    used: 12,
    resubmissions: 0,
    quota: 500,
    raisedToday: 1,
  },
  activePeople: 1,
  openInvitations: 0,
  activeBranches: 1,
}

/** Paid to 22 Dec: the period in progress ends 22 Nov, the next month is paid in advance. */
const PAID_AHEAD = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: false,
  today: '2026-10-18',
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodPrice: '80.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-12-22',
  renewsOn: '2026-12-23',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
  cancellationEndsOn: '2026-11-22',
  paidAheadRefundedFrom: null,
}
const NOT_AHEAD = {
  ...PAID_AHEAD,
  paidThrough: '2026-11-22',
  renewsOn: '2026-11-23',
  cancellationEndsOn: '2026-11-22',
}
const OLD_SERVER: Record<string, unknown> = { ...PAID_AHEAD }
delete OLD_SERVER.cancellationEndsOn
delete OLD_SERVER.paidAheadRefundedFrom
const CANCELLED_AHEAD = {
  ...PAID_AHEAD,
  cancelAtPeriodEnd: true,
  accessEndsOn: '2026-11-22',
  renewsOn: null,
  cancellationEndsOn: null,
  paidAheadRefundedFrom: '2026-11-23',
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
    [SUBSCRIPTION]: () => json(200, PAID_AHEAD),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
      const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
      const answer = answers[key]
      return answer ? answer() : json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
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

const section = () => screen.getByRole('region', { name: i18n.t('subscription.title') })

async function openDialog() {
  const user = userEvent.setup({ delay: null })
  renderPlan()
  await user.click(await screen.findByRole('button', { name: i18n.t('subscription.cancel') }))
  return { user, dialog: screen.getByRole('dialog') }
}

describe('cancellationPreview', () => {
  const status = (over: Record<string, unknown>) =>
    ({ ...PAID_AHEAD, ...over }) as SubscriptionStatusDto
  it('takes cancellationEndsOn, and a refund only when it falls before paidThrough', () => {
    expect(cancellationPreview(status({}))).toEqual({
      endsOn: '2026-11-22',
      refundsPaidAhead: true,
    })
    expect(cancellationPreview(NOT_AHEAD as SubscriptionStatusDto)).toEqual({
      endsOn: '2026-11-22',
      refundsPaidAhead: false,
    })
  })
  it('keeps the earlier dates on a server without the field', () => {
    expect(cancellationPreview(OLD_SERVER as SubscriptionStatusDto)).toEqual({
      endsOn: '2026-12-22',
      refundsPaidAhead: false,
    })
    expect(
      cancellationPreview(
        status({
          access: 'TRIAL',
          paidThrough: null,
          trialEndsOn: '2026-10-22',
          cancellationEndsOn: undefined,
        }),
      ),
    ).toEqual({ endsOn: '2026-10-22', refundsPaidAhead: false })
  })
})

describe('Settings › Plan: cancelling with a period paid in advance (CA-1)', () => {
  it('names the end of the period in progress and says the paid-ahead period is refunded', async () => {
    const { dialog } = await openDialog()
    expect(
      within(dialog).getByText(
        i18n.t('subscription.cancelConfirm.bodyPaidAhead', { date: '22 Nov 2026' }),
      ),
    ).toBeTruthy()
    expect(dialog.textContent).not.toContain('Payments already made are not refunded')
    expect(dialog.textContent).toContain('The period you paid in advance will be refunded.')
  })

  it('keeps the usual words when nothing is paid in advance', async () => {
    answers[SUBSCRIPTION] = () => json(200, NOT_AHEAD)
    const { dialog } = await openDialog()
    expect(
      within(dialog).getByText(i18n.t('subscription.cancelConfirm.body', { date: '22 Nov 2026' })),
    ).toBeTruthy()
  })

  it('uses paidThrough, without the refund sentence, on a server without the field', async () => {
    answers[SUBSCRIPTION] = () => json(200, OLD_SERVER)
    const { dialog } = await openDialog()
    expect(
      within(dialog).getByText(i18n.t('subscription.cancelConfirm.body', { date: '22 Dec 2026' })),
    ).toBeTruthy()
  })

  it('shows the access end from accessEndsOn once cancelled', async () => {
    answers[`POST ${SUBSCRIPTION}/cancellation`] = () => json(200, CANCELLED_AHEAD)
    const { user } = await openDialog()
    await user.click(
      screen.getByRole('button', { name: i18n.t('subscription.cancelConfirm.confirm') }),
    )
    expect(
      await within(section()).findByText(
        i18n.t('subscription.notice.cancelScheduled', { date: '22 Nov 2026' }),
      ),
    ).toBeTruthy()
    expect(
      within(section()).getByText(i18n.t('subscription.fact.endsOn', { date: '22 Nov 2026' })),
    ).toBeTruthy()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const { dialog } = await openDialog()
    const date = formatDate('2026-11-22', 'ar')
    expect(dialog.textContent).toContain(`يبقى اشتراكك فعّالًا حتى ${date}.`)
    expect(dialog.textContent).toContain('سيُسترد مبلغ الفترة التي دفعتها مسبقًا.')
    expect(dialog.textContent).not.toContain('لا تُستردّ المبالغ المدفوعة مسبقًا')
  })
})
