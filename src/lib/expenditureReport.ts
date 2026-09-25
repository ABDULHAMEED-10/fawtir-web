import type { ExpenditureGroupBy, ExpenditureRowDto } from '../api/reports/reports'

/**
 * Shaping for the expenditure report (`ExpenditureReportRow`), kept out of the page so the
 * arithmetic can be tested without rendering a chart.
 *
 * Amounts are **signed**: a supplier credit note (381/261) subtracts and a debit note (383) adds,
 * so a period's figure is net of corrections while `documents` counts every document whatever its
 * sign. A month whose only bill was fully credited reads as two documents and nothing spent.
 */

export const EXPENDITURE_GROUPINGS: ExpenditureGroupBy[] = ['NONE', 'SUPPLIER', 'SOURCE', 'CATEGORY']

export function periodsOfExpenditure(rows: ExpenditureRowDto[]): string[] {
  const seen: string[] = []
  for (const row of rows) if (!seen.includes(row.period)) seen.push(row.period)
  return seen.sort()
}

/** The signed total per period, in the period order given. */
export function byPeriodSpend(rows: ExpenditureRowDto[], periods: string[]): number[] {
  return periods.map((period) =>
    rows.filter((row) => row.period === period).reduce((sum, row) => sum + row.totalAmount, 0),
  )
}

export type ExpenditureGroup = { key: string | null; label: string | null; total: number; documents: number }

/**
 * Totals per group, largest first.
 *
 * Rows with no group key collapse into one entry rather than being dropped. That is not a tidiness
 * choice: under `CATEGORY` the empty key is every bill with nothing recorded, which today is most
 * of them, and dropping it would quietly leave most of the spend out of a spend report.
 */
export function byExpenditureGroup(rows: ExpenditureRowDto[]): ExpenditureGroup[] {
  const totals = new Map<string, ExpenditureGroup>()
  for (const row of rows) {
    const id = row.groupKey ?? ''
    const found = totals.get(id) ?? { key: row.groupKey, label: row.groupLabel, total: 0, documents: 0 }
    found.total += row.totalAmount
    found.documents += row.documents
    // A later row may carry the label where an earlier one did not.
    found.label = found.label || row.groupLabel
    totals.set(id, found)
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}

/**
 * The share the largest group takes of the whole, 0–100, or null when there is nothing to divide.
 *
 * Guarded against a zero or negative denominator: over a window where credit notes cancelled the
 * bills, "80% of nothing" is not a fact about a supplier, it is a division by something near zero.
 */
export function topGroupShare(groups: ExpenditureGroup[]): number | null {
  const total = groups.reduce((sum, group) => sum + group.total, 0)
  if (groups.length === 0 || total <= 0) return null
  const share = Math.round((groups[0].total / total) * 100)
  // 100 is reserved for actually being the whole. 99.89% of spend rounds to 100 and then reads
  // as "there is nothing else", which is wrong whenever a second group is sitting right below it
  // on the same chart — seen live on 2026-09-22, where Uploaded showed 100% beside a Scanned row.
  if (share === 100 && groups[0].total < total) return 99
  return share
}
