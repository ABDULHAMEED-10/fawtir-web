import type { StatementEntryKind, StatementIssuerDto, SupplierStatementDto } from '../api/expenditure/supplierRecord'
import type { SupplierDetailDto } from '../api/expenditure/suppliers'

/**
 * A supplier statement (E-05, decisions of 2026-09-17), read from `GET /suppliers/{id}/statement`.
 * The design's per-entry notes ("against PO-0021 · matched in full") and its unused-credit count
 * have nothing behind them and are not drawn.
 */

export const PERIODS = ['year', 'quarter', 'month', 'last90', 'custom'] as const
export type Period = (typeof PERIODS)[number]

const iso = (date: Date) => date.toISOString().slice(0, 10)

/** The dates a preset covers, to today; a custom period keeps the dates it was given. */
export function periodRange(period: Exclude<Period, 'custom'>, today: string): { from: string; to: string } {
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
export function columnsOf(kind: StatementEntryKind, amount: number): { billed: number | null; paid: number | null } {
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

export const AGEING_BUCKETS = ['NOT_DUE', 'DUE_WITHIN_30', 'LATE_30', 'LATE_60_PLUS'] as const

/** The issuer's address as one line, in the order a letter would carry it. */
export function issuerAddress(issuer: StatementIssuerDto | null): string | null {
  if (!issuer) return null
  const parts = [issuer.addressLine1, issuer.addressLine2, issuer.addressLine3, issuer.city, issuer.countrySubdivision, issuer.postalCode, issuer.country].filter(
    (part): part is string => Boolean(part && part.trim()),
  )
  return parts.length > 0 ? parts.join(', ') : null
}

/** Why the statement cannot be e-mailed from here, before asking the server. */
export function emailBlocker(profile: SupplierDetailDto['profile'], canManage: boolean): string | null {
  if (!canManage) return null
  if (profile.status === 'SWITCHED_OFF') return 'supplierStatement.email.switchedOff'
  if (!profile.emailRecipients || profile.emailRecipients.length === 0) return 'supplierStatement.email.noAddress'
  return null
}

export function periodTotals(statement: SupplierStatementDto): { billedNet: number; paid: number } {
  // Rounded to the fils so a float remainder never prints as a stray thousandth.
  return { billedNet: Math.round((statement.bills - statement.credits) * 1000) / 1000, paid: statement.payments }
}
