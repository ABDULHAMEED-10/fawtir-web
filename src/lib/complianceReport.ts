/**
 * The compliance report pack — Compliance › Activity › Report (Figma 131:17440, 131:15307).
 *
 * What an auditor or the Authority asks for: every invoice in a period, its Tax Data Document,
 * and the evidence that each one was accepted. The summary is worked out from the period chosen
 * rather than printed, so changing the period moves the counts and the money together.
 */

export type ReportPeriodId = 'month' | 'quarter' | 'year' | 'custom'

export const REPORT_PERIODS: { id: ReportPeriodId; labelKey: string }[] = [
  { id: 'month', labelKey: 'complianceReport.period.thisMonth' },
  { id: 'quarter', labelKey: 'complianceReport.period.quarter' },
  { id: 'year', labelKey: 'complianceReport.period.thisYear' },
  { id: 'custom', labelKey: 'complianceReport.period.custom' },
]

export function isReportPeriod(value: string | null): value is ReportPeriodId {
  return REPORT_PERIODS.some((entry) => entry.id === value)
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * A period's window, worked out from today rather than printed, and the label it goes by.
 *
 * "Quarter" is the last complete one, as the frame's "Q2 2026" is on a day in the quarter after.
 * Custom takes the dates the reader picks, and starts on the quarter's window.
 */
export function periodRange(
  period: ReportPeriodId,
  today: Date = new Date(),
  custom?: { from: string; to: string },
): { from: string; to: string; labelKey: string; values?: Record<string, string | number> } {
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  if (period === 'month') {
    return {
      from: isoDay(new Date(Date.UTC(year, month, 1))),
      to: isoDay(today),
      labelKey: 'complianceReport.period.thisMonth',
    }
  }
  if (period === 'year') {
    return {
      from: `${year}-01-01`,
      to: isoDay(today),
      labelKey: 'complianceReport.period.thisYear',
    }
  }
  const current = Math.floor(month / 3)
  const lastYear = current === 0 ? year - 1 : year
  const last = current === 0 ? 3 : current - 1
  const quarter = {
    from: isoDay(new Date(Date.UTC(lastYear, last * 3, 1))),
    to: isoDay(new Date(Date.UTC(lastYear, last * 3 + 3, 0))),
    labelKey: 'complianceReport.period.quarter',
    values: { quarter: last + 1, year: lastYear },
  }
  if (period === 'custom') {
    return {
      from: custom?.from || quarter.from,
      to: custom?.to || quarter.to,
      labelKey: 'complianceReport.period.custom',
    }
  }
  return quarter
}

/** What can go in the pack. The invoice register always does — it is the report. */
export const REPORT_SECTIONS = [
  {
    id: 'register',
    titleKey: 'complianceReport.section.register',
    noteKey: 'complianceReport.section.registerNote',
    always: true,
    defaultOn: true,
  },
  {
    id: 'rejections',
    titleKey: 'complianceReport.section.rejections',
    noteKey: 'complianceReport.section.rejectionsNote',
    defaultOn: true,
  },
  {
    id: 'superseded',
    titleKey: 'complianceReport.section.superseded',
    noteKey: 'complianceReport.section.supersededNote',
    defaultOn: true,
  },
  {
    id: 'flows',
    titleKey: 'complianceReport.section.flows',
    noteKey: 'complianceReport.section.flowsNote',
    defaultOn: true,
  },
  {
    id: 'xml',
    titleKey: 'complianceReport.section.xml',
    noteKey: 'complianceReport.section.xmlNote',
    values: { files: 412, size: '8 MB' },
    defaultOn: false,
  },
  {
    id: 'acks',
    titleKey: 'complianceReport.section.acks',
    noteKey: 'complianceReport.section.acksNote',
    defaultOn: false,
  },
] as {
  id: string
  titleKey: string
  noteKey: string
  always?: boolean
  defaultOn: boolean
  values?: Record<string, string | number>
}[]

/**
 * Each period's book.
 *
 * Stated at invoice level; the rate and the VAT below are worked out from these, so a period can
 * never show a percentage that disagrees with its own counts.
 */
const PERIOD_BOOKS: Record<
  string,
  { invoices: number; corrected: number; notReported: number; netInvoiced: number }
> = {
  month: { invoices: 147, corrected: 2, notReported: 1, netInvoiced: 18_902.4 },
  quarter: { invoices: 412, corrected: 5, notReported: 1, netInvoiced: 52_418.9 },
  year: { invoices: 1_624, corrected: 39, notReported: 4, netInvoiced: 194_800 },
  custom: { invoices: 412, corrected: 5, notReported: 1, netInvoiced: 52_418.9 },
}

/** Oman VAT is 5% on everything in this book. */
const VAT_RATE = 0.05

const round3 = (value: number) => Math.round(value * 1000) / 1000

export function periodFigures(period: string) {
  const book = PERIOD_BOOKS[period] ?? PERIOD_BOOKS.quarter
  const accepted = book.invoices - book.corrected - book.notReported
  return {
    invoices: book.invoices,
    accepted,
    acceptedRate: Math.round((accepted / book.invoices) * 1000) / 10,
    corrected: book.corrected,
    notReported: book.notReported,
    netInvoiced: book.netInvoiced,
    vat: round3(book.netInvoiced * VAT_RATE),
  }
}

export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/* -------------------------------------------------------- the built report */

/** A row of the register as the report prints it. */
export type RegisterRow = {
  invoice: string
  date: string
  customer: string
  total: number
  vat: number
  reference?: string
  outcome: 'accepted' | 'corrected' | 'notReported'
}

/**
 * The report as built, for Q2.
 *
 * "Accepted" here counts every invoice the Authority holds a live TDD for, whether it took one
 * attempt or two — which is why it is higher than the accepted-first-time figure on the dialog.
 */
export const BUILT_REPORT = {
  reference: 'CR-2026-Q2-0004',
  period: 'quarter' as ReportPeriodId,
  periodLabelKey: 'complianceReport.period.q2',
  range: '1 April – 30 June 2026',
  builtAt: '30 Jul, 09:58',
  builtBy: 'Hafidh Saif, Owner',
  pages: 18,

  preparedFor: {
    name: 'Al Bahja Coffee LLC',
    vat: 'OM1100392000',
    cr: '1103920',
    address: 'Souq Street, Nizwa, Oman',
    peppolId: '0248:OM1100392000',
    since: '2 Sep 2024',
  },

  /** The one invoice the Authority never accepted, and what it costs. */
  unreported: {
    invoice: 'INV-1974',
    issued: '12 May 2026',
    customer: 'Sohar Coffee House',
    total: 761.04,
    vat: 36.24,
    code: 'OTA-E-1122',
  },

  numberingFrom: 'INV-1801',
  numberingTo: 'INV-2212',

  register: [
    {
      invoice: 'INV-1801',
      date: '1 Apr 2026',
      customer: 'Nizwa Souq Café',
      total: 318.78,
      vat: 15.18,
      reference: 'OM-2026-0079114',
      outcome: 'accepted',
    },
    {
      invoice: 'INV-1802',
      date: '1 Apr 2026',
      customer: 'Walk-in customer',
      total: 4.2,
      vat: 0.2,
      reference: 'OM-2026-0079115',
      outcome: 'accepted',
    },
    {
      invoice: 'INV-1803',
      date: '2 Apr 2026',
      customer: 'Barka Beach Resort',
      total: 1204,
      vat: 57.333,
      reference: 'OM-2026-0079133',
      outcome: 'corrected',
    },
    {
      invoice: 'INV-1974',
      date: '12 May 2026',
      customer: 'Sohar Coffee House',
      total: 761.04,
      vat: 36.24,
      outcome: 'notReported',
    },
    {
      invoice: 'INV-1975',
      date: '12 May 2026',
      customer: 'Al Mouj Marina',
      total: 604.8,
      vat: 28.8,
      reference: 'OM-2026-0081447',
      outcome: 'accepted',
    },
  ] satisfies RegisterRow[],

  fingerprint: 'SHA-256 - 9c48ab7f1d5e83206bf4a917cc2d5e984713b3fa8e29d8cd154bb70e3d9f1a24c',
  verifyUrl: 'fawtir.om/verify/CR-2026-Q2-0004',

  contents: [
    { id: 'summary', page: 1 },
    { id: 'rejections', page: 2 },
    { id: 'corrected', page: 3 },
    { id: 'register', page: 4 },
    { id: 'withdrawn', page: 17 },
    { id: 'flows', page: 18 },
  ],

  sharing: { sharedWith: 0, downloads: 0 },
}

/** Everything the cover page prints, worked out from the period's book. */
export function builtFigures() {
  const base = periodFigures(BUILT_REPORT.period)
  return {
    ...base,
    /** Accepted at all — first time or after a correction. */
    acceptedOverall: base.accepted + base.corrected,
    acceptedOverallRate: Math.round(((base.accepted + base.corrected) / base.invoices) * 1000) / 10,
    /** VAT sitting on the invoice the Authority never took, so outside the figure above. */
    vatOutside: BUILT_REPORT.unreported.vat,
    creditNotes: 8,
  }
}
