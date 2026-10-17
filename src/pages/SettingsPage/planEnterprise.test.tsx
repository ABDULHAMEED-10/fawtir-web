import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { PlanPage } from './PlanPage'

/**
 * Plan and usage for an Enterprise company (PL-1, SU-5; P2-5 §3.10): no plan list to move to, the
 * terms agreed with Fawtir, the fallback plan never shown as the company's before its terms are
 * set, and new terms waiting for the renewal named as such, without a way to withdraw them.
 */
const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading LLC',
  roles: [{ id: 'r-1', code: 'OWNER', name: 'Owner', systemRole: true }],
  permissions: ['tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PLAN = '/api/v1/settings/plan'
const SUBSCRIPTION = '/api/v1/settings/subscription'
const PUBLIC_PLANS = '/api/v1/public/plans'

const STATUS = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: false,
  today: '2026-10-16',
  planCode: 'ENT_7A1C0B524F0E',
  planName: 'Enterprise',
  billingCycle: 'MONTHLY',
  periodPrice: '400.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-11-09',
  renewsOn: '2026-11-10',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
  enterprise: { termsSet: true },
}

const OVERVIEW = {
  plan: {
    code: 'ENT_7A1C0B524F0E',
    name: 'Enterprise',
    invoicesPerMonth: 4000,
    peopleIncluded: 20,
    branchesIncluded: 8,
    monthlyPrice: '400.000',
  },
  usage: {
    period: { start: '2026-10-10', end: '2026-11-09', today: '2026-10-16' },
    used: 1210,
    resubmissions: 0,
    quota: 4000,
    raisedToday: 61,
  },
  activePeople: 14,
  openInvitations: 0,
  activeBranches: 6,
  allowance: null,
  enterprise: { termsSet: true },
}

const CATALOGUE = [
  {
    code: 'BUSINESS',
    nameEn: 'Business',
    nameAr: 'الأعمال',
    currency: 'OMR',
    priceVersionId: 'p-1',
    monthlyPrice: '80.000',
    annualPrice: '800.000',
    annualFreeMonths: 2,
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    branchesIncluded: 2,
    extraPersonPrice: null,
    extraBranchPrice: null,
    overagePricePerInvoice: '0.060',
    apiAccess: false,
    prioritySupport: false,
    recommended: true,
    features: [],
    sortOrder: 2,
  },
]

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
    [SUBSCRIPTION]: () => json(200, STATUS),
    [PUBLIC_PLANS]: () => json(200, CATALOGUE),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, OWNER)
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

describe('Plan and usage for an Enterprise company', () => {
  it('shows its own plan and the agreed-terms text, and no plans to move to', async () => {
    renderPlan()
    await screen.findByText('Your plan: Enterprise')
    expect(screen.getByText(i18n.t('plan.enterprise.agreed'))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('plans.talkToTeam') }).getAttribute('href'),
    ).toBe('/contact')
    // The catalogue's plans are not offered, nor the "change your plan" rule.
    expect(screen.queryByText('Business')).toBeNull()
    expect(screen.queryByText(i18n.t('plan.changeRule'), { exact: false })).toBeNull()
  })

  it('before terms are set, says they are being prepared and shows none of the fallback plan', async () => {
    answers[PLAN] = () =>
      json(200, {
        ...OVERVIEW,
        plan: {
          code: 'BUSINESS',
          name: 'Business',
          invoicesPerMonth: 1000,
          peopleIncluded: 5,
          branchesIncluded: 2,
        },
        enterprise: { termsSet: false },
      })
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...STATUS,
        tracked: false,
        access: 'NOT_TRACKED',
        planCode: 'ENTERPRISE',
        billingCycle: null,
        periodPrice: null,
        paidThrough: null,
        renewsOn: null,
        enterprise: { termsSet: false },
      })
    renderPlan()
    await screen.findByText(i18n.t('plan.enterprise.preparing'))
    expect(screen.queryByText(/Your plan:/)).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('Business')).toBeNull()
  })

  it('names new terms waiting for the renewal, with their price, and offers no withdrawal', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...STATUS,
        scheduledChange: {
          planCode: 'ENT_7A1C0B524F0E',
          planName: 'Enterprise',
          billingCycle: 'MONTHLY',
          periodPrice: '450.000',
          effectiveOn: '2026-11-10',
        },
      })
    renderPlan()
    const line = await screen.findByText(/your Enterprise terms change to/)
    expect(line.textContent).toContain('10 Nov 2026')
    expect(line.textContent).toContain('450.000')
    expect(line.textContent).toContain('a month')
    expect(screen.queryByRole('button', { name: i18n.t('subscription.withdrawChange') })).toBeNull()
  })

  it('keeps the withdrawal for a downgrade a non-Enterprise company scheduled itself', async () => {
    answers[SUBSCRIPTION] = () =>
      json(200, {
        ...STATUS,
        planCode: 'BUSINESS',
        planName: 'Business',
        enterprise: null,
        scheduledChange: {
          planCode: 'STARTER',
          planName: 'Starter',
          billingCycle: 'MONTHLY',
          periodPrice: '35.000',
          effectiveOn: '2026-11-10',
        },
      })
    answers[PLAN] = () => json(200, { ...OVERVIEW, enterprise: null })
    renderPlan()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: i18n.t('subscription.withdrawChange') }),
      ).toBeTruthy(),
    )
  })

  it('reads the default Enterprise name in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderPlan()
    await screen.findByText(`${i18n.t('plan.yourPlan')}: المؤسسات`)
    expect(screen.getByText(i18n.t('plan.enterprise.agreed'))).toBeTruthy()
  })
})
