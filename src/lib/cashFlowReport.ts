import type { CashFlowRowDto } from '../api/reports/reports'

/**
 * Shaping for the cash flow report (`CashFlowReportRow`), kept out of the page so the arithmetic
 * can be tested without rendering a chart.
 *
 * `received` and `paidOut` are both stated positive, as the two payment tables state them, and
 * `net` is the only signed figure. A reversal subtracts from its own direction and falls in the
 * period it was recorded in — so a period can read negative in one direction without anything
 * being wrong, and a closed month never changes after the fact.
 */

export function periodsOfCashFlow(rows: CashFlowRowDto[]): string[] {
  const seen: string[] = []
  for (const row of rows) if (!seen.includes(row.period)) seen.push(row.period)
  return seen.sort()
}

/** In and out per period, in the period order given, summed across currencies present. */
export function inAndOut(rows: CashFlowRowDto[], periods: string[]): { up: number; down: number }[] {
  return periods.map((period) => {
    const own = rows.filter((row) => row.period === period)
    return {
      up: own.reduce((sum, row) => sum + row.received, 0),
      down: own.reduce((sum, row) => sum + row.paidOut, 0),
    }
  })
}

export function netByPeriod(rows: CashFlowRowDto[], periods: string[]): number[] {
  return periods.map((period) =>
    rows.filter((row) => row.period === period).reduce((sum, row) => sum + row.net, 0),
  )
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
    if ((row.received < 0 || row.paidOut < 0) && !found.includes(row.period)) found.push(row.period)
  }
  return found.sort()
}
