import type {
  StatementAgeingBucket,
  StatementEntryKind,
  StatementIssuerDto,
  SupplierOverviewDto,
  SupplierStatementDto,
} from '../api/expenditure/supplierRecord'
import type { SupplierDetailDto } from '../api/expenditure/suppliers'

/**
 * A supplier statement (Suppliers › Statement, Figma 163:28602), read from
 * `GET /suppliers/{id}/statement`. The design's per-entry notes ("Against PO-0021 · matched in
 * full"), the bill count under each ageing figure and the footer's unused-credit count are read
 * from optional fields the backend is asked for (§7.13 to 7.15) and left blank until they arrive.
 */

export const PERIODS = ['year', 'quarter', 'month', 'last90', 'custom'] as const
export type Period = (typeof PERIODS)[number]

const iso = (date: Date) => date.toISOString().slice(0, 10)

/** The dates a preset covers, to today; a custom period keeps the dates it was given. */
export function periodRange(
  period: Exclude<Period, 'custom'>,
  today: string,
): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number)
  switch (period) {
    case 'year':
      return { from: `${year}-01-01`, to: today }
    case 'quarter': {
      const first = Math.floor((month - 1) / 3) * 3 + 1
      return { from: `${year}-${String(first).padStart(2, '0')}-01`, to: today }
    }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'last90': {
      const start = new Date(`${today}T00:00:00Z`)
      start.setUTCDate(start.getUTCDate() - 90)
      return { from: iso(start), to: today }
    }
  }
}

export function customRangeProblem(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'supplierStatement.error.datesRequired'
  if (from > to) return 'supplierStatement.error.fromAfterTo'
  if (to > today) return 'supplierStatement.error.future'
  return null
}

/**
 * Which column an entry's amount is in, signed as it moves what is owed: a credit note lowers
 * what they billed, a reversal gives back what was paid.
 */
export function columnsOf(
  kind: StatementEntryKind,
  amount: number,
): { billed: number | null; paid: number | null } {
  switch (kind) {
    case 'BILL':
      return { billed: amount, paid: null }
    case 'CREDIT_NOTE':
      return { billed: -amount, paid: null }
    case 'PAYMENT':
      return { billed: null, paid: amount }
    case 'REVERSAL':
      return { billed: null, paid: -amount }
  }
}

/** Bills and credit notes are rows of the bills list and open there; a payment has no page of its own. */
export function entryLink(kind: StatementEntryKind, documentId: string): string | null {
  return kind === 'BILL' || kind === 'CREDIT_NOTE' ? `/expenditure/bills/${documentId}` : null
}

export const AGEING_BUCKETS: readonly StatementAgeingBucket[] = [
  'NOT_DUE',
  'DUE_WITHIN_30',
  'LATE_30',
  'LATE_60_PLUS',
]

export type AgeingNote = { key: string; values?: Record<string, string | number> } | null

/**
 * The line under an ageing figure: "1 bill · due 28 Aug" when the server says how many, "Never
 * been late with them" under an empty late bucket when it says they never were, otherwise nothing.
 */
export function ageingNote(
  bucket: StatementAgeingBucket,
  statement: Pick<SupplierStatementDto, 'ageingDetail' | 'everLate'>,
): AgeingNote {
  const detail = statement.ageingDetail?.[bucket]
  if (detail && detail.bills > 0) {
    return detail.nextDue
      ? { key: 'supplierRecord.bandNote', values: { count: detail.bills, date: detail.nextDue } }
      : { key: 'supplierRecord.bandCount', values: { count: detail.bills } }
  }
  // The design says it once, under the first late bucket; the 60-day one reads a dash.
  if (bucket === 'LATE_30' && statement.everLate === false) {
    return { key: 'supplierDetail.bandNote.alreadyLate' }
  }
  return null
}

/**
 * Whether the supplier was ever paid late, for the ageing strip: the statement's own answer when
 * it carries one, else the supplier overview's (`payables.everLate`, the same fact the supplier
 * page's "Never been late with them" reads). The overview answers for one currency, so it is read
 * only for a statement in that currency. Null when neither says, and the strip says nothing.
 */
export function everLateOf(
  statement: Pick<SupplierStatementDto, 'everLate' | 'currencyCode'>,
  overview: Pick<SupplierOverviewDto, 'payables'> | null,
): boolean | null {
  if (typeof statement.everLate === 'boolean') return statement.everLate
  const payables = overview?.payables
  if (!payables || payables.currencyCode !== statement.currencyCode) return null
  return typeof payables.everLate === 'boolean' ? payables.everLate : null
}

/** A bill still open at the end of the period, which the design shades. Only when the server says. */
export function entryOpen(entry: SupplierStatementDto['entries'][number]): boolean {
  return entry.kind === 'BILL' && typeof entry.outstanding === 'number' && entry.outstanding > 0
}

/** The issuer's address as one line, in the order a letter would carry it. */
export function issuerAddress(issuer: StatementIssuerDto | null): string | null {
  if (!issuer) return null
  const parts = [
    issuer.addressLine1,
    issuer.addressLine2,
    issuer.addressLine3,
    issuer.city,
    issuer.countrySubdivision,
    issuer.postalCode,
    issuer.country,
  ].filter((part): part is string => Boolean(part && part.trim()))
  return parts.length > 0 ? parts.join(', ') : null
}

/** Why the statement cannot be e-mailed from here, before asking the server. */
export function emailBlocker(
  profile: SupplierDetailDto['profile'],
  canManage: boolean,
): string | null {
  if (!canManage) return null
  if (profile.status === 'SWITCHED_OFF') return 'supplierStatement.email.switchedOff'
  if (!profile.emailRecipients || profile.emailRecipients.length === 0)
    return 'supplierStatement.email.noAddress'
  return null
}

export function periodTotals(statement: SupplierStatementDto): { billedNet: number; paid: number } {
  // Rounded to the fils so a float remainder never prints as a stray thousandth.
  return {
    billedNet: Math.round((statement.bills - statement.credits) * 1000) / 1000,
    paid: statement.payments,
  }
}
