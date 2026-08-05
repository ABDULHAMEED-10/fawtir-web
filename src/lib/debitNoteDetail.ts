/**
 * Debit note detail (Figma 13:45288).
 *
 * The charge joins the original invoice's balance rather than standing alone, so the
 * summary shows "now due on the invoice" and every figure carries a green "+".
 */

export type DebitTimelineTone = 'open' | 'done'

export type DebitEvent = {
  id: string
  title: string
  detail: string
  tone: DebitTimelineTone
}

export const DEBIT_NOTE_DETAIL = {
  id: 'DBN-0043',
  statusKey: 'debitNoteDetail.status.awaitingPayment',
  reversing: 'INV-2044',
  customer: 'Muscat Grand Hotel LLC',
  customerShort: 'Muscat Grand Hotel',
  amount: {
    total: '3.150',
    debitTotal: '3.150',
    addedTo: '3.150',
    nowDue: '31.740',
    bannerAmount: '31.740',
  },
  adjusts: {
    invoice: 'INV-2044',
    chipKey: 'debitNoteDetail.balanceIncreased',
    meta: 'Original total OMR 58.590 · issued 18 Jul 2026 · OMR 30.000 already paid',
  },
  customerCard: {
    name: 'Muscat Grand Hotel LLC',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
  },
  fields: {
    number: 'DBN-0043',
    issueDate: '30 Jul 2026',
    paymentDue: '29 Aug 2026',
    concerningInvoice: 'INV-2044',
    poReference: 'PO-88213',
    taxCategory: 'Standard rate · 5%',
  },
  reason: { chip: 'Undercharged', detail: 'Contract amendment CA-2026-03' },
  items: [
    {
      id: '1',
      description: 'Coffee Beans 1kg - House Blend',
      meta: 'Price correction 9.500 → 10.250 · originally line 2 of INV-2044',
      difference: '0.750',
      vat: '5%',
      qty: '4',
      unit: 'KG',
      discount: '10%',
      total: '3.000',
    },
  ],
  totals: { net: '3.000', vat: '0.150', total: '3.150' },
  notes: {
    customer:
      'House Blend was invoiced at the old contract rate of 9.500/kg. The rate agreed from 1 July is 10.250/kg, so this note charges the 0.750/kg difference on 4 kg.',
    internal:
      "Rate change signed off by Hafidh on 28 Jul. Flagged to Aisha to reprice the remaining Ramadan supply schedule so this doesn't recur.",
  },
  refund: {
    amount: '3.150',
    labelKey: 'debitNoteDetail.refunds.awaitingPayment',
    hint: "Added to INV-2044's balance. Muscat Grand Hotel owes OMR 31.740 in total, due 29 Aug 2026.",
  },
  /** Newest first — the open item sits at the top in sand, the rest in green. */
  activity: [
    {
      id: 'a4',
      title: 'Awaiting payment',
      detail: 'Due 29 Aug 2026 · no reminder sent yet',
      tone: 'open' as DebitTimelineTone,
    },
    {
      id: 'a3',
      title: 'Reported to the OTA — TDD accepted',
      detail: 'Additional VAT of OMR 0.150 declared · 30 Jul 2026, 14:26',
      tone: 'done' as DebitTimelineTone,
    },
    {
      id: 'a2',
      title: 'Delivered over Peppol',
      detail: "Accepted by Muscat Grand Hotel's access point · 30 Jul 2026, 14:22",
      tone: 'done' as DebitTimelineTone,
    },
    {
      id: 'a1',
      title: 'Debit note issued',
      detail: 'Hafidh Saif · reason: undercharged · 30 Jul 2026, 14:21',
      tone: 'done' as DebitTimelineTone,
    },
  ] satisfies DebitEvent[],
}
