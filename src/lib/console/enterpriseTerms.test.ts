import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api'
import {
  annualFromMonthly,
  describeEnterpriseTermsFailure,
  enterpriseFormFrom,
  enterpriseListPath,
  quoteChargesVat,
  saveEnterpriseTerms,
  toEnterpriseRequest,
  validateEnterpriseForm,
  validateReason,
  type EnterpriseTermsDto,
} from './enterpriseTerms'
import type { CatalogueAdminPlan } from './planCatalogue'

const PLAN: CatalogueAdminPlan = {
  code: 'ENT_7A1C0B524F0E',
  nameEn: 'Enterprise',
  nameAr: 'المؤسسات',
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: false,
  recommended: false,
  sortOrder: 10000,
  annualFreeMonths: 2,
  trialDays: null,
  trialDocuments: null,
  version: 2,
  currentVersion: {
    id: 'v-2',
    planCode: 'ENT_7A1C0B524F0E',
    versionNumber: 2,
    effectiveFrom: '2026-10-15T09:00:00Z',
    monthlyPrice: '450.000',
    annualPrice: '4200.000',
    invoicesPerMonth: 5000,
    peopleIncluded: 25,
    extraPersonPrice: '4.000',
    branchesIncluded: null,
    extraBranchPrice: null,
    overagePricePerInvoice: '0.040',
    erpAddonMonthlyPrice: '60',
    apiAccess: true,
    prioritySupport: false,
    reason: 'Renewal',
    createdBy: 'u-1',
    createdAt: '2026-10-15T09:00:00Z',
  },
  features: [
    { key: 'peppol', enabled: true, compliance: true },
    { key: 'erpMapping', enabled: true },
    { key: 'futureFeature', enabled: true },
  ],
}

const NONE: EnterpriseTermsDto = {
  tenantId: 't-1',
  state: 'TERMS_NOT_SET',
  version: 0,
  plan: null,
  inForce: null,
  pending: null,
  nextBill: null,
  history: [],
}

const SET: EnterpriseTermsDto = {
  ...NONE,
  state: 'BILLING_STARTED',
  version: 2,
  plan: PLAN,
  inForce: {
    planCode: PLAN.code,
    planVersionId: 'v-1',
    planVersionNumber: 1,
    billingCycle: 'MONTHLY',
  },
  pending: {
    planCode: PLAN.code,
    planVersionId: 'v-2',
    planVersionNumber: 2,
    billingCycle: 'ANNUAL',
    effectiveOn: '2026-11-10',
  },
  history: [
    {
      id: 'h-1',
      tenantId: 't-1',
      planCode: PLAN.code,
      planVersionId: 'v-2',
      kind: 'CHANGED',
      applyFrom: 'NEXT_RENEWAL',
      effectiveOn: '2026-11-10',
      billingCycle: 'ANNUAL',
      contractReference: 'FWT-ENT-14',
      reason: 'Renewal',
      createdBy: 'u-1',
      createdAt: '2026-10-15T09:00:00Z',
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Enterprise terms form', () => {
  it('starts empty, monthly, with only the compliance features on', () => {
    const form = enterpriseFormFrom(NONE)
    expect(form.monthlyPrice).toBe('')
    expect(form.billingCycle).toBe('MONTHLY')
    expect(form.annualTouched).toBe(false)
    expect(form.features.peppol).toBe(true)
    expect(form.features.erpMapping).toBe(false)
  })

  it('reads the newest version, the waiting cycle and the last contract reference', () => {
    const form = enterpriseFormFrom(SET)
    expect(form.monthlyPrice).toBe('450.000')
    expect(form.annualPrice).toBe('4200.000')
    // 4,200 is not 450 x 10: a negotiated annual price, kept as typed.
    expect(form.annualTouched).toBe(true)
    expect(form.branchesIncluded).toBe('')
    expect(form.billingCycle).toBe('ANNUAL')
    expect(form.contractReference).toBe('FWT-ENT-14')
    expect(form.features.erpMapping).toBe(true)
    expect(form.erpAddonMonthlyPrice).toBe('60.000')
    expect(enterpriseFormFrom(NONE).erpAddonMonthlyPrice).toBe('')
  })

  it('takes an ERP add-on price above zero, only with ERP field mapping on (ER-1)', () => {
    const form = enterpriseFormFrom(SET)
    expect(validateEnterpriseForm({ ...form, erpAddonMonthlyPrice: '0' })).toEqual({
      erpAddonMonthlyPrice: 'console.enterpriseTerms.validation.erpAddonAboveZero',
    })
    expect(validateEnterpriseForm({ ...form, erpAddonMonthlyPrice: '1.0001' })).toEqual({
      erpAddonMonthlyPrice: 'console.plans.validation.money',
    })
    const noMapping = { ...form, features: { ...form.features, erpMapping: false } }
    expect(validateEnterpriseForm(noMapping)).toEqual({
      erpAddonMonthlyPrice: 'console.enterpriseTerms.validation.erpAddonNeedsMapping',
    })
    // Empty is "not offered as a paid add-on", whatever the features say.
    expect(validateEnterpriseForm({ ...noMapping, erpAddonMonthlyPrice: ' ' })).toEqual({})
    expect(toEnterpriseRequest(form, PLAN).erpAddonMonthlyPrice).toBe('60.000')
    const notOffered = toEnterpriseRequest({ ...form, erpAddonMonthlyPrice: '' }, PLAN)
    expect(notOffered.erpAddonMonthlyPrice).toBeNull()
  })

  it('prices a year at the monthly price times ten (PL-4)', () => {
    expect(annualFromMonthly('450')).toBe('4500.000')
    expect(annualFromMonthly('12.345')).toBe('123.450')
    expect(annualFromMonthly('abc')).toBe('')
  })

  it('refuses what the server refuses: missing limits, a fourth decimal, a zero count', () => {
    const errors = validateEnterpriseForm({
      ...enterpriseFormFrom(NONE),
      monthlyPrice: '10.0001',
      invoicesPerMonth: '0',
      peopleIncluded: '',
      branchesIncluded: '2.5',
      contractReference: 'x'.repeat(101),
    })
    expect(errors).toEqual({
      monthlyPrice: 'console.plans.validation.money',
      invoicesPerMonth: 'console.plans.validation.atLeastOne',
      peopleIncluded: 'validation.required',
      branchesIncluded: 'console.plans.validation.whole',
      contractReference: 'console.enterpriseTerms.validation.contractLength',
    })
    expect(validateEnterpriseForm(enterpriseFormFrom(SET))).toEqual({})
    expect(validateReason('  ')).toBe('console.plans.validation.reasonRequired')
    expect(validateReason('Contract signed')).toBeUndefined()
  })

  it('builds the request field by field, amounts at three decimals, unknown features kept', () => {
    const form = {
      ...enterpriseFormFrom(SET),
      monthlyPrice: '500',
      nameAr: '  ',
      extraPersonPrice: '',
    }
    const request = toEnterpriseRequest(form, PLAN, '  Renewal  ')
    expect(request).toMatchObject({
      nameEn: 'Enterprise',
      nameAr: null,
      monthlyPrice: '500.000',
      annualPrice: '4200.000',
      invoicesPerMonth: 5000,
      peopleIncluded: 25,
      branchesIncluded: null,
      extraPersonPrice: null,
      overagePricePerInvoice: '0.040',
      apiAccess: true,
      billingCycle: 'ANNUAL',
      contractReference: 'FWT-ENT-14',
      reason: 'Renewal',
    })
    expect(request).not.toHaveProperty('applyFrom')
    expect(request.features).toContainEqual({ key: 'peppol', enabled: true })
    expect(request.features).toContainEqual({ key: 'futureFeature', enabled: true })
    expect(toEnterpriseRequest(form, PLAN)).not.toHaveProperty('reason')
  })
})

describe('Enterprise terms calls', () => {
  it('saves with the version read as If-Match', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(SET), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await saveEnterpriseTerms('t 1', 0, toEnterpriseRequest(enterpriseFormFrom(SET), PLAN, 'x'))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/platform/companies/t%201/enterprise-terms')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"0"')
  })

  it('lists by state', () => {
    expect(enterpriseListPath('TERMS_NOT_SET')).toBe(
      '/v1/platform/enterprise-terms?state=TERMS_NOT_SET&size=200',
    )
    expect(enterpriseListPath(null)).toBe('/v1/platform/enterprise-terms?size=200')
  })

  it('shows VAT only when there is some', () => {
    const quote = {
      billingCycle: 'MONTHLY' as const,
      amountExclVat: '450.000',
      vatRate: '0',
      vatAmount: '0.000',
      amountInclVat: '450.000',
      currency: 'OMR' as const,
    }
    expect(quoteChargesVat(quote)).toBe(false)
    expect(quoteChargesVat({ ...quote, vatAmount: '22.500' })).toBe(true)
  })

  it.each([
    ['enterprise-terms-version-conflict', 409, 'console.enterpriseTerms.refusal.conflict'],
    ['enterprise-terms-apply-from-refused', 409, 'console.enterpriseTerms.refusal.applyFrom'],
    [
      'subscription-change-blocked-by-payment',
      409,
      'console.enterpriseTerms.refusal.paymentBeingChecked',
    ],
    ['production-platform-realm-required', 403, 'console.enterpriseTerms.refusal.realm'],
    ['impersonation-not-allowed', 403, 'console.enterpriseTerms.refusal.impersonation'],
    [null, 403, 'console.enterpriseTerms.refusal.forbidden'],
    [null, 404, 'console.enterpriseTerms.refusal.gone'],
    [null, 400, 'console.enterpriseTerms.refusal.invalid'],
  ])('words %s (%i) in the console’s own sentence', (problemType, status, key) => {
    expect(describeEnterpriseTermsFailure(new ApiError({ status, problemType })).key).toBe(key)
  })
})
