/**
 * Debit notes a supplier issued to us — Expenditure › Debit notes
 * (Figma 86:12759, 86:11732, 86:12235).
 *
 * The opposite of a credit note: an extra charge added after the original bill — a surcharge, a
 * price correction, a late fee. Nothing is owed until somebody here accepts it, which is why
 * every screen is built around one decision: accept, refuse with a reason, or hold.
 */

/** Where the charge has got to. */
export type DebitState = 'unchecked' | 'accepted' | 'refused' | 'onHold'

export type SupplierDebitNote = {
  id: string
  supplier: string
  arrived: string
  channelKey: string
  /** The bill it adds to. */
  againstBill: string
  againstNoteKey: string
  whyKey: string
  state: DebitState
  /** Who took the decision, for the accepted rows. */
  decidedBy?: string
  /** What happened to the money — added to the bill, paid separately, not owed. */
  outcomeKey: string
  /** The extra being charged, always shown as an increase. */
  extra: string
}

export type DebitTabId = 'all' | 'accepted' | 'rejected'

export const DEBIT_TABS: { id: DebitTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'supplierDebitNotes.tabs.all' },
  { id: 'accepted', labelKey: 'supplierDebitNotes.tabs.accepted' },
  { id: 'rejected', labelKey: 'supplierDebitNotes.tabs.rejected' },
]

export const DEBIT_TAB_STATES: Record<DebitTabId, DebitState[]> = {
  all: [],
  accepted: ['accepted'],
  rejected: ['refused'],
}

/**
 * Figma prints the same amount, date and reason down every row, and the reasons it borrowed are
 * credit-note reasons ("3 boxes never delivered") — a short delivery lowers a bill, it never
 * raises one. These carry surcharge reasons and the distinct amounts each row's own copy
 * implies, so the three figures above the table follow from the rows instead of being asserted.
 */
export const SUPPLIER_DEBIT_NOTES: SupplierDebitNote[] = [
  {
    id: 'GCL-DN-0091',
    supplier: 'Gulf Cold Logistics',
    arrived: '30 Jul',
    channelKey: 'supplierDebitNotes.channel.peppol',
    againstBill: 'GCL-2301',
    againstNoteKey: 'supplierDebitNotes.rows.stillUnpaid',
    whyKey: 'supplierDebitNotes.why.outOfHours',
    state: 'unchecked',
    outcomeKey: 'supplierDebitNotes.outcome.youdPayMore',
    extra: '96.500',
  },
  {
    id: 'MR-DN-0034',
    supplier: 'Muscat Roastery Co',
    arrived: '27 Jul',
    channelKey: 'supplierDebitNotes.channel.peppol',
    againstBill: 'MR-INV-8790',
    againstNoteKey: 'supplierDebitNotes.rows.stillUnpaid',
    whyKey: 'supplierDebitNotes.why.priceCorrection',
    state: 'accepted',
    decidedBy: 'Hafidh',
    outcomeKey: 'supplierDebitNotes.outcome.addedToBill',
    extra: '61.750',
  },
  {
    id: 'SP-DN-0012',
    supplier: 'Sohar Packaging LLC',
    arrived: '22 Jul',
    channelKey: 'supplierDebitNotes.channel.peppol',
    againstBill: 'SP-INV-1108',
    againstNoteKey: 'supplierDebitNotes.rows.alreadyPaid',
    whyKey: 'supplierDebitNotes.why.rushPlates',
    state: 'accepted',
    decidedBy: 'Ali',
    outcomeKey: 'supplierDebitNotes.outcome.paidSeparately',
    extra: '80.650',
  },
  {
    id: 'MZ-DN-0088',
    supplier: 'Mazoon Electricity',
    arrived: '16 Jul',
    channelKey: 'supplierDebitNotes.channel.uploaded',
    againstBill: 'MZ-INV-2288',
    againstNoteKey: 'supplierDebitNotes.rows.stillUnpaid',
    whyKey: 'supplierDebitNotes.why.lateFee',
    state: 'refused',
    outcomeKey: 'supplierDebitNotes.outcome.notOwed',
    extra: '122.700',
  },
  {
    id: 'AND-DN-0021',
    supplier: 'Al Noor Dates LLC',
    arrived: '9 Jul',
    channelKey: 'supplierDebitNotes.channel.peppol',
    againstBill: 'AND-INV-3150',
    againstNoteKey: 'supplierDebitNotes.rows.stillUnpaid',
    whyKey: 'supplierDebitNotes.why.duplicateHandling',
    state: 'refused',
    outcomeKey: 'supplierDebitNotes.outcome.notOwed',
    extra: '61.300',
  },
]

/** `96.500` → 96.5. */
export const debitValue = (amount: string) => Number(amount.replace(/,/g, '')) || 0

export const formatDebit = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/* -------------------------------------------------------------- the checks */

/** One line of "Does this look right" — the automatic read of the charge against what we hold. */
export type DebitCheck = {
  id: string
  titleKey: string
  detailKey: string
  /** `fine` passed, `check` is worth a human's eye before accepting. */
  verdict: 'fine' | 'check'
  /** References inside the detail sentence that should be links. */
  refs?: { token: string; to: string }[]
}

/* -------------------------------------------------------------- the upload */

export const DEBIT_UPLOAD = {
  file: { name: 'GCL-fuel-surcharge-July.pdf', pages: 1, size: '94 KB', seconds: 2 },
  fields: {
    supplier: 'Gulf Cold Logistics',
    number: 'GCL-DN-0094',
    issued: '2026-07-29',
    lines: [
      {
        id: 'l1',
        description: 'Fuel surcharge — July deliveries',
        qty: '4',
        rate: '31.500',
        vat: '5%',
      },
    ],
  },

  bill: {
    id: 'GCL-2301',
    amount: '288.400',
    noteKey: 'supplierDebitNotes.upload.billNote',
  },

  checks: [
    {
      id: 'c1',
      titleKey: 'supplierDebitNotes.upload.checks.realBill',
      detailKey: 'supplierDebitNotes.upload.checks.realBillDetail',
      verdict: 'fine' as const,
      refs: [{ token: 'GCL-2301', to: '/expenditure/bills/GCL-2301' }],
    },
    {
      id: 'c2',
      titleKey: 'supplierDebitNotes.upload.checks.notInRates',
      detailKey: 'supplierDebitNotes.upload.checks.notInRatesDetail',
      verdict: 'check' as const,
    },
    {
      id: 'c3',
      titleKey: 'supplierDebitNotes.upload.checks.fourDeliveries',
      detailKey: 'supplierDebitNotes.upload.checks.fourDeliveriesDetail',
      verdict: 'check' as const,
      refs: [
        { token: 'GCL-2301', to: '/expenditure/bills/GCL-2301' },
        { token: 'GCL-2288', to: '/expenditure/bills/GCL-2288' },
      ],
    },
    {
      id: 'c4',
      titleKey: 'supplierDebitNotes.upload.checks.notRepeat',
      detailKey: 'supplierDebitNotes.upload.checks.notRepeatDetail',
      verdict: 'fine' as const,
    },
  ] satisfies DebitCheck[],

  /** The document as printed, which the left pane renders. */
  sheet: {
    supplier: 'Gulf Cold Logistics',
    address: 'Ghala, Muscat',
    vat: 'OM1100554027',
    number: 'GCL-DN-0094',
    date: '29 Jul 2026',
    chargedTo: ['Al Bahja Coffee LLC', 'Souq Street, Nizwa', 'VAT OM1100392000'],
    againstRef: 'GCL-2301',
    againstDate: 'dated 25 July 2026',
    reason: 'Fuel surcharge applied to all July deliveries following the diesel price adjustment.',
    lines: [
      {
        description: 'Fuel surcharge — July deliveries',
        qty: '4',
        rate: '31.500',
        amount: '126.000',
      },
    ],
    net: '126.000',
    /** Distinct from `vat` above, which is the supplier's VAT registration number. */
    vatAmount: '6.300',
    total: '132.300',
  },
}

/** What someone can do with an unchecked charge. */
export type DebitDecision = 'accept' | 'refuse' | 'hold'

export const REFUSAL_REASONS: { id: string; labelKey: string }[] = [
  { id: 'notInRates', labelKey: 'supplierDebitNotes.refuse.notInRates' },
  { id: 'alreadyCharged', labelKey: 'supplierDebitNotes.refuse.alreadyCharged' },
  { id: 'neverAuthorised', labelKey: 'supplierDebitNotes.refuse.neverAuthorised' },
  { id: 'other', labelKey: 'supplierDebitNotes.refuse.other' },
]

/* -------------------------------------------------------------- the detail */

export const DEBIT_DETAIL = {
  id: 'GCL-DN-0091',
  supplier: 'Gulf Cold Logistics',
  issued: '26 Jul 2026',
  addsTo: 'GCL-2301',
  extra: '96.500',

  /** The three tiles of the amber banner: what they billed, this charge, what you'd then pay. */
  effect: {
    billed: '288.400',
    billedNoteKey: 'supplierDebitNotes.detail.billedNote',
    chargeNoteKey: 'supplierDebitNotes.detail.chargeNote',
    wouldPay: '384.900',
    wouldPayNoteKey: 'supplierDebitNotes.detail.wouldPayNote',
  },

  checks: [
    {
      id: 'c1',
      titleKey: 'supplierDebitNotes.detail.checks.realBill',
      detailKey: 'supplierDebitNotes.detail.checks.realBillDetail',
      verdict: 'fine' as const,
      refs: [{ token: 'GCL-2301', to: '/expenditure/bills/GCL-2301' }],
    },
    {
      id: 'c2',
      titleKey: 'supplierDebitNotes.detail.checks.noOutOfHours',
      detailKey: 'supplierDebitNotes.detail.checks.noOutOfHoursDetail',
      verdict: 'check' as const,
    },
    {
      id: 'c3',
      titleKey: 'supplierDebitNotes.detail.checks.signedAt',
      detailKey: 'supplierDebitNotes.detail.checks.signedAtDetail',
      verdict: 'check' as const,
      refs: [{ token: 'GRN-0092', to: '/trade-documents/delivery-notes/GRN-0092' }],
    },
    {
      id: 'c4',
      titleKey: 'supplierDebitNotes.detail.checks.notRepeat',
      detailKey: 'supplierDebitNotes.detail.checks.notRepeatDetail',
      verdict: 'fine' as const,
    },
  ] satisfies DebitCheck[],

  lines: [
    {
      id: '1',
      item: 'Out-of-hours delivery surcharge',
      noteKey: 'supplierDebitNotes.detail.lineNote',
      qty: '1 EA',
      unitPrice: '91.905',
      vat: '5%',
      total: '91.905',
    },
  ],
  totals: { net: '91.905', vat: '4.595', total: '96.500' },

  /** The rate card the charge is measured against — the reason to push back. */
  rateCard: {
    perDelivery: '96.000',
    normalHours: '06:00 – 18:00',
    surchargesKey: 'supplierDebitNotes.detail.rateCard.none',
    signedAt: '07:40',
    cardSigned: '4 Mar 2026',
  },

  vat: { onBill: '13.733', added: '4.595', reclaimable: '18.328' },

  supplierCard: {
    name: 'Gulf Cold Logistics',
    vat: 'OM1100554027',
    openBills: '2 · OMR 699.900',
    debitNotes: 'supplierDebitNotes.detail.threeThisYear',
    refusedBefore: 'supplierDebitNotes.detail.oneDuplicate',
  },

  linked: [
    {
      id: 'GCL-2301',
      to: '/expenditure/bills/GCL-2301',
      title: 'GCL-2301',
      kindKey: 'supplierDebitNotes.detail.linked.theBill',
      detailKey: 'supplierDebitNotes.detail.linked.theBillDetail',
      icon: 'bill' as const,
    },
    {
      id: 'GRN-0092',
      to: '/trade-documents/delivery-notes/GRN-0092',
      title: 'GRN-0092',
      kindKey: 'supplierDebitNotes.detail.linked.receipt',
      detailKey: 'supplierDebitNotes.detail.linked.receiptDetail',
      icon: 'receipt' as const,
    },
    {
      id: 'rateCard',
      /** Held as an agreement, not a document with a page of its own. */
      to: undefined as string | undefined,
      title: 'Rate card · signed 4 Mar 2026',
      kindKey: '',
      detailKey: 'supplierDebitNotes.detail.linked.rateCardDetail',
      icon: 'file' as const,
    },
  ],

  activity: [
    {
      id: 'a1',
      titleKey: 'supplierDebitNotes.detail.activity.waiting',
      detailKey: 'supplierDebitNotes.detail.activity.waitingDetail',
      tone: 'current' as const,
    },
    {
      id: 'a2',
      titleKey: 'supplierDebitNotes.detail.activity.checked',
      detailKey: 'supplierDebitNotes.detail.activity.checkedDetail',
      tone: 'done' as const,
    },
    {
      id: 'a3',
      titleKey: 'supplierDebitNotes.detail.activity.reported',
      detailKey: 'supplierDebitNotes.detail.activity.reportedDetail',
      tone: 'done' as const,
    },
    {
      id: 'a4',
      titleKey: 'supplierDebitNotes.detail.activity.arrived',
      detailKey: 'supplierDebitNotes.detail.activity.arrivedDetail',
      tone: 'done' as const,
    },
  ],
}
