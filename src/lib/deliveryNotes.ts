/**
 * Delivery notes management (Figma 13:38570).
 *
 * A delivery note is proof that goods changed hands — quantities only, never prices.
 * Like order forms it is dual-natured: a *sales* delivery is what you sent a customer,
 * a *purchase* receipt (GRN) is what a supplier sent you.
 */

export type DeliveryDirection = 'sales' | 'purchase'

export type DeliveryMode = 'all' | 'sales' | 'purchase'

export type DeliveryTabId =
  | 'all'
  | 'draft'
  | 'open'
  | 'overdue'
  | 'readyToInvoice'
  | 'awaitingSupplierBill'
  | 'completed'

export type DeliveryStatus =
  | 'readyToInvoice'
  | 'awaitingSupplierBill'
  | 'inProgress'
  | 'partReceived'
  | 'deliveryOverdue'
  | 'inTransit'
  | 'completed'

export type DeliveryRow = {
  id: string
  direction: DeliveryDirection
  /** What the note was raised against — an order, or "Standalone". */
  against: string
  party: string
  partyRole: 'customer' | 'supplier'
  date: string
  dateNote: string
  dateTone: 'normal' | 'danger'
  lines: string
  quantities: string
  /** Red when the delivery came up short. */
  quantitiesTone: 'normal' | 'danger'
  proof: string
  proofNote: string
  proofTone: 'normal' | 'danger'
  status: DeliveryStatus
  action?: { labelKey: string; variant: 'primary' | 'slate' | 'outline' | 'link'; icon?: boolean }
}

export const DELIVERY_MODES: { id: DeliveryMode; titleKey: string; hintKey: string; count: string }[] =
  [
    {
      id: 'all',
      titleKey: 'deliveryNotes.mode.all',
      hintKey: 'deliveryNotes.mode.allHint',
      count: '48',
    },
    {
      id: 'sales',
      titleKey: 'deliveryNotes.mode.sales',
      hintKey: 'deliveryNotes.mode.salesHint',
      count: '31',
    },
    {
      id: 'purchase',
      titleKey: 'deliveryNotes.mode.purchase',
      hintKey: 'deliveryNotes.mode.purchaseHint',
      count: '13',
    },
  ]

export const DELIVERY_KPI: {
  id: string
  icon: 'transit' | 'orders' | 'delivered' | 'received'
  titleKey: string
  count: string
  /** The first card splits its count by direction, two others offer a next step. */
  split?: { outKey: string; inKey: string }
  metaKey?: string
  link?: string
}[] = [
  {
    id: 'moving',
    icon: 'transit',
    titleKey: 'deliveryNotes.kpi.onTheMove',
    count: '6',
    split: { outKey: 'deliveryNotes.kpi.movingOut', inKey: 'deliveryNotes.kpi.movingIn' },
  },
  {
    id: 'unsigned',
    icon: 'orders',
    titleKey: 'deliveryNotes.kpi.noProof',
    count: '3',
    metaKey: 'deliveryNotes.kpi.noProofMeta',
    link: 'deliveryNotes.kpi.chaseSignatures',
  },
  {
    id: 'uninvoiced',
    icon: 'delivered',
    titleKey: 'deliveryNotes.kpi.deliveredNotInvoiced',
    count: '9',
    metaKey: 'deliveryNotes.kpi.deliveredNotInvoicedMeta',
    link: 'deliveryNotes.kpi.review',
  },
  {
    id: 'short',
    icon: 'received',
    titleKey: 'deliveryNotes.kpi.shortDeliveries',
    count: '2',
    metaKey: 'deliveryNotes.kpi.shortDeliveriesMeta',
  },
]

export const DELIVERY_TABS: { id: DeliveryTabId; labelKey: string; count: string; tone?: 'danger' }[] =
  [
    { id: 'all', labelKey: 'deliveryNotes.tabs.all', count: '32' },
    { id: 'draft', labelKey: 'deliveryNotes.tabs.draft', count: '4' },
    { id: 'open', labelKey: 'deliveryNotes.tabs.open', count: '6' },
    { id: 'overdue', labelKey: 'deliveryNotes.tabs.overdue', count: '1', tone: 'danger' },
    { id: 'readyToInvoice', labelKey: 'deliveryNotes.tabs.readyToInvoice', count: '9' },
    {
      id: 'awaitingSupplierBill',
      labelKey: 'deliveryNotes.tabs.awaitingSupplierBill',
      count: '9',
    },
    { id: 'completed', labelKey: 'deliveryNotes.tabs.completed', count: '9' },
  ]

export const DELIVERY_ROWS: DeliveryRow[] = [
  {
    id: 'DN-0124',
    direction: 'sales',
    against: 'vs SO-0073',
    party: 'Nizwa Souq Café',
    partyRole: 'customer',
    date: '27 Jul 2026',
    dateNote: 'Delivered 09:20',
    dateTone: 'normal',
    lines: '3 lines',
    quantities: '24 KG · 18 EA · 3 EA',
    quantitiesTone: 'normal',
    proof: 'Khalid Al Rashid',
    proofNote: 'Signed on device',
    proofTone: 'normal',
    status: 'readyToInvoice',
    action: { labelKey: 'deliveryNotes.action.issueInvoice', variant: 'primary', icon: true },
  },
  {
    id: 'GRN-0087',
    direction: 'purchase',
    against: 'vs PO-0031',
    party: 'Muscat Roastery Co',
    partyRole: 'supplier',
    date: '28 Jul 2026',
    dateNote: 'Received 07:45',
    dateTone: 'normal',
    lines: '2 lines',
    quantities: '240 KG · 60 EA',
    quantitiesTone: 'normal',
    proof: 'Yusuf',
    proofNote: 'Checked in Main store',
    proofTone: 'normal',
    status: 'awaitingSupplierBill',
    action: { labelKey: 'deliveryNotes.action.selfBillSupplier', variant: 'slate' },
  },
  {
    id: 'DN-0131',
    direction: 'sales',
    against: 'vs SO-0071',
    party: 'Salalah Beach Resort',
    partyRole: 'customer',
    date: '30 Jul 2026',
    dateNote: 'Left depot 06:10',
    dateTone: 'normal',
    lines: '4 lines',
    quantities: '180 KG · 40 EA · 12 EA · 6 EA',
    quantitiesTone: 'normal',
    proof: 'Not yet delivered',
    proofNote: 'Driver Salim',
    proofTone: 'normal',
    status: 'inProgress',
    action: { labelKey: 'deliveryNotes.action.logDelivery', variant: 'outline' },
  },
  {
    id: 'GRN-0085',
    direction: 'purchase',
    against: 'vs PO-0029',
    party: 'Al Noor Dates LLC',
    partyRole: 'supplier',
    date: '26 Jul 2026',
    dateNote: 'Received 11:30',
    dateTone: 'normal',
    lines: '2 lines',
    quantities: '18 of 21 boxes · 3 short',
    quantitiesTone: 'danger',
    proof: 'Short by 3 boxes',
    proofNote: 'Noted by Yusuf · photo attached',
    proofTone: 'danger',
    status: 'partReceived',
    action: { labelKey: 'deliveryNotes.action.recordReceipt', variant: 'outline' },
  },
  {
    id: 'DN-0119',
    direction: 'sales',
    against: 'Standalone',
    party: 'Al Mouj Marina Café',
    partyRole: 'customer',
    date: '25 Jul 2026',
    dateNote: 'Unsigned for 5 days',
    dateTone: 'danger',
    lines: '1 line',
    quantities: '40 KG',
    quantitiesTone: 'normal',
    proof: 'Nobody signed',
    proofNote: 'Left at reception',
    proofTone: 'normal',
    status: 'deliveryOverdue',
    action: { labelKey: 'deliveryNotes.action.chaseSignature', variant: 'outline' },
  },
  {
    id: 'DN-0112',
    direction: 'sales',
    against: 'vs SO-0068',
    party: 'Bahla Fort Restaurant',
    partyRole: 'customer',
    date: '18 Jul 2026',
    dateNote: 'Delivered 08:05',
    dateTone: 'normal',
    lines: '3 lines',
    quantities: '120 KG · 30 EA · 8 EA',
    quantitiesTone: 'normal',
    proof: 'Photo at door',
    proofNote: 'Signed by Ahmed · 18 Jul',
    proofTone: 'normal',
    status: 'completed',
    action: { labelKey: 'deliveryNotes.action.viewInvoice', variant: 'link' },
  },
  {
    id: 'GRN-0089',
    direction: 'purchase',
    against: 'vs PO-0028',
    party: 'Sohar Packaging LLC',
    partyRole: 'supplier',
    date: '30 Jul 2026',
    dateNote: 'Expected today',
    dateTone: 'normal',
    lines: '2 lines',
    quantities: 'expected 60 EA · 20 EA',
    quantitiesTone: 'normal',
    proof: 'Not arrived',
    proofNote: 'Awaiting the van',
    proofTone: 'normal',
    status: 'inTransit',
    action: { labelKey: 'deliveryNotes.action.recordReceipt', variant: 'outline' },
  },
]

export const DELIVERY_PAGE_NUMBERS = ['1', '2', '3', '4', '...', '20']
