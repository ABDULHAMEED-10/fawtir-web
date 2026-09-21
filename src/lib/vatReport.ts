import type { VatReportDto, VatRowDto } from '../api/reports/reports'

/**
 * Shaping for the VAT report (`VatReportRow`), kept out of the page so the arithmetic can be
 * tested without rendering a chart.
 *
 * Every figure here comes from rows the server sent. Nothing is derived from a rate the client
 * assumes: an E or O output row carries no rate at all, and an INPUT row carries neither a
 * category nor a rate, because a received bill states one VAT total and nothing finer.
 */

/** Periods in the order the rows arrive, de-duplicated across the three sides. */
export function periodsOf(report: VatReportDto): string[] {
  const seen: string[] = []
  for (const row of [...report.output, ...report.input, ...report.net]) {
    if (!seen.includes(row.period)) seen.push(row.period)
  }
  return seen.sort()
}

export function sumVat(rows: VatRowDto[]): number {
  return rows.reduce((total, row) => total + row.vatAmount, 0)
}

export function sumTaxable(rows: VatRowDto[]): number {
  return rows.reduce((total, row) => total + row.taxableAmount, 0)
}

/** VAT per period for one side, in the period order given. */
export function byPeriod(rows: VatRowDto[], periods: string[]): number[] {
  return periods.map((period) => sumVat(rows.filter((row) => row.period === period)))
}

export type CategoryShare = { category: string; taxable: number; vat: number; share: number }

/**
 * Output VAT by EN 16931 category, largest first.
 *
 * Share is of **taxable** amount rather than of VAT: zero-rated and exempt supplies carry no VAT
 * at all, so a share of VAT would show them as nothing when they may be most of the trade.
 */
export function outputByCategory(rows: VatRowDto[]): CategoryShare[] {
  const totals = new Map<string, { taxable: number; vat: number }>()
  for (const row of rows) {
    const found = totals.get(row.category) ?? { taxable: 0, vat: 0 }
    totals.set(row.category, { taxable: found.taxable + row.taxableAmount, vat: found.vat + row.vatAmount })
  }
  const taxableTotal = [...totals.values()].reduce((sum, entry) => sum + entry.taxable, 0)
  return [...totals.entries()]
    .map(([category, entry]) => ({
      category,
      taxable: entry.taxable,
      vat: entry.vat,
      share: taxableTotal === 0 ? 0 : (entry.taxable / taxableTotal) * 100,
    }))
    .sort((a, b) => b.taxable - a.taxable)
}

/**
 * Whether the report spans more than one currency.
 *
 * It matters because every figure on this screen is a plain sum: adding OMR to USD would give a
 * number that means nothing, so the page says so rather than showing a total nobody can use.
 */
export function currenciesIn(report: VatReportDto): string[] {
  const seen = new Set<string>()
  for (const row of [...report.output, ...report.input, ...report.net]) seen.add(row.currency)
  return [...seen].sort()
}

/** The whole report in one line: charged, reclaimable, and what is owed. */
export function vatPosition(report: VatReportDto): { output: number; input: number; net: number } {
  return {
    output: sumVat(report.output),
    input: sumVat(report.input),
    // Taken from the server's own NET rows rather than subtracted here: it decides how a period
    // with no output but some input reads, and two answers to that would eventually disagree.
    net: sumVat(report.net),
  }
}
