/**
 * Self-billed invoice detail (Figma 13:48136).
 *
 * Three independent tracks sit at the top: how the document reached the supplier over
 * Peppol, whether the OTA accepted the Tax Data Document, and whether the supplier has
 * confirmed it. They can disagree — a document can be delivered and cleared while the
 * supplier still has not confirmed.
 */

export type TrackTone = 'success' | 'pending' | 'danger'

export type SelfBillTrack = {
  id: string
  labelKey: string
  value: string
  tone: TrackTone
  /** Optional Peppol response code chip beside the value. */
  code?: string
  note: string
}

export type TimelineTone = 'current' | 'done'

export type SelfBillEvent = {
  id: string
  title: string
  detail: string
  timestamp: string
  tone: TimelineTone
  /** Explanatory callout under the entry, tinted #f4f6fb on #eaedf8. */
  callout?: string
}

export const SELF_BILL_DETAIL = {
  id: 'SB-0114',
  status: { labelKey: 'selfBillDetail.status.awaitingConfirmation', tone: 'pending' as TrackTone },
  raisedFor: 'Al Noor Dates LLC',
  issued: 'issued 24 Jul 2026',
  billedTo: 'Muscat Grand Hotel LLC',
  tracks: [
    {
      id: 'peppol',
      labelKey: 'selfBillDetail.tracks.peppol',
      value: 'Delivered',
      tone: 'success' as TrackTone,
      code: 'AB',
      note: 'Accepted with warnings · 24 Jul, 09:44',
    },
    {
      id: 'ota',
      labelKey: 'selfBillDetail.tracks.ota',
      value: 'TDD accepted',
      tone: 'success' as TrackTone,
      note: 'Reported in 4 min, inside the 15-minute window',
    },
    {
      id: 'supplier',
      labelKey: 'selfBillDetail.tracks.supplier',
      value: 'Awaiting · 6 days',
      tone: 'pending' as TrackTone,
      note: 'Al Noor Dates has not confirmed or disputed yet',
    },
  ] satisfies SelfBillTrack[],
  seller: { name: 'Muscat Grand Hotel LLC', noteKey: 'selfBillDetail.parties.sellerNote' },
  buyer: { name: 'Al Bahja Coffee', noteKey: 'selfBillDetail.parties.buyerNote' },
  fields: {
    issueDate: '24 Jul 2026',
    supplyDate: '22 Jul 2026',
    paymentDue: '23 Aug 2026',
    agreement: 'SBA-2025-011',
    agreementNote: 'Expires in 9 days',
    receivingBranch: 'Al Bahja Coffee (Main)',
    purchaseOrder: 'PO-88301',
  },
  items: [
    {
      id: '1',
      description: 'Cappuccino - Large',
      meta: 'EA · Catalog #BV-014',
      unitPrice: '1.8',
      vat: '5%',
      qty: '12',
      unit: 'EA',
      discount: '0',
      total: '21.600',
    },
    {
      id: '2',
      description: 'Coffee Beans 1kg - House Blend',
      meta: 'KG · Catalog #BN-002',
      unitPrice: '9.500',
      vat: '5%',
      qty: '4',
      unit: 'KG',
      discount: '10%',
      total: '34.200',
    },
  ],
  totals: {
    subtotal: 'OMR 59.600',
    discount: '− OMR 3.800',
    net: 'OMR 55.800',
    vat: 'OMR 2.790',
    total: 'OMR 58.590',
  },
  summary: {
    subtotal: '59.600',
    discount: '3.800',
    net: '55.800',
    vat: '2.790',
    total: '58.590',
  },
  /** Newest first, as drawn — the open item sits at the top in sand, the rest in green. */
  timeline: [
    {
      id: 'e5',
      title: 'Waiting for Al Noor Dates to confirm',
      detail:
        'They can confirm, or dispute a line if something is wrong. Nothing further happens automatically.',
      timestamp: 'Open for 6 days',
      tone: 'current' as TimelineTone,
    },
    {
      id: 'e4',
      title: 'Tax Data Document accepted by the Oman Tax Authority',
      detail: 'Submitted to C5 and acknowledged in 4 minutes, well inside the 15-minute window.',
      timestamp: '24 Jul 2026 · 09:48',
      tone: 'done' as TimelineTone,
    },
    {
      id: 'e3',
      title: 'Delivered to Al Noor Dates over Peppol',
      detail: 'Their access point returned status AB.',
      timestamp: '24 Jul 2026 · 09:44',
      tone: 'done' as TimelineTone,
      callout:
        'AB means accepted with warnings. The document arrived and is valid. Their system flagged that the delivery address on line 1 differs from the one they hold — nothing you need to fix.',
    },
    {
      id: 'e2',
      title: 'Validated and signed',
      detail:
        'Passed all five layers against PINT-OM self-billing, then signed with your Peppol certificate.',
      timestamp: '24 Jul 2026 · 09:41',
      tone: 'done' as TimelineTone,
    },
    {
      id: 'e1',
      title: 'Draft created',
      detail: 'By Hafidh Saif, from goods received note GRN-4468.',
      timestamp: '24 Jul 2026 · 09:12',
      tone: 'done' as TimelineTone,
    },
  ] satisfies SelfBillEvent[],
  attachments: [
    {
      id: 'a1',
      kind: 'pdf' as const,
      name: 'Readable copy',
      meta: 'Purchase order · 248 KB · Uploaded 18 Jul 2026',
    },
    {
      id: 'a2',
      kind: 'jpg' as const,
      name: 'Signed delivery note — 18 Jul.jpg',
      meta: 'Delivery note · 1.2 MB · Uploaded 18 Jul 2026',
    },
  ],
}
