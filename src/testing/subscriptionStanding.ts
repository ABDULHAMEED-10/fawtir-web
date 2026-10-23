import type { Mock } from 'vitest'
import { forgetSubscriptionStanding } from '../lib/subscriptionReadOnly'

/**
 * `GET /settings/subscription` with the server's restriction switch on, for tests of what a
 * read-only subscription hides (ST-2, CA-3). `null` is a usable subscription.
 */
export function standingWith(restriction: string | null) {
  return {
    tracked: true,
    access: restriction ? 'PAYMENT_REQUIRED' : 'ACTIVE',
    restrictionsEnforced: true,
    restriction,
    today: '2026-10-23',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodPrice: '80.000',
    trialStartsOn: null,
    trialEndsOn: null,
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: '2026-10-14',
    renewsOn: '2026-10-15',
    graceDays: 7,
    graceUntil: '2026-10-21',
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: null,
    enterprise: null,
  }
}

/**
 * Makes `fetchMock` answer `GET /api/v1/settings/subscription` with this standing and every other
 * request as it did before. The reader must hold `tenant.plan.read` for the page to ask.
 */
export function answerStanding(fetchMock: Mock, restriction: string | null) {
  forgetSubscriptionStanding()
  const before = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === '/api/v1/settings/subscription'
      ? new Response(JSON.stringify(standingWith(restriction)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      : before(url, init),
  )
}

/** Whether the page has asked for the subscription yet. */
export const standingRead = (fetchMock: Mock) =>
  fetchMock.mock.calls.some(([url]) => url === '/api/v1/settings/subscription')

/** Lets the page settle with the answer before checking that something is hidden. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
