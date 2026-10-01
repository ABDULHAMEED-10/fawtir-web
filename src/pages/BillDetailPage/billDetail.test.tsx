import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillDetailDto, BillMatchDto } from '../../api/expenditure/bills'
import { complianceOf, decisionsOf, stepsOf } from '../../lib/billDetail'
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
        tabs: { bills: 2, payments: 1, orders: 3, documents: 0 },
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
})
