import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allowedRoute,
  buildPaymentPreferenceRequest,
  buildPlanRequest,
  recordBusinessProfile,
} from './onboarding'
import { onboardingStateFromStatus } from './signupDraft'
import { readSignupPlans } from './signupPlans'
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

  it('sends a link channel for a card only', () => {
    expect(buildPaymentPreferenceRequest('cardLink', 'whatsapp', true)).toEqual({
      method: 'CARD_LINK',
      linkChannel: 'WHATSAPP',
      erpExtractionAddon: true,
    })
    expect(buildPaymentPreferenceRequest('bankTransfer', 'whatsapp', false)).toEqual({
      method: 'BANK_TRANSFER',
      linkChannel: null,
      erpExtractionAddon: false,
    })
    expect(buildPaymentPreferenceRequest('cash', 'email', false).linkChannel).toBeNull()
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

describe('the published catalogue (contract §9, not drawn yet)', () => {
  it('reads the active plans with a GET and keeps prices as strings', async () => {
    const row = {
      code: 'BUSINESS',
      monthlyPrice: '49.000',
      invoicesPerMonth: 1000,
      peopleIncluded: 5,
      extraPersonPrice: '2.500',
      branchesIncluded: 2,
      apiAccess: false,
      prioritySupport: true,
      overagePricePerInvoice: '0.060',
      sortOrder: 2,
    }
    fetchMock.mockResolvedValue(json(200, [row]))
    await expect(readSignupPlans()).resolves.toEqual([row])
    expect(sent()).toEqual([{ url: '/api/v1/auth/signup/plans', method: 'GET', body: undefined }])
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

  it('does not guess a governorate it cannot name', () => {
    const restored = onboardingStateFromStatus({
      ...base,
      draft: { addressContact: { addressLine: 'Building 4', city: 'Sohar', governorate: 'Atlantis' } },
    })
    expect(restored.address).toBeUndefined()
  })
})
