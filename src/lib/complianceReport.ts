/**
 * The compliance report pack — Compliance › Activity › Report (Figma 131:17440, 131:15307).
 *
 * What an auditor or the Authority asks for: every invoice in a period, its Tax Data Document,
 * and the evidence that each one was accepted. The summary is worked out from the period chosen
 * rather than printed, so changing the period moves the counts with it. The real dialog prints
 * only what the server sends; the sample book below feeds the demo prototype alone.
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
    // Replacing or cancelling a report is something WE send (TDD type R or D), not an OTA act.
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
 * Each period's book (the design's figures, asks row 2.9).
 *
 * Invented sample data: it may only feed the demo prototype's built report (`builtFigures`).
 * The real compliance report dialog read it as a fallback and showed these totals to a real
 * company; that path was removed, and none other may be added.
 *
 * Stated at invoice level; the rate and the VAT below are worked out from these, so a period can
 * never show a percentage that disagrees with its own counts. `netInvoiced` is the total
 * INCLUDING VAT, as the report prints it; `unreportedInclusive` is the VAT-inclusive total of the
 * invoices never reported, where the book knows it.
 */
const PERIOD_BOOKS: Record<
  string,
  {
    invoices: number
    corrected: number
    notReported: number
    /** Sent and not answered yet: not a failure, and not "not reported" (handbook 5.3). */
    waiting: number
    netInvoiced: number
    unreportedInclusive: number | null
  }
> = {
  month: {
    invoices: 147,
    corrected: 2,
    notReported: 1,
    waiting: 0,
    netInvoiced: 18_902.4,
    unreportedInclusive: null,
  },
  quarter: {
    invoices: 412,
    corrected: 5,
    notReported: 1,
    waiting: 0,
    netInvoiced: 52_418.9,
    unreportedInclusive: 761.04,
  },
  year: {
    invoices: 1_624,
    corrected: 39,
    notReported: 4,
    waiting: 0,
    netInvoiced: 194_800,
    unreportedInclusive: null,
  },
  custom: {
    invoices: 412,
    corrected: 5,
    notReported: 1,
    waiting: 0,
    netInvoiced: 52_418.9,
    unreportedInclusive: 761.04,
  },
}

/** The standard rate (handbook 5.1). */
const VAT_RATE = 0.05

const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * The VAT inside a VAT-inclusive figure at the standard rate: 5/105 of it, never 5% of it (5% of
 * 52,418.900 is 2,620.945; the VAT inside it is 2,496.138).
 */
export function vatInside(inclusive: number): number {
  return round3(inclusive - inclusive / (1 + VAT_RATE))
}

/**
 * VAT reported: only invoices that were reported count, so the VAT of the unreported ones is taken
 * out. Null when the book does not know what the unreported invoices came to.
 *
 * TODO(backend): ACTIVITY.md 2.35. The sum of the invoice total VAT (IBT-110) over the reported
 * invoices should come from the server; this works it out at the standard rate meanwhile.
 */
export function vatReportedOf(
  inclusive: number,
  unreportedInclusive: number | null,
): number | null {
  if (unreportedInclusive === null) return null
  return vatInside(inclusive - unreportedInclusive)
}

export function periodFigures(period: string) {
  const book = PERIOD_BOOKS[period] ?? PERIOD_BOOKS.quarter
  const accepted = book.invoices - book.corrected - book.notReported - book.waiting
  return {
    invoices: book.invoices,
    accepted,
    acceptedRate: Math.round((accepted / book.invoices) * 1000) / 10,
    corrected: book.corrected,
    notReported: book.notReported,
    waiting: book.waiting,
    netInvoiced: book.netInvoiced,
    vat: vatReportedOf(book.netInvoiced, book.unreportedInclusive),
  }
}

/**
 * Where an invoice series starts and ends, and the numbers missing inside it. Numbers are grouped
 * by their prefix (INV-, CN-...) and only the largest series is read. Null when there is nothing
 * to read, so the report says "not confirmed" rather than claiming an unbroken run.
 */
export function numberingOf(
  numbers: (string | null)[],
): { from: string; to: string; gaps: string[] } | null {
  const series = new Map<string, { width: number; values: number[] }>()
  for (const number of numbers) {
    const match = number?.match(/^(.*?)(\d+)$/)
    if (!match) continue
    const entry = series.get(match[1]) ?? { width: match[2].length, values: [] }
    entry.values.push(Number(match[2]))
    series.set(match[1], entry)
  }
  let best: [string, { width: number; values: number[] }] | null = null
  for (const entry of series)
    if (!best || entry[1].values.length > best[1].values.length) best = entry
  if (!best || best[1].values.length === 0) return null
  const [prefix, { width, values }] = best
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const name = (n: number) => `${prefix}${String(n).padStart(width, '0')}`
  const gaps: string[] = []
  for (let i = 1; i < sorted.length; i += 1) {
    for (let n = sorted[i - 1] + 1; n < sorted[i]; n += 1) gaps.push(name(n))
  }
  return { from: name(sorted[0]), to: name(sorted[sorted.length - 1]), gaps }
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

  // Numbering is worked out from the ledger (`numberingOf`), never printed: the design's
  // "unbroken from INV-1801 to INV-2212" was fixed text.

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
    /**
     * VAT sitting on the invoice the Authority never took, so outside the figure above. Taken from
     * the invoice's own total VAT (IBT-110) as the register prints it.
     */
    vatOutside: BUILT_REPORT.unreported.vat,
    creditNotes: 8,
    /** TODO(backend): ACTIVITY.md 2.28. The report carries no debit-note count yet. */
    debitNotes: null as number | null,
    /**
     * Bills and notes suppliers sent us, and how many of those our provider reported as received
     * (PINT-OM TDD, TDT-010 = 02 Receiver). TODO(backend): ACTIVITY.md 2.29, not on the report yet.
     */
    receivedReported: null as number | null,
    receivedTotal: null as number | null,
  }
}
