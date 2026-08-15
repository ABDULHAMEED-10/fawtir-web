/**
 * Documents an invoice can settle (Figma 69:45681, section 4).
 *
 * Kept out of the component file so the constants can be shared without breaking fast refresh.
 */

export type LinkedDocKind = 'delivery' | 'order'

export type LinkedDoc = {
  id: string
  kind: LinkedDocKind
  titleKey: string
  metaKey: string
  chipKey: string
  chipTone: 'pending' | 'progress' | 'closed'
}

export const DEFAULT_LINKED_DOCS: LinkedDoc[] = [
  {
    id: 'DN-0124',
    kind: 'delivery',
    titleKey: 'createInvoice.linked.dn0124',
    metaKey: 'createInvoice.linked.dn0124Meta',
    chipKey: 'createInvoice.linked.notInvoiced',
    chipTone: 'pending',
  },
  {
    id: 'SO-0073',
    kind: 'order',
    titleKey: 'createInvoice.linked.so0073',
    metaKey: 'createInvoice.linked.so0073Meta',
    chipKey: 'createInvoice.linked.inProgress',
    chipTone: 'progress',
  },
]

/* ------------------------------------------------ picker (Figma 69:45570) */

export type LinkFilterId = 'all' | 'notInvoiced' | 'deliveryNotes' | 'orderForms'

export const LINK_FILTERS: { id: LinkFilterId; labelKey: string; count: number }[] = [
  { id: 'all', labelKey: 'linkModal.filters.all', count: 14 },
  { id: 'notInvoiced', labelKey: 'linkModal.filters.notInvoiced', count: 3 },
  { id: 'deliveryNotes', labelKey: 'linkModal.filters.deliveryNotes', count: 5 },
  { id: 'orderForms', labelKey: 'linkModal.filters.orderForms', count: 2 },
]

/** A group label is printed above the first row of each run, as in the design. */
export type PickerDoc = LinkedDoc & {
  groupLabelKey?: string
  chipTone: 'pending' | 'progress' | 'closed'
}

export const LINK_PICKER_DOCS: PickerDoc[] = [
  {
    id: 'DN-0124',
    kind: 'delivery',
    groupLabelKey: 'linkModal.groups.deliveredNotInvoiced',
    titleKey: 'createInvoice.linked.dn0124',
    metaKey: 'createInvoice.linked.dn0124Meta',
    chipKey: 'createInvoice.linked.notInvoiced',
    chipTone: 'pending',
  },
  {
    id: 'DN-0131',
    kind: 'delivery',
    titleKey: 'linkModal.docs.dn0131',
    metaKey: 'linkModal.docs.dn0131Meta',
    chipKey: 'createInvoice.linked.notInvoiced',
    chipTone: 'pending',
  },
  {
    id: 'SO-0073',
    kind: 'order',
    groupLabelKey: 'linkModal.groups.deliveredNotInvoiced',
    titleKey: 'createInvoice.linked.so0073',
    metaKey: 'createInvoice.linked.so0073Meta',
    chipKey: 'createInvoice.linked.inProgress',
    chipTone: 'progress',
  },
  {
    id: 'DN-0131-closed',
    kind: 'order',
    titleKey: 'linkModal.docs.dn0131',
    metaKey: 'linkModal.docs.dn0131Meta',
    chipKey: 'linkModal.closed',
    chipTone: 'closed',
  },
]
