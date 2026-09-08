import { SALES_TODAY, TAKEN_TODAY, AVERAGE_SALE, REFUNDS_TODAY, TAKINGS } from './posClose'

/**
 * The day so far (Figma 143:20498) and putting one of them right (143:20983).
 *
 * Every sale the till has rung up today, newest first, grouped by when it happened and whose
 * shift it was. The rows carry enough to find a sale from a customer's receipt: the time, the
 * invoice number, what was in it, how it was paid and where it stands with the Tax Authority.
 */

export type SaleState = 'filed' | 'peppol' | 'credited'

export type TodaySale = {
  id: string
  time: string
  cashier: string
  /** What was in it, already phrased. */
  what: string
  items: number
  payMethodKey: string
  payDetailKey?: string
  payDetailValues?: Record<string, string>
  /** In baisa. */
  total: number
  /** A second line under the amount — a tip, change given, or who it was billed to. */
  amountNoteKey?: string
  amountNoteValues?: Record<string, string>
  state: SaleState
  /** A credited sale offers the note rather than another refund. */
  refundable: boolean
}

export const LAST_HALF_HOUR: TodaySale[] = [
  {
    id: 'INV-2048',
    time: '14:32',
    cashier: 'Maryam',
    what: 'Flat White ×2, Cortado, Date and walnut slice',
    items: 4,
    payMethodKey: 'pos.today.cardAndCash',
    payDetailKey: 'pos.today.splitAmounts',
    payDetailValues: { first: '3.000', second: '3.000' },
    total: 6000,
    amountNoteKey: 'pos.today.inclTip',
    amountNoteValues: { amount: '0.351' },
    state: 'filed',
    refundable: true,
  },
  {
    id: 'INV-2047',
    time: '14:26',
    cashier: 'Maryam',
    what: 'House Blend 1kg ×4, Yirgacheffe 1kg ×2',
    items: 6,
    payMethodKey: 'pos.today.onAccount',
    payDetailKey: 'pos.company.terms30',
    total: 48720,
    amountNoteKey: 'pos.today.billedTo',
    amountNoteValues: { name: 'Muscat Grand Hotel' },
    state: 'peppol',
    refundable: true,
  },
  {
    id: 'INV-2046',
    time: '14:11',
    cashier: 'Maryam',
    what: 'Cappuccino, Croissant',
    items: 2,
    payMethodKey: 'pos.pay.card',
    payDetailKey: 'pos.today.cardName',
    payDetailValues: { card: 'Visa 8841' },
    total: 2310,
    state: 'filed',
    refundable: true,
  },
  {
    id: 'INV-2045',
    time: '13:58',
    cashier: 'Maryam',
    what: 'Cold Brew ×3',
    items: 3,
    payMethodKey: 'pos.pay.cash',
    payDetailKey: 'pos.today.given',
    payDetailValues: { amount: '5.000' },
    total: 4410,
    amountNoteKey: 'pos.today.change',
    amountNoteValues: { amount: '0.590' },
    state: 'filed',
    refundable: true,
  },
]

export const EARLIER: TodaySale[] = [
  {
    id: 'INV-2019',
    time: '11:20',
    cashier: 'Yusuf',
    what: 'Latte ×2, Karak Tea',
    items: 3,
    payMethodKey: 'pos.pay.cash',
    payDetailKey: 'pos.today.exact',
    total: 4200,
    amountNoteKey: 'pos.today.fullyCredited',
    state: 'credited',
    refundable: false,
  },
  {
    id: 'INV-2018',
    time: '11:04',
    cashier: 'Yusuf',
    what: 'Espresso, Turkish Coffee',
    items: 2,
    payMethodKey: 'pos.pay.card',
    payDetailKey: 'pos.today.cardName',
    payDetailValues: { card: 'Visa 1177' },
    total: 2205,
    state: 'filed',
    refundable: true,
  },
  {
    id: 'INV-2017',
    time: '10:47',
    cashier: 'Yusuf',
    what: 'Hand grinder',
    items: 1,
    payMethodKey: 'pos.pay.card',
    payDetailKey: 'pos.today.cardName',
    payDetailValues: { card: 'Mastercard 5520' },
    total: 25200,
    state: 'filed',
    refundable: true,
  },
]

/** The two groups the design shows, each with its own running total. */
export const GROUPS = [
  {
    id: 'lastHalfHour',
    titleKey: 'pos.today.lastHalfHour',
    sales: LAST_HALF_HOUR,
  },
  {
    id: 'earlier',
    titleKey: 'pos.today.earlierShift',
    titleValues: { who: 'Yusuf' },
    sales: EARLIER,
  },
]

export function groupTotal(sales: TodaySale[]): number {
  return sales.reduce((sum, sale) => sum + sale.total, 0)
}

/* ------------------------------------------------------------ the day's numbers */

export const BUSIEST_HOUR = { sales: 14, from: '08:00', to: '09:00' }

export const BEST_SELLER = { name: 'Flat White', sold: 31, takings: 68200 }

/** What each of them went out at on average — the till's own 2.200 a cup. */
export const BEST_SELLER_EACH = Math.round(BEST_SELLER.takings / BEST_SELLER.sold)

export const TODAY_KPI = {
  sold: TAKEN_TODAY,
  sales: SALES_TODAY,
  average: AVERAGE_SALE,
  refunded: REFUNDS_TODAY.amount,
  refundCount: REFUNDS_TODAY.count,
}

/** The tabs over the day's sales, counted rather than typed. */
export const TODAY_TABS = [
  { id: 'all', labelKey: 'pos.today.tab.everything', count: SALES_TODAY },
  { id: 'company', labelKey: 'pos.today.tab.onTheCompany', count: TAKINGS.companyInvoices },
  { id: 'cash', labelKey: 'pos.today.tab.cash', count: TAKINGS.cashSales },
  { id: 'refunded', labelKey: 'pos.today.tab.refunded', count: REFUNDS_TODAY.count },
  { id: 'mine', labelKey: 'pos.today.tab.mineOnly', count: 58 },
] as const

export type TodayTabId = (typeof TODAY_TABS)[number]['id']

export function salesForTab(tab: TodayTabId, sales: TodaySale[]): TodaySale[] {
  if (tab === 'all') return sales
  if (tab === 'company') return sales.filter((s) => s.state === 'peppol')
  if (tab === 'cash') return sales.filter((s) => s.payMethodKey === 'pos.pay.cash')
  if (tab === 'refunded') return sales.filter((s) => s.state === 'credited')
  return sales.filter((s) => s.cashier === 'Maryam')
}
