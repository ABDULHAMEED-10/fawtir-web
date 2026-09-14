import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import type { SubscriptionPlan } from '../subscriptionPlans'
import { planFeatures, sortPlans } from '../subscriptionPlans'
import {
  EMPTY_PLAN_FORM,
  describePlanSaveFailure,
  planFormFrom,
  toUpsertRequest,
  validatePlanForm,
  withSavedPlans,
} from './planCatalogue'

const PLAN: SubscriptionPlan = {
  code: 'BUSINESS',
  name: 'Business',
  monthlyPrice: 49,
  invoicesPerMonth: 500,
  peopleIncluded: 5,
  extraPersonPrice: 3.5,
  branchesIncluded: 5,
  apiAccess: true,
  prioritySupport: false,
  overagePricePerInvoice: null,
  sortOrder: 20,
  active: true,
}

describe('planFormFrom / toUpsertRequest', () => {
  it('round-trips a plan without losing a field or a null', () => {
    const { code, ...request } = PLAN
    expect(toUpsertRequest(planFormFrom(PLAN))).toEqual(request)
    expect(code).toBe('BUSINESS')
  })

  it("shows money with the app's three decimals, in a form the input re-parses", () => {
    const form = planFormFrom({ ...PLAN, monthlyPrice: 1234.5 })
    expect(form.monthlyPrice).toBe('1234.500')
    expect(form.extraPersonPrice).toBe('3.500')
    expect(form.overagePricePerInvoice).toBe('')
  })

  it('turns an emptied optional field into null, never into zero', () => {
    const request = toUpsertRequest({ ...planFormFrom(PLAN), extraPersonPrice: ' ', branchesIncluded: '' })
    expect(request.extraPersonPrice).toBeNull()
    expect(request.branchesIncluded).toBeNull()
  })
})

describe('validatePlanForm', () => {
  const valid = { ...EMPTY_PLAN_FORM, code: 'NEW_PLAN', name: 'New', monthlyPrice: '0', invoicesPerMonth: '1', peopleIncluded: '1' }
  const errorsOf = (values: typeof valid, mode: 'add' | 'edit' = 'add', taken: string[] = []) =>
    Object.fromEntries(Object.entries(validatePlanForm(values, mode, taken)).filter(([, error]) => error))

  it('accepts the smallest plan the backend accepts', () => {
    expect(errorsOf(valid)).toEqual({})
  })

  it('accepts a free plan, and money with up to three decimals', () => {
    expect(errorsOf({ ...valid, monthlyPrice: '0.000', extraPersonPrice: '999999999.999' })).toEqual({})
  })

  it('bounds money to NUMERIC(12, 3)', () => {
    expect(errorsOf({ ...valid, monthlyPrice: '1000000000' })).toEqual({ monthlyPrice: 'console.plans.validation.money' })
  })

  it('does not check the code of a plan being edited', () => {
    expect(errorsOf({ ...valid, code: 'BUSINESS' }, 'edit', ['BUSINESS'])).toEqual({})
  })

  it('refuses a code already in the catalogue when adding', () => {
    expect(errorsOf({ ...valid, code: 'BUSINESS' }, 'add', ['BUSINESS'])).toEqual({
      code: 'console.plans.validation.codeTaken',
    })
  })

  it('accepts a negative position but not one outside a Java int', () => {
    expect(errorsOf({ ...valid, sortOrder: '-5' })).toEqual({})
    expect(errorsOf({ ...valid, sortOrder: '2147483648' })).toEqual({ sortOrder: 'console.plans.validation.whole' })
  })

  it('limits the name to 80 characters', () => {
    expect(errorsOf({ ...valid, name: 'x'.repeat(81) })).toEqual({ name: 'console.plans.validation.nameLength' })
  })
})

describe('describePlanSaveFailure', () => {
  it('reads a timeout as a timeout', () => {
    expect(describePlanSaveFailure(new NetworkError('timeout'))).toEqual({
      fieldErrors: {},
      formError: { key: 'identityErrors.timeout' },
    })
  })

  it('ignores a backend field it does not know rather than guessing', () => {
    const error = new ApiError({
      status: 400,
      problemType: 'validation-failed',
      fieldErrors: [{ field: 'somethingNew', message: 'bad' }],
    })
    expect(describePlanSaveFailure(error)).toEqual({ fieldErrors: {}, formError: { key: 'identityErrors.validation' } })
  })
})

describe('withSavedPlans', () => {
  it('replaces a saved plan and places a new one in the backend order', () => {
    const catalogue = [PLAN, { ...PLAN, code: 'STARTER', sortOrder: 10 }]
    const saved = new Map([
      ['BUSINESS', { ...PLAN, monthlyPrice: 55 }],
      ['AAA', { ...PLAN, code: 'AAA', sortOrder: 20 }],
    ])
    const merged = withSavedPlans(catalogue, saved)
    expect(merged.map((plan) => plan.code)).toEqual(['STARTER', 'AAA', 'BUSINESS'])
    expect(merged.find((plan) => plan.code === 'BUSINESS')?.monthlyPrice).toBe(55)
  })
})

describe('planFeatures', () => {
  it('derives every line from the fields and their null meanings', () => {
    expect(planFeatures(PLAN).map((line) => line.key)).toEqual([
      'plan.feature.invoices',
      'plan.feature.peopleThen',
      'plan.feature.branches',
      'plan.feature.api',
      'plan.feature.noOverage',
    ])
    expect(planFeatures({ ...PLAN, extraPersonPrice: null, branchesIncluded: null, overagePricePerInvoice: 0.2 })).toEqual(
      expect.arrayContaining([
        { key: 'plan.feature.people', values: { count: 5 } },
        { key: 'plan.feature.unlimitedBranches' },
        { key: 'plan.feature.overage', values: { amount: '0.200' } },
      ]),
    )
  })

  it('sorts by position, then code', () => {
    const plans = [
      { ...PLAN, code: 'B', sortOrder: 1 },
      { ...PLAN, code: 'A', sortOrder: 1 },
      { ...PLAN, code: 'C', sortOrder: 0 },
    ]
    expect(sortPlans(plans).map((plan) => plan.code)).toEqual(['C', 'A', 'B'])
  })
})
