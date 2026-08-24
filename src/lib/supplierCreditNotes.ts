/**
 * Credit notes a supplier issued to us — Expenditure › Credit notes
 * (Figma 86:10433, 86:10822, 86:11289).
 *
 * These are the mirror of the income credit notes already in the app: money owed *back* to us
 * for a short delivery, damage, an overcharge or a return. A note either comes off a bill we
 * have not paid, sits as credit until a later bill, or is refunded once the bill is settled —
 * and that three-way choice is what every screen here is organised around.
 */

/** Where the note has got to. */
export type CreditState = 'notUsed' | 'waitingForBill' | 'used' | 'refunded'

export type SupplierCreditNote = {
  id: string
  supplier: string
  arrived: string
  /** How it reached us; supplier notes can arrive outside Peppol. */
  channelKey: string
  /** The bill it corrects, when one exists yet. */
  againstBill?: string
  againstNoteKey: string
  whyKey: string
  state: CreditState
  /** Face value of the credit, always shown as a reduction. */
  credit: string
}

export type CreditTabId = 'all' | 'used' | 'refunded'

export const CREDIT_TABS: { id: CreditTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'supplierCreditNotes.tabs.all' },
  { id: 'used', labelKey: 'supplierCreditNotes.tabs.used' },
  { id: 'refunded', labelKey: 'supplierCreditNotes.tabs.refunded' },
]

export const CREDIT_TAB_STATES: Record<CreditTabId, CreditState[]> = {
  all: [],
  used: ['used'],
  refunded: ['refunded'],
}

/**
 * Figma repeats one bill, one date and one amount down every row. These carry the distinct
 * values each row's own copy implies, so the totals above the table can be derived from them
 * rather than asserted.
 */
export const SUPPLIER_CREDIT_NOTES: SupplierCreditNote[] = [
  {
    id: 'AND-CN-0442',
    supplier: 'Al Noor Dates LLC',
    arrived: '30 Jul',
    channelKey: 'supplierCreditNotes.channel.peppol',
    againstBill: 'AND-INV-3382',
    againstNoteKey: 'supplierCreditNotes.rows.stillUnpaid',
    whyKey: 'supplierCreditNotes.why.threeBoxes',
    state: 'notUsed',
    credit: '84.900',
  },
  {
    id: 'MR-CN-0118',
    supplier: 'Muscat Roastery Co',
    arrived: '28 Jul',
    channelKey: 'supplierCreditNotes.channel.peppol',
    againstNoteKey: 'supplierCreditNotes.rows.noBillYet',
    whyKey: 'supplierCreditNotes.why.overcharged',
    state: 'waitingForBill',
    credit: '242.500',
  },
  {
    id: 'SP-CN-0067',
    supplier: 'Sohar Packaging LLC',
    arrived: '24 Jul',
    channelKey: 'supplierCreditNotes.channel.uploaded',
    againstBill: 'SP-INV-1140',
    againstNoteKey: 'supplierCreditNotes.rows.paid',
    whyKey: 'supplierCreditNotes.why.damagedBags',
    state: 'used',
    credit: '100.800',
  },
  {
    id: 'MZ-CN-2210',
    supplier: 'Mazoon Electricity',
    arrived: '18 Jul',
    channelKey: 'supplierCreditNotes.channel.peppol',
    againstBill: 'MZ-INV-7801',
    againstNoteKey: 'supplierCreditNotes.rows.paid',
    whyKey: 'supplierCreditNotes.why.meterMisread',
    state: 'refunded',
    credit: '61.300',
  },
  {
    id: 'AND-CN-0391',
    supplier: 'Al Noor Dates LLC',
    arrived: '11 Jul',
    channelKey: 'supplierCreditNotes.channel.peppol',
    againstBill: 'AND-INV-3301',
    againstNoteKey: 'supplierCreditNotes.rows.paid',
    whyKey: 'supplierCreditNotes.why.spoiledBoxes',
    state: 'used',
    credit: '249.100',
  },
]

/** `84.900` → 84.9. */
export const creditValue = (amount: string) => Number(amount.replace(/,/g, '')) || 0

export const formatCredit = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/* -------------------------------------------------------------- the upload */

export const CREDIT_UPLOAD = {
  file: { name: 'SP-credit-note-July.pdf', pages: 1, size: '186 KB', seconds: 2 },
  fields: {
    supplier: 'Sohar Packaging LLC',
    number: 'SP-CN-0074',
    issued: '2026-07-28',
    reason: 'Print quality rejected — 400 bags returned 27 Jul',
    lines: [
      {
        id: 'l1',
        description: 'Kraft coffee bags 1kg, printed',
        qty: '400',
        rate: '0.240',
        vat: '5%',
      },
    ],
  },

  /** The bill this note corrects, and what the reader found on the file. */
  bill: {
    id: 'SP-INV-1140',
    amount: '3,140.000',
    noteKey: 'supplierCreditNotes.upload.billNote',
    certainKey: 'supplierCreditNotes.upload.certain',
    /** Input VAT already claimed on that bill, for the VAT panel. */
    inputVat: '149.520',
  },

  /** The document as printed, which the left pane renders. */
  sheet: {
    supplier: 'Sohar Packaging LLC',
    address: 'Industrial Area 4, Sohar',
    vat: 'OM1100628391',
    number: 'SP-CN-0074',
    date: '28 Jul 2026',
    creditedTo: ['Al Bahja Coffee LLC', 'Souq Street, Nizwa', 'VAT OM1100392000'],
    againstRef: 'SP-INV-1140',
    againstDate: 'dated 24 July 2026',
    reason: 'Print quality rejected on 1kg bags. 400 units returned 27 July and credited in full.',
    lines: [
      {
        description: 'Kraft coffee bags 1kg, printed',
        qty: '400',
        rate: '0.240',
        amount: '96.000',
      },
    ],
    net: '96.000',
    /** Distinct from `vat` above, which is the supplier's VAT registration number. */
    vatAmount: '4.800',
    total: '100.800',
  },
}

export type CreditUse = 'setAgainst' | 'hold' | 'refund'

/* -------------------------------------------------------------- the detail */

export const CREDIT_DETAIL = {
  id: 'AND-CN-0442',
  supplier: 'Al Noor Dates LLC',
  issued: '30 Jul 2026',
  corrects: 'AND-INV-3382',
  credit: '84.900',

  /** The three tiles of the green banner: what they billed, this credit, what you now pay. */
  effect: {
    billed: '933.900',
    billedNoteKey: 'supplierCreditNotes.detail.billedNote',
    creditNoteKey: 'supplierCreditNotes.detail.creditNote',
    willPay: '849.000',
    willPayNoteKey: 'supplierCreditNotes.detail.willPayNote',
  },

  whyKey: 'supplierCreditNotes.detail.whyBody',
  quoteKey: 'supplierCreditNotes.detail.whyQuote',
  receiptRef: 'GRN-0084',

  lines: [
    {
      id: '1',
      item: 'Khalas dates — 5 kg box',
      noteKey: 'supplierCreditNotes.detail.lineNote',
      qty: '3 EA',
      unitPrice: '26.950',
      vat: '5%',
      total: '80.850',
    },
  ],
  totals: { net: '80.850', vat: '4.050', total: '84.900' },

  vat: { claimed: '44.470', reduced: '4.050', reclaimable: '40.420' },

  compliance: [
    'supplierCreditNotes.detail.compliance.valid',
    'supplierCreditNotes.detail.compliance.pintOm',
    'supplierCreditNotes.detail.compliance.tdd',
  ],

  supplierCard: {
    name: 'Al Noor Dates LLC',
    vat: 'OM1100518844',
    openBills: '1 · OMR 933.900',
    creditNotes: 'supplierCreditNotes.detail.twoThisYear',
    shortDeliveries: '3 of 14',
  },

  linked: [
    {
      id: 'AND-INV-3382',
      to: '/expenditure/bills/AND-INV-3382',
      title: 'AND-INV-3382',
      kindKey: 'supplierCreditNotes.detail.linked.theBill',
      detailKey: 'supplierCreditNotes.detail.linked.theBillDetail',
      icon: 'bill' as const,
    },
    {
      id: 'GRN-0084',
      to: '/trade-documents/delivery-notes/GRN-0084',
      title: 'GRN-0084',
      kindKey: 'supplierCreditNotes.detail.linked.receipt',
      detailKey: 'supplierCreditNotes.detail.linked.receiptDetail',
      icon: 'receipt' as const,
    },
    {
      id: 'xml',
      /** No page of its own — the file is the document. */
      to: undefined as string | undefined,
      title: 'AND-CN-0442.xml',
      kindKey: 'supplierCreditNotes.detail.linked.original',
      detailKey: 'supplierCreditNotes.detail.linked.originalDetail',
      icon: 'file' as const,
    },
  ],

  activity: [
    {
      id: 'a1',
      titleKey: 'supplierCreditNotes.detail.activity.waiting',
      detailKey: 'supplierCreditNotes.detail.activity.waitingDetail',
      tone: 'current' as const,
    },
    {
      id: 'a2',
      titleKey: 'supplierCreditNotes.detail.activity.reported',
      detailKey: 'supplierCreditNotes.detail.activity.reportedDetail',
      tone: 'done' as const,
    },
    {
      id: 'a3',
      titleKey: 'supplierCreditNotes.detail.activity.arrived',
      detailKey: 'supplierCreditNotes.detail.activity.arrivedDetail',
      tone: 'done' as const,
    },
    {
      id: 'a4',
      titleKey: 'supplierCreditNotes.detail.activity.queried',
      detailKey: 'supplierCreditNotes.detail.activity.queriedDetail',
      tone: 'done' as const,
    },
  ],
}
