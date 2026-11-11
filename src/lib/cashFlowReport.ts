import type { CashFlowReportDto, CashFlowRowDto, TillPaidOutFigures } from '../api/reports/reports'

/**
 * Shaping for the cash flow report (`CashFlowReportRow`), kept out of the page so the arithmetic
 * can be tested without rendering a chart.
 *
 * `received` and `paidOut` are both stated positive, as the two payment tables state them, and
 * `net` is the only signed figure. A reversal subtracts from its own direction and falls in the
 * period it was recorded in — so a period can read negative in one direction without anything
 * being wrong, and a closed month never changes after the fact.
 */

/** The four drawer columns, each 0 where an older server leaves it out. */
export function tillPaidOuts(row: TillPaidOutFigures): {
  expense: number
  advance: number
  transferred: number
  unclassified: number
} {
  return {
    expense: row.cashPaidOutExpense ?? 0,
    advance: row.cashPaidOutAdvance ?? 0,
    transferred: row.cashTransferred ?? 0,
    unclassified: row.cashPaidOutUnclassified ?? 0,
  }
}

/**
 * The currencies money is stated in. The null bucket (till paid-outs before RC5) is not one: it is
 * named apart and never counted, chosen or added as the company's currency.
 */
export function recordedCurrencies(totals: { currency: string | null }[]): string[] {
  return totals.flatMap((entry) => (entry.currency === null ? [] : [entry.currency]))
}

export function periodsOfCashFlow(rows: CashFlowRowDto[]): string[] {
  const seen: string[] = []
  for (const row of rows) if (!seen.includes(row.period)) seen.push(row.period)
  return seen.sort()
}

/**
 * Whether money paid out, supplier refunds and net can be shown (N-qq-FEC-1). Backend B5 withholds
 * them from a reader without expenditure access by sending null, and a null summed as 0 would
 * state "nothing was paid out" and a net equal to what came in: a figure that is false, not merely
 * missing. Any null withholds the whole set, so a total never mixes shown and withheld rows.
 */
export function expenditureShown(
  report: Pick<CashFlowReportDto, 'expenditureWithheld'>,
  rows: CashFlowRowDto[],
): boolean {
  return (
    report.expenditureWithheld !== true &&
    rows.every((row) => row.paidOut !== null && row.net !== null)
  )
}

/**
 * In and out per period, in the period order given, summed across currencies present. `down` is
 * null for a period with a withheld (null) `paidOut`, never counted as 0 ({@link expenditureShown}).
 */
export function inAndOut(
  rows: CashFlowRowDto[],
  periods: string[],
): { up: number; down: number | null }[] {
  return periods.map((period) => {
    const own = rows.filter((row) => row.period === period)
    return {
      up: own.reduce((sum, row) => sum + row.received, 0),
      down: sumUnlessWithheld(own.map((row) => row.paidOut)),
    }
  })
}

/** Null for a period with a withheld `net`, never counted as 0 ({@link expenditureShown}). */
export function netByPeriod(rows: CashFlowRowDto[], periods: string[]): (number | null)[] {
  return periods.map((period) =>
    sumUnlessWithheld(rows.filter((row) => row.period === period).map((row) => row.net)),
  )
}

function sumUnlessWithheld(values: (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null
  return (values as number[]).reduce((sum, value) => sum + value, 0)
}

/**
 * Periods where reversals outweighed payments in one direction, so a figure there is negative.
 *
 * The bar charts cannot draw a negative length — CSS and the axis both floor at zero — so those
 * periods must be named rather than silently drawn as if they were small positives. Rare, and
 * real: a month whose only receipt was later reversed looks exactly like this.
 */
export function periodsWithNegativeDirection(rows: CashFlowRowDto[]): string[] {
  const found: string[] = []
  for (const row of rows) {
    const paidOutNegative = row.paidOut !== null && row.paidOut < 0
    if ((row.received < 0 || paidOutNegative) && !found.includes(row.period)) found.push(row.period)
  }
  return found.sort()
}
