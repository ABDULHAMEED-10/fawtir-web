import type { BillRowDto } from '../api/expenditure/bills'
import type { PaymentRunDto } from '../api/expenditure/paymentRuns'
import type { SupplierDocumentDto, SupplierOverviewDto } from '../api/expenditure/supplierRecord'
import type { SupplierDetailDto } from '../api/expenditure/suppliers'
import { addDays } from './dates'
import type { Band, Note } from './supplierRecord'

/**
 * The Overview tab of a supplier's record (Suppliers › Detail, Figma 163:26275), written from
 * what the API holds. Each sentence the design prints under a figure is derived here from a
 * field, and the ones nothing backs ("Yirgacheffe went up from 7.100 to 7.400 per KG in March",
 * "Added by Hafidh Saif") are drawn as placeholders and listed in
 * docs/backend-guides/EXPENDITURE.md §7.
 */

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** "supplier since Sep 2024": the month, not the day, as the design's identity line reads. */
export function sinceLabel(date: string | null, language: string): string | null {
  const match = date ? /^(\d{4})-(\d{2})/.exec(date) : null
  if (!match) return null
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-OM' : 'en', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
}

/**
 * The design's line under each ageing band: "1 bill · due 28 Aug", "Never been late with them",
 * "Nothing in dispute". An empty late band reads from `everLate`; an empty hold band has nothing
 * in dispute by definition.
 */
export function bandNote(band: Band, everLate: boolean): Note {
  if (band.bills > 0) {
    return band.nextDue
      ? { key: 'supplierRecord.bandNote', values: { count: band.bills, date: band.nextDue } }
      : { key: 'supplierRecord.bandCount', values: { count: band.bills } }
  }
  if (band.id === 'late') {
    return {
      key: everLate ? 'supplierDetail.bandNote.lateBefore' : 'supplierDetail.bandNote.alreadyLate',
    }
  }
  if (band.id === 'onHold') return { key: 'supplierDetail.bandNote.onHold' }
  return { key: 'supplierRecord.bandEmpty' }
}

export type Discount = { percent: number; saves: number; by: string }

/**
 * The early-settlement discount still open on a bill ("2% off · saves 47.090"): the supplier's
 * offer, counted from the bill's issue date, while today is inside the window and something is
 * still owed.
 */
export function discountOn(
  row: BillRowDto,
  profile: SupplierDetailDto['profile'],
  today: string,
): Discount | null {
  const percent = profile.earlyPaymentDiscountPercent
  const days = profile.earlyPaymentDiscountDays
  if (percent === null || days === null || percent <= 0 || !row.issueDate) return null
  if (
    row.workflowState === 'PAID' ||
    row.workflowState === 'REJECTED' ||
    row.outstandingAmount <= 0
  ) {
    return null
  }
  const by = addDays(row.issueDate, days)
  if (today > by) return null
  return { percent, saves: round3((row.outstandingAmount * percent) / 100), by }
}

/** The run a bill sits in, by its reference, when the runs are readable. */
export function runOf(row: BillRowDto, runs: readonly PaymentRunDto[]): PaymentRunDto | null {
  if (!row.paymentRunReference) return null
  return runs.find((run) => run.reference === row.paymentRunReference) ?? null
}

/** The sentence under a bill's status chip: where it is, said from its own fields. */
export function whereNote(row: BillRowDto, run: PaymentRunDto | null): Note | null {
  switch (row.workflowState) {
    case 'IN_PAYMENT_RUN':
      return run?.paymentDate
        ? { key: 'supplierDetail.where.paying', values: { date: run.paymentDate } }
        : { key: 'supplierDetail.where.inRun' }
    case 'AWAITING_APPROVAL':
      return row.readiness.required > 1
        ? {
            key: 'supplierDetail.where.approvals',
            values: { given: row.readiness.distinctApprovals, required: row.readiness.required },
          }
        : { key: 'supplierDetail.where.awaiting' }
    case 'ON_HOLD':
      return row.hold?.reason
        ? { key: 'supplierDetail.where.held', values: { reason: row.hold.reason } }
        : null
    case 'MISMATCH':
      return row.match?.purchaseOrderNumber
        ? { key: 'supplierDetail.where.mismatch', values: { po: row.match.purchaseOrderNumber } }
        : null
    case 'PAID':
      return row.paidOnTheSpot ? { key: 'supplierDetail.where.counter' } : null
    case 'APPROVED':
      return { key: 'supplierDetail.where.approved' }
    case 'NEW':
      return { key: 'supplierDetail.where.new' }
    default:
      return null
  }
}

export type RowAction = { key: string; to: string } | { key: string; pay: true }

/**
 * The button at the end of a bill row. A bill in a run opens the run; an approved bill can be
 * added to one when the reader may pay; anything else opens the bill.
 */
export function rowAction(row: BillRowDto, run: PaymentRunDto | null, canPay: boolean): RowAction {
  if (row.workflowState === 'IN_PAYMENT_RUN') {
    return {
      key: 'supplierDetail.openTheRun',
      to: run ? `/expenditure/payments/${run.id}` : '/expenditure/payments',
    }
  }
  if (row.workflowState === 'APPROVED' && canPay)
    return { key: 'supplierDetail.addToRun', pay: true }
  return { key: 'supplierRecord.openBill', to: `/expenditure/bills/${row.id}` }
}

/**
 * The paragraph under "You owe them": what the open bills are doing, from the latest bills and
 * the runs they sit in, then whether they have ever been paid late.
 */
export function oweExplanation(
  overview: SupplierOverviewDto,
  latest: readonly BillRowDto[],
  runs: readonly PaymentRunDto[],
): Note {
  if (overview.payables.total <= 0) return { key: 'supplierRecord.nothingOwed' }
  const inRun = latest.filter((row) => row.workflowState === 'IN_PAYMENT_RUN')
  if (inRun.length > 0) {
    const run = runOf(inRun[0], runs)
    const reference = inRun[0].paymentRunReference ?? ''
    return run?.paymentDate
      ? {
          key: 'supplierDetail.oweInRunPaying',
          values: { count: inRun.length, run: reference, date: run.paymentDate },
        }
      : { key: 'supplierDetail.oweInRun', values: { count: inRun.length, run: reference } }
  }
  return {
    key: overview.payables.everLate ? 'supplierRecord.everLate' : 'supplierRecord.neverLate',
  }
}

/** The run the open bills sit in, if one is known, for the "Open the run" button. */
export function openRun(
  latest: readonly BillRowDto[],
  runs: readonly PaymentRunDto[],
): PaymentRunDto | null {
  for (const row of latest) {
    const run = runOf(row, runs)
    if (run) return run
  }
  return null
}

/**
 * "Signed 14 Jan 2026 · sets the 2% early-settlement discount": how the paper reached the file,
 * when, and the note it was filed with.
 */
export function documentLine(entry: SupplierDocumentDto): { note: Note; remark: string | null } {
  const d = entry.document
  const date = d.documentDate ?? d.uploadedAt.slice(0, 10)
  const key = d.provenance
    ? `supplierRecord.provenance.${d.provenance}`
    : 'supplierRecord.documents.uploaded'
  return { note: { key, values: { date } }, remark: d.note }
}

/** What the twelve-month purchases add up to, for the note under the breakdown. */
export function purchasesSummary(lines: readonly { billCount: number; totalAmount: number }[]): {
  bills: number
  total: number
} {
  return {
    bills: lines.reduce((sum, line) => sum + line.billCount, 0),
    total: round3(lines.reduce((sum, line) => sum + line.totalAmount, 0)),
  }
}
