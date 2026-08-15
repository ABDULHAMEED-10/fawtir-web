/**
 * Delivery notes (Figma 68:39213).
 *
 * A delivery note records that goods changed hands — quantities only, never prices. Like order
 * forms it runs in both directions: sales deliveries you sent out, and purchase receipts a
 * supplier sent you. The fulfilment column carries the *proof*: who signed, or why nobody did.
 */

import type { NextStep, OrderStatus, PartyKind } from './orderForms'

export type DeliveryMode = 'all' | 'sales' | 'purchase'
export type DeliveryDirection = 'sales' | 'purchase'

/** The proof disc: fill, border and glyph all change with the outcome. */
export type ProofKind = 'signed' | 'check' | 'clock' | 'short' | 'unsigned' | 'photo' | 'awaiting'

export type DeliveryRow = {
  id: string
  direction: DeliveryDirection
  /** "vs SO-0073" — the order this note was raised against, or "Standalone". */
  sourceKey: string
  party: string
  partyKind: PartyKind
  due: string
  dueNoteKey: string
  dueOverdue?: boolean
  /** "3 lines" plus the quantity breakdown underneath. */
  lines: string
  quantities: string
  quantitiesAlert?: boolean
  proof: ProofKind
  proofTitleKey: string
  proofNoteKey: string
  status: OrderStatus
  action: NextStep
}

export const DELIVERY_MODES: {
  id: DeliveryMode
  titleKey: string
  hintKey: string
  count: number
}[] = [
  {
    id: 'all',
    titleKey: 'deliveryNotes.mode.all',
    hintKey: 'deliveryNotes.mode.allHint',
    count: 48,
  },
  {
    id: 'sales',
    titleKey: 'deliveryNotes.mode.sales',
    hintKey: 'deliveryNotes.mode.salesHint',
    count: 31,
  },
  {
    id: 'purchase',
    titleKey: 'deliveryNotes.mode.purchase',
    hintKey: 'deliveryNotes.mode.purchaseHint',
    count: 13,
  },
]

/** These KPIs count documents, not money — no OMR mark anywhere on this screen. */
export const DELIVERY_KPI = [
  {
    id: 'move',
    icon: 'move' as const,
    disc: 'bg-[#f4f6fb]',
    titleKey: 'deliveryNotes.kpi.move',
    count: '6',
    legend: [
      { labelKey: 'deliveryNotes.kpi.moveOut', tone: 'out' as const },
      { labelKey: 'deliveryNotes.kpi.moveIn', tone: 'in' as const },
    ],
  },
  {
    id: 'noProof',
    icon: 'noproof' as const,
    disc: 'bg-[#f4f6fb]',
    titleKey: 'deliveryNotes.kpi.noProof',
    count: '3',
    noteKey: 'deliveryNotes.kpi.noProofNote',
    link: { labelKey: 'deliveryNotes.kpi.noProofLink', to: '/trade-documents/delivery-notes' },
  },
  {
    id: 'notInvoiced',
    icon: 'delivered' as const,
    disc: 'bg-[#f7f1e6]',
    titleKey: 'deliveryNotes.kpi.notInvoiced',
    count: '9',
    noteKey: 'deliveryNotes.kpi.notInvoicedNote',
    link: { labelKey: 'deliveryNotes.kpi.notInvoicedLink', to: '/trade-documents/delivery-notes' },
  },
  {
    id: 'short',
    icon: 'short' as const,
    disc: 'bg-[#f7f1e6]',
    titleKey: 'deliveryNotes.kpi.short',
    count: '2',
    noteKey: 'deliveryNotes.kpi.shortNote',
  },
]

export type DeliveryTabId =
  'all' | 'draft' | 'open' | 'overdue' | 'readyToInvoice' | 'awaitingSupplierBill' | 'completed'

export const DELIVERY_TABS: {
  id: DeliveryTabId
  labelKey: string
  count: number
  danger?: boolean
}[] = [
  { id: 'all', labelKey: 'deliveryNotes.tabs.all', count: 32 },
  { id: 'draft', labelKey: 'deliveryNotes.tabs.draft', count: 4 },
  { id: 'open', labelKey: 'deliveryNotes.tabs.open', count: 6 },
  { id: 'overdue', labelKey: 'deliveryNotes.tabs.overdue', count: 1, danger: true },
  { id: 'readyToInvoice', labelKey: 'deliveryNotes.tabs.readyToInvoice', count: 9 },
  { id: 'awaitingSupplierBill', labelKey: 'deliveryNotes.tabs.awaitingSupplierBill', count: 9 },
  { id: 'completed', labelKey: 'deliveryNotes.tabs.completed', count: 9 },
]

export const DELIVERY_ROWS: DeliveryRow[] = [
  {
    id: 'DN-0124',
    direction: 'sales',
    sourceKey: 'deliveryNotes.source.vsSo0073',
    party: 'Nizwa Souq Café',
    partyKind: 'customer',
    due: '27 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.delivered0920',
    lines: '3 lines',
    quantities: '24 KG · 18 EA · 3 EA',
    proof: 'signed',
    proofTitleKey: 'deliveryNotes.proof.khalid',
    proofNoteKey: 'deliveryNotes.proof.signedOnDevice',
    status: 'readyToInvoice',
    action: { kind: 'invoice', labelKey: 'orderForms.action.issueInvoice' },
  },
  {
    id: 'GRN-0087',
    direction: 'purchase',
    sourceKey: 'deliveryNotes.source.vsPo0031',
    party: 'Muscat Roastery Co',
    partyKind: 'supplier',
    due: '28 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.received0745',
    lines: '2 lines',
    quantities: '240 KG · 60 EA',
    proof: 'check',
    proofTitleKey: 'deliveryNotes.proof.yusuf',
    proofNoteKey: 'deliveryNotes.proof.checkedInMainStore',
    status: 'awaitingSupplierBill',
    action: { kind: 'selfbill', labelKey: 'orderForms.action.selfBillSupplier' },
  },
  {
    id: 'DN-0131',
    direction: 'sales',
    sourceKey: 'deliveryNotes.source.vsSo0071',
    party: 'Salalah Beach Resort',
    partyKind: 'customer',
    due: '30 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.leftDepot0610',
    lines: '4 lines',
    quantities: '180 KG · 40 EA · 12 EA · 6 EA',
    proof: 'clock',
    proofTitleKey: 'deliveryNotes.proof.notYetDelivered',
    proofNoteKey: 'deliveryNotes.proof.driverSalim',
    status: 'inProgress',
    action: { kind: 'deliver', labelKey: 'orderForms.action.logDelivery' },
  },
  {
    id: 'GRN-0085',
    direction: 'purchase',
    sourceKey: 'deliveryNotes.source.vsPo0029',
    party: 'Al Noor Dates LLC',
    partyKind: 'supplier',
    due: '26 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.received1130',
    lines: '2 lines',
    quantities: '18 of 21 boxes · 3 short',
    quantitiesAlert: true,
    proof: 'short',
    proofTitleKey: 'deliveryNotes.proof.shortBy3',
    proofNoteKey: 'deliveryNotes.proof.notedByYusuf',
    status: 'partReceived',
    action: { kind: 'receipt', labelKey: 'orderForms.action.recordReceipt' },
  },
  {
    id: 'DN-0119',
    direction: 'sales',
    sourceKey: 'deliveryNotes.source.standalone',
    party: 'Al Mouj Marina Café',
    partyKind: 'customer',
    due: '25 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.unsigned5Days',
    dueOverdue: true,
    lines: '1 line',
    quantities: '40 KG',
    proof: 'unsigned',
    proofTitleKey: 'deliveryNotes.proof.nobodySigned',
    proofNoteKey: 'deliveryNotes.proof.leftAtReception',
    status: 'deliveryOverdue',
    action: { kind: 'deliver', labelKey: 'orderForms.action.logDelivery' },
  },
  {
    id: 'DN-0112',
    direction: 'purchase',
    sourceKey: 'deliveryNotes.source.vsSo0068',
    party: 'Bahla Fort Restaurant',
    partyKind: 'customer',
    due: '18 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.delivered0805',
    lines: '3 lines',
    quantities: '120 KG · 30 EA · 8 EA',
    proof: 'photo',
    proofTitleKey: 'deliveryNotes.proof.photoToDoor',
    proofNoteKey: 'deliveryNotes.proof.signedByAhmed',
    status: 'ordered',
    action: { kind: 'receipt', labelKey: 'orderForms.action.recordReceipt' },
  },
  {
    id: 'GRN-0089',
    direction: 'sales',
    sourceKey: 'deliveryNotes.source.vsPo0028',
    party: 'Sohar Packaging LLC',
    partyKind: 'supplier',
    due: '30 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.expectedToday',
    lines: '2 lines',
    quantities: 'expected 60 EA · 20 EA',
    proof: 'awaiting',
    proofTitleKey: 'deliveryNotes.proof.notArrived',
    proofNoteKey: 'deliveryNotes.proof.awaitingVan',
    status: 'completed',
    action: { kind: 'link', labelKey: 'orderForms.action.viewInvoice', target: 'INV-2038' },
  },
]

export const DELIVERY_PAGE_NUMBERS = ['1', '2', '3', '4', '...', '20']
