/**
 * Delivery notes (Figma 68:39213).
 *
 * A delivery note records that goods changed hands — quantities only, never prices. Like order
 * forms it runs in both directions: sales deliveries you sent out, and purchase receipts a
 * supplier sent you. The fulfilment column carries the *proof*: who signed, or why nobody did.
 *
 * There is no trade-documents API yet: these rows are the page's own data (TRADE_DOCUMENTS.md
 * row T.1). Whether a note has been billed is read from the quantity ledger (`tradeLedger.ts`).
 */

import type { NextStep, OrderStatus, OrderTabId, PartyKind } from './orderForms'
import { invoiceForDelivery, ledgerDelivery, ledgerOrder, qtyLabel } from './tradeLedger'

export type DeliveryMode = 'all' | 'sales' | 'purchase'
export type DeliveryDirection = 'sales' | 'purchase'

/** The proof disc: fill, border and glyph all change with the outcome. */
export type ProofKind = 'signed' | 'check' | 'clock' | 'short' | 'unsigned' | 'photo' | 'awaiting'

export type DeliveryRow = {
  id: string
  direction: DeliveryDirection
  /** The order this note is against, or null for a standalone note. */
  orderId: string | null
  /** A customer id on the sales side; the supplier's self-billing record, not carried yet (null). */
  counterpartyId: string | null
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

export const DELIVERY_MODES: { id: DeliveryMode; titleKey: string; hintKey: string }[] = [
  { id: 'all', titleKey: 'deliveryNotes.mode.all', hintKey: 'deliveryNotes.mode.allHint' },
  { id: 'sales', titleKey: 'deliveryNotes.mode.sales', hintKey: 'deliveryNotes.mode.salesHint' },
  {
    id: 'purchase',
    titleKey: 'deliveryNotes.mode.purchase',
    hintKey: 'deliveryNotes.mode.purchaseHint',
  },
]

export type DeliveryTabId = OrderTabId

export const DELIVERY_TABS: { id: DeliveryTabId; labelKey: string; danger?: boolean }[] = [
  { id: 'all', labelKey: 'deliveryNotes.tabs.all' },
  { id: 'draft', labelKey: 'deliveryNotes.tabs.draft' },
  { id: 'open', labelKey: 'deliveryNotes.tabs.open' },
  { id: 'overdue', labelKey: 'deliveryNotes.tabs.overdue', danger: true },
  { id: 'readyToInvoice', labelKey: 'deliveryNotes.tabs.readyToInvoice' },
  { id: 'awaitingSupplierBill', labelKey: 'deliveryNotes.tabs.awaitingSupplierBill' },
  { id: 'completed', labelKey: 'deliveryNotes.tabs.completed' },
]

/**
 * The four cards count the rows (documents, not money: no rial sign on this screen). The design
 * typed 48 notes against 31 + 13, and 32 in "All".
 * TODO(backend): TRADE_DOCUMENTS.md row T.7 (counts over every note, not one page).
 */
export function deliveryKpis(rows: DeliveryRow[]) {
  const out = rows.filter((row) => row.direction === 'sales' && row.proof === 'clock').length
  const arriving = rows.filter(
    (row) => row.direction === 'purchase' && row.proof === 'awaiting',
  ).length
  const noProof = rows.filter((row) => row.proof === 'unsigned').length
  const notInvoiced = rows.filter(
    (row) =>
      row.direction === 'sales' &&
      row.status !== 'completed' &&
      row.proof !== 'clock' &&
      !(row.id && invoiceForDelivery(row.id)),
  ).length
  const short = rows.filter((row) => row.proof === 'short').length
  return [
    {
      id: 'move',
      icon: 'move' as const,
      disc: 'bg-[#f4f6fb]',
      titleKey: 'deliveryNotes.kpi.move',
      count: String(out + arriving),
      legend: [
        {
          labelKey: 'deliveryNotes.kpi.moveOutCount',
          values: { count: out },
          tone: 'out' as const,
        },
        {
          labelKey: 'deliveryNotes.kpi.moveInCount',
          values: { count: arriving },
          tone: 'in' as const,
        },
      ],
      noteKey: null,
      noteValues: undefined,
      link: null,
    },
    {
      id: 'noProof',
      icon: 'noproof' as const,
      disc: 'bg-[#f4f6fb]',
      titleKey: 'deliveryNotes.kpi.noProof',
      count: String(noProof),
      legend: null,
      noteKey: 'deliveryNotes.kpi.noProofNote',
      noteValues: undefined,
      link: { labelKey: 'deliveryNotes.kpi.noProofLink', tab: 'overdue' as DeliveryTabId },
    },
    {
      id: 'notInvoiced',
      icon: 'delivered' as const,
      disc: 'bg-[#f7f1e6]',
      titleKey: 'deliveryNotes.kpi.notInvoiced',
      count: String(notInvoiced),
      legend: null,
      noteKey: 'deliveryNotes.kpi.notInvoicedNote',
      noteValues: undefined,
      link: {
        labelKey: 'deliveryNotes.kpi.notInvoicedLink',
        tab: 'readyToInvoice' as DeliveryTabId,
      },
    },
    {
      id: 'short',
      icon: 'short' as const,
      disc: 'bg-[#f7f1e6]',
      titleKey: 'deliveryNotes.kpi.short',
      count: String(short),
      legend: null,
      noteKey: 'deliveryNotes.kpi.shortNoteCount',
      noteValues: {
        count: rows.filter((row) => row.proof === 'short' && row.direction === 'purchase').length,
      },
      link: null,
    },
  ]
}

/** DN-0124's quantities and billing come from the ledger, never typed. */
const dn0124 = ledgerDelivery('DN-0124')!
const so0073 = ledgerOrder('SO-0073')!
const dn0124Billed = invoiceForDelivery('DN-0124')

export const DELIVERY_ROWS: DeliveryRow[] = [
  {
    id: 'DN-0124',
    direction: 'sales',
    orderId: 'SO-0073',
    counterpartyId: 'c-nizwa',
    sourceKey: 'deliveryNotes.source.vsSo0073',
    party: 'Nizwa Souq Café',
    partyKind: 'customer',
    due: '27 Jul 2026',
    dueNoteKey: 'deliveryNotes.due.delivered0920',
    lines: `${dn0124.lines.length} lines`,
    quantities: dn0124.lines
      .map((l) => qtyLabel(l.qty, so0073.lines.find((line) => line.lineNo === l.lineNo)!.unitLabel))
      .join(' · '),
    proof: 'signed',
    proofTitleKey: 'deliveryNotes.proof.khalid',
    proofNoteKey: 'deliveryNotes.proof.signedOnDevice',
    status: dn0124Billed ? 'completed' : 'readyToInvoice',
    action: dn0124Billed
      ? { kind: 'link', labelKey: 'orderForms.action.viewInvoice', target: dn0124Billed.id }
      : { kind: 'invoice', labelKey: 'orderForms.action.issueInvoice' },
  },
  {
    // The design numbered this row GRN-0087 against PO-0031, but GRN-0087 is the receipt Muscat
    // Roastery billed and was matched to (its own detail says so: 300 KG and 12 sacks, billed on
    // MR-INV-8821). This row is the receipt for their unbilled order PO-0030.
    id: 'GRN-0086',
    direction: 'purchase',
    orderId: 'PO-0030',
    counterpartyId: null,
    sourceKey: 'deliveryNotes.source.vsPo0030',
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
    orderId: 'SO-0071',
    counterpartyId: 'c-salalah',
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
    orderId: 'PO-0029',
    counterpartyId: null,
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
    orderId: null,
    counterpartyId: 'c-mouj',
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
    // The design's last two rows had their direction, status and next step swapped: DN-0112 is a
    // sales delivery to Bahla Fort against SO-0068 (fully invoiced on INV-2038), and GRN-0089 is
    // Sohar Packaging's receipt against PO-0028, expected today.
    id: 'DN-0112',
    direction: 'sales',
    orderId: 'SO-0068',
    counterpartyId: 'c-bahla',
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
    status: 'completed',
    action: { kind: 'link', labelKey: 'orderForms.action.viewInvoice', target: 'INV-2038' },
  },
  {
    id: 'GRN-0089',
    direction: 'purchase',
    orderId: 'PO-0028',
    counterpartyId: null,
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
    status: 'ordered',
    action: { kind: 'receipt', labelKey: 'orderForms.action.recordReceipt' },
  },
]

export const DELIVERY_PAGE_SIZE = 6
