/**
 * Supplier bills — Expenditure › Bills (Figma 86:15186).
 *
 * A bill is something a supplier sent us, so unlike an invoice we do not author it: it arrives,
 * gets matched against a purchase order, someone approves it, and only then can it be paid.
 * That sequence is what the list is organised around.
 */

/** How the document reached us. Drives the badge under the supplier name. */
export type BillSource = 'peppol' | 'uploaded' | 'scanned'

/** Whether the bill agrees with the order it belongs to. */
export type BillMatch = 'ok' | 'warn' | 'none'

export type BillStatus =
  'newNotReviewed' | 'mismatch' | 'awaitingApprover' | 'draft' | 'onHold' | 'approved' | 'paid'

/** The one thing this row most needs someone to do. */
export type BillAction = 'approve' | 'reviewDifference' | 'nudge' | 'checkAndSave' | 'viewDispute'

export type BillTabId =
  'needsAttention' | 'all' | 'awaitingApproval' | 'approved' | 'onHold' | 'paid'

export type BillRow = {
  id: string
  supplier: string
  source: BillSource
  /** Trailing note beside the source badge; absent on scanned receipts. */
  sourceNote?: string
  /** The supplier's own reference, which is not ours to renumber. */
  theirBill: string
  theirBillNote: string
  /** Absent for over-the-counter purchases that were settled immediately. */
  due?: string
  dueNote: string
  match: BillMatch
  /** The order it matched, when there is one. */
  matchRef?: string
  matchNote: string
  status: BillStatus
  action: BillAction
  amount: string
  amountNote: string
}

export const BILL_TABS: { id: BillTabId; labelKey: string }[] = [
  { id: 'needsAttention', labelKey: 'billsPage.tabs.needsAttention' },
  { id: 'all', labelKey: 'billsPage.tabs.all' },
  { id: 'awaitingApproval', labelKey: 'billsPage.tabs.awaitingApproval' },
  { id: 'approved', labelKey: 'billsPage.tabs.approved' },
  { id: 'onHold', labelKey: 'billsPage.tabs.onHold' },
  { id: 'paid', labelKey: 'billsPage.tabs.paid' },
]

/** Which statuses each tab covers; `all` matches everything. */
export const BILL_TAB_STATUSES: Record<BillTabId, BillStatus[]> = {
  needsAttention: ['newNotReviewed', 'mismatch', 'awaitingApprover', 'draft', 'onHold'],
  all: [],
  awaitingApproval: ['awaitingApprover'],
  approved: ['approved'],
  onHold: ['onHold'],
  paid: ['paid'],
}

/**
 * Counts printed on the tabs.
 *
 * The seeded rows are one page of a much longer ledger — 142 paid bills are not shipped as
 * fixtures — so the tab counts come from the server rather than from `BILL_ROWS.length`.
 */
export const BILL_TAB_COUNTS: Record<BillTabId, number> = {
  needsAttention: 5,
  all: 11,
  awaitingApproval: 2,
  approved: 7,
  onHold: 1,
  paid: 142,
}

export const BILL_KPI = [
  {
    id: 'attention',
    titleKey: 'billsPage.kpi.attention',
    /** A count, not money — printed without the OMR mark. */
    count: '5',
    metaKey: 'billsPage.kpi.attentionMeta',
    linkKey: 'billsPage.kpi.attentionLink',
  },
  {
    id: 'due',
    titleKey: 'billsPage.kpi.due',
    amount: '3,982.610',
    metaKey: 'billsPage.kpi.dueMeta',
  },
  {
    id: 'payable',
    titleKey: 'billsPage.kpi.payable',
    amount: '11,247.880',
    metaKey: 'billsPage.kpi.payableMeta',
  },
  {
    id: 'ready',
    titleKey: 'billsPage.kpi.ready',
    amount: '6,091.680',
    metaKey: 'billsPage.kpi.readyMeta',
    linkKey: 'billsPage.kpi.readyLink',
  },
] as const

export const BILL_ROWS: BillRow[] = [
  {
    id: 'MR-INV-8821',
    supplier: 'Muscat Roastery Co',
    source: 'peppol',
    sourceNote: 'billsPage.source.arrived29Jul',
    theirBill: 'MR-INV-8821',
    theirBillNote: 'billsPage.rows.issued29Jul',
    due: '28 Aug 2026',
    dueNote: 'billsPage.rows.in29Days',
    match: 'ok',
    matchRef: 'PO-0031',
    matchNote: 'billsPage.rows.quantitiesAgree',
    status: 'newNotReviewed',
    action: 'approve',
    amount: '2,354.310',
    amountNote: 'billsPage.rows.inclVat112',
  },
  {
    id: 'AND-INV-3382',
    supplier: 'Al Noor Dates LLC',
    source: 'peppol',
    sourceNote: 'billsPage.source.arrived28Jul',
    theirBill: 'AND-INV-3382',
    theirBillNote: 'billsPage.rows.issued28Jul',
    due: '27 Aug 2026',
    dueNote: 'billsPage.rows.in28Days',
    match: 'warn',
    matchRef: 'PO-0029',
    matchNote: 'billsPage.rows.threeBoxesMore',
    status: 'mismatch',
    action: 'reviewDifference',
    amount: '933.900',
    amountNote: 'billsPage.rows.over84',
  },
  {
    id: 'SP-INV-1140',
    supplier: 'Sohar Packaging LLC',
    source: 'uploaded',
    sourceNote: 'billsPage.source.pdfByYusuf',
    theirBill: 'SP-INV-1140',
    theirBillNote: 'billsPage.rows.issued24Jul',
    due: '3 Aug 2026',
    dueNote: 'billsPage.rows.in4Days',
    match: 'ok',
    matchRef: 'PO-0031',
    matchNote: 'billsPage.rows.matchedByHand',
    status: 'awaitingApprover',
    action: 'nudge',
    amount: '3,140.000',
    amountNote: 'billsPage.rows.overLimit',
  },
  {
    id: 'RCPT-4471',
    supplier: 'Nizwa Hardware Store',
    source: 'scanned',
    theirBill: 'Receipt 4471',
    theirBillNote: 'billsPage.rows.read30Jul',
    dueNote: 'billsPage.rows.cash',
    match: 'none',
    matchNote: 'billsPage.rows.overTheCounter',
    status: 'draft',
    action: 'checkAndSave',
    amount: '28.400',
    amountNote: 'billsPage.rows.vatUnclear',
  },
  {
    id: 'GCL-2288',
    supplier: 'Gulf Cold Logistics',
    source: 'peppol',
    sourceNote: 'billsPage.source.arrived18Jul',
    theirBill: 'GCL-2288',
    theirBillNote: 'billsPage.rows.issued17Jul',
    due: '16 Aug 2026',
    dueNote: 'billsPage.rows.in17Days',
    match: 'none',
    matchNote: 'billsPage.rows.serviceCharge',
    status: 'onHold',
    action: 'viewDispute',
    amount: '411.500',
    amountNote: 'billsPage.rows.queried22Jul',
  },
]

/** `2,354.310` → a comparable number. Display strings are the only amounts the list holds. */
export const billAmountValue = (amount: string) => Number(amount.replace(/,/g, '')) || 0

/** `28 Aug 2026` → a sortable timestamp; undated counter purchases sort last. */
export const billDueValue = (due?: string) => {
  if (!due) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(due)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}
