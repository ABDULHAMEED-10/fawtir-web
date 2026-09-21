import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * Reports (`ReportsController`, `ReportListsController`).
 *
 * Two report families and a downloads catalogue:
 *
 * - **volume** — issued documents only. The adapter reads `FROM invoice.invoices`, so this is
 *   the sell side; there is no received-document equivalent.
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

export type ReportRange = { from?: string | null; to?: string | null; granularity?: ReportGranularity }

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

/** `rate` is null on INPUT rows, and on E and O output rows where the rules forbid one. */
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
}

export type VatReportDto = {
  from: string | null
  to: string | null
  granularity: ReportGranularity
  output: VatRowDto[]
  input: VatRowDto[]
  net: VatRowDto[]
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
export function reportExportPath(report: 'volume' | 'vat', format: 'csv' | 'xlsx', range: ReportRange, groupBy?: VolumeGroupBy) {
  return withQuery(`${REPORTS_PATH}/${report}.${format}`, {
    ...rangeQuery(range),
    group_by: report === 'volume' ? (groupBy ?? 'NONE') : null,
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
