/**
 * Order forms (Figma 68:38578).
 *
 * An order form is dual-natured: the same screen lists sales orders (customers ordering from
 * you) and purchase orders (you ordering from suppliers). The fulfilment column is a stacked
 * bar over a 225px track, and every row ends in the single next action that moves it forward.
 */

export type OrderMode = 'all' | 'sales' | 'purchase'
export type OrderDirection = 'sales' | 'purchase'
export type PartyKind = 'customer' | 'supplier'

export type OrderStatus =
  | 'readyToInvoice'
  | 'awaitingSupplierBill'
  | 'inProgress'
  | 'partReceived'
  | 'deliveryOverdue'
  | 'ordered'
  | 'completed'

/** Bar fills: what has been invoiced, what is delivered but unbilled, what the supplier billed. */
export type BarTone = 'invoiced' | 'delivered' | 'supplierBilled'

/** Widths are the Figma pixel widths over a 225px track; later segments paint over earlier. */
export type BarSegment = { width: number; tone: BarTone }

export type FulfilmentNote =
  | { kind: 'amount'; amount: string; labelKey: string; tone: BarTone }
  | { kind: 'text'; labelKey: string }
  | { kind: 'done'; labelKey: string }

export type NextStep =
  | { kind: 'invoice' | 'selfbill' | 'deliver' | 'receipt'; labelKey: string }
  | { kind: 'link'; labelKey: string; target: string }

export type OrderRow = {
  id: string
  direction: OrderDirection
  /** "From QUO-0117", "Manual", "SAP · PO-44018" — where the order came from. */
  sourceKey: string
  party: string
  partyKind: PartyKind
  due: string
  dueNoteKey: string
  dueOverdue?: boolean
  value: string
  valueNoteKey: string
  segments: BarSegment[]
  note: FulfilmentNote
  status: OrderStatus
  action: NextStep
}

export const BAR_TRACK = 225

export const ORDER_MODES: { id: OrderMode; titleKey: string; hintKey: string; count: number }[] = [
  { id: 'all', titleKey: 'orderForms.mode.all', hintKey: 'orderForms.mode.allHint', count: 34 },
  {
    id: 'sales',
    titleKey: 'orderForms.mode.sales',
    hintKey: 'orderForms.mode.salesHint',
    count: 21,
  },
  {
    id: 'purchase',
    titleKey: 'orderForms.mode.purchase',
    hintKey: 'orderForms.mode.purchaseHint',
    count: 13,
  },
]

/** Two KPI cards carry a split legend, two carry a call-to-action link. */
export const ORDER_KPI = [
  {
    id: 'open',
    icon: 'open' as const,
    disc: 'bg-[#f4f6fb]',
    titleKey: 'orderForms.kpi.open',
    amount: '46,880.000',
    legend: [
      { labelKey: 'orderForms.kpi.openSales', tone: 'invoiced' as BarTone },
      { labelKey: 'orderForms.kpi.openPurchase', tone: 'supplierBilled' as BarTone },
    ],
  },
  {
    id: 'transit',
    icon: 'transit' as const,
    disc: 'bg-[#f4f6fb]',
    titleKey: 'orderForms.kpi.transit',
    amount: '26,610.000',
    legend: [
      { labelKey: 'orderForms.kpi.transitDeliver', tone: 'invoiced' as BarTone },
      { labelKey: 'orderForms.kpi.transitReceive', tone: 'supplierBilled' as BarTone },
    ],
  },
  {
    id: 'delivered',
    icon: 'delivered' as const,
    disc: 'bg-[#f7f1e6]',
    titleKey: 'orderForms.kpi.delivered',
    amount: '7,918.000',
    link: { labelKey: 'orderForms.kpi.deliveredLink', to: '/trade-documents/order-forms' },
  },
  {
    id: 'received',
    icon: 'received' as const,
    disc: 'bg-[#f7f1e6]',
    titleKey: 'orderForms.kpi.received',
    amount: '3,842.000',
    link: { labelKey: 'orderForms.kpi.receivedLink', to: '/trade-documents/order-forms' },
  },
]

export type OrderTabId =
  'all' | 'draft' | 'open' | 'overdue' | 'readyToInvoice' | 'awaitingSupplierBill' | 'completed'

export const ORDER_TABS: { id: OrderTabId; labelKey: string; count: number; danger?: boolean }[] = [
  { id: 'all', labelKey: 'orderForms.tabs.all', count: 32 },
  { id: 'draft', labelKey: 'orderForms.tabs.draft', count: 4 },
  { id: 'open', labelKey: 'orderForms.tabs.open', count: 6 },
  { id: 'overdue', labelKey: 'orderForms.tabs.overdue', count: 1, danger: true },
  { id: 'readyToInvoice', labelKey: 'orderForms.tabs.readyToInvoice', count: 9 },
  { id: 'awaitingSupplierBill', labelKey: 'orderForms.tabs.awaitingSupplierBill', count: 9 },
  { id: 'completed', labelKey: 'orderForms.tabs.completed', count: 9 },
]

export const ORDER_ROWS: OrderRow[] = [
  {
    id: 'SO-0074',
    direction: 'sales',
    sourceKey: 'orderForms.source.fromQuote0117',
    party: 'Sohar Grand Mall',
    partyKind: 'customer',
    due: '02 Aug 2026',
    dueNoteKey: 'orderForms.due.deliveredInFull',
    value: '12,900.000',
    valueNoteKey: 'orderForms.value.nothingBilledYet',
    segments: [{ width: 225, tone: 'delivered' }],
    note: {
      kind: 'amount',
      amount: '12,900.000',
      labelKey: 'orderForms.note.toInvoice',
      tone: 'delivered',
    },
    status: 'readyToInvoice',
    action: { kind: 'invoice', labelKey: 'orderForms.action.issueInvoice' },
  },
  {
    id: 'PO-0031',
    direction: 'purchase',
    sourceKey: 'orderForms.source.fromTheirQuote',
    party: 'Muscat Roastery Co',
    partyKind: 'supplier',
    due: '28 Jul 2026',
    dueNoteKey: 'orderForms.due.receivedInFull',
    value: '1,240.000',
    valueNoteKey: 'orderForms.value.noSupplierBill',
    segments: [{ width: 133, tone: 'delivered' }],
    note: {
      kind: 'amount',
      amount: '2,460.000',
      labelKey: 'orderForms.note.unbilled',
      tone: 'delivered',
    },
    status: 'awaitingSupplierBill',
    action: { kind: 'selfbill', labelKey: 'orderForms.action.selfBillSupplier' },
  },
  {
    id: 'SO-0073',
    direction: 'sales',
    sourceKey: 'orderForms.source.manual',
    party: 'Nizwa Souq Café',
    partyKind: 'customer',
    due: 'Weekly',
    dueNoteKey: 'orderForms.due.nextDrop',
    value: '1,240.000',
    valueNoteKey: 'orderForms.value.invoiced496',
    /** Blue paints over the tan: 74 invoiced inside 129 delivered. */
    segments: [
      { width: 129, tone: 'delivered' },
      { width: 74, tone: 'invoiced' },
    ],
    note: {
      kind: 'amount',
      amount: '248.000',
      labelKey: 'orderForms.note.toInvoice',
      tone: 'delivered',
    },
    status: 'inProgress',
    action: { kind: 'deliver', labelKey: 'orderForms.action.logDelivery' },
  },
  {
    id: 'PO-0029',
    direction: 'purchase',
    sourceKey: 'orderForms.source.manual',
    party: 'Al Noor Dates LLC',
    partyKind: 'supplier',
    due: '06 Aug 2026',
    dueNoteKey: 'orderForms.due.halfReceived',
    value: '4,180.000',
    valueNoteKey: 'orderForms.value.billed2090',
    segments: [{ width: 133, tone: 'supplierBilled' }],
    note: {
      kind: 'amount',
      amount: '2,090.000',
      labelKey: 'orderForms.note.stillToReceive',
      tone: 'supplierBilled',
    },
    status: 'partReceived',
    action: { kind: 'receipt', labelKey: 'orderForms.action.recordReceipt' },
  },
  {
    id: 'SO-0071',
    direction: 'sales',
    sourceKey: 'orderForms.source.sapPo44018',
    party: 'Salalah Beach Resort',
    partyKind: 'customer',
    due: '21 Jul 2026',
    dueNoteKey: 'orderForms.due.overdue9',
    dueOverdue: true,
    value: '4,610.000',
    valueNoteKey: 'orderForms.value.nothingInvoiced',
    segments: [{ width: 78, tone: 'delivered' }],
    note: {
      kind: 'amount',
      amount: '3,227.000',
      labelKey: 'orderForms.note.stillToShip',
      tone: 'delivered',
    },
    status: 'deliveryOverdue',
    action: { kind: 'deliver', labelKey: 'orderForms.action.logDelivery' },
  },
  {
    id: 'PO-0028',
    direction: 'purchase',
    sourceKey: 'orderForms.source.fromTheirQuote',
    party: 'Sohar Packaging LLC',
    partyKind: 'supplier',
    due: '11 Aug 2026',
    dueNoteKey: 'orderForms.due.in12Days',
    value: '3,140.000',
    valueNoteKey: 'orderForms.value.nothingBilled',
    segments: [],
    note: { kind: 'text', labelKey: 'orderForms.note.nothingReceivedYet' },
    status: 'ordered',
    action: { kind: 'receipt', labelKey: 'orderForms.action.recordReceipt' },
  },
  {
    id: 'SO-0068',
    direction: 'sales',
    sourceKey: 'orderForms.source.fromQuote0110',
    party: 'Bahla Fort Restaurant',
    partyKind: 'customer',
    due: '11 Aug 2026',
    dueNoteKey: 'orderForms.due.in12Days',
    value: '3,940.000',
    valueNoteKey: 'orderForms.value.fullyInvoiced',
    segments: [{ width: 225, tone: 'invoiced' }],
    note: { kind: 'done', labelKey: 'orderForms.note.deliveredAndBilled' },
    status: 'completed',
    action: { kind: 'link', labelKey: 'orderForms.action.viewInvoice', target: 'INV-2038' },
  },
]

export const ORDER_PAGE_NUMBERS = ['1', '2', '3', '4', '...', '20']
