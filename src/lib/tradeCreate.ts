/**
 * Trade document creation forms.
 *
 * Four screens share one shape — pick a direction, say what the document is against, list the
 * lines, then the details and notes:
 *   New sales order      (Figma 68:42177)
 *   New purchase order   (Figma 68:42691)
 *   New delivery note    (Figma 68:41721)
 *   New purchase receipt (Figma 68:43204)
 */

export type OrderFormMode = 'sales' | 'purchase'

export type OrderLine = {
  id: string
  description: string
  unitPrice: string
  vat: string
  qty: string
  unit: string
  discount: string
  total: string
}

export type OrderTotals = {
  subtotal: string
  discount: string
  net: string
  vat: string
  total: string
  totalLabelKey: string
}

/* ------------------------------------------------------- sales order */

export const NEW_SALES_ORDER = {
  id: 'SO-0075',
  sourceTitle: 'QUO-0118 · accepted 29 Jul',
  sourceMetaKey: 'tradeCreate.sales.sourceMeta',
  customer: 'Muscat Grand Hotel LLC',
  customerVat: 'VAT OM1100447102 · 0248:OM1100447102',
  lines: [
    {
      id: '1',
      description: 'Green beans — Yirgacheffe',
      unitPrice: '10.250',
      vat: '5%',
      qty: '600',
      unit: 'KG',
      discount: '8%',
      total: '5,658.000',
    },
    {
      id: '2',
      description: 'Roasting service — per batch',
      unitPrice: '4.200',
      vat: '5%',
      qty: '150',
      unit: 'EA',
      discount: '0',
      total: '630.000',
    },
  ] satisfies OrderLine[],
  totals: {
    subtotal: '6,780.000',
    discount: '492.000',
    net: '6,288.000',
    vat: '314.400',
    total: '6,602.400',
    totalLabelKey: 'tradeCreate.sales.quotedTotal',
  } satisfies OrderTotals,
  /** The summary rail totals differ from the line totals — quoted vs order value. */
  summary: {
    titleKey: 'tradeCreate.sales.orderValue',
    subtotal: '6,906.000',
    discount: '492.000',
    net: '6,414.000',
    vat: '320.700',
    total: '6,734.700',
    totalLabelKey: 'tradeCreate.sales.orderTotal',
  },
  delivery: {
    optionId: 'one',
    dueLabelKey: 'tradeCreate.sales.deliveryDue',
    due: '16 Aug 2026',
    deliverTo: 'Shatti Al Qurum, Muscat',
    dispatchFrom: 'Main store',
  },
  details: {
    orderNumber: 'SO-0075',
    orderDate: '30 Jul 2026',
    theirPo: 'MGH-PO-2027-014',
    theirPoHintKey: 'tradeCreate.sales.theirPoHint',
    paymentTerms: 'Net 30 days',
    currency: 'OMR — Omani Rial',
    branch: 'Al Bahja Coffee (Main',
  },
  noteToCustomer:
    'Prices held from QUO-0118. Roasting increased to 180 batches at your request on 29 Jul. Delivery in one drop before 16 August.',
  internalNote:
    'Green bean stock covers 400 kg — order the balance from Muscat Roastery by 05 Aug to make the drop date.',
}

/* ---------------------------------------------------- purchase order */

export const NEW_PURCHASE_ORDER = {
  id: 'PO-0032',
  sourceTitle: 'Their quote MR-Q-4471 · received 27 Jul',
  sourceMetaKey: 'tradeCreate.purchase.sourceMeta',
  supplier: 'Muscat Grand Hotel LLC',
  supplierVat: 'VAT OM1100447102 · 0248:OM1100447102',
  lines: [
    {
      id: '1',
      description: 'Green beans — Yirgacheffe',
      unitPrice: '7.400',
      vat: '5%',
      qty: '500',
      unit: 'KG',
      discount: '5%',
      total: '3,515.000',
    },
    {
      id: '2',
      description: 'Jute sacks — 25 kg',
      unitPrice: '1.850',
      vat: '5%',
      qty: '24',
      unit: 'EA',
      discount: '0',
      total: '44.400',
    },
  ] satisfies OrderLine[],
  totals: {
    subtotal: '3,744.400',
    discount: '185.000',
    net: '3,559.400',
    vat: '177.970',
    total: '3,737.370',
    totalLabelKey: 'tradeCreate.purchase.orderTotal',
  } satisfies OrderTotals,
  summary: {
    titleKey: 'tradeCreate.purchase.whatThisWillCost',
    subtotal: '3,744.400',
    discount: '185.000',
    net: '3,559.400',
    vat: '177.970',
    total: '3,737.370',
    totalLabelKey: 'tradeCreate.purchase.youWillOwe',
  },
  delivery: {
    optionId: 'one',
    dueLabelKey: 'tradeCreate.purchase.requiredBy',
    due: '12 Aug 2026',
    deliverTo: 'Main store — Way 3025, Al Khuwair',
    dispatchFrom: 'Sun–Thu, 07:00–13:00',
  },
  details: {
    orderNumber: 'PO-0032',
    orderDate: '30 Jul 2026',
    theirPo: 'MR-Q-4471',
    theirPoHintKey: '',
    paymentTerms: 'Net 30 days',
    currency: 'OMR — Omani Rial',
    branch: 'Al Bahja Coffee (Main',
  },
  noteToCustomer:
    'Please deliver Sun–Thu mornings only and quote PO-0032 on your delivery note and invoice. Beans must be roasted no earlier than 7 days before delivery.',
  internalNote:
    "Covers the Muscat Grand Hotel order SO-0075 plus 100 kg buffer. Sacks increased to 24 so we're not short if any split on the pallet.",
}

/* ----------------------------------------------------- delivery note */

export type ShipLine = {
  id: string
  name: string
  metaKey: string
  remaining: string
  remainingNoteKey: string
  shipping: string
  unit: string
  hintKey: string
  hintTone: 'link' | 'warn' | 'muted'
  checked: boolean
}

export const NEW_DELIVERY_NOTE = {
  id: 'GRN-0090',
  displayId: 'DN-0132',
  against: 'SO-0073 · Nizwa Souq Café',
  againstMetaKey: 'tradeCreate.deliveryNote.againstMeta',
  lines: [
    {
      id: '1',
      name: 'Green beans — House Blend',
      metaKey: 'tradeCreate.deliveryNote.line1Meta',
      remaining: '32 KG',
      remainingNoteKey: 'tradeCreate.deliveryNote.stillOwed',
      shipping: '24',
      unit: 'KG',
      hintKey: 'tradeCreate.deliveryNote.shipAll32',
      hintTone: 'link',
      checked: true,
    },
    {
      id: '2',
      name: 'Roasting service — per batch',
      metaKey: 'tradeCreate.deliveryNote.line2Meta',
      remaining: '24 EA',
      remainingNoteKey: 'tradeCreate.deliveryNote.stillOwed',
      shipping: '26',
      unit: 'EA',
      hintKey: 'tradeCreate.deliveryNote.moreThanOrdered',
      hintTone: 'warn',
      checked: true,
    },
    {
      id: '3',
      name: 'Takeaway cups — 500 pack',
      metaKey: 'tradeCreate.deliveryNote.line3Meta',
      remaining: '4 EA',
      remainingNoteKey: 'tradeCreate.deliveryNote.stillOwed',
      shipping: '0',
      unit: 'EA',
      hintKey: 'tradeCreate.deliveryNote.notOnThisDrop',
      hintTone: 'muted',
      checked: false,
    },
  ] satisfies ShipLine[],
  /** Shipping more than the order covers has to be resolved before the note can go out. */
  overshipWarningKey: 'tradeCreate.deliveryNote.overshipWarning',
  overshipHintKey: 'tradeCreate.deliveryNote.overshipHint',
  movement: {
    noteNumber: 'DN-0132',
    dispatchDate: '30 Jul 2026',
    dispatchTime: '06:30 PM',
    deliverTo: 'Nizwa Souq Café — Souq Street, Nizwa',
    dispatchedFrom: 'Main store',
    driver: 'Salim Al Hinai',
    taxCategory: 'Vehicle',
  },
  proofOptions: [
    {
      id: 'signature',
      titleKey: 'tradeCreate.deliveryNote.proofSignature',
      hintKey: 'tradeCreate.deliveryNote.proofSignatureHint',
      glyph: 'lines',
    },
    {
      id: 'photo',
      titleKey: 'tradeCreate.deliveryNote.proofPhoto',
      hintKey: 'tradeCreate.deliveryNote.proofPhotoHint',
      glyph: 'plus',
    },
    {
      id: 'paper',
      titleKey: 'tradeCreate.deliveryNote.proofPaper',
      hintKey: 'tradeCreate.deliveryNote.proofPaperHint',
      glyph: 'paper',
    },
  ],
  expectedToSign: 'Khalid Al Rashdi',
  contactOnArrival: '9XXX XXXX',
  summary: {
    titleKey: 'tradeCreate.deliveryNote.onThisNote',
    rows: [
      { label: 'Green beans', value: '24 KG' },
      { label: 'Roasting service', value: '26 EA' },
      { label: 'Takeaway cups', value: '2.790' },
    ],
    effectLabelKey: 'tradeCreate.deliveryNote.effectOn',
    beforePct: '60%',
    afterPct: '92%',
    percent: 92,
    noteKey: 'tradeCreate.deliveryNote.summaryNote',
  },
  noteToCustomer:
    'Bringing this week’s drop forward at your request. Beans roasted 29 Jul — please check seals on arrival and sign for the batch count.',
  internalNote:
    '2 extra roasting batches included — Hafidh approved as goodwill after last week’s late drop.',
}

/* -------------------------------------------------- purchase receipt */

export type ReceiptLine = {
  id: string
  name: string
  metaKey: string
  expected: string
  expectedNoteKey: string
  received: string
  unit: string
  statusKey: string
  status: 'full' | 'short'
  checked: boolean
}

export const NEW_PURCHASE_RECEIPT = {
  id: 'GRN-0090',
  against: 'PO-0028 · Sohar Packaging LLC',
  againstMetaKey: 'tradeCreate.receipt.againstMeta',
  lines: [
    {
      id: '1',
      name: 'Takeaway cups — 500 pack',
      metaKey: 'tradeCreate.receipt.line1Meta',
      expected: '60 EA',
      expectedNoteKey: 'tradeCreate.receipt.onTheOrder',
      received: '60',
      unit: 'EA',
      statusKey: 'tradeCreate.receipt.fullQuantity',
      status: 'full',
      checked: true,
    },
    {
      id: '2',
      name: 'Kraft paper bags — 1 kg',
      metaKey: 'tradeCreate.receipt.line2Meta',
      expected: '20 EA',
      expectedNoteKey: 'tradeCreate.receipt.onTheOrder',
      received: '17',
      unit: 'EA',
      statusKey: 'tradeCreate.receipt.threeShort',
      status: 'short',
      checked: true,
    },
    {
      id: '3',
      name: 'Cup lids — 500 pack',
      metaKey: 'tradeCreate.receipt.line3Meta',
      expected: '40 EA',
      expectedNoteKey: 'tradeCreate.receipt.onTheOrder',
      received: '40',
      unit: 'EA',
      statusKey: 'tradeCreate.receipt.fullQuantity',
      status: 'full',
      checked: true,
    },
  ] satisfies ReceiptLine[],
  shortReason: 'Damaged in transit',
  shortNoteKey: 'tradeCreate.receipt.shortNote',
  arrival: {
    fromLabelKey: 'tradeCreate.receipt.from',
    from: 'Sohar Packaging LLC',
    fromMeta: 'Sohar Industrial Estate',
    toLabelKey: 'tradeCreate.receipt.receivedAt',
    to: 'Main store',
    toMeta: 'Way 3025, Al Khuwair',
    receiptNumber: 'GRN-0090',
    arrivalDate: '30 Jul 2026',
    arrivalTime: '07:45',
    checkedInBy: 'Yusuf Al Balushi',
    theirNoteRef: 'SP-DN-11842',
    driverVehicle: '',
    driver: 'Salim Al Hinai',
    taxCategory: 'Vehicle',
  },
  conditionOptions: [
    {
      id: 'all',
      titleKey: 'tradeCreate.receipt.condAll',
      hintKey: 'tradeCreate.receipt.condAllHint',
      glyph: 'lines',
    },
    {
      id: 'issues',
      titleKey: 'tradeCreate.receipt.condIssues',
      hintKey: 'tradeCreate.receipt.condIssuesHint',
      glyph: 'plus',
    },
    {
      id: 'rejected',
      titleKey: 'tradeCreate.receipt.condRejected',
      hintKey: 'tradeCreate.receipt.condRejectedHint',
      glyph: 'rejected',
    },
  ],
  whatWasWrong:
    '3 bags of the 1 kg kraft stock arrived crushed and water-marked at one end of the pallet. Photographed before unloading and set aside — not taken into stock.',
  photosKey: 'tradeCreate.receipt.photosAttached',
  internalNote:
    'Driver acknowledged the damage and initialled our copy. Sohar Packaging to confirm whether they replace or credit the 3 bags before we settle the bill.',
  summary: {
    titleKey: 'tradeCreate.receipt.takenIntoStock',
    rows: [
      { label: 'Takeaway cups', value: '60 EA', alert: false },
      { label: 'Kraft paper bags', value: '17 of 20 EA', alert: true },
      { label: 'Cup lids', value: '40 EA', alert: false },
    ],
    effectLabelKey: 'tradeCreate.receipt.effectOn',
    beforePct: '0%',
    afterPct: '97%',
    percent: 97,
    noteKey: 'tradeCreate.receipt.summaryNote',
  },
}

/* --------------------------------------------- payment reminders */

export type ReminderStep = {
  id: string
  days: string
  titleKey: string
  toneKey: string
  tone: 'polite' | 'direct' | 'firm'
  subjectKey: string
  metaKey: string
}

export const PAYMENT_REMINDERS = {
  enabled: true,
  bannerTitleKey: 'reminders.bannerTitle',
  bannerNoteKey: 'reminders.bannerNote',
  scheduleTitleKey: 'reminders.scheduleTitle',
  scheduleHintKey: 'reminders.scheduleHint',
  steps: [
    {
      id: 's1',
      days: '+7',
      titleKey: 'reminders.steps.friendly',
      toneKey: 'reminders.tones.polite',
      tone: 'polite',
      subjectKey: 'reminders.steps.friendlySubject',
      metaKey: 'reminders.steps.friendlyMeta',
    },
    {
      id: 's2',
      days: '+14',
      titleKey: 'reminders.steps.followUp',
      toneKey: 'reminders.tones.direct',
      tone: 'direct',
      subjectKey: 'reminders.steps.followUpSubject',
      metaKey: 'reminders.steps.followUpMeta',
    },
    {
      id: 's3',
      days: '+30',
      titleKey: 'reminders.steps.finalNotice',
      toneKey: 'reminders.tones.firm',
      tone: 'firm',
      subjectKey: 'reminders.steps.finalNoticeSubject',
      metaKey: 'reminders.steps.finalNoticeMeta',
    },
  ] satisfies ReminderStep[],
  customerSees: {
    titleKey: 'reminders.customerSeesTitle',
    rows: [
      { n: '0', titleKey: 'reminders.sees.dueDate', noteKey: 'reminders.sees.dueDateNote' },
      { n: '1', titleKey: 'reminders.sees.day7', noteKey: 'reminders.sees.day7Note' },
      { n: '2', titleKey: 'reminders.sees.day14', noteKey: 'reminders.sees.day14Note' },
      { n: '3', titleKey: 'reminders.sees.day30', noteKey: 'reminders.sees.day30Note' },
    ],
  },
  rightNow: {
    titleKey: 'reminders.rightNowTitle',
    linkKey: 'reminders.viewQueue',
    rows: [
      { labelKey: 'reminders.now.overdue', value: '6' },
      { labelKey: 'reminders.now.queued', value: '4' },
      { labelKey: 'reminders.now.muted', value: '1' },
      { labelKey: 'reminders.now.sent', value: '11' },
    ],
  },
}
