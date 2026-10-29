import type { PriceRuleDto } from '../api/catalog/priceRules'
import type { SaleLine } from './pos'

/**
 * The design's sale (Figma 143:18015), as catalogue lines, for the tests only: two large flat
 * whites with an extra shot and oat milk, a cortado and a pastry, the two drinks caught by a 20%
 * price rule. The rule prices the item lines only, never their add-ons (PR #796), so it takes
 * 0.960 off where the design printed 1.120: 6.500 of items, 0.277 VAT, 5.817 to pay.
 */
const line = (
  patch: Partial<SaleLine> & Pick<SaleLine, 'id' | 'productId' | 'name' | 'price'>,
): SaleLine => ({
  productCode: patch.productId.toUpperCase(),
  variant: null,
  addOns: [],
  qty: 1,
  itemType: 'goods',
  unit: 'EA',
  taxCode: 'S5',
  vatRate: '5',
  discountType: 'PERCENTAGE',
  discountValue: '0',
  ...patch,
})

export const SAMPLE_SALE: SaleLine[] = [
  line({
    id: 'l1',
    productId: 'p-flat',
    productCode: 'FW-L',
    name: 'Flat White',
    variant: { id: 'v-large', label: 'Large' },
    addOns: [
      { id: 'a-shot', label: 'extra shot', price: 300 },
      { id: 'a-oat', label: 'oat milk', price: 100 },
    ],
    qty: 2,
    price: 1800,
    priceRule: LULL_RULE(720),
  }),
  line({
    id: 'l2',
    productId: 'p-cortado',
    name: 'Cortado',
    price: 1200,
    priceRule: LULL_RULE(240),
  }),
  line({ id: 'l3', productId: 'p-slice', name: 'Date & walnut slice', price: 900 }),
]

/** A 20% time rule on the item lines (their add-ons keep the catalogue's discount). */
function LULL_RULE(saving: number) {
  return {
    id: 'rule-lull',
    name: 'Afternoon lull',
    discountType: 'PERCENTAGE' as const,
    discountValue: '20',
    saving,
  }
}

/**
 * The sample's rule as `GET /v1/price-rules/active` serves it: 20% off the drinks at every hour,
 * so a test's clock never closes the window.
 */
export const LULL_ACTIVE_RULE: PriceRuleDto = {
  id: 'rule-lull',
  name: 'Afternoon lull',
  kind: 'TIME',
  enabled: true,
  archived: false,
  archivedAt: null,
  validFrom: '2026-01-01',
  validTo: null,
  priority: 100,
  targets: [
    { type: 'PRODUCT', id: 'p-flat' },
    { type: 'PRODUCT', id: 'p-cortado' },
  ],
  countedAs: null,
  countPer: 'INVOICE',
  tiers: [],
  extrasOnly: false,
  windows: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '24:00' }],
  customers: null,
  offer: { percentOff: 20, priceEach: null },
  branchIds: [],
  atTheTill: true,
  showOnInvoice: true,
  stacks: false,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  runningNow: true,
  used: null,
  givenAway: null,
  broughtIn: null,
  pausedUntil: null,
  belowCostAcknowledged: null,
  belowCost: null,
}
