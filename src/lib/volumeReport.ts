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

export type VolumeGroup = {
  key: string | null
  label: string | null
  total: number
  documents: number
}

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
    const found = totals.get(id) ?? {
      key: row.groupKey,
      label: row.groupLabel,
      total: 0,
      documents: 0,
    }
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

/* ------------------------------------------------------------ what counts as a sale */

/**
 * What an issued document is to the tenant, from the volume report's `TYPE` grouping.
 *
 * The volume report reads the documents the tenant **issued**. An invoice (380) and a debit note
 * (383) add to sales and a credit note (381) takes away from them. A self-billed invoice (389) or
 * self-billed credit note (261) is different: whoever issues a self-billed document is the
 * **buyer** (PINT-OM self-billing), so one the tenant issued is a purchase from its supplier and
 * never a sale. Direction decides, not the type code alone: a self-billed document a customer
 * issued to the tenant IS the tenant's sale, but that one is not in this report (the customer
 * issued it), and no row carries a direction to tell the two apart.
 * TODO(backend): REPORTS.md row 1.22, a direction on each volume row, so a customer's self-billed
 * document can be counted as the tenant's sale.
 *
 * The key may be the UNCL1001 code or the platform's type name; both are read.
 */
export type SaleKind = 'invoice' | 'debitNote' | 'creditNote' | 'selfBilledPurchase' | 'other'

const KIND_BY_KEY: Record<string, SaleKind> = {
  '380': 'invoice',
  INVOICE: 'invoice',
  '383': 'debitNote',
  DEBIT_NOTE: 'debitNote',
  '381': 'creditNote',
  CREDIT_NOTE: 'creditNote',
  '389': 'selfBilledPurchase',
  SELF_BILLED_INVOICE: 'selfBilledPurchase',
  '261': 'selfBilledPurchase',
  SELF_BILLED_CREDIT_NOTE: 'selfBilledPurchase',
}

export function saleKindOf(groupKey: string | null): SaleKind {
  return (groupKey && KIND_BY_KEY[groupKey.trim().toUpperCase()]) || 'other'
}

/**
 * A row's amount as it counts toward sales: a debit note always adds and a credit note always
 * takes away, whichever way the server signed it; the tenant's own self-billed documents count
 * nothing. Anything else keeps the server's sign.
 */
export function salesAmount(row: VolumeRowDto, pick: (row: VolumeRowDto) => number): number {
  const value = pick(row)
  switch (saleKindOf(row.groupKey)) {
    case 'selfBilledPurchase':
      return 0
    case 'creditNote':
      return -Math.abs(value)
    case 'debitNote':
      return Math.abs(value)
    default:
      return value
  }
}

/** Invoices only (380): credit and debit notes and self-billed documents are not "invoices sent". */
export function invoicesSent(row: VolumeRowDto): number {
  return saleKindOf(row.groupKey) === 'invoice' ? row.documents : 0
}

/** The value of invoices alone (380), for the average invoice. */
export function invoiceValue(row: VolumeRowDto): number {
  return saleKindOf(row.groupKey) === 'invoice' ? row.taxableAmount : 0
}

/** The VAT on the tenant's own self-billed documents, signed as the server sent it. */
export function selfBilledVat(row: VolumeRowDto): number {
  return saleKindOf(row.groupKey) === 'selfBilledPurchase' ? row.vatAmount : 0
}
