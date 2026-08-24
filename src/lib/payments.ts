/**
 * Payment runs — Expenditure › Payments (Figma 86:8719 and 86:9133).
 *
 * A run is a batch: pick the approved bills that fall due, let them group by supplier so each
 * supplier gets one transfer, and hand the bank a single file. Nothing here moves money — the
 * run produces a file, and the bank does the rest.
 *
 * Every total on the screen is derived from the selected bills rather than stored, because the
 * user ticks and unticks them; a stored total would go stale the moment they did.
 */

/** How close the bill is to its due date, which is the only thing the chip says. */
export type DueTone = 'soon' | 'later' | 'late'

export type RunBill = {
  id: string
  supplierId: string
  /** The supplier's own reference. */
  reference: string
  approvedOn: string
  matchedTo: string
  dueLabelKey: string
  dueTone: DueTone
  /** Face value in OMR, as a display string. */
  amount: string
  /** Set when settling early earns a discount; shown under the amount. */
  earlyDiscountNoteKey?: string
  /** OMR taken off the face value when the run is paid on time to earn it. */
  earlyDiscount?: string
}

export type RunSupplier = {
  id: string
  name: string
  /** Two-letter chip, as the design draws instead of a logo. */
  initials: string
  tint: string
}

/** A bill that cannot join the run yet, and why. */
export type BlockedBill = {
  id: string
  supplier: string
  reference: string
  reasonKey: string
  amount: string
}

export const RUN_SUPPLIERS: RunSupplier[] = [
  {
    id: 'muscat',
    name: 'Muscat Roastery Co',
    initials: 'MR',
    tint: 'bg-success-100 text-success-700',
  },
  {
    id: 'sohar',
    name: 'Sohar Packaging LLC',
    initials: 'SP',
    tint: 'bg-primary-50 text-primary-800',
  },
  {
    id: 'nizwa',
    name: 'Nizwa Hardware Store',
    initials: 'NH',
    tint: 'bg-pending-100 text-pending-700',
  },
  { id: 'mazoon', name: 'Mazoon Electricity', initials: 'MZ', tint: 'bg-[#e3e4ea] text-[#474a5e]' },
]

/**
 * Bills eligible for the run.
 *
 * Figma repeats `MR-INV-8790` on all three Muscat rows and its group total does not equal them;
 * these carry the distinct references the second screen already lists, so the two screens agree
 * and the arithmetic holds.
 */
export const RUN_BILLS: RunBill[] = [
  {
    id: 'MR-INV-8821',
    supplierId: 'muscat',
    reference: 'MR-INV-8821',
    approvedOn: 'paymentsPage.rows.approved30Jul',
    matchedTo: 'PO-0031',
    dueLabelKey: 'paymentsPage.due.in29Days',
    dueTone: 'later',
    amount: '2,354.310',
    earlyDiscountNoteKey: 'paymentsPage.rows.savedEarly',
    earlyDiscount: '47.090',
  },
  {
    id: 'MR-INV-8790',
    supplierId: 'muscat',
    reference: 'MR-INV-8790',
    approvedOn: 'paymentsPage.rows.approved21Jul',
    matchedTo: 'PO-0027',
    dueLabelKey: 'paymentsPage.due.in3Days',
    dueTone: 'soon',
    amount: '404.790',
  },
  {
    id: 'SP-INV-1140',
    supplierId: 'sohar',
    reference: 'SP-INV-1140',
    approvedOn: 'paymentsPage.rows.approved24Jul',
    matchedTo: 'PO-0031',
    dueLabelKey: 'paymentsPage.due.in3Days',
    dueTone: 'soon',
    amount: '3,140.000',
  },
  {
    id: 'NH-4471',
    supplierId: 'nizwa',
    reference: 'NH-4471',
    approvedOn: 'paymentsPage.rows.approved30Jul',
    matchedTo: 'paymentsPage.rows.noOrder',
    dueLabelKey: 'paymentsPage.due.twoDaysLate',
    dueTone: 'late',
    amount: '191.720',
  },
  {
    id: 'MZ-INV-7801',
    supplierId: 'mazoon',
    reference: 'MZ-INV-7801',
    approvedOn: 'paymentsPage.rows.approved26Jul',
    matchedTo: 'paymentsPage.rows.noOrder',
    dueLabelKey: 'paymentsPage.due.in5Days',
    dueTone: 'soon',
    amount: '318.400',
  },
]

export const BLOCKED_BILLS: BlockedBill[] = [
  {
    id: 'GCL-2288',
    supplier: 'Gulf Cold Logistics',
    reference: 'GCL-2288',
    reasonKey: 'paymentsPage.blocked.onHold',
    amount: '411.500',
  },
  {
    id: 'AND-INV-3388',
    supplier: 'Al Noor Dates LLC',
    reference: 'AND-INV-3388',
    reasonKey: 'paymentsPage.blocked.mismatch',
    amount: '933.900',
  },
]

export type DueWindow = 'thisWeek' | 'twoWeeks' | 'endOfMonth' | 'everything'

export const DUE_WINDOWS: { id: DueWindow; labelKey: string }[] = [
  { id: 'thisWeek', labelKey: 'paymentsPage.window.thisWeek' },
  { id: 'twoWeeks', labelKey: 'paymentsPage.window.twoWeeks' },
  { id: 'endOfMonth', labelKey: 'paymentsPage.window.endOfMonth' },
  { id: 'everything', labelKey: 'paymentsPage.window.everything' },
]

/** Which bills each window sweeps in. `everything` takes the lot. */
export const WINDOW_BILLS: Record<DueWindow, string[]> = {
  thisWeek: ['MR-INV-8790', 'SP-INV-1140', 'NH-4471', 'MZ-INV-7801'],
  twoWeeks: ['MR-INV-8790', 'SP-INV-1140', 'NH-4471', 'MZ-INV-7801'],
  endOfMonth: ['MR-INV-8790', 'SP-INV-1140', 'NH-4471', 'MZ-INV-7801', 'MR-INV-8821'],
  everything: RUN_BILLS.map((bill) => bill.id),
}

export type BankFormat = 'csv' | 'iso20022' | 'printed'

export const BANK_FORMATS: { id: BankFormat; titleKey: string; noteKey: string }[] = [
  { id: 'csv', titleKey: 'paymentsPage.format.csv', noteKey: 'paymentsPage.format.csvNote' },
  { id: 'iso20022', titleKey: 'paymentsPage.format.iso', noteKey: 'paymentsPage.format.isoNote' },
  {
    id: 'printed',
    titleKey: 'paymentsPage.format.printed',
    noteKey: 'paymentsPage.format.printedNote',
  },
]

export const PAY_FROM_ACCOUNTS = [
  { value: 'bm-4471', label: 'Bank Muscat · ···4471' },
  { value: 'nbo-8820', label: 'National Bank of Oman · ···8820' },
  { value: 'sohar-2210', label: 'Sohar International · ···2210' },
]

/* ------------------------------------------------------------------ helpers */

/** `2,354.310` → 2354.31. Display strings are the only amounts the run holds. */
export const amountValue = (amount: string) => Number(amount.replace(/,/g, '')) || 0

/** Back to the display form, always at OMR's three decimals. */
export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/* ------------------------------------------------- the invoices in this run */

export type RunInvoiceSource = 'peppol' | 'uploaded' | 'scanned'

export type RunInvoice = {
  id: string
  supplierId: string
  reference: string
  dateLine: string
  source: RunInvoiceSource
  amount: string
  /** What the run will actually transfer, once any early-settlement discount is taken. */
  payingAmount: string
  net: string
  vat: string
  checks: string[]
  /** Present only when settling early changes the figure. */
  discountNoteKey?: string
  /** The document as the supplier issued it. */
  sheet: {
    address: string
    vat: string
    cr: string
    issued: string
    due: string
    order: string
    delivered: string
    receipt: string
    lines: { description: string; qty: string; unit: string; vat: string; amount: string }[]
    paymentTerms: string
    paymentBold: string
    bank: string
  }
}

export const RUN_INVOICES: RunInvoice[] = [
  {
    id: 'MR-INV-8821',
    supplierId: 'muscat',
    reference: 'MR-INV-8821',
    dateLine: '29 Jul · due 28 Aug',
    source: 'peppol',
    amount: '2,354.310',
    payingAmount: '2,307.220',
    net: '2,242.200',
    vat: '112.110',
    checks: [
      'paymentsInvoices.checks.matchesDocument',
      'paymentsInvoices.checks.matchedTo',
      'paymentsInvoices.checks.approvedBy',
    ],
    discountNoteKey: 'paymentsInvoices.discountNote',
    sheet: {
      address: 'Rusayl Industrial Estate, Muscat',
      vat: 'OM1100447102',
      cr: '1104472',
      issued: '29 Jul 2026',
      due: '28 Aug 2026',
      order: 'PO-0031',
      delivered: '28 Jul',
      receipt: 'GRN-0087',
      lines: [
        {
          description: 'Green beans — Yirgacheffe',
          qty: '300 KG',
          unit: '7.400',
          vat: '5%',
          amount: '2,220.000',
        },
        {
          description: 'Jute sacks — 25 kg',
          qty: '12 EA',
          unit: '1.850',
          vat: '5%',
          amount: '22.200',
        },
      ],
      paymentTerms: 'Net 30 days.',
      paymentBold: '2% discount if settled by 5 Aug 2026.',
      bank: 'Bank Muscat · IBAN OM55 0018 0000 4471 2290 · BIC BMUSOMRX',
    },
  },
  {
    id: 'MR-INV-8790',
    supplierId: 'muscat',
    reference: 'MR-INV-8790',
    dateLine: '21 Jul · due 2 Aug',
    source: 'peppol',
    amount: '404.790',
    payingAmount: '404.790',
    net: '385.514',
    vat: '19.276',
    checks: [
      'paymentsInvoices.checks.matchesDocument',
      'paymentsInvoices.checks.matchedTo8790',
      'paymentsInvoices.checks.approvedBy21',
    ],
    sheet: {
      address: 'Rusayl Industrial Estate, Muscat',
      vat: 'OM1100447102',
      cr: '1104472',
      issued: '21 Jul 2026',
      due: '2 Aug 2026',
      order: 'PO-0027',
      delivered: '20 Jul',
      receipt: 'GRN-0081',
      lines: [
        {
          description: 'Green beans — Sidamo',
          qty: '50 KG',
          unit: '7.400',
          vat: '5%',
          amount: '370.000',
        },
        {
          description: 'Jute sacks — 25 kg',
          qty: '2 EA',
          unit: '1.850',
          vat: '5%',
          amount: '3.700',
        },
      ],
      paymentTerms: 'Net 14 days.',
      paymentBold: 'No early-settlement discount on this one.',
      bank: 'Bank Muscat · IBAN OM55 0018 0000 4471 2290 · BIC BMUSOMRX',
    },
  },
  {
    id: 'SP-INV-1140',
    supplierId: 'sohar',
    reference: 'SP-INV-1140',
    dateLine: '24 Jul · due 3 Aug',
    source: 'uploaded',
    amount: '3,140.000',
    payingAmount: '3,140.000',
    net: '2,990.476',
    vat: '149.524',
    checks: [
      'paymentsInvoices.checks.matchesDocument',
      'paymentsInvoices.checks.matchedByHand',
      'paymentsInvoices.checks.approvedBy30',
    ],
    sheet: {
      address: 'Industrial Area 4, Sohar',
      vat: 'OM1100628391',
      cr: '1163281',
      issued: '24 Jul 2026',
      due: '3 Aug 2026',
      order: 'PO-0031',
      delivered: '23 Jul',
      receipt: 'GRN-0085',
      lines: [
        {
          description: 'Kraft coffee bags 1kg, printed',
          qty: '8,000 EA',
          unit: '0.240',
          vat: '5%',
          amount: '1,920.000',
        },
        {
          description: 'Kraft coffee bags 250g, printed',
          qty: '12,164 EA',
          unit: '0.088',
          vat: '5%',
          amount: '1,070.476',
        },
      ],
      paymentTerms: 'Net 10 days.',
      paymentBold: 'Pay by 3 Aug to keep the account current.',
      bank: 'Bank Muscat · IBAN OM90 0018 0000 6283 91',
    },
  },
  {
    id: 'NH-4471',
    supplierId: 'nizwa',
    reference: 'NH-4471',
    dateLine: '30 Jul · overdue',
    source: 'scanned',
    amount: '191.720',
    payingAmount: '191.720',
    net: '182.590',
    vat: '9.130',
    checks: [
      'paymentsInvoices.checks.readFromPhoto',
      'paymentsInvoices.checks.noOrder',
      'paymentsInvoices.checks.approvedBy30',
    ],
    sheet: {
      address: 'Souq Road, Nizwa',
      vat: 'OM1100773310',
      cr: '1188341',
      issued: '30 Jul 2026',
      due: '30 Jul 2026',
      order: '—',
      delivered: '30 Jul',
      receipt: '—',
      lines: [
        {
          description: 'Workshop consumables',
          qty: '1 EA',
          unit: '182.590',
          vat: '5%',
          amount: '182.590',
        },
      ],
      paymentTerms: 'Due on receipt.',
      paymentBold: 'Already two days past.',
      bank: 'Bank Muscat · IBAN OM31 0018 0000 7733 10',
    },
  },
  {
    id: 'MZ-INV-7801',
    supplierId: 'mazoon',
    reference: 'MZ-INV-7801',
    dateLine: '26 Jul · due 5 Aug',
    source: 'peppol',
    amount: '318.400',
    payingAmount: '318.400',
    net: '303.238',
    vat: '15.162',
    checks: [
      'paymentsInvoices.checks.matchesDocument',
      'paymentsInvoices.checks.noOrder',
      'paymentsInvoices.checks.approvedBy26',
    ],
    sheet: {
      address: 'Nizwa Distribution Centre',
      vat: 'OM1100901220',
      cr: '1201884',
      issued: '26 Jul 2026',
      due: '5 Aug 2026',
      order: '—',
      delivered: '—',
      receipt: '—',
      lines: [
        {
          description: 'Electricity — roastery, July',
          qty: '1 EA',
          unit: '303.238',
          vat: '5%',
          amount: '303.238',
        },
      ],
      paymentTerms: 'Net 10 days.',
      paymentBold: 'Late payment attracts a reconnection fee.',
      bank: 'Bank Muscat · IBAN OM77 0018 0000 9012 20',
    },
  },
]
