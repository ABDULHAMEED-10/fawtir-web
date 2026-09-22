import type { VolumeGroupBy, VolumeRowDto } from '../api/reports/reports'

/**
 * Shaping for the volume report (`VolumeReportRow`), kept out of the page so the arithmetic can
 * be tested without rendering a chart.
 *
 * Amounts are **signed**: a credit note subtracts, so a period's total is net of corrections.
 * `documents` counts every issued document whatever its sign, and `cancelled` counts cancelled
 * ones, which contribute to no amount — so a cancelled document is never folded into a total.
 */

export const GROUPINGS: VolumeGroupBy[] = ['NONE', 'TYPE', 'CUSTOMER', 'BRANCH']

export function periodsOfVolume(rows: VolumeRowDto[]): string[] {
  const seen: string[] = []
  for (const row of rows) if (!seen.includes(row.period)) seen.push(row.period)
  return seen.sort()
}

/** The signed total per period, in the period order given. */
export function byPeriodTotal(rows: VolumeRowDto[], periods: string[]): number[] {
  return periods.map((period) =>
    rows.filter((row) => row.period === period).reduce((sum, row) => sum + row.totalAmount, 0),
  )
}

export type VolumeGroup = { key: string | null; label: string | null; total: number; documents: number }

/**
 * Totals per group, largest first.
 *
 * Rows with no group — which is every row when the report is ungrouped — collapse into one entry
 * rather than being dropped, so the parts still add up to the whole.
 */
export function byGroup(rows: VolumeRowDto[]): VolumeGroup[] {
  const totals = new Map<string, VolumeGroup>()
  for (const row of rows) {
    const id = row.groupKey ?? ''
    const found = totals.get(id) ?? { key: row.groupKey, label: row.groupLabel, total: 0, documents: 0 }
    found.total += row.totalAmount
    found.documents += row.documents
    // A later row may carry the label where an earlier one did not.
    found.label = found.label ?? row.groupLabel
    totals.set(id, found)
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}

/** Cancelled documents across the whole report — a count, never an amount. */
export function cancelledCount(rows: VolumeRowDto[]): number {
  return rows.reduce((sum, row) => sum + row.cancelled, 0)
}
