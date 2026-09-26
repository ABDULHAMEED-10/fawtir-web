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
] as const

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
  | 'selfBilledInvoice'
  | 'selfBilledCredit'

export function recordKind(item: Pick<ArchiveItemDto, 'document_kind' | 'direction'>): RecordKind {
  const received = item.direction === 'RECEIVED'
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

/** "INV-2038.xml", "INV-2038-TDD.xml": the name a person would give each file. */
export function artefactFileName(number: string, id: ArtefactId): string | null {
  switch (id) {
    case 'xml':
      return `${number}.xml`
    case 'tdd':
      return `${number}-TDD.xml`
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
  return { key: `documents.chip.${status}`, tone }
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
