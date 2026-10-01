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
 * What to send as `rowNumbers`: null when every importable row is kept, which is what the server
 * reads as "all of them", and the explicit list otherwise.
 */
export function commitSelection(batch: ImportBatchDto, keep: ReadonlySet<number>): number[] | null {
  const chosen = batch.rows
    .filter((row) => importable(row) && keep.has(row.rowNumber))
    .map((row) => row.rowNumber)
  // `wouldImport` counts a row already on file, which is never chosen: the list then goes out
  // in full, so the server is not asked for a row it would skip.
  return chosen.length === Number(batch.counts.wouldImport) ? null : chosen
}

export function initialSelection(batch: ImportBatchDto): Set<number> {
  return new Set(batch.rows.filter(importable).map((row) => row.rowNumber))
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
}

export function fieldLabel(field: string | null): { key: string } | { text: string } | null {
  if (!field) return null
  const key = FIELD_LABELS[field]
  return key ? { key } : { text: field }
}

/**
 * The one verdict the check gives today for a row it will still import: the counterparty is
 * already on file. Everything else is a validation refusal in the server's own words, which is
 * more use to the reader than a guess at what it meant.
 */
export function problemNote(row: ImportBatchRowDto): { key: string } | { text: string } | null {
  if (!row.message) return null
  if (row.severity === 'NEEDS_A_LOOK' && /already on file/i.test(row.message)) {
    return {
      key:
        row.field === 'vatRegistrationNumber'
          ? 'stagedImport.problem.duplicateVat'
          : 'stagedImport.problem.duplicatePeppol',
    }
  }
  return { text: row.message }
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
