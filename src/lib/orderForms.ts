/**
 * Order forms (Figma 68:38578).
 *
 * An order form is dual-natured: the same screen lists sales orders (customers ordering from
 * you) and purchase orders (you ordering from suppliers). The fulfilment column is a stacked
 * bar over a 225px track, and every row ends in the single next action that moves it forward.
 *
 * There is no trade-documents API yet: these rows are the page's own data (TRADE_DOCUMENTS.md
 * row T.1). SO-0073's figures are read from the quantity ledger (`tradeLedger.ts`).
 */

import { orderProgress, rials } from './tradeLedger'

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
  /**
   * The counterparty's record: a customer id for a sales order; for a purchase order the supplier
   * as a self-billing counterparty, which trade documents do not carry yet (null).
   * TODO(backend): TRADE_DOCUMENTS.md row T.18.
   */
  counterpartyId: string | null
  /** "From QUO-0117", "Manual", "SAP · PO-44018" — where the order came from. */
  sourceKey: string
  party: string
  partyKind: PartyKind
  due: string
  dueNoteKey: string
  dueOverdue?: boolean
  value: string
  valueNoteKey: string
  valueNoteValues?: Record<string, string>
  /** Net figures (rials) the KPI cards add up: moved and not billed, and still to move. */
  movedNotBilled: number
  stillToMove: number
  segments: BarSegment[]
  note: FulfilmentNote
  status: OrderStatus
  action: NextStep
}

export const BAR_TRACK = 225

export const ORDER_MODES: { id: OrderMode; titleKey: string; hintKey: string }[] = [
  { id: 'all', titleKey: 'orderForms.mode.all', hintKey: 'orderForms.mode.allHint' },
  { id: 'sales', titleKey: 'orderForms.mode.sales', hintKey: 'orderForms.mode.salesHint' },
  {
    id: 'purchase',
    titleKey: 'orderForms.mode.purchase',
    hintKey: 'orderForms.mode.purchaseHint',
  },
]

export type OrderTabId =
  | 'all'
  | 'draft'
  | 'open'
  | 'overdue'
  | 'readyToInvoice'
  | 'awaitingSupplierBill'
  | 'completed'

export const ORDER_TABS: { id: OrderTabId; labelKey: string; danger?: boolean }[] = [
  { id: 'all', labelKey: 'orderForms.tabs.all' },
  { id: 'draft', labelKey: 'orderForms.tabs.draft' },
  { id: 'open', labelKey: 'orderForms.tabs.open' },
  { id: 'overdue', labelKey: 'orderForms.tabs.overdue', danger: true },
  { id: 'readyToInvoice', labelKey: 'orderForms.tabs.readyToInvoice' },
  { id: 'awaitingSupplierBill', labelKey: 'orderForms.tabs.awaitingSupplierBill' },
  { id: 'completed', labelKey: 'orderForms.tabs.completed' },
]

/** Which tab each status sits in. Drafts are not stored yet, so "Draft" is empty. */
const TAB_OF: Record<OrderStatus, OrderTabId> = {
  readyToInvoice: 'readyToInvoice',
  awaitingSupplierBill: 'awaitingSupplierBill',
  inProgress: 'open',
  partReceived: 'open',
  ordered: 'open',
  deliveryOverdue: 'overdue',
  completed: 'completed',
}

export function inMode<T extends { direction: OrderDirection }>(rows: T[], mode: OrderMode): T[] {
  return mode === 'all' ? rows : rows.filter((row) => row.direction === mode)
}

export function inOrderTab<T extends { status: OrderStatus }>(rows: T[], tab: OrderTabId): T[] {
  return tab === 'all' ? rows : rows.filter((row) => TAB_OF[row.status] === tab)
}

const money = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const valueOf = (row: OrderRow) => Number(row.value.replace(/,/g, ''))

/**
 * The four cards, added up from the rows so they can never disagree with the table (the design
 * typed 46,880.000 open against rows worth far less, and "Invoice 4 orders" beside three).
 * TODO(backend): TRADE_DOCUMENTS.md row T.7 (a summary over every order, not one page).
 */
export function orderKpis(rows: OrderRow[]) {
  const open = rows.filter((row) => row.status !== 'completed')
  const add = (list: OrderRow[], pick: (row: OrderRow) => number) =>
    list.reduce((total, row) => total + pick(row), 0)
  const sales = open.filter((row) => row.direction === 'sales')
  const purchase = open.filter((row) => row.direction === 'purchase')
  const toInvoice = rows.filter((row) => row.direction === 'sales' && row.movedNotBilled > 0)
  const toReview = rows.filter((row) => row.direction === 'purchase' && row.movedNotBilled > 0)
  return [
    {
      id: 'open',
      icon: 'open' as const,
      disc: 'bg-[#f4f6fb]',
      titleKey: 'orderForms.kpi.open',
      amount: money(add(open, valueOf)),
      legend: [
        {
          labelKey: 'orderForms.kpi.salesAmount',
          values: { amount: money(add(sales, valueOf)) },
          tone: 'invoiced' as BarTone,
        },
        {
          labelKey: 'orderForms.kpi.purchaseAmount',
          values: { amount: money(add(purchase, valueOf)) },
          tone: 'supplierBilled' as BarTone,
        },
      ],
      link: null,
    },
    {
      id: 'transit',
      icon: 'transit' as const,
      disc: 'bg-[#f4f6fb]',
      titleKey: 'orderForms.kpi.transit',
      amount: money(add(open, (row) => row.stillToMove)),
      legend: [
        {
          labelKey: 'orderForms.kpi.toDeliverAmount',
          values: { amount: money(add(sales, (row) => row.stillToMove)) },
          tone: 'invoiced' as BarTone,
        },
        {
          labelKey: 'orderForms.kpi.toReceiveAmount',
          values: { amount: money(add(purchase, (row) => row.stillToMove)) },
          tone: 'supplierBilled' as BarTone,
        },
      ],
      link: null,
    },
    {
      id: 'delivered',
      icon: 'delivered' as const,
      disc: 'bg-[#f7f1e6]',
      titleKey: 'orderForms.kpi.delivered',
      amount: money(add(toInvoice, (row) => row.movedNotBilled)),
      legend: null,
      link: {
        labelKey: 'orderForms.kpi.invoiceCount',
        values: { count: toInvoice.length },
        tab: 'readyToInvoice' as OrderTabId,
      },
    },
    {
      id: 'received',
      icon: 'received' as const,
      disc: 'bg-[#f7f1e6]',
      titleKey: 'orderForms.kpi.received',
      amount: money(add(toReview, (row) => row.movedNotBilled)),
      legend: null,
      link: {
        labelKey: 'orderForms.kpi.reviewCount',
        values: { count: toReview.length },
        tab: 'awaitingSupplierBill' as OrderTabId,
      },
    },
  ]
}

/** SO-0073's figures come from the one quantity ledger, never typed. */
const so0073 = orderProgress('SO-0073')!
const TRACK = 225

export const ORDER_ROWS: OrderRow[] = [
  {
    id: 'SO-0074',
    direction: 'sales',
    counterpartyId: 'c-sohar',
    sourceKey: 'orderForms.source.fromQuote0117',
    party: 'Sohar Grand Mall',
    partyKind: 'customer',
    due: '02 Aug 2026',
    dueNoteKey: 'orderForms.due.deliveredInFull',
    value: '12,900.000',
    valueNoteKey: 'orderForms.value.nothingBilledYet',
    movedNotBilled: 12900,
    stillToMove: 0,
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
    // The design numbered this row PO-0031, but PO-0031 is the order Muscat Roastery billed as
    // MR-INV-8821 (its detail, GRN-0087 and the Bills screens all say so). This row is another
    // of their orders, received and not billed yet.
    id: 'PO-0030',
    direction: 'purchase',
    counterpartyId: null,
    sourceKey: 'orderForms.source.fromTheirQuote',
    party: 'Muscat Roastery Co',
    partyKind: 'supplier',
    due: '28 Jul 2026',
    dueNoteKey: 'orderForms.due.receivedInFull',
    value: '1,240.000',
    valueNoteKey: 'orderForms.value.noSupplierBill',
    movedNotBilled: 1240,
    stillToMove: 0,
    // Received in full and nothing billed: the whole value is unbilled (the design showed
    // 2,460.000 unbilled on a 1,240.000 order, over a part-filled bar).
    segments: [{ width: 225, tone: 'delivered' }],
    note: {
      kind: 'amount',
      amount: '1,240.000',
      labelKey: 'orderForms.note.unbilled',
      tone: 'delivered',
    },
    status: 'awaitingSupplierBill',
    action: { kind: 'selfbill', labelKey: 'orderForms.action.selfBillSupplier' },
  },
  {
    id: 'SO-0073',
    direction: 'sales',
    counterpartyId: 'c-nizwa',
    sourceKey: 'orderForms.source.manual',
    party: 'Nizwa Souq Café',
    partyKind: 'customer',
    due: 'Weekly',
    dueNoteKey: 'orderForms.due.nextDrop',
    value: rials(so0073.net),
    valueNoteKey: 'orderForms.value.invoicedAmount',
    valueNoteValues: { amount: rials(so0073.invoicedValue) },
    movedNotBilled: so0073.deliveredNotInvoicedValue,
    stillToMove: so0073.toDeliverValue,
    /** Blue paints over the tan: invoiced inside delivered. */
    segments: [
      { width: (so0073.deliveredPct / 100) * TRACK, tone: 'delivered' },
      { width: (so0073.invoicedPct / 100) * TRACK, tone: 'invoiced' },
    ],
    note: {
      kind: 'amount',
      amount: rials(so0073.deliveredNotInvoicedValue),
      labelKey: 'orderForms.note.toInvoice',
      tone: 'delivered',
    },
    status: 'inProgress',
    action: { kind: 'deliver', labelKey: 'orderForms.action.logDelivery' },
  },
  {
    id: 'PO-0029',
    direction: 'purchase',
    counterpartyId: null,
    sourceKey: 'orderForms.source.manual',
    party: 'Al Noor Dates LLC',
    partyKind: 'supplier',
    due: '06 Aug 2026',
    dueNoteKey: 'orderForms.due.halfReceived',
    value: '4,180.000',
    valueNoteKey: 'orderForms.value.billed2090',
    movedNotBilled: 0,
    stillToMove: 2090,
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
    counterpartyId: 'c-salalah',
    sourceKey: 'orderForms.source.sapPo44018',
    party: 'Salalah Beach Resort',
    partyKind: 'customer',
    due: '21 Jul 2026',
    dueNoteKey: 'orderForms.due.overdue9',
    dueOverdue: true,
    value: '4,610.000',
    valueNoteKey: 'orderForms.value.nothingInvoiced',
    // 1,383.000 of 4,610.000 shipped and not invoiced; 3,227.000 still to ship.
    movedNotBilled: 1383,
    stillToMove: 3227,
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
    counterpartyId: null,
    sourceKey: 'orderForms.source.fromTheirQuote',
    party: 'Sohar Packaging LLC',
    partyKind: 'supplier',
    due: '11 Aug 2026',
    dueNoteKey: 'orderForms.due.in12Days',
    value: '3,140.000',
    valueNoteKey: 'orderForms.value.nothingBilled',
    movedNotBilled: 0,
    stillToMove: 3140,
    segments: [],
    note: { kind: 'text', labelKey: 'orderForms.note.nothingReceivedYet' },
    status: 'ordered',
    action: { kind: 'receipt', labelKey: 'orderForms.action.recordReceipt' },
  },
  {
    id: 'SO-0068',
    direction: 'sales',
    counterpartyId: 'c-bahla',
    sourceKey: 'orderForms.source.fromQuote0110',
    party: 'Bahla Fort Restaurant',
    partyKind: 'customer',
    due: '11 Aug 2026',
    dueNoteKey: 'orderForms.due.in12Days',
    value: '3,940.000',
    valueNoteKey: 'orderForms.value.fullyInvoiced',
    movedNotBilled: 0,
    stillToMove: 0,
    segments: [{ width: 225, tone: 'invoiced' }],
    note: { kind: 'done', labelKey: 'orderForms.note.deliveredAndBilled' },
    status: 'completed',
    action: { kind: 'link', labelKey: 'orderForms.action.viewInvoice', target: 'INV-2038' },
  },
]

export const ORDER_PAGE_SIZE = 6
