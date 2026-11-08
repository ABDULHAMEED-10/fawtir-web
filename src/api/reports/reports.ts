import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * Reports (`ReportsController`, `ReportListsController`).
 *
 * Two report families and a downloads catalogue:
 *
 * - **volume** — issued documents only. The adapter reads `FROM invoice.invoices`, so this is
 *   the sell side.
 * - **expenditure** — the buy side, over `peppol.bills`. A separate report rather than a filter
 *   on volume, because the two read different tables with no overlap.
 * - **cash-flow** — money in against money out, over PAYMENTS rather than documents, so it
 *   buckets on a different date from every other report here.
 * - **vat** — OUTPUT (VAT charged, by EN 16931 category and rate), INPUT (VAT the tenant was
 *   charged, from received bills, which carry one VAT total and so have no category or rate),
 *   and NET per period and currency.
 * - **lists** — a self-describing catalogue of downloadable datasets, each naming its own
 *   permission, formats, URLs and parameters. The page renders from it rather than hard-coding
 *   a list that would drift from the server's.
 */

export const REPORTS_PATH = '/v1/reports'
export const REPORT_LISTS_PATH = `${REPORTS_PATH}/lists`

export type ReportGranularity = 'MONTH' | 'QUARTER' | 'YEAR'
export type VolumeGroupBy = 'NONE' | 'TYPE' | 'CUSTOMER' | 'BRANCH'
/**
 * No `TYPE`, unlike the volume report. A supplier credit note subtracts from what bills and debit
 * notes add, so a bar per type would set a negative bar beside two positive ones and invite the
 * reader to add them up. The sign is already inside every amount.
 */
export type ExpenditureGroupBy = 'NONE' | 'SUPPLIER' | 'SOURCE' | 'CATEGORY'

export type ReportRange = {
  from?: string | null
  to?: string | null
  granularity?: ReportGranularity
}

/**
 * One bucket. Amounts are **signed**: a credit note subtracts, so a row's total is net of
 * corrections. `documents` counts every issued document whatever its sign, and `cancelled`
 * counts cancelled ones, which contribute to no amount.
 */
export type VolumeRowDto = {
  period: string
  periodStart: string
  periodEnd: string
  groupKey: string | null
  groupLabel: string | null
  currency: string
  documents: number
  taxableAmount: number
  vatAmount: number
  totalAmount: number
  cancelled: number
}

export type CurrencyTotalDto = {
  currency: string
  documents: number
  taxableAmount: number
  vatAmount: number
  totalAmount: number
}

export type VolumeReportDto = {
  from: string | null
  to: string | null
  granularity: ReportGranularity
  groupBy: VolumeGroupBy
  rows: VolumeRowDto[]
  totals: CurrencyTotalDto[]
}

/**
 * One bucket of received documents. Amounts are **signed**: a 381/261 credit note subtracts and a
 * 383 debit note adds, the same signing the VAT report's INPUT rows apply to the same table.
 *
 * `netAmount` is total less VAT — a subtraction, not a reported taxable base, because a received
 * bill carries no tax subtotals. `documents` counts every document whatever its sign.
 *
 * `groupKey` is empty under `NONE`; under `CATEGORY` an empty key means no category was recorded,
 * which the page must show as "Uncategorised" rather than drop. Under `SUPPLIER`, bills linked to
 * no supplier record group as `participant:<scheme:value>` or `name:<stated name>` (NEW-1, backend
 * #824): only an unprefixed key is a supplier's id.
 */
export type ExpenditureRowDto = {
  period: string
  periodStart: string
  periodEnd: string
  groupKey: string | null
  groupLabel: string | null
  currency: string
  documents: number
  netAmount: number
  vatAmount: number
  totalAmount: number
  /**
   * TODO(backend): REPORTS.md row 1.25. The part of `vatAmount` on bills that were approved and
   * whose receipt the tenant reported to the OTA, which is all that can be reclaimed. Absent
   * today, so the pages say "reclaim not confirmed" rather than calling every bill reclaimable.
   */
  reclaimableVatAmount?: number | null
  /**
   * Bills only (ACC-5, backend #824): the bucket's documents that are not a credit note (381, 261)
   * or a debit note (383), and their net, unsigned. "Bills received" and "Average bill" read these;
   * `documents` and `netAmount` count and net the notes in. Absent from a server before #824.
   */
  billDocuments?: number
  billNetAmount?: number
} & ExpenditureDecisionFigures

/**
 * Two of the things spend leaves out (D-27, backend 2026-11-07), among others. Pending (owner ruling
 * 2026-11-07f, backend 04cddf824): a bill or debit note awaiting approval, a supplier debit note
 * nobody has accepted or refused, a supplier credit note whose target awaits approval (a credit note
 * follows the approval state of the document it corrects), a standalone credit note nobody has
 * approved yet (R5, backend 91feb7889: approved, it is spend), and a Peppol copy held on figures
 * alone until its duplicate check is decided (backend aaa3ae735). Rejected covers rejected bills,
 * refused debit notes, a debit note whose approval was rejected, a standalone credit note rejected
 * on its own, and a credit note carrying a rejection recorded before credit notes could no longer be
 * decided. Absent from an older server, which is "not available", never zero.
 */
export type ExpenditureDecisionFigures = {
  pendingDocuments?: number
  pendingNetAmount?: number
  pendingTotalAmount?: number
  rejectedDocuments?: number
  rejectedNetAmount?: number
  rejectedTotalAmount?: number
}

export type ExpenditureTotalDto = {
  currency: string
  documents: number
  netAmount: number
  vatAmount: number
  totalAmount: number
  /** The rows' `billDocuments` and `billNetAmount` summed (ACC-5); absent before backend #824. */
  billDocuments?: number
  billNetAmount?: number
} & ExpenditureDecisionFigures

export type ExpenditureReportDto = {
  from: string | null
  to: string | null
  granularity: ReportGranularity
  groupBy: ExpenditureGroupBy
  rows: ExpenditureRowDto[]
  totals: ExpenditureTotalDto[]
}

/**
 * Cash that moved in one bucket, in one currency.
 *
 * Both directions are stated positive and `net` is the only signed figure. A reversal subtracts
 * from its own direction — it never crosses to the other one — and falls in the period it was
 * recorded in, so a closed month cannot change after the fact. A direction can therefore read
 * negative where a period's reversals exceeded its payments.
 */
export type CashFlowRowDto = {
  period: string
  periodStart: string
  periodEnd: string
  /**
   * Null only for till paid-outs written before RC5, which recorded no currency (backend cb9898ac3,
   * OQ-F19): the "currency not recorded" bucket. Never to be read as the company's currency.
   */
  currency: string | null
  received: number
  paidOut: number
  net: number
} & TillPaidOutFigures &
  SupplierRefundFigures

/**
 * Till paid-outs by class (V536), beside `paidOut` and never in it or in `net`: a till payment that
 * paid a bill is already in `paidOut`, once, as that bill payment. Absent from a server before
 * cb9898ac3, which reads as none.
 */
export type TillPaidOutFigures = {
  cashPaidOutExpense?: number
  cashPaidOutAdvance?: number
  /** An internal movement, in no outflow total. */
  cashTransferred?: number
  /** Written before RC5, which carry no class. */
  cashPaidOutUnclassified?: number
}

export type SupplierRefundFigures = {
  /**
   * Refunds suppliers paid back (D-29): cash received beside `received` (customer payments), and
   * in `net`. Absent from an older server, which is "not available", never zero.
   */
  supplierRefunds?: number
  /**
   * Refunds recorded on self-billed credit notes where the tenant is the seller: their cash
   * direction is not recorded, so the server keeps them out of `net`.
   */
  supplierRefundsUnclassified?: number
}

export type CashFlowTotalDto = {
  /** Null for the "currency not recorded (before RC5)" bucket. */
  currency: string | null
  received: number
  paidOut: number
  net: number
} & TillPaidOutFigures &
  SupplierRefundFigures

export type CashFlowReportDto = {
  from: string | null
  to: string | null
  granularity: ReportGranularity
  rows: CashFlowRowDto[]
  totals: CashFlowTotalDto[]
}

/**
 * `rate` is null on INPUT rows, and on E and O output rows where the rules forbid one.
 *
 * `category` on INPUT rows is `ALL` today (one VAT total per bill). TODO(backend): REPORTS.md row
 * 1.23, the Oman categories (S, Z, E, O, CL-04-OM) on INPUT rows; the page splits them as soon as
 * they arrive. Reverse charge is a transaction type (BTOM-001), not a category, and is not read
 * from `category` (row 1.27).
 */
export type VatRowDto = {
  side: 'OUTPUT' | 'INPUT' | 'NET'
  period: string
  periodStart: string
  periodEnd: string
  category: string
  rate: number | null
  currency: string
  documents: number
  taxableAmount: number
  vatAmount: number
  /** TODO(backend): REPORTS.md row 1.25, on INPUT rows: VAT on approved, receipt-reported bills. */
  reclaimableVatAmount?: number | null
}

export type VatReportDto = {
  from: string | null
  to: string | null
  granularity: ReportGranularity
  output: VatRowDto[]
  input: VatRowDto[]
  net: VatRowDto[]
  /**
   * Input VAT on bills that state no OMR VAT, per period and currency, kept out of the OMR input
   * rows. Absent on an older server. Not shown yet.
   */
  inputWithoutOmrVat?: VatInputWithoutOmrDto[]
}

export type VatInputWithoutOmrDto = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  currency: string
  documents: number
  vatAmount: number
}

export type ListsDatasetDto = {
  key: string
  title: string
  description: string
  /** What the caller must hold. A dataset they cannot download is still worth naming. */
  permission: string
  formats: string[]
  hrefCsv: string | null
  hrefXlsx: string | null
  parameters: string[]
}

export type ListsCatalogueDto = { datasets: ListsDatasetDto[] }

function rangeQuery(range: ReportRange) {
  return { from: range.from ?? null, to: range.to ?? null, granularity: range.granularity ?? null }
}

export function volumePath(range: ReportRange, groupBy: VolumeGroupBy = 'NONE') {
  return withQuery(`${REPORTS_PATH}/volume`, { ...rangeQuery(range), group_by: groupBy })
}

export function loadVolumeReport(path: string): Promise<VolumeReportDto> {
  return apiRequest<VolumeReportDto>(path)
}

export function expenditurePath(range: ReportRange, groupBy: ExpenditureGroupBy = 'NONE') {
  return withQuery(`${REPORTS_PATH}/expenditure`, { ...rangeQuery(range), group_by: groupBy })
}

export function loadExpenditureReport(path: string): Promise<ExpenditureReportDto> {
  return apiRequest<ExpenditureReportDto>(path)
}

export function cashFlowPath(range: ReportRange) {
  return withQuery(`${REPORTS_PATH}/cash-flow`, rangeQuery(range))
}

export function loadCashFlowReport(path: string): Promise<CashFlowReportDto> {
  return apiRequest<CashFlowReportDto>(path)
}

export function vatPath(range: ReportRange) {
  return withQuery(`${REPORTS_PATH}/vat`, rangeQuery(range))
}

export function loadVatReport(path: string): Promise<VatReportDto> {
  return apiRequest<VatReportDto>(path)
}

export function loadListsCatalogue(): Promise<ListsCatalogueDto> {
  return apiRequest<ListsCatalogueDto>(REPORT_LISTS_PATH)
}

/**
 * Both report families export themselves. The href is built here rather than taken from a
 * response so the download always carries the same range the screen is showing.
 */
export function reportExportPath(
  report: 'volume' | 'vat' | 'expenditure' | 'cash-flow',
  format: 'csv' | 'xlsx',
  range: ReportRange,
  groupBy?: VolumeGroupBy | ExpenditureGroupBy,
) {
  return withQuery(`${REPORTS_PATH}/${report}.${format}`, {
    ...rangeQuery(range),
    // /vat and /cash-flow take no grouping, and sending one they do not know would be a 400.
    group_by: report === 'vat' || report === 'cash-flow' ? null : (groupBy ?? 'NONE'),
  })
}

/**
 * The catalogue's own hrefs are absolute (`/api/v1/...`) while the client prefixes `/api`, so the
 * prefix is taken off before use. Left on, every download would ask for `/api/api/v1/...`.
 */
export function catalogueHref(href: string): string {
  return href.startsWith('/api/') ? href.slice('/api'.length) : href
}

export function downloadReport(path: string): Promise<ApiDownload> {
  return apiDownload(path)
}

/**
 * The window a report opens on when the reader has not chosen one.
 *
 * **Not optional.** `VolumeReportUseCase`, `VatReportUseCase` and the activity summary all answer
 * 400 "from and to are required" without both, even though the controller binds them as optional
 * request parameters — the signature says nothing about it and only a real call reveals it. Year
 * to date is the smallest honest default: it always validates, and it is the window a tenant
 * reconciling a return is most often looking at.
 */
export function defaultReportRange(today: Date = new Date()): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: `${today.getUTCFullYear()}-01-01`, to: iso(today) }
}
