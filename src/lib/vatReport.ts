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
    totals.set(row.category, {
      taxable: found.taxable + row.taxableAmount,
      vat: found.vat + row.vatAmount,
    })
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

/* ------------------------------------------------------------ the page's monthly figures */

const monthOf = (row: { periodStart: string }) => row.periodStart.slice(0, 7)

function addTo(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value)
}

/**
 * Reverse charge. PINT-OM has no reverse-charge category (it is a transaction type, BTOM-001),
 * but a row the server marks `AE` is read as one. The buyer accounts for that VAT itself, so it
 * is both output VAT and input VAT for the tenant, whichever side the server put it on.
 * TODO(backend): REPORTS.md row 1.27, the BTOM-001 transaction type on VAT rows.
 */
export const REVERSE_CHARGE = 'AE'

export type VatMonths = {
  output: Map<string, number>
  input: Map<string, number>
  net: Map<string, number>
  /** Reverse-charge VAT per month, already inside both `output` and `input`. */
  reverseCharge: Map<string, number>
  /**
   * VAT on approved, receipt-reported bills per month, or null when the server does not say
   * (REPORTS.md row 1.25). Null means no bill's reclaim is confirmed, not that none is due.
   */
  reclaimable: Map<string, number> | null
}

/**
 * Output, input and net VAT per month (`YYYY-MM`), in one currency, as the VAT page states them.
 *
 * - `selfBilled` is the VAT on the tenant's own self-billed documents (389, 261) per month, from
 *   the volume report by type. Whoever issues a self-billed document is the buyer, so that VAT is
 *   the tenant's input, never its output: it is taken out of output and out of net. It is not
 *   added to input, where the matching bill already carries it (source SELF_BILLED).
 *   TODO(backend): REPORTS.md row 1.26, OUTPUT rows that leave these out on the server.
 * - Reverse charge (`AE`) counts on both sides (see `REVERSE_CHARGE`).
 * - Net starts from the server's NET rows and moves only by those two corrections, so a period
 *   with input and no output still reads the way the server decides.
 */
export function vatMonths(
  report: VatReportDto,
  currency: string,
  selfBilled?: Map<string, number> | null,
): VatMonths {
  const own = (rows: VatRowDto[]) => rows.filter((row) => row.currency === currency)
  const output = new Map<string, number>()
  const input = new Map<string, number>()
  const net = new Map<string, number>()
  const reverseCharge = new Map<string, number>()
  const rcOut = new Map<string, number>()
  const rcIn = new Map<string, number>()

  for (const row of own(report.output)) {
    if (row.category === REVERSE_CHARGE) addTo(rcOut, monthOf(row), row.vatAmount)
    else addTo(output, monthOf(row), row.vatAmount)
  }
  for (const row of own(report.input)) {
    if (row.category === REVERSE_CHARGE) addTo(rcIn, monthOf(row), row.vatAmount)
    else addTo(input, monthOf(row), row.vatAmount)
  }
  for (const row of own(report.net)) addTo(net, monthOf(row), row.vatAmount)

  for (const key of new Set([...rcOut.keys(), ...rcIn.keys()])) {
    const out = rcOut.get(key) ?? 0
    const inn = rcIn.get(key) ?? 0
    const both = out + inn
    reverseCharge.set(key, both)
    addTo(output, key, both)
    addTo(input, key, both)
    // The server netted `out - inn`; stated on both sides it nets to nothing.
    addTo(net, key, inn - out)
  }

  for (const [key, value] of selfBilled ?? []) {
    addTo(output, key, -value)
    addTo(net, key, -value)
  }

  const inputRows = own(report.input)
  const confirmed =
    inputRows.length > 0 && inputRows.every((row) => typeof row.reclaimableVatAmount === 'number')
  let reclaimable: Map<string, number> | null = null
  if (confirmed) {
    reclaimable = new Map()
    for (const row of inputRows) addTo(reclaimable, monthOf(row), row.reclaimableVatAmount ?? 0)
  }

  return { output, input, net, reverseCharge, reclaimable }
}

/** The four Oman VAT categories (CL-04-OM), in the order the treatment rows draw them. */
export const OMAN_CATEGORIES = ['S', 'Z', 'E', 'O'] as const

/**
 * Taxable amount by Oman category over some months: standard, zero-rated, exempt, outside scope.
 * Exempt and outside scope are separate parts: they are different treatments with different
 * consequences for what can be reclaimed, and one "Exempt" part would misstate both.
 *
 * An export arrives as zero-rated (Z, or G from an older server). Reverse charge is not a supply
 * category and is left out. Returns null when a row carries no Oman category (INPUT rows say
 * `ALL` today, REPORTS.md row 1.23), so the row can say it is not split instead of guessing.
 */
export function categoryAmounts(rows: VatRowDto[], months: string[]): number[] | null {
  const parts = [0, 0, 0, 0]
  for (const row of rows) {
    if (!months.includes(monthOf(row))) continue
    if (row.category === REVERSE_CHARGE) continue
    const category = row.category === 'G' ? 'Z' : row.category
    const index = (OMAN_CATEGORIES as readonly string[]).indexOf(category)
    if (index < 0) return null
    parts[index] += row.taxableAmount
  }
  return parts
}
