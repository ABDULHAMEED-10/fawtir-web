import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import type { ReferenceDataDto } from '../../api/reference/referenceData'
import {
  BILL_CONFIRM_REFUSALS,
  billProblems,
  blankBillForm,
  fromIntake,
  linesTotals,
  savedDetails,
  supplierTaxCategory,
  supplierWithVat,
  toConfirmation,
  toCorrections,
  vatIncluded,
} from '../../lib/billIntake'
import { overrideExtras } from '../../lib/billDuplicateOverride'
import { UploadBillPage } from './UploadBillPage'
import { UploadCreditNotePage } from '../UploadCreditNotePage'
import { UploadDebitNotePage } from '../UploadDebitNotePage'
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

/**
 * The duplicate override is drawn only for a session holding invoice.approve (round 18), and the
 * screens take the session from AppShell's own /me/entitlements read, which wins over any provider
 * a test wraps around them. So a test that decides a duplicate signs in as this.
 */
const APPROVER: Entitlements = {
  ...MANAGER,
  username: 'approver',
  permissions: [...MANAGER.permissions, 'invoice.approve'],
}

/** Who /me/entitlements answers for in this test. */
let who: Entitlements

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
    lines: [
      {
        description: 'Arabica beans',
        quantity: 2,
        unitPrice: 50,
        vatRate: 5,
        amount: 100,
        confident: true,
      },
    ],
    confidence: { supplierName: true },
  },
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let uploads: IntakeDto[]
let confirmAnswers: Response[]
/** What the next upload answers instead of an intake, when set. */
let uploadRefusal: (() => Response) | null
/** The intake a resume link (`/upload/:intakeId`) finds, when one is set. */
let resumed: IntakeDto | null

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([called, init]) =>
      String(called).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  uploads = []
  confirmAnswers = []
  uploadRefusal = null
  resumed = null
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/bills/intake?source=') && method === 'POST')
      return uploadRefusal ? uploadRefusal() : json(201, uploads.shift())
    if (/\/api\/v1\/bills\/intake\/[^/]+\/confirm$/.test(url))
      return (
        confirmAnswers.shift() ??
        json(201, {
          id: 'b-new',
          supplierBillNumber: 'X',
          totalIncludingVat: 1,
          currencyCode: 'OMR',
        })
      )
    if (/\/api\/v1\/bills\/intake\/[^/]+$/.test(url) && method === 'DELETE')
      return new Response(null, { status: 204 })
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, {
        items: [{ id: SUPPLIER_ID, displayName: 'Muscat Roastery Co', vatNumber: 'OM1100999001' }],
        page: 0,
        pageSize: 20,
        total: 1,
      })
    if (url === `/api/v1/suppliers/${SUPPLIER_ID}`)
      return json(200, {
        profile: {
          id: SUPPLIER_ID,
          displayName: 'Qalhat Marine Supplies LLC',
          vatNumber: 'OM1100999002',
        },
      })
    if (url.startsWith('/api/v1/purchase-orders?'))
      return json(200, {
        items: [
          {
            id: 'po-1',
            number: 'PO-0033',
            state: 'RECEIVED',
            orderDate: '2026-08-20',
            wantedBy: null,
            currency: 'OMR',
            totalGross: 105,
          },
        ],
        page: 0,
        pageSize: 50,
        count: 1,
      })
    if (/\/api\/v1\/bills\/intake\/[^/]+\/file$/.test(url)) {
      return new Response('%PDF-1.4', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="saved.pdf"',
        },
      })
    }
    if (/\/api\/v1\/bills\/intake\/[^/]+$/.test(url) && method === 'PUT')
      return json(200, intake('i-kept'))
    if (/\/api\/v1\/bills\/intake\/[^/]+$/.test(url) && method === 'GET') {
      return resumed ? json(200, resumed) : json(404, { error: 'BILL_INTAKE_NOT_FOUND' })
    }
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/bills/upload" element={<UploadBillPage />} />
        <Route path="/expenditure/bills/upload/:intakeId" element={<UploadBillPage />} />
        <Route path="/expenditure/bills/scan" element={<ScanReceiptsPage />} />
        <Route path="/suppliers/:slug/record-bill" element={<RecordSupplierBillPage />} />
        <Route path="/expenditure/credit-notes/upload" element={<UploadCreditNotePage />} />
        <Route path="/expenditure/debit-notes/upload" element={<UploadDebitNotePage />} />
        <Route path="/expenditure/bills/:id" element={<p>bill page</p>} />
        <Route path="/expenditure/bills" element={<p>bills list</p>} />
        <Route path="/expenditure/credit-notes/:id" element={<p>credit note page</p>} />
        <Route path="/expenditure/debit-notes/:id" element={<p>debit note page</p>} />
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
  it('takes the one supplier whose VAT number is exactly the file’s, whatever its case (DB-12)', () => {
    const a = { id: 'a', vatNumber: 'OM1100999001' }
    const b = { id: 'b', vatNumber: 'OM11009990012' }
    expect(supplierWithVat([b, a], ' om1100999001 ')).toBe(a)
    expect(supplierWithVat([b], 'OM1100999001')).toBeNull()
    expect(supplierWithVat([a, { id: 'c', vatNumber: 'om1100999001' }], 'OM1100999001')).toBeNull()
    expect(supplierWithVat([{ id: 'd', vatNumber: null }], '')).toBeNull()
  })

  it('keeps a half-typed bill as corrections, refusing only malformed figures', () => {
    const half = { ...blankBillForm(), billNumber: 'NHS-2026-14', total: '42.500' }
    expect(billProblems(half, { needsNumber: true, partial: true })).toEqual({})
    expect(billProblems(half, { needsNumber: true })).toMatchObject({
      supplier: 'billIntake.error.supplier',
      issueDate: 'validation.required',
    })
    expect(billProblems({ ...half, vat: '4,2' }, { needsNumber: true, partial: true })).toEqual({
      vat: 'billIntake.error.amount',
    })
    expect(toCorrections(half, null)).toEqual({
      supplierName: null,
      supplierVatNumber: null,
      billNumber: 'NHS-2026-14',
      issueDate: null,
      dueDate: null,
      currency: 'OMR',
      net: null,
      vat: null,
      total: 42.5,
      lines: [],
    })
    // Saved details are told from a fresh PDF by the server's marks, and from an XML by its status.
    expect(savedDetails(intake('i'))).toBe(false)
    expect(
      savedDetails(
        intake('i', {
          extracted: { ...intake('i').extracted, total: 42.5, confidence: { total: true } },
        }),
      ),
    ).toBe(true)
    expect(savedDetails(XML_INTAKE)).toBe(false)
  })

  it('adds lines up through the invoice engine and sends plain figures', () => {
    const form = {
      ...blankBillForm(),
      supplierName: 'Someone',
      billNumber: 'A-1',
      issueDate: '2026-09-01',
      total: '105.000',
      vat: '5',
      lines: [
        {
          id: 'l1',
          description: 'Beans',
          quantity: '2',
          unitPrice: '50',
          vatRate: '5',
          taxCategoryCode: 'S5',
        },
      ],
    }
    expect(linesTotals(form.lines)).toMatchObject({
      net: '100.000',
      vat: '5.000',
      total: '105.000',
      lineNets: ['100.000'],
    })
    expect(billProblems(form, { needsNumber: true })).toEqual({})
    expect(toConfirmation(form).lines).toEqual([
      {
        description: 'Beans',
        quantity: 2,
        unit: null,
        unitPrice: 50,
        vatRate: 5,
        taxCategoryCode: 'S5',
        lineNet: 100,
      },
    ])
  })

  it('round 20 L-5: a payment on a bill that would be held is worded, not left to the generic failure', () => {
    expect(BILL_CONFIRM_REFUSALS.BILL_PAYMENT_ON_HOLD).toEqual({
      field: null,
      key: 'billIntake.refused.paymentOnHold',
    })
  })

  it('round 20 L-6: the legacy notDuplicateOf is always sent as null, with or without an override', () => {
    expect(toConfirmation(blankBillForm()).notDuplicateOf).toBeNull()
    const overridden = toConfirmation(
      blankBillForm(),
      overrideExtras({ notDuplicateOfIds: ['b-1'], overrideReason: 'Second delivery' }),
    )
    expect(overridden.notDuplicateOf).toBeNull()
    expect(overridden.notDuplicateOfIds).toEqual(['b-1'])
  })

  it('refuses what the server would, and a due date before the bill date', () => {
    const problems = billProblems(
      {
        ...blankBillForm(),
        issueDate: '2026-09-02',
        dueDate: '2026-09-01',
        total: '1.2345',
        vat: '9',
      },
      { needsNumber: true },
    )
    expect(problems).toEqual({
      supplier: 'billIntake.error.supplier',
      billNumber: 'validation.required',
      dueDate: 'billIntake.error.dueBeforeIssue',
      total: 'billIntake.error.amount',
    })
    expect(
      billProblems(
        { ...blankBillForm(), supplierName: 'S', issueDate: '2026-09-02', total: '1' },
        { needsNumber: false },
      ),
    ).toEqual({})
  })

  it('reads a file’s rate as a category, and keeps a supplier’s default to Oman’s four', () => {
    const line = {
      description: 'x',
      quantity: 1,
      unitPrice: 1,
      amount: 1,
      confident: true,
    }
    const read = (lines: Record<string, unknown>[]) =>
      fromIntake({
        ...intake('i-x'),
        extracted: { ...intake('i-x').extracted, lines },
      } as IntakeDto).lines.map((row) => [row.taxCategoryCode, row.vatRate])
    expect(
      read([
        { ...line, vatRate: 5 },
        { ...line, vatRate: 0 },
        { ...line, vatRate: 0, taxCategoryCode: 'E0' },
      ]),
    ).toEqual([
      ['S5', '5'],
      ['Z0', '0'],
      ['E0', '0'],
    ])
    const reference: ReferenceDataDto = {
      taxCategories: [
        {
          code: 'S5',
          en16931Category: 'S',
          rate: '5',
          exemptionReasonRequired: false,
          active: true,
        },
        {
          code: 'AE0',
          en16931Category: 'AE',
          rate: '0',
          exemptionReasonRequired: true,
          active: true,
        },
        {
          code: 'Z0',
          en16931Category: 'Z',
          rate: '0',
          exemptionReasonRequired: false,
          active: true,
        },
      ],
      units: [],
      paymentTerms: [],
      paymentMethods: [],
    }
    // CL-04-OM: reverse charge is not a category a line may carry, so S5 stands in.
    expect(supplierTaxCategory(reference, 'AE0').code).toBe('S5')
    expect(supplierTaxCategory(reference, 'Z0').code).toBe('Z0')
    expect(supplierTaxCategory(reference, null).code).toBe('S5')
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

    expect(await screen.findByText(/PDF or photo, not read/)).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake?source=UPLOADED')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Type in the bill' })).toBeTruthy()
    expect(screen.queryByText(/read the e-invoice file for you/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    expect(
      await screen.findByText('Some fields need attention before the bill can be saved.'),
    ).toBeTruthy()
    expect(
      screen.getByText('Choose a supplier, or use the name as written on the bill.'),
    ).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake/i-pdf/confirm')).toHaveLength(0)
  })

  it('fills an XML bill in, warns about a possible duplicate, and saves it on the person’s word', async () => {
    who = APPROVER
    uploads.push(XML_INTAKE)
    confirmAnswers.push(
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
        duplicateOf: {
          billId: ON_FILE,
          supplierBillNumber: 'MR-INV-8821',
          issueDate: '2026-08-30',
          total: 105,
          currencyCode: 'OMR',
          source: 'PEPPOL',
        },
        duplicates: [
          {
            billId: ON_FILE,
            supplierBillNumber: 'MR-INV-8821',
            issueDate: '2026-08-30',
            total: 105,
            currencyCode: 'OMR',
            source: 'PEPPOL',
          },
        ],
      }),
    )
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

    expect(await screen.findByDisplayValue('MR-INV-8821')).toBeTruthy()
    expect(screen.getByDisplayValue('Arabica beans')).toBeTruthy()
    expect(screen.getByText('The lines add up to the total you typed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    const warning = await screen.findByRole('alert', { name: '' })
    expect(
      within(warning).getByText(/A bill MR-INV-8821 from this supplier is already recorded/),
    ).toBeTruthy()
    // The figure keeps its rial sign (read out as "OMR"), not the letters as text.
    expect(
      within(warning).getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /105\.000\s+OMR, received over Peppol/.test(element.textContent ?? ''),
      ),
    ).toBeTruthy()
    expect(warning.querySelector('svg')).toBeTruthy()
    expect(within(warning).getByRole('link', { name: 'Open that bill' }).getAttribute('href')).toBe(
      `/expenditure/bills/${ON_FILE}`,
    )

    fireEvent.change(within(warning).getByRole('textbox', { name: 'Why is this a different bill?' }), {
      target: { value: 'Second delivery' },
    })
    fireEvent.click(within(warning).getByRole('button', { name: /different bill/ }))
    expect(await screen.findByText('bill page')).toBeTruthy()

    const [first, second] = calls('POST', '/api/v1/bills/intake/i-xml/confirm')
    expect(bodyOf(first)).toMatchObject({
      supplierName: 'Muscat Roastery Co',
      billNumber: 'MR-INV-8821',
      issueDate: '2026-08-30',
      total: 105,
      vat: 5,
      currency: 'OMR',
      notDuplicateOf: null,
    })
    expect(bodyOf(second)).toMatchObject({
      notDuplicateOf: null,
      notDuplicateOfIds: [ON_FILE],
      overrideReason: 'Second delivery',
    })
  })

  it('starts with the supplier whose VAT number the file states, found on the list (DB-12)', async () => {
    uploads.push(XML_INTAKE)
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

    expect(
      await screen.findByText('VAT number on the file matches the supplier already on your list.'),
    ).toBeTruthy()
    expect(screen.queryByText(/The file gives the supplier's VAT number/)).toBeNull()
    expect(
      calls('GET', '/api/v1/suppliers?').some(([url]) => String(url).includes('q=OM1100999001')),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/i-xml/confirm')[0])).toMatchObject({
      supplierId: SUPPLIER_ID,
      supplierName: 'Muscat Roastery Co',
    })
  })

  it('leaves the supplier to the person when no one, or more than one, on the list has that VAT number (DB-12)', async () => {
    const answer = fetchMock.getMockImplementation()!
    const cases: { vatNumbers: string[]; total?: number }[] = [
      { vatNumbers: ['OM1100999001X'] },
      { vatNumbers: ['OM1100999001', 'om1100999001'] },
      // One exact match on the first page, but more matches than the page holds.
      { vatNumbers: ['OM1100999001'], total: 21 },
    ]
    for (const { vatNumbers, total = vatNumbers.length } of cases) {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
        url.startsWith('/api/v1/suppliers?')
          ? json(200, {
              items: vatNumbers.map((vatNumber, index) => ({
                id: `s-${index}`,
                displayName: `Supplier ${index}`,
                vatNumber,
              })),
              page: 0,
              pageSize: 20,
              total,
            })
          : answer(url, init),
      )
      uploads.push(XML_INTAKE)
      const { unmount } = renderAt('/expenditure/bills/upload')
      await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

      expect(
        await screen.findByText("The file gives the supplier's VAT number as OM1100999001."),
      ).toBeTruthy()
      await waitFor(() =>
        expect(
          calls('GET', '/api/v1/suppliers?').some(([url]) => String(url).includes('q=OM1100999001')),
        ).toBe(true),
      )
      // Let the lookup's answer land before saying nothing was picked from it.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(screen.queryByText(/matches the supplier already on your list/)).toBeNull()
      unmount()
    }
  })

  it('discards the upload when the person cancels', async () => {
    uploads.push(intake('i-pdf'))
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])
    fireEvent.click(await screen.findByRole('link', { name: 'Discard' }))
    await waitFor(() => expect(calls('DELETE', '/api/v1/bills/intake/i-pdf')).toHaveLength(1))
  })
})

describe('an upload saved for later', () => {
  it('keeps what is typed so far without demanding the rest, then goes back to the list', async () => {
    uploads.push(intake('i-pdf'))
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])
    await screen.findByText(/PDF or photo, not read/)

    fireEvent.change(screen.getByRole('textbox', { name: /Their bill number/ }), {
      target: { value: 'NHS-2026-14' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /Total on the bill/ }), {
      target: { value: '42.500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))

    await waitFor(() => expect(calls('PUT', '/api/v1/bills/intake/i-pdf')).toHaveLength(1))
    expect(bodyOf(calls('PUT', '/api/v1/bills/intake/i-pdf')[0])).toEqual({
      documentTypeCode: '380',
      extracted: {
        supplierName: null,
        supplierVatNumber: null,
        billNumber: 'NHS-2026-14',
        issueDate: null,
        dueDate: null,
        currency: 'OMR',
        net: null,
        vat: null,
        total: 42.5,
        lines: [],
      },
    })
    expect(await screen.findByText('bills list')).toBeTruthy()
    expect(calls('DELETE', '/api/v1/bills/intake/i-pdf')).toHaveLength(0)
    expect(calls('POST', '/api/v1/bills/intake/i-pdf/confirm')).toHaveLength(0)
  })

  it('refuses to keep a malformed figure, though not a missing one', async () => {
    uploads.push(intake('i-pdf'))
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])
    await screen.findByText(/PDF or photo, not read/)

    fireEvent.change(screen.getByRole('textbox', { name: /Total on the bill/ }), {
      target: { value: '42,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))

    expect(
      await screen.findByText('Some fields need attention before the bill can be saved.'),
    ).toBeTruthy()
    expect(calls('PUT', '/api/v1/bills/intake/i-pdf')).toHaveLength(0)
  })

  it('comes back with its file and the details typed so far, and confirms from there', async () => {
    resumed = intake('i-kept', {
      extracted: {
        ...intake('i-kept').extracted,
        supplierName: 'Nizwa Hardware Store',
        billNumber: 'NHS-2026-14',
        issueDate: '2026-09-01',
        currency: 'OMR',
        total: 42.5,
        confidence: {
          supplierName: true,
          billNumber: true,
          issueDate: true,
          currency: true,
          total: true,
        },
      },
    })
    renderAt('/expenditure/bills/upload/i-kept')

    expect(await screen.findByDisplayValue('NHS-2026-14')).toBeTruthy()
    expect(screen.getByText(/Details saved earlier/)).toBeTruthy()
    expect(calls('GET', '/api/v1/bills/intake/i-kept/file')).toHaveLength(1)
    expect(screen.getByText('saved.pdf')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/i-kept/confirm')[0])).toMatchObject({
      supplierName: 'Nizwa Hardware Store',
      billNumber: 'NHS-2026-14',
      total: 42.5,
      issueDate: '2026-09-01',
    })
  })

  it('sends a link to an upload confirmed meanwhile on to its bill', async () => {
    resumed = intake('i-done', { confirmedBillId: 'b-77', workflowState: null })
    renderAt('/expenditure/bills/upload/i-done')
    expect(await screen.findByText('bill page')).toBeTruthy()
  })
})

// Record a bill (a supplier's page) was put on its own frame (163:27781) and no longer shares
// this form; its confirm request, with the page's supplier and the chosen order, is asserted in
// src/pages/SupplierDetailPage/supplierRecord.test.tsx.

describe('scan receipts', () => {
  it('confirms each photo on its own: paid by card, then still owing', async () => {
    uploads.push({ ...intake('r-1'), source: 'SCANNED' }, { ...intake('r-2'), source: 'SCANNED' })
    renderAt('/expenditure/bills/scan')
    await pick([
      new File(['a'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'two.jpg', { type: 'image/jpeg' }),
    ])

    expect(await screen.findByText('Receipt 1 of 2')).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake?source=SCANNED')).toHaveLength(2)
    // The frame's five choices in one row; petty cash is recorded as cash (UNCL4461 has no code of its own).
    expect(screen.getByRole('button', { name: 'Petty cash' })).toBeTruthy()

    // A name as written, not a supplier record.
    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    fireEvent.change(await screen.findByPlaceholderText('Search your suppliers'), {
      target: { value: 'Al Noor Hardware' },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: /Use “Al Noor Hardware” as written/ }),
    )
    fireEvent.change(screen.getByLabelText(/Total paid/), { target: { value: '10.500' } })
    expect((screen.getByLabelText(/VAT on it/) as HTMLInputElement).value).toBe('0.500')
    fireEvent.click(screen.getByRole('button', { name: 'Card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    expect(await screen.findByText('Receipt 2 of 2')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-1/confirm')[0])).toMatchObject({
      supplierId: null,
      supplierName: 'Al Noor Hardware',
      billNumber: null,
      total: 10.5,
      vat: 0.5,
      lines: [],
      paidOnTheSpot: { methodCode: '48' },
      taxCategoryCode: 'S5',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    fireEvent.change(await screen.findByPlaceholderText('Search your suppliers'), {
      target: { value: 'Taxi' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Use “Taxi” as written/ }))
    fireEvent.change(screen.getByLabelText(/Total paid/), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Still owing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exempt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-2/confirm')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-2/confirm')[0]).paidOnTheSpot).toBeNull()
    // Exempt and 0% are both a zero rate; the category tells them apart.
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-2/confirm')[0]).taxCategoryCode).toBe('E0')
  })
})

describe('upload a supplier note', () => {
  // The note uploads are on their own frames (163:19080, 163:20010) with their own intake form;
  // the credit note's 381 is asserted in src/pages/UploadCreditNotePage/uploadCreditNote.test.tsx.
  // The type is what decides which way the money points, so it is the assertion that matters:
  // a 380 here would file a charge as an ordinary bill.
  it('confirms a debit note as a 383 and opens it on the debit-note screen', async () => {
    uploads.push(XML_INTAKE)
    renderAt('/expenditure/debit-notes/upload')
    await pick([new File(['<DebitNote/>'], 'note.xml', { type: 'application/xml' })])

    expect(await screen.findByDisplayValue('MR-INV-8821')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save the debit note' }))

    expect(await screen.findByText('debit note page')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/i-xml/confirm')[0]).documentTypeCode).toBe(
      '383',
    )
  })

  it('still files a bill as a 380 when no type is stated', async () => {
    // The default is the capability half of the pair above: widening the field must not have
    // changed what the bill upload sends.
    uploads.push(XML_INTAKE)
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

    await screen.findByDisplayValue('MR-INV-8821')
    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))

    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/i-xml/confirm')[0]).documentTypeCode).toBe(
      '380',
    )
  })
})

// The owner's approved sentences, word for word.
describe('why a captured bill was refused, in its own sentence', () => {
  // [code, status, problem type, sentence]: the purchase order is the one that answers 404.
  const CAPTURE: [string, number, string, string][] = [
    [
      'BILL_INTAKE_PAYMENT_AMOUNT_INVALID',
      400,
      'expenditure-refused',
      'A bill paid on the spot needs a total above zero.',
    ],
    [
      'BILL_INTAKE_PAYMENT_METHOD_REQUIRED',
      400,
      'expenditure-refused',
      'Choose how this bill was paid.',
    ],
    [
      'PURCHASE_ORDER_NOT_FOUND',
      404,
      'resource-not-found',
      'That purchase order is not on this account. Choose another, or save the bill without one.',
    ],
    [
      'BILL_TAX_CATEGORY_INVALID',
      400,
      'expenditure-refused',
      'That VAT category cannot be used on a bill. Choose another.',
    ],
    [
      'BILL_TAX_CATEGORY_RATE_MISMATCH',
      400,
      'expenditure-refused',
      'That VAT rate does not match the VAT category. Choose the rate that goes with it.',
    ],
    [
      'SUPPLIER_SWITCHED_OFF',
      400,
      'expenditure-refused',
      'This supplier is switched off. Switch it back on to record a bill for it.',
    ],
    // Section 5 of the wording file.
    [
      'BILL_INTAKE_PETTY_CASH_NOT_CASH',
      400,
      'expenditure-refused',
      'Petty cash can only be recorded as cash.',
    ],
    [
      'BILL_NOTE_TOO_LONG',
      400,
      'expenditure-refused',
      'That note is too long. Shorten it to 500 characters.',
    ],
  ]
  const GENERIC = /The server refused this\. Nothing was changed/
  const refusal = (status: number, type: string, error: string) =>
    json(status, { type: `https://api.fawtir.om/problems/${type}`, error })

  async function uploadAndSave(path: string, save: string) {
    uploads.push(XML_INTAKE)
    renderAt(path)
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])
    await screen.findByDisplayValue('MR-INV-8821')
    fireEvent.click(screen.getByRole('button', { name: save }))
  }

  async function scanAndSave() {
    uploads.push({ ...intake('r-1'), source: 'SCANNED' })
    renderAt('/expenditure/bills/scan')
    await pick([new File(['a'], 'one.jpg', { type: 'image/jpeg' })])
    await screen.findByText('Receipt 1 of 1')
    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    fireEvent.change(await screen.findByPlaceholderText('Search your suppliers'), {
      target: { value: 'Al Noor Hardware' },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: /Use “Al Noor Hardware” as written/ }),
    )
    fireEvent.change(screen.getByLabelText(/Total paid/), { target: { value: '10.500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))
  }

  it.each(CAPTURE)('Upload a bill: %s', async (error, status, type, sentence) => {
    confirmAnswers.push(refusal(status, type, error))
    await uploadAndSave('/expenditure/bills/upload', 'Save the bill')
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(GENERIC)).toBeNull()
    expect(screen.queryByText('bill page')).toBeNull()
  })

  it.each(CAPTURE)('Scan receipts: %s', async (error, status, type, sentence) => {
    confirmAnswers.push(refusal(status, type, error))
    await scanAndSave()
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it('says a switched-off supplier in Arabic', async () => {
    confirmAnswers.push(refusal(400, 'expenditure-refused', 'SUPPLIER_SWITCHED_OFF'))
    await i18n.changeLanguage('ar')
    await uploadAndSave('/expenditure/bills/upload', i18n.t('uploadBill.saveBill'))
    expect(await screen.findByText('هذا المورّد موقوف. أعد تفعيله لتسجيل فاتورة له.')).toBeTruthy()
  })

  it('keeps the general refusal for a code with no sentence of its own', async () => {
    confirmAnswers.push(refusal(400, 'expenditure-refused', 'BILL_INTAKE_CODE_WITH_NO_SENTENCE'))
    await uploadAndSave('/expenditure/bills/upload', 'Save the bill')
    expect(await screen.findByText(GENERIC)).toBeTruthy()
  })

  it.each([
    ['/expenditure/bills/upload', new File(['%PDF-1.4'], 'bill.pdf', { type: 'application/pdf' })],
    ['/expenditure/bills/scan', new File(['a'], 'one.jpg', { type: 'image/jpeg' })],
  ])('says an upload with no file needs one, on %s', async (path, file) => {
    uploadRefusal = () => refusal(400, 'expenditure-refused', 'BILL_INTAKE_FILE_REQUIRED')
    renderAt(path)
    await pick([file])
    expect(await screen.findByText("Choose the bill's file first.")).toBeTruthy()
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it('says petty cash is cash in Arabic', async () => {
    confirmAnswers.push(refusal(400, 'expenditure-refused', 'BILL_INTAKE_PETTY_CASH_NOT_CASH'))
    await i18n.changeLanguage('ar')
    await uploadAndSave('/expenditure/bills/upload', i18n.t('uploadBill.saveBill'))
    expect(await screen.findByText('المصروف النثري لا يُسجَّل إلا نقدًا.')).toBeTruthy()
  })

  it('does not call a debit note a bill: its capture keeps the general refusal', async () => {
    confirmAnswers.push(refusal(400, 'expenditure-refused', 'SUPPLIER_SWITCHED_OFF'))
    await uploadAndSave('/expenditure/debit-notes/upload', 'Save the debit note')
    expect(await screen.findByText(GENERIC)).toBeTruthy()
    expect(screen.queryByText(/to record a bill for it/)).toBeNull()
  })
})

// RB2 580c732a1 / 19f93170a: the 409 lists every match in `duplicates`; the bill is recorded once
// all of them are in `notDuplicateOfIds` with an `overrideReason` (BillIntakeService:557-625).
describe('a bill that may duplicate more than one bill on file', () => {
  const onFile = (id: string) => ({
    billId: id,
    supplierBillNumber: 'MR-INV-8821',
    issueDate: '2026-08-30',
    total: 105,
    currencyCode: 'OMR',
    source: 'UPLOADED',
  })
  const X = '11111111-1111-1111-1111-111111111111'
  const Y = '22222222-2222-2222-2222-222222222222'
  /** `listed` null answers as a server before the list: `duplicateOf` alone. */
  const possible = (listed: string[] | null, oldest = listed?.[0] ?? X) =>
    json(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
      duplicateOf: onFile(oldest),
      ...(listed ? { duplicates: listed.map(onFile) } : {}),
    })
  /**
   * Round 19: the refusal as the server sends it for each kind of match. Only a same-supplier
   * Peppol copy says listing it is recorded held (`heldForReviewIfListed`).
   */
  const matchOf = (source: 'PEPPOL' | 'UPLOADED', heldForReviewIfListed: boolean) =>
    json(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
      duplicateOf: { ...onFile(X), source },
      duplicates: [{ ...onFile(X), source }],
      heldForReviewIfListed,
    })
  const sameSupplierPeppolCopy = () => matchOf('PEPPOL', true)
  /**
   * Round 21 F-2: the held-against copy and a second match on the same record. Listing both needs an
   * approver, so the server says false; `flag` lets a test check the client does not rely on that.
   */
  const heldCopyAndAnotherMatch = (flag = false) =>
    json(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
      duplicateOf: { ...onFile(X), source: 'PEPPOL' },
      duplicates: [
        { ...onFile(X), source: 'PEPPOL' },
        { ...onFile(Y), source: 'UPLOADED' },
      ],
      heldForReviewIfListed: flag,
    })
  const figuresOnlyCoincidence = () => matchOf('PEPPOL', false)
  const sameRecordUpload = () => matchOf('UPLOADED', false)
  const refusedWith = (code: string, extra: Record<string, unknown> = {}) =>
    json(400, { type: 'https://api.fawtir.om/problems/expenditure-refused', error: code, ...extra })
  const confirms = () => calls('POST', '/api/v1/bills/intake/i-xml/confirm')
  const warning = () => screen.getByRole('alert', { name: '' })
  const ALL_DIFFERENT = 'They are all different bills. Save it'
  const ONE_DIFFERENT = "It's a different bill. Save it"

  async function openAndSave() {
    who = APPROVER
    uploads.push(XML_INTAKE)
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])
    await screen.findByDisplayValue('MR-INV-8821')
    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
  }
  const sendAll = () =>
    fireEvent.click(within(warning()).getByRole('button', { name: ALL_DIFFERENT }))
  const giveReason = (reason: string) =>
    fireEvent.change(within(warning()).getByRole('textbox'), { target: { value: reason } })

  it('round 18: one name-only match asks for a reason, then sends the listed id with it, never notDuplicateOf', async () => {
    confirmAnswers.push(possible([X]))
    await openAndSave()
    expect(await screen.findByText('This may be a bill you already have')).toBeTruthy()

    fireEvent.click(within(warning()).getByRole('button', { name: ONE_DIFFERENT }))
    expect(
      await within(warning()).findByText('Enter a reason before confirming this is a different bill.'),
    ).toBeTruthy()
    expect(confirms()).toHaveLength(1)

    fireEvent.change(within(warning()).getByRole('textbox', { name: 'Why is this a different bill?' }), {
      target: { value: '  Second delivery  ' },
    })
    fireEvent.click(within(warning()).getByRole('button', { name: ONE_DIFFERENT }))
    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(bodyOf(confirms()[1])).toEqual(
      expect.objectContaining({
        notDuplicateOf: null,
        notDuplicateOfIds: [X],
        overrideReason: 'Second delivery',
      }),
    )
  })

  describe('round 18, round 19: a person without invoice.approve', () => {
    const APPROVER_ONLY =
      'Only an authorized invoice approver can confirm that this is a different bill. You can submit it for review.'
    const APPROVER_MUST_RECORD =
      'Only an authorized invoice approver can confirm that this is a different bill. Ask an invoice approver to record it.'

    // MANAGER holds invoice.payment.manage and not invoice.approve: a payer. Signed in through the
    // entitlements read, as AppShell takes it; a wrapped provider would be shadowed by AppShell's.
    const PAYER: Entitlements = { ...MANAGER, username: 'payer' }

    async function openAndSaveAs(session: Entitlements) {
      who = session
      uploads.push(XML_INTAKE)
      render(
        <MemoryRouter initialEntries={['/expenditure/bills/upload']}>
          <Routes>
            <Route path="/expenditure/bills/upload" element={<UploadBillPage />} />
            <Route path="/expenditure/bills/upload/:intakeId" element={<UploadBillPage />} />
            <Route path="/expenditure/bills/:id" element={<p>bill page</p>} />
          </Routes>
        </MemoryRouter>,
      )
      await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])
      await screen.findByDisplayValue('MR-INV-8821')
      fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    }

    it('round 20 L-4: is not drawn the decision at all, only why, for one match and for many', async () => {
      confirmAnswers.push(possible([X, Y]))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be one of 2 bills you already have')
      expect(within(warning()).queryByRole('button', { name: ALL_DIFFERENT })).toBeNull()
      // Round 19: a refusal that does not say held-for-review offers no submission.
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(confirms()).toHaveLength(1)
    })


    it('round 19, same-supplier Peppol copy: submits the bill for review with the listed id and reason; the server holds it', async () => {
      confirmAnswers.push(sameSupplierPeppolCopy())
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      expect(within(warning()).queryByRole('button', { name: ONE_DIFFERENT })).toBeNull()
      expect(within(warning()).getByText(APPROVER_ONLY)).toBeTruthy()
      giveReason('Copy of the Peppol bill for the approver')
      fireEvent.click(within(warning()).getByRole('button', { name: 'Submit it for review' }))
      expect(await screen.findByText('bill page')).toBeTruthy()
      expect(confirms()).toHaveLength(2)
      expect(bodyOf(confirms()[1])).toMatchObject({
        notDuplicateOf: null,
        notDuplicateOfIds: [X],
        overrideReason: 'Copy of the Peppol bill for the approver',
      })
    })

    it('round 19, figures-only coincidence: no submission is offered; an approver must record it', async () => {
      confirmAnswers.push(figuresOnlyCoincidence())
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      expect(within(warning()).queryByRole('button', { name: ONE_DIFFERENT })).toBeNull()
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).queryByRole('textbox')).toBeNull()
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(within(warning()).queryByText(/submit it for review/i)).toBeNull()
      expect(confirms()).toHaveLength(1)
    })

    it('round 19, same-record upload: no submission is offered; an approver must record it', async () => {
      confirmAnswers.push(sameRecordUpload())
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      expect(within(warning()).queryByRole('button', { name: ONE_DIFFERENT })).toBeNull()
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).queryByRole('textbox')).toBeNull()
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(within(warning()).queryByText(/submit it for review/i)).toBeNull()
      expect(confirms()).toHaveLength(1)
    })

    it('round 20 L-5: a submission refused BILL_PAYMENT_ON_HOLD says the payment waits for the approver; no success', async () => {
      confirmAnswers.push(sameSupplierPeppolCopy(), refusedWith('BILL_PAYMENT_ON_HOLD'))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      giveReason('Copy of the Peppol bill for the approver')
      fireEvent.click(within(warning()).getByRole('button', { name: 'Submit it for review' }))
      expect(
        await screen.findByText(
          "This bill will be held as a possible duplicate, so its payment can't be recorded now. Save it without the payment, and record the payment once an authorized invoice approver has resolved the hold.",
        ),
      ).toBeTruthy()
      expect(screen.queryByText('bill page')).toBeNull()
      expect(screen.queryByText(/BILL_PAYMENT_ON_HOLD/)).toBeNull()
    })

    it('round 19: when the server refuses a submission it is worded as a refusal and not offered again', async () => {
      confirmAnswers.push(sameSupplierPeppolCopy(), refusedWith('BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED'))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      giveReason('Different delivery')
      fireEvent.click(within(warning()).getByRole('button', { name: 'Submit it for review' }))
      expect(
        await within(warning()).findByText(
          'This action requires an authorized human invoice approver. Ask an invoice approver to record this bill.',
        ),
      ).toBeTruthy()
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).queryByText(/submit (it|the bill) for review/i)).toBeNull()
      // Round 20 L-1: one sentence, the server's, not the standing explanation beside it.
      expect(within(warning()).queryByText(APPROVER_MUST_RECORD)).toBeNull()
      expect(screen.queryByText('bill page')).toBeNull()
      expect(screen.queryByText(/BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED/)).toBeNull()
    })

    it('round 21 F-2: the held copy plus another match offers no submission; an approver must record it, nothing is saved', async () => {
      confirmAnswers.push(heldCopyAndAnotherMatch())
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be one of 2 bills you already have')
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).queryByRole('button', { name: ALL_DIFFERENT })).toBeNull()
      expect(within(warning()).queryByRole('textbox')).toBeNull()
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(within(warning()).queryByText(APPROVER_ONLY)).toBeNull()
      expect(confirms()).toHaveLength(1)
      expect(screen.queryByText('bill page')).toBeNull()
    })

    it('round 21 F-2: even a server flag cannot make two listed bills a submission', async () => {
      confirmAnswers.push(heldCopyAndAnotherMatch(true))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be one of 2 bills you already have')
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(confirms()).toHaveLength(1)
    })

    it('round 21 F-2: a held-for-review answer does not survive a second refusal that names one more bill', async () => {
      confirmAnswers.push(sameSupplierPeppolCopy(), heldCopyAndAnotherMatch(true))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      giveReason('Copy of the Peppol bill for the approver')
      fireEvent.click(within(warning()).getByRole('button', { name: 'Submit it for review' }))
      expect(await screen.findByText('This may be one of 2 bills you already have')).toBeTruthy()
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(confirms()).toHaveLength(2)
      expect(screen.queryByText('bill page')).toBeNull()
    })

    it('round 21 F-2: an approver lists the held copy and the other match together and saves', async () => {
      confirmAnswers.push(heldCopyAndAnotherMatch())
      await openAndSaveAs({ ...PAYER, permissions: [...PAYER.permissions, 'invoice.approve'] })
      await screen.findByText('This may be one of 2 bills you already have')
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      giveReason('Two deliveries')
      fireEvent.click(within(warning()).getByRole('button', { name: ALL_DIFFERENT }))
      expect(await screen.findByText('bill page')).toBeTruthy()
      expect(bodyOf(confirms()[1])).toMatchObject({
        notDuplicateOf: null,
        notDuplicateOfIds: [X, Y],
        overrideReason: 'Two deliveries',
      })
    })

    it('an approver is offered the decision and no review button', async () => {
      confirmAnswers.push(possible([X]))
      await openAndSaveAs({ ...PAYER, permissions: [...PAYER.permissions, 'invoice.approve'] })
      await screen.findByText('This may be a bill you already have')
      expect(
        (within(warning()).getByRole('button', { name: ONE_DIFFERENT }) as HTMLButtonElement).disabled,
      ).toBe(false)
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
    })

    it('round 19: an approver is offered the decision, not a submission, even on a same-supplier Peppol copy', async () => {
      confirmAnswers.push(sameSupplierPeppolCopy())
      await openAndSaveAs({ ...PAYER, permissions: [...PAYER.permissions, 'invoice.approve'] })
      await screen.findByText('This may be a bill you already have')
      expect(
        (within(warning()).getByRole('button', { name: ONE_DIFFERENT }) as HTMLButtonElement).disabled,
      ).toBe(false)
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
    })

    // Round 25, residual (1): a match that shares only figures with the bill is a potential
    // coincidence, worded as one; the decision rules are the ones above, unchanged.
    const COINCIDENCE =
      /A bill MR-INV-8821 with the same details is already recorded, but nothing shows it is from this supplier: .* It may be a coincidence\./
    const flaggedCoincidence = (figuresOnly?: unknown) =>
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
        duplicateOf: { ...onFile(X), source: 'PEPPOL' },
        duplicates: [{ ...onFile(X), source: 'PEPPOL' }],
        heldForReviewIfListed: false,
        ...(figuresOnly === undefined ? {} : { figuresOnly }),
      })

    it('round 25 residual (1): a figures-only refusal names the match as a possible coincidence; a payer still cannot pass it', async () => {
      confirmAnswers.push(flaggedCoincidence(true))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      // textContent, not getByText: the total is set apart in its own element (withRial).
      expect(warning().textContent).toMatch(COINCIDENCE)
      expect(warning().textContent).not.toMatch(/from this supplier is already recorded/)
      expect(within(warning()).queryByRole('button', { name: ONE_DIFFERENT })).toBeNull()
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
      expect(within(warning()).getByText(APPROVER_MUST_RECORD)).toBeTruthy()
      expect(confirms()).toHaveLength(1)
    })

    it('round 25 residual (1): an approver sees the coincidence wording and the decision', async () => {
      confirmAnswers.push(flaggedCoincidence(true))
      await openAndSaveAs({ ...PAYER, permissions: [...PAYER.permissions, 'invoice.approve'] })
      await screen.findByText('This may be a bill you already have')
      // textContent, not getByText: the total is set apart in its own element (withRial).
      expect(warning().textContent).toMatch(COINCIDENCE)
      expect(
        (within(warning()).getByRole('button', { name: ONE_DIFFERENT }) as HTMLButtonElement).disabled,
      ).toBe(false)
      expect(within(warning()).queryByRole('button', { name: 'Submit it for review' })).toBeNull()
    })

    it.each([
      ['false', false],
      ['absent, as from an older server', undefined],
      ['not a boolean', 'true'],
    ])('round 25 residual (1): figures-only %s keeps the existing sentence', async (_label, figuresOnly) => {
      confirmAnswers.push(flaggedCoincidence(figuresOnly))
      await openAndSaveAs(PAYER)
      await screen.findByText('This may be a bill you already have')
      expect(
        within(warning()).getByText(/A bill MR-INV-8821 from this supplier is already recorded/),
      ).toBeTruthy()
      expect(warning().textContent).not.toMatch(/It may be a coincidence/)
    })
  })

  it('lists both bills, asks why, and saves over both with the reason trimmed', async () => {
    confirmAnswers.push(possible([X, Y]))
    await openAndSave()

    expect(await screen.findByText('This may be one of 2 bills you already have')).toBeTruthy()
    expect(
      within(warning())
        .getAllByRole('link', { name: 'Open that bill' })
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/expenditure/bills/${X}`, `/expenditure/bills/${Y}`])
    expect(within(warning()).getAllByText(/A bill MR-INV-8821 from this supplier/)).toHaveLength(2)

    sendAll()
    expect(
      await within(warning()).findByText('Say why this bill is different from the ones listed.'),
    ).toBeTruthy()
    expect(confirms()).toHaveLength(1)

    giveReason('  The supplier reissues its numbers every year  ')
    sendAll()
    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(confirms()).toHaveLength(2)
    expect(bodyOf(confirms()[1])).toMatchObject({
      notDuplicateOf: null,
      notDuplicateOfIds: [X, Y],
      overrideReason: 'The supplier reissues its numbers every year',
    })
  })

  it('ends the X/Y swap: the second bill named is added to the first, not put in its place', async () => {
    confirmAnswers.push(possible([X]), possible([Y]))
    await openAndSave()
    await screen.findByRole('alert', { name: '' })
    giveReason('Two deliveries billed under one number')
    fireEvent.click(within(warning()).getByRole('button', { name: ONE_DIFFERENT }))
    expect(await screen.findByText('This may be one of 2 bills you already have')).toBeTruthy()
    expect(bodyOf(confirms()[1])).toMatchObject({
      notDuplicateOf: null,
      notDuplicateOfIds: [X],
      overrideReason: 'Two deliveries billed under one number',
    })

    sendAll()
    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(bodyOf(confirms()[2])).toMatchObject({
      notDuplicateOf: null,
      notDuplicateOfIds: [X, Y],
      overrideReason: 'Two deliveries billed under one number',
    })
  })

  // PRV43-EXP5 M-1: each refusal's figuresOnly belongs to the bills it named, not to the review.
  const namedAs = (id: string, figuresOnly: boolean) =>
    json(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
      duplicateOf: onFile(id),
      duplicates: [onFile(id)],
      heldForReviewIfListed: false,
      figuresOnly,
    })
  const rowOf = (id: string) =>
    within(warning())
      .getAllByRole('link', { name: 'Open that bill' })
      .find((link) => link.getAttribute('href') === `/expenditure/bills/${id}`)!
      .closest('li')!.textContent

  it.each([
    ['the same-record copy first, then the coincidence', [X, false], [Y, true]],
    ['the coincidence first, then the same-record copy', [Y, true], [X, false]],
  ] as const)('PRV43-EXP5 M-1: %s; each bill keeps its own sentence', async (_label, first, second) => {
    confirmAnswers.push(namedAs(first[0], first[1]), namedAs(second[0], second[1]))
    await openAndSave()
    await screen.findByRole('alert', { name: '' })
    giveReason('Two deliveries billed under one number')
    fireEvent.click(within(warning()).getByRole('button', { name: ONE_DIFFERENT }))
    expect(await screen.findByText('This may be one of 2 bills you already have')).toBeTruthy()

    expect(rowOf(X)).toMatch(/A bill MR-INV-8821 from this supplier is already recorded/)
    expect(rowOf(X)).not.toMatch(/It may be a coincidence/)
    expect(rowOf(Y)).toMatch(/nothing shows it is from this supplier: .* It may be a coincidence\./)
    expect(rowOf(Y)).not.toMatch(/from this supplier is already recorded/)
  })

  it('round 18: offers nothing to a server that did not list the matches, since the reasonless field is gone', async () => {
    confirmAnswers.push(possible(null, X))
    await openAndSave()
    expect(await screen.findByText(/they cannot be set aside here yet/)).toBeTruthy()
    expect(within(warning()).queryByRole('button')).toBeNull()
    expect(within(warning()).queryByRole('textbox')).toBeNull()
    expect(confirms()).toHaveLength(1)
    expect(bodyOf(confirms()[0]).notDuplicateOf).toBeNull()
  })

  it('gathers the ids across refusals and stops past 20 without asking', async () => {
    const ids = Array.from(
      { length: 25 },
      (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    )
    confirmAnswers.push(
      possible(ids.slice(0, 5)),
      possible(ids.slice(5, 10)),
      possible(ids.slice(10, 15)),
      possible(ids.slice(15, 20)),
      possible(ids.slice(20, 25)),
    )
    await openAndSave()
    expect(await screen.findByText('This may be one of 5 bills you already have')).toBeTruthy()
    giveReason('Reissued numbers')
    for (const seen of [10, 15, 20]) {
      sendAll()
      expect(
        await screen.findByText(`This may be one of ${seen} bills you already have`),
      ).toBeTruthy()
    }
    expect(bodyOf(confirms()[3]).notDuplicateOfIds).toEqual(ids.slice(0, 15))

    sendAll()
    expect(await screen.findByText(/matches too many bills on file to save in one go/)).toBeTruthy()
    expect(bodyOf(confirms()[4]).notDuplicateOfIds).toEqual(ids.slice(0, 20))
    expect(within(warning()).queryByRole('button', { name: ALL_DIFFERENT })).toBeNull()
    expect(confirms()).toHaveLength(5)
  })

  it.each([
    ['BILL_INTAKE_OVERRIDE_REASON_REQUIRED', 'Say why this bill is different from the ones listed.'],
    ['BILL_INTAKE_OVERRIDE_REASON_TOO_LONG', 'Keep the reason to 280 characters.'],
    [
      'BILL_INTAKE_NOT_DUPLICATE_OF_TOO_MANY',
      'This bill matches too many bills on file to save in one go. Open them and check the supplier and number.',
    ],
  ])('words %s in the warning, keeping the list and the reason', async (code, sentence) => {
    confirmAnswers.push(possible([X, Y]), refusedWith(code))
    await openAndSave()
    await screen.findByText('This may be one of 2 bills you already have')
    giveReason('Reissued numbers')
    sendAll()
    expect(await within(warning()).findByText(sentence)).toBeTruthy()
    expect((within(warning()).getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Reissued numbers',
    )
    expect(screen.queryByText(new RegExp(code))).toBeNull()
  })

  it('words an unknown bill and asks afresh on the next save', async () => {
    confirmAnswers.push(
      possible([X, Y]),
      refusedWith('BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN'),
      possible([Y]),
    )
    await openAndSave()
    await screen.findByText('This may be one of 2 bills you already have')
    giveReason('Reissued numbers')
    sendAll()
    expect(
      await screen.findByText(
        'One of the bills it was compared with is no longer on file, or no longer matches this bill. Save again to check it afresh.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Why is this a different bill?' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open that bill' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    // Only Y is on file now: the older single warning, with no stale X carried over.
    expect(await screen.findByText('This may be a bill you already have')).toBeTruthy()
  })

  it.each([
    [
      'REFERENCE_NOT_FOUND',
      'One of the bills it was compared with is no longer on file. Save again to check it afresh.',
    ],
    [
      'REFERENCE_NO_LONGER_MATCHES',
      'One of the bills it was compared with is still on file but no longer matches this bill. Save again to check it afresh.',
    ],
  ])('round 23 L-3: words an unknown bill with reason %s, and asks afresh on the next save', async (reason, sentence) => {
    confirmAnswers.push(
      possible([X, Y]),
      refusedWith('BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN', { reason }),
      possible([Y]),
    )
    await openAndSave()
    await screen.findByText('This may be one of 2 bills you already have')
    giveReason('Reissued numbers')
    sendAll()
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(
      screen.queryByText(
        'One of the bills it was compared with is no longer on file, or no longer matches this bill. Save again to check it afresh.',
      ),
    ).toBeNull()
    expect(screen.queryByText(new RegExp(reason))).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Why is this a different bill?' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save the bill' }))
    expect(await screen.findByText('This may be a bill you already have')).toBeTruthy()
  })

  it('round 23 L-3: a reason this screen does not know keeps the combined sentence', async () => {
    confirmAnswers.push(
      possible([X, Y]),
      refusedWith('BILL_INTAKE_NOT_DUPLICATE_OF_UNKNOWN', { reason: 'REFERENCE_SOMETHING_ELSE' }),
    )
    await openAndSave()
    await screen.findByText('This may be one of 2 bills you already have')
    giveReason('Reissued numbers')
    sendAll()
    expect(
      await screen.findByText(
        'One of the bills it was compared with is no longer on file, or no longer matches this bill. Save again to check it afresh.',
      ),
    ).toBeTruthy()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    confirmAnswers.push(possible([X, Y]))
    uploads.push(XML_INTAKE)
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])
    await screen.findByDisplayValue('MR-INV-8821')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('قد تكون هذه إحدى 2 فواتير مسجّلة لديك')).toBeTruthy()
    fireEvent.click(within(warning()).getByRole('button', { name: 'كلها فواتير مختلفة: احفظها' }))
    expect(
      await screen.findByText('اذكر سبب اختلاف هذه الفاتورة عن الفواتير المذكورة.'),
    ).toBeTruthy()
  })

  it('sends one request for a double click', async () => {
    confirmAnswers.push(possible([X, Y]))
    await openAndSave()
    await screen.findByText('This may be one of 2 bills you already have')
    giveReason('Reissued numbers')
    sendAll()
    sendAll()
    expect(await screen.findByText('bill page')).toBeTruthy()
    expect(confirms()).toHaveLength(2)
  })
})

describe('a supplier note that may duplicate more than one on file', () => {
  it('sends the list from the note upload too', async () => {
    const X = '11111111-1111-1111-1111-111111111111'
    const Y = '22222222-2222-2222-2222-222222222222'
    const onFile = (id: string) => ({
      billId: id,
      supplierBillNumber: 'MR-INV-8821',
      issueDate: null,
      total: null,
      currencyCode: null,
      source: 'PEPPOL',
    })
    confirmAnswers.push(
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
        duplicateOf: onFile(X),
        duplicates: [onFile(X), onFile(Y)],
      }),
    )
    who = APPROVER
    uploads.push(XML_INTAKE)
    renderAt('/expenditure/debit-notes/upload')
    await pick([new File(['<DebitNote/>'], 'note.xml', { type: 'application/xml' })])
    await screen.findByDisplayValue('MR-INV-8821')
    fireEvent.click(screen.getByRole('button', { name: 'Save the debit note' }))

    const panel = await screen.findByRole('alert', { name: '' })
    expect(within(panel).getByText('This may be one of 2 bills you already have')).toBeTruthy()
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'Two charges' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'They are all different bills. Save it' }))
    expect(await screen.findByText('debit note page')).toBeTruthy()
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/i-xml/confirm')[1])).toMatchObject({
      documentTypeCode: '383',
      notDuplicateOf: null,
      notDuplicateOfIds: [X, Y],
      overrideReason: 'Two charges',
    })
  })
})
