/**
 * Reports — Insights › Reports (Figma 112:8367, 112:8814, 112:9257, 112:9725, 112:10146,
 * 112:10583).
 *
 * Six views over the same year of trading. The design prints each figure separately, which lets
 * the pages contradict each other — the Income page's 194,800.000 and the VAT page's 9,740.000
 * are the same trading year seen twice. Here one set of monthly numbers is stated and everything
 * else is computed from it, so a change to a month moves every card, chart and footnote that
 * depends on it.
 */

/** The trading year runs Aug → Jul, which is the order every monthly chart uses. */
export const FISCAL_MONTHS = [
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
] as const

export type FiscalMonth = (typeof FISCAL_MONTHS)[number]

/** Oman VAT is 5% on everything these two trade in. */
export const VAT_RATE = 0.05

/** Net invoiced per month, the figure the whole Income and VAT story is built from. */
export const INCOME_BY_MONTH = [
  14_300, 15_100, 13_900, 16_200, 19_300, 12_900, 14_400, 16_100, 15_600, 17_800, 18_800, 20_400,
]

/** Net billed per month, likewise for Expenditure. */
export const SPEND_BY_MONTH = [
  10_100, 10_600, 9_700, 11_300, 13_400, 9_000, 10_100, 11_200, 10_100, 12_300, 12_700, 14_100,
]

/** Cash actually received, and cash actually paid — neither equals what was invoiced. */
export const CASH_IN_BY_MONTH = [
  16_900, 17_400, 16_300, 18_100, 20_600, 15_400, 16_800, 18_000, 17_600, 19_700, 20_000, 23_300,
]

export const CASH_OUT_BY_MONTH = [
  12_100, 12_400, 11_800, 12_900, 15_100, 9_900, 12_000, 12_800, 12_600, 13_900, 13_800, 16_700,
]

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Groups the twelve fiscal months into four quarters of three. */
const quarters = (values: number[]) => [
  sum(values.slice(0, 3)),
  sum(values.slice(3, 6)),
  sum(values.slice(6, 9)),
  sum(values.slice(9, 12)),
]

const indexOfMax = (values: number[]) =>
  values.reduce((best, value, index) => (value > values[best] ? index : best), 0)

/* ------------------------------------------------------------------ formats */

/** Whole OMR with thousands separators — `194800` → `194,800.000`. */
export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/** Plain counts — `1624` → `1,624`. */
export const formatCount = (value: number) => value.toLocaleString('en-US')

/** Axis ticks are whole numbers throughout the design, however small the scale. */
export const formatTick = (value: number) => Math.round(value).toLocaleString('en-US')

/** `134` → `2m 14s`. */
export const formatDuration = (seconds: number) => {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`
}

/** A share of a total, rounded the way every share sentence in the design prints it. */
export const formatPercent = (part: number, total: number) =>
  String(Math.round(total === 0 ? 0 : (part / total) * 100))

/* ------------------------------------------------------------------- income */

const incomeTotal = sum(INCOME_BY_MONTH)
const incomeVat = incomeTotal * VAT_RATE
const invoicesSent = 1_624

export const INCOME = {
  net: incomeTotal,
  vat: incomeVat,
  invoicesSent,
  /** The average follows from the two figures above rather than being stated. */
  averageInvoice: incomeTotal / invoicesSent,
  growth: '17.4',
  invoicesMore: 212,

  monthly: INCOME_BY_MONTH.map((net, index) => ({
    month: FISCAL_MONTHS[index],
    net,
    vat: net * VAT_RATE,
  })),
  bestMonthIndex: indexOfMax(INCOME_BY_MONTH),

  quarterly: quarters(INCOME_BY_MONTH),
  /** Last year, quarter by quarter — every one below this year's. */
  quarterlyLastYear: [38_200, 41_300, 39_200, 47_200],

  annual: [
    { year: '2024', value: 149_040 },
    { year: '2025', value: 165_900 },
    { year: '2026', value: incomeTotal },
  ],
  onTrackFor: 207_000,

  topCustomers: [
    { name: 'Nizwa Souq Café', value: 37_300 },
    { name: 'Barka Beach Resort', value: 29_200 },
    { name: 'Muscat Grand Hotel', value: 22_800 },
    { name: 'Al Mouj Marina', value: 16_500 },
    { name: 'Sohar Coffee House', value: 13_000 },
  ],
}

/* -------------------------------------------------------------- expenditure */

const spendTotal = sum(SPEND_BY_MONTH)
const billsReceived = 1_891


/* --------------------------------------------------------------- vat & tax */

const vatByMonth = INCOME_BY_MONTH.map((net, index) => (net - SPEND_BY_MONTH[index]) * VAT_RATE)

export const VAT = {
  collected: incomeVat,
  paid: spendTotal * VAT_RATE,
  owed: incomeVat - spendTotal * VAT_RATE,
  collectedGrowth: '17.4',
  paidGrowth: '11.2',
  owedGrowth: '32.6',
  nextReturnDue: '30 Oct',

  /** A rolling four quarters, which is what Figma's labels describe. */
  quarterly: [
    { labelKey: 'reports.vat.q4Last', collected: 1_850, paid: 1_320 },
    {
      labelKey: 'reports.vat.q1',
      collected: quarters(INCOME_BY_MONTH)[0] * VAT_RATE,
      paid: quarters(SPEND_BY_MONTH)[0] * VAT_RATE,
    },
    {
      labelKey: 'reports.vat.q2',
      collected: quarters(INCOME_BY_MONTH)[1] * VAT_RATE,
      paid: quarters(SPEND_BY_MONTH)[1] * VAT_RATE,
    },
    {
      labelKey: 'reports.vat.q3SoFar',
      collected: quarters(INCOME_BY_MONTH)[2] * VAT_RATE,
      paid: quarters(SPEND_BY_MONTH)[2] * VAT_RATE,
    },
  ],

  monthlyNet: vatByMonth,
  peakMonthIndex: indexOfMax(vatByMonth),

  treatment: [
    { labelKey: 'reports.vat.sales', standard: 94, zeroRated: 4, exempt: 2 },
    { labelKey: 'reports.vat.purchases', standard: 97, zeroRated: 2, exempt: 1 },
  ],

  /** These add up to the input VAT above. */
  reclaimBySupplier: [
    { name: 'Muscat Roastery', value: 2_140 },
    { name: 'Sohar Packaging', value: 1_070 },
    { name: 'Gulf Cold Logistics', value: 745 },
    { name: 'Al Noor Dates', value: 560 },
    { name: 'reports.vat.others', value: 2_215, isKey: true },
  ],
}

/* -------------------------------------------------------------- compliance */

const REJECTIONS = [
  { labelKey: 'reports.compliance.reasons.peppolId', value: 21 },
  { labelKey: 'reports.compliance.reasons.taxCategory', value: 11 },
  { labelKey: 'reports.compliance.reasons.totals', value: 8 },
  { labelKey: 'reports.compliance.reasons.buyerVat', value: 5 },
  { labelKey: 'reports.compliance.reasons.everythingElse', value: 2 },
]

const rejected = sum(REJECTIONS.map((reason) => reason.value))
const acceptedFirstTime = invoicesSent - rejected
const lateDeliveries = 10
const secondsToClear = [158, 154, 146, 140, 135, 130, 127, 126, 124, 122, 120, 126]

export const COMPLIANCE = {
  sent: invoicesSent,
  /** Rejections are the reasons added up, so the two can never drift apart. */
  rejected,
  acceptedFirstTime,
  acceptedPercent: (acceptedFirstTime / invoicesSent) * 100,
  acceptedChange: '1.4',

  averageSeconds: sum(secondsToClear) / secondsToClear.length,
  fasterBy: 38,
  rejectionsFewer: 12,

  lateDeliveries,
  onTimePercent: ((invoicesSent - lateDeliveries) / invoicesSent) * 100,

  monthlyAcceptance: [93.4, 93.9, 94.3, 94.8, 95.2, 95.5, 95.9, 96.2, 96.4, 96.7, 96.9, 97.1],
  secondsToClear,
  reasons: REJECTIONS,

  outcomes: [
    { labelKey: 'reports.vat.q4Last', firstTime: 93, onRetry: 5, failed: 2 },
    { labelKey: 'reports.vat.q1', firstTime: 95, onRetry: 4, failed: 1 },
    { labelKey: 'reports.vat.q2', firstTime: 96, onRetry: 3, failed: 1 },
    { labelKey: 'reports.vat.q3SoFar', firstTime: 97, onRetry: 2, failed: 1 },
  ],
}

/* ------------------------------------------------------------------- lists */

export type ExportList = {
  id: string
  icon:
    | 'invoice'
    | 'customers'
    | 'catalog'
    | 'payment'
    | 'bill'
    | 'supplier'
    | 'transfer'
    | 'note'
    | 'vat'
    | 'tdd'
    | 'aged'
    | 'journal'
  rows: number
  columns: number
}

export const LIST_SECTIONS: { id: string; lists: ExportList[] }[] = [
  {
    id: 'sales',
    lists: [
      { id: 'everyInvoice', icon: 'invoice', rows: invoicesSent, columns: 18 },
      { id: 'customers', icon: 'customers', rows: 42, columns: 12 },
      { id: 'catalogLines', icon: 'catalog', rows: 4_918, columns: 11 },
      { id: 'paymentsReceived', icon: 'payment', rows: 1_481, columns: 9 },
    ],
  },
  {
    id: 'purchases',
    lists: [
      { id: 'everyBill', icon: 'bill', rows: billsReceived, columns: 19 },
      { id: 'suppliers', icon: 'supplier', rows: 68, columns: 13 },
      { id: 'paymentsMade', icon: 'transfer', rows: 312, columns: 10 },
      { id: 'creditDebitNotes', icon: 'note', rows: 43, columns: 12 },
    ],
  },
  {
    id: 'accountant',
    lists: [
      /** One ledger line per document, both directions. */
      { id: 'vatLedger', icon: 'vat', rows: invoicesSent + billsReceived, columns: 14 },
      { id: 'tddRegister', icon: 'tdd', rows: invoicesSent + billsReceived, columns: 8 },
      { id: 'agedDebtors', icon: 'aged', rows: 110, columns: 9 },
      { id: 'journal', icon: 'journal', rows: 9_842, columns: 10 },
    ],
  },
]

/* ------------------------------------------------------------------- shell */

export const REPORT_TABS = [
  { id: 'income', to: '/reports/income' },
  { id: 'expenditure', to: '/reports/expenditure' },
  { id: 'cashFlow', to: '/reports/cash-flow' },
  { id: 'vat', to: '/reports/vat-tax' },
  { id: 'compliance', to: '/reports/compliance' },
  { id: 'lists', to: '/reports/lists' },
] as const

export const PERIOD_OPTIONS = [
  { value: 'yearly', labelKey: 'reports.periods.yearly' },
  { value: 'quarterly', labelKey: 'reports.periods.quarterly' },
  { value: 'monthly', labelKey: 'reports.periods.monthly' },
]
