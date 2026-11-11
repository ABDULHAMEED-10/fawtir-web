import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ApiError } from '../api'
import type { PriceRuleDto } from '../api/catalog/priceRules'
import type { PosSaleDto } from '../api/pos/pos'
import { evaluateRules, type RuleLine } from './priceRuleEvaluator'
import {
  adoptRuleMismatch,
  applyTillRules,
  noteStaleRuleWarnings,
  resetPriceRuleCache,
  useStaleRuleNotices,
} from './posPriceRules'
import { posLineRefs } from './posInvoice'
import { LULL_ACTIVE_RULE, SAMPLE_SALE } from './posTestSale'
import type { SaleLine } from './pos'

const rule = (overrides: Partial<PriceRuleDto>): PriceRuleDto => ({
  ...LULL_ACTIVE_RULE,
  windows: [],
  offer: null,
  ...overrides,
})

const line = (overrides: Partial<RuleLine>): RuleLine => ({
  ref: '1',
  productId: 'p-1',
  variantId: null,
  kindId: null,
  groupId: null,
  role: 'ITEM',
  quantity: 1,
  unitPrice: 1000,
  priceChangedByHand: false,
  productDefault: null,
  ...overrides,
})

const sale = (lines: RuleLine[], at = '2026-10-28T11:00:00Z') => ({
  branchId: 'b-1',
  channel: 'TILL' as const,
  at: new Date(at),
  buyer: null,
  lines,
})

const plain = SAMPLE_SALE.map((entry) => ({ ...entry, priceRule: null }))

beforeEach(() => resetPriceRuleCache())

describe('the till works a rule out as the server does', () => {
  it('prices the whole quantity at the tier reached, or each unit by its own tier', () => {
    const volume = rule({
      kind: 'VOLUME',
      targets: [{ type: 'ALL' }],
      countedAs: 'ACROSS_TARGETS',
      tiers: [
        { fromQty: 1, toQty: 9, priceEach: null, percentOff: 0 },
        { fromQty: 10, toQty: null, priceEach: 0.8, percentOff: null },
      ],
    })
    const [whole] = evaluateRules(sale([line({ quantity: 12 })]), [volume])
    expect(whole).toMatchObject({ source: 'RULE', saving: 2400 })
    expect(whole.discount).toEqual({ type: 'FIXED_AMOUNT', value: 2.4 })

    const [extras] = evaluateRules(sale([line({ quantity: 12 })]), [
      { ...volume, extrasOnly: true },
    ])
    // Units 10, 11 and 12 only: 3 × 0.200.
    expect(extras).toMatchObject({ source: 'RULE', saving: 600 })
  })

  it('opens a time rule on Muscat time, past midnight too', () => {
    const late = rule({
      kind: 'TIME',
      targets: [{ type: 'ALL' }],
      windows: [{ days: [4], from: '22:00', to: '02:00' }],
      offer: { percentOff: 10, priceEach: null },
    })
    // Thursday 23:30 and Friday 01:30 in Muscat (UTC+4); not Friday 02:30.
    expect(evaluateRules(sale([line({})], '2026-10-29T19:30:00Z'), [late])[0].source).toBe('RULE')
    expect(evaluateRules(sale([line({})], '2026-10-29T21:30:00Z'), [late])[0].source).toBe('RULE')
    expect(evaluateRules(sale([line({})], '2026-10-29T22:30:00Z'), [late])[0].source).toBe('NONE')
  })

  it("lets the product's own discount win only when it saves strictly more", () => {
    const tenOff = rule({
      kind: 'TIME',
      windows: LULL_ACTIVE_RULE.windows,
      offer: { percentOff: 10, priceEach: null },
      targets: [{ type: 'ALL' }],
    })
    const same = evaluateRules(
      sale([line({ productDefault: { type: 'PERCENTAGE', value: 10 } })]),
      [tenOff],
    )
    expect(same[0].source).toBe('RULE')
    const more = evaluateRules(
      sale([line({ productDefault: { type: 'PERCENTAGE', value: 15 } })]),
      [tenOff],
    )
    expect(more[0].source).toBe('PRODUCT_DEFAULT')
  })

  it('gives a customer rule to a chosen customer only, never a walk-in', () => {
    const hotels = rule({
      kind: 'CUSTOMER',
      customers: { customerIds: ['c-1'], tags: [] },
      offer: { percentOff: 12, priceEach: null },
      targets: [{ type: 'ALL' }],
    })
    expect(evaluateRules(sale([line({})]), [hotels])[0].source).toBe('NONE')
    expect(
      evaluateRules({ ...sale([line({})]), buyer: { customerId: 'c-1', tags: [] } }, [hotels])[0]
        .source,
    ).toBe('RULE')
  })
})

describe('the sale on the till', () => {
  it('puts the rule on each item line it covers and names it in lineRefs[].priceRuleIds', () => {
    const priced = applyTillRules(plain, [LULL_ACTIVE_RULE], { branchId: 'b-1', customerId: null })
    expect(priced.map((entry) => entry.priceRule?.id ?? null)).toEqual([
      'rule-lull',
      'rule-lull',
      null,
    ])
    expect(priced[0].priceRule).toMatchObject({
      discountType: 'PERCENTAGE',
      discountValue: '20',
      saving: 720,
    })
    expect(posLineRefs(priced).map((ref) => ref.priceRuleIds)).toEqual([
      ['rule-lull'],
      [],
      [],
      ['rule-lull'],
      [],
    ])
  })

  it('gives a split bundle no rule: the bundle prices its parts (nothing taken off twice)', () => {
    const split = { ...plain[0], addOns: [], bundleParts: [{}] } as unknown as SaleLine
    const priced = applyTillRules([split], [LULL_ACTIVE_RULE], {
      branchId: 'b-1',
      customerId: null,
    })
    expect(priced[0].priceRule ?? null).toBeNull()
  })

  it('keeps only the rules marked for the till', () => {
    const priced = applyTillRules(plain, [{ ...LULL_ACTIVE_RULE, atTheTill: false }], {
      branchId: 'b-1',
      customerId: null,
    })
    expect(priced.every((entry) => !entry.priceRule)).toBe(true)
  })

  it("adopts the server's figure on POS_PRICE_RULE_MISMATCH, on the line it names", () => {
    const refusal = new ApiError({
      status: 422,
      problemType: 'validation-failed',
      code: 'POS_PRICE_RULE_MISMATCH',
      // Line 4 of the filed invoice is the Cortado (the Flat White's two add-ons are 2 and 3).
      problem: {
        line: 4,
        expectedDiscount: { type: 'PERCENTAGE', value: 15, amount: 0.18 },
        ruleIds: ['rule-happy'],
      },
    })
    const adopted = adoptRuleMismatch(plain as SaleLine[], refusal, {
      branchId: 'b-1',
      customerId: null,
    })!
    expect(adopted[1].priceRule).toMatchObject({
      id: 'rule-happy',
      discountType: 'PERCENTAGE',
      discountValue: '15',
      saving: 180,
    })
    expect(adopted[0].priceRule).toBeNull()
    // The till's own rules do not take the server's figure back while the line is unchanged.
    const again = applyTillRules(adopted, [], { branchId: 'b-1', customerId: null })
    expect(again[1].priceRule?.id).toBe('rule-happy')
    expect(
      adoptRuleMismatch(plain as SaleLine[], new Error('x'), { branchId: null, customerId: null }),
    ).toBeNull()
  })
})

describe('a queued sale the rules disagreed with', () => {
  it('is noted once it is sent, with the lines the server named', () => {
    noteStaleRuleWarnings({
      saleId: 's-9',
      invoiceNumber: 'NZW-T01-INV-2026-000051',
      warnings: [
        { code: 'POS_PRICE_RULE_STALE_ACCEPTED', line: 2 },
        { code: 'STOCK_BELOW_ZERO', line: 1 },
      ],
    } as PosSaleDto)
    const { result } = renderHook(() => useStaleRuleNotices())
    expect(result.current).toEqual([
      { saleId: 's-9', invoiceNumber: 'NZW-T01-INV-2026-000051', lines: [2] },
    ])
  })
})
