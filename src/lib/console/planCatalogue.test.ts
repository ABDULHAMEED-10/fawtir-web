import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  changesTerms,
  describePlanSaveFailure,
  emptyPlanForm,
  offersErpAddon,
  planCardLines,
  planFormFrom,
  sortCatalogue,
  toPlanRequest,
  validatePlanForm,
  withSavedPlans,
  type CatalogueAdminPlan,
} from './planCatalogue'

const PLAN: CatalogueAdminPlan = {
  code: 'BUSINESS',
  nameEn: 'Business',
  nameAr: 'الأعمال',
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: true,
  recommended: true,
  sortOrder: 20,
  annualFreeMonths: 2,
  trialDays: 14,
  trialDocuments: 25,
  version: 3,
  currentVersion: {
    id: 'v-2',
    planCode: 'BUSINESS',
    versionNumber: 2,
    effectiveFrom: '2026-10-09T00:00:00Z',
    monthlyPrice: '80.000',
    annualPrice: '800.000',
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    extraPersonPrice: '2.500',
    branchesIncluded: 2,
    extraBranchPrice: '8.000',
    overagePricePerInvoice: null,
    apiAccess: false,
    prioritySupport: true,
    reason: 'Owner decision',
    createdBy: null,
    createdAt: '2026-10-09T00:00:00Z',
  },
  features: [
    { key: 'peppol', enabled: true, compliance: true },
    { key: 'approvals', enabled: true, compliance: false },
    { key: 'newCompliance', enabled: true, compliance: true },
  ],
}

describe('planFormFrom / toPlanRequest', () => {
  it('round-trips the plan with amounts as three-decimal strings and nulls kept', () => {
    const request = toPlanRequest(planFormFrom(PLAN), 'edit', PLAN)
    expect(request).toMatchObject({
      nameEn: 'Business',
      nameAr: 'الأعمال',
      descriptionEn: null,
      monthlyPrice: '80.000',
      extraPersonPrice: '2.500',
      extraBranchPrice: '8.000',
      overagePricePerInvoice: null,
      branchesIncluded: 2,
      annualFreeMonths: 2,
      trialDays: 14,
      trialDocuments: 25,
      recommended: true,
    })
    expect(request).not.toHaveProperty('code')
    expect(request).not.toHaveProperty('reason')
  })

  it('pads an amount typed short, and turns an emptied optional field into null', () => {
    const form = {
      ...planFormFrom(PLAN),
      monthlyPrice: '99.5',
      extraPersonPrice: ' ',
      trial: false,
    }
    const request = toPlanRequest({ ...form, trialDocuments: '' }, 'edit', PLAN)
    expect(request.monthlyPrice).toBe('99.500')
    expect(request.extraPersonPrice).toBeNull()
    expect(request.trialDays).toBeNull()
  })

  it('keeps compliance on, including keys the backend flags, and sends unknown keys back', () => {
    const form = planFormFrom(PLAN)
    const request = toPlanRequest(
      { ...form, features: { ...form.features, peppol: false, newCompliance: false } },
      'edit',
      PLAN,
    )
    expect(request.features).toContainEqual({ key: 'peppol', enabled: true })
    expect(request.features).toContainEqual({ key: 'newCompliance', enabled: true })
    expect(request.features).toContainEqual({ key: 'approvals', enabled: true })
  })

  it('sends the fixed 14-day trial when on and no trial when off (TR-1)', () => {
    expect(toPlanRequest({ ...planFormFrom(PLAN), trial: true }, 'edit', PLAN).trialDays).toBe(14)
    // A length stored before TR-1 reads as on, and a save publishes the fixed 14 days.
    const older = { ...PLAN, trialDays: 30 }
    expect(planFormFrom(older).trial).toBe(true)
    expect(toPlanRequest(planFormFrom(older), 'edit', older).trialDays).toBe(14)
    expect(planFormFrom({ ...PLAN, trialDays: null }).trial).toBe(false)
    expect(toPlanRequest(emptyPlanForm(), 'add').trialDays).toBeNull()
  })

  it('sends the code only when adding', () => {
    expect(toPlanRequest({ ...emptyPlanForm(), code: 'NEW' }, 'add').code).toBe('NEW')
  })
})

describe('changesTerms', () => {
  it('counts prices, limits, API, support and annual free months, not names or visibility', () => {
    const form = planFormFrom(PLAN)
    expect(changesTerms(PLAN, form)).toBe(false)
    expect(changesTerms(PLAN, { ...form, monthlyPrice: '80' })).toBe(false)
    expect(
      changesTerms(PLAN, { ...form, nameAr: 'x', publicVisible: false, trial: false }),
    ).toBe(false)
    expect(changesTerms(PLAN, { ...form, monthlyPrice: '81' })).toBe(true)
    expect(changesTerms(PLAN, { ...form, branchesIncluded: '' })).toBe(true)
    expect(changesTerms(PLAN, { ...form, annualFreeMonths: '3' })).toBe(true)
    expect(changesTerms(PLAN, { ...form, apiAccess: true })).toBe(true)
  })
})

describe('validatePlanForm', () => {
  const valid = {
    ...emptyPlanForm(),
    code: 'NEW_PLAN',
    nameEn: 'New',
    monthlyPrice: '0',
    invoicesPerMonth: '1',
    peopleIncluded: '1',
    reason: 'Launch',
  }
  const errorsOf = (
    values: typeof valid,
    mode: 'add' | 'edit' = 'add',
    taken: string[] = [],
    original: CatalogueAdminPlan | null = null,
  ) =>
    Object.fromEntries(
      Object.entries(validatePlanForm(values, mode, taken, original)).filter(([, error]) => error),
    )

  it('accepts the smallest plan the backend accepts', () => {
    expect(errorsOf(valid)).toEqual({})
  })

  it('needs a reason to create, and to change terms, but not to rename', () => {
    expect(errorsOf({ ...valid, reason: '' })).toEqual({
      reason: 'console.plans.validation.reasonRequired',
    })
    const edit = planFormFrom(PLAN)
    expect(errorsOf({ ...edit, nameEn: 'Biz' }, 'edit', [], PLAN)).toEqual({})
    expect(errorsOf({ ...edit, peopleIncluded: '6' }, 'edit', [], PLAN)).toEqual({
      reason: 'console.plans.validation.reasonRequired',
    })
  })

  it('bounds the annual free months, trial and descriptions as the backend does', () => {
    expect(errorsOf({ ...valid, annualFreeMonths: '12' })).toEqual({
      annualFreeMonths: 'console.plans.validation.freeMonths',
    })
    expect(errorsOf({ ...valid, trialDocuments: '10' })).toEqual({
      trialDocuments: 'console.plans.validation.trialDocumentsNeedTrial',
    })
    expect(errorsOf({ ...valid, trial: true, trialDocuments: '10' })).toEqual({})
    expect(errorsOf({ ...valid, descriptionAr: 'x'.repeat(501) })).toEqual({
      descriptionAr: 'console.plans.validation.descriptionLength',
    })
  })

  it('bounds money to NUMERIC(12, 3)', () => {
    expect(errorsOf({ ...valid, extraBranchPrice: '1.2345' })).toEqual({
      extraBranchPrice: 'console.plans.validation.money',
    })
  })

  it('refuses a taken code, and ENTERPRISE, when adding', () => {
    expect(errorsOf({ ...valid, code: 'BUSINESS' }, 'add', ['BUSINESS'])).toEqual({
      code: 'console.plans.validation.codeTaken',
    })
    expect(errorsOf({ ...valid, code: 'ENTERPRISE' })).toEqual({
      code: 'console.plans.validation.code',
    })
  })
})

describe('describePlanSaveFailure', () => {
  it('reads a version conflict on an edit as a reload, whether 409 or 412', () => {
    for (const status of [409, 412]) {
      const error = new ApiError({ status, problemType: 'plan-catalogue-version-conflict' })
      expect(describePlanSaveFailure(error, 'edit')).toEqual({
        fieldErrors: {},
        formError: { key: 'console.plans.conflict' },
        conflict: true,
      })
    }
  })

  it('reads the fixed-trial refusal in words', () => {
    const error = new ApiError({ status: 400, problemType: 'trial-length-fixed' })
    expect(describePlanSaveFailure(error, 'edit').formError).toEqual({
      key: 'console.plans.validation.trialFixed',
    })
  })

  it('reads a 409 on a create as the code being taken', () => {
    const error = new ApiError({ status: 409, problemType: 'resource-conflict' })
    expect(describePlanSaveFailure(error, 'add').fieldErrors).toEqual({
      code: 'console.plans.validation.codeTaken',
    })
  })

  it('reads a timeout as a timeout, and ignores fields it does not know', () => {
    expect(describePlanSaveFailure(new NetworkError('timeout'), 'edit').formError).toEqual({
      key: 'identityErrors.timeout',
    })
    const error = new ApiError({
      status: 400,
      problemType: 'validation-failed',
      fieldErrors: [{ field: 'somethingNew', message: 'bad' }],
    })
    expect(describePlanSaveFailure(error, 'edit').formError).toEqual({
      key: 'identityErrors.validation',
    })
  })
})

describe('withSavedPlans / sortCatalogue / planCardLines', () => {
  it('replaces a saved plan, places a new one in order, and keeps one recommended', () => {
    const starter = { ...PLAN, code: 'STARTER', sortOrder: 10, recommended: false }
    const saved = new Map([['STARTER', { ...starter, recommended: true }]])
    const merged = withSavedPlans([PLAN, starter], saved, 'STARTER')
    expect(merged.map((plan) => plan.code)).toEqual(['STARTER', 'BUSINESS'])
    expect(merged.filter((plan) => plan.recommended).map((plan) => plan.code)).toEqual(['STARTER'])
  })

  it('sorts by position, then code', () => {
    const plans = [
      { code: 'B', sortOrder: 1 },
      { code: 'A', sortOrder: 1 },
      { code: 'C', sortOrder: 0 },
    ]
    expect(sortCatalogue(plans).map((plan) => plan.code)).toEqual(['C', 'A', 'B'])
  })

  it('derives the card lines from the current version and its null meanings', () => {
    expect(planCardLines(PLAN)).toEqual([
      { key: 'plan.feature.invoices', values: { count: '1,000' } },
      { key: 'plan.feature.peopleThen', values: { count: 5, amount: '2.500' } },
      { key: 'plan.feature.branches', values: { count: 2 } },
      { key: 'plan.feature.noApi' },
      { key: 'plan.feature.prioritySupport' },
      { key: 'plan.feature.noOverage' },
    ])
  })
})

describe('ERP and API add-on price (ER-1, PL-3)', () => {
  const WITH_ADDON: CatalogueAdminPlan = {
    ...PLAN,
    currentVersion: { ...PLAN.currentVersion, erpAddonMonthlyPrice: '20.000' },
    features: [...PLAN.features, { key: 'erpMapping', enabled: true }],
  }
  const withValues = (plan: CatalogueAdminPlan, change: Partial<ReturnType<typeof planFormFrom>>) => ({
    ...planFormFrom(plan),
    ...change,
  })

  it('reads the stored price into the form, and an older server (no field) as empty', () => {
    expect(planFormFrom(WITH_ADDON).erpAddonMonthlyPrice).toBe('20.000')
    expect(planFormFrom(PLAN).erpAddonMonthlyPrice).toBe('')
    expect(emptyPlanForm().erpAddonMonthlyPrice).toBe('')
  })

  it('omits an untouched or equal price, so the server keeps the one in force', () => {
    expect(toPlanRequest(planFormFrom(WITH_ADDON), 'edit', WITH_ADDON)).not.toHaveProperty(
      'erpAddonMonthlyPrice',
    )
    const same = withValues(WITH_ADDON, { erpAddonMonthlyPrice: '20' })
    expect(toPlanRequest(same, 'edit', WITH_ADDON)).not.toHaveProperty('erpAddonMonthlyPrice')
    expect(changesTerms(WITH_ADDON, same)).toBe(false)
    expect(toPlanRequest(planFormFrom(PLAN), 'edit', PLAN)).not.toHaveProperty(
      'erpAddonMonthlyPrice',
    )
  })

  it('sends a changed price at three decimals, as a term change that needs a reason', () => {
    const changed = withValues(WITH_ADDON, { erpAddonMonthlyPrice: '22.5' })
    expect(changesTerms(WITH_ADDON, changed)).toBe(true)
    expect(validatePlanForm(changed, 'edit', [], WITH_ADDON).reason).toBe(
      'console.plans.validation.reasonRequired',
    )
    expect(toPlanRequest({ ...changed, reason: 'Owner decision' }, 'edit', WITH_ADDON)).toMatchObject(
      { erpAddonMonthlyPrice: '22.500', reason: 'Owner decision' },
    )
  })

  it('refuses zero, a malformed amount, and a price without ERP field mapping', () => {
    const errorFor = (plan: CatalogueAdminPlan, value: string, mapping = true) =>
      validatePlanForm(
        withValues(plan, {
          erpAddonMonthlyPrice: value,
          features: { ...planFormFrom(plan).features, erpMapping: mapping },
        }),
        'edit',
        [],
        plan,
      ).erpAddonMonthlyPrice
    expect(errorFor(WITH_ADDON, '0')).toBe('console.plans.validation.erpAddonAboveZero')
    expect(errorFor(WITH_ADDON, '1.2345')).toBe('console.plans.validation.money')
    expect(errorFor(PLAN, '20', false)).toBe('console.plans.validation.erpAddonNeedsMapping')
    expect(errorFor(PLAN, '20', true)).toBeUndefined()
    // The price in force stays when mapping is switched off: nothing is sent, nothing refused.
    expect(errorFor(WITH_ADDON, '20.000', false)).toBeUndefined()
    // A price in force cannot be removed while the add-on is offered.
    expect(errorFor(WITH_ADDON, '', true)).toBe('console.plans.validation.erpAddonKeep')
    expect(errorFor(WITH_ADDON, '', false)).toBeUndefined()
    expect(errorFor(PLAN, '', true)).toBeUndefined()
  })

  it('lists the stored price on the card, and nothing without one', () => {
    expect(planCardLines(WITH_ADDON)).toContainEqual({
      key: 'console.plans.erpAddonLine',
      values: { amount: '20.000' },
    })
    expect(planCardLines(PLAN).map((line) => line.key)).not.toContain('console.plans.erpAddonLine')
  })

  it('shows no add-on price while ERP field mapping is off, even with one stored', () => {
    const mappingOff: CatalogueAdminPlan = {
      ...WITH_ADDON,
      features: [...PLAN.features, { key: 'erpMapping', enabled: false }],
    }
    const noSwitch: CatalogueAdminPlan = { ...WITH_ADDON, features: PLAN.features }
    expect(offersErpAddon(WITH_ADDON)).toBe(true)
    expect(offersErpAddon(mappingOff)).toBe(false)
    expect(offersErpAddon(noSwitch)).toBe(false)
    for (const plan of [mappingOff, noSwitch]) {
      expect(planCardLines(plan).map((line) => line.key)).not.toContain('console.plans.erpAddonLine')
    }
  })

  it('marks the field when the server names it', () => {
    const error = new ApiError({
      status: 400,
      problemType: 'validation-failed',
      fieldErrors: [{ field: 'erpAddonMonthlyPrice', message: 'must match' }],
    })
    expect(describePlanSaveFailure(error, 'edit').fieldErrors).toEqual({
      erpAddonMonthlyPrice: 'console.plans.validation.server',
    })
  })
})
