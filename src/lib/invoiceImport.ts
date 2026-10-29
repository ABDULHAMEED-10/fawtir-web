import type {
  ClassificationAnswer,
  ImportKind,
  ImportUnresolvedDto,
  ImportWarningDto,
  InvoiceImportBatchDto,
} from '../api/invoices/import'

/** The guide's four steps, shown in order inside the one dialog. */
export type ImportStep = 'prepare' | 'validate' | 'preview' | 'result'

export const IMPORT_STEPS: readonly ImportStep[] = ['prepare', 'validate', 'preview', 'result']

export const IMPORT_KINDS: readonly ImportKind[] = ['BUSINESS', 'CONSUMER', 'GOVERNMENT']

/** Where a batch stands: no batch is the first step; a file with problems stays on validate. */
export function importStepOf(batch: InvoiceImportBatchDto | null): ImportStep {
  if (!batch) return 'prepare'
  if (batch.state === 'CHECKING') return 'validate'
  if (batch.state === 'CHECKED') return batch.errors.length > 0 ? 'validate' : 'preview'
  if (batch.state === 'CREATING') return 'preview'
  return 'result'
}

/** A batch still working in the background, to be read again until it settles. */
export function isImportWorking(batch: InvoiceImportBatchDto | null): boolean {
  return batch?.state === 'CHECKING' || batch?.state === 'CREATING'
}

/** Warnings the dialog words itself (`invoiceImport.warning.<key>`); others show the server's sentence. */
const WARNING_KEYS: Record<string, string> = {
  TAX_CATEGORY_DEFAULTED: 'invoiceImport.warning.taxCategoryDefaulted',
}

/** The i18n key for a warning the dialog knows, or null to show the server's own message. */
export function importWarningKey(warning: ImportWarningDto): string | null {
  return Object.hasOwn(WARNING_KEYS, warning.code) ? WARNING_KEYS[warning.code] : null
}

/**
 * The column a warning the dialog knows is about, worded as the template's own header so the user
 * finds it in the file (`invoiceImport.warningColumn.<key>`), whatever the server put in `column`.
 */
const WARNING_COLUMN_KEYS: Record<string, string> = {
  TAX_CATEGORY_DEFAULTED: 'invoiceImport.warningColumn.taxCategory',
}

/** The i18n key for the column of a warning the dialog knows, or null to show the server's. */
export function importWarningColumnKey(warning: ImportWarningDto): string | null {
  return Object.hasOwn(WARNING_COLUMN_KEYS, warning.code) ? WARNING_COLUMN_KEYS[warning.code] : null
}

/** 0 to 100, from rows processed against rows total; never a spinner. */
export function importProgress(batch: InvoiceImportBatchDto): number {
  if (batch.totalRows <= 0) return 0
  return Math.min(100, Math.round((batch.processedRows / batch.totalRows) * 100))
}

/**
 * A Consumer file creates customer records, so it also needs `customer.manage`, as the composer's
 * walk-in does. Answers the permission that is missing, or null.
 */
export function missingImportPermission(
  kind: ImportKind,
  can: (permission: string) => boolean,
): string | null {
  if (!can('invoice.draft')) return 'invoice.draft'
  if (kind === 'CONSUMER' && !can('customer.manage')) return 'customer.manage'
  return null
}

const answerKey = (item: { description: string; itemType: string }) =>
  `${item.itemType}\u0000${item.description}`

/** The chosen codes, one per unresolved description, in the shape the commit takes. */
export function classificationAnswers(
  unresolved: ImportUnresolvedDto[],
  chosen: Record<string, string>,
): ClassificationAnswer[] {
  return unresolved
    .map((item) => ({ ...item, code: chosen[answerKey(item)] ?? '' }))
    .filter((item) => item.code !== '')
    .map(({ description, itemType, code }) => ({ description, itemType, code }))
}

/** Every unresolved description has a code: the drafts can be created. */
export function allClassified(
  unresolved: ImportUnresolvedDto[],
  chosen: Record<string, string>,
): boolean {
  return classificationAnswers(unresolved, chosen).length === unresolved.length
}

export { answerKey as classificationKey }
