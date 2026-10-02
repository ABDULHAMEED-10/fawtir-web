import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillDetailDto, BillMatchDto } from '../../api/expenditure/bills'
import {
  activityOf,
  canRecordPayment,
  complianceOf,
  decisionsOf,
  lineVatOf,
  singleVatRate,
  stepsOf,
} from '../../lib/billDetail'
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
    'purchase-order.read',
    'supplier.read',
  ],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['invoice.read'] }
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

const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`,
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
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
    if (url === `${BILL_URL}/match`) return method === 'GET' ? matchResponse() : actionResponse()
    if (url.startsWith(`${BILL_URL}/`)) return actionResponse()
    if (url === BILL_URL) return billResponse()
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
    const line = await screen.findByText('Receipt report status not available yet')
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
    expect(link.getAttribute('href')).toBe('/income/self-billing/sb-1')
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

  it('shows a self-billed bill\'s Activity from the document\'s history, in the self-bill page\'s words', async () => {
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

  it('reads a self-billed bill\'s heading and history in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () =>
      json(200, { ...selfBilled(AGREED), lines: SELF_BILLED_LINES, activity: SELF_BILLED_ACTIVITY })
    renderBill()
    expect(await screen.findByRole('heading', { level: 2, name: 'البنود المورَّدة إليك' })).toBeTruthy()
    expect(screen.getByText('صدرت')).toBeTruthy()
    expect(screen.getByText('أُنشئت المسودة')).toBeTruthy()
    expect(screen.queryByText('كما أرسله المورد')).toBeNull()
  })

  it('never says "the supplier sent no lines" of a self-billed bill, from a server that sends none', async () => {
    // A server from before the change, or a document that can no longer be read: 200, no lines.
    billResponse = () => json(200, { ...selfBilled(AGREED), lines: [], activity: [] })
    renderBill()
    expect(await screen.findByRole('heading', { level: 2, name: 'Items supplied to you' })).toBeTruthy()
    expect(screen.queryByText('The supplier sent no lines with this bill.')).toBeNull()
    expect(screen.queryByText('as sent by the supplier')).toBeNull()
    expect(screen.getByText('Nothing has been recorded against this bill yet.')).toBeTruthy()
  })

  it('keeps the supplier\'s heading and empty line for a bill the supplier sent', async () => {
    billResponse = () => json(200, { ...detail(), lines: [] })
    renderBill()
    expect(await screen.findByRole('heading', { level: 2, name: "What they're charging for" })).toBeTruthy()
    expect(screen.getByText('as sent by the supplier')).toBeTruthy()
    expect(screen.getByText('The supplier sent no lines with this bill.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Items supplied to you' })).toBeNull()
  })

  it('says "Recorded" for an activity kind it has no wording for, never the key', async () => {
    billResponse = () =>
      json(200, {
        ...detail(),
        activity: [{ at: '2026-10-01T08:00:00Z', kind: 'SOMETHING_NEW', detail: null, actor: null }],
      })
    renderBill()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Activity' })
    const card = within(heading.closest('section') as HTMLElement)
    expect(card.getByText('Recorded')).toBeTruthy()
    expect(card.queryByText(/SOMETHING_NEW/)).toBeNull()
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
    compliance: { source: 'SCANNED', networkVerified: false, obligation: 'PENDING_COMPLIANCE_INPUT' },
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
    ).toBe('/income/self-billing/sb-1')
  })

  it('reads the self-billed lines in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billResponse = () => json(200, selfBilled(AGREED))
    renderBill()
    const line = await screen.findByText('أصدرتها أنت عبر فوتر نيابةً عن المورّد')
    const card = within(line.closest('ul') as HTMLElement)
    expect(
      card.getByText('فاتورة ضريبية صحيحة: ضريبة القيمة المضافة قابلة للاسترداد'),
    ).toBeTruthy()
    expect(card.getByText(/^اتفاقية الفوترة الذاتية/)).toBeTruthy()
    expect(card.getByRole('link', { name: 'SBA-2026-003' }).getAttribute('href')).toBe(
      '/income/self-billing/sb-1',
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
    expect(screen.queryByText('Receipt report status not available yet')).toBeNull()
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

  it('names each line\'s VAT category from the letter the server sends: S, Z, E, O and none', async () => {
    const base = detail()
    const line = (lineNo: number, description: string, vatRate: number | null, code?: string | null) => ({
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
        settlement: { ...base.settlement, paidAmount: 2354.31, outstandingAmount: 0, paymentState: 'PAID' },
      }),
      'nothing owed',
    ).toBe(false)
    expect(await offered(base, READ_ONLY), 'no payment permission').toBe(false)
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

  it('names the payment run when the bill joined one after the page loaded', async () => {
    billResponse = () => json(200, detail({ readiness: APPROVED }))
    actionResponse = () =>
      json(400, {
        error: 'BILL_PAYMENT_IN_PAYMENT_RUN',
        detail: 'This bill is in payment run RUN-0012. Pay it there, or take it out of the run first.',
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

  it('shows the not-found state for a bill this tenant does not have', async () => {
    billResponse = () =>
      json(404, { type: 'https://api.fawtir.om/problems/not-found', error: 'BILL_NOT_FOUND' })
    renderBill()
    expect(await screen.findByText('Not found')).toBeTruthy()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderBill()
    expect(await screen.findByText('الطلب والاستلام والفاتورة متطابقة')).toBeTruthy()
    expect(screen.getByText('حالة إبلاغ الاستلام غير متاحة بعد')).toBeTruthy()
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
    expect(canRecordPayment(approved, (permission) => permission !== 'invoice.payment.manage')).toBe(
      false,
    )
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
      return { ...approved, bill: { ...approved.bill, match: { ...approved.bill.match!, verdict } } }
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
      decisionsOf(
        { ...approved, settlement: { ...approved.settlement, paidAmount: 0.001 } },
        all,
      ).reject,
    ).toBe(false)
    expect(decisionsOf({ ...approved, paymentRunReference: 'RUN-0012' }, all).reject).toBe(false)
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

  it('writes a self-billed bill as this company\'s own document, not as one that never arrived', () => {
    const selfBilledBill: BillDetailDto = {
      ...detail(),
      bill: { ...detail().bill, source: 'SELF_BILLED', inboundDeliveryId: null },
      compliance: { source: 'SELF_BILLED', networkVerified: true, obligation: 'REPORTED_BY_SENDER' },
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
        link: '/income/self-billing/sb-1',
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
    ).toBe('/income/self-billing/sb-9')
    // Every other source keeps its four lines.
    expect(complianceOf(detail()).map((note) => note.key)).toEqual([
      'billDetail.compliance.overPeppol',
      'billDetail.compliance.passedPintOm',
      'billDetail.compliance.receipt.unavailable',
      'billDetail.compliance.originalKept',
    ])
  })

  it('words the self-billed document\'s steps, keeps the bill\'s own kinds, and has a word for an unknown one', () => {
    const entry = (kind: string) =>
      ({ at: '2026-10-01T08:00:00Z', kind, detail: null, actor: 'u-1' }) as BillDetailDto['activity'][number]
    const keys = activityOf(
      {
        ...detail(),
        activity: ['DRAFT_CREATED', 'ISSUED', 'CANCELLED', 'APPROVED', 'PAID', 'BRAND_NEW'].map(entry),
      },
      'u-1',
    ).map((item) => item.key)
    expect(keys).toEqual([
      'invoiceDetails.event.DRAFT_CREATED',
      'invoiceDetails.event.ISSUED',
      'invoiceDetails.event.CANCELLED',
      'billDetail.activity.kind.APPROVED',
      'billDetail.activity.kind.PAID',
      'invoiceDetails.event.other',
    ])
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

// Draft wording, pending the owner (Wording-For-Abdul.md section 1). A correction there changes
// the sentences below with it.
describe('why a bill was refused, in its own sentence', () => {
  const refusal = (error: string, extra: Record<string, unknown> = {}) => () =>
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
    const sentence = await within(dialog).findByText(
      'That is more than this bill still owes. The most you can record is 2,354.310.',
    )
    expect(sentence.closest('[data-field="amount"]')).toBeTruthy()
    expect(within(dialog).queryByText(/on this invoice/)).toBeNull()
    expect(calls()).not.toContain(`POST ${BILL_URL}/payments`)

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(
      await within(dialog).findByText(
        'هذا أكثر مما تبقّى مستحقًا على هذه الفاتورة. أقصى ما يمكن تسجيله 2,354.310.',
      ),
    ).toBeTruthy()
  })

  // The dialog refuses an amount above the figure it holds before asking, so a refusal from the
  // server means that figure is out of date: the sentence names the figure the server sends.
  it('says the most that can be recorded as the server names it, not as the page holds it', async () => {
    actionResponse = refusal('BILL_PAYMENT_EXCEEDS_OUTSTANDING', {
      outstandingAmount: 1354.31,
      currency: 'OMR',
    })
    const dialog = await pay()
    const sentence = await within(dialog).findByText(
      'That is more than this bill still owes. The most you can record is 1,354.310.',
    )
    expect(sentence.closest('[data-field="amount"]')).toBeTruthy()
    expect(within(dialog).queryByText(/2,354\.310\.$/)).toBeNull()
    expect(within(dialog).queryByText(GENERIC)).toBeNull()

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(
      await within(dialog).findByText(
        'هذا أكثر مما تبقّى مستحقًا على هذه الفاتورة. أقصى ما يمكن تسجيله 1,354.310.',
      ),
    ).toBeTruthy()
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

  // Wording-For-Abdul.md section 5.
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
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('billDetail.decision.putOnHold') })[0])
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
