import { describe, expect, it } from 'vitest'
import type { Entitlements } from './identity/entitlements'
import type { SignupCataloguePlan } from './identity/signupPlans'
import { GATED_FEATURES, neededPlanFrom, planIncludes } from './planAccess'

const BASE: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

// Business Rules PL-8 (owner, 23 Oct 2026): what each plan includes is set per plan in
// Console › Plans, never fixed in the code; the server refuses, and the screens hide, a feature
// switched off for the company's plan.
describe('what the company may make or use, from GET /me/entitlements (PL-8)', () => {
  it('hides nothing while the server does not enforce, or is older than the fields', () => {
    for (const feature of GATED_FEATURES) {
      expect(planIncludes(null, feature)).toBe(true)
      expect(planIncludes(BASE, feature)).toBe(true)
      expect(
        planIncludes({ ...BASE, planFeaturesEnforced: false, planFeatures: {} }, feature),
      ).toBe(true)
    }
  })

  it('follows the plan\'s switch once enforced; a key absent is off', () => {
    const company = {
      ...BASE,
      planFeaturesEnforced: true,
      planFeatures: { tradeDocuments: true, recurringBills: false },
    }
    expect(planIncludes(company, 'tradeDocuments')).toBe(true)
    expect(planIncludes(company, 'recurringBills')).toBe(false)
    expect(planIncludes(company, 'selfBilling')).toBe(false)
  })

  it('never hides what the server does not refuse: compliance, and the ERP add-on', () => {
    const nothing = { ...BASE, planFeaturesEnforced: true, planFeatures: {} }
    expect(planIncludes(nothing, 'invoices')).toBe(true)
    expect(planIncludes(nothing, 'erpMapping')).toBe(true)
    expect(planIncludes(nothing, 'pos')).toBe(true)
  })

  it('gates exactly the switches the server gates', () => {
    expect([...GATED_FEATURES].sort()).toEqual(
      [
        'approvals',
        'bulkUpload',
        'recurringBills',
        'recurringInvoices',
        'selfBilling',
        'supplierNotes',
        'tradeDocuments',
        'purchaseOrders',
        // Backend GatedFeature.STOCK: counts, write-offs, deliveries and reorder levels.
        'stock',
      ].sort(),
    )
  })

  // Owner change to PL-8, 24 Oct 2026: purchase orders have their own switch. A server that does
  // not send it yet still gates them with trade documents, so that switch decides until then.
  it('follows the purchase-orders switch, and trade documents only while it is absent', () => {
    const enforced = (planFeatures: Record<string, boolean>): Entitlements => ({
      ...BASE,
      planFeaturesEnforced: true,
      planFeatures,
    })
    expect(planIncludes(enforced({ tradeDocuments: true, purchaseOrders: false }), 'purchaseOrders')).toBe(false)
    expect(planIncludes(enforced({ tradeDocuments: false, purchaseOrders: true }), 'purchaseOrders')).toBe(true)
    expect(planIncludes(enforced({ tradeDocuments: true }), 'purchaseOrders')).toBe(true)
    expect(planIncludes(enforced({ tradeDocuments: false }), 'purchaseOrders')).toBe(false)
    expect(planIncludes(enforced({}), 'purchaseOrders')).toBe(false)
    // The trade-documents switch no longer depends on purchase orders.
    expect(planIncludes(enforced({ tradeDocuments: true, purchaseOrders: false }), 'tradeDocuments')).toBe(true)
  })
})

describe('the plan the nudge names', () => {
  const plan = (code: string, sortOrder: number, on: string[]): SignupCataloguePlan =>
    ({
      code,
      sortOrder,
      features: on.map((key) => ({ key, enabled: true })),
    }) as unknown as SignupCataloguePlan

  it('is the cheapest published plan with the switch on, as the console sets it', () => {
    // Starter now includes trade documents (V433), which the launch matrix does not know.
    const catalogue = [
      plan('BUSINESS', 2, ['tradeDocuments', 'recurringBills']),
      plan('STARTER', 1, ['tradeDocuments']),
    ]
    expect(neededPlanFrom(catalogue, 'tradeDocuments')).toBe('starter')
    expect(neededPlanFrom(catalogue, 'recurringBills')).toBe('business')
    expect(neededPlanFrom(catalogue, 'bulkUpload')).toBe('enterprise')
  })
})
