/**
 * One supplier bill, opened (Figma 86:16520).
 *
 * The screen answers three questions in order: did it arrive cleanly, does it agree with what
 * we ordered and received, and should we approve it. Everything on the page serves one of
 * those, which is why the decision panel sits at the top of the right-hand column.
 */

/** Where the bill has got to. Only one step is ever `current`. */
export type BillStepState = 'done' | 'current' | 'upcoming'

export type BillStep = {
  id: string
  labelKey: string
  /** Already formatted; an em dash where nothing has happened yet. */
  detail: string
  state: BillStepState
}

export type BillLine = {
  id: string
  item: string
  note: string
  qty: string
  unitPrice: string
  vat: string
  total: string
}

export type BillLinkedDoc = {
  id: string
  /** Present when the document is one we can open. */
  to?: string
  title: string
  kindKey: string
  detail: string
  icon: 'order' | 'receipt' | 'file'
}

export type BillActivityEvent = {
  id: string
  title: string
  detail: string
  /** The newest entry is the state the bill is in, drawn in brand blue. */
  tone: 'current' | 'done'
}

export const BILL_DETAIL = {
  id: 'MR-INV-8821',
  supplier: 'Muscat Roastery Co',
  issued: '29 Jul 2026',
  due: '28 Aug',
  order: 'PO-0031',
  total: '2,354.310',

  steps: [
    {
      id: 'arrived',
      labelKey: 'billDetail.steps.arrived',
      detail: '29 Jul · Peppol',
      state: 'done',
    },
    {
      id: 'matched',
      labelKey: 'billDetail.steps.matched',
      detail: 'billDetail.steps.automatically',
      state: 'done',
    },
    {
      id: 'approved',
      labelKey: 'billDetail.steps.approved',
      detail: 'billDetail.steps.waitingOnYou',
      state: 'current',
    },
    { id: 'scheduled', labelKey: 'billDetail.steps.scheduled', detail: '—', state: 'upcoming' },
    {
      id: 'paid',
      labelKey: 'billDetail.steps.paid',
      detail: 'billDetail.steps.due28Aug',
      state: 'upcoming',
    },
  ] satisfies BillStep[],

  /** The three-way match, which is the whole reason a bill can be approved without reading it. */
  threeWay: {
    ordered: { qty: '300 KG', note: 'OMR 7.400 per KG · PO-0031' },
    received: { qty: '300 KG', note: 'Checked in 28 Jul · GRN-0087' },
    billed: { qty: '300 KG', note: 'OMR 7.400 per KG · this bill' },
  },

  lines: [
    {
      id: '1',
      item: 'Green beans — Yirgacheffe',
      note: 'Received on GRN-0087',
      qty: '300 KG',
      unitPrice: '7.400',
      vat: '5%',
      total: '2,220.000',
    },
    {
      id: '2',
      item: 'Jute sacks — 25 kg',
      note: 'Received on GRN-0087',
      qty: '12 EA',
      unitPrice: '1.850',
      vat: '5%',
      total: '22.200',
    },
  ] satisfies BillLine[],

  totals: { net: '2,242.200', vat: '112.110', total: '2,354.310', vatRate: '5%' },

  linked: [
    {
      id: 'PO-0031',
      to: '/trade-documents/order-forms/PO-0031',
      title: 'PO-0031',
      kindKey: 'billDetail.linked.purchaseOrder',
      detail: 'Placed 20 Jul · approved by Hafidh Saif',
      icon: 'order',
    },
    {
      id: 'GRN-0087',
      to: '/trade-documents/delivery-notes/GRN-0087',
      title: 'GRN-0087',
      kindKey: 'billDetail.linked.purchaseReceipt',
      detail: 'Received 28 Jul · checked in by Yusuf Al Balushi',
      icon: 'receipt',
    },
    {
      id: 'xml',
      title: 'MR-INV-8821.xml',
      kindKey: 'billDetail.linked.originalFile',
      detail: 'billDetail.linked.originalFileDetail',
      icon: 'file',
    },
  ] satisfies BillLinkedDoc[],

  activity: [
    {
      id: 'a1',
      title: 'billDetail.activity.waiting',
      detail: 'billDetail.activity.waitingDetail',
      tone: 'current',
    },
    {
      id: 'a2',
      title: 'billDetail.activity.matched',
      detail: 'billDetail.activity.matchedDetail',
      tone: 'done',
    },
    {
      id: 'a3',
      title: 'billDetail.activity.reported',
      detail: 'billDetail.activity.reportedDetail',
      tone: 'done',
    },
    {
      id: 'a4',
      title: 'billDetail.activity.acknowledged',
      detail: 'billDetail.activity.acknowledgedDetail',
      tone: 'done',
    },
    {
      id: 'a5',
      title: 'billDetail.activity.arrived',
      detail: 'billDetail.activity.arrivedDetail',
      tone: 'done',
    },
  ] satisfies BillActivityEvent[],

  terms: {
    due: '28 Aug 2026',
    terms: 'Net 30 days',
    earlyPayment: '2% before 5 Aug',
    payTo: 'Bank Muscat ···2290',
    saving: 'billDetail.terms.saving',
  },

  compliance: [
    'billDetail.compliance.validTaxInvoice',
    'billDetail.compliance.pintOm',
    'billDetail.compliance.tddFiled',
    'billDetail.compliance.archived',
  ],

  supplierCard: {
    name: 'Muscat Roastery Co',
    vat: 'OM1100447102',
    theirRef: 'MR-INV-8821',
    openBills: '2 · OMR 2,759.100',
    paidOnTime: '11 of 11',
  },
}
