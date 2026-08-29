/**
 * One supplier's record — Contacts › Suppliers › Detail (Figma 117:32564).
 *
 * The overview answers three questions in order: what do we owe them, what is that made of, and
 * is anything about the record going to stop a payment going out. The figures below are stated
 * once at bill level and everything above them — the ageing bands, the header total, the badge
 * on the payment run — is added up from those bills.
 */

export type BillState = 'inRun' | 'paid' | 'onHold' | 'approved'

export type SupplierBill = {
  id: string
  arrived: string
  poRef: string
  due: string
  dueNote: string
  /** Days until due; negative once late. Drives the ageing bands. */
  dueInDays: number
  state: BillState
  whereKey: string
  whereNoteKey: string
  amount: number
  /** An early-settlement discount available on this bill, when there is one. */
  discountRate?: number
  /** Credit sitting against this bill and not yet used. */
  creditUnused?: number
  actionKey: string
}

const BILLS: SupplierBill[] = [
  {
    id: 'MR-INV-8821',
    arrived: '29 Jul',
    poRef: 'PO-0031',
    due: '28 Aug 2026',
    dueNote: 'supplierDetail.dueIn',
    dueInDays: 29,
    state: 'inRun',
    whereKey: 'supplierDetail.inRun',
    whereNoteKey: 'supplierDetail.payingToTakeDiscount',
    amount: 2354.31,
    discountRate: 0.02,
    actionKey: 'supplierDetail.openTheRun',
  },
  {
    id: 'MR-INV-8790',
    arrived: '21 Jul',
    poRef: 'PO-0027',
    due: '2 Aug 2026',
    dueNote: 'supplierDetail.dueIn',
    dueInDays: 3,
    state: 'inRun',
    whereKey: 'supplierDetail.inRun',
    whereNoteKey: 'supplierDetail.mergedIntoOne',
    amount: 404.79,
    actionKey: 'supplierDetail.openTheRun',
  },
  {
    id: 'MR-INV-8712',
    arrived: '18 Jun',
    poRef: 'PO-0021',
    due: '18 Jul 2026',
    dueNote: 'supplierDetail.paidOn',
    dueInDays: -30,
    state: 'paid',
    whereKey: 'supplierDetail.paid',
    whereNoteKey: 'supplierDetail.creditOutstanding',
    amount: 1842.5,
    creditUnused: 242.5,
    actionKey: 'supplierDetail.useTheCredit',
  },
]

const round3 = (value: number) => Math.round(value * 1000) / 1000
const sum = (values: number[]) => round3(values.reduce((total, value) => total + value, 0))

/** Bills still to be paid — the ones every figure on this screen is about. */
const openBills = BILLS.filter((bill) => bill.state !== 'paid')

/**
 * The four ageing bands across the top.
 *
 * Each bill falls into exactly one, so the bands always add up to the header total rather than
 * being three separate numbers that happen to agree.
 */
const notDueYet = openBills.filter((bill) => bill.dueInDays > 7)
const dueWithinSeven = openBills.filter((bill) => bill.dueInDays >= 0 && bill.dueInDays <= 7)
const alreadyLate = openBills.filter((bill) => bill.dueInDays < 0)
const onHold = openBills.filter((bill) => bill.state === 'onHold')

export const SUPPLIER_DETAIL = {
  slug: 'muscat-roastery',
  name: 'Muscat Roastery Co',
  initials: 'MR',
  legalName: 'Muscat Roastery Co LLC',
  tradingName: 'Muscat Roastery Company LLC',
  vat: 'OM1100447102',
  crNumber: '1104472',
  address: 'Rusayl, Muscat',
  since: '2 Sep 2024',
  sinceShort: 'Sep 2024',
  addedBy: 'Hafidh Saif',
  category: 'supplierDetail.rawMaterials',

  bills: BILLS,
  openBills,

  /** Everything owed, and what it is made of. */
  owed: sum(openBills.map((bill) => bill.amount)),
  bands: [
    { id: 'notDueYet', total: sum(notDueYet.map((b) => b.amount)), bills: notDueYet },
    { id: 'dueWithin7', total: sum(dueWithinSeven.map((b) => b.amount)), bills: dueWithinSeven },
    { id: 'alreadyLate', total: sum(alreadyLate.map((b) => b.amount)), bills: alreadyLate },
    { id: 'onHold', total: sum(onHold.map((b) => b.amount)), bills: onHold },
  ],

  /** Counts behind the tabs. */
  counts: { bills: 31, payments: 28, orders: 12, documents: 4 },

  paymentRun: 'PR-0014',
  paymentRunDate: '3 Aug',

  paying: {
    terms: 'supplierDetail.net30Days',
    earlySettlement: 'supplierDetail.twoPercentSeven',
    bank: 'Bank Muscat',
    iban: 'OM55 ··· 4471 2290',
    bic: 'BMUSOMRX',
    changedOn: '14 Jan 2026',
  },

  billing: {
    peppolId: '0248:OM1100447102',
    /** Every bill so far has found its purchase order. */
    matched: 31,
    matchedOf: 31,
    selfBilling: false,
  },

  contacts: [
    {
      id: 'ahmed',
      name: 'Ahmed Al Harthy',
      detail: 'ahmed@muscatroastery.com',
      tagKey: 'supplierDetail.main',
      initials: 'AH',
    },
    {
      id: 'fatma',
      name: 'Fatma Al Riyami',
      detail: '+968 9xxx 2290',
      tagKey: 'supplierDetail.billing',
      initials: 'FA',
    },
  ],

  /** What we buy from them, over the last twelve months. */
  purchases: [
    {
      id: 'yirgacheffe',
      nameKey: 'supplierDetail.buy.yirgacheffe',
      amount: 28400,
      qty: '3,840 KG',
    },
    { id: 'houseBlend', nameKey: 'supplierDetail.buy.houseBlend', amount: 9720, qty: '1,280 KG' },
    { id: 'roasting', nameKey: 'supplierDetail.buy.roasting', amount: 3940, qty: '938 batches' },
    { id: 'jute', nameKey: 'supplierDetail.buy.jute', amount: 740, qty: '400 units' },
  ],
  priceNoteKey: 'supplierDetail.priceNote',

  papers: [
    {
      id: 'agreement2',
      titleKey: 'supplierDetail.papers.agreementV2',
      metaKey: 'supplierDetail.papers.agreementV2Meta',
      status: 'current' as const,
    },
    {
      id: 'vatCert',
      titleKey: 'supplierDetail.papers.vatCert',
      metaKey: 'supplierDetail.papers.vatCertMeta',
      status: 'onFile' as const,
    },
    {
      id: 'priceList',
      titleKey: 'supplierDetail.papers.priceList',
      metaKey: 'supplierDetail.papers.priceListMeta',
      status: 'current' as const,
    },
    {
      id: 'agreement1',
      titleKey: 'supplierDetail.papers.agreementV1',
      metaKey: 'supplierDetail.papers.agreementV1Meta',
      status: 'superseded' as const,
    },
  ],
}

/** The discount taken by paying the larger bill early, derived rather than printed. */
export const EARLY_SETTLEMENT_SAVING = round3(
  BILLS.filter((bill) => bill.discountRate).reduce(
    (total, bill) => total + bill.amount * (bill.discountRate ?? 0),
    0,
  ),
)

/** Total spend over the twelve months, so the breakdown can show shares. */
export const PURCHASE_TOTAL = sum(SUPPLIER_DETAIL.purchases.map((line) => line.amount))

export const DETAIL_TABS = [
  { id: 'overview', labelKey: 'supplierDetail.tabs.overview' },
  { id: 'bills', labelKey: 'supplierDetail.tabs.bills', count: SUPPLIER_DETAIL.counts.bills },
  {
    id: 'payments',
    labelKey: 'supplierDetail.tabs.payments',
    count: SUPPLIER_DETAIL.counts.payments,
  },
  { id: 'orders', labelKey: 'supplierDetail.tabs.orders', count: SUPPLIER_DETAIL.counts.orders },
  {
    id: 'documents',
    labelKey: 'supplierDetail.tabs.documents',
    count: SUPPLIER_DETAIL.counts.documents,
  },
] as const

export type DetailTabId = (typeof DETAIL_TABS)[number]['id']
