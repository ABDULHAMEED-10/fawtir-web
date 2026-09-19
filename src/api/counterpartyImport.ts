import { apiDownload, apiRequest, type ApiDownload } from './client'

/**
 * The staged import both counterparty screens use (E-06): check a CSV, review what it would do,
 * then bring in the rows that were kept. Suppliers and customers have the same routes under their
 * own prefix, and the file is the same template — a supplier is a customer row flagged as one.
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
  rows: ImportBatchRowDto[]
  counts: { ready: number; needsALook: number; cannotImport: number; wouldImport: number }
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

const base = (target: ImportTarget) => (target === 'SUPPLIER' ? '/v1/suppliers/import' : '/v1/customers/import')

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

/** `rowNumbers` names the rows to bring in; null means every importable row. */
export function commitImport(target: ImportTarget, batchId: string, rowNumbers: number[] | null): Promise<ImportCommitResultDto> {
  return apiRequest<ImportCommitResultDto>(`${importBatchPath(target, batchId)}/commit`, {
    method: 'POST',
    body: rowNumbers === null ? {} : { rowNumbers },
  })
}

/** The rows that cannot be imported, in the template's shape, to fix in the file and check again. */
export function downloadFailedRows(target: ImportTarget, batchId: string): Promise<ApiDownload> {
  return apiDownload(`${importBatchPath(target, batchId)}/failed.csv`)
}

export function downloadImportTemplate(target: ImportTarget): Promise<ApiDownload> {
  return apiDownload(`${base(target)}/template`)
}
