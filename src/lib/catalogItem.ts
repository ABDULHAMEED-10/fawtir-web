/**
 * One item, in full — Catalog › Flat White (Figma 135:45974, 135:46588, 135:47097, 135:47565).
 *
 * The four tabs read one record. Sizes and add-ons priced here drive the till preview, the
 * by-size chart and the bundle that contains it, so a price typed once is right everywhere.
 */

import { omr } from './catalog'
import { prototypeHidden } from './demoModules'
import type { ItemType } from './invoiceDraft'
import type { DiscountType } from './invoiceMath'

export const VAT_RATE = 0.05

/**
 * The four kinds the item screen offers, as the invoice line reads them (owner, 21 Oct 2026: keep
 * the cards, map them to Goods or Service). A bundle is goods: it is sold as one thing handed over.
 */
export type ItemKind = 'handOver' | 'youDo' | 'byTime' | 'several'

export const ITEM_TYPE_OF_KIND: Record<ItemKind, ItemType> = {
  handOver: 'goods',
  youDo: 'service',
  byTime: 'service',
  several: 'goods',
}

/** "Charged by time" offers only the time units, with "Other" last as everywhere. */
export const TIME_UNITS: readonly string[] = ['HUR', 'DAY', 'WEE', 'MON', 'ANN', 'ZZ']

/** The unit a kind starts on when the current one does not belong to it. */
export const FIRST_UNIT_OF_KIND: Record<ItemKind, string> = {
  handOver: 'EA',
  youDo: 'E48',
  byTime: 'HUR',
  several: 'SET',
}

/** A size is a price change against the base, not a price of its own. */
export type Size = { id: string; name: string; delta: number; code: string; onSale: boolean }

export type AddOn = { id: string; name: string; delta: number }

export const ITEM = {
  id: 'flat-white',
  name: 'Flat White',
  arabicName: 'فلات وايت',
  code: 'CAT-0208',
  group: 'Brewed drinks',
  itemKind: 'Milk coffee',
  addedOn: '14 Mar 2026',
  description: '',
  barcode: '',
  kind: 'handOver' as ItemKind,
  soldAs: 'EA',
  /** HS code (goods) or CL-12-OM service type (services), the line's classification. */
  hsCode: '',
  serviceType: '',
  /** Before VAT. The shelf price is worked out from it, not stored beside it. */
  basePrice: 1.333,
  taxCategory: 'S5',
  /** VATZR-OM / VATEX-OM code for Z and E; written reason for O. */
  exemptionReasonCode: '',
  exemptionReason: '',
  /** The catalogue discount, carried onto the invoice line as its line discount. */
  discountType: 'PERCENTAGE' as DiscountType,
  discountValue: '0',
  priceIncludesVat: false,
  staffCanChangePrice: false,
  keepCountOfThis: false,
  onSale: true,
  sold90: 1_204,
}

/** The shelf price a customer pays, from the base and the rate. */
export const shelfPrice = (base: number, rate = VAT_RATE) =>
  Math.round(base * (1 + rate) * 1000) / 1000

/** The base before VAT, from a shelf price typed with VAT in it ("Price includes VAT"). */
export const baseFromShelf = (shelf: number, rate = VAT_RATE) =>
  Math.round((shelf / (1 + rate)) * 1000) / 1000

export const SIZES: Size[] = [
  { id: 'regular', name: 'Regular', delta: 0, code: 'CAT-0208-R', onSale: true },
  { id: 'large', name: 'Large', delta: 0.3, code: 'CAT-0208-L', onSale: true },
  { id: 'takeaway', name: 'Takeaway cup', delta: 0.5, code: 'CAT-0208-T', onSale: true },
]

export const ADD_ONS: AddOn[] = [
  { id: 'extraShot', name: 'Extra shot', delta: 0.3 },
  { id: 'oatMilk', name: 'Oat milk', delta: 0.2 },
  { id: 'decaf', name: 'Decaf', delta: 0 },
  { id: 'vanilla', name: 'Vanilla syrup', delta: 0.15 },
]

/** What a size sells for — the shelf price plus the size's own change. */
export const sizePrice = (base: number, size: Size, rate = VAT_RATE) =>
  Math.round((shelfPrice(base, rate) + size.delta) * 1000) / 1000

/** The receipt the till would print, for the size and add-ons the preview shows. */
export function tillPreview(base: number, sizeId: string, addOnIds: string[], rate = VAT_RATE) {
  const size = SIZES.find((entry) => entry.id === sizeId) ?? SIZES[0]
  const lines = [
    { name: `${ITEM.name} · ${size.name}`, amount: sizePrice(base, size, rate) },
    ...addOnIds
      .map((id) => ADD_ONS.find((entry) => entry.id === id))
      .filter((entry): entry is AddOn => Boolean(entry))
      .map((entry) => ({ name: `+ ${entry.name}`, amount: entry.delta })),
  ]
  const total = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 1000) / 1000
  return { lines, total }
}

/** Which of the five readiness checks the item passes, worked out from the record. */
export function readiness(record: {
  name: string
  basePrice: number
  taxCategory: string
  group: string
  kind: string
  barcode: string
  /** False while the category needs a reason (Z, E) that has not been given. */
  reasonGiven?: boolean
  classified?: boolean
}) {
  return [
    { id: 'namedAndPriced', done: record.name.trim().length > 0 && record.basePrice > 0 },
    {
      id: 'taxAgrees',
      done: record.taxCategory.length > 0 && record.reasonGiven !== false,
    },
    { id: 'classified', done: record.classified !== false },
    { id: 'inAGroup', done: record.group.length > 0 && record.kind.length > 0 },
    { id: 'barcode', done: record.barcode.trim().length > 0 },
    { id: 'photo', done: false },
  ]
}

/* --------------------------------------------------------------- how it sells */

/** Ninety-day sales by size. These sum to the item's own sold-count. */
export const BY_SIZE = [
  { id: 'large', sold: 698 },
  { id: 'regular', sold: 382 },
  { id: 'takeaway', sold: 124 },
]

export const SOLD_90 = BY_SIZE.reduce((total, row) => total + row.sold, 0)

export const MOST_POPULAR_SIZE = (() => {
  const top = [...BY_SIZE].sort((a, b) => b.sold - a.sold)[0]
  return {
    id: top.id,
    name: SIZES.find((size) => size.id === top.id)?.name ?? '',
    share: Math.round((top.sold / SOLD_90) * 1000) / 10,
  }
})()

export const ADD_ONS_TAKEN = [
  { id: 'extraShot', taken: 214 },
  { id: 'oatMilk', taken: 188 },
  { id: 'vanilla', taken: 61 },
  { id: 'decaf', taken: 34 },
]

/**
 * What each add-on brought in, and which brought in most.
 *
 * The design's note credited "OMR 64.200 from oat milk alone", but 64.200 is 214 extra shots at
 * 0.300 — oat milk is 188 at 0.200, which is 37.600. The biggest earner is worked out here.
 */
export const addOnRevenue = () =>
  ADD_ONS_TAKEN.map((row) => {
    const addOn = ADD_ONS.find((entry) => entry.id === row.id)!
    return { ...row, name: addOn.name, revenue: Math.round(row.taken * addOn.delta * 1000) / 1000 }
  })

export const TOP_ADD_ON = () => [...addOnRevenue()].sort((a, b) => b.revenue - a.revenue)[0]

/** Roughly one sale in how many takes the most popular add-on. */
export const ONE_IN = () => Math.round(SOLD_90 / ADD_ONS_TAKEN[0].taken)

/** The year, which is the window the four cards at the top report on. */
export const YEAR = {
  sold: 4_047,
  soldChangePercent: 22,
  broughtIn: 6_308.4,
  broughtInChangePercent: 31,
  shareOfDrinks: 28.4,
  shareChangePoints: 2.1,
  averageChange: 0.112,
}

export const AVERAGE_SALE = Math.round((YEAR.broughtIn / YEAR.sold) * 1000) / 1000

/** Sold each month over the year the chart draws, oldest first. */
export const BY_MONTH = [
  { month: 'Aug', sold: 285 },
  { month: 'Sep', sold: 302 },
  { month: 'Oct', sold: 281 },
  { month: 'Nov', sold: 316 },
  { month: 'Dec', sold: 374 },
  { month: 'Jan', sold: 262 },
  { month: 'Feb', sold: 297 },
  { month: 'Mar', sold: 318 },
  { month: 'Apr', sold: 309 },
  { month: 'May', sold: 358 },
  { month: 'Jun', sold: 364 },
  { month: 'Jul', sold: 431 },
]

export const BEST_MONTH = [...BY_MONTH].sort((a, b) => b.sold - a.sold)[0]

/** Sold by hour of the trading day. */
export const BY_HOUR = [
  { hour: '7', sold: 144 },
  { hour: '8', sold: 160 },
  { hour: '9', sold: 168 },
  { hour: '10', sold: 190 },
  { hour: '11', sold: 155 },
  { hour: '12', sold: 178 },
  { hour: '1', sold: 186 },
  { hour: '2', sold: 205 },
]

export const PEAK_HOUR = [...BY_HOUR].sort((a, b) => b.sold - a.sold)[0]

/** Where the year's sales went. The two rows are the whole of it. */
export const WHERE_IT_GOES = { overTheCounter: 3_884, onAnInvoice: 163 }

export const whereItGoesShare = () => {
  const total = WHERE_IT_GOES.overTheCounter + WHERE_IT_GOES.onAnInvoice
  return {
    total,
    counterPercent: Math.round((WHERE_IT_GOES.overTheCounter / total) * 100),
    invoicePercent: Math.round((WHERE_IT_GOES.onAnInvoice / total) * 100),
  }
}

export const SELLING_FACTS = {
  biggestInvoicedBuyer: 'Barka Beach Resort',
  busiestDay: 'Tuesday',
  quietestDay: 'Friday',
  returns: 0,
}

/* ------------------------------------------------------- where it's been used */

export type UsedDocument = {
  id: string
  reference: string
  noteKey: string
  noteValues?: Record<string, string | number>
  kind: 'quotation' | 'bundle' | 'invoice' | 'till'
  stateKey: string
  customer: string
  purposeKey: string
  when: string
  /** Values for `when` when it is a key, such as the date in "Since {{date}}". */
  whenValues?: Record<string, string | number>
  /** Values for `stateKey`, such as the date in "Open until {{date}}". */
  stateValues?: Record<string, string | number>
  agoKey: string
  agoValues?: Record<string, string | number>
  quantity: number
  sizeKey: string
  lineValue: number
  atPrice: string
  atPriceOld?: boolean
  to?: string
}

/** Quotations are hidden until connected (R6), so a quotation row links nowhere. */
const QUOTATIONS_LINK = prototypeHidden('tradeDocuments')
  ? undefined
  : '/trade-documents/quotations'

export const USED_DOCUMENTS: UsedDocument[] = [
  {
    id: 'QT-0121',
    reference: 'QT-0121',
    noteKey: 'itemUsed.weeklyOfficeOrder',
    kind: 'quotation',
    stateKey: 'itemUsed.openUntil',
    stateValues: { date: '12 Aug' },
    customer: 'Muscat Grand Hotel',
    purposeKey: 'itemUsed.sentNotAnswered',
    when: '28 Jul 2026',
    agoKey: 'itemUsed.daysAgo',
    agoValues: { count: 2 },
    quantity: 40,
    sizeKey: 'Large',
    lineValue: 52,
    atPrice: '1.300',
    atPriceOld: true,
    to: QUOTATIONS_LINK,
  },
  {
    id: 'QT-0119',
    reference: 'QT-0119',
    noteKey: 'itemUsed.conferenceCatering',
    kind: 'quotation',
    stateKey: 'itemUsed.openUntil',
    stateValues: { date: '5 Aug' },
    customer: 'Al Mouj Marina',
    purposeKey: 'itemUsed.sentNotAnswered',
    when: '21 Jul 2026',
    agoKey: 'itemUsed.daysAgo',
    agoValues: { count: 9 },
    quantity: 120,
    sizeKey: 'Takeaway',
    lineValue: 216,
    atPrice: '1.800',
    atPriceOld: true,
    to: QUOTATIONS_LINK,
  },
  {
    id: 'PKG-0007',
    reference: 'Morning deal',
    noteKey: 'itemUsed.pkgCode',
    noteValues: { code: 'PKG-0007' },
    kind: 'bundle',
    stateKey: 'itemUsed.onSale',
    customer: 'itemUsed.anyoneAtTheTill',
    purposeKey: 'itemUsed.morningDealWindow',
    when: 'itemUsed.since',
    whenValues: { date: '4 Feb 2026' },
    agoKey: 'itemUsed.soldTimes',
    agoValues: { count: 68 },
    quantity: 1,
    sizeKey: 'Regular',
    lineValue: 1.4,
    atPrice: '2.300',
    to: '/catalog/bundles',
  },
  {
    id: 'INV-2038',
    reference: 'INV-2038',
    noteKey: 'itemUsed.fawtaraRef',
    noteValues: { ref: 'OM-2026-0084412' },
    kind: 'invoice',
    stateKey: 'itemUsed.paidReported',
    customer: 'Nizwa Souq Café',
    purposeKey: 'itemUsed.standingWeeklyOrder',
    when: '23 Jun 2026',
    agoKey: 'itemUsed.weeksAgo',
    agoValues: { count: 5 },
    quantity: 18,
    sizeKey: 'Regular',
    lineValue: 25.2,
    atPrice: '1.400',
    to: '/invoices/INV-2038',
  },
  {
    id: 'INV-2019',
    reference: 'INV-2019',
    noteKey: 'itemUsed.fawtaraRef',
    noteValues: { ref: 'OM-2026-0084266' },
    kind: 'invoice',
    stateKey: 'itemUsed.paidReported',
    customer: 'Barka Beach Resort',
    purposeKey: 'itemUsed.eventCatering',
    when: '14 Jun 2026',
    agoKey: 'itemUsed.weeksAgo',
    agoValues: { count: 7 },
    quantity: 64,
    sizeKey: 'Large',
    lineValue: 108.8,
    atPrice: '1.700',
    to: '/invoices/INV-2019',
  },
  {
    id: 'till',
    reference: 'itemUsed.receiptsRolledUp',
    noteKey: 'itemUsed.notListedOneByOne',
    kind: 'till',
    stateKey: 'itemUsed.walkInCustomers',
    customer: 'itemUsed.noNamedCustomer',
    purposeKey: 'itemUsed.reportedAsB2C',
    when: 'Apr – Jul 2026',
    agoKey: 'itemUsed.lastQuarter',
    quantity: 2_412,
    sizeKey: 'itemUsed.allSizes',
    lineValue: 3_761.1,
    atPrice: '1.559',
  },
]

/**
 * A document is something with its own number. Till sales are rolled up into one line rather
 * than listed, so they are shown but not counted among the documents.
 */
export const DOCUMENT_ROWS = USED_DOCUMENTS.filter((row) => row.kind !== 'till')

export const USED_TABS = [
  { id: 'all', labelKey: 'itemUsed.tab.all' },
  { id: 'invoice', labelKey: 'itemUsed.tab.invoices' },
  { id: 'quotation', labelKey: 'itemUsed.tab.quotations' },
  { id: 'bundle', labelKey: 'itemUsed.tab.bundles' },
  { id: 'till', labelKey: 'itemUsed.tab.tillReceipts' },
] as const

export type UsedTab = (typeof USED_TABS)[number]['id']

/** Counts drawn from a wider book than the six rows the page lists. */
export const USED_BOOK = { invoices: 41, quotations: 3, bundles: 1, tillReceiptGroups: 3 }

export const USED_TOTAL = USED_BOOK.invoices + USED_BOOK.quotations + USED_BOOK.bundles

export function countUsedTab(tab: UsedTab) {
  if (tab === 'all') return USED_TOTAL
  if (tab === 'invoice') return USED_BOOK.invoices
  if (tab === 'quotation') return USED_BOOK.quotations
  if (tab === 'bundle') return USED_BOOK.bundles
  return USED_BOOK.tillReceiptGroups
}

export const matchesUsedTab = (row: UsedDocument, tab: UsedTab) =>
  tab === 'all' ? true : row.kind === tab

export const USED_SUMMARY = {
  tillReceipts: WHERE_IT_GOES.overTheCounter,
  onInvoices: USED_BOOK.invoices,
  invoiceUnits: WHERE_IT_GOES.onAnInvoice,
  openQuotations: USED_BOOK.quotations,
  quotationsAtOldPrice: 2,
  insideBundles: USED_BOOK.bundles,
  bundleName: 'Morning deal',
  bundleSold: 68,
}

/* ------------------------------------------------------------------- changes */

export type Change = {
  id: string
  date: string
  at: string
  kind: 'priceUp' | 'added' | 'tax' | 'bulk' | 'created'
  category: 'price' | 'sizes' | 'tax' | 'created'
  titleKey: string
  titleValues?: Record<string, string | number>
  who: string
  fromKey: string
  chips: { label: string; tone: 'was' | 'now' | 'plain' }[]
  noteKey?: string
  noteValues?: Record<string, string | number>
  outcomeKey?: string
  outcomeValues?: Record<string, string | number>
  outcomeTone?: 'good' | 'plain'
  badgeKey: string
}

export const CHANGES: Change[] = [
  {
    id: 'c1',
    date: '14 Mar 2026',
    at: '09:12',
    kind: 'priceUp',
    category: 'price',
    titleKey: 'itemChanges.basePriceRaised',
    who: 'Hafidh Saif',
    fromKey: 'itemChanges.fromTheItemScreen',
    chips: [
      { label: 'OMR 1.238', tone: 'was' },
      { label: 'OMR 1.333', tone: 'now' },
      { label: 'sells for 1.400', tone: 'plain' },
    ],
    noteKey: 'itemChanges.noteLeft',
    noteValues: { note: 'Beans up 8% from Muscat Roastery in February. Holding the margin.' },
    outcomeKey: 'itemChanges.salesKeptClimbing',
    outcomeValues: { amount: '156.700' },
    outcomeTone: 'good',
    badgeKey: 'itemChanges.byHand',
  },
  {
    id: 'c2',
    date: '2 Feb 2026',
    at: '14:48',
    kind: 'added',
    category: 'sizes',
    titleKey: 'itemChanges.addOnAdded',
    titleValues: { name: 'Oat milk' },
    who: 'Yusuf Al Balushi',
    fromKey: 'itemChanges.fromTheItemScreen',
    chips: [{ label: 'Oat milk · +0.200', tone: 'now' }],
    outcomeKey: 'itemChanges.takenOnSales',
    outcomeValues: { count: 188, amount: '37.600' },
    outcomeTone: 'good',
    badgeKey: 'itemChanges.byHand',
  },
  {
    id: 'c3',
    date: '18 Jan 2026',
    at: '11:03',
    kind: 'tax',
    category: 'tax',
    titleKey: 'itemChanges.taxCorrected',
    who: 'Hafidh Saif',
    fromKey: 'itemChanges.afterAReportWasRefused',
    chips: [
      { label: 'Zero-rated', tone: 'was' },
      { label: 'Standard · 5%', tone: 'now' },
    ],
    noteKey: 'itemChanges.taxBody',
    noteValues: { invoice: 'INV-1841', code: 'OTA-E-1122' },
    outcomeKey: 'itemChanges.invoicesBeforeKeep',
    outcomeValues: { count: 2 },
    badgeKey: 'itemChanges.byHand',
  },
  {
    id: 'c4',
    date: '4 Jan 2026',
    at: '08:20',
    kind: 'bulk',
    category: 'price',
    titleKey: 'itemChanges.priceRaisedInBulk',
    who: 'Hafidh Saif',
    fromKey: 'itemChanges.itemsChangedTogether',
    chips: [
      { label: 'OMR 1.190', tone: 'was' },
      { label: 'OMR 1.238', tone: 'now' },
      { label: '+4% across the group', tone: 'plain' },
    ],
    outcomeKey: 'itemChanges.partOfAChange',
    outcomeValues: { count: 34, others: 33 },
    badgeKey: 'itemChanges.bulkChange',
  },
  {
    id: 'c5',
    date: '8 Nov 2025',
    at: '16:31',
    kind: 'added',
    category: 'sizes',
    titleKey: 'itemChanges.sizeAdded',
    titleValues: { name: 'Takeaway cup' },
    who: 'Yusuf Al Balushi',
    fromKey: 'itemChanges.fromTheItemScreen',
    chips: [
      { label: 'Takeaway cup · +0.500', tone: 'now' },
      { label: 'code CAT-0208-T', tone: 'plain' },
    ],
    outcomeKey: 'itemChanges.soldTimesInMonths',
    outcomeValues: { count: 124, months: 9 },
    badgeKey: 'itemChanges.byHand',
  },
  {
    id: 'c6',
    date: '14 Mar 2025',
    at: '10:02',
    kind: 'created',
    category: 'created',
    titleKey: 'itemChanges.itemCreated',
    who: 'Hafidh Saif',
    fromKey: 'itemChanges.fromTheCatalogBuilder',
    chips: [
      { label: 'Brewed drinks › Milk coffee', tone: 'plain' },
      { label: 'OMR 1.190', tone: 'plain' },
      { label: 'Regular and Large', tone: 'plain' },
    ],
    noteKey: 'itemChanges.suggestedByFawtir',
    badgeKey: 'itemChanges.catalogBuilder',
  },
]

/** The whole history, of which the page draws the six above. */
export const CHANGE_BOOK = { total: 14, price: 9, sizes: 3, tax: 1, created: 1 }

export const CHANGE_TABS = [
  { id: 'all', labelKey: 'itemChanges.tab.all' },
  { id: 'price', labelKey: 'itemChanges.tab.price' },
  { id: 'sizes', labelKey: 'itemChanges.tab.sizes' },
  { id: 'tax', labelKey: 'itemChanges.tab.tax' },
] as const

export type ChangeTab = (typeof CHANGE_TABS)[number]['id']

export function countChangeTab(tab: ChangeTab) {
  if (tab === 'all') return CHANGE_BOOK.total
  if (tab === 'price') return CHANGE_BOOK.price
  if (tab === 'sizes') return CHANGE_BOOK.sizes
  return CHANGE_BOOK.tax
}

export const matchesChangeTab = (change: Change, tab: ChangeTab) =>
  tab === 'all' ? true : change.category === tab

export const ITEM_TABS = [
  { id: 'details', labelKey: 'item.tab.details', to: '' },
  { id: 'sells', labelKey: 'item.tab.sells', to: '/sells' },
  { id: 'used', labelKey: 'item.tab.used', to: '/used' },
  { id: 'changes', labelKey: 'item.tab.changes', to: '/changes' },
]

export { omr }
