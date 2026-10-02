import { apiDownload, apiRequest, type ApiDownload } from './client'

/**
 * The staged import both counterparty screens use (E-06): check a CSV, review what it would do,
 * then bring in the rows that were kept. Suppliers and customers have the same routes under their
 * own prefix. The supplier template is the supplier form's fields in the form's order, in English
 * or Arabic (owner's answer 5, 2 Oct 2026); a server from before that answers the customer
 * template on the supplier route, and a file in the customer template's shape is still taken.
 *
 * Every call needs `customer.import`.
 */

export type ImportTarget = 'SUPPLIER' | 'CUSTOMER'

export type ImportSeverity = 'READY' | 'NEEDS_A_LOOK' | 'CANNOT_IMPORT'

export type ImportBatchRowDto = {
  /** The line in the file, header included, so it matches the spreadsheet the reviewer has open. */
  rowNumber: number
  displayName: string | null
  severity: ImportSeverity
  /** The column at fault, when one can be attributed. */
  field: string | null
  message: string | null
  cells: string[]
  /** Null until the batch is committed, then CREATED or SKIPPED. */
  outcome: string | null
  outcomeMessage: string | null
  /**
   * The record already on file with this row's VAT number or Peppol ID (`field` says which). Only
   * one live record may hold either, so such a row can never be created. `supplier` false means
   * the record is a customer that is not a supplier, which has no supplier page to link to.
   * Suppliers only: the customer import always answers null.
   */
  onFile?: { id: string; displayName: string; supplier: boolean } | null
  /**
   * The line under the name in the review ("Net 30 · rustaq@timber.om"). The server does not send
   * it. TODO(owner): it could be written from `cells`, but which of the VAT number, the terms and
   * the e-mail it names, in what order, and what it says when one is missing is not decided
   * (EXPENDITURE.md 6.15); the line stays undrawn until it is.
   */
  summary?: string | null
  /**
   * What the file holds in the column at fault, for the review's field box. The server does not
   * send it; the page reads it from `cells` (`problemValue` in lib/stagedImport).
   */
  value?: string | null
}

export type ImportBatchDto = {
  id: string
  target: ImportTarget
  state: 'CHECKED' | 'COMMITTED' | 'CANCELLED'
  filename: string | null
  fileSha256: string
  totalRows: number
  /** A batch is reviewable for 24 hours; committing after that is refused. */
  expiresAt: string | null
  committedAt: string | null
  /**
   * The key of each column, in the order of every row's `cells`, whatever order or language the
   * uploaded file used. Only on a supplier batch checked from a file in the supplier template's
   * shape; absent on a customer batch, on a supplier batch checked from a customer-shaped file,
   * and from a server that predates it. Without it the cells follow the customer template.
   */
  columns?: string[] | null
  rows: ImportBatchRowDto[]
  counts: {
    ready: number
    needsALook: number
    cannotImport: number
    wouldImport: number
    /**
     * How many of the ready rows are on Peppol; the review's first card says so. The server does
     * not send it; the page counts it from `cells` (`readyOnPeppol` in lib/stagedImport).
     */
    onPeppol?: number
  }
}

export type ImportCommitResultDto = {
  batchId: string
  selected: number
  /** Can be lower than `selected`: the importer re-checks every row it writes. */
  created: number
  skipped: number
}

/** 2 MiB, the server's own limit. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024

const base = (target: ImportTarget) =>
  target === 'SUPPLIER' ? '/v1/suppliers/import' : '/v1/customers/import'

export function importBatchPath(target: ImportTarget, batchId: string) {
  return `${base(target)}/${encodeURIComponent(batchId)}`
}

export function checkImport(target: ImportTarget, file: File): Promise<ImportBatchDto> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<ImportBatchDto>(`${base(target)}/check`, { method: 'POST', body: form })
}

export function loadImportBatch(target: ImportTarget, batchId: string): Promise<ImportBatchDto> {
  return apiRequest<ImportBatchDto>(importBatchPath(target, batchId))
}

/**
 * `rowNumbers` names the rows to bring in. Null sends none and lets the server choose (every
 * importable row that does not repeat an earlier row of the file); the import screen always names
 * its rows, so what is brought in is what was ticked.
 */
export function commitImport(
  target: ImportTarget,
  batchId: string,
  rowNumbers: number[] | null,
): Promise<ImportCommitResultDto> {
  return apiRequest<ImportCommitResultDto>(`${importBatchPath(target, batchId)}/commit`, {
    method: 'POST',
    body: rowNumbers === null ? {} : { rowNumbers },
  })
}

/**
 * The supplier routes head their files in the reader's language: `ar` for Arabic, `en` for
 * anything else, as the invoice import's template does. The customer routes take no language.
 */
function inLanguage(target: ImportTarget, path: string, language: string): string {
  if (target !== 'SUPPLIER') return path
  return `${path}?language=${language.startsWith('ar') ? 'ar' : 'en'}`
}

/** The rows that cannot be imported, in the template's shape, to fix in the file and check again. */
export function downloadFailedRows(
  target: ImportTarget,
  batchId: string,
  language: string,
): Promise<ApiDownload> {
  return apiDownload(inLanguage(target, `${importBatchPath(target, batchId)}/failed.csv`, language))
}

export const importTemplatePath = (target: ImportTarget) => `${base(target)}/template`

export function downloadImportTemplate(
  target: ImportTarget,
  language: string,
): Promise<ApiDownload> {
  return apiDownload(inLanguage(target, importTemplatePath(target), language))
}

/**
 * Where the column keys of a batch that names none are read: the customer template, whose header
 * line is its keys. Such a batch is a customer's, or a supplier's checked from a customer-shaped
 * file (every supplier batch, on a server from before the supplier template).
 */
export const FALLBACK_COLUMNS_PATH = importTemplatePath('CUSTOMER')

/**
 * The customer template's column keys, in order: its header line. The `cells` of a batch that
 * names no `columns` are in this order whatever order the uploaded file used.
 */
export async function loadFallbackColumns(): Promise<string[]> {
  const { blob } = await apiDownload(FALLBACK_COLUMNS_PATH)
  const header = (await blob.text()).replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? ''
  return header
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}
