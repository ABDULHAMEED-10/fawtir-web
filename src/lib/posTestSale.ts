import type { SaleLine } from './pos'

/**
 * The design's sale (Figma 143:18015), as catalogue lines, for the tests only: two large flat
 * whites with an extra shot and oat milk, a cortado and a pastry, the two drinks caught by a 20%
 * price rule. Its figures are the design's: 6.500 of items, 1.120 off, 0.269 VAT, 5.649 to pay.
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
    rulePercent: 20,
  }),
  line({ id: 'l2', productId: 'p-cortado', name: 'Cortado', price: 1200, rulePercent: 20 }),
  line({ id: 'l3', productId: 'p-slice', name: 'Date & walnut slice', price: 900 }),
]
