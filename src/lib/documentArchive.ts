import type { ArchiveArtefacts, ArchiveItemDto } from '../api/compliance/archive'

/**
 * The compliance archive as the screen reads it (E-07, decisions of 2026-09-18).
 *
 * The archive is a read model: it says which artefacts exist and where each is served, and it
 * stores nothing itself. So the page offers a download only where the API gives an address.
 *
 * Since the design realignment of 27 Sep 2026 the screens draw what the Figma frames draw
 * (154:139382, 154:140005): integrity ticks, sizes, the four figures, secure sharing and a ZIP.
 * Each is fed from an optional archive field when the backend answers it (backend asks 3.1 to
 * 3.12) and says it is not known, or waits, until then. Nothing is invented.
 */

export type ArtefactId = 'xml' | 'tdd' | 'pdf' | 'qr' | 'mls' | 'delivery_notification'

export const ARTEFACT_ORDER: ArtefactId[] = [
  'xml',
  'tdd',
  'pdf',
  'qr',
  'mls',
  'delivery_notification',
]

export type ArtefactRow = {
  id: ArtefactId
  /** What the archive says exists. */
  available: boolean
  href: string | null
  /** The MLS artefact is the activity screen, not a file: it is opened, not downloaded. */
  opens: boolean
  count?: number
}

/** Every artefact the archive knows about, in the order the record is read. */
export function artefactRows(artefacts: ArchiveArtefacts): ArtefactRow[] {
  return ARTEFACT_ORDER.map((id) => {
    const artefact = artefacts[id]
    return {
      id,
      available: Boolean(artefact?.available),
      href: artefact?.href ?? null,
      opens: id === 'mls',
      count: id === 'mls' ? artefacts.mls_count : undefined,
    }
  })
}

/** A document nobody can remove yet, and the reason a person can act on. */
export function frozenNote(
  item: ArchiveItemDto,
): { key: string; values?: Record<string, string> } | null {
  const {
    legal_hold: hold,
    under_retention: underRetention,
    retain_until: retainUntil,
  } = item.retention
  if (hold.held) return { key: 'documents.frozen.legalHold' }
  if (underRetention && retainUntil)
    return { key: 'documents.frozen.retention', values: { date: retainUntil } }
  return null
}

/** `0248:OM1100628391` reads as its value; a party with no identifier says so. */
export function counterpartyValue(counterparty: string | null): string | null {
  if (!counterparty) return null
  const colon = counterparty.indexOf(':')
  return colon === -1 ? counterparty : counterparty.slice(colon + 1)
}

export type ArchiveTabId = 'all' | 'issued' | 'received' | 'legalHold'

export const ARCHIVE_TABS: ArchiveTabId[] = ['all', 'issued', 'received', 'legalHold']

/**
 * What a tab asks the server for. The archive filters by direction only; a legal hold is not a
 * filter it offers, so that tab narrows the page it was given and says as much.
 * TODO(backend): a legal-hold filter on the list, DOCUMENTS.md row 3.21.
 */
export function directionOf(tab: ArchiveTabId): 'ISSUED' | 'RECEIVED' | '' {
  if (tab === 'issued') return 'ISSUED'
  if (tab === 'received') return 'RECEIVED'
  return ''
}

export function visibleItems(items: ArchiveItemDto[], tab: ArchiveTabId): ArchiveItemDto[] {
  return tab === 'legalHold' ? items.filter((item) => item.retention.legal_hold.held) : items
}

/**
 * `PintOmDocumentKind`, the four the archive answers with. A debit note is a STANDARD_INVOICE
 * under the billing profile, which is why there is no kind of its own.
 */
export const DOCUMENT_KINDS = [
  'STANDARD_INVOICE',
  'CREDIT_NOTE',
  'SELF_BILLING_INVOICE',
  'SELF_BILLING_CREDIT_NOTE',
] as const

/** `TddSubmissionStatus`, every value the obligation can hold. */
export const TDD_STATUSES = [
  'PENDING',
  'SUBMITTED',
  'GENERATION_FAILED',
  'ACCEPTED',
  'DELIVERED_UNCONFIRMED',
  'REJECTED',
  'TO_DISREGARD',
  'DISREGARD_SUBMITTED',
  'DEAD_LETTERED',
  // Backend V491: the obligation on a network with no tax authority endpoint to report to.
  'NOT_TESTED',
] as const

export type TddStatus = (typeof TDD_STATUSES)[number]

const isTddStatus = (status: string): status is TddStatus =>
  (TDD_STATUSES as readonly string[]).includes(status)

/**
 * The words for a report status. The archive's `tdd.status` is an open string, and a value this
 * build does not know (NOT_TESTED arrived with V491 and leaked as `documents.chip.NOT_TESTED`)
 * reads as "not recognised" rather than as a raw i18n key.
 */
export function tddStatusKey(status: string | null, scope: 'chip' | 'tdd'): string {
  if (!status) return `documents.${scope}.none`
  return isTddStatus(status) ? `documents.${scope}.${status}` : `documents.${scope}.unknown`
}

/** Tax years worth offering: this one and the nine before it, which is the retention horizon. */
export function taxYears(today: string): number[] {
  const year = Number(today.slice(0, 4))
  return Array.from({ length: 10 }, (_, index) => year - index)
}

export function hasFilters(filters: Record<string, string | undefined>): boolean {
  return Object.values(filters).some((value) => Boolean(value && value.trim()))
}

/** The rows on this page, since the archive answers no total. */
export function showingNote(
  count: number,
  page: number,
  pageSize: number,
): { count: number; from: number; to: number } {
  const from = count === 0 ? 0 : page * pageSize + 1
  return { count, from, to: page * pageSize + count }
}

/* ---------------------------------------------------------------------------------------------
 * The design's reading of an archive row (Figma 154:139382, 154:140005): a kind of record with
 * its own tile, file names a person recognises, format tags, a status chip and "time left".
 * ------------------------------------------------------------------------------------------- */

/** What the record is, as the list names it ("Sales invoice", "Bill received"). */
export type RecordKind =
  | 'salesInvoice'
  | 'billReceived'
  | 'creditIssued'
  | 'creditReceived'
  | 'debitIssued'
  | 'debitReceived'
  | 'prepaymentIssued'
  | 'prepaymentReceived'
  | 'selfBilledInvoice'
  | 'selfBilledCredit'

/**
 * The record's kind, read from its UNCL1001 document type code first (380 invoice, 381 credit
 * note, 383 debit note, 386 prepayment invoice, 389 self-billed invoice, 261 self-billed credit
 * note). `document_kind` alone cannot tell a debit note or a prepayment from an invoice, so it
 * is only the fallback. TODO(backend): `type_code` on the item, DOCUMENTS.md row 3.17.
 */
export function recordKind(
  item: Pick<ArchiveItemDto, 'document_kind' | 'direction'> & { type_code?: string | null },
): RecordKind {
  const received = item.direction === 'RECEIVED'
  switch (item.type_code) {
    case '380':
      return received ? 'billReceived' : 'salesInvoice'
    case '381':
      return received ? 'creditReceived' : 'creditIssued'
    case '383':
      return received ? 'debitReceived' : 'debitIssued'
    case '386':
      return received ? 'prepaymentReceived' : 'prepaymentIssued'
    case '389':
      return 'selfBilledInvoice'
    case '261':
      return 'selfBilledCredit'
  }
  switch (item.document_kind) {
    case 'CREDIT_NOTE':
      return received ? 'creditReceived' : 'creditIssued'
    case 'SELF_BILLING_INVOICE':
      return 'selfBilledInvoice'
    case 'SELF_BILLING_CREDIT_NOTE':
      return 'selfBilledCredit'
    default:
      return received ? 'billReceived' : 'salesInvoice'
  }
}

/** A credit or debit note corrects an earlier invoice (PINT-OM IBR-032-OM for credit notes). */
export function correctsInvoice(kind: RecordKind): boolean {
  return (
    kind === 'creditIssued' ||
    kind === 'creditReceived' ||
    kind === 'debitIssued' ||
    kind === 'debitReceived' ||
    kind === 'selfBilledCredit'
  )
}

/**
 * The kind filter. The archive's `document_kind` parameter knows four kinds; a debit note and a
 * prepayment are STANDARD_INVOICE there, so picking one asks the server for invoices and narrows
 * the page it answers by type code. TODO(backend): a `type_code` filter, DOCUMENTS.md row 3.17.
 */
export const KIND_CHOICES = [
  'STANDARD_INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'PREPAYMENT_INVOICE',
  'SELF_BILLING_INVOICE',
  'SELF_BILLING_CREDIT_NOTE',
] as const

export type KindChoice = (typeof KIND_CHOICES)[number]

const CHOICE_TYPE_CODE: Partial<Record<KindChoice, string>> = {
  DEBIT_NOTE: '383',
  PREPAYMENT_INVOICE: '386',
}

/** What a kind choice asks the server for, and the type code the page narrows by, if any. */
export function kindQuery(choice: KindChoice | ''): {
  documentKind: string
  typeCode: string | null
} {
  if (!choice) return { documentKind: '', typeCode: null }
  const typeCode = CHOICE_TYPE_CODE[choice] ?? null
  return { documentKind: typeCode ? 'STANDARD_INVOICE' : choice, typeCode }
}

/** Only the rows of this page that carry the type code (a debit note, a prepayment). */
export function narrowByType(items: ArchiveItemDto[], typeCode: string | null): ArchiveItemDto[] {
  return typeCode ? items.filter((item) => item.type_code === typeCode) : items
}

/**
 * The document's own issue date. A received record's `occurred_at` is when it reached us, so it
 * is never called "issued": without `issue_date` the screen says "received" instead.
 * TODO(backend): `issue_date` on the item, DOCUMENTS.md row 3.18.
 */
export function issueDateOf(item: ArchiveItemDto): { date: string; received: boolean } {
  if (item.issue_date) return { date: item.issue_date, received: false }
  return { date: item.occurred_at, received: item.direction === 'RECEIVED' }
}

/**
 * A document we received is reported to the OTA by us as its receiver (reporter role 02 on the
 * tax data document); one we issued, by us as its issuer. TODO(backend): `tdd.reporter_role` to
 * confirm it, DOCUMENTS.md row 3.28.
 */
export function reportsAsReceiver(item: Pick<ArchiveItemDto, 'direction'>): boolean {
  return item.direction === 'RECEIVED'
}

/**
 * The page's rows are the whole answer only when the server did the narrowing. The legal-hold
 * tab, a debit or prepayment kind, and any sort other than "as filed" work on this page alone.
 * TODO(backend): server-side legal-hold filter, sort and name search, DOCUMENTS.md rows 3.21 to 3.23.
 */
export function narrowedOnPage(tab: ArchiveTabId, typeCode: string | null): boolean {
  return tab === 'legalHold' || Boolean(typeCode)
}

export type BadgeTone = 'blue' | 'green' | 'red' | 'grey' | 'amber'

/**
 * The signed XML's badge ("Signed PINT-OM"), from `signature_valid` alone: a failed check says
 * failed, and no check says it is not confirmed, in the same shape and a neutral tone.
 * TODO(backend): `signature_valid` on the item, DOCUMENTS.md rows 3.9 and 3.24.
 */
export function signatureBadge(item: ArchiveItemDto): { key: string; tone: BadgeTone } {
  if (item.signature_valid === true) return { key: 'documents.detail.badge.signed', tone: 'blue' }
  if (item.signature_valid === false)
    return { key: 'documents.detail.badge.signatureFailed', tone: 'red' }
  return { key: 'documents.detail.badge.signatureUnconfirmed', tone: 'grey' }
}

/**
 * The PDF's badge ("EN & AR"), from the languages the archive says it holds. A supplier's PDF is
 * theirs, so nothing is assumed. TODO(backend): `languages` on the PDF artefact, DOCUMENTS.md row 3.20.
 */
export function pdfBadge(item: ArchiveItemDto): {
  key: string
  values?: Record<string, string>
  tone: BadgeTone
} {
  const languages = (item.artefacts.pdf?.languages ?? []).map((code) => code.toLowerCase())
  if (languages.includes('en') && languages.includes('ar'))
    return { key: 'documents.detail.badge.enAr', tone: 'red' }
  if (languages.length > 0)
    return {
      key: 'documents.detail.badge.language',
      values: { languages: languages.map((code) => code.toUpperCase()).join(' & ') },
      tone: 'red',
    }
  return { key: 'documents.detail.badge.languagesUnconfirmed', tone: 'grey' }
}

/**
 * The "Validation" line on the sheet. "All five layers passed" is said only when the archive
 * reports every layer passing; a failed layer or a failed report says so; otherwise it is not
 * confirmed. TODO(backend): `validation` on the item, DOCUMENTS.md row 3.19.
 */
export function validationLine(item: ArchiveItemDto): {
  key: string
  values?: Record<string, number>
  tone: 'green' | 'red' | 'grey'
} {
  const validation = item.validation
  if (validation && validation.total > 0) {
    if (validation.passed >= validation.total)
      return validation.total === 5
        ? { key: 'documents.detail.allFiveLayers', tone: 'green' }
        : { key: 'documents.detail.allLayers', values: { total: validation.total }, tone: 'green' }
    return {
      key: 'documents.detail.someLayers',
      values: { passed: validation.passed, total: validation.total },
      tone: 'red',
    }
  }
  const status = item.tdd.status
  if (status === 'REJECTED' || status === 'GENERATION_FAILED' || status === 'DEAD_LETTERED')
    return { key: `documents.tdd.${status}`, tone: 'red' }
  return { key: 'documents.detail.validationUnconfirmed', tone: 'grey' }
}

/** The format tags beside a record ("XML TDD PDF QR MLS"); the delivery receipt reads as MDN. */
export const FORMAT_TAG: Record<ArtefactId, string> = {
  xml: 'XML',
  tdd: 'TDD',
  pdf: 'PDF',
  qr: 'QR',
  mls: 'MLS',
  delivery_notification: 'MDN',
}

/** Only what the archive says it holds, in the record's reading order. */
export function heldArtefacts(
  item: ArchiveItemDto,
): (ArtefactRow & { bytes: number | null; verified: boolean | null })[] {
  return artefactRows(item.artefacts)
    .filter((row) => row.available)
    .map((row) => ({
      ...row,
      bytes: item.artefacts[row.id]?.byte_size ?? null,
      verified: item.artefacts[row.id]?.verified ?? null,
    }))
}

/**
 * The name saved when the server names none. A server with backend #824 names each rendition in
 * Content-Disposition by one rule (A-7b), and that name wins (saveDownload). These follow the
 * same rule, unsafe characters as "_", so a numbered document saves alike from either server; an
 * unnumbered one differs, as the server names it by a submission id this page never reads.
 */
export function artefactFileName(rawNumber: string, id: ArtefactId): string | null {
  const number = rawNumber.replace(/[^A-Za-z0-9._-]/g, '_')
  switch (id) {
    case 'xml':
      return `${number}.xml`
    case 'tdd':
      return `${number}-tdd.xml`
    case 'pdf':
      return `${number}.pdf`
    case 'qr':
      return `${number}-qr.png`
    default:
      return null
  }
}

/** The sum of the sizes the archive gave, or null when any is missing (never a partial figure). */
export function recordBytes(item: ArchiveItemDto): number | null {
  const held = heldArtefacts(item)
  if (held.length === 0 || held.some((row) => row.bytes == null)) return null
  return held.reduce((sum, row) => sum + (row.bytes ?? 0), 0)
}

/** `18 KB`, `4.1 MB`, `2.8 GB`. */
export function formatBytes(bytes: number): string {
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/** Whole years and months from `today` to `until` (both `YYYY-MM-DD`); null once it has passed. */
export function timeLeft(until: string, today: string): { years: number; months: number } | null {
  const [uy, um, ud] = until.split('-').map(Number)
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number)
  let months = (uy - ty) * 12 + (um - tm)
  if (ud < td) months -= 1
  if (months < 0) return null
  return { years: Math.floor(months / 12), months: months % 12 }
}

export type ChipTone = 'green' | 'red' | 'amber' | 'grey' | 'blue'

/** The row's status chip: a legal hold says so first, then how the tax document fared. */
export function statusChip(item: ArchiveItemDto): { key: string; tone: ChipTone } {
  if (item.retention.legal_hold.held) return { key: 'documents.chip.legalHold', tone: 'amber' }
  const status = item.tdd.status
  if (!status) return { key: 'documents.chip.none', tone: 'grey' }
  const tone: ChipTone =
    status === 'ACCEPTED'
      ? 'green'
      : status === 'REJECTED' || status === 'GENERATION_FAILED' || status === 'DEAD_LETTERED'
        ? 'red'
        : status === 'PENDING' || status === 'SUBMITTED' || status === 'DELIVERED_UNCONFIRMED'
          ? 'blue'
          : 'grey'
  return { key: tddStatusKey(status, 'chip'), tone }
}

/** The retention class in the list's short words ("10 years", "15 years · property"). */
export function retentionShortKey(retentionClass: string): string {
  return retentionClass === 'REAL_ESTATE'
    ? 'documents.keptShort.REAL_ESTATE'
    : 'documents.keptShort.STANDARD'
}

/** Who the other side is, by name where the archive gives one. */
export function counterpartyLabel(item: ArchiveItemDto): string | null {
  return item.counterparty_name?.trim() || counterpartyValue(item.counterparty)
}

/** The chip's colours, shared by the list and the record page. */
export const CHIP_TONE: Record<ChipTone, { bg: string; fg: string; dot: string }> = {
  green: { bg: 'bg-success-100', fg: 'text-[#3d5648]', dot: 'bg-[#3d5648]' },
  red: { bg: 'bg-warning-100', fg: 'text-warning-700', dot: 'bg-warning-700' },
  amber: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  blue: { bg: 'bg-primary-50', fg: 'text-primary-700', dot: 'bg-primary-700' },
  grey: { bg: 'bg-surface-background', fg: 'text-text-tertiary', dot: 'bg-text-quaternary' },
}
