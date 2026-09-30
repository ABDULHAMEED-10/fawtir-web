import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  InvoiceDetailDto,
  InvoiceHistoryDto,
  InvoiceReceivableDto,
  SelfBilledPayableDto,
} from '../../api/invoices/detail'
import type { AgreementDto } from '../../api/selfBilling/agreements'
import { selfBillStatus, selfBillTimeline, selfBillTracks } from '../../lib/selfBillDetail'
import { SelfBillDetailPage } from './SelfBillDetailPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const ID = '11111111-1111-1111-1111-111111111111'
const URL_BASE = `/api/v1/authored-invoices/${ID}`
const TODAY = '2026-09-25'

const BUYER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  tenantName: 'Al Bahja Coffee',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.payment.manage',
    'customer.read',
    'branch.read',
    'selfbilling.agreement.manage',
  ],
  scopes: [],
  featureFlags: {},
}

function invoice(overrides: Partial<InvoiceDetailDto> = {}): InvoiceDetailDto {
  return {
    id: ID,
    type: 'SELF_BILLED_INVOICE',
    correctionOfInvoiceId: null,
    version: 4,
    authoringState: 'ISSUED',
    deliveryState: 'DELIVERED',
    deliveryBlocker: null,
    peppolResponse: 'AB',
    deliveredAt: '2026-07-24T05:44:00Z',
    customerId: 'c-1',
    branchId: 'b-1',
    currency: 'OMR',
    vatMode: 'EXCLUSIVE',
    invoiceNumber: 'SBI-2026-0001',
    issueDate: '2026-07-24',
    dueDate: '2026-08-23',
    issuedAt: '2026-07-24T05:41:00Z',
    details: {
      deliveryDate: '2026-07-22',
      subject: 'July supply',
      purchaseOrderReference: 'PO-88301',
      customerVisibleNote: null,
      paymentTerms: { code: 'NET30', label: 'Net 30 days' },
      paymentMethod: { code: '30', label: 'Bank transfer' },
      correctionReasonCode: null,
      buyerReference: 'SB-0114',
      contractReference: 'SBA-2025-011',
      transactionType: 'FULL_TAX',
      transactionSubtypes: [],
      invoicingPeriod: null,
    },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: [
      {
        lineNumber: 1,
        productId: null,
        productCode: null,
        description: 'Cappuccino - Large',
        unitCode: 'EA',
        quantity: 12,
        unitPrice: 1.8,
        discountType: 'PERCENTAGE',
        discountValue: 0,
        taxCategoryCode: 'S5',
        en16931Category: 'S',
        taxRate: 5,
        exemptionReason: null,
      },
      {
        lineNumber: 2,
        productId: 'p-2',
        productCode: 'BN-002',
        description: 'Coffee Beans 1kg - House Blend',
        unitCode: 'KG',
        quantity: 4,
        unitPrice: 9.5,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        taxCategoryCode: 'S5',
        en16931Category: 'S',
        taxRate: 5,
        exemptionReason: null,
      },
    ],
    totals: {
      subtotal: 59.6,
      itemLevelDiscount: 3.8,
      headerDiscount: 0,
      totalDiscount: 3.8,
      taxableAmount: 55.8,
      vatAmount: 2.79,
      totalAmount: 58.59,
      payableRoundingAmount: 0,
      outputScale: 3,
    },
    ...overrides,
  }
}

const RECEIVABLE: InvoiceReceivableDto = {
  documentTotal: 58.59,
  paidAmount: 0,
  creditedAmount: 0,
  outstandingAmount: 58.59,
  currency: 'OMR',
  paymentState: 'UNPAID',
  overdue: true,
  dueDate: '2026-08-23',
}

/** The Expenditure payable the document raised at issue (D2): partly paid. */
const PAYABLE: SelfBilledPayableDto = {
  billId: 'bill-1',
  state: 'PARTIALLY_PAID',
  totalAmount: 58.59,
  paidAmount: 20,
  creditedAmount: 0,
  outstandingAmount: 38.59,
  currency: 'OMR',
  dueDate: '2026-08-23',
}
const BILL_PAYMENTS_URL = '/api/v1/bills/bill-1/payments'

const HISTORY: InvoiceHistoryDto = {
  entries: [
    {
      id: 'h-1',
      eventType: 'DRAFT_CREATED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 0,
      changedFieldsHash: null,
      actorId: 'u-1',
      occurredAt: '2026-07-24T05:12:00Z',
    },
    {
      id: 'h-2',
      eventType: 'ISSUED',
      outcome: 'SUCCEEDED',
      invoiceVersion: 1,
      changedFieldsHash: null,
      actorId: 'u-1',
      occurredAt: '2026-07-24T05:41:00Z',
    },
  ],
  truncated: false,
  limit: 100,
}

const AGREEMENT: AgreementDto = {
  id: 'a-1',
  customerId: 'c-1',
  agreementReference: 'SBA-2025-011',
  status: 'ACTIVE',
  sellerIdentityAssurance: 'COUNTERPARTY_VERIFIED',
  verifiedParticipant: '0248:OM1100731885',
  verifiedAt: '2026-01-01T00:00:00Z',
  effectiveFrom: '2025-10-01',
  effectiveTo: '2026-10-04',
  withdrawnAt: null,
  withdrawalReason: null,
  version: 0,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let invoiceResponse: () => Response
let billPaymentResponse: () => Response
let who: Entitlements

const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`,
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
  who = BUYER
  invoiceResponse = () => json(200, invoice())
  billPaymentResponse = () =>
    json(201, { id: 'p-1', entryType: 'PAYMENT', amount: 38.59, currency: 'OMR' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === `${URL_BASE}/receivable`) return json(200, RECEIVABLE)
    if (url === `${URL_BASE}/payments`) return json(200, [])
    if (url === `${URL_BASE}/attachments` && method === 'POST')
      return json(201, {
        id: 'f-2',
        filename: 'delivery-note.pdf',
        contentType: 'application/pdf',
        byteSize: 1200,
        sha256: 'z',
        attachedAt: '2026-09-25T08:00:00Z',
      })
    if (url === `${URL_BASE}/attachments/f-1` && method === 'DELETE') return json(204)
    if (url === `${URL_BASE}/attachments`)
      return json(200, [
        {
          id: 'f-1',
          filename: 'Readable copy.pdf',
          contentType: 'application/pdf',
          byteSize: 253952,
          sha256: 'x',
          attachedAt: '2026-07-18T08:00:00Z',
        },
      ])
    if (url === `${URL_BASE}/history`) return json(200, HISTORY)
    if (url === URL_BASE) return invoiceResponse()
    if (url === BILL_PAYMENTS_URL && method === 'POST') return billPaymentResponse()
    if (url === '/api/v1/customers/c-1')
      return json(200, {
        id: 'c-1',
        type: 'BUSINESS',
        displayName: 'Al Noor Dates LLC',
        profile: {
          details: { vatRegistrationNumber: 'OM1100731885' },
          contact: null,
          deliveryPreferences: null,
          invoiceAddress: null,
        },
        peppolDelivery: 'ACTIVE',
        status: 'ACTIVE',
        updatedAt: '2026-08-01T00:00:00Z',
      })
    if (url === '/api/v1/branches')
      return json(200, [
        {
          id: 'b-1',
          code: 'MAIN',
          name: 'Al Bahja Coffee (Main)',
          type: 'HEAD_OFFICE',
          city: 'Muscat',
        },
      ])
    if (url === '/api/v1/self-billing-agreements') return json(200, [AGREEMENT])
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function cleanupAndRender(response: () => Response) {
  cleanup()
  invoiceResponse = response
  renderPage()
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/income/self-billing/${ID}`]}>
      <Routes>
        <Route path="/income/self-billing/:id" element={<SelfBillDetailPage />} />
        <Route path="/income/self-billing" element={<p>self-billing list</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('A self-billed invoice through its own door', () => {
  it('reads the document from the authored-invoice endpoints and draws it in the design, with the parties turned round', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })).toBeTruthy()
    // The same reads as any authored document: the document, what it owes, its files, its trail.
    await waitFor(() => {
      expect(calls()).toContain(`GET ${URL_BASE}`)
      expect(calls()).toContain(`GET ${URL_BASE}/receivable`)
      expect(calls()).toContain(`GET ${URL_BASE}/attachments`)
      expect(calls()).toContain(`GET ${URL_BASE}/history`)
    })

    // Seller card names the supplier, buyer card names this company: never "Bill to".
    expect(await screen.findByText('Seller · issues the supply')).toBeTruthy()
    expect(screen.getByText('Buyer · raises this document')).toBeTruthy()
    expect(screen.getAllByText('Al Noor Dates LLC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Al Bahja Coffee').length).toBeGreaterThan(0)
    expect(screen.queryByText('Bill to')).toBeNull()
    expect(screen.queryByText('Billed by')).toBeNull()

    // The three tracks, the delivery one from the response code, the other two drawn as designed.
    expect(screen.getByText('Peppol delivery')).toBeTruthy()
    expect(screen.getByText('Delivered')).toBeTruthy()
    expect(screen.getByText('AB')).toBeTruthy()
    expect(screen.getByText('OTA reporting')).toBeTruthy()
    expect(screen.getByText('Supplier confirmation')).toBeTruthy()
    expect(screen.getByText(/Awaiting · 63 days/)).toBeTruthy()

    // The details and the agreement it was raised under, with how long that has left.
    expect(screen.getByText('SBA-2025-011')).toBeTruthy()
    expect(screen.getByText('Expires in 9 days')).toBeTruthy()
    expect(screen.getByText('PO-88301')).toBeTruthy()
    expect(screen.getByText('Al Bahja Coffee (Main)')).toBeTruthy()

    // Items with their computed totals, and the document's totals.
    expect(screen.getByText('Cappuccino - Large')).toBeTruthy()
    expect(screen.getByText('21.600')).toBeTruthy()
    expect(screen.getByText('34.200')).toBeTruthy()
    expect(screen.getAllByText('58.590').length).toBeGreaterThan(0)

    // The history, newest first, with the open item at the top.
    expect(screen.getByText('Waiting for Al Noor Dates LLC to confirm')).toBeTruthy()
    expect(screen.getByText('Issued')).toBeTruthy()
    expect(screen.getByText('Draft created')).toBeTruthy()

    // Attachments from the files read.
    expect(screen.getByText('Readable copy.pdf')).toBeTruthy()
  })

  it('keeps Record payment off when the document answers no payable, since the receivable never owes', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })
    await waitFor(() => expect(calls()).toContain(`GET ${URL_BASE}/receivable`))
    expect(screen.getByRole('button', { name: 'Record payment' })).toHaveProperty('disabled', true)
  })

  it("shows what is paid and still owed from the document's payable", async () => {
    invoiceResponse = () => json(200, invoice({ payable: PAYABLE }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })
    // The summary rail: what is settled, and the total due is what the payable still owes.
    expect(await screen.findByText('Paid or credited')).toBeTruthy()
    expect(screen.getByText('20.000')).toBeTruthy()
    expect(screen.getByText('38.590')).toBeTruthy()

    cleanupAndRender(() =>
      json(
        200,
        invoice({
          payable: { ...PAYABLE, state: 'PAID', paidAmount: 58.59, outstandingAmount: 0 },
        }),
      ),
    )
    expect(await screen.findByText('Paid')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record payment' })).toHaveProperty('disabled', true)
  })

  it('records a payment against the supplier bill, with an idempotency key, and reads the document again', async () => {
    invoiceResponse = () => json(200, invoice({ payable: PAYABLE }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })
    const open = screen.getByRole('button', { name: 'Record payment' })
    await waitFor(() => expect(open).toHaveProperty('disabled', false))
    fireEvent.click(open)
    // The money goes to the supplier here, so the dialog says paid, not received.
    const amount = (await screen.findByRole('textbox', {
      name: /Amount paid/,
    })) as HTMLInputElement
    expect(amount.value).toBe('38.590')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Paid on')).toBeTruthy()
    expect(within(dialog).queryByText(/Amount received|Received on/)).toBeNull()
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }),
    )

    await waitFor(() => expect(calls()).toContain(`POST ${BILL_PAYMENTS_URL}`))
    // Never the document's own route, which refuses a self-billed document.
    expect(calls()).not.toContain(`POST ${URL_BASE}/payments`)
    const [, init] = fetchMock.mock.calls.find(([url]) => url === BILL_PAYMENTS_URL)!
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      amount: 38.59,
      methodCode: '30',
      paymentReference: null,
      paymentDate: TODAY,
      currency: 'OMR',
    })
    const headers = (init as RequestInit).headers as Record<string, string> | Headers
    const key =
      headers instanceof Headers ? headers.get('Idempotency-Key') : headers['Idempotency-Key']
    expect(key).toMatch(/^payment-[0-9a-f-]{36}$/)

    expect(await screen.findByText('Payment recorded.')).toBeTruthy()
    await waitFor(() =>
      expect(calls().filter((call) => call === `GET ${URL_BASE}`)).toHaveLength(2),
    )
  })

  it('says the supplier bill needs approval in Expenditure when the bill is not ready to pay', async () => {
    invoiceResponse = () => json(200, invoice({ payable: PAYABLE }))
    billPaymentResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        title: 'Request refused',
        detail: 'This bill is PENDING with 0 of 1 required approvals; payment requires READY',
        error: 'BILL_NOT_READY_FOR_PAYMENT',
      })
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })
    const open = screen.getByRole('button', { name: 'Record payment' })
    await waitFor(() => expect(open).toHaveProperty('disabled', false))
    fireEvent.click(open)
    await screen.findByRole('textbox', { name: /Amount paid/ })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }),
    )

    expect(
      await screen.findByText(
        'The supplier bill for this document has not been approved yet. Approve it in Expenditure, then record the payment.',
      ),
    ).toBeTruthy()
    // The dialog stays open and nothing was recorded.
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('Payment recorded.')).toBeNull()
  })

  it('reads a draft as not sent, unpriced and with no open item', async () => {
    invoiceResponse = () =>
      json(
        200,
        invoice({
          authoringState: 'DRAFT',
          deliveryState: 'NOT_SUBMITTED',
          peppolResponse: null,
          deliveredAt: null,
          invoiceNumber: null,
          issueDate: null,
          totals: null,
        }),
      )
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Not numbered yet' })).toBeTruthy()
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByText('A draft is priced when it is issued.')).toBeTruthy()
    expect(screen.queryByText(/to confirm$/)).toBeNull()
    // A draft has no payments to read.
    expect(calls()).not.toContain(`GET ${URL_BASE}/payments`)
  })

  it('adds and removes files on a draft through the attachment routes', async () => {
    who = { ...BUYER, permissions: [...BUYER.permissions, 'invoice.attachment.manage'] }
    invoiceResponse = () =>
      json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null, totals: null }))
    renderPage()
    expect(await screen.findByText('Readable copy.pdf')).toBeTruthy()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF'], 'delivery-note.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(calls()).toContain(`POST ${URL_BASE}/attachments`))

    // The list is read again after the upload; the bin is live on a draft.
    fireEvent.click(await screen.findByRole('button', { name: 'Delete file' }))
    await waitFor(() => expect(calls()).toContain(`DELETE ${URL_BASE}/attachments/f-1`))
  })

  it('offers neither on an issued document, which the API would refuse', async () => {
    who = { ...BUYER, permissions: [...BUYER.permissions, 'invoice.attachment.manage'] }
    renderPage()
    expect(await screen.findByText('Readable copy.pdf')).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete file' })).toHaveProperty('disabled', true)
  })
})

describe('the self-billed credit note entry (SW3, D6)', () => {
  const SELF_BILLER: Entitlements = {
    ...BUYER,
    permissions: [...BUYER.permissions, 'selfbilling.create'],
  }
  const creditLink = () => screen.queryByRole('link', { name: 'Credit note' })

  it('opens the credit-note composer from an issued self-billed invoice', async () => {
    who = SELF_BILLER
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })).toBeTruthy()
    expect(creditLink()?.getAttribute('href')).toBe(
      `/income/self-billing/credit-notes/new?invoice=${ID}`,
    )
  })

  it('offers none on a draft, on a self-billed credit note, or without selfbilling.create', async () => {
    who = SELF_BILLER
    invoiceResponse = () => json(200, invoice({ authoringState: 'DRAFT', invoiceNumber: null }))
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Not numbered yet' })).toBeTruthy()
    expect(creditLink()).toBeNull()

    cleanupAndRender(() =>
      json(200, invoice({ type: 'SELF_BILLED_CREDIT_NOTE', invoiceNumber: 'SBC-2026-0001' })),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'SBC-2026-0001' })).toBeTruthy()
    expect(creditLink()).toBeNull()

    who = BUYER
    forgetEntitlements()
    cleanupAndRender(() => json(200, invoice()))
    expect(await screen.findByRole('heading', { level: 1, name: 'SBI-2026-0001' })).toBeTruthy()
    expect(creditLink()).toBeNull()
  })
})

describe('self-bill detail mapping', () => {
  it('reads the status from the state, then from what is owed, then from delivery', () => {
    expect(selfBillStatus(invoice({ authoringState: 'DRAFT' }), null).key).toBe(
      'selfBillDetail.status.draft',
    )
    expect(selfBillStatus(invoice(), { ...RECEIVABLE, paymentState: 'PAID' }).key).toBe(
      'selfBillDetail.status.paid',
    )
    expect(selfBillStatus(invoice({ deliveryState: 'NOT_SUBMITTED' }), RECEIVABLE).key).toBe(
      'selfBillDetail.status.toBeSent',
    )
    expect(selfBillStatus(invoice(), RECEIVABLE).key).toBe(
      'selfBillDetail.status.awaitingConfirmation',
    )
  })

  it('draws the delivery track from the response code and keeps the other two pending', () => {
    const [peppol, ota, supplier] = selfBillTracks(invoice({ peppolResponse: 'RE' }), {
      supplier: 'Al Noor Dates LLC',
      today: TODAY,
      deliveredAt: '24 Jul 2026, 09:44',
    })
    expect(peppol.tone).toBe('danger')
    expect(peppol.code).toBe('RE')
    expect(ota.tone).toBe('pending')
    expect(supplier.values).toEqual({ count: 63 })
  })

  it('puts the recorded events newest first under the open item, and drops it once paid', () => {
    const open = selfBillTimeline(invoice(), HISTORY, {
      userId: 'u-1',
      supplier: 'Al Noor Dates LLC',
      today: TODAY,
      paid: false,
    })
    expect(open.map((event) => event.tone)).toEqual(['current', 'done', 'done'])
    expect(open[1].titleKey).toBe('invoiceDetails.event.ISSUED')
    expect(open[1].detailKey).toBe('selfBillDetail.history.byYou')

    const settled = selfBillTimeline(invoice(), HISTORY, {
      userId: null,
      supplier: 'Al Noor Dates LLC',
      today: TODAY,
      paid: true,
    })
    expect(settled).toHaveLength(2)
  })
})
