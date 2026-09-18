import type { ArchiveArtefacts, ArchiveItemDto } from '../api/compliance/archive'

/**
 * The compliance archive as the screen reads it (E-07, decisions of 2026-09-18).
 *
 * The archive is a read model: it says which artefacts exist and where each is served, and it
 * stores nothing itself. So the page offers a download only where the API gives an address, shows
 * a legal hold without offering to set one, and draws no integrity tick, no sharing and no ZIP —
 * none of which has a route behind it.
 */

export type ArtefactId = 'xml' | 'tdd' | 'pdf' | 'qr' | 'mls' | 'delivery_notification'

export const ARTEFACT_ORDER: ArtefactId[] = ['xml', 'tdd', 'pdf', 'qr', 'mls', 'delivery_notification']

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
export function frozenNote(item: ArchiveItemDto): { key: string; values?: Record<string, string> } | null {
  const { legal_hold: hold, under_retention: underRetention, retain_until: retainUntil } = item.retention
  if (hold.held) return { key: 'documents.frozen.legalHold' }
  if (underRetention && retainUntil) return { key: 'documents.frozen.retention', values: { date: retainUntil } }
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
export const DOCUMENT_KINDS = ['STANDARD_INVOICE', 'CREDIT_NOTE', 'SELF_BILLING_INVOICE', 'SELF_BILLING_CREDIT_NOTE'] as const

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
export function showingNote(count: number, page: number, pageSize: number): { count: number; from: number; to: number } {
  const from = count === 0 ? 0 : page * pageSize + 1
  return { count, from, to: page * pageSize + count }
}
