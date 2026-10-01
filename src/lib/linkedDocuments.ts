/**
 * Documents an invoice can settle (Figma 69:45681, section 4).
 *
 * Kept out of the component file so the constants can be shared without breaking fast refresh.
 * Which documents the picker offers is worked out from the trade documents themselves, for the
 * invoice's customer only (`linkableDocsFor` in `tradeConvert.ts`).
 */

export type LinkedDocKind = 'delivery' | 'order'

export type LinkedDoc = {
  id: string
  kind: LinkedDocKind
  titleKey: string
  titleValues?: Record<string, string | number>
  metaKey: string
  metaValues?: Record<string, string | number>
  chipKey: string
  chipTone: 'pending' | 'progress' | 'closed'
  /** The customer the document belongs to: only their own documents can be linked. */
  customerId?: string | null
}

/* ------------------------------------------------ picker (Figma 69:45570) */

export type LinkFilterId = 'all' | 'notInvoiced' | 'deliveryNotes' | 'orderForms'

/** The filter chips; each count is the number of documents the chip shows. */
export const LINK_FILTERS: { id: LinkFilterId; labelKey: string }[] = [
  { id: 'all', labelKey: 'linkModal.filters.all' },
  { id: 'notInvoiced', labelKey: 'linkModal.filters.notInvoiced' },
  { id: 'deliveryNotes', labelKey: 'linkModal.filters.deliveryNotes' },
  { id: 'orderForms', labelKey: 'linkModal.filters.orderForms' },
]

export function inLinkFilter(docs: LinkedDoc[], filter: LinkFilterId): LinkedDoc[] {
  if (filter === 'all') return docs
  if (filter === 'notInvoiced') return docs.filter((doc) => doc.chipTone === 'pending')
  if (filter === 'deliveryNotes') return docs.filter((doc) => doc.kind === 'delivery')
  return docs.filter((doc) => doc.kind === 'order')
}
