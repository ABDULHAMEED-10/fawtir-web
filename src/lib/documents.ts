/**
 * The archive — Compliance › Documents (Figma 86:13619, 86:13843, 86:14466).
 *
 * Oman VAT Law requires every invoice, bill and tax document to be kept for ten years, and
 * fifteen where property is involved. This screen is where that obligation is visible: what is
 * held, how long it still has to run, and proof that nothing has been altered in the meantime.
 * Nothing here can be edited or deleted while its retention is running.
 */

/** What a record is, which decides its retention and which tab it falls under. */
export type DocKind = 'salesInvoice' | 'billReceived' | 'creditNote' | 'debitNote' | 'contract'

/** Where the record stands with the Tax Authority, or why it cannot be deleted. */
export type DocStatus = 'tddAccepted' | 'tddRejected' | 'legalHold' | 'contract'

/** The file formats a record holds, shown as tags. */
export type DocFormat = 'XML' | 'TDD' | 'PDF' | 'QR' | 'MLS' | 'MDN' | 'V2'

export type DocFile = {
  id: string
  name: string
  noteKey: string
  /** Size in KB, so the record's own total can be summed rather than asserted. */
  kb: number
  icon: 'xml' | 'tdd' | 'pdf' | 'qr' | 'mls'
  /** Every stored file is fingerprinted; a false here would be the alarm. */
  verified: boolean
}

export type DocRecord = {
  id: string
  title: string
  party: string
  kind: DocKind
  /** The line under the title — "Sales invoice · issued 23 Jun 2026 · OMR 318.780". */
  metaKey: string
  meta: Record<string, string>
  formats: DocFormat[]
  /** Empty for uploads, which carry no statutory term. */
  keptUntil: string
  keptNoteKey: string
  keptNote?: Record<string, string>
  status: DocStatus
  files: DocFile[]
  /** Uploads are versioned rather than filed, so they count versions instead of files. */
  versions?: number
}

export type DocTabId = 'all' | 'salesInvoices' | 'billsReceived' | 'legalHold'

export const DOC_TABS: { id: DocTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'documents.tabs.all' },
  { id: 'salesInvoices', labelKey: 'documents.tabs.salesInvoices' },
  { id: 'billsReceived', labelKey: 'documents.tabs.billsReceived' },
  { id: 'legalHold', labelKey: 'documents.tabs.legalHold' },
]

const invoiceFiles = (ref: string, pdfKb: number, withMls = true): DocFile[] => [
  {
    id: `${ref}-xml`,
    name: `${ref}.xml`,
    noteKey: 'documents.files.xml',
    kb: 18,
    icon: 'xml',
    verified: true,
  },
  {
    id: `${ref}-tdd`,
    name: `${ref}-TDD.xml`,
    noteKey: 'documents.files.tdd',
    kb: 6,
    icon: 'tdd',
    verified: true,
  },
  {
    id: `${ref}-pdf`,
    name: `${ref}.pdf`,
    noteKey: 'documents.files.pdf',
    kb: pdfKb,
    icon: 'pdf',
    verified: true,
  },
  {
    id: `${ref}-qr`,
    name: `${ref}-qr.png`,
    noteKey: 'documents.files.qr',
    kb: 4,
    icon: 'qr',
    verified: true,
  },
  ...(withMls
    ? [
        {
          id: `${ref}-mls`,
          name: 'MLS responses',
          noteKey: 'documents.files.mls',
          kb: 3,
          icon: 'mls' as const,
          verified: true,
        },
      ]
    : []),
]

/**
 * Figma draws six rows but prints "Showing 6 of 10 records" and tab counts of 6 / 1 / 3.
 * The four rows it leaves off are carried here, so every count on the screen is a count of
 * something that actually exists rather than a number typed into the design.
 */
export const DOC_RECORDS: DocRecord[] = [
  {
    id: 'INV-2038',
    title: 'INV-2038',
    party: 'Nizwa Souq Café',
    kind: 'salesInvoice',
    metaKey: 'documents.meta.salesIssued',
    meta: { date: '23 Jun 2026', amount: '318.780' },
    formats: ['XML', 'TDD', 'PDF', 'QR', 'MLS'],
    keptUntil: '23 Jun 2036',
    keptNoteKey: 'documents.kept.yearsMonthsLeft',
    keptNote: { years: '9', months: '10' },
    status: 'tddAccepted',
    files: invoiceFiles('INV-2038', 142),
  },
  {
    id: 'INV-1842',
    title: 'INV-1842',
    party: 'Muscat Grand Properties',
    kind: 'salesInvoice',
    metaKey: 'documents.meta.salesLease',
    meta: { date: '11 Feb 2026', amount: '24,500.000' },
    formats: ['XML', 'TDD', 'PDF', 'QR'],
    keptUntil: '11 Feb 2041',
    keptNoteKey: 'documents.kept.propertyOnHold',
    status: 'legalHold',
    files: invoiceFiles('INV-1842', 168, false),
  },
  {
    id: 'MR-INV-8821',
    title: 'MR-INV-8821',
    party: 'Muscat Roastery Co',
    kind: 'billReceived',
    metaKey: 'documents.meta.billReceived',
    meta: { date: '29 Jul 2026', amount: '2,354.310' },
    formats: ['XML', 'TDD', 'PDF', 'MDN'],
    keptUntil: '29 Jul 2036',
    keptNoteKey: 'documents.kept.yearsLeft',
    keptNote: { years: '10' },
    status: 'tddAccepted',
    files: [
      {
        id: 'mr-xml',
        name: 'MR-INV-8821.xml',
        noteKey: 'documents.files.billXml',
        kb: 21,
        icon: 'xml',
        verified: true,
      },
      {
        id: 'mr-tdd',
        name: 'MR-INV-8821-TDD.xml',
        noteKey: 'documents.files.receiverTdd',
        kb: 6,
        icon: 'tdd',
        verified: true,
      },
      {
        id: 'mr-pdf',
        name: 'MR-INV-8821.pdf',
        noteKey: 'documents.files.pdf',
        kb: 96,
        icon: 'pdf',
        verified: true,
      },
      {
        id: 'mr-mdn',
        name: 'MDN receipt',
        noteKey: 'documents.files.mdn',
        kb: 2,
        icon: 'mls',
        verified: true,
      },
    ],
  },
  {
    id: 'AND-CN-0442',
    title: 'AND-CN-0442',
    party: 'Al Noor Dates LLC',
    kind: 'creditNote',
    metaKey: 'documents.meta.creditReceived',
    meta: { date: '30 Jul 2026', amount: '84.900', against: 'AND-INV-3382' },
    formats: ['XML', 'TDD', 'PDF'],
    keptUntil: '30 Jul 2036',
    keptNoteKey: 'documents.kept.yearsLeft',
    keptNote: { years: '10' },
    status: 'tddAccepted',
    files: [
      {
        id: 'cn-xml',
        name: 'AND-CN-0442.xml',
        noteKey: 'documents.files.creditXml',
        kb: 14,
        icon: 'xml',
        verified: true,
      },
      {
        id: 'cn-tdd',
        name: 'AND-CN-0442-TDD.xml',
        noteKey: 'documents.files.receiverTdd',
        kb: 6,
        icon: 'tdd',
        verified: true,
      },
      {
        id: 'cn-pdf',
        name: 'AND-CN-0442.pdf',
        noteKey: 'documents.files.pdf',
        kb: 74,
        icon: 'pdf',
        verified: true,
      },
    ],
  },
  {
    id: 'GCL-rate-card',
    title: 'Gulf Cold Logistics rate card',
    party: 'Gulf Cold Logistics',
    kind: 'contract',
    metaKey: 'documents.meta.uploadedContract',
    meta: { date: '4 Mar 2026' },
    formats: ['PDF', 'V2'],
    keptUntil: '',
    keptNoteKey: 'documents.kept.noFixedTerm',
    status: 'contract',
    versions: 2,
    files: [
      {
        id: 'rc-v2',
        name: 'rate-card-2026.pdf',
        noteKey: 'documents.files.currentVersion',
        kb: 210,
        icon: 'pdf',
        verified: true,
      },
      {
        id: 'rc-v1',
        name: 'rate-card-2025.pdf',
        noteKey: 'documents.files.previousVersion',
        kb: 198,
        icon: 'pdf',
        verified: true,
      },
    ],
  },
  {
    id: 'INV-1993',
    title: 'INV-1993',
    party: 'Barka Beach Resort',
    kind: 'salesInvoice',
    metaKey: 'documents.meta.salesIssued',
    meta: { date: '8 Jun 2026', amount: '1,842.000' },
    formats: ['XML', 'TDD', 'PDF', 'QR'],
    keptUntil: '8 Jun 2036',
    keptNoteKey: 'documents.kept.yearsMonthsLeft',
    keptNote: { years: '9', months: '10' },
    status: 'tddRejected',
    files: invoiceFiles('INV-1993', 131, false),
  },
  {
    id: 'INV-2011',
    title: 'INV-2011',
    party: 'Al Hail Foodstuff',
    kind: 'salesInvoice',
    metaKey: 'documents.meta.salesIssued',
    meta: { date: '17 Jun 2026', amount: '906.150' },
    formats: ['XML', 'TDD', 'PDF', 'QR', 'MLS'],
    keptUntil: '17 Jun 2036',
    keptNoteKey: 'documents.kept.yearsMonthsLeft',
    keptNote: { years: '9', months: '10' },
    status: 'tddAccepted',
    files: invoiceFiles('INV-2011', 128),
  },
  {
    id: 'INV-1975',
    title: 'INV-1975',
    party: 'Sur Marine Services',
    kind: 'salesInvoice',
    metaKey: 'documents.meta.salesIssued',
    meta: { date: '2 Mar 2026', amount: '4,318.500' },
    formats: ['XML', 'TDD', 'PDF', 'QR'],
    keptUntil: '2 Mar 2036',
    keptNoteKey: 'documents.kept.auditOnHold',
    status: 'legalHold',
    files: invoiceFiles('INV-1975', 154, false),
  },
  {
    id: 'INV-1908',
    title: 'INV-1908',
    party: 'Ibri Traders LLC',
    kind: 'salesInvoice',
    metaKey: 'documents.meta.salesIssued',
    meta: { date: '14 Jan 2026', amount: '772.240' },
    formats: ['XML', 'TDD', 'PDF', 'QR'],
    keptUntil: '14 Jan 2036',
    keptNoteKey: 'documents.kept.auditOnHold',
    status: 'legalHold',
    files: invoiceFiles('INV-1908', 119, false),
  },
  {
    id: 'SP-DN-0074',
    title: 'SP-DN-0074',
    party: 'Sohar Packaging LLC',
    kind: 'debitNote',
    metaKey: 'documents.meta.debitReceived',
    meta: { date: '28 Jul 2026', amount: '100.800', against: 'SP-INV-1140' },
    formats: ['XML', 'TDD', 'PDF'],
    keptUntil: '28 Jul 2036',
    keptNoteKey: 'documents.kept.yearsLeft',
    keptNote: { years: '10' },
    status: 'tddAccepted',
    files: [
      {
        id: 'dn-xml',
        name: 'SP-DN-0074.xml',
        noteKey: 'documents.files.debitXml',
        kb: 15,
        icon: 'xml',
        verified: true,
      },
      {
        id: 'dn-tdd',
        name: 'SP-DN-0074-TDD.xml',
        noteKey: 'documents.files.receiverTdd',
        kb: 6,
        icon: 'tdd',
        verified: true,
      },
      {
        id: 'dn-pdf',
        name: 'SP-DN-0074.pdf',
        noteKey: 'documents.files.pdf',
        kb: 68,
        icon: 'pdf',
        verified: true,
      },
    ],
  },
]

export const DOC_TAB_KINDS: Record<DocTabId, (record: DocRecord) => boolean> = {
  all: () => true,
  salesInvoices: (record) => record.kind === 'salesInvoice',
  billsReceived: (record) => record.kind === 'billReceived',
  legalHold: (record) => record.status === 'legalHold',
}

/** Ledger-wide figures, which count far more than the page ever lists. */
export const DOC_STATS = {
  kept: '4,182',
  acrossDocuments: '1,047',
  spaceUsedGb: 2.8,
  quotaGb: 10,
  lastSweep: '30 Jul',
  onHold: 14,
  auditPeriod: 'Q1 2026',
}

export const totalKb = (record: DocRecord) =>
  record.files.reduce((sum, file) => sum + file.kb, 0)

/** `173` → "173 KB", `1400` → "1.4 MB". */
export const formatSize = (kb: number) =>
  kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`

export const PAGE_SIZE = 6

/* -------------------------------------------------------------- the detail */

export const DOC_DETAIL = {
  id: 'INV-2038',
  party: 'Nizwa Souq Café',
  issued: '23 Jun 2026',
  keptUntil: '23 Jun 2036',
  remainingKey: 'documents.detail.nineYearsTen',
  reasonKey: 'documents.detail.omanVatTenYears',
  legalHoldApplied: false,

  /** The signed XML, laid out to be read. */
  sheet: {
    number: 'INV-2038',
    typeKey: 'documents.detail.commercialInvoice',
    issued: '23 June 2026',
    due: '23 July 2026',
    currency: 'OMR',
    uuid: '8f3c-44a1-9d02-77be',
    sender: {
      name: 'Al Bahja Coffee LLC',
      vat: 'OM1100392000',
      peppol: '0248:OM1100392000',
      address: 'Souq Street, Nizwa',
    },
    receiver: {
      name: 'Nizwa Souq Café LLC',
      vat: 'OM1100392847',
      peppol: '0248:OM1100392847',
      order: 'NSC-PO-4471',
    },
    lines: [
      { item: 'Green beans — House Blend', qty: '24 KG', unit: '9.500', vat: '5%', amount: '228.000' },
      {
        item: 'Roasting service — per batch',
        qty: '18 EA',
        unit: '4.200',
        vat: '5%',
        amount: '75.600',
      },
    ],
    net: '303.600',
    vat: '15.180',
    total: '318.780',
    transport: {
      sentOver: 'Peppol AS4',
      profile: 'PINT-OM 1.0',
      deliveredAt: '23 Jun 2026, 09:15',
      validationKey: 'documents.detail.allFiveLayers',
    },
  },

  fingerprint: {
    takenAt: '23 Jun 2026, 09:14',
    lastCheckedKey: 'documents.detail.todayMatches',
    lastCheckedAt: '08:02',
    ofFile: 'INV-2038.XML',
    sha: 'a3f9c1e08b7d2465fe0c9a17b3d48e52\n7c61af90d2e8b4137a05c9fe6428db31',
  },

  relates: [
    {
      id: 'customer',
      icon: 'customer' as const,
      title: 'Nizwa Souq Café',
      noteKey: 'documents.detail.relates.customer',
      to: '/contacts/customers',
    },
    {
      id: 'SO-0073',
      icon: 'order' as const,
      title: 'SO-0073',
      noteKey: 'documents.detail.relates.order',
      to: '/trade-documents/order-forms/SO-0073',
    },
    {
      id: 'DN-0124',
      icon: 'delivery' as const,
      title: 'DN-0124',
      noteKey: 'documents.detail.relates.delivery',
      to: '/trade-documents/delivery-notes/DN-0124',
    },
  ],

  tags: ['Q2 2026', 'Wholesale'],

  opens: [
    {
      id: 'o1',
      initials: 'HS',
      titleKey: 'documents.detail.opens.hafidh',
      detailKey: 'documents.detail.opens.hafidhDetail',
    },
    {
      id: 'o2',
      initials: 'EX',
      titleKey: 'documents.detail.opens.sharedLink',
      detailKey: 'documents.detail.opens.sharedLinkDetail',
    },
    {
      id: 'o3',
      initials: 'YB',
      titleKey: 'documents.detail.opens.yusuf',
      detailKey: 'documents.detail.opens.yusufDetail',
    },
    {
      id: 'o4',
      initials: '',
      titleKey: 'documents.detail.opens.filed',
      detailKey: 'documents.detail.opens.filedDetail',
    },
  ],
}

/** The badge under each file in the detail's left rail. */
export const FILE_BADGE: Record<string, { labelKey: string; tone: 'blue' | 'green' | 'grey' }> = {
  xml: { labelKey: 'documents.detail.badges.signedPint', tone: 'blue' },
  tdd: { labelKey: 'documents.detail.badges.accepted', tone: 'green' },
  pdf: { labelKey: 'documents.detail.badges.enAr', tone: 'grey' },
  qr: { labelKey: 'documents.detail.badges.image', tone: 'grey' },
  mls: { labelKey: 'documents.detail.badges.twoMessages', tone: 'grey' },
}
