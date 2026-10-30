import { apiDownload, apiRequest, type ApiDownload } from '../client'

/**
 * Invoice import (the Invoices list's Bulk upload dialog): a filled template in, drafts out.
 *
 * The shapes follow the approved Invoice Import guide (28 Sep 2026), listed in
 * docs/backend-guides/INCOME.md, "Update 2026-09-28 (invoice import)", rows I.1 to I.10, and served
 * by the backend's `/v1/invoices/import/*` (fawtir-backend #382, #387). A route that answers 404
 * still makes the dialog say the import is not available rather than pretend.
 *
 * Nothing here issues: the import creates drafts only, and issuing stays on the Invoices list.
 */

export type ImportKind = 'CONSUMER' | 'BUSINESS' | 'GOVERNMENT'

/** CHECKING and CREATING are the background states of a file above {@link IMPORT_INSTANT_ROWS}. */
export type ImportState = 'CHECKING' | 'CHECKED' | 'CREATING' | 'CREATED' | 'CANCELLED'

/** One problem in the file, in the user's language, by row (header included) and column. */
export type ImportErrorDto = {
  rowNumber: number
  column: string
  message: string
  /** The refusal's name when the server gives one (`InvoiceImportBatch.RowError.code`); often null. */
  code?: string | null
}

/**
 * Something in the file the import went ahead with but the user should check: never blocks the
 * file. A blank TAX_CATEGORY cell, for one, is read as standard rate (5%).
 */
export type ImportWarningDto = {
  /**
   * The one row the warning is about (`InvoiceImportBatch.RowWarning`). The type said
   * `rowNumbers: number[]` and the dialog went blank on the first warning (IMP-1); the dialog
   * lists a code's rows together itself (`groupImportWarnings`).
   */
  rowNumber: number
  column: string
  /** The warning's name, e.g. `TAX_CATEGORY_DEFAULTED`; worded by the dialog when it knows it. */
  code: string
  /** `WARNING` today; never blocks the file. */
  severity: string | null
  /** The server's own sentence, in the user's language, for a code the dialog does not know. */
  message: string
}

/** A value the server resolved by inference, for the user to check in the preview. */
export type ImportInferenceDto = {
  rowNumbers: number[]
  column: string
  /** What the file said. */
  value: string
  /** What it was matched to, e.g. a catalogue product or a customer. */
  matchedTo: string
}

/** A description with no catalogue match on a Business or Government file: asked once, not per row. */
export type ImportUnresolvedDto = {
  description: string
  itemType: 'GOODS' | 'SERVICE'
  rowCount: number
}

export type ImportCreatedDto = {
  reference: string
  invoiceId: string
  /** Drafts carry no invoice number until issued; the server's draft label, when it has one. */
  draftNumber: string | null
  customerName: string
  total: number
}

export type InvoiceImportBatchDto = {
  id: string
  kind: ImportKind
  state: ImportState
  filename: string | null
  fileSha256: string
  /** The same file was uploaded before: who and when, so the user can stop a double upload. */
  duplicateOf: { batchId: string; uploadedAt: string; uploadedBy: string } | null
  totalRows: number
  /** Rows checked (while CHECKING) or rows created (while CREATING), for the progress bar. */
  processedRows: number
  /** Empty when the file can be imported; any entry blocks the whole file. */
  errors: ImportErrorDto[]
  /** Non-blocking; absent from a server that sends none. */
  warnings?: ImportWarningDto[]
  summary: {
    invoices: number
    lines: number
    total: number
    byCustomer: { customerName: string; invoices: number; total: number }[]
  } | null
  inferred: ImportInferenceDto[]
  unresolved: ImportUnresolvedDto[]
  /** Filled once CREATED. */
  created: ImportCreatedDto[]
}

/** The code a person chose for an unresolved description, stored against it for next time. */
export type ClassificationAnswer = {
  description: string
  itemType: 'GOODS' | 'SERVICE'
  /** A 12-digit HS code for goods (`000000000000` is Other), a CL-12-OM service type for services. */
  code: string
}

/** The guide's limits, stated in the dialog before the upload starts. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const IMPORT_MAX_ROWS = 2000
/** Up to this many rows the dialog answers at once; above it the work runs in the background. */
export const IMPORT_INSTANT_ROWS = 50

const BASE = '/v1/invoices/import'

export function importBatchPath(batchId: string) {
  return `${BASE}/${encodeURIComponent(batchId)}`
}

/** Checks the whole file and creates nothing. `language` is the one the messages come back in. */
export function checkInvoiceImport(
  kind: ImportKind,
  file: File,
  language: string,
): Promise<InvoiceImportBatchDto> {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  form.append('language', language.startsWith('ar') ? 'ar' : 'en')
  return apiRequest<InvoiceImportBatchDto>(`${BASE}/check`, { method: 'POST', body: form })
}

export function loadInvoiceImport(batchId: string): Promise<InvoiceImportBatchDto> {
  return apiRequest<InvoiceImportBatchDto>(importBatchPath(batchId))
}

/** Creates the drafts, with the codes chosen for any unresolved descriptions. */
export function commitInvoiceImport(
  batchId: string,
  classifications: ClassificationAnswer[],
): Promise<InvoiceImportBatchDto> {
  return apiRequest<InvoiceImportBatchDto>(`${importBatchPath(batchId)}/commit`, {
    method: 'POST',
    body: { classifications },
  })
}

/** Cancelling a checked file leaves nothing behind. */
export function cancelInvoiceImport(batchId: string): Promise<void> {
  return apiRequest<void>(importBatchPath(batchId), { method: 'DELETE' })
}

/** The Excel template for one invoice kind, in the user's language, with its reference sheet. */
export function downloadInvoiceTemplate(kind: ImportKind, language: string): Promise<ApiDownload> {
  const lang = language.startsWith('ar') ? 'ar' : 'en'
  return apiDownload(`${BASE}/template?kind=${kind}&language=${lang}`)
}

/** What was created, as a file to keep or reconcile against. */
export function downloadImportReport(batchId: string): Promise<ApiDownload> {
  return apiDownload(`${importBatchPath(batchId)}/report`)
}
