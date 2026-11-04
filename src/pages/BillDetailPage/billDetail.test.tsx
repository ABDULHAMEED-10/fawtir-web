import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  BillDetailDto,
  BillMatchDto,
  BillOverpaymentDto,
  BillRowDto,
} from '../../api/expenditure/bills'
import {
  activityOf,
  awaitingDiscountCreditNote,
  canRecordPayment,
  creditTargetsOf,
  decisionNoteOf,
  complianceOf,
  decisionsOf,
  discountLineOf,
  inputVatNoteKey,
  lineVatOf,
  overpaidOf,
  overpaymentStepOf,
  singleVatRate,
  stepsOf,
} from '../../lib/billDetail'
import type { InboundInvoiceDto } from '../../api/expenditure/inboundInvoice'
import type { ActivityDetailDto, ActivityItemDto } from '../../api/compliance/activity'
import { BillDetailPage } from './BillDetailPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const ID = '11111111-1111-1111-1111-111111111111'
const BILL_URL = `/api/v1/bills/${ID}`

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.approve',
    'invoice.payment.manage',
    'bill.settle',
    'purchase-order.read',
    'supplier.read',
  ],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['invoice.read'] }
// RL-4: the Accountant captures bills and records payments received, and does not settle them;
// the Finance Manager does (`bill.settle`).
const ACCOUNTANT: Entitlements = {
  ...ADMIN,
  username: 'accountant',
  roles: [{ id: 'r-2', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'purchase-order.read', 'supplier.read'],
}
const FINANCE_MANAGER: Entitlements = {
  ...ADMIN,
  username: 'finance',
  roles: [{ id: 'r-3', code: 'FINANCE_MANAGER', name: 'Finance Manager', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.approve',
    'invoice.payment.manage',
    'bill.settle',
    'purchase-order.read',
    'supplier.read',
  ],
}
const APPROVED: BillDetailDto['readiness'] = {
  state: 'READY',
  distinctApprovals: 2,
  required: 2,
  autoApproved: false,
}

function detail(overrides: Partial<BillDetailDto> = {}): BillDetailDto {
  const base: BillDetailDto = {
    bill: {
      id: ID,
      inboundDeliveryId: 'd-1',
      source: 'PEPPOL',
      networkVerified: true,
      supplierId: 's-1',
      supplierName: 'Qalhat Marine Supplies',
      documentTypeCode: '380',
      supplierBillNumber: 'QMS-7781',
      issueDate: '2026-09-01',
      dueDate: '2026-10-01',
      overdue: false,
      currencyCode: 'OMR',
      totalIncludingVat: 2354.31,
      vatAmount: 112.11,
      amountDue: 2354.31,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: 2354.31,
      purchaseOrderReference: 'PO-0031',
      workflowState: 'AWAITING_APPROVAL',
      complianceObligation: 'REPORTED_BY_SENDER',
      readiness: { state: 'PENDING', distinctApprovals: 1, required: 2, autoApproved: false },
      match: {
        verdict: 'MATCHED',
        purchaseOrderId: 'po-1',
        purchaseOrderNumber: 'PO-0031',
        goodsReceiptId: 'gr-1',
        goodsReceiptNumber: 'GRN-0087',
        byHand: false,
        summary: 'Quantities and prices agree',
        matchedAt: '2026-09-02T06:00:00Z',
      },
      hold: null,
      paymentRunReference: null,
      paidOnTheSpot: false,
    },
    lines: [
      {
        lineNo: 1,
        description: 'Green beans — Yirgacheffe',
        quantity: 300,
        unit: 'KG',
        unitPrice: 7.4,
        vatRate: 5,
        lineNet: 2220,
        purchaseOrderLineId: 'pol-1',
        goodsReceiptId: 'gr-1',
      },
    ],
    readiness: { state: 'PENDING', distinctApprovals: 1, required: 2, autoApproved: false },
    approvals: [
      {
        id: 'a-1',
        decision: 'APPROVED',
        reason: null,
        decidedBy: 'u-2',
        decidedAt: '2026-09-03T09:00:00Z',
      },
    ],
    hold: null,
    holdHistory: [],
    settlement: {
      billTotal: 2354.31,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: 2354.31,
      currency: 'OMR',
      paymentState: 'UNPAID',
      overdue: false,
      dueDate: '2026-10-01',
    },
    payments: [],
    paymentRunReference: null,
    intake: null,
    compliance: { source: 'PEPPOL', networkVerified: true, obligation: 'REPORTED_BY_SENDER' },
    activity: [
      { at: '2026-09-03T09:00:00Z', kind: 'APPROVED', detail: null, actor: 'u-2' },
      {
        at: '2026-09-02T06:00:00Z',
        kind: 'MATCHED',
        detail: 'MATCHED — Quantities and prices agree',
        actor: null,
      },
    ],
  }
  return { ...base, ...overrides }
}

const MATCH: BillMatchDto = {
  billId: ID,
  verdict: 'MATCHED',
  purchaseOrderId: 'po-1',
  purchaseOrderNumber: 'PO-0031',
  goodsReceiptId: 'gr-1',
  goodsReceiptNumber: 'GRN-0087',
  summary: 'Quantities and prices agree',
  byHand: false,
  matchedAt: '2026-09-02T06:00:00Z',
  comparison: [
    {
      description: 'Green beans — Yirgacheffe',
      orderedQuantity: 300,
      receivedQuantity: 300,
      billedQuantity: 300,
      unit: 'KG',
      orderedUnitPrice: 7.4,
      billedUnitPrice: 7.4,
    },
  ],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let billResponse: () => Response
let matchResponse: () => Response
let actionResponse: () => Response
let ordersResponse: () => Response
let supplierBank: () => unknown
let supplierOpenBills: number | undefined
let who: Entitlements
let inboundResponse: () => Response
let recordResponse: () => Response

// The bill fixture's `inboundDeliveryId` is 'd-1'; its delivery's Invoice UUID keys the record.
const DELIVERY_ID = 'd-1'
const CORRELATION_ID = '7c0e1d2a-0000-4000-8000-0000000000aa'
const INBOUND_URL = `/api/v1/inbound-invoices/${DELIVERY_ID}`
const RECORD_URL = `/api/v1/compliance/activity/${CORRELATION_ID}`

function inbound(overrides: Partial<InboundInvoiceDto> = {}): InboundInvoiceDto {
  return {
    id: DELIVERY_ID,
    correlationId: CORRELATION_ID,
    state: 'AVAILABLE',
    validationPassed: true,
    validationFailedLayer: null,
    receivedAt: '2026-09-01T08:00:00Z',
    acknowledgedAt: null,
    mlsCode: 'AB',
    mlsEmittedAt: '2026-09-02T08:00:00Z',
    mlsTransportState: 'DELIVERED',
    mlsDeliveredAt: '2026-09-02T08:00:05Z',
    ...overrides,
  }
}

type RecordOverrides = {
  tdd_leg?: Partial<NonNullable<ActivityItemDto['tdd_leg']>> | null
  invoice_leg?: Partial<ActivityItemDto['invoice_leg']>
  summary?: Partial<ActivityItemDto>
  links?: Partial<ActivityItemDto['links']>
}

/** The compliance record of the fixture's delivery: answered AB to the supplier, report accepted. */
function record(overrides: RecordOverrides = {}): ActivityDetailDto {
  const summary: ActivityItemDto = {
    invoice_uuid: CORRELATION_ID,
    direction: 'RECEIVED',
    document_kind: 'STANDARD_INVOICE',
    document_type_code: '380',
    invoice_number: 'QMS-2209',
    counterparty: '0248:OM1100447102',
    occurred_at: '2026-09-01T08:00:00Z',
    validated_at: '2026-09-01T08:00:00Z',
    b2c: false,
    transport_state: 'AVAILABLE',
    invoice_leg: {
      ack: 'AB',
      ack_at: '2026-09-02T08:00:00Z',
      reason: null,
      transport_state: 'DELIVERED',
      delivered_at: '2026-09-02T08:00:05Z',
      ...overrides.invoice_leg,
    },
    tdd_leg:
      overrides.tdd_leg === null
        ? null
        : {
            variant: 'SUBMIT',
            status: 'ACCEPTED',
            validated_at: '2026-09-01T08:00:00Z',
            sla_deadline: '2026-09-01T08:15:00Z',
            submitted_at: '2026-09-01T08:01:00Z',
            sla_met: true,
            ack: 'AP',
            ack_at: '2026-09-01T08:03:00Z',
            reason: null,
            delivered_at: '2026-09-01T08:02:00Z',
            transport_state: 'DELIVERED',
            correction_held: false,
            ...overrides.tdd_leg,
          },
    attention: false,
    links: {
      document: `/api/v1/inbound-invoices/${DELIVERY_ID}`,
      tdd_xml: `/api/v1/inbound-invoices/${DELIVERY_ID}/tdd`,
      resubmit: null,
      ...overrides.links,
    },
    ...overrides.summary,
  }
  return { invoice_uuid: CORRELATION_ID, summary, tdd_lineage: [], mls: [], transmissions: [] }
}

const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`,
  )

let creditNotesResponse: () => Response
let creditNoteReads: string[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  creditNotesResponse = () => json(200, { items: [], page: 0, size: 200, total: 0 })
  creditNoteReads = []
  billResponse = () => json(200, detail())
  matchResponse = () => json(200, MATCH)
  actionResponse = () => json(200, {})
  ordersResponse = () =>
    json(200, {
      items: [
        {
          id: 'po-2',
          number: 'PO-0044',
          state: 'RECEIVED',
          orderDate: '2026-08-20',
          currency: 'OMR',
          totalGross: 900.5,
        },
      ],
    })
  // The delivery record answers 404 to a person limited to some branches, which is what every test
  // that does not set it sees: the received facts are "not available".
  inboundResponse = () => json(404, { type: 'https://api.fawtir.om/problems/not-found' })
  recordResponse = () => json(200, record())
  supplierOpenBills = undefined
  supplierBank = () => ({
    beneficiaryName: 'Qalhat Marine Supplies',
    iban: 'OM90 0018 0000 6283 2290',
    bic: null,
    bankName: 'Bank Muscat',
    changedAt: null,
    confirmedAt: null,
  })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url.startsWith('/api/v1/purchase-orders')) return ordersResponse()
    // The supplier's record and standing, behind the Payment terms and Supplier cards.
    if (url === '/api/v1/suppliers/s-1')
      return json(200, {
        profile: {
          id: 's-1',
          displayName: 'Qalhat Marine Supplies',
          vatNumber: 'OM1100447102',
          paymentTerms: 'NET30',
          bankDetails: supplierBank(),
          earlyPaymentDiscountPercent: 2,
          earlyPaymentDiscountDays: 7,
        },
        invoiceAddress: null,
        sameAsInvoicingAddress: true,
        deliveryAddress: null,
      })
    if (url === '/api/v1/suppliers/s-1/overview')
      return json(200, {
        tabs: {
          bills: 2,
          payments: 1,
          orders: 3,
          documents: 0,
          ...(supplierOpenBills === undefined ? {} : { openBills: supplierOpenBills }),
        },
        match: { agreed: 2, orderBacked: 2, summary: null },
        usualLeadTimeDays: 8,
        payables: {
          currencyCode: 'OMR',
          notDue: { amount: 2354.31, bills: 1, nextDue: '2026-10-01' },
          dueSoon: { amount: 404.79, bills: 1, nextDue: '2026-09-28' },
          late: { amount: 0, bills: 0, nextDue: null },
          onHold: { amount: 0, bills: 0, nextDue: null },
          everLate: false,
          total: 2759.1,
        },
      })
    if (url.startsWith('/api/v1/credit-notes?')) {
      creditNoteReads.push(url)
      return creditNotesResponse()
    }
    if (url === `${BILL_URL}/match`) return method === 'GET' ? matchResponse() : actionResponse()
    if (url.startsWith(`${BILL_URL}/`)) return actionResponse()
    if (url === BILL_URL) return billResponse()
    if (url === INBOUND_URL && method === 'GET') return inboundResponse()
    if (url === RECORD_URL && method === 'GET') return recordResponse()
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderBill() {
  return render(
    <MemoryRouter initialEntries={[`/expenditure/bills/${ID}`]}>
      <Routes>
        <Route path="/expenditure/bills/:id" element={<BillDetailPage />} />
        <Route path="/expenditure/bills" element={<p>bills list</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('A bill, wired to the API', () => {
  it('shows the bill, its progress, its lines and what it still owes', async () => {
    renderBill()
    expect(await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })).toBeTruthy()
    // Named twice by design: beside the header and on the supplier card.
    expect(screen.getAllByText('Qalhat Marine Supplies')).toHaveLength(2)
    expect(screen.getByText('Waiting on approval · 1 of 2')).toBeTruthy()
    expect(screen.getByText('Arrived over Peppol')).toBeTruthy()
    expect(screen.getByText('1 of 2 approvals')).toBeTruthy()

    expect(screen.getByText('Green beans — Yirgacheffe')).toBeTruthy()
    expect(screen.getByText('Received on GRN-0087')).toBeTruthy()
    // Once in the three-way tiles, once in the supplier's own lines.
    expect(screen.getAllByText('300 KG').length).toBeGreaterThan(1)
    // Net is derived: the bill carries a total and its VAT, never a net of its own.
    expect(screen.getByText('2,242.200')).toBeTruthy()
    expect(screen.getByText('VAT · 5%')).toBeTruthy()
    expect(screen.getAllByText('2,354.310').length).toBeGreaterThan(0)
    expect(screen.getByText('Order, delivery and bill all agree')).toBeTruthy()

    // Payment terms and the supplier card, fed from the supplier's record and standing.
    // The supplier's record is a second read, started once the bill names the supplier.
    expect(await screen.findByText('2% before 8 Sept 2026')).toBeTruthy()
    expect(screen.getByText('Net 30 days')).toBeTruthy()
    expect(screen.getByText('Bank Muscat ···2290')).toBeTruthy()
    expect(screen.getByText('OM1100447102')).toBeTruthy()
    expect(screen.getByText(/2 · /)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'PO-0031' }).getAttribute('href')).toBe(
      '/expenditure/purchase-orders/po-1',
    )
    expect(screen.getByText('Received against PO-0031')).toBeTruthy()
  })

  it('says there are no bank details when the supplier record carries an account of nulls', async () => {
    // What the backend sends for a supplier with no bank account: the object, all nulls.
    supplierBank = () => ({
      beneficiaryName: null,
      iban: null,
      bic: null,
      bankName: null,
      changedAt: null,
      confirmedAt: null,
    })
    renderBill()
    expect(await screen.findByText('Net 30 days')).toBeTruthy()
    expect(screen.getByText('No bank details on file')).toBeTruthy()
  })

  it('never claims our receipt report without a status from the server', async () => {
    renderBill()
    // PINT-OM (om-tdd): the receiver reports what it received; the supplier's report does not
    // cover it, so without the status the card says it is not known.
    const line = await screen.findByText('Receipt report status not available')
    // Read inside the Compliance card: the app's own menu names its "TDD & OTA" screen.
    const card = within(line.closest('ul') as HTMLElement)
    expect(card.getByText('Delivered over the Peppol network and verified')).toBeTruthy()
    expect(card.queryByText(/Receipt reported to the Tax Authority/)).toBeNull()
    expect(card.queryByText(/supplier's provider/)).toBeNull()
    expect(card.queryByText(/TDD/)).toBeNull()
    expect(screen.queryByText(/Archived/)).toBeNull()
  })

  const selfBilled = (selfBilling: BillDetailDto['selfBilling']): BillDetailDto => ({
    ...detail(),
    bill: {
      ...detail().bill,
      source: 'SELF_BILLED',
      documentTypeCode: '389',
      inboundDeliveryId: null,
      issuedInvoiceId: 'sb-1',
    },
    intake: null,
    selfBilling,
    compliance: { source: 'SELF_BILLED', networkVerified: true, obligation: 'REPORTED_BY_SENDER' },
  })
  const AGREED = {
    issuedInvoiceId: 'sb-1',
    invoiceNumber: 'SB-2026-0007',
    agreementId: 'ag-1',
    agreementReference: 'SBA-2026-003',
  }

  it('says a self-billed bill was issued by you, under which agreement, and that its VAT is reclaimable', async () => {
    billResponse = () => json(200, selfBilled(AGREED))
    renderBill()
    const line = await screen.findByText("Issued by you through Fawtir on the supplier's behalf")
    const card = within(line.closest('ul') as HTMLElement)
    expect(card.getByText('Valid tax invoice: VAT is reclaimable')).toBeTruthy()
    // The agreement's reference is the link, and it leads to the self-billing document.
    expect(card.getByText(/^Self-billing agreement/)).toBeTruthy()
    const link = card.getByRole('link', { name: 'SBA-2026-003' })
    expect(link.getAttribute('href')).toBe('/expenditure/self-billing/sb-1')
    // None of the three lines that were wrong for a document this company issued itself.
    expect(card.queryByText(/Not validated/)).toBeNull()
    expect(card.queryByText(/No PINT-OM validation/)).toBeNull()
    expect(card.queryByText('No original file on record')).toBeNull()
    // No em dash in the owner's line.
    expect(card.queryByText(/—/)).toBeNull()
    // Those three are the whole block: nothing is "reported by the sender" on your own document.
    expect(card.getAllByRole('listitem')).toHaveLength(3)
    expect(card.queryByText(/Reported by the sender/)).toBeNull()
  })

  // Owner's answer 3 (2 Oct): a self-billed bill shows the document's lines under the self-bill
  // page's own heading, and the Activity block, from the self-billed document's history.
  const SELF_BILLED_LINES: BillDetailDto['lines'] = [
    {
      lineNo: 1,
      description: 'Haulage, Sohar to Muscat',
      quantity: 2,
      unit: 'EA',
      unitPrice: 150,
      vatRate: 5,
      lineNet: 300,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
      taxCategoryCode: 'S',
    },
    {
      lineNo: 2,
      description: 'Customs paperwork',
      quantity: 1,
      unit: 'EA',
      unitPrice: 176.19,
      vatRate: 0,
      lineNet: 176.19,
      purchaseOrderLineId: null,
      goodsReceiptId: null,
      taxCategoryCode: 'Z',
    },
  ]
  const SELF_BILLED_ACTIVITY = [
    { at: '2026-10-01T08:30:00Z', kind: 'APPROVED', detail: null, actor: 'u-2' },
    { at: '2026-10-01T08:00:00Z', kind: 'ISSUED', detail: null, actor: 'u-1' },
    { at: '2026-10-01T07:50:00Z', kind: 'DRAFT_CREATED', detail: null, actor: 'u-3' },
  ] as BillDetailDto['activity']

  it('shows a self-billed bill\'s lines under "Items supplied to you", not as sent by the supplier', async () => {
    billResponse = () =>
      json(200, { ...selfBilled(AGREED), lines: SELF_BILLED_LINES, activity: SELF_BILLED_ACTIVITY })
    renderBill()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Items supplied to you' })
    const card = within(heading.closest('section') as HTMLElement)
    expect(card.getByText('Haulage, Sohar to Muscat')).toBeTruthy()
    expect(card.getByText('Customs paperwork')).toBeTruthy()
    expect(card.getByText('2 EA')).toBeTruthy()
    expect(card.getByText('300.000')).toBeTruthy()
    expect(card.getByText('176.190', { selector: 'td.text-base' })).toBeTruthy()
    // The supplier sent nothing: this company issued the document.
    expect(screen.queryByRole('heading', { name: "What they're charging for" })).toBeNull()
    expect(screen.queryByText('as sent by the supplier')).toBeNull()
    expect(screen.queryByText('The supplier sent no lines with this bill.')).toBeNull()
  })

  it("shows a self-billed bill's Activity from the document's history, in the self-bill page's words", async () => {
    billResponse = () =>
      json(200, {
        ...selfBilled(AGREED),
        lines: SELF_BILLED_LINES,
        activity: [
          {
            at: '2026-10-02T06:10:00Z',
            kind: 'CANCELLED',
            detail: 'Raised against the wrong supplier',
            actor: 'u-2',
          },
          ...SELF_BILLED_ACTIVITY,
        ],
      })
    renderBill()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Activity' })
    const card = within(heading.closest('section') as HTMLElement)
    expect(card.getAllByRole('listitem')).toHaveLength(4)
    expect(card.getByText('Draft created')).toBeTruthy()
    expect(card.getByText('Cancelled')).toBeTruthy()
    expect(card.getByText(/^Raised against the wrong supplier · /)).toBeTruthy()
    // The signed-in user (u-1) issued it: "by you" is said as for every other entry.
    const issued = card.getByText('Issued').closest('li') as HTMLElement
    expect(within(issued).getByText(/by you/)).toBeTruthy()
    expect(card.getByText('Approved')).toBeTruthy()
    // Never the key itself.
    expect(card.queryByText(/billDetail\.activity/)).toBeNull()
  })

  it("reads a self-billed bill's heading and history in Arabic", async () => {
    await i18n.changeLanguage('ar')
    billResponse = () =>
      json(200, { ...selfBilled(AGREED), lines: SELF_BILLED_LINES, activity: SELF_BILLED_ACTIVITY })
    renderBill()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'البنود المورَّدة إليك' }),
    ).toBeTruthy()
    expect(screen.getByText('صدرت')).toBeTruthy()
    expect(screen.getByText('أُنشئت المسودة')).toBeTruthy()
    expect(screen.queryByText('كما أرسله المورد')).toBeNull()
  })

  it('never says "the supplier sent no lines" of a self-billed bill, from a server that sends none', async () => {
    // A server from before the change, or a document that can no longer be read: 200, no lines.
    billResponse = () => json(200, { ...selfBilled(AGREED), lines: [], activity: [] })
    renderBill()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Items supplied to you' }),
    ).toBeTruthy()
    expect(screen.queryByText('The supplier sent no lines with this bill.')).toBeNull()
    expect(screen.queryByText('as sent by the supplier')).toBeNull()
    expect(screen.getByText('Nothing has been recorded against this bill yet.')).toBeTruthy()
  })

  it("keeps the supplier's heading and empty line for a bill the supplier sent", async () => {
    billResponse = () => json(200, { ...detail(), lines: [] })
    renderBill()
    expect(
      await screen.findByRole('heading', { level: 2, name: "What they're charging for" }),
    ).toBeTruthy()
    expect(screen.getByText('as sent by the supplier')).toBeTruthy()
    expect(screen.getByText('The supplier sent no lines with this bill.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Items supplied to you' })).toBeNull()
  })

  it('says "Recorded" for an activity kind it has no wording for, never the key', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        activity: [
          { at: '2026-10-01T08:00:00Z', kind: 'SOMETHING_NEW', detail: null, actor: null },
        ],
      })
    renderBill()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Activity' })
    const card = within(heading.closest('section') as HTMLElement)
    expect(card.getByText('Recorded')).toBeTruthy()
    expect(card.queryByText(/SOMETHING_NEW/)).toBeNull()
  })

  it('says in words that a sent payment run took the bill out or was cancelled, with the run and the reason', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        activity: [
          {
            at: '2026-10-08T09:00:00Z',
            kind: 'PAYMENT_RUN_CANCELLED',
            detail: 'PR-0012 · The bank rejected the file',
            actor: 'u-2',
          },
          {
            at: '2026-10-07T09:00:00Z',
            kind: 'TAKEN_OUT_OF_PAYMENT_RUN',
            detail: 'PR-0011 · Credit note arrived',
            actor: 'u-2',
          },
        ],
      })
    renderBill()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Activity' })
    const card = within(heading.closest('section') as HTMLElement)
    expect(card.getByText('Payment run cancelled')).toBeTruthy()
    expect(card.getByText('Taken out of a payment run')).toBeTruthy()
    expect(card.getByText(/PR-0012 · The bank rejected the file/)).toBeTruthy()
    expect(card.queryByText(/PAYMENT_RUN_CANCELLED|TAKEN_OUT_OF_PAYMENT_RUN|Recorded/)).toBeNull()

    await act(() => i18n.changeLanguage('ar'))
    expect(await card.findByText('أُلغيت دفعة السداد')).toBeTruthy()
    // The owner's approved wording (PR2), masculine as the bill's activity line reads.
    expect(card.getByText('أُخرج من دفعة سداد')).toBeTruthy()
    expect(card.queryByText('أُخرجت من دفعة سداد')).toBeNull()
  })

  const scanned = (note: string | null | undefined): BillDetailDto => ({
    ...detail(),
    bill: { ...detail().bill, source: 'SCANNED', inboundDeliveryId: null, note },
    intake: {
      id: 'in-1',
      source: 'SCANNED',
      filename: 'receipt-4471.jpg',
      contentType: 'image/jpeg',
      uploadedAt: '2026-09-12T08:00:00Z',
    },
    compliance: {
      source: 'SCANNED',
      networkVerified: false,
      obligation: 'PENDING_COMPLIANCE_INPUT',
    },
  })
  const fileRow = async () =>
    (await screen.findByRole('button', { name: 'receipt-4471.jpg' })).closest('li') as HTMLElement

  it("shows a receipt's note as the sub-line of its row in Linked documents", async () => {
    billResponse = () => json(200, scanned('Fixing the drain behind the roastery'))
    renderBill()
    const row = within(await fileRow())
    const line = row.getByText('Note: Fixing the drain behind the roastery')
    // The row's own sub-line, in its own style: nothing new is drawn for the note.
    expect(line.tagName).toBe('P')
    expect(line.className).toContain('text-xs')
    expect(line.className).toContain('text-text-quaternary')
    expect(row.queryByText('The original file as the supplier sent it')).toBeNull()
  })

  it('cuts a long note to one line and keeps the whole of it on hover', async () => {
    const long = 'Drain cover, wire brush and sealant for the roastery floor. '.repeat(6).trim()
    billResponse = () => json(200, scanned(long))
    renderBill()
    const line = within(await fileRow()).getByText(`Note: ${long}`)
    expect(line.className).toContain('truncate')
    expect(line.getAttribute('title')).toBe(`Note: ${long}`)
  })

  it.each([[null], [undefined], ['   ']])(
    'leaves the row as it was when the bill has no note (%j)',
    async (note) => {
      billResponse = () => json(200, scanned(note))
      renderBill()
      const row = within(await fileRow())
      const line = row.getByText('The original file as the supplier sent it')
      expect(line.className).not.toContain('truncate')
      expect(line.getAttribute('title')).toBeNull()
      expect(screen.queryByText(/^Note:/)).toBeNull()
    },
  )

  it('reads the note line in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () => json(200, scanned('Drain cover'))
    renderBill()
    expect(await screen.findByText('ملاحظة: Drain cover')).toBeTruthy()
  })

  it('keeps the agreement line, as the link, when the document has no agreement on record', async () => {
    billResponse = () =>
      json(200, selfBilled({ ...AGREED, agreementId: null, agreementReference: null }))
    renderBill()
    await screen.findByText("Issued by you through Fawtir on the supplier's behalf")
    expect(
      screen.getByRole('link', { name: 'Self-billing agreement' }).getAttribute('href'),
    ).toBe('/expenditure/self-billing/sb-1')
  })

  it('reads the self-billed lines in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () => json(200, selfBilled(AGREED))
    renderBill()
    const line = await screen.findByText('أصدرتها أنت عبر فوتر نيابةً عن المورّد')
    const card = within(line.closest('ul') as HTMLElement)
    expect(card.getByText('فاتورة ضريبية صحيحة: ضريبة القيمة المضافة قابلة للاسترداد')).toBeTruthy()
    expect(card.getByText(/^اتفاقية فوترة ذاتية/)).toBeTruthy()
    expect(card.getByRole('link', { name: 'SBA-2026-003' }).getAttribute('href')).toBe(
      '/expenditure/self-billing/sb-1',
    )
  })

  it('says when our receipt report was accepted by the Tax Authority', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        compliance: {
          ...detail().compliance,
          receiptReport: {
            status: 'ACCEPTED',
            reportedAt: '2026-09-01T08:14:00Z',
            tddUuid: 'tdd-1',
          },
        },
      })
    renderBill()
    expect(await screen.findByText(/^Receipt reported to the Tax Authority · /)).toBeTruthy()
    expect(screen.queryByText('Receipt report status not available')).toBeNull()
  })

  it('shows a zero-rated and an exempt line with their reason codes, and no single VAT rate', async () => {
    const base = detail()
    billResponse = () =>
      json(200, {
        ...base,
        lines: [
          ...base.lines,
          {
            ...base.lines[0],
            lineNo: 2,
            description: 'Fresh dates',
            vatRate: 0,
            taxCategoryCode: 'Z',
            exemptionReasonCode: 'VATZR-OM-01',
          },
          {
            ...base.lines[0],
            lineNo: 3,
            description: 'Cargo insurance',
            vatRate: 0,
            taxCategoryCode: 'E',
            exemptionReasonCode: 'VATEX-OM-01',
          },
        ],
      })
    renderBill()
    expect(await screen.findByText('0% · Zero-rated')).toBeTruthy()
    expect(screen.getByText('0% · Exempt')).toBeTruthy()
    expect(screen.getByText('VATZR-OM-01')).toBeTruthy()
    expect(screen.getByText('VATEX-OM-01')).toBeTruthy()
    expect(screen.getByText('5%')).toBeTruthy()
    expect(screen.queryByText('VAT · 5%')).toBeNull()
  })

  it("names each line's VAT category from the letter the server sends: S, Z, E, O and none", async () => {
    const base = detail()
    const line = (
      lineNo: number,
      description: string,
      vatRate: number | null,
      code?: string | null,
    ) => ({
      ...base.lines[0],
      lineNo,
      description,
      vatRate,
      ...(code === undefined ? {} : { taxCategoryCode: code }),
    })
    billResponse = () =>
      json(200, {
        ...base,
        lines: [
          line(1, 'Standard line', 5, 'S'),
          line(2, 'Zero line', 0, 'Z'),
          line(3, 'Exempt line', 0, 'E'),
          line(4, 'Out of scope line', 0, 'O'),
          line(5, 'Null line', 5, null),
          line(6, 'Missing line', 0),
        ],
      })
    renderBill()
    const cell = async (description: string) =>
      (await screen.findByText(description)).closest('tr')!.querySelectorAll('td')[3].textContent
    // A standard line, and a line with no category, read as the rate alone, as before.
    expect(await cell('Standard line')).toBe('5%')
    expect(await cell('Null line')).toBe('5%')
    expect(await cell('Missing line')).toBe('0%')
    expect(await cell('Zero line')).toBe('0% · Zero-rated')
    expect(await cell('Exempt line')).toBe('0% · Exempt')
    expect(await cell('Out of scope line')).toBe('0% · Out of scope')
    // Categories mix, so the totals name no single rate.
    expect(screen.queryByText('VAT · 5%')).toBeNull()
  })

  it('says compliance input is pending for a bill nobody reported', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        compliance: {
          source: 'UPLOADED',
          networkVerified: false,
          obligation: 'PENDING_COMPLIANCE_INPUT',
        },
      })
    renderBill()
    expect(await screen.findByText(/No tax report from the supplier yet/)).toBeTruthy()
    expect(screen.queryByText(/Reported to the Tax Authority/)).toBeNull()
  })

  it('approves, and reloads the bill afterwards', async () => {
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Approve for payment' }))
    await waitFor(() => expect(calls()).toContain(`POST ${BILL_URL}/approval/approve`))
    expect(await screen.findByText('Approved.')).toBeTruthy()
    expect(calls().filter((call) => call === `GET ${BILL_URL}`)).toHaveLength(2)
  })

  it('will not reject without a reason, and says the supplier is not told', async () => {
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    // Figma puts Reject in the header and in the decision panel; either opens the same modal.
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    expect(await screen.findByText(/Nothing is sent to the supplier/)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Reject the bill' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Wrong quantity  ' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(calls()).toContain(`POST ${BILL_URL}/approval/reject`))
    const body = JSON.parse(
      String(
        fetchMock.mock.calls.find(
          ([url, init]) => url === `${BILL_URL}/approval/reject` && init,
        )?.[1]?.body,
      ),
    )
    expect(body).toEqual({ reason: 'Wrong quantity' })
  })

  it('reads a refusal as its own sentence, not as a generic failure', async () => {
    actionResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/approval-failed',
        error: 'APPROVAL_ALREADY_GIVEN',
        detail: 'nope',
      })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Approve for payment' }))
    expect(await screen.findByText(/already approved this bill/)).toBeTruthy()
  })

  it('holds and releases, and shows the reason a bill is held', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        hold: {
          id: 'h-1',
          reason: 'Disputed with the supplier',
          openedBy: 'u-2',
          openedAt: '2026-09-04T07:00:00Z',
          releasedBy: null,
          releasedAt: null,
        },
      })
    renderBill()
    expect(await screen.findByText(/On hold: “Disputed with the supplier”\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Put on hold' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Release' }))
    await waitFor(() => expect(calls()).toContain(`POST ${BILL_URL}/release`))
  })

  it('records a payment on an approved bill from the header, and reloads the bill', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T09:00:00Z'))
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    // Approved, so the Approve button has left the header and Record payment takes its place.
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    // The money goes to the supplier, so the dialog says paid, not received.
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByRole('textbox', { name: /Amount paid/ }) as HTMLInputElement
    expect(amount.value).toBe('2354.310')
    // The subtitle's amount carries the rial sign before it (E2E 10 Oct, F-14).
    const subtitle = within(dialog).getByText(
      (_, element) =>
        element?.tagName === 'P' &&
        /^Against QMS-7781 · .*still owed$/.test(element.textContent ?? ''),
    )
    expect(subtitle.querySelector('svg')).not.toBeNull()
    expect(subtitle.textContent).toMatch(/2,354\.310 still owed$/)
    expect(within(dialog).getByText('Paid on')).toBeTruthy()
    expect(within(dialog).queryByText(/Amount received|Received on/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(calls()).toContain(`POST ${BILL_URL}/payments`))
    const [, init] = fetchMock.mock.calls.find(([url]) => url === `${BILL_URL}/payments`)!
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      amount: 2354.31,
      methodCode: '30',
      paymentReference: null,
      paymentDate: '2026-10-05',
      currency: 'OMR',
    })
    const headers = (init as RequestInit).headers as Record<string, string> | Headers
    const key =
      headers instanceof Headers ? headers.get('Idempotency-Key') : headers['Idempotency-Key']
    expect(key).toMatch(/^payment-[0-9a-f-]{36}$/)

    expect(await screen.findByText('Payment recorded.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() =>
      expect(calls().filter((call) => call === `GET ${BILL_URL}`)).toHaveLength(2),
    )
    vi.useRealTimers()
  })

  it('keeps Record payment out of the page unless the bill can be paid by this reader', async () => {
    const offered = async (bill: BillDetailDto, reader = ADMIN) => {
      who = reader
      forgetEntitlements()
      billResponse = () => json(200, bill)
      const view = renderBill()
      await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
      const shown = screen.queryByRole('button', { name: 'Record payment' }) !== null
      view.unmount()
      return shown
    }
    const base = detail({ readiness: APPROVED })

    expect(await offered(base)).toBe(true)
    // Hidden, not disabled (owner decision 2026-10-01).
    expect(await offered(detail()), 'waiting for approval').toBe(false)
    expect(
      await offered({
        ...base,
        hold: {
          id: 'h-1',
          reason: 'Query with supplier',
          openedBy: 'u-1',
          openedAt: '2026-09-04T08:00:00Z',
          releasedBy: null,
          releasedAt: null,
        },
      }),
      'on hold: released first',
    ).toBe(false)
    expect(
      await offered({
        ...base,
        settlement: {
          ...base.settlement,
          paidAmount: 2354.31,
          outstandingAmount: 0,
          paymentState: 'PAID',
        },
      }),
      'nothing owed',
    ).toBe(false)
    expect(await offered(base, READ_ONLY), 'no payment permission').toBe(false)
    // RL-4: paying a bill settles it, which the Accountant does not do; the Finance Manager does.
    expect(await offered(base, ACCOUNTANT), 'an Accountant').toBe(false)
    expect(await offered(base, FINANCE_MANAGER), 'a Finance Manager').toBe(true)
    // Draft and exported runs alike: it is paid there, or taken out of the run first.
    expect(await offered({ ...base, paymentRunReference: 'RUN-0012' }), 'in a payment run').toBe(
      false,
    )
  })

  it('offers Reject on an approved bill only until a payment is recorded or it joins a run', async () => {
    const rejectOffered = async (bill: BillDetailDto) => {
      forgetEntitlements()
      billResponse = () => json(200, bill)
      const view = renderBill()
      await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
      const shown = screen.queryByRole('button', { name: 'Reject' }) !== null
      view.unmount()
      return shown
    }
    const base = detail({ readiness: APPROVED })

    // Header order on an approved bill: Download, Reject, Record payment.
    expect(await rejectOffered(base)).toBe(true)
    expect(
      await rejectOffered({
        ...base,
        settlement: {
          ...base.settlement,
          paidAmount: 1000,
          outstandingAmount: 1354.31,
          paymentState: 'PARTIALLY_PAID',
        },
      }),
      'part paid',
    ).toBe(false)
    expect(await rejectOffered({ ...base, paymentRunReference: 'RUN-0012' }), 'in a run').toBe(
      false,
    )
  })

  // Owner's answer C5 (8 Oct 2026): a refused supplier debit note is not paid.
  it('offers no Record payment on a refused debit note, and offers it on an accepted one', async () => {
    const debitNote = (debitNoteDecision: 'ACCEPTED' | 'REFUSED') =>
      detail({
        readiness: APPROVED,
        bill: {
          ...detail().bill,
          documentTypeCode: '383',
          workflowState: 'APPROVED',
          readiness: APPROVED,
          debitNoteDecision,
        },
      })
    billResponse = () => json(200, debitNote('REFUSED'))
    const first = renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    // Hidden, not greyed.
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    first.unmount()
    cleanup()

    billResponse = () => json(200, debitNote('ACCEPTED'))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeTruthy()
  })

  // E2E 10 Oct, F-11: a refused debit note opened from Bills read "Approved" and "Approved for
  // payment. It is not scheduled until someone puts it in a payment run."
  it('says a refused debit note is refused, not approved for payment, and offers no payment', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          readiness: APPROVED,
          bill: {
            ...detail().bill,
            documentTypeCode: '383',
            workflowState: 'APPROVED',
            readiness: APPROVED,
            debitNoteDecision: 'REFUSED',
          },
        }),
      )
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.getByText('Refused')).toBeTruthy()
    expect(
      screen.getByText(
        'Nothing was added to what you owe. Your reason is recorded against the note.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Approved for payment/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
  })

  // E2E 10 Oct, F-7: a bill in a run said "It is not scheduled until someone puts it in a
  // payment run" under a header that said it was in one.
  it('says an approved bill in a payment run is in that run, not waiting for one', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          readiness: APPROVED,
          paymentRunReference: 'PR-0002',
          bill: {
            ...detail().bill,
            workflowState: 'IN_PAYMENT_RUN',
            readiness: APPROVED,
            paymentRunReference: 'PR-0002',
          },
        }),
      )
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(
      screen.getByText(
        'Approved for payment and in payment run PR-0002. It is paid when the run is marked paid.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/not scheduled until someone puts it in a payment run/)).toBeNull()

    cleanup()
    await i18n.changeLanguage('ar')
    renderBill()
    expect(
      await screen.findByText(
        'معتمدة للدفع وضمن دفعة السداد PR-0002. تُسجَّل مدفوعة عند تسجيل الدفعة كمدفوعة.',
      ),
    ).toBeTruthy()
  })

  // Owner, 10 Oct 2026 (backend #480): a debit note nobody has accepted is not owed yet.
  it('offers no Record payment on an undecided debit note, and says to accept it first', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          readiness: APPROVED,
          bill: {
            ...detail().bill,
            documentTypeCode: '383',
            workflowState: 'APPROVED',
            readiness: APPROVED,
            debitNoteDecision: null,
          },
        }),
      )
    const view = renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    expect(screen.getByText('Accept the debit note before you pay it.')).toBeTruthy()
    view.unmount()
    cleanup()

    await i18n.changeLanguage('ar')
    renderBill()
    expect(await screen.findByText('اقبل الإشعار المدين قبل أن تدفعه.')).toBeTruthy()
  })

  it('says why a payment on a debit note not yet accepted is refused', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          readiness: APPROVED,
          bill: { ...detail().bill, documentTypeCode: '383', debitNoteDecision: 'ACCEPTED' },
        }),
      )
    actionResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'BILL_PAYMENT_DEBIT_NOTE_NOT_ACCEPTED',
        detail: 'Accept the debit note first',
        status: 400,
      })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    const said = await screen.findAllByText('Accept the debit note before you pay it.')
    expect(said.length).toBeGreaterThan(0)
  })

  it('says why a payment on a debit note refused after the page loaded is refused', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          readiness: APPROVED,
          bill: { ...detail().bill, documentTypeCode: '383', debitNoteDecision: 'ACCEPTED' },
        }),
      )
    actionResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'BILL_PAYMENT_DEBIT_NOTE_REFUSED',
        detail: 'This debit note is refused (disputed); accept it again before recording a payment',
        status: 400,
      })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(
      await within(dialog).findByText(
        /^This debit note was refused, so it cannot be paid\. Accept it first if it is owed after all\./,
      ),
    ).toBeTruthy()
  })

  it('names the payment run when the bill joined one after the page loaded', async () => {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    actionResponse = () =>
      json(400, {
        error: 'BILL_PAYMENT_IN_PAYMENT_RUN',
        detail:
          'This bill is in payment run RUN-0012. Pay it there, or take it out of the run first.',
        paymentRunReference: 'RUN-0012',
        status: 400,
      })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(
      await within(dialog).findByText(
        'This bill is in payment run RUN-0012. Pay it there, or take it out of the run first.',
      ),
    ).toBeTruthy()
  })

  it('offers no Record payment on an approved bill whose mismatch is unresolved, and offers it once matched by hand', async () => {
    const mismatched = (verdict: 'MISMATCH' | 'MATCHED_BY_HAND') =>
      detail({
        readiness: APPROVED,
        bill: {
          ...detail().bill,
          workflowState: 'APPROVED',
          readiness: APPROVED,
          match: { ...detail().bill.match!, verdict, byHand: verdict === 'MATCHED_BY_HAND' },
        },
      })
    billResponse = () => json(200, mismatched('MISMATCH'))
    const first = renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    first.unmount()
    cleanup()

    billResponse = () => json(200, mismatched('MATCHED_BY_HAND'))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeTruthy()
  })

  // Owner's Round 5 answer 1 (2 Oct): a bill approved while its mismatch is unresolved keeps
  // showing Mismatch. The server will say `MISMATCH`; today's still says `APPROVED` beside the
  // mismatch verdict, and both read the same here.
  for (const workflowState of ['MISMATCH', 'APPROVED'] as const) {
    it(`keeps showing Mismatch on a bill people approved while it differs from its order (server says ${workflowState})`, async () => {
      billResponse = () =>
        json(
          200,
          detail({
            readiness: APPROVED,
            bill: {
              ...detail().bill,
              workflowState,
              readiness: APPROVED,
              match: { ...detail().bill.match!, verdict: 'MISMATCH', summary: null },
            },
          }),
        )
      renderBill()
      const title = await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
      const header = title.parentElement as HTMLElement
      expect(within(header).getByText('Mismatch found')).toBeTruthy()
      expect(within(header).queryByText('Approved')).toBeNull()
      // The decision panel says what stands in the way, in the words the match card already uses.
      const decision = screen.getByRole('heading', { name: 'Your decision' }).closest('section')!
      expect(within(decision).getByText('This bill differs from the order')).toBeTruthy()
      expect(screen.queryByText(/Approved for payment\./)).toBeNull()
      expect(screen.queryByText(/It can be paid\./)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    })
  }

  // The state the server sends for it (contract note, Round 7): one approver required, one person
  // approved, the verdict still a mismatch. Approve is offered from the approvals, never from the
  // word "Mismatch", or the click would answer APPROVAL_TRANSITION_INVALID.
  it('offers the match actions, and no Approve, on a bill one person approved that still reads Mismatch', async () => {
    const oneOfOne = {
      state: 'READY',
      distinctApprovals: 1,
      required: 1,
      autoApproved: false,
    } as const
    billResponse = () =>
      json(
        200,
        detail({
          readiness: oneOfOne,
          bill: {
            ...detail().bill,
            workflowState: 'MISMATCH',
            // Sent beside the state; the page reads the approvals from `readiness`.
            approval: 'APPROVED',
            readiness: oneOfOne,
            match: {
              ...detail().bill.match!,
              verdict: 'MISMATCH',
              summary: '3 KGM more than we received on Arabica beans',
            },
          },
        }),
      )
    renderBill()
    const title = await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(within(title.parentElement as HTMLElement).getByText('Mismatch found')).toBeTruthy()
    // Nothing left to approve, in the header or in the decision panel; nobody to nudge.
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve for payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Nudge/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    // The way forward is the match: change it or take it off.
    expect(screen.getByRole('button', { name: 'Change the match' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove the match' })).toBeTruthy()
    // What it says: the difference, in the page's own words, and that it was approved.
    expect(screen.getByRole('heading', { name: 'This bill differs from the order' })).toBeTruthy()
    expect(screen.getByText('3 KGM more than we received on Arabica beans')).toBeTruthy()
    const decision = screen.getByRole('heading', { name: 'Your decision' }).closest('section')!
    expect(within(decision).getByText('This bill differs from the order')).toBeTruthy()
    expect(screen.queryByText(/Approved for payment\./)).toBeNull()
    expect(screen.queryByText(/It can be paid\./)).toBeNull()
    expect(screen.queryByText(/Waiting for approval/)).toBeNull()
    const steps = stepsOf(
      detail({
        readiness: oneOfOne,
        bill: {
          ...detail().bill,
          workflowState: 'MISMATCH',
          match: { ...detail().bill.match!, verdict: 'MISMATCH' },
        },
      }),
      { day: (iso) => iso, instantDay: (iso) => iso },
    )
    expect(steps.find((step) => step.id === 'matched')).toMatchObject({
      state: 'current',
      detail: { key: 'billDetail.steps.differs' },
    })
    expect(steps.find((step) => step.id === 'approved')).toMatchObject({
      state: 'done',
      detail: { key: 'billDetail.steps.approvedDone' },
    })
    // Rejecting it and putting it on hold are still the reader's to choose.
    expect(within(decision).getByRole('button', { name: 'Query it' })).toBeTruthy()
    expect(within(decision).getByRole('button', { name: 'Put on hold' })).toBeTruthy()
  })

  it('does not say a bill approved by its amount can be paid while it differs from its order', () => {
    const byAmount = { ...APPROVED, distinctApprovals: 0, autoApproved: true }
    const approved = detail({ readiness: byAmount })
    const withVerdict = (verdict: 'MISMATCH' | 'MATCHED_BY_HAND') => ({
      ...approved,
      bill: { ...approved.bill, match: { ...approved.bill.match!, verdict } },
    })
    expect(decisionNoteOf(withVerdict('MISMATCH'))).toEqual({ key: 'billDetail.match.differs' })
    // Resolved, the sentence it had comes back.
    expect(decisionNoteOf(withVerdict('MATCHED_BY_HAND'))).toEqual({
      key: 'billDetail.decision.belowLimit',
    })
    // Paid, held and rejected bills keep their own sentence, mismatch or not.
    expect(
      decisionNoteOf({
        ...withVerdict('MISMATCH'),
        settlement: { ...approved.settlement, paymentState: 'PAID' },
      }),
    ).toEqual({ key: 'billDetail.decision.paid' })
    // Not yet approved: the sentence about approving stays, the match card says the difference.
    const pending = detail()
    expect(
      decisionNoteOf({
        ...pending,
        bill: { ...pending.bill, match: { ...pending.bill.match!, verdict: 'MISMATCH' } },
      }).key,
    ).toBe('billDetail.decision.needsMore')
  })

  // Confirmed item 21 (2 Oct): a bill approved by its amount reads APPROVED from the server.
  it('shows a bill approved by its amount as Approved, with nothing left to approve and a payment on offer', async () => {
    const byAmount = {
      state: 'READY',
      distinctApprovals: 0,
      required: 2,
      autoApproved: true,
    } as const
    billResponse = () =>
      json(
        200,
        detail({
          readiness: byAmount,
          approvals: [],
          bill: { ...detail().bill, workflowState: 'APPROVED', readiness: byAmount },
        }),
      )
    renderBill()
    const title = await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(within(title.parentElement as HTMLElement).getByText('Approved')).toBeTruthy()
    expect(screen.queryByText(/Waiting on approval/)).toBeNull()
    expect(screen.getByText('No approval needed')).toBeTruthy()
    expect(
      screen.getByText('Below your approval limit, so no approval is needed. It can be paid.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve for payment' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeTruthy()
  })

  it('leaves Record payment showing for the rest after a part payment', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          readiness: APPROVED,
          settlement: {
            ...detail().settlement,
            paidAmount: 1000,
            outstandingAmount: 1354.31,
            paymentState: 'PARTIALLY_PAID',
          },
        }),
      )
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const amount = (await screen.findByRole('textbox', { name: /Amount paid/ })) as HTMLInputElement
    expect(amount.value).toBe('1354.310')
  })

  it('says the bill is not approved yet when the server refuses the payment for that', async () => {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    actionResponse = () =>
      json(400, { error: 'BILL_NOT_READY_FOR_PAYMENT', detail: 'not ready', status: 400 })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(
      await within(dialog).findByText(
        'This bill has not been approved yet. Approve it, then record the payment.',
      ),
    ).toBeTruthy()
  })

  it('lets an Accountant hold an approved bill, and offers them no Record payment', async () => {
    who = ACCOUNTANT
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.getByRole('button', { name: 'Put on hold' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
  })

  it('offers only reading to someone who cannot approve or pay', async () => {
    who = READ_ONLY
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByRole('button', { name: 'Approve for payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Put on hold' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Match to an order' })).toBeNull()
    // The per-line comparison is behind invoice.approve; a reader must not even ask for it.
    expect(calls().some((call) => call.endsWith('/match'))).toBe(false)
  })

  it('matches a bill to one of the supplier orders, and can remove the match', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        bill: { ...detail().bill, match: null, purchaseOrderReference: 'PO-0031' },
      })
    matchResponse = () =>
      json(200, { ...MATCH, verdict: null, purchaseOrderNumber: null, comparison: [] })
    renderBill()
    expect(await screen.findByText('Not matched to an order')).toBeTruthy()
    expect(screen.getByText(/wrote order PO-0031 on the bill/)).toBeTruthy()

    // Offered twice by design: on the verdict card and on Linked documents; either opens the picker.
    fireEvent.click(screen.getAllByRole('button', { name: 'Match to an order' })[0])
    fireEvent.click(await screen.findByRole('button', { name: /PO-0044/ }))
    await waitFor(() => expect(calls()).toContain(`PUT ${BILL_URL}/match`))
    const body = JSON.parse(
      String(
        fetchMock.mock.calls.find(
          ([url, init]) => url === `${BILL_URL}/match` && (init as RequestInit)?.method === 'PUT',
        )?.[1]?.body,
      ),
    )
    expect(body).toEqual({ purchaseOrderId: 'po-2' })
  })

  it('shows what was ordered, received and billed, as the three tiles', async () => {
    renderBill()
    const ordered = (await screen.findByText('You ordered')).closest('div')!.parentElement!
    expect(within(ordered).getByText('300 KG')).toBeTruthy()
    expect(within(ordered).getByText('7.400 per KG · PO-0031')).toBeTruthy()
    expect(screen.getByText('You received')).toBeTruthy()
    expect(screen.getByText('They billed')).toBeTruthy()
    expect(calls()).toContain(`GET ${BILL_URL}/match`)
  })

  it('says a supplier is unnamed rather than showing an empty line', async () => {
    billResponse = () => json(200, { ...detail(), bill: { ...detail().bill, supplierName: null } })
    renderBill()
    expect(await screen.findAllByText('Supplier not named')).toBeTruthy()
  })

  it('names an unnamed sender by its Peppol id (DB-1)', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        bill: {
          ...detail().bill,
          supplierId: null,
          supplierName: null,
          supplierParticipantId: '0248:OM1100000299',
        },
      })
    renderBill()
    const from = (await screen.findByText('0248:OM1100000299')).closest('p')!
    expect(within(from).queryByText('Supplier not named')).toBeNull()
    expect(screen.getByText('0248:OM1100000299').getAttribute('dir')).toBe('ltr')
  })

  it('writes a USD bill in dollars, with its VAT in rial beside it (DB-5)', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        bill: {
          ...detail().bill,
          currencyCode: 'USD',
          totalIncludingVat: 273,
          vatAmount: 13,
          outstandingAmount: 273,
          amountDue: 273,
          inputVat: { counted: true, countedOn: '2026-10-29', reason: 'COUNTED', vatAmountOmr: 5 },
        },
      })
    renderBill()
    const charging = (await screen.findByText(i18n.t('billDetail.lines.theyreCharging'))).parentElement!
    expect(within(charging).getByText('USD')).toBeTruthy()
    expect(charging.querySelector('svg')).toBeNull()
    const rial = screen.getByText(i18n.t('billDetail.lines.vatInRial')).parentElement!
    expect(within(rial).getByText('5.000')).toBeTruthy()
    expect(rial.querySelector('svg')).not.toBeNull()
  })

  it('keeps the rial sign and adds no rial VAT line on a bill in rial (DB-5)', async () => {
    renderBill()
    const charging = (await screen.findByText(i18n.t('billDetail.lines.theyreCharging'))).parentElement!
    expect(charging.querySelector('svg')).not.toBeNull()
    expect(screen.queryByText(i18n.t('billDetail.lines.vatInRial'))).toBeNull()
  })

  it('shows the not-found state for a bill this tenant does not have', async () => {
    billResponse = () =>
      json(404, { type: 'https://api.fawtir.om/problems/not-found', error: 'BILL_NOT_FOUND' })
    renderBill()
    expect(await screen.findByText('Not found')).toBeTruthy()
  })

  it("words a bill with no order in the reader's language, never the matcher's English", async () => {
    const base = detail()
    billResponse = () =>
      json(
        200,
        detail({
          bill: {
            ...base.bill,
            purchaseOrderReference: null,
            match: {
              verdict: 'NO_ORDER',
              purchaseOrderId: null,
              purchaseOrderNumber: null,
              goodsReceiptId: null,
              goodsReceiptNumber: null,
              byHand: false,
              summary: 'No purchase order on file for this bill',
              matchedAt: '2026-09-02T06:00:00Z',
            },
          },
          activity: [
            { at: '2026-09-02T06:00:00Z', kind: 'MATCHED', detail: null, actor: null },
          ],
        }),
      )
    await i18n.changeLanguage('ar')
    renderBill()
    expect(
      await screen.findByText('لا يوجد أمر شراء مرتبط بهذه الفاتورة. طابِقها بطلب لمقارنة الكميات والأسعار.'),
    ).toBeTruthy()
    expect(screen.queryByText(/No purchase order on file/)).toBeNull()
  })

  it('names the credit beside what was paid, so paid, credited and outstanding add up to the total', async () => {
    const base = detail()
    billResponse = () =>
      json(
        200,
        detail({
          settlement: {
            ...base.settlement,
            billTotal: 52.5,
            paidAmount: 42,
            creditedAmount: 10.5,
            outstandingAmount: 0,
            paymentState: 'PAID',
          },
        }),
      )
    renderBill()
    const credited = await screen.findByText('Credited')
    expect(within(credited.closest('div') as HTMLElement).getByText(/10\.500/)).toBeTruthy()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderBill()
    expect(await screen.findByText('الطلب والاستلام والفاتورة متطابقة')).toBeTruthy()
    expect(screen.getByText('حالة إبلاغ الاستلام غير متاحة')).toBeTruthy()
    expect(screen.getByText('2,242.200')).toBeTruthy()
  })
})

describe('the supplier card on a bill', () => {
  it('counts the supplier’s open bills as their page does, not the four bands', async () => {
    // Three open bills, one of them in another currency: the bands (OMR only) add up to two.
    supplierOpenBills = 3
    renderBill()
    expect(await screen.findByText(/^3 · /)).toBeTruthy()
    expect(screen.queryByText(/^2 · /)).toBeNull()
  })

  it('falls back to the bands when the server does not send the count', async () => {
    renderBill()
    expect(await screen.findByText(/^2 · /)).toBeTruthy()
  })
})

describe('bill detail mapping', () => {
  it('dates the Arrived step only from an arrival, never from the issue date (B-9)', () => {
    const format = { day: (iso: string) => `day ${iso}`, instantDay: (iso: string) => `at ${iso}` }
    const base = detail()
    const noEvent = { ...base, intake: null, activity: base.activity.filter((entry) => entry.kind !== 'ARRIVED') }
    expect(stepsOf(noEvent, format)[0].detail).toEqual({ key: `billDetail.steps.via.${base.bill.source}` })
    const arrived = {
      ...noEvent,
      activity: [
        ...noEvent.activity,
        { at: '2026-10-29T13:21:00Z', kind: 'ARRIVED' as const, detail: null, actor: null },
      ],
    }
    expect(stepsOf(arrived, format)[0].detail).toEqual({
      key: 'billDetail.steps.arrivedVia',
      values: { date: 'at 2026-10-29T13:21:00Z', source: base.bill.source },
    })
  })

  it('walks the steps as far as the bill has got, and no further', () => {
    const format = { day: (iso: string) => iso, instantDay: (iso: string) => iso }
    const steps = stepsOf(detail(), format)
    expect(steps.map((step) => `${step.id}:${step.state}`)).toEqual([
      'arrived:done',
      'matched:done',
      'approved:current',
      'scheduled:upcoming',
      'paid:upcoming',
    ])
    const paid = stepsOf(
      {
        ...detail(),
        readiness: { state: 'READY', distinctApprovals: 2, required: 2, autoApproved: false },
        settlement: {
          ...detail().settlement,
          paymentState: 'PAID',
          outstandingAmount: 0,
          paidAmount: 2354.31,
        },
        paymentRunReference: 'RUN-9',
        payments: [
          {
            id: 'p-1',
            entryType: 'PAYMENT',
            amount: 2354.31,
            currency: 'OMR',
            methodCode: 'BANK',
            paymentReference: null,
            paymentDate: '2026-09-20',
            occurredAt: '2026-09-20T08:00:00Z',
          },
        ],
      },
      format,
    )
    expect(paid.every((step) => step.state === 'done')).toBe(true)
  })

  it('offers a payment only on an approved, unheld bill that still owes money', () => {
    const all = () => true
    const approved = detail({ readiness: APPROVED })
    expect(canRecordPayment(approved, all)).toBe(true)
    expect(canRecordPayment(detail(), all)).toBe(false)
    expect(
      canRecordPayment(approved, (permission) => permission !== 'bill.settle'),
    ).toBe(false)
    // Recording payments received is not settling a bill (RL-4).
    expect(
      canRecordPayment(approved, (permission) => permission === 'invoice.payment.manage'),
    ).toBe(false)
    expect(canRecordPayment(approved, (permission) => permission === 'bill.settle')).toBe(true)
    expect(
      canRecordPayment({ ...approved, bill: { ...approved.bill, documentTypeCode: '381' } }, all),
    ).toBe(false)
    expect(
      canRecordPayment(
        { ...approved, settlement: { ...approved.settlement, outstandingAmount: 0 } },
        all,
      ),
    ).toBe(false)
    expect(canRecordPayment({ ...approved, paymentRunReference: 'RUN-0012' }, all)).toBe(false)
    // A refused or undecided supplier debit note is accepted first (owner, 10 Oct 2026); a server
    // that sends no decision at all decides for itself.
    const note383 = (debitNoteDecision: 'ACCEPTED' | 'REFUSED' | null | undefined) => ({
      ...approved,
      bill: { ...approved.bill, documentTypeCode: '383', debitNoteDecision },
    })
    expect(canRecordPayment(note383('REFUSED'), all)).toBe(false)
    expect(canRecordPayment(note383('ACCEPTED'), all)).toBe(true)
    expect(canRecordPayment(note383(null), all)).toBe(false)
    expect(canRecordPayment(note383(undefined), all)).toBe(true)
    expect(
      canRecordPayment(
        { ...approved, bill: { ...approved.bill, workflowState: 'IN_PAYMENT_RUN' } },
        all,
      ),
    ).toBe(false)
  })

  it('offers no payment while the bill does not match its order, whoever approved it', () => {
    const all = () => true
    const withVerdict = (verdict: 'MATCHED' | 'MATCHED_BY_HAND' | 'MISMATCH' | 'NO_ORDER') => {
      const approved = detail({ readiness: APPROVED })
      return {
        ...approved,
        bill: { ...approved.bill, match: { ...approved.bill.match!, verdict } },
      }
    }
    expect(canRecordPayment(withVerdict('MISMATCH'), all)).toBe(false)
    // Approved by its amount, not by a person: the same rule.
    expect(
      canRecordPayment(
        { ...withVerdict('MISMATCH'), readiness: { ...APPROVED, autoApproved: true } },
        all,
      ),
    ).toBe(false)
    // Resolved: matched by hand, matched again, no order found, or the match taken off.
    expect(canRecordPayment(withVerdict('MATCHED_BY_HAND'), all)).toBe(true)
    expect(canRecordPayment(withVerdict('MATCHED'), all)).toBe(true)
    expect(canRecordPayment(withVerdict('NO_ORDER'), all)).toBe(true)
    const unmatched = detail({ readiness: APPROVED })
    expect(canRecordPayment({ ...unmatched, bill: { ...unmatched.bill, match: null } }, all)).toBe(
      true,
    )
  })

  it('offers no rejection once a payment is recorded or the bill is in a run', () => {
    const all = () => true
    const approved = detail({ readiness: APPROVED })
    expect(decisionsOf(approved, all).reject).toBe(true)
    expect(
      decisionsOf({ ...approved, settlement: { ...approved.settlement, paidAmount: 0.001 } }, all)
        .reject,
    ).toBe(false)
    expect(decisionsOf({ ...approved, paymentRunReference: 'RUN-0012' }, all).reject).toBe(false)
  })

  it('a rejected bill offers no Approve: rejected is final, the server has no reopen step', () => {
    const can = () => true
    const rejected = detail({
      readiness: { state: 'REJECTED', distinctApprovals: 0, required: 1, autoApproved: false },
    })
    expect(decisionsOf(rejected, can)).toMatchObject({ approve: false, reject: false })
    expect(decisionsOf(detail(), can).approve).toBe(true)
  })

  it('offers no decision on a credit note or a paid bill', () => {
    const can = () => true
    expect(decisionsOf(detail(), can)).toMatchObject({
      approve: true,
      reject: true,
      hold: true,
      release: false,
    })
    expect(
      decisionsOf({ ...detail(), bill: { ...detail().bill, documentTypeCode: '381' } }, can),
    ).toMatchObject({
      approve: false,
      reject: false,
      hold: false,
    })
    expect(
      decisionsOf(
        { ...detail(), settlement: { ...detail().settlement, paymentState: 'PAID' } },
        can,
      ),
    ).toMatchObject({ approve: false, reject: false, hold: false })
  })

  it('never claims a receiver-side filing the server has not reported', () => {
    // Four lines as the frame draws them, each from a fact held; a missing fact says so.
    expect(complianceOf(detail()).map((note) => note.key)).toEqual([
      'billDetail.compliance.overPeppol',
      'billDetail.compliance.passedPintOm',
      'billDetail.compliance.receipt.unavailable',
      'billDetail.compliance.originalKept',
    ])
    const reported = (status: 'ACCEPTED' | 'SUBMITTED' | 'REJECTED' | 'NOT_SUBMITTED') =>
      complianceOf(
        {
          ...detail(),
          compliance: {
            ...detail().compliance,
            receiptReport: {
              status,
              reportedAt: status === 'ACCEPTED' ? '2026-09-01T08:14:00Z' : null,
            },
          },
        },
        () => '1 Sept 2026',
      )[2]
    expect(reported('ACCEPTED')).toEqual({
      key: 'billDetail.compliance.receipt.accepted',
      values: { date: '1 Sept 2026' },
      ok: true,
    })
    expect(reported('SUBMITTED')).toMatchObject({
      key: 'billDetail.compliance.receipt.submitted',
      ok: false,
    })
    expect(reported('REJECTED')).toMatchObject({
      key: 'billDetail.compliance.receipt.rejected',
      ok: false,
    })
    expect(reported('NOT_SUBMITTED')).toMatchObject({
      key: 'billDetail.compliance.receipt.notSubmitted',
      ok: false,
    })
    expect(
      complianceOf({
        ...detail(),
        bill: { ...detail().bill, inboundDeliveryId: null },
        compliance: {
          source: 'SCANNED',
          networkVerified: false,
          obligation: 'PENDING_COMPLIANCE_INPUT',
        },
      }).map((note) => note.key),
    ).toEqual([
      'billDetail.compliance.notValidated',
      'billDetail.compliance.noPintOm',
      'billDetail.compliance.pendingInput',
      'billDetail.compliance.noOriginal',
    ])
  })

  it("writes a self-billed bill as this company's own document, not as one that never arrived", () => {
    const selfBilledBill: BillDetailDto = {
      ...detail(),
      bill: { ...detail().bill, source: 'SELF_BILLED', inboundDeliveryId: null },
      compliance: {
        source: 'SELF_BILLED',
        networkVerified: true,
        obligation: 'REPORTED_BY_SENDER',
      },
    }
    const withAgreement = complianceOf({
      ...selfBilledBill,
      selfBilling: {
        issuedInvoiceId: 'sb-1',
        invoiceNumber: 'SB-2026-0007',
        agreementId: 'ag-1',
        agreementReference: 'SBA-2026-003',
      },
    })
    expect(withAgreement).toEqual([
      { key: 'billDetail.compliance.selfBilled.issuedByYou', ok: true },
      {
        key: 'billDetail.compliance.selfBilled.agreement',
        values: { reference: 'SBA-2026-003' },
        ok: true,
        link: '/expenditure/self-billing/sb-1',
      },
      { key: 'billDetail.compliance.selfBilled.validTaxInvoice', ok: true },
    ])
    // A response that names no document (an older server) still says who issued it, and links nowhere.
    const bare = complianceOf(selfBilledBill)
    expect(bare.map((note) => note.key)).toEqual([
      'billDetail.compliance.selfBilled.issuedByYou',
      'billDetail.compliance.selfBilled.agreementNoReference',
      'billDetail.compliance.selfBilled.validTaxInvoice',
    ])
    expect(bare[1].link).toBeUndefined()
    // Whatever the obligation says, a self-billed bill has these three lines and no fourth.
    for (const obligation of ['PENDING_COMPLIANCE_INPUT', 'NOT_APPLICABLE'] as const) {
      expect(
        complianceOf({
          ...selfBilledBill,
          compliance: { ...selfBilledBill.compliance, obligation },
        }),
      ).toHaveLength(3)
    }
    // The row's own id is enough to reach the document.
    expect(
      complianceOf({
        ...selfBilledBill,
        bill: { ...selfBilledBill.bill, issuedInvoiceId: 'sb-9' },
      })[1].link,
    ).toBe('/expenditure/self-billing/sb-9')
    // Every other source keeps its four lines.
    expect(complianceOf(detail()).map((note) => note.key)).toEqual([
      'billDetail.compliance.overPeppol',
      'billDetail.compliance.passedPintOm',
      'billDetail.compliance.receipt.unavailable',
      'billDetail.compliance.originalKept',
    ])
  })

  it("words the self-billed document's steps, keeps the bill's own kinds, and has a word for an unknown one", () => {
    const entry = (kind: string) =>
      ({
        at: '2026-10-01T08:00:00Z',
        kind,
        detail: null,
        actor: 'u-1',
      }) as BillDetailDto['activity'][number]
    const keys = activityOf(
      {
        ...detail(),
        activity: ['DRAFT_CREATED', 'ISSUED', 'CANCELLED', 'APPROVED', 'PAID', 'BRAND_NEW'].map(
          entry,
        ),
      },
      'u-1',
    ).map((item) => item.key)
    expect(keys).toEqual([
      'billDetail.activity.kind.DRAFT_CREATED',
      'billDetail.activity.kind.ISSUED',
      'billDetail.activity.kind.CANCELLED',
      'billDetail.activity.kind.APPROVED',
      'billDetail.activity.kind.PAID',
      'invoiceDetails.event.other',
    ])
    // The three document steps say what the self-bill page says for the same events.
    for (const kind of ['DRAFT_CREATED', 'ISSUED', 'CANCELLED'])
      for (const lng of ['en', 'ar'])
        expect(i18n.t(`billDetail.activity.kind.${kind}`, { lng }), `${kind} ${lng}`).toBe(
          i18n.t(`invoiceDetails.event.${kind}`, { lng }),
        )
  })

  it('reads the VAT cell from the category letter, and the rate alone without one', () => {
    const line = (vatRate: number | null, taxCategoryCode?: string | null) => ({
      ...detail().lines[0],
      vatRate,
      taxCategoryCode,
    })
    expect(lineVatOf(line(5, 'S'))).toEqual({ rate: 5, categoryKey: null, reason: null })
    expect(lineVatOf(line(0, 'Z')).categoryKey).toBe('invoiceDetails.category.Z')
    expect(lineVatOf(line(0, 'E')).categoryKey).toBe('invoiceDetails.category.E')
    expect(lineVatOf(line(0, 'O')).categoryKey).toBe('invoiceDetails.category.O')
    // An exempt or out-of-scope line may carry no rate at all: it reads as 0%.
    expect(lineVatOf(line(null, 'E')).rate).toBe(0)
    // No category: what the page showed before the server sent one.
    expect(lineVatOf(line(5, null))).toEqual({ rate: 5, categoryKey: null, reason: null })
    expect(lineVatOf(line(0, undefined))).toEqual({ rate: 0, categoryKey: null, reason: null })
    expect(lineVatOf(line(null, null))).toEqual({ rate: null, categoryKey: null, reason: null })
    // A letter the page does not know is never drawn as a raw key.
    expect(lineVatOf(line(0, 'X')).categoryKey).toBeNull()

    // Two 0% lines of different categories are two kinds of VAT, not one rate.
    expect(singleVatRate({ ...detail(), lines: [line(0, 'Z'), line(0, 'E')] })).toBeNull()
    expect(singleVatRate({ ...detail(), lines: [line(5, 'S'), line(5, null)] })).toBe(5)
  })
})

/**
 * A sentence that prints money: the rial sign is drawn in place of "OMR" (which stays in the page
 * for a screen reader), so the sentence is one paragraph whose text reads "OMR 1,354.310" around
 * a no-break space, with the drawn sign inside it.
 */
async function moneySentence(dialog: HTMLElement, text: string): Promise<HTMLElement> {
  const sentence = await within(dialog).findByText(
    (_, element) => element?.tagName === 'P' && element.textContent === text,
  )
  expect(sentence.querySelector('svg')).toBeTruthy()
  return sentence
}

describe('why a bill was refused, in its own sentence', () => {
  const refusal =
    (error: string, extra: Record<string, unknown> = {}) =>
    () =>
      json(400, { type: 'https://api.fawtir.om/problems/expenditure-refused', error, ...extra })
  const GENERIC = /The server refused this\. Nothing was changed/

  async function pay() {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    return dialog
  }

  async function reject() {
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Not ours' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject the bill' }))
  }

  it('says a held bill is released before it is paid', async () => {
    actionResponse = refusal('BILL_PAYMENT_ON_HOLD')
    const dialog = await pay()
    expect(
      await within(dialog).findByText('This bill is on hold. Release it, then record the payment.'),
    ).toBeTruthy()
    expect(within(dialog).queryByText(GENERIC)).toBeNull()
  })

  // Owner's answer 2 (2 Oct): a single payment is refused while a mismatch is unresolved, the
  // same as a payment run. The sentence is the payment run's own, word for word.
  it('says the bill does not match its order when the server refuses the payment for that', async () => {
    actionResponse = refusal('BILL_PAYMENT_MISMATCHED')
    const dialog = await pay()
    expect(await within(dialog).findByText("That bill doesn't match its order.")).toBeTruthy()
    expect(within(dialog).queryByText(GENERIC)).toBeNull()
    // Nothing was recorded: the dialog stays open.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('says the same in Arabic', async () => {
    await i18n.changeLanguage('ar')
    actionResponse = refusal('BILL_PAYMENT_MISMATCHED')
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    const record = i18n.t('billDetail.actions.recordPayment')
    fireEvent.click(screen.getByRole('button', { name: record }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: i18n.t('invoiceDetails.pay.submit') }),
    )
    expect(await within(dialog).findByText('هذه الفاتورة لا تطابق أمر الشراء.')).toBeTruthy()
  })

  it('says the most that can be recorded when the amount typed is more than the bill owes', async () => {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Amount paid/ }), {
      target: { value: '3000' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))

    // The figure is the one the dialog's subtitle prints, and nothing is sent.
    const sentence = await moneySentence(
      dialog,
      'That is more than this bill still owes. The most you can record is OMR\u00A02,354.310.',
    )
    expect(sentence.closest('[data-field="amount"]')).toBeTruthy()
    expect(within(dialog).queryByText(/on this invoice/)).toBeNull()
    expect(calls()).not.toContain(`POST ${BILL_URL}/payments`)

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await moneySentence(
      dialog,
      'هذا أكثر مما تبقّى مستحقًا على هذه الفاتورة. أقصى ما يمكن تسجيله OMR\u00A02,354.310.',
    )
  })

  // The dialog refuses an amount above the figure it holds before asking, so a refusal from the
  // server means that figure is out of date: the sentence names the figure the server sends.
  it('says the most that can be recorded as the server names it, not as the page holds it', async () => {
    actionResponse = refusal('BILL_PAYMENT_EXCEEDS_OUTSTANDING', {
      outstandingAmount: 1354.31,
      currency: 'OMR',
    })
    const dialog = await pay()
    const sentence = await moneySentence(
      dialog,
      'That is more than this bill still owes. The most you can record is OMR\u00A01,354.310.',
    )
    expect(sentence.closest('[data-field="amount"]')).toBeTruthy()
    expect(sentence.textContent).not.toContain('2,354.310')
    expect(within(dialog).queryByText(GENERIC)).toBeNull()

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await moneySentence(
      dialog,
      'هذا أكثر مما تبقّى مستحقًا على هذه الفاتورة. أقصى ما يمكن تسجيله OMR\u00A01,354.310.',
    )
  })

  // The sign is the rial's: a bill in another currency names its own code and its own decimals.
  it('prints a figure in another currency with that currency, not with the rial sign', async () => {
    actionResponse = refusal('BILL_PAYMENT_EXCEEDS_OUTSTANDING', {
      outstandingAmount: 1354.3,
      currency: 'USD',
    })
    const dialog = await pay()
    const sentence = await within(dialog).findByText(
      'That is more than this bill still owes. The most you can record is USD 1,354.30.',
    )
    expect(sentence.querySelector('svg')).toBeNull()
  })

  it('names no "most" when the server says nothing is left to pay', async () => {
    actionResponse = refusal('BILL_PAYMENT_EXCEEDS_OUTSTANDING', {
      outstandingAmount: 0,
      currency: 'OMR',
    })
    const dialog = await pay()
    expect(await within(dialog).findByText('That is more than this bill still owes.')).toBeTruthy()
    expect(within(dialog).queryByText(/The most you can record/)).toBeNull()
  })

  // A server from before the figure was sent with the refusal.
  it('says the amount is more than the bill owes without a figure when the server names none', async () => {
    actionResponse = refusal('BILL_PAYMENT_EXCEEDS_OUTSTANDING')
    const dialog = await pay()
    const sentence = await within(dialog).findByText('That is more than this bill still owes.')
    // On the amount, where the invoice dialog says the same of an invoice; not the general notice.
    expect(sentence.closest('[data-field="amount"]')).toBeTruthy()
    expect(within(dialog).queryByText(/The most you can record/)).toBeNull()
    expect(within(dialog).queryByText(GENERIC)).toBeNull()

    // A refusal on a field is held as its key, so it follows the language.
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(
      await within(dialog).findByText('هذا أكثر مما تبقّى مستحقًا على هذه الفاتورة.'),
    ).toBeTruthy()
  })

  it.each([
    [
      'APPROVAL_REJECT_PAYMENT_RECORDED',
      {},
      'A payment is already recorded on this bill, so it can no longer be rejected.',
    ],
    [
      'APPROVAL_REJECT_IN_PAYMENT_RUN',
      { paymentRunReference: 'PR-0007' },
      'This bill is in payment run PR-0007. Take it out of the run before rejecting it.',
    ],
    ['APPROVAL_REASON_TOO_LONG', {}, 'That reason is too long. Shorten it and reject again.'],
  ])('says why a rejection was refused: %s', async (error, extra, sentence) => {
    actionResponse = refusal(error, extra)
    await reject()
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it.each([
    ['en', "This bill can't be rejected: supplier credit is set against it, and credit can't be released yet."],
    ['ar', 'لا يمكن رفض هذه الفاتورة: خُصم منها رصيد دائن للمورد، ولا يمكن تحرير هذا الرصيد بعد.'],
  ])('says a rejection is refused while credit is set against the bill, promising no release (%s)', async (language, sentence) => {
    await i18n.changeLanguage(language)
    actionResponse = refusal('BILL_REJECTION_HAS_APPLIED_CREDIT')
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('billDetail.actions.reject') })[0])
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Not ours' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('billDetail.reject.confirm') }))
    expect(await screen.findByText(sentence)).toBeTruthy()
  })

  it('explains instead of opening the rejection when the page already shows credit set against the bill', async () => {
    billResponse = () =>
      json(200, { ...detail(), settlement: { ...detail().settlement, creditedAmount: 10.5, outstandingAmount: 2343.81 } })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    expect(
      await screen.findByText("This bill can't be rejected: supplier credit is set against it, and credit can't be released yet."),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls().some((call) => call.includes('/reject'))).toBe(false)
  })

  // A hold with no reason, or one that is too long.
  it.each([
    ['BILL_HOLD_REASON_REQUIRED', 'A hold has to say why.'],
    [
      'BILL_HOLD_REASON_TOO_LONG',
      'That reason is too long. Shorten it and put the bill on hold again.',
    ],
  ])('says why a hold was refused: %s', async (error, sentence) => {
    actionResponse = refusal(error)
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(
      screen.getAllByRole('button', { name: i18n.t('billDetail.decision.putOnHold') })[0],
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Disputed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('billDetail.hold.confirm') }))
    await waitFor(() => expect(calls()).toContain(`POST ${BILL_URL}/hold`))
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it('keeps the general refusal for a code with no sentence of its own', async () => {
    actionResponse = refusal('APPROVAL_CODE_WITH_NO_SENTENCE')
    await reject()
    expect(await screen.findByText(GENERIC)).toBeTruthy()

    cleanup()
    actionResponse = refusal('BILL_PAYMENT_ACTOR_REQUIRED')
    const dialog = await pay()
    expect(await within(dialog).findByText(GENERIC)).toBeTruthy()
  })
})

describe('the original file, for someone who only reads bills', () => {
  // Both file routes take `invoice.read` on the server, and the page asks for nothing more: a
  // Viewer downloads the original like anyone else. A bill typed in with no file has no original,
  // and then nobody is offered a Download.
  const uploaded = (): BillDetailDto => ({
    ...detail(),
    bill: { ...detail().bill, source: 'UPLOADED', inboundDeliveryId: null },
    intake: {
      id: 'in-7',
      source: 'UPLOADED',
      filename: 'qms-7781.pdf',
      contentType: 'application/pdf',
      uploadedAt: '2026-09-12T08:00:00Z',
    },
  })
  const typedIn = (): BillDetailDto => ({
    ...detail(),
    bill: { ...detail().bill, source: 'UPLOADED', inboundDeliveryId: null },
    intake: null,
  })

  /** Answers the two file routes; everything else goes to the page's usual mock. */
  const serveFiles = () => {
    const usual = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.endsWith('/file') || url.endsWith('/document')
        ? new Response('the original', {
            status: 200,
            headers: { 'Content-Disposition': 'attachment; filename="qms-7781.pdf"' },
          })
        : usual(url, init),
    )
  }

  const objectUrls = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:original')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => {
    URL.createObjectURL = objectUrls.create
    URL.revokeObjectURL = objectUrls.revoke
  })

  it.each([
    ['a Viewer', READ_ONLY],
    ['an Administrator', ADMIN],
  ])('lets %s download an uploaded bill', async (_who, entitlements) => {
    who = entitlements
    billResponse = () => json(200, uploaded())
    serveFiles()
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(calls()).toContain('GET /api/v1/bills/intake/in-7/file'))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1))
    // The file's row in Linked documents downloads it too.
    fireEvent.click(screen.getByRole('button', { name: 'qms-7781.pdf' }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('No access')).toBeNull()
  })

  it('lets a Viewer download a bill that came over Peppol', async () => {
    who = READ_ONLY
    serveFiles()
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(calls()).toContain('GET /api/v1/inbound-invoices/d-1/document'))
  })

  it.each([
    ['a Viewer', READ_ONLY],
    ['an Administrator', ADMIN],
  ])('offers %s no Download on a bill with no original file', async (_who, entitlements) => {
    who = entitlements
    billResponse = () => json(200, typedIn())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })
})

/**
 * Owner's answers of 8 Oct 2026: the early-payment discount a payment run took is its own line in
 * the bill's payments, the bill counts as paid, its VAT never changes because of it, and until the
 * supplier's credit note arrives the bill says so.
 */
describe('the early-payment discount a payment run took', () => {
  const PAYMENT: BillDetailDto['payments'][number] = {
    id: 'p-1',
    entryType: 'PAYMENT',
    amount: 2307.224,
    currency: 'OMR',
    methodCode: '30',
    paymentReference: 'PR-0014',
    paymentDate: '2026-09-07',
    occurredAt: '2026-09-07T09:30:00Z',
  }
  const DISCOUNT: BillDetailDto['payments'][number] = {
    ...PAYMENT,
    id: 'd-1',
    entryType: 'DISCOUNT',
    amount: 47.086,
    methodCode: null,
  }

  function discounted(creditNoteOutstanding = 47.086): BillDetailDto {
    const base = detail({ readiness: APPROVED })
    return {
      ...base,
      bill: { ...base.bill, workflowState: 'PAID', paidAmount: 2307.224, outstandingAmount: 0 },
      settlement: {
        ...base.settlement,
        paidAmount: 2307.224,
        outstandingAmount: 0,
        paymentState: 'PAID',
        discountAmount: creditNoteOutstanding,
        creditedAmount: 47.086 - creditNoteOutstanding,
      },
      payments: [PAYMENT, DISCOUNT],
      discountTaken: {
        amount: 47.086,
        takenOn: '2026-09-07',
        paymentRunId: 'run-1',
        creditNoteId: creditNoteOutstanding > 0 ? null : 'cn-1',
        creditNoteOutstanding,
      },
    }
  }

  /** The figure beside a Payment terms label, and whether the rial sign is drawn with it. */
  function termsRow(label: string): { text: string; rial: boolean } {
    const value = screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
    return { text: value.textContent ?? '', rial: value.querySelector('svg') !== null }
  }

  it('lists the discount as its own line after what was paid, and never adds it to Paid', async () => {
    billResponse = () => json(200, discounted())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })

    expect(termsRow('Paid')).toEqual({ text: 'OMR2,307.224', rial: true })
    expect(termsRow('Early-payment discount')).toEqual({ text: 'OMR47.086', rial: true })
    expect(termsRow('Outstanding')).toEqual({ text: 'OMR0.000', rial: true })
    const labels = [...document.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(labels.indexOf('Early-payment discount')).toBe(labels.indexOf('Paid') + 1)

    // The bill's own figures are the server's and do not move: total, net and VAT.
    expect(screen.getAllByText('2,354.310').length).toBeGreaterThan(0)
    expect(screen.getByText('2,242.200')).toBeTruthy()
    expect(screen.getByText('VAT · 5%')).toBeTruthy()
    // Paid, as the server says, with the date of the payment, not of the discount line.
    expect(screen.getByText('Paid 7 Sept 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
  })

  it("says the discount is taken and the supplier's credit note awaited, in the Payment terms card", async () => {
    billResponse = () => json(200, discounted())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    const note = screen.getByText("Discount taken · waiting for the supplier's credit note")
    expect(note.closest('section, div')?.textContent).toContain('Payment terms')
    // The bill is paid, so the "Paying by ... saves" note is not drawn beside it.
    expect(screen.queryByText(/saves/)).toBeNull()
  })

  it('says nothing more once the credit note has arrived, and keeps the discount line', async () => {
    billResponse = () => json(200, discounted(0))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(termsRow('Early-payment discount')).toEqual({ text: 'OMR47.086', rial: true })
    expect(screen.queryByText(/waiting for the supplier's credit note/)).toBeNull()
  })

  it('draws neither on a bill with no discount, or from a server that sends none', async () => {
    const base = detail({ readiness: APPROVED })
    billResponse = () =>
      json(200, {
        ...base,
        settlement: {
          ...base.settlement,
          paidAmount: 1000,
          outstandingAmount: 1354.31,
          paymentState: 'PARTIALLY_PAID',
        },
        payments: [{ ...PAYMENT, amount: 1000 }],
      })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(termsRow('Paid')).toEqual({ text: 'OMR1,000.000', rial: true })
    expect(screen.queryByText('Early-payment discount')).toBeNull()
    expect(screen.queryByText(/waiting for the supplier's credit note/)).toBeNull()
  })

  it('reads in Arabic, with the rial sign and three decimals', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () => json(200, discounted())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(termsRow('خصم سداد مبكر')).toEqual({ text: 'OMR47.086', rial: true })
    expect(termsRow(i18n.t('billDetail.payment.paid'))).toEqual({
      text: 'OMR2,307.224',
      rial: true,
    })
    expect(screen.getByText('أُخذ الخصم · بانتظار الإشعار الدائن من المورّد')).toBeTruthy()
  })

  it('sums the DISCOUNT entries in the bill currency only, and waits while some is uncovered', () => {
    expect(discountLineOf(detail())).toBe(0)
    expect(discountLineOf(discounted())).toBe(47.086)
    expect(
      discountLineOf({
        ...discounted(),
        payments: [
          PAYMENT,
          DISCOUNT,
          { ...DISCOUNT, id: 'd-2', amount: 0.004 },
          { ...DISCOUNT, id: 'd-3', currency: 'USD', amount: 5 },
        ],
      }),
    ).toBe(47.09)
    expect(awaitingDiscountCreditNote(discounted())).toBe(true)
    expect(awaitingDiscountCreditNote(discounted(0))).toBe(false)
    expect(awaitingDiscountCreditNote(detail())).toBe(false)
    // The Paid step's date is the payment's, never the discount line's.
    const steps = stepsOf(
      { ...discounted(), payments: [PAYMENT, { ...DISCOUNT, paymentDate: '2026-09-30' }] },
      { day: (iso) => iso, instantDay: (iso) => iso },
    )
    expect(steps.find((step) => step.id === 'paid')?.detail?.values?.date).toBe('2026-09-07')
  })
})

/**
 * Owner's answer 13 of 8 Oct 2026: "Overpaid by {amount}" on the bill with the rial sign, and two
 * ways to settle it, the supplier's refund or keeping it as credit for their next bill, then
 * using that credit on another bill. All recorded in Activity.
 */
describe('an overpaid bill', () => {
  const OVERPAYMENT_URL = `${BILL_URL}/overpayment`
  let standing: BillOverpaymentDto
  let targets: BillRowDto[]

  function overpaid(): BillDetailDto {
    const base = detail({ readiness: APPROVED })
    return {
      ...base,
      bill: { ...base.bill, workflowState: 'PAID', paidAmount: 2394.31, outstandingAmount: 0 },
      settlement: {
        ...base.settlement,
        paidAmount: 2394.31,
        outstandingAmount: 0,
        paymentState: 'PAID',
        overpaidAmount: 40,
      },
    }
  }

  const target = (overrides: Partial<BillRowDto>): BillRowDto => ({
    ...overpaid().bill,
    id: 'b-2',
    supplierBillNumber: 'QMS-7790',
    workflowState: 'APPROVED',
    paidAmount: 0,
    outstandingAmount: 150,
    readiness: APPROVED,
    ...overrides,
  })

  beforeEach(() => {
    standing = {
      billId: ID,
      currency: 'OMR',
      overpaidAmount: 40,
      keptAsCredit: 0,
      undecided: 40,
      refunded: 0,
      applied: 0,
      settlements: [],
    }
    targets = [
      target({}),
      // Not offered: this bill, another supplier's, another currency, held, a credit note.
      target({ id: ID, supplierBillNumber: 'QMS-7781' }),
      target({ id: 'b-3', supplierBillNumber: 'OTHER-1', supplierId: 's-9' }),
      target({ id: 'b-4', supplierBillNumber: 'QMS-USD', currencyCode: 'USD' }),
      target({
        id: 'b-5',
        supplierBillNumber: 'QMS-HELD',
        hold: { reason: 'Query', openedAt: '2026-09-20T08:00:00Z' },
      }),
      target({ id: 'b-6', supplierBillNumber: 'QMS-CN', documentTypeCode: '381' }),
    ]
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === OVERPAYMENT_URL && method === 'GET') return json(200, standing)
      if (url.startsWith('/api/v1/bills?'))
        return json(200, {
          items: targets,
          page: 0,
          pageSize: 20,
          count: targets.length,
          total: targets.length,
        })
      return base(url, init)
    })
    billResponse = () => json(200, overpaid())
  })

  /** The sentence under Payment terms that carries an amount, and whether the sign is drawn. */
  function line(pattern: RegExp): { text: string; rial: boolean } {
    const element = screen.getByText(
      (_, node) => node?.tagName === 'P' && pattern.test(node.textContent ?? ''),
    )
    return { text: element.textContent ?? '', rial: element.querySelector('svg') !== null }
  }

  const sent = (path: string) => {
    const call = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === path && (init as RequestInit)?.method === 'POST',
    )
    return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined
  }

  it('says "Overpaid by" with the rial sign and three decimals, and offers the two ways to settle it', async () => {
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(line(/^Overpaid by/)).toEqual({ text: 'Overpaid by OMR40.000', rial: true })
    expect(line(/^Overpaid by/).text).not.toMatch(/OMR /)
    // In the Payment terms card, after what was paid and is outstanding.
    const card = screen.getByText(/^Overpaid by/).closest('section')!
    expect(within(card).getByText('Payment terms')).toBeTruthy()
    await waitFor(() => expect(calls()).toContain(`GET ${OVERPAYMENT_URL}`))
    expect(await screen.findByRole('button', { name: 'Keep as credit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: "Record the supplier's refund" })).toBeTruthy()
    // Nothing is kept yet, so there is nothing to set against a bill.
    expect(screen.queryByRole('button', { name: 'Set against a bill' })).toBeNull()
    expect(screen.queryByText(/kept as credit/)).toBeNull()
  })

  it('shows the figure to a reader without the payment permission, and hides every action', async () => {
    who = READ_ONLY
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(line(/^Overpaid by/)).toEqual({ text: 'Overpaid by OMR40.000', rial: true })
    await waitFor(() => expect(calls()).toContain(`GET ${OVERPAYMENT_URL}`))
    expect(screen.queryByRole('button', { name: "Record the supplier's refund" })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set against a bill' })).toBeNull()
  })

  it('hides every action from an Accountant, who does not settle supplier money', async () => {
    who = ACCOUNTANT
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(line(/^Overpaid by/)).toEqual({ text: 'Overpaid by OMR40.000', rial: true })
    await waitFor(() => expect(calls()).toContain(`GET ${OVERPAYMENT_URL}`))
    expect(screen.queryByRole('button', { name: "Record the supplier's refund" })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set against a bill' })).toBeNull()
  })

  it('offers a Finance Manager the ways to settle it', async () => {
    who = FINANCE_MANAGER
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(await screen.findByRole('button', { name: 'Keep as credit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: "Record the supplier's refund" })).toBeTruthy()
  })

  it('draws nothing and reads nothing more for a bill that is not overpaid', async () => {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByText(/Overpaid by/)).toBeNull()
    expect(screen.queryByRole('button', { name: "Record the supplier's refund" })).toBeNull()
    expect(calls()).not.toContain(`GET ${OVERPAYMENT_URL}`)
  })

  it("records the supplier's refund: amount, the day it arrived and a reference", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T09:00:00Z'))
    standing = { ...standing, keptAsCredit: 15, undecided: 25 }
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: "Record the supplier's refund" }))
    const dialog = await screen.findByRole('dialog', { name: "Record the supplier's refund" })
    expect(
      within(dialog).getByText('The supplier gave the money back rather than crediting a bill.'),
    ).toBeTruthy()
    // Filled with what nobody has decided about yet.
    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount' }) as HTMLInputElement
    expect(amount.value).toBe('25.000')
    expect(within(dialog).getByText('Paid on')).toBeTruthy()

    // More than it was overpaid by is stopped before asking, with the sign on the figure.
    fireEvent.change(amount, { target: { value: '40.5' } })
    const alert = within(dialog).getByRole('alert')
    expect(alert.textContent).toBe('That is more than the OMR 40.000 this bill was overpaid by.')
    expect(alert.querySelector('svg')).toBeTruthy()
    const save = within(dialog).getByRole('button', { name: 'Record the refund' })
    expect((save as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(amount, { target: { value: '40' } })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Payment reference (optional)' }),
      {
        target: { value: 'RF-0042' },
      },
    )
    fireEvent.click(save)
    await waitFor(() =>
      expect(sent(`${OVERPAYMENT_URL}/refunds`)).toEqual({
        amount: 40,
        refundedOn: '2026-10-05',
        reference: 'RF-0042',
      }),
    )
    expect(await screen.findByText('The refund was recorded.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.useRealTimers()
  })

  it('keeps it as credit with one press, and says so', async () => {
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: 'Keep as credit' }))
    await waitFor(() => expect(sent(`${OVERPAYMENT_URL}/keep-as-credit`)).toEqual({}))
    expect(
      await screen.findByText(
        'Kept as credit against Qalhat Marine Supplies. Nothing changes until you set it against a bill.',
      ),
    ).toBeTruthy()
  })

  it('shows what is kept, and sets it against another bill of the supplier in its currency', async () => {
    standing = { ...standing, keptAsCredit: 40, undecided: 0 }
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: 'Set against a bill' }))
    expect(line(/kept as credit$/)).toEqual({ text: 'OMR40.000 kept as credit', rial: true })
    // All of it is kept, so there is nothing left to keep.
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()

    const dialog = await screen.findByRole('dialog', { name: 'Set against a bill' })
    // Searched among this supplier's bills, on the server.
    await waitFor(() =>
      expect(
        calls().some(
          (call) => call.startsWith('GET /api/v1/bills?') && call.includes('supplier_id=s-1'),
        ),
      ).toBe(true),
    )
    const offered = await within(dialog).findAllByRole('button', { name: /QMS-7790/ })
    expect(offered).toHaveLength(1)
    for (const number of ['QMS-7781', 'OTHER-1', 'QMS-USD', 'QMS-HELD', 'QMS-CN'])
      expect(within(dialog).queryByRole('button', { name: new RegExp(number) })).toBeNull()
    expect(offered[0].querySelector('svg')).toBeTruthy()
    // What it still owes: the rial sign before the figure, no "OMR" (owner, 9 Oct 2026).
    const owes = within(offered[0]).getByText(/still owed$/)
    expect(owes.firstElementChild!.tagName.toLowerCase()).toBe('svg')
    expect(owes.textContent).toMatch(/^\d[\d,]*\.\d{3} still owed$/)
    fireEvent.click(offered[0])
    expect(within(dialog).getByText(/Applying to QMS-7790/)).toBeTruthy()

    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount (optional)' })
    fireEvent.change(amount, { target: { value: '41' } })
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'That is more than the OMR 40.000 kept as credit.',
    )
    fireEvent.change(amount, { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use it' }))
    // Left blank, the server uses the largest amount that fits both.
    await waitFor(() => expect(sent(`${OVERPAYMENT_URL}/apply`)).toEqual({ targetBillId: 'b-2' }))
    expect(await screen.findByText('The credit was used against that bill.')).toBeTruthy()
  })

  it('says why the server refused, in the dialog', async () => {
    actionResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'BILL_OVERPAYMENT_IN_PAYMENT_RUN',
        paymentRunReference: 'PR-0014',
      })
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: "Record the supplier's refund" }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record the refund' }))
    expect(
      await within(dialog).findByText(
        'This bill is in payment run PR-0014. Take it out of the run first.',
      ),
    ).toBeTruthy()
  })

  it('reads the target refusals in the credit note sentences', async () => {
    standing = { ...standing, keptAsCredit: 40, undecided: 0 }
    actionResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'BILL_OVERPAYMENT_TARGET_ON_HOLD',
      })
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: 'Set against a bill' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: /QMS-7790/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use it' }))
    expect(
      await within(dialog).findByText(
        'This bill is on hold. Release it before setting a credit against it.',
      ),
    ).toBeTruthy()
  })

  // Backend fd2e1d483: an optional Idempotency-Key on the refund and apply routes, with coded 409s.
  describe('keyed, so a retry is recorded once', () => {
    const posts = (path: string) =>
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url) === path && (init as RequestInit)?.method === 'POST',
      )
    const keyOf = (call: unknown[]) =>
      ((call[1] as RequestInit).headers as Record<string, string>)['Idempotency-Key']
    const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))
    const overpaymentReads = () => calls().filter((call) => call === `GET ${OVERPAYMENT_URL}`).length
    const lost = () => {
      throw new TypeError('Failed to fetch')
    }
    const conflict = (code: string) => () =>
      json(409, { type: 'https://api.fawtir.om/problems/resource-conflict', error: code })
    const REFUNDS = `${OVERPAYMENT_URL}/refunds`
    const APPLY = `${OVERPAYMENT_URL}/apply`

    async function openRefund() {
      fireEvent.click(await screen.findByRole('button', { name: "Record the supplier's refund" }))
      return screen.findByRole('dialog', { name: "Record the supplier's refund" })
    }
    const press = (dialog: HTMLElement) =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'Record the refund' }))
    const ready = (dialog: HTMLElement) =>
      waitFor(() =>
        expect(
          (within(dialog).getByRole('button', { name: 'Record the refund' }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      )

    it('sends a lost refund again under the same key, and opens the next with a new one', async () => {
      actionResponse = lost
      renderBill()
      const dialog = await openRefund()
      press(dialog)
      await waitFor(() => expect(posts(REFUNDS)).toHaveLength(1))
      await ready(dialog)

      actionResponse = () => json(200, {})
      press(dialog)
      expect(await screen.findByText('The refund was recorded.')).toBeTruthy()
      const [first, second] = posts(REFUNDS)
      expect(keyOf(first)).toMatch(/^overpayment-[A-Za-z0-9._:-]{16,116}$/)
      expect(keyOf(second)).toBe(keyOf(first))
      expect(bodyOf(second)).toEqual(bodyOf(first))

      press(await openRefund())
      await waitFor(() => expect(posts(REFUNDS)).toHaveLength(3))
      expect(keyOf(posts(REFUNDS)[2])).not.toBe(keyOf(first))
    })

    it('sends one refund for a double click', async () => {
      renderBill()
      const dialog = await openRefund()
      const save = within(dialog).getByRole('button', { name: 'Record the refund' })
      // Both in one act: React renders `disabled` only after it, as a second click in the same frame finds it.
      act(() => {
        save.click()
        save.click()
      })
      expect(await screen.findByText('The refund was recorded.')).toBeTruthy()
      expect(posts(REFUNDS)).toHaveLength(1)
    })

    it('says a changed refund may already be recorded, takes a new key, and reads the bill on close', async () => {
      actionResponse = lost
      renderBill()
      const dialog = await openRefund()
      press(dialog)
      await ready(dialog)
      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Amount' }), {
        target: { value: '20' },
      })
      actionResponse = conflict('BILL_OVERPAYMENT_IDEMPOTENCY_KEY_REUSED')
      press(dialog)
      expect(
        await within(dialog).findByText(
          'This was changed after an earlier attempt that may already be recorded. Close this and check the bill before recording it again: the next attempt counts as a new one.',
        ),
      ).toBeTruthy()
      // Not read under the open dialog, which the read would unmount.
      const readsBefore = overpaymentReads()
      expect(screen.getByRole('dialog')).toBeTruthy()

      await ready(dialog)
      actionResponse = () => json(200, {})
      press(dialog)
      expect(await screen.findByText('The refund was recorded.')).toBeTruthy()
      const [first, second, third] = posts(REFUNDS)
      expect(keyOf(second)).toBe(keyOf(first))
      expect(keyOf(third)).not.toBe(keyOf(first))
      expect(bodyOf(third).amount).toBe(20)
      expect(overpaymentReads()).toBeGreaterThan(readsBefore)
    })

    it('re-reads the bill when the dialog is closed after a spent key', async () => {
      actionResponse = conflict('BILL_OVERPAYMENT_IDEMPOTENCY_KEY_REUSED')
      renderBill()
      const dialog = await openRefund()
      press(dialog)
      await within(dialog).findByText(/may already be recorded/)
      const readsBefore = overpaymentReads()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(overpaymentReads()).toBeGreaterThan(readsBefore))
    })

    it('keeps the key while the first refund is still running, and reads nothing', async () => {
      actionResponse = conflict('BILL_OVERPAYMENT_IN_PROGRESS')
      renderBill()
      const dialog = await openRefund()
      press(dialog)
      expect(
        await within(dialog).findByText(
          'This is still being recorded. Wait a moment, then press again without changing it.',
        ),
      ).toBeTruthy()
      await ready(dialog)
      actionResponse = () => json(200, {})
      press(dialog)
      expect(await screen.findByText('The refund was recorded.')).toBeTruthy()
      expect(keyOf(posts(REFUNDS)[1])).toBe(keyOf(posts(REFUNDS)[0]))
    })

    it('keeps the key after a refusal: nothing was spent, so the corrected figure goes under it', async () => {
      actionResponse = () =>
        json(400, {
          type: 'https://api.fawtir.om/problems/expenditure-refused',
          error: 'BILL_OVERPAYMENT_EXCEEDS_OVERPAID',
        })
      renderBill()
      const dialog = await openRefund()
      press(dialog)
      await waitFor(() => expect(posts(REFUNDS)).toHaveLength(1))
      await ready(dialog)
      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Amount' }), {
        target: { value: '10' },
      })
      actionResponse = () => json(200, {})
      press(dialog)
      expect(await screen.findByText('The refund was recorded.')).toBeTruthy()
      expect(keyOf(posts(REFUNDS)[1])).toBe(keyOf(posts(REFUNDS)[0]))
    })

    it('keys a credit set against a bill the same way, typed amount included', async () => {
      standing = { ...standing, keptAsCredit: 40, undecided: 0 }
      actionResponse = lost
      renderBill()
      fireEvent.click(await screen.findByRole('button', { name: 'Set against a bill' }))
      const dialog = await screen.findByRole('dialog', { name: 'Set against a bill' })
      fireEvent.click(await within(dialog).findByRole('button', { name: /QMS-7790/ }))
      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Amount (optional)' }), {
        target: { value: '5' },
      })
      const use = within(dialog).getByRole('button', { name: 'Use it' })
      fireEvent.click(use)
      fireEvent.click(use)
      await waitFor(() => expect(posts(APPLY)).toHaveLength(1))
      await waitFor(() => expect((use as HTMLButtonElement).disabled).toBe(false))

      actionResponse = () => json(200, {})
      fireEvent.click(use)
      expect(await screen.findByText('The credit was used against that bill.')).toBeTruthy()
      const [first, second] = posts(APPLY)
      expect(keyOf(first)).toMatch(/^overpayment-/)
      expect(keyOf(second)).toBe(keyOf(first))
      expect(bodyOf(second)).toEqual({ targetBillId: 'b-2', amount: 5 })
    })

    it('says both in Arabic', async () => {
      await i18n.changeLanguage('ar')
      actionResponse = conflict('BILL_OVERPAYMENT_IN_PROGRESS')
      renderBill()
      fireEvent.click(await screen.findByRole('button', { name: 'تسجيل استرداد من المورّد' }))
      const dialog = await screen.findByRole('dialog')
      const save = within(dialog).getAllByRole('button').at(-1)!
      fireEvent.click(save)
      expect(
        await within(dialog).findByText(
          'لا يزال هذا قيد التسجيل. انتظر قليلًا، ثم اضغط مرة أخرى دون تغييره.',
        ),
      ).toBeTruthy()
      actionResponse = conflict('BILL_OVERPAYMENT_IDEMPOTENCY_KEY_REUSED')
      await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(save)
      expect(await within(dialog).findByText(/ربما سُجّلت بالفعل/)).toBeTruthy()
    })
  })

  it('reads in Arabic, with the rial sign and three decimals', async () => {
    await i18n.changeLanguage('ar')
    standing = { ...standing, keptAsCredit: 15, undecided: 25 }
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(line(/^دُفع بزيادة/)).toEqual({ text: 'دُفع بزيادة OMR40.000', rial: true })
    expect(await screen.findByRole('button', { name: 'تسجيل استرداد من المورّد' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'الاحتفاظ به رصيدًا' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'خصمه من فاتورة' })).toBeTruthy()
    expect(line(/محتفظ به رصيدًا$/)).toEqual({ text: 'OMR15.000 محتفظ به رصيدًا', rial: true })
  })

  // Owner's Arabic, 9 Oct 2026, for the two amount checks; the figure keeps the rial sign.
  it('says the two amount checks in Arabic, with the rial sign', async () => {
    await i18n.changeLanguage('ar')
    standing = { ...standing, keptAsCredit: 15, undecided: 25 }
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل استرداد من المورّد' }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0], { target: { value: '40.5' } })
    let alert = within(dialog).getByRole('alert')
    expect(alert.textContent).toBe(
      'هذا أكثر من مبلغ OMR\u00A040.000 المدفوع زيادةً على هذه الفاتورة.',
    )
    expect(alert.querySelector('svg')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }))

    fireEvent.click(await screen.findByRole('button', { name: 'خصمه من فاتورة' }))
    dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0], { target: { value: '16' } })
    alert = within(dialog).getByRole('alert')
    expect(alert.textContent).toBe('هذا أكثر من مبلغ OMR\u00A015.000 المحتفظ به رصيدًا.')
    expect(alert.querySelector('svg')).toBeTruthy()
  })

  it('lists the four steps in Activity with their amounts in rials', async () => {
    billResponse = () =>
      json(200, {
        ...overpaid(),
        activity: [
          {
            at: '2026-10-04T09:00:00Z',
            kind: 'OVERPAYMENT_CREDIT_RECEIVED',
            detail: '5.000 OMR · QMS-7700',
            actor: null,
          },
          {
            at: '2026-10-03T09:00:00Z',
            kind: 'OVERPAYMENT_CREDIT_APPLIED',
            detail: '10.5 OMR · QMS-7790',
            actor: null,
          },
          {
            at: '2026-10-02T09:00:00Z',
            kind: 'OVERPAYMENT_KEPT_AS_CREDIT',
            detail: '25.000 OMR',
            actor: null,
          },
          {
            at: '2026-10-01T09:00:00Z',
            kind: 'OVERPAYMENT_REFUNDED',
            detail: '15.000 OMR · RF-0042',
            actor: 'u-1',
          },
        ],
      })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    const step = (title: string) => {
      const heading = screen.getByText(title)
      return heading.closest('li')!.querySelectorAll('p')[1] as HTMLElement
    }
    expect(screen.getByText("Supplier's refund recorded")).toBeTruthy()
    expect(step("Supplier's refund recorded").textContent).toMatch(/^OMR15\.000 · RF-0042 · /)
    expect(step("Supplier's refund recorded").querySelector('svg')).toBeTruthy()
    expect(step('Kept as credit').textContent).toMatch(/^OMR25\.000 · /)
    // Three decimals always, whatever the server's scale.
    expect(step('Credit set against another bill').textContent).toMatch(/^OMR10\.500 · QMS-7790 · /)
    expect(step('Credit from another bill set against this one').textContent).toMatch(
      /^OMR5\.000 · QMS-7700 · /,
    )
    expect(screen.queryByText(/ OMR/)).toBeNull()
  })

  // Owner, 12 Oct 2026 (P5): Paid stays gross of a refund, so what the supplier gave back is said
  // under it, with the rial sign.
  it('says what the supplier refunded under Paid, while some is still overpaid', async () => {
    standing = { ...standing, overpaidAmount: 30, undecided: 30, refunded: 10 }
    billResponse = () =>
      json(200, { ...overpaid(), settlement: { ...overpaid().settlement, overpaidAmount: 30 } })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    await waitFor(() => expect(calls()).toContain(`GET ${OVERPAYMENT_URL}`))
    const refunded = await screen.findByText(
      (_, node) => node?.tagName === 'P' && /^Refunded by supplier/.test(node.textContent ?? ''),
    )
    expect(refunded.textContent).toBe('Refunded by supplier OMR\u00A010.000')
    expect(refunded.querySelector('svg')).toBeTruthy()
    // Right under the Paid row, in the Payment terms card.
    const paidRow = screen.getByText('Paid', { selector: 'dt' }).parentElement!
    expect(paidRow.nextElementSibling?.contains(refunded)).toBe(true)
    expect(line(/^Overpaid by/)).toEqual({ text: 'Overpaid by OMR30.000', rial: true })
  })

  it('still reads and says the refund once the supplier refunded all of it', async () => {
    standing = { ...standing, overpaidAmount: 0, undecided: 0, refunded: 40 }
    billResponse = () =>
      json(200, { ...overpaid(), settlement: { ...overpaid().settlement, overpaidAmount: 0 } })
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    // Paid 2,394.310 on a 2,354.310 bill: read although "Overpaid by" is back to zero.
    await waitFor(() => expect(calls()).toContain(`GET ${OVERPAYMENT_URL}`))
    const refunded = await screen.findByText(
      (_, node) => node?.tagName === 'P' && /^Refunded by supplier/.test(node.textContent ?? ''),
    )
    expect(refunded.textContent).toBe('Refunded by supplier OMR\u00A040.000')
    expect(screen.queryByText(/Overpaid by/)).toBeNull()
    expect(screen.queryByRole('button', { name: "Record the supplier's refund" })).toBeNull()
  })

  it('reads the refund line in Arabic, with the rial sign', async () => {
    await i18n.changeLanguage('ar')
    standing = { ...standing, refunded: 10 }
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    const refunded = await screen.findByText(
      (_, node) => node?.tagName === 'P' && /^ردّه المورّد/.test(node.textContent ?? ''),
    )
    expect(refunded.textContent).toBe('ردّه المورّد OMR\u00A010.000')
    expect(refunded.querySelector('svg')).toBeTruthy()
  })

  it('draws no refund line when nothing was refunded', async () => {
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    await waitFor(() => expect(calls()).toContain(`GET ${OVERPAYMENT_URL}`))
    expect(await screen.findByRole('button', { name: 'Keep as credit' })).toBeTruthy()
    expect(screen.queryByText(/Refunded by supplier/)).toBeNull()
  })

  // Owner, 12 Oct 2026 (C14): in this dialog only, say why an unaccepted debit note is missing.
  it('says debit notes appear once accepted when the search finds no bill', async () => {
    standing = { ...standing, keptAsCredit: 40, undecided: 0 }
    targets = []
    renderBill()
    fireEvent.click(await screen.findByRole('button', { name: 'Set against a bill' }))
    const dialog = await screen.findByRole('dialog', { name: 'Set against a bill' })
    expect(
      (
        await within(dialog).findByText(
          (_, node) => node?.tagName === 'P' && /^No bills from/.test(node.textContent ?? ''),
        )
      ).textContent,
    ).toBe(
      'No bills from Qalhat Marine Supplies match that. Only their own bills can take this credit. Debit notes appear here once accepted.',
    )
    // The shared sentence itself is unchanged for the other pages that use it.
    expect(
      i18n.t('supplierCreditNoteDetail.noBillsForSupplier', { supplier: 'Qalhat Marine Supplies' }),
    ).toBe('No bills from Qalhat Marine Supplies match that. Only their own bills can take this credit.')
  })

  it('says it in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    standing = { ...standing, keptAsCredit: 40, undecided: 0 }
    targets = []
    renderBill()
    fireEvent.click(
      await screen.findByRole('button', { name: i18n.t('billDetail.overpaid.setAgainst') }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/تظهر إشعارات المدين هنا بعد قبولها\.$/)).toBeTruthy()
  })

  it('reads the amount out of an overpayment step, and picks the bills the credit can go on', () => {
    expect(overpaymentStepOf('OVERPAYMENT_REFUNDED', '12.5 OMR · RF-1')).toEqual({
      amount: 12.5,
      currency: 'OMR',
      rest: 'RF-1',
    })
    expect(overpaymentStepOf('OVERPAYMENT_KEPT_AS_CREDIT', '40.000 OMR')).toEqual({
      amount: 40,
      currency: 'OMR',
      rest: null,
    })
    // Any other step, or a detail in another shape, is shown as sent.
    expect(overpaymentStepOf('PAID', '12.5 OMR')).toBeNull()
    expect(overpaymentStepOf('OVERPAYMENT_REFUNDED', 'refunded')).toBeNull()
    expect(overpaidOf(detail())).toBe(0)
    expect(overpaidOf(overpaid())).toBe(40)
    expect(creditTargetsOf(overpaid(), targets).map((row) => row.id)).toEqual(['b-2'])
    expect(
      creditTargetsOf(overpaid(), [
        target({ id: 'b-7', outstandingAmount: 0 }),
        target({ id: 'b-8', readiness: { ...APPROVED, state: 'REJECTED' } }),
        target({ id: 'b-9', documentTypeCode: '383', debitNoteDecision: 'REFUSED' }),
        target({ id: 'b-10', documentTypeCode: '383', debitNoteDecision: 'ACCEPTED' }),
        // Browser check of 11 Oct 2026 (F-H): an undecided debit note is not owed, so takes no credit.
        target({ id: 'b-11', documentTypeCode: '383', debitNoteDecision: null }),
      ]).map((row) => row.id),
    ).toEqual(['b-10'])
  })
})

// Browser re-check of 11 Oct 2026 (C-6): a refused debit note's tracker read "SCHEDULED · Not yet".
describe("a refused debit note's steps", () => {
  const format = { day: (iso: string) => iso, instantDay: (iso: string) => iso }
  const note = (debitNoteDecision: 'ACCEPTED' | 'REFUSED' | null) => ({
    ...detail(),
    readiness: { state: 'READY' as const, distinctApprovals: 1, required: 1, autoApproved: false },
    bill: { ...detail().bill, documentTypeCode: '383', debitNoteDecision },
  })

  it('stops at the decision: it is never scheduled or paid', () => {
    expect(stepsOf(note('REFUSED'), format).map((step) => step.id)).toEqual([
      'arrived',
      'matched',
      'approved',
    ])
  })

  it('keeps every step for an accepted or undecided note, and for a bill', () => {
    for (const decision of ['ACCEPTED', null] as const)
      expect(stepsOf(note(decision), format).map((step) => step.id)).toEqual([
        'arrived',
        'matched',
        'approved',
        'scheduled',
        'paid',
      ])
    expect(stepsOf(detail(), format)).toHaveLength(5)
  })
})

// Owner, 12 Oct 2026: a paid bill has passed Scheduled, run or no run (P3), and a part-paid bill
// says how much of it is paid (P4).
describe('the steps of a paid and a part-paid bill', () => {
  const format = { day: (iso: string) => iso, instantDay: (iso: string) => iso }
  const PAID_IN_FULL: BillDetailDto['payments'][number] = {
    id: 'p-1',
    entryType: 'PAYMENT',
    amount: 2354.31,
    currency: 'OMR',
    methodCode: 'BANK',
    paymentReference: null,
    paymentDate: '2026-09-20',
    occurredAt: '2026-09-20T08:00:00Z',
  }
  const paidWithoutRun = (): BillDetailDto => {
    const base = detail({ readiness: APPROVED })
    return {
      ...base,
      bill: { ...base.bill, workflowState: 'PAID', paidAmount: 2354.31, outstandingAmount: 0 },
      settlement: {
        ...base.settlement,
        paymentState: 'PAID',
        paidAmount: 2354.31,
        outstandingAmount: 0,
      },
      payments: [PAID_IN_FULL],
    }
  }
  const partPaid = (): BillDetailDto =>
    detail({
      readiness: APPROVED,
      settlement: {
        ...detail().settlement,
        paidAmount: 1000,
        outstandingAmount: 1354.31,
        paymentState: 'PARTIALLY_PAID',
      },
    })

  /** The text under a step's label in the tracker. */
  function stepUnder(label: string): HTMLElement {
    const name = screen
      .getAllByText(label, { selector: 'span' })
      .find((span) => span.parentElement?.classList.contains('w-[104px]'))!
    return name.nextElementSibling as HTMLElement
  }
  const stepText = (label: string) => stepUnder(label).textContent ?? ''

  it('marks Scheduled as passed on a bill paid without a run, with no "Not yet"', async () => {
    const steps = stepsOf(paidWithoutRun(), format)
    expect(steps.map((step) => `${step.id}:${step.state}`)).toEqual([
      'arrived:done',
      'matched:done',
      'approved:done',
      'scheduled:done',
      'paid:done',
    ])
    billResponse = () => json(200, paidWithoutRun())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(stepText('Scheduled')).toBe('')
    expect(stepText('Paid')).toMatch(/^Paid \d/)
    expect(screen.queryByText('Not yet')).toBeNull()
  })

  it('still says "Not yet" on a step the bill has not reached', async () => {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(stepText('Scheduled')).toBe('Not yet')
  })

  it('says "Paid {paid} of {total}" on a part-paid bill, with the rial sign', async () => {
    expect(stepsOf(partPaid(), format).find((step) => step.id === 'paid')?.detail).toEqual({
      key: 'billDetail.steps.paidOf',
      values: { paid: 1000, total: 2354.31, currency: 'OMR' },
    })
    billResponse = () => json(200, partPaid())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    const under = stepUnder('Paid')
    expect(under.textContent).toBe('Paid OMR\u00A01,000.000 of OMR\u00A02,354.310')
    expect(under.querySelectorAll('svg')).toHaveLength(2)
    expect(under.textContent).not.toMatch(/Due/)
  })

  it('reads it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () => json(200, partPaid())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(stepText(i18n.t('billDetail.steps.paid'))).toBe(
      'دُفع OMR\u00A01,000.000 من OMR\u00A02,354.310',
    )
  })

  it('keeps the due date on a bill with nothing paid yet', () => {
    expect(
      stepsOf(detail({ readiness: APPROVED }), format).find((step) => step.id === 'paid')?.detail,
    ).toEqual({ key: 'billDetail.steps.dueOn', values: { date: '2026-10-01' } })
  })
})

// Owner, 12 Oct 2026: a document out of input VAT says so under its VAT figure, in his words.
describe('whether a bill counts in input VAT', () => {
  const outOfVat = (
    reason: string,
    bill: Partial<BillDetailDto['bill']> = {},
  ): BillDetailDto =>
    detail({
      bill: {
        ...detail().bill,
        ...bill,
        inputVat: { counted: false, countedOn: null, reason, vatAmountOmr: null },
      },
    })

  it('says a refused debit note is not counted until accepted', async () => {
    billResponse = () =>
      json(
        200,
        outOfVat('DEBIT_NOTE_NOT_ACCEPTED', {
          documentTypeCode: '383',
          debitNoteDecision: 'REFUSED',
        }),
      )
    renderBill()
    expect(await screen.findByText('Not counted in VAT until you accept it.')).toBeTruthy()
  })

  it('says a rejected bill is not counted while rejected', async () => {
    billResponse = () =>
      json(
        200,
        outOfVat('REJECTED', {
          readiness: { state: 'REJECTED', distinctApprovals: 0, required: 2, autoApproved: false },
        }),
      )
    renderBill()
    expect(await screen.findByText('Not counted in VAT while rejected.')).toBeTruthy()
  })

  it('says a recurring bill Fawtir raised has no supplier tax invoice yet', async () => {
    billResponse = () =>
      json(200, outOfVat('NO_SUPPLIER_TAX_INVOICE', { source: 'RECURRING', inboundDeliveryId: null }))
    renderBill()
    expect(
      await screen.findByText('Not counted in VAT: no supplier tax invoice yet.'),
    ).toBeTruthy()
  })

  it('reads the rejected caption in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () => json(200, outOfVat('REJECTED'))
    renderBill()
    expect(
      await screen.findByText('لا تُحتسب في ضريبة القيمة المضافة ما دامت مرفوضة.'),
    ).toBeTruthy()
  })

  it('says nothing on a counted bill, or from a server that does not send it', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          bill: {
            ...detail().bill,
            inputVat: { counted: true, countedOn: '2026-09-02', reason: 'COUNTED', vatAmountOmr: 112.11 },
          },
        }),
      )
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByText(/Not counted in VAT/)).toBeNull()
    cleanup()
    billResponse = () => json(200, detail())
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    expect(screen.queryByText(/Not counted in VAT/)).toBeNull()
  })

  it('has words only for the three reasons the owner worded', () => {
    const out = (reason: string) => ({ counted: false, countedOn: null, reason, vatAmountOmr: null })
    expect(inputVatNoteKey(out('DEBIT_NOTE_NOT_ACCEPTED'))).toBe(
      'billDetail.inputVat.debitNoteNotAccepted',
    )
    expect(inputVatNoteKey(out('REJECTED'))).toBe('billDetail.inputVat.rejected')
    expect(inputVatNoteKey(out('NO_SUPPLIER_TAX_INVOICE'))).toBe(
      'billDetail.inputVat.noSupplierTaxInvoice',
    )
    // No approved wording yet: nothing is said rather than a guess.
    for (const reason of ['DUPLICATE_OF_PEPPOL', 'SELF_BILLED_SALE', 'TARGET_NOT_COUNTED', 'NO_OMR_VAT'])
      expect(inputVatNoteKey(out(reason))).toBeNull()
    expect(inputVatNoteKey({ ...out('REJECTED'), counted: true })).toBeNull()
    expect(inputVatNoteKey(undefined)).toBeNull()
  })
})

// A4 G3 and A2 IN-17: how we answered the supplier and where our receipt report stands are read
// from the delivery record and the compliance record, never assumed.
describe('a bill received over Peppol: our reply and our receipt report', () => {
  const card = async (text: string | RegExp) => {
    const line = await screen.findByText(text)
    return within(line.closest('ul') as HTMLElement)
  }
  const sideReads = () =>
    calls().filter((call) => call.includes('/inbound-invoices/') || call.includes(RECORD_URL))

  it('reads the delivery, then its record, and says both, linking the report to its record', async () => {
    inboundResponse = () => json(200, inbound())
    renderBill()
    const lines = await card('Reply delivered to the supplier\'s access point: received, not confirmed')
    const report = await lines.findByText(/^Receipt reported to the Tax Authority · /)
    expect(report.closest('a')?.getAttribute('href')).toBe(`/compliance/activity/${CORRELATION_ID}`)
    expect(sideReads()).toEqual([`GET ${INBOUND_URL}`, `GET ${RECORD_URL}`])
    expect(calls().filter((call) => !call.startsWith('GET '))).toEqual([])
  })

  it('says not available to a person the delivery route hides, and reads no record', async () => {
    renderBill()
    const lines = await card("Reply to the supplier's access point: status not available")
    expect(lines.getByText('Receipt report status not available')).toBeTruthy()
    expect(sideReads()).toEqual([`GET ${INBOUND_URL}`])
  })

  it('falls back to the delivery record when the compliance record is refused', async () => {
    inboundResponse = () => json(200, inbound({ mlsCode: 'AB', mlsTransportState: 'RETRY_SCHEDULED' }))
    recordResponse = () => json(403, { type: 'https://api.fawtir.om/problems/branch-scope-company-report' })
    renderBill()
    const lines = await card("Reply to the supplier's access point failed and will be retried")
    expect(lines.getByText('Receipt report status not available')).toBeTruthy()
  })

  it('never reads a record that links to another delivery', async () => {
    inboundResponse = () => json(200, inbound())
    recordResponse = () =>
      json(200, record({ links: { document: '/api/v1/inbound-invoices/someone-else' } }))
    renderBill()
    const lines = await card('Receipt report status not available')
    expect(lines.queryByText(/Receipt reported to the Tax Authority/)).toBeNull()
  })

  it('tells a pending report apart from one the Tax Authority answered', async () => {
    inboundResponse = () => json(200, inbound())
    recordResponse = () =>
      json(200, record({ tdd_leg: { ack: 'NONE', ack_at: null, status: 'SUBMITTED', delivered_at: null, transport_state: 'PENDING' } }))
    renderBill()
    const lines = await card('Receipt not reported yet')
    expect(lines.queryByText(/Receipt reported to the Tax Authority/)).toBeNull()
  })

  it('keeps reading a pending reply and report until both settle, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Within a day of the fixture's receipt, so the record is still worth re-reading.
    vi.setSystemTime(new Date('2026-09-01T09:00:00Z'))
    try {
      inboundResponse = () => json(200, inbound({ mlsTransportState: 'PENDING', mlsDeliveredAt: null }))
      const answers = [
        record({
          invoice_leg: { transport_state: 'PENDING', delivered_at: null },
          tdd_leg: { ack: 'NONE', ack_at: null, status: 'SUBMITTED' },
        }),
        record(),
      ]
      let reads = 0
      recordResponse = () => json(200, answers[Math.min(reads++, answers.length - 1)])
      renderBill()
      await card("Reply to the supplier's access point: not delivered yet")
      expect(await screen.findByText("Receipt report delivered, waiting for the Tax Authority's answer")).toBeTruthy()
      await vi.advanceTimersByTimeAsync(3000)
      await card("Reply delivered to the supplier's access point: received, not confirmed")
      expect(await screen.findByText(/^Receipt reported to the Tax Authority · /)).toBeTruthy()
      const settled = calls().filter((call) => call === `GET ${RECORD_URL}`).length
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(calls().filter((call) => call === `GET ${RECORD_URL}`)).toHaveLength(settled)
      // The delivery record is read once; only the compliance record is re-read.
      expect(calls().filter((call) => call === `GET ${INBOUND_URL}`)).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads an old pending record once and does not keep re-reading it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-03T09:00:00Z'))
    try {
      inboundResponse = () => json(200, inbound({ mlsTransportState: 'PENDING', mlsDeliveredAt: null }))
      recordResponse = () =>
        json(200, record({ invoice_leg: { transport_state: 'PENDING', delivered_at: null } }))
      renderBill()
      await card("Reply to the supplier's access point: not delivered yet")
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(calls().filter((call) => call === `GET ${RECORD_URL}`)).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says a document that failed validation on arrival did, whatever networkVerified says', async () => {
    inboundResponse = () => json(200, inbound({ validationPassed: false, validationFailedLayer: 'SCHEMATRON' }))
    renderBill()
    const lines = await card('Did not pass validation when it arrived')
    expect(lines.queryByText('Passed PINT-OM validation')).toBeNull()
    expect(lines.queryByText(/SCHEMATRON/)).toBeNull()
  })

  it('asks nothing of the delivery routes for a bill that did not come over Peppol', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        bill: { ...detail().bill, source: 'UPLOADED', inboundDeliveryId: null },
        compliance: { ...detail().compliance, source: 'UPLOADED', networkVerified: false },
      })
    renderBill()
    await card('Not validated: it did not come over Peppol')
    expect(sideReads()).toEqual([])
    expect(screen.queryByText(/supplier's access point/)).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    inboundResponse = () => json(200, inbound())
    renderBill()
    const lines = await card('وصل الرد إلى نقطة الوصول لدى المورّد: استُلمت دون تأكيد')
    expect(await lines.findByText(/^أُبلغت هيئة الضرائب بالاستلام · /)).toBeTruthy()
  })
})

describe('a bill payment refused because someone else paid first (DB-10)', () => {
  it('names the balance the server gives, says it moved, and reads the bill again on close', async () => {
    actionResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'BILL_PAYMENT_EXCEEDS_OUTSTANDING',
        outstandingAmount: 0,
        currency: 'OMR',
      })
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    renderBill()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(
      await within(dialog).findByText(
        'What is owed changed since this page was opened. Closing this dialog shows the current balance.',
      ),
    ).toBeTruthy()
    const reads = () => calls().filter((call) => call === `GET ${BILL_URL}`).length
    const before = reads()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.cancel') }))
    await waitFor(() => expect(reads()).toBe(before + 1))
  })
})

describe('a USD bill’s payment terms and saving carry its currency (DB-5 review)', () => {
  it('names USD, never the rial sign, on the early-payment saving', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
    billResponse = () =>
      json(200, {
        ...detail({ readiness: APPROVED }),
        bill: {
          ...detail().bill,
          issueDate: today,
          currencyCode: 'USD',
          totalIncludingVat: 273,
          vatAmount: 13,
          outstandingAmount: 273,
          amountDue: 273,
        },
        settlement: { ...detail().settlement, currency: 'USD', billTotal: 273, outstandingAmount: 273 },
      })
    renderBill()
    const saving = (await screen.findByText(/^Paying by .* saves$/)).closest('p')!
    expect(within(saving).getByText('USD')).toBeTruthy()
    expect(saving.querySelector('svg')).toBeNull()
  })
})

describe('A rejected bill, on the page', () => {
  it.each(['en', 'ar'])('has no Approve button (%s)', async (language) => {
    await i18n.changeLanguage(language)
    billResponse = () =>
      json(
        200,
        detail({
          readiness: { state: 'REJECTED', distinctApprovals: 0, required: 1, autoApproved: false },
        }),
      )
    renderBill()
    await screen.findByText(i18n.t('billDetail.linked.title'))
    expect(
      screen.queryByRole('button', { name: i18n.t('billDetail.decision.approveForPayment') }),
    ).toBeNull()
    await i18n.changeLanguage('en')
  })
})

describe('The credit notes on a bill, in Linked documents', () => {
  const credited = (amount = 21) => {
    const bill = detail()
    return { ...bill, settlement: { ...bill.settlement, creditedAmount: amount } }
  }
  /** A `GET /v1/credit-notes` row as the live server answers it (`CreditNoteController`). */
  const noteRow = (id: string, number: string, billId: string | null, applied: number) => ({
    id,
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '381',
    creditNoteNumber: number,
    currencyCode: 'OMR',
    creditedAmount: applied,
    status: 'APPLIED',
    balance: { applied, refunded: 0, remaining: 0 },
    credits: {
      billNumber: 'QMS-2209',
      issueDate: '2026-09-01',
      documentUuid: null,
      billId,
      applied: billId !== null,
    },
    heldAsDuplicate: false,
  })
  const page = (...items: unknown[]) =>
    json(200, { items, page: 0, size: 200, total: items.length })

  it.each(['en', 'ar'])(
    'lists the note on this bill, linked, with what it credits (%s)',
    async (language) => {
      await i18n.changeLanguage(language)
      billResponse = () => json(200, credited())
      creditNotesResponse = () =>
        page(
          noteRow('cn-1', 'CN-77', ID, 21),
          // Another bill's, and one released from this bill: its `billId` answers null.
          noteRow('cn-2', 'CN-78', 'b-other', 5),
          noteRow('cn-3', 'CN-79', null, 0),
        )
      renderBill()
      const link = await screen.findByRole('link', { name: 'CN-77' })
      expect(link.getAttribute('href')).toBe('/expenditure/credit-notes/cn-1')
      expect(link.closest('li')?.textContent).toContain('21.000')
      expect(screen.queryByRole('link', { name: 'CN-78' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'CN-79' })).toBeNull()
      expect(creditNoteReads[0]).toContain('supplier_id=s-1')
      expect(creditNoteReads[0]).toContain('page_size=200')
      await i18n.changeLanguage('en')
    },
  )

  /** Nothing else to list: no order, no file. */
  const bare = () => {
    const bill = credited()
    return {
      ...bill,
      intake: null,
      bill: { ...bill.bill, match: null, inboundDeliveryId: null },
    }
  }

  it('a note held as a duplicate credits nothing, so is not listed', async () => {
    billResponse = () => json(200, bare())
    creditNotesResponse = () => page({ ...noteRow('cn-1', 'CN-77', ID, 21), heldAsDuplicate: true })
    renderBill()
    await screen.findByText(i18n.t('billDetail.linked.creditNotListed'))
    expect(screen.queryByRole('link', { name: 'CN-77' })).toBeNull()
  })

  it('does not say nothing is linked while credit stands and no note can be named', async () => {
    billResponse = () => json(200, bare())
    creditNotesResponse = () => json(403, { type: 'about:blank', status: 403 })
    renderBill()
    await screen.findByText(i18n.t('billDetail.linked.creditNotListed'))
    expect(screen.queryByText(i18n.t('billDetail.linked.none'))).toBeNull()
  })

  it('reads no notes for a bill with no credit on it', async () => {
    renderBill()
    await screen.findByText(i18n.t('billDetail.linked.title'))
    expect(creditNoteReads).toEqual([])
  })
})

describe('the reply line from the bill’s own peppol block (batch 39 EXP)', () => {
  const peppol = {
    deliveryId: 'd-1',
    mlsCode: 'AP' as const,
    mlsTransportState: 'DELIVERED' as const,
    mlsDeliveredAt: '2026-11-01T08:00:00Z',
    tddStatus: 'SUBMITTED' as const,
  }

  it('says how we answered the supplier when the delivery record is not read yet', () => {
    const keys = complianceOf({ ...detail(), peppol }, undefined, { kind: 'loading' }).map((n) => n.key)
    expect(keys).toContain('billDetail.compliance.reply.AP')
  })

  it('prefers it to "unavailable" when the delivery record cannot be read', () => {
    const keys = complianceOf({ ...detail(), peppol }, undefined, { kind: 'unavailable' }).map((n) => n.key)
    expect(keys).toContain('billDetail.compliance.reply.AP')
    expect(keys).not.toContain('billDetail.compliance.reply.unavailable')
  })

  it('keeps the transport apart from the decision: RE decided but not delivered is not delivered', () => {
    const notes = complianceOf(
      { ...detail(), peppol: { ...peppol, mlsCode: 'RE', mlsTransportState: 'RETRY_SCHEDULED' } },
      undefined,
      { kind: 'loading' },
    )
    expect(notes.map((n) => n.key)).toContain('billDetail.compliance.reply.retrying')
  })

  it('changes nothing for a null or absent block (non-Peppol, branch-limited, older server)', () => {
    expect(complianceOf({ ...detail(), peppol: null }).map((n) => n.key)).toEqual(
      complianceOf(detail()).map((n) => n.key),
    )
    expect(
      complianceOf({ ...detail(), peppol: null }, undefined, { kind: 'unavailable' }).map((n) => n.key),
    ).toContain('billDetail.compliance.reply.unavailable')
  })

  it('never reads the TDD status into the reporting line: that stays the proven record or receipt report', () => {
    expect(complianceOf({ ...detail(), peppol }).map((n) => n.key)).toContain(
      'billDetail.compliance.receipt.unavailable',
    )
  })
})

// NOT RUN (batch 41, static only). FIN-6: RD 5312a71b ported onto wave B-2 without the #824 names;
// owner batches 12 and 13 approved the reason, actor, time and overridden bills in Activity.
describe('a bill recorded over possible duplicates, in its activity', () => {
  const OTHER_A = '22222222-2222-2222-2222-22222222aaaa'
  const OTHER_B = '22222222-2222-2222-2222-22222222bbbb'
  const overridden = (
    duplicateOverride?: NonNullable<BillDetailDto['activity'][number]['duplicateOverride']>,
    detailText = 'INV-7, INV-8',
    actor = 'u-2',
  ) =>
    json(
      200,
      detail({
        activity: [
          {
            at: '2026-10-30T09:15:00Z',
            kind: 'DUPLICATE_OVERRIDDEN',
            detail: detailText,
            actor,
            actorName: 'Huda',
            ...(duplicateOverride ? { duplicateOverride } : {}),
          },
        ],
      }),
    )
  const bills = [
    { billId: OTHER_A, billNumber: 'INV-7', issueDate: '2026-10-01' },
    { billId: OTHER_B, billNumber: null, issueDate: null },
  ]
  const event = async () =>
    (await screen.findByText(/Listed by the person who recorded it/)).closest('li') as HTMLElement

  it('links each bill it was said to differ from, names who did it and shows an approver the reason', async () => {
    billResponse = () =>
      overridden({ overriddenBills: bills, reasonRecorded: true, reason: 'Second delivery, same week' })
    renderBill()
    const item = await event()
    expect(within(item).getByRole('link', { name: 'INV-7' }).getAttribute('href')).toBe(
      `/expenditure/bills/${OTHER_A}`,
    )
    // A bill with no number is still linked, by the word the credit-note rows use.
    expect(
      within(item).getByRole('link', { name: i18n.t('supplierCreditNotes.rows.unnumbered') }).getAttribute('href'),
    ).toBe(`/expenditure/bills/${OTHER_B}`)
    expect(within(item).getByText(/by Huda/)).toBeTruthy()
    expect(within(item).getByText('Why: Second delivery, same week')).toBeTruthy()
    expect(within(item).queryByText(/A reason was recorded/)).toBeNull()
    // The server's own text of the same numbers is not drawn beside the links.
    expect(within(item).queryByText(/INV-7, INV-8/)).toBeNull()
    // A real listing keeps its own label: it is not a submission for review (Round 36 item 6).
    expect(screen.queryByText(/Submitted for review/)).toBeNull()
  })

  it('tells a reader who cannot approve only that a reason was kept', async () => {
    billResponse = () => overridden({ overriddenBills: bills, reasonRecorded: true })
    renderBill()
    const item = await event()
    expect(within(item).getByRole('link', { name: 'INV-7' })).toBeTruthy()
    expect(within(item).getByText('A reason was recorded. Approvers can read it.')).toBeTruthy()
    expect(within(item).queryByText(/^Why:/)).toBeNull()
  })

  it('shows no reason line for a historical override that took none', async () => {
    billResponse = () => overridden({ overriddenBills: bills.slice(0, 1), reasonRecorded: false })
    renderBill()
    const item = await event()
    expect(within(item).getByRole('link', { name: 'INV-7' })).toBeTruthy()
    expect(within(item).queryByText(/^Why:/)).toBeNull()
    expect(within(item).queryByText(/A reason was recorded/)).toBeNull()
    expect(item.querySelectorAll('p')).toHaveLength(2)
  })

  it('says "by you" rather than the name when the reader made the override', async () => {
    billResponse = () => overridden({ overriddenBills: bills.slice(0, 1), reasonRecorded: false }, 'INV-7', 'u-1')
    renderBill()
    const item = await event()
    expect(within(item).getByText(/by you/)).toBeTruthy()
    expect(within(item).queryByText(/by Huda/)).toBeNull()
  })

  // PRV43-EXP6 M-1 (owner Round 33, Option 3) and Round 36 item 6: a recorder who listed only the
  // copy the hold names, with a reason, submitted the bill for review. The server sends that as its
  // own step, naming no bill and carrying the reason; the approver's later decision is a step of
  // its own, by its own person. The label is PENDING owner approval.
  it('shows a submission for review as its own step with the reason, apart from the later decision', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          activity: [
            {
              at: '2026-10-31T10:00:00Z',
              kind: 'NOT_DUPLICATE',
              detail: 'Two deliveries',
              actor: 'u-3',
              actorName: 'Salim',
            },
            {
              at: '2026-10-30T09:15:00Z',
              kind: 'DUPLICATE_SUBMITTED_FOR_REVIEW',
              detail: null,
              actor: 'u-2',
              actorName: 'Huda',
              duplicateOverride: { overriddenBills: [], reasonRecorded: true, reason: 'Please check' },
            },
          ],
        }),
      )
    renderBill()
    const listed = (await screen.findByText(/Submitted for review by the person who recorded it/)).closest(
      'li',
    ) as HTMLElement
    expect(screen.queryByText(/Listed by the person who recorded it/)).toBeNull()
    expect(within(listed).queryByRole('link')).toBeNull()
    expect(within(listed).getByText(/by Huda/)).toBeTruthy()
    expect(within(listed).getByText('Why: Please check')).toBeTruthy()
    expect(within(listed).queryByText(/Decided not a duplicate|Two deliveries|Salim/)).toBeNull()
    const decided = screen.getByText(new RegExp(i18n.t('billDetail.activity.kind.NOT_DUPLICATE'))).closest(
      'li',
    ) as HTMLElement
    expect(decided).not.toBe(listed)
    expect(within(decided).getByText(/Two deliveries/)).toBeTruthy()
    expect(within(decided).queryByText(/Submitted for review|Please check/)).toBeNull()
  })

  it('tells a reader who cannot approve only that a reason was kept on a submission for review', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          activity: [
            {
              at: '2026-10-30T09:15:00Z',
              kind: 'DUPLICATE_SUBMITTED_FOR_REVIEW',
              detail: null,
              actor: 'u-2',
              actorName: 'Huda',
              duplicateOverride: { overriddenBills: [], reasonRecorded: true },
            },
          ],
        }),
      )
    renderBill()
    const item = (await screen.findByText(/Submitted for review by the person who recorded it/)).closest(
      'li',
    ) as HTMLElement
    expect(within(item).getByText('A reason was recorded. Approvers can read it.')).toBeTruthy()
    expect(within(item).queryByText(/^Why:/)).toBeNull()
  })

  it('reads a submission for review in Arabic', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          activity: [
            {
              at: '2026-10-30T09:15:00Z',
              kind: 'DUPLICATE_SUBMITTED_FOR_REVIEW',
              detail: null,
              actor: 'u-2',
              actorName: 'Huda',
              duplicateOverride: { overriddenBills: [], reasonRecorded: true },
            },
          ],
        }),
      )
    await i18n.changeLanguage('ar')
    renderBill()
    expect(await screen.findByText(/أرسلها للمراجعة الشخص الذي سجّلها/)).toBeTruthy()
    expect(screen.queryByText(/Submitted for review|أدرجها الشخص الذي سجّلها/)).toBeNull()
  })

  it('reads an entry without the override block as text, as any other step', async () => {
    billResponse = () => overridden(undefined, 'INV-7')
    renderBill()
    const item = await event()
    expect(within(item).getByText(/^INV-7 · /)).toBeTruthy()
    expect(within(item).queryByRole('link')).toBeNull()
    expect(within(item).queryByText(/by Huda/)).toBeNull()
    expect(item.querySelectorAll('p')).toHaveLength(2)
  })

  it('draws no override when the bill has none, and an unknown step keeps its fallback', async () => {
    billResponse = () =>
      json(
        200,
        detail({
          activity: [{ at: '2026-10-30T09:15:00Z', kind: 'BRAND_NEW', detail: null, actor: null }],
        } as Parameters<typeof detail>[0]),
      )
    renderBill()
    expect(await screen.findByText(new RegExp(i18n.t('invoiceDetails.event.other')))).toBeTruthy()
    expect(screen.queryByText(/Listed by the person who recorded it/)).toBeNull()
    expect(screen.queryByText(/Submitted for review by the person who recorded it/)).toBeNull()
    expect(screen.queryByText(/^Why:/)).toBeNull()
    expect(screen.queryByText(/A reason was recorded/)).toBeNull()
  })

  it('reads in Arabic', async () => {
    billResponse = () => overridden({ overriddenBills: bills, reasonRecorded: true })
    await i18n.changeLanguage('ar')
    renderBill()
    const item = (await screen.findByText(/أدرجها الشخص الذي سجّلها/)).closest('li') as HTMLElement
    expect(within(item).getByRole('link', { name: 'INV-7' })).toBeTruthy()
    expect(within(item).getByText('سُجّل سبب. يمكن للمعتمِدين الاطلاع عليه.')).toBeTruthy()
    expect(within(item).queryByText(/Listed by the person|A reason was recorded/)).toBeNull()
  })
})
