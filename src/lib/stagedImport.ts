import type {
  ImportBatchDto,
  ImportBatchRowDto,
  ImportSeverity,
  ImportTarget,
} from '../api/counterpartyImport'

/**
 * The staged counterparty import (E-06, decisions of 2026-09-18).
 *
 * The review chooses; it does not edit. The API stages a checked file and commits the rows it is
 * given, and has no way to change one, so a row that cannot be imported is left out and corrected
 * in the file itself — which is what the failed-rows download is for. The design's inline editing,
 * "fix all like this" and "update instead" have nothing behind them and are not drawn.
 */

export type ImportTabId = 'cannotImport' | 'needsALook' | 'ready' | 'all'

export const IMPORT_TABS: ImportTabId[] = ['cannotImport', 'needsALook', 'ready', 'all']

const TAB_SEVERITY: Record<Exclude<ImportTabId, 'all'>, ImportSeverity> = {
  cannotImport: 'CANNOT_IMPORT',
  needsALook: 'NEEDS_A_LOOK',
  ready: 'READY',
}

export function rowsInTab(batch: ImportBatchDto, tab: ImportTabId): ImportBatchRowDto[] {
  return tab === 'all' ? batch.rows : batch.rows.filter((row) => row.severity === TAB_SEVERITY[tab])
}

export function tabCount(batch: ImportBatchDto, tab: ImportTabId): number {
  if (tab === 'all') return batch.totalRows
  return batch.counts[tab]
}

/**
 * A row that can be brought in. A refused row is never sent, whatever is ticked; nor is a row
 * whose VAT number or Peppol ID is already on file, since the server would only skip it.
 */
export function importable(row: ImportBatchRowDto): boolean {
  return row.severity !== 'CANNOT_IMPORT' && !row.onFile
}

/** The record a row duplicates, and its page when it has one (a supplier's; the import is theirs). */
export function alreadyOnFile(row: ImportBatchRowDto): { to: string | null } | null {
  if (!row.onFile) return null
  return { to: row.onFile.supplier ? `/suppliers/${encodeURIComponent(row.onFile.id)}` : null }
}

/**
 * What to send as `rowNumbers`: always the rows that are kept, named one by one.
 *
 * It used to send nothing ("all of them") when as many rows were kept as the server's
 * `wouldImport`. The two numbers can match while the rows differ: in a file where B repeats A,
 * keeping A and B and leaving G out is two rows, as is the server's own A and G. The reader would
 * then get rows they did not choose, so the list always goes out. The server takes a list equal
 * to its default set as it takes no list.
 */
export function commitSelection(batch: ImportBatchDto, keep: ReadonlySet<number>): number[] {
  return batch.rows
    .filter((row) => importable(row) && keep.has(row.rowNumber))
    .map((row) => row.rowNumber)
}

/**
 * What the first read of a batch keeps: every importable row, less a row that repeats an earlier
 * row of the file. Only one of such a pair can come in, so the first stays kept and the repeat
 * starts left out, which is also what the server counts in `wouldImport`. The reader can still
 * bring the repeat in by hand (and leave the first out).
 */
export function initialSelection(batch: ImportBatchDto): Set<number> {
  return new Set(
    batch.rows
      .filter((row) => importable(row) && repeatsEarlierRow(row) === null)
      .map((row) => row.rowNumber),
  )
}

export function comingIn(batch: ImportBatchDto, keep: ReadonlySet<number>): number {
  return batch.rows.filter((row) => importable(row) && keep.has(row.rowNumber)).length
}

export function expired(batch: ImportBatchDto, now: Date): boolean {
  return batch.expiresAt !== null && new Date(batch.expiresAt) <= now
}

/** A batch that cannot be committed any more, and why — an expired or already-used review. */
export function batchBlocker(
  batch: ImportBatchDto,
  now: Date,
): 'expired' | 'committed' | 'cancelled' | null {
  if (batch.state === 'COMMITTED') return 'committed'
  if (batch.state === 'CANCELLED') return 'cancelled'
  return expired(batch, now) ? 'expired' : null
}

/** Columns worth naming in the reader's language; anything else is shown as the server spells it. */
const FIELD_LABELS: Record<string, string> = {
  customerType: 'stagedImport.field.customerType',
  legalRegisteredName: 'stagedImport.field.legalName',
  entityMinistryName: 'stagedImport.field.entityName',
  firstName: 'stagedImport.field.firstName',
  lastName: 'stagedImport.field.lastName',
  vatRegistrationNumber: 'stagedImport.field.vatNumber',
  registeredForVat: 'stagedImport.field.registeredForVat',
  peppolParticipantId: 'stagedImport.field.peppolId',
  emailRecipients: 'stagedImport.field.email',
  telephone: 'stagedImport.field.telephone',
  mobilePhone: 'stagedImport.field.mobile',
  paymentTerms: 'stagedImport.field.paymentTerms',
  defaultCurrency: 'stagedImport.field.currency',
  defaultTaxCategory: 'stagedImport.field.taxCategory',
  invoiceCountry: 'stagedImport.field.country',
  invoiceCityName: 'stagedImport.field.city',
  invoiceStreetName: 'stagedImport.field.street',
  bankIban: 'stagedImport.field.iban',
  bankBic: 'stagedImport.field.bic',
  bankName: 'stagedImport.field.bankName',
  // The supplier template's own columns (owner's answer 5, 2 Oct 2026), each in the words of the
  // supplier form's field it fills.
  type: 'newSupplier.sections.supplierType',
  legalName: 'supplierEdit.legalName',
  tradingName: 'supplierEdit.tradingName',
  commercialRegistrationNumber: 'supplierEdit.commercialRegistration',
  country: 'supplierEdit.country',
  registeredOnPeppol: 'supplierEdit.onPeppol',
  autoMatchPurchaseOrders: 'supplierEdit.autoMatch',
  earlyPaymentDiscountPercent: 'supplierForm.earlyPercent',
  earlyPaymentDiscountDays: 'supplierForm.earlyDays',
  contactPerson: 'supplierEdit.mainContact',
  streetName: 'supplierEdit.address',
  cityName: 'addressContact.city',
  governorate: 'addressContact.governorate',
  postalCode: 'addressContact.postalCode',
  supplierCategory: 'supplierEdit.category',
  tags: 'supplierEdit.tags',
}

export function fieldLabel(field: string | null): { key: string } | { text: string } | null {
  if (!field) return null
  const key = FIELD_LABELS[field]
  return key ? { key } : { text: field }
}

/** "Row 2 of this file has the same VAT number, and only one of them can be brought in". */
const REPEATS_EARLIER_ROW = /^Row (\d+) of this file has the same (VAT number|Peppol identifier)/

/**
 * Whether the check marked this row as repeating an earlier row of the same file, and which: the
 * earlier row's line in the file and the identifier the two share. The server stores no kind for
 * a row that is worth a look, so its message is what says it, as it is for "already on file"
 * below. Null for any other row, and for every row of a server that does not flag repeats.
 */
export function repeatsEarlierRow(
  row: ImportBatchRowDto,
): { row: number; identifier: 'vat' | 'peppol' } | null {
  if (row.severity !== 'NEEDS_A_LOOK' || !row.message) return null
  const match = REPEATS_EARLIER_ROW.exec(row.message)
  if (!match) return null
  return { row: Number(match[1]), identifier: match[2] === 'VAT number' ? 'vat' : 'peppol' }
}

/** What the review says is wrong with a row: a sentence of the app's, or the server's own words. */
export type ProblemNote =
  | { key: string; values?: Record<string, string | number> }
  | { text: string }

/**
 * The verdicts the check gives for a row it will still import, each in a sentence of the app's
 * own: the counterparty is already on file, or the row repeats an earlier row of the same file
 * (the owner's sentence of 2 Oct 2026, naming that row). Everything else is a validation refusal
 * in the server's own words, which is more use to the reader than a guess at what it meant.
 */
export function problemNote(row: ImportBatchRowDto): ProblemNote | null {
  if (!row.message) return null
  if (row.severity === 'NEEDS_A_LOOK' && /already on file/i.test(row.message)) {
    return {
      key:
        row.field === 'vatRegistrationNumber'
          ? 'stagedImport.problem.duplicateVat'
          : 'stagedImport.problem.duplicatePeppol',
    }
  }
  const repeat = repeatsEarlierRow(row)
  if (repeat) {
    return {
      key:
        repeat.identifier === 'vat'
          ? 'stagedImport.problem.repeatsRowVat'
          : 'stagedImport.problem.repeatsRowPeppol',
      values: { row: repeat.row },
    }
  }
  return { text: row.message }
}

/**
 * What the file holds in one column of a row, or undefined when it cannot be told: the columns are
 * not known yet, the template has no such column, or the row's cells are not the template's width
 * (a row the check could not map is kept as it was typed, in the file's own order).
 */
function cellOf(
  row: ImportBatchRowDto,
  columns: readonly string[] | null,
  column: string,
): string | undefined {
  if (!columns || row.cells.length !== columns.length) return undefined
  const index = columns.indexOf(column)
  return index < 0 ? undefined : row.cells[index]
}

/**
 * The file's value in the column at fault, for the review's field box: the server's own `value`
 * when it sends one, else the row's cell in that column.
 */
export function problemValue(
  row: ImportBatchRowDto,
  columns: readonly string[] | null,
): string | undefined {
  if (typeof row.value === 'string') return row.value
  return row.field ? cellOf(row, columns, row.field) : undefined
}

/**
 * How many of the ready rows are on Peppol, for the review's first card: the server's count when
 * it sends one, else the ready rows that carry a Peppol ID. That is the rule the Suppliers list's
 * "On Peppol" card counts by (a record with a participant identifier), so the card says what the
 * list will say once the rows are in. Null when it cannot be told, and the card then says less.
 */
export function readyOnPeppol(
  batch: ImportBatchDto,
  columns: readonly string[] | null,
): number | null {
  if (typeof batch.counts.onPeppol === 'number') return batch.counts.onPeppol
  if (!columns || !columns.includes('peppolParticipantId')) return null
  let count = 0
  for (const row of batch.rows) {
    if (row.severity !== 'READY') continue
    const id = cellOf(row, columns, 'peppolParticipantId')
    if (id === undefined) return null
    if (id.trim()) count += 1
  }
  return count
}

export type FileProblem = 'type' | 'size' | null

export function fileProblem(file: File, maxBytes: number): FileProblem {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'type'
  return file.size > maxBytes ? 'size' : null
}

export const IMPORT_ROUTES: Record<ImportTarget, { list: string; page: string }> = {
  SUPPLIER: { list: '/suppliers', page: '/suppliers/import' },
  CUSTOMER: { list: '/customers', page: '/customers/import' },
}
