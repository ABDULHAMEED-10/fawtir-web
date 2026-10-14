import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allowedRoute,
  buildPaymentPreferenceRequest,
  buildPlanRequest,
  recordBusinessProfile,
} from './onboarding'
import { onboardingStateFromStatus } from './signupDraft'
import { baisaOf, readPublicPlans, readSignupPlans } from './signupPlans'
import { requestSignupResume, verifySignupResume } from './signupResume'
import type { SignupStatusResponse } from './onboarding'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
const sent = () =>
  (fetchMock.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({
    url,
    method: init.method,
    body: init.body ? (JSON.parse(init.body as string) as unknown) : undefined,
  }))

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('plan and payment preference (contract §1-§2)', () => {
  it('maps the flow ids to the contract codes, with no cycle for Enterprise', () => {
    expect(buildPlanRequest('starter', 'monthly')).toEqual({
      planCode: 'STARTER',
      billingCycle: 'MONTHLY',
    })
    expect(buildPlanRequest('premium', 'annual')).toEqual({
      planCode: 'BUSINESS',
      billingCycle: 'ANNUAL',
    })
    expect(buildPlanRequest('businessPlus', 'annual').planCode).toBe('BUSINESS_PLUS')
    expect(buildPlanRequest('enterprise', 'annual')).toEqual({
      planCode: 'ENTERPRISE',
      billingCycle: null,
    })
  })

  it('sends the price version the screen showed, never for Enterprise (catalogue contract §10)', () => {
    expect(buildPlanRequest('premium', 'monthly', 'pv-7')).toEqual({
      planCode: 'BUSINESS',
      billingCycle: 'MONTHLY',
      priceVersionId: 'pv-7',
    })
    expect(buildPlanRequest('enterprise', 'monthly', 'pv-7')).toEqual({
      planCode: 'ENTERPRISE',
      billingCycle: null,
    })
    // A plan published in the console since the launch is sent under its own code.
    expect(buildPlanRequest('GROWTH', 'annual', 'pv-g').planCode).toBe('GROWTH')
  })

  it('sends a trial with no method, and pay-now with its method and no link channel', () => {
    expect(buildPaymentPreferenceRequest({ enrollment: 'trial' }, true)).toEqual({
      enrollment: 'TRIAL',
      method: null,
      erpExtractionAddon: true,
    })
    expect(
      buildPaymentPreferenceRequest({ enrollment: 'payNow', method: 'cardLink' }, false),
    ).toEqual({ enrollment: 'PAY_NOW', method: 'CARD_LINK', erpExtractionAddon: false })
    expect(
      buildPaymentPreferenceRequest({ enrollment: 'payNow', method: 'bankTransfer' }, false),
    ).toEqual({ enrollment: 'PAY_NOW', method: 'BANK_TRANSFER', erpExtractionAddon: false })
    expect(
      buildPaymentPreferenceRequest({ enrollment: 'payNow', method: 'cash' }, false),
    ).not.toHaveProperty('linkChannel')
  })

  it('routes the new PLAN and PAYMENT stages to their screens', () => {
    expect(allowedRoute('PLAN', '/signup-review')).toBe('/plans')
    expect(allowedRoute('PAYMENT', '/plans')).toBe('/plans')
    expect(allowedRoute('PAYMENT', '/signup-review')).toBe('/payment')
  })
})

describe('business profile (contract §5)', () => {
  it('always says whether POS is used, so no placeholder trade is needed', async () => {
    await recordBusinessProfile('so.t', 'just-me', 'paper', false)
    expect(sent()).toEqual([
      {
        url: '/api/v1/auth/signup/business-profile',
        method: 'POST',
        body: {
          onboardingToken: 'so.t',
          businessSize: 'JUST_ME',
          invoicingMethod: 'PAPER_OR_MANUAL',
          usesPos: false,
        },
      },
    ])
  })
})

describe('resume (contract §6-§7)', () => {
  it('asks for a code with the email alone and reads nothing back', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }))
    await expect(requestSignupResume(' owner@alnoor.test ')).resolves.toBeUndefined()
    expect(sent()).toEqual([
      { url: '/api/v1/auth/signup/resume', method: 'POST', body: { email: 'owner@alnoor.test' } },
    ])
  })

  it('exchanges the code for a fresh onboarding token', async () => {
    fetchMock.mockResolvedValue(
      json(200, { onboardingToken: 'so.new', onboardingTokenExpiresAt: '2026-10-09T12:00:00Z' }),
    )
    await expect(verifySignupResume('owner@alnoor.test', '123456')).resolves.toEqual({
      onboardingToken: 'so.new',
      onboardingTokenExpiresAt: '2026-10-09T12:00:00Z',
    })
    expect(sent()[0]).toEqual({
      url: '/api/v1/auth/signup/resume/verify',
      method: 'POST',
      body: { email: 'owner@alnoor.test', code: '123456' },
    })
  })
})

describe('the published catalogue (catalogue contract §9)', () => {
  const row = (code: string, sortOrder: number) => ({
    code,
    nameEn: code,
    nameAr: null,
    descriptionEn: null,
    descriptionAr: null,
    currency: 'OMR',
    priceVersionId: `pv-${code}`,
    monthlyPrice: '80.000',
    annualPrice: '800.000',
    annualFreeMonths: 2,
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    extraPersonPrice: '2.500',
    branchesIncluded: 2,
    extraBranchPrice: '8.000',
    overagePricePerInvoice: '0.060',
    apiAccess: false,
    prioritySupport: true,
    recommended: true,
    trialDays: 14,
    trialDocuments: 25,
    features: [{ key: 'pos', enabled: true }],
    sortOrder,
  })

  it('reads the plans anonymously with a GET, in sort order, keeping prices as strings', async () => {
    fetchMock.mockResolvedValue(json(200, [row('B', 20), row('A', 10)]))
    const plans = await readSignupPlans()
    expect(plans.map((plan) => plan.code)).toEqual(['A', 'B'])
    expect(plans[0].monthlyPrice).toBe('80.000')
    expect(sent()).toEqual([{ url: '/api/v1/auth/signup/plans', method: 'GET', body: undefined }])
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('omit')
  })

  it('serves the public site from its own alias', async () => {
    fetchMock.mockResolvedValue(json(200, [row('A', 1)]))
    await readPublicPlans()
    expect(sent()).toEqual([{ url: '/api/v1/public/plans', method: 'GET', body: undefined }])
  })

  it('refuses a body that is not a list rather than reading it as no plans', async () => {
    fetchMock.mockResolvedValue(json(200, { plans: [] }))
    await expect(readSignupPlans()).rejects.toThrow()
  })

  it('turns a three-decimal amount into baisa with no float, and nothing else', () => {
    expect(baisaOf('80.000')).toBe(80_000)
    expect(baisaOf('0.150')).toBe(150)
    expect(baisaOf('1500.5')).toBe(1_500_500)
    expect(baisaOf('12')).toBe(12_000)
    expect(baisaOf('1.2345')).toBeNull()
    expect(baisaOf('-1.000')).toBeNull()
    expect(baisaOf(null)).toBeNull()
  })
})

describe('restoring the draft from the status read (contract §4)', () => {
  const base: SignupStatusResponse = {
    stage: 'READY_FOR_SUBMISSION',
    businessProfileComplete: true,
    businessCategoryComplete: true,
    businessTypeComplete: true,
    businessIdentityComplete: true,
    addressContactComplete: true,
    submitted: false,
    verificationStatus: null,
    loginEnabled: false,
  }

  it('drops a cached trade and payment the server says do not apply', () => {
    const restored = onboardingStateFromStatus(
      {
        ...base,
        plan: { planCode: 'ENTERPRISE', billingCycle: null },
        draft: { businessProfile: { businessSize: 'JUST_ME', invoicingMethod: 'SPREADSHEETS', usesPos: false } },
      },
      { businessType: 'food-beverage', subBusinessType: 'bakery', paymentMethod: 'cash' },
    )
    expect(restored).toMatchObject({
      businessSize: 'just-me',
      invoicingMethod: 'spreadsheets',
      usesPos: false,
      plan: 'enterprise',
      restored: true,
    })
    expect(restored.businessType).toBeUndefined()
    expect(restored.subBusinessType).toBeUndefined()
    expect(restored.paymentMethod).toBeUndefined()
  })

  it('keeps the cached answers an older server does not return', () => {
    const restored = onboardingStateFromStatus(base, { businessSize: '2-10', accountEmail: 'a@b.om' })
    expect(restored).toEqual({ businessSize: '2-10', accountEmail: 'a@b.om', restored: true })
  })

  it('carries a correctable rejection, its deadline and a held payment; never for a closed application', () => {
    const payment = { method: 'CASH' as const, status: 'SUBMITTED', amount: '84.000', reference: null, hasProof: false }
    const reopened = onboardingStateFromStatus({
      ...base,
      verificationStatus: 'REJECTED',
      closed: false,
      rejectionReason: 'COMPANY_PROFILE_MISMATCH',
      correctableUntil: '2026-10-28',
      signupPayment: payment,
    })
    expect(reopened).toMatchObject({
      rejectionReason: 'COMPANY_PROFILE_MISMATCH',
      correctableUntil: '2026-10-28',
      paidWithApplication: true,
    })
    const closed = onboardingStateFromStatus(
      { ...base, closed: true, rejectionReason: 'COMPANY_PROFILE_MISMATCH', signupPayment: payment },
      reopened,
    )
    expect(closed.rejectionReason).toBeUndefined()
    expect(closed.correctableUntil).toBeUndefined()
    expect(closed.paidWithApplication).toBeUndefined()
    // An older server sends neither field: nothing is claimed, and a cached reason is not kept.
    expect(onboardingStateFromStatus(base, reopened).rejectionReason).toBeUndefined()
  })

  it('does not guess a governorate it cannot name', () => {
    const restored = onboardingStateFromStatus({
      ...base,
      draft: { addressContact: { addressLine: 'Building 4', city: 'Sohar', governorate: 'Atlantis' } },
    })
    expect(restored.address).toBeUndefined()
  })

  it('keeps the server-computed amounts, and a code the app has no id for as the plan', () => {
    const plan = {
      planCode: 'GROWTH',
      billingCycle: 'MONTHLY' as const,
      amountExclVat: '61.250',
      vatRate: '0.05',
      vatAmount: '3.063',
      amountInclVat: '64.313',
      trialDays: null,
    }
    const restored = onboardingStateFromStatus(
      { ...base, plan },
      { plan: 'starter', planNames: { en: 'Starter', ar: null } },
    )
    expect(restored.plan).toBe('GROWTH')
    expect(restored.planTerms).toEqual(plan)
    // The cached names belonged to another plan.
    expect(restored.planNames).toBeUndefined()
  })
})
