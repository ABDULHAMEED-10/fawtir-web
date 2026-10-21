/**
 * Point of sale — the till (Figma 143:18015 and its six siblings).
 *
 * Money is held in baisa, the thousandth of a rial, so that a 20% discount on 5.600 is an exact
 * 1.120 rather than a float that renders as 1.1199999. Every figure the seven POS screens print
 * is derived from the sale modelled here, so a change to a line moves the discount, the VAT, the
 * tip, the change due, tonight's cash-up and the credit note together.
 *
 * The design's own arithmetic holds on every screen but one, and that one is noted on
 * `SHIFT.vatWithin` in `posClose.ts`.
 */

import { calculateInvoice, projectInvoice, type DiscountType } from './invoiceMath'
import type { DraftLine, ItemType } from './invoiceDraft'

/** A thousandth of a rial. All money below is an integer number of these. */
export const BAISA = 1000

/** Oman's standard rate. */
export const VAT_RATE = 0.05

/** The till, and who is on it (Figma 143:18015 — the picker beside the tabs). */
export const TILL = {
  branch: 'Nizwa',
  number: 1,
  /** The clock every POS screen is drawn at. 4 September 2026 is a Friday. */
  now: new Date(2026, 8, 4, 14, 26),
}

export const CASHIERS = [
  { id: 'maryam', name: 'Maryam', initials: 'MA' },
  { id: 'yusuf', name: 'Yusuf', initials: 'YU' },
] as const

export type CashierId = (typeof CASHIERS)[number]['id']

/* -------------------------------------------------------------- the shelf */

export type ItemGroup = 'brewed' | 'beans' | 'pastries' | 'equipment'

/** How a tile is drawn — the design uses flat illustrations, not photographs. */
export type ItemArt =
  'cup' | 'cupDark' | 'cupIced' | 'cupGreen' | 'bag' | 'bagPale' | 'pastry' | 'grinder' | 'bottle'

export type Size = { id: string; labelKey: string; delta: number }
export type AddOn = { id: string; labelKey: string; delta: number }

export type PosItem = {
  id: string
  name: string
  /*
   * What an invoice line needs from the item (owner, 21 Oct 2026: the till sells from the
   * catalogue, so its lines follow the invoice's rules). Absent means goods, each, standard rate.
   */
  itemType?: ItemType
  /** UN/ECE Rec 20. */
  unit?: string
  /** Oman VAT category code (S5, Z0, E0, O0) and its VATZR-OM / VATEX-OM reason. */
  taxCode?: string
  exemptionReasonCode?: string
  hsCode?: string
  group: ItemGroup
  art: ItemArt
  /** The shelf price of the default size, in baisa. */
  price: number
  /** What the tile says under the name. */
  noteKey: string
  noteValues?: Record<string, string | number>
  sizes?: Size[]
  addOns?: AddOn[]
  /** Off sale keeps the tile on the shelf but greyed, with the date it stopped. */
  offSaleSince?: string
  /** Nearly out — the tile carries a LOW badge and says how many are left. */
  servingsLeft?: number
}

const SIZES: Size[] = [
  { id: 'small', labelKey: 'pos.size.small', delta: -200 },
  { id: 'regular', labelKey: 'pos.size.regular', delta: 0 },
  { id: 'large', labelKey: 'pos.size.large', delta: 400 },
]

const ADD_ONS: AddOn[] = [
  { id: 'extraShot', labelKey: 'pos.addOn.extraShot', delta: 300 },
  { id: 'oatMilk', labelKey: 'pos.addOn.oatMilk', delta: 100 },
  { id: 'decaf', labelKey: 'pos.addOn.decaf', delta: 0 },
  { id: 'extraHot', labelKey: 'pos.addOn.extraHot', delta: 0 },
]

/** The shelf, in the order the design lays the tiles out. */
export const POS_ITEMS: PosItem[] = [
  {
    id: 'flat-white',
    name: 'Flat White',
    group: 'brewed',
    art: 'cup',
    price: 1400,
    noteKey: 'pos.note.sizesAddOns',
    noteValues: { sizes: 3, addOns: 4 },
    sizes: SIZES,
    addOns: ADD_ONS,
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    group: 'brewed',
    art: 'cup',
    price: 1400,
    noteKey: 'pos.note.sizesAddOns',
    noteValues: { sizes: 3, addOns: 4 },
    sizes: SIZES,
    addOns: ADD_ONS,
  },
  {
    id: 'espresso',
    name: 'Espresso',
    group: 'brewed',
    art: 'cupDark',
    price: 800,
    noteKey: 'pos.note.singleOrDouble',
  },
  {
    id: 'cold-brew',
    name: 'Cold Brew',
    group: 'brewed',
    art: 'cupIced',
    price: 1600,
    noteKey: 'pos.note.sizes',
    noteValues: { sizes: 2 },
    sizes: [SIZES[1], SIZES[2]],
  },
  {
    id: 'v60',
    name: 'V60 Pour Over',
    group: 'brewed',
    art: 'cup',
    price: 1800,
    noteKey: 'pos.note.madeToOrder',
  },
  {
    id: 'cortado',
    name: 'Cortado',
    group: 'brewed',
    art: 'cup',
    price: 1200,
    noteKey: 'pos.note.oneSize',
  },
  {
    id: 'latte',
    name: 'Latte',
    group: 'brewed',
    art: 'cup',
    price: 1500,
    noteKey: 'pos.note.sizesAddOns',
    noteValues: { sizes: 3, addOns: 4 },
    sizes: SIZES,
    addOns: ADD_ONS,
  },
  {
    id: 'iced-latte',
    name: 'Iced Latte',
    group: 'brewed',
    art: 'cupIced',
    price: 1700,
    noteKey: 'pos.note.sizesAddOns',
    noteValues: { sizes: 2, addOns: 4 },
    sizes: [SIZES[1], SIZES[2]],
    addOns: ADD_ONS,
  },
  {
    id: 'matcha-latte',
    name: 'Matcha Latte',
    group: 'brewed',
    art: 'cupGreen',
    price: 1900,
    noteKey: 'pos.note.servingsLeft',
    noteValues: { count: 6 },
    servingsLeft: 6,
  },
  {
    id: 'house-blend',
    name: 'House Blend 250g',
    group: 'beans',
    art: 'bag',
    price: 2700,
    noteKey: 'pos.note.greenBeans',
  },
  {
    id: 'date-walnut',
    name: 'Date & walnut slice',
    group: 'pastries',
    art: 'pastry',
    price: 900,
    noteKey: 'pos.note.pastries',
  },
  {
    id: 'hand-grinder',
    name: 'Hand grinder',
    group: 'equipment',
    art: 'grinder',
    price: 24000,
    noteKey: 'pos.note.equipment',
  },
  {
    id: 'pumpkin-spice',
    name: 'Pumpkin Spice Latte',
    group: 'brewed',
    art: 'cup',
    price: 1700,
    noteKey: 'pos.note.offSince',
    noteValues: { when: '3 January' },
    offSaleSince: '3 January',
  },
  {
    id: 'ramadan-box',
    name: 'Ramadan gift box',
    group: 'beans',
    art: 'bagPale',
    price: 24000,
    noteKey: 'pos.note.broughtBack',
    offSaleSince: 'Ramadan',
  },
]

/** The counts the design prints beside each tab, derived rather than typed. */
export const GROUP_TABS = [
  { id: 'all' as const, labelKey: 'pos.group.all' },
  { id: 'brewed' as const, labelKey: 'pos.group.brewed' },
  { id: 'beans' as const, labelKey: 'pos.group.beans' },
  { id: 'pastries' as const, labelKey: 'pos.group.pastries' },
  { id: 'equipment' as const, labelKey: 'pos.group.equipment' },
]

export type GroupTabId = (typeof GROUP_TABS)[number]['id']

/**
 * The shelf holds far more than the fourteen tiles the design draws.
 *
 * The tabs count the whole catalogue — 118 things to sell — while the grid shows what fits. The
 * per-group counts add up to the total, which is what the design's 41 + 34 + 12 + 12 does not do
 * (that is 99, not 118), so the remainder sits under Brewed drinks where the catalogue puts it.
 */
export const SHELF_COUNTS: Record<GroupTabId, number> = {
  brewed: 60,
  beans: 34,
  pastries: 12,
  equipment: 12,
  all: 118,
}

/** Whether a tile can be rung up right now. */
export function onSale(item: PosItem): boolean {
  return !item.offSaleSince
}

export type ActiveFilter = 'active' | 'inactive' | 'both'

export const ACTIVE_FILTERS: ActiveFilter[] = ['active', 'inactive', 'both']

/** What the Active / Inactive / Both control counts. */
export function activeCounts() {
  const active = POS_ITEMS.filter(onSale).length
  const inactive = POS_ITEMS.length - active
  return {
    active: SHELF_COUNTS.all - 12,
    inactive: 12,
    both: SHELF_COUNTS.all,
    shownActive: active,
    shownInactive: inactive,
  }
}

export function itemsFor(group: GroupTabId, filter: ActiveFilter, query: string): PosItem[] {
  const text = query.trim().toLowerCase()
  return POS_ITEMS.filter((item) => {
    if (group !== 'all' && item.group !== group) return false
    if (filter === 'active' && !onSale(item)) return false
    if (filter === 'inactive' && onSale(item)) return false
    if (text && !item.name.toLowerCase().includes(text)) return false
    return true
  })
}

/* --------------------------------------------------------------- the sale */

export type SaleLine = {
  id: string
  itemId: string
  qty: number
  sizeId?: string
  addOnIds: string[]
}

/** The sale the design has on the screen: two large flat whites, a cortado and a pastry. */
export const OPEN_SALE: SaleLine[] = [
  { id: 'l1', itemId: 'flat-white', qty: 2, sizeId: 'large', addOnIds: ['extraShot', 'oatMilk'] },
  { id: 'l2', itemId: 'cortado', qty: 1, addOnIds: [] },
  { id: 'l3', itemId: 'date-walnut', qty: 1, addOnIds: [] },
]

/** When the sale was started, which the panel prints beside the item count. */
export const SALE_STARTED = '14:26'

export function itemById(id: string): PosItem {
  const found = POS_ITEMS.find((item) => item.id === id)
  if (!found) throw new Error(`No item ${id}`)
  return found
}

/** What one of these costs, once the size and the add-ons are counted. */
export function unitPrice(line: SaleLine): number {
  const item = itemById(line.itemId)
  const size = item.sizes?.find((s) => s.id === line.sizeId)
  const addOns = (item.addOns ?? []).filter((a) => line.addOnIds.includes(a.id))
  return item.price + (size?.delta ?? 0) + addOns.reduce((sum, a) => sum + a.delta, 0)
}

export function lineTotal(line: SaleLine): number {
  return unitPrice(line) * line.qty
}

/* ------------------------------------------------------- the price rule */

/**
 * The rule the till applied by itself (Figma 143:18015 — the green note in the sale panel).
 *
 * Twenty per cent off drinks between two and five on a weekday. It comes from Catalog › Price
 * rules, which is why the sale panel explains itself rather than just showing a smaller number.
 */
export const LULL = {
  id: 'afternoon-lull',
  percent: 20,
  from: '14:00',
  to: '17:00',
  /** Only drinks — the pastry in the sale is not discounted, which the design shows. */
  group: 'brewed' as ItemGroup,
}

/** Whether the rule catches this line. */
export function lullApplies(line: SaleLine): boolean {
  return itemById(line.itemId).group === LULL.group
}

export type SaleTotals = {
  /** Everything at shelf price, before the rule. */
  items: number
  /** What the rule took off. */
  discount: number
  /** What the discount on the whole sale took off, after the rule. */
  saleDiscount: number
  /** The VAT rates on the sale's lines, for the VAT row's label. */
  vatRates: number[]
  /** What VAT is worked out on. */
  beforeVat: number
  vat: number
  /** The sale itself — what counts as turnover. */
  sale: number
}

/* ------------------------------------------------------ as invoice lines */

/** A discount on the whole sale: the invoice's document discount (IBT-092). */
export type SaleDiscount = { type: DiscountType; value: string }

export const NO_SALE_DISCOUNT: SaleDiscount = { type: 'PERCENTAGE', value: '0' }

/** One line of the invoice the sale files, as the invoice composer holds a line. */
export type PosInvoiceLine = Omit<DraftLine, 'id'> & { id: string; saleLineId: string }

const VAT_OF: Record<string, string> = { S5: '5', Z0: '0', E0: '0', O0: '0' }
const rial = (baisa: number) => (baisa / BAISA).toFixed(3)

/**
 * The sale as invoice lines (owner, 21 Oct 2026). The item and its size are one line ("Flat
 * White · Large"); every add-on with a price is a line of its own, with the item's VAT category
 * and classification; a free add-on is named on the item's line. The price rule is each caught
 * line's own discount, so the invoice shows what it took and from which line. `label` names a
 * size or add-on in the language the invoice is written in.
 */
export function invoiceLinesFor(
  lines: SaleLine[],
  label: (key: string) => string = (key) => key,
): PosInvoiceLine[] {
  return lines.flatMap((line) => {
    const item = itemById(line.itemId)
    const size = item.sizes?.find((s) => s.id === line.sizeId)
    const addOns = (item.addOns ?? []).filter((a) => line.addOnIds.includes(a.id))
    const free = addOns.filter((a) => a.delta === 0)
    const taxCode = item.taxCode ?? 'S5'
    const common = {
      saleLineId: line.id,
      productId: null,
      productCode: null,
      itemType: item.itemType ?? ('goods' as ItemType),
      hsCode: item.hsCode,
      unit: item.unit ?? 'EA',
      vatRate: VAT_OF[taxCode] ?? '5',
      taxCode,
      exemptionReason: '',
      exemptionReasonCode: item.exemptionReasonCode,
      quantity: String(line.qty),
      discountType: 'PERCENTAGE' as DiscountType,
      discountValue: lullApplies(line) ? String(LULL.percent) : '0',
    }
    const name = [
      item.name,
      size ? ` · ${label(size.labelKey)}` : '',
      free.length ? ` (${free.map((a) => label(a.labelKey)).join(', ')})` : '',
    ].join('')
    return [
      {
        ...common,
        id: `${line.id}`,
        description: name,
        unitPrice: rial(item.price + (size?.delta ?? 0)),
      },
      ...addOns
        .filter((a) => a.delta !== 0)
        .map((a) => ({
          ...common,
          id: `${line.id}-${a.id}`,
          description: `${item.name}: + ${label(a.labelKey)}`,
          unitPrice: rial(a.delta),
        })),
    ]
  })
}

/**
 * Every figure in the sale panel, from the lines, by the invoice's own engine (the same
 * arithmetic the server uses), so what the till shows is what the invoice will say.
 */
export function totalsFor(lines: SaleLine[], saleDiscount = NO_SALE_DISCOUNT): SaleTotals {
  const invoiceLines = invoiceLinesFor(lines)
  const projected = projectInvoice(
    calculateInvoice(
      invoiceLines.map((line, index) => ({ ...line, lineNumber: index + 1 })),
      saleDiscount.type,
      saleDiscount.value || '0',
    ),
  )
  const baisa = (value: bigint) => Number(value)
  const vatRates = [...new Set(invoiceLines.map((line) => Number(line.vatRate)))]
  return {
    items: baisa(projected.subtotal),
    discount: baisa(projected.itemDiscount),
    saleDiscount: baisa(projected.headerDiscount),
    beforeVat: baisa(projected.taxable),
    vat: baisa(projected.vat),
    vatRates,
    sale: baisa(projected.total),
  }
}

/* ---------------------------------------------------------------- money */

/** Baisa as rials, always to three places, as the rest of the app writes money. */
export function omr(baisa: number): string {
  return (baisa / BAISA).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

/** A signed amount, for the lines that take money off. */
export function omrSigned(baisa: number): string {
  return `${baisa < 0 ? '−' : ''}${omr(Math.abs(baisa))}`
}
