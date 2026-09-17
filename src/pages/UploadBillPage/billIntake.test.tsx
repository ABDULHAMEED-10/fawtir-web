import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import { billProblems, blankBillForm, linesTotals, toConfirmation, vatIncluded } from '../../lib/billIntake'
import { UploadBillPage } from './UploadBillPage'
import { ScanReceiptsPage } from '../ScanReceiptsPage'
import { RecordSupplierBillPage } from '../RecordSupplierBillPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'supplier.read', 'purchase-order.read'],
  scopes: [],
  featureFlags: {},
}

const SUPPLIER_ID = '66666666-6666-6666-6666-666666666666'
const ON_FILE = '77777777-7777-7777-7777-777777777777'

function intake(id: string, overrides: Partial<IntakeDto> = {}): IntakeDto {
  return {
    id,
    source: 'UPLOADED',
    filename: 'bill.pdf',
    contentType: 'application/pdf',
    byteSize: 120,
    sha256: 'x',
    documentTypeCode: null,
    extractionStatus: 'NONE',
    extracted: {
      supplierName: null,
      supplierVatNumber: null,
      billNumber: null,
      issueDate: null,
      dueDate: null,
      currency: null,
      net: null,
      vat: null,
      total: null,
      lines: [],
      confidence: {},
    },
    confirmedBillId: null,
    workflowState: 'DRAFT',
    uploadedAt: '2026-09-17T08:00:00Z',
    ...overrides,
  }
}

const XML_INTAKE = intake('i-xml', {
  filename: 'bill.xml',
  contentType: 'application/xml',
  extractionStatus: 'EXTRACTED',
  extracted: {
    supplierName: 'Muscat Roastery Co',
    supplierVatNumber: 'OM1100999001',
    billNumber: 'MR-INV-8821',
    issueDate: '2026-08-30',
    dueDate: '2026-09-29',
    currency: 'OMR',
    net: 100,
    vat: 5,
    total: 105,
    lines: [{ description: 'Arabica beans', quantity: 2, unitPrice: 50, vatRate: 5, amount: 100, confident: true }],
    confidence: { supplierName: true },
  },
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let uploads: IntakeDto[]
let confirmAnswers: Response[]

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([called, init]) => String(called).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  uploads = []
  confirmAnswers = []
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
    if (url.startsWith('/api/v1/bills/intake?source=') && method === 'POST') return json(201, uploads.shift())
    if (/\/api\/v1\/bills\/intake\/[^/]+\/confirm$/.test(url)) return confirmAnswers.shift() ?? json(201, { id: 'b-new', supplierBillNumber: 'X', totalIncludingVat: 1, currencyCode: 'OMR' })
    if (/\/api\/v1\/bills\/intake\/[^/]+$/.test(url) && method === 'DELETE') return new Response(null, { status: 204 })
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, { items: [{ id: SUPPLIER_ID, displayName: 'Muscat Roastery Co', vatNumber: 'OM1100999001' }], page: 0, pageSize: 20, total: 1 })
    if (url === `/api/v1/suppliers/${SUPPLIER_ID}`)
      return json(200, { profile: { id: SUPPLIER_ID, displayName: 'Qalhat Marine Supplies LLC', vatNumber: 'OM1100999002' } })
    if (url.startsWith('/api/v1/purchase-orders?'))
      return json(200, { items: [{ id: 'po-1', number: 'PO-0033', state: 'RECEIVED', orderDate: '2026-08-20', wantedBy: null, currency: 'OMR', totalGross: 105 }], page: 0, pageSize: 50, count: 1 })
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/bills/upload" element={<UploadBillPage />} />
        <Route path="/expenditure/bills/scan" element={<ScanReceiptsPage />} />
        <Route path="/suppliers/:slug/record-bill" element={<RecordSupplierBillPage />} />
        <Route path="/expenditure/bills/:id" element={<p>bill page</p>} />
        <Route path="/expenditure/bills" element={<p>bills list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function pick(files: File[]) {
  await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull())
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })
}

const pdf = (name = 'bill.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

describe('the bill form rules', () => {
  it('adds lines up through the invoice engine and sends plain figures', () => {
    const form = {
      ...blankBillForm(),
      supplierName: 'Someone',
      billNumber: 'A-1',
      issueDate: '2026-09-01',
      total: '105.000',
      vat: '5',
      lines: [{ id: 'l1', description: 'Beans', quantity: '2', unitPrice: '50', vatRate: '5' }],
    }
    expect(linesTotals(form.lines)).toMatchObject({ net: '100.000', vat: '5.000', total: '105.000', lineNets: ['100.000'] })
    expect(billProblems(form, { needsNumber: true })).toEqual({})
    expect(toConfirmation(form).lines).toEqual([{ description: 'Beans', quantity: 2, unit: null, unitPrice: 50, vatRate: 5, lineNet: 100 }])
  })

  it('refuses what the server would, and a due date before the bill date', () => {
    const problems = billProblems({ ...blankBillForm(), issueDate: '2026-09-02', dueDate: '2026-09-01', total: '1.2345', vat: '9' }, { needsNumber: true })
    expect(problems).toEqual({
      supplier: 'billIntake.error.supplier',
      billNumber: 'validation.required',
      dueDate: 'billIntake.error.dueBeforeIssue',
      total: 'billIntake.error.amount',
    })
    expect(billProblems({ ...blankBillForm(), supplierName: 'S', issueDate: '2026-09-02', total: '1' }, { needsNumber: false })).toEqual({})
  })

  it('works a receipt’s VAT out of a total that includes it', () => {
    expect(vatIncluded('10.500', '5')).toBe('0.500')
    expect(vatIncluded('10.500', 'exempt')).toBe('0')
  })
})

describe('upload a bill', () => {
  it('uploads the file, says a PDF is not read, and names what is missing before sending', async () => {
    uploads.push(intake('i-pdf'))
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])

    expect(await screen.findByText(/Nothing is read out of a PDF or photo/)).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake?source=UPLOADED')).toHaveLength(1)
    expect(screen.queryByText(/marked in amber/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    expect(await screen.findByText('Some fields need attention before the bill can be saved.')).toBeTruthy()
    expect(screen.getByText('Choose a supplier, or use the name as written on the bill.')).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake/i-pdf/confirm')).toHaveLength(0)
  })

  it('fills an XML bill in, warns about a possible duplicate, and saves it on the person’s word', async () => {
    uploads.push(XML_INTAKE)
    confirmAnswers.push(
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
        duplicateOf: { billId: ON_FILE, supplierBillNumber: 'MR-INV-8821', issueDate: '2026-08-30', total: 105, currencyCode: 'OMR', source: 'PEPPOL' },
      }),
    )
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

    expect(await screen.findByDisplayValue('MR-INV-8821')).toBeTruthy()
    expect(screen.getByDisplayValue('Arabica beans')).toBeTruthy()
    expect(screen.getByText('The lines add up to the total you typed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    const warning = await screen.findByRole('alert', { name: '' })
    expect(within(warning).getByText(/A bill MR-INV-8821 from this supplier is already recorded/)).toBeTruthy()
    expect(within(warning).getByText(/received over Peppol/)).toBeTruthy()
    expect(within(warning).getByRole('link', { name: 'Open that bill' }).getAttribute('href')).toBe(`/expenditure/bills/${ON_FILE}`)

    fireEvent.click(within(warning).getByRole('button', { name: /different bill/ }))
    expect(await screen.findByText('bill page')).toBeTruthy()

    const [first, second] = calls('POST', '/api/v1/bills/intake/i-xml/confirm')
    expect(bodyOf(first)).toMatchObject({ supplierName: 'Muscat Roastery Co', billNumber: 'MR-INV-8821', issueDate: '2026-08-30', total: 105, vat: 5, currency: 'OMR', notDuplicateOf: null })
    expect(bodyOf(second).notDuplicateOf).toBe(ON_FILE)
  })

  it('discards the upload when the person cancels', async () => {
    uploads.push(intake('i-pdf'))
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])
    fireEvent.click(await screen.findByRole('link', { name: 'Discard' }))
    await waitFor(() => expect(calls('DELETE', '/api/v1/bills/intake/i-pdf')).toHaveLength(1))
  })
})

describe('record a bill from a supplier', () => {
  it('asks for the file first and sends the page’s supplier with a chosen order', async () => {
    uploads.push({ ...XML_INTAKE, id: 'i-rec' })
    renderAt(`/suppliers/${SUPPLIER_ID}/record-bill`)
    expect(await screen.findByText('Choose the bill they sent')).toBeTruthy()
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

    expect(await screen.findByDisplayValue('MR-INV-8821')).toBeTruthy()
    const order = (await screen.findByLabelText('Order')) as HTMLSelectElement
    await waitFor(() => expect(order.querySelectorAll('option')).toHaveLength(2))
    fireEvent.change(order, { target: { value: 'po-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/i-rec/confirm')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/i-rec/confirm')[0])).toMatchObject({
      supplierId: SUPPLIER_ID,
      supplierName: 'Qalhat Marine Supplies LLC',
      purchaseOrderId: 'po-1',
    })
  })
})

describe('scan receipts', () => {
  it('confirms each photo on its own: paid by card, then still owing', async () => {
    uploads.push({ ...intake('r-1'), source: 'SCANNED' }, { ...intake('r-2'), source: 'SCANNED' })
    renderAt('/expenditure/bills/scan')
    await pick([new File(['a'], 'one.jpg', { type: 'image/jpeg' }), new File(['b'], 'two.jpg', { type: 'image/jpeg' })])

    expect(await screen.findByText('Receipt 1 of 2')).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake?source=SCANNED')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Petty cash' })).toBeNull()

    // A name as written, not a supplier record.
    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    fireEvent.change(await screen.findByPlaceholderText('Search your suppliers'), { target: { value: 'Al Noor Hardware' } })
    fireEvent.click(await screen.findByRole('button', { name: /Use “Al Noor Hardware” as written/ }))
    fireEvent.change(screen.getByLabelText(/Total paid/), { target: { value: '10.500' } })
    expect((screen.getByLabelText(/VAT on it/) as HTMLInputElement).value).toBe('0.500')
    fireEvent.click(screen.getByRole('button', { name: 'Card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & next' }))

    expect(await screen.findByText('Receipt 2 of 2')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-1/confirm')[0])).toMatchObject({
      supplierId: null,
      supplierName: 'Al Noor Hardware',
      billNumber: null,
      total: 10.5,
      vat: 0.5,
      lines: [],
      paidOnTheSpot: { methodCode: '48' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    fireEvent.change(await screen.findByPlaceholderText('Search your suppliers'), { target: { value: 'Taxi' } })
    fireEvent.click(await screen.findByRole('button', { name: /Use “Taxi” as written/ }))
    fireEvent.change(screen.getByLabelText(/Total paid/), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Still owing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-2/confirm')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-2/confirm')[0]).paidOnTheSpot).toBeNull()
  })
})
