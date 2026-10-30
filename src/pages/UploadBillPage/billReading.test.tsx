import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillReadingDto, IntakeDto } from '../../api/expenditure/billIntake'
import {
  confidentCount,
  guessedCategory,
  notReadReason,
  unsureFields,
  uploadMayHaveArrived,
  vatWorkedOut,
} from '../../lib/billIntake'
import { uploadIntake } from '../../api/expenditure/billIntake'
import { ApiError, NetworkError } from '../../api/errors'
import { readingPercent } from '../../components/bills'
import { UploadBillPage } from './UploadBillPage'
import { ScanReceiptsPage } from '../ScanReceiptsPage'

/**
 * Reading a PDF or photo (EXPENDITURE.md 1.6, 1.10, 1.28; backend PR #803): the upload waits for
 * the reader, unsure fields are amber until typed over, a receipt's category is prefilled from
 * the guess, a worked-out VAT stays amber, and a file that was not read says so, with the reason
 * when the person can act on it.
 */

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'supplier.read', 'purchase-order.read'],
  scopes: [],
  featureFlags: {},
}

const AMBER = 'bg-[#faf5ea]'

const scores = (overrides: Record<string, number>): Record<string, number> => ({
  supplierName: 0,
  supplierVatNumber: 0,
  billNumber: 0,
  issueDate: 0,
  dueDate: 0,
  currency: 0,
  net: 0,
  vat: 0,
  total: 0,
  lines: 0,
  ...overrides,
})

function reading(overrides: Partial<BillReadingDto> = {}): BillReadingDto {
  return {
    outcome: 'READ',
    pageCount: 1,
    scores: {},
    category: null,
    categoryConfidence: 0,
    vatRate: null,
    workedOut: [],
    ...overrides,
  }
}

function intake(id: string, overrides: Partial<IntakeDto> = {}): IntakeDto {
  return {
    id,
    source: 'UPLOADED',
    filename: 'bill.pdf',
    contentType: 'application/pdf',
    byteSize: 253_952,
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
    uploadedAt: '2026-10-28T08:00:00Z',
    ...overrides,
  }
}

/** A two-page PDF read with its due date and one line unsure. */
const BILL_SCORES = scores({
  supplierName: 0.98,
  supplierVatNumber: 0.97,
  billNumber: 0.99,
  issueDate: 0.96,
  dueDate: 0.62,
  currency: 0.99,
  net: 0.95,
  vat: 0.93,
  total: 0.98,
  lines: 0.41,
})
const READ_BILL = intake('i-read', {
  extractionStatus: 'EXTRACTED',
  extracted: {
    supplierName: 'Sohar Packaging LLC',
    supplierVatNumber: 'OM1100628391',
    billNumber: 'SP-INV-1152',
    issueDate: '2026-09-22',
    dueDate: '2026-10-02',
    currency: 'OMR',
    net: 612,
    vat: 30.6,
    total: 642.6,
    lines: [
      {
        description: 'Kraft bags 1kg',
        quantity: 2000,
        unitPrice: 0.24,
        vatRate: 5,
        amount: 480,
        confident: true,
      },
      {
        description: 'Pallet handling',
        quantity: 1,
        unitPrice: null,
        vatRate: null,
        amount: null,
        confident: false,
      },
    ],
    confidence: Object.fromEntries(Object.entries(BILL_SCORES).map(([k, v]) => [k, v >= 0.9])),
    reading: reading({ pageCount: 2, scores: BILL_SCORES, vatRate: 5 }),
  },
})

/** A receipt whose VAT was not legible: worked out from the total, with a guessed category. */
const RECEIPT_SCORES = scores({
  supplierName: 0.95,
  billNumber: 0.71,
  issueDate: 0.97,
  currency: 0.99,
  total: 0.98,
})
const WORKED_OUT = intake('r-read', {
  source: 'SCANNED',
  filename: 'IMG_4473.jpg',
  contentType: 'image/jpeg',
  extractionStatus: 'EXTRACTED',
  extracted: {
    ...intake('r').extracted,
    supplierName: 'Nizwa Hardware Store',
    billNumber: '4473',
    issueDate: '2026-09-24',
    currency: 'OMR',
    total: 28.4,
    vat: 1.352,
    confidence: { supplierName: true, issueDate: true, currency: true, total: true },
    reading: reading({
      scores: RECEIPT_SCORES,
      category: 'Repairs & maintenance',
      categoryConfidence: 0.86,
      workedOut: ['vat'],
    }),
  },
})

const notRead = (id: string, outcome: BillReadingDto['outcome'], source: IntakeDto['source']) =>
  intake(id, {
    source,
    extracted: { ...intake(id).extracted, reading: reading({ outcome, pageCount: 1 }) },
  })

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let uploads: IntakeDto[]
let stored: Record<string, IntakeDto>
/** Holds the next upload open until released, as the server does while it reads. */
let release: (() => void) | null

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
  uploads = []
  stored = {}
  release = null
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
    if (url.startsWith('/api/v1/bills/intake?source=') && method === 'POST') {
      const next = uploads.shift()
      if (release === null) return json(201, next)
      await new Promise<void>((done) => (release = done))
      return json(201, next)
    }
    if (/\/api\/v1\/bills\/intake\/[^/]+\/confirm$/.test(url))
      return json(201, { id: 'b-new', supplierBillNumber: 'X', totalIncludingVat: 1 })
    if (/\/api\/v1\/bills\/intake\/[^/]+\/file$/.test(url))
      return new Response('jpeg', { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    const one = /\/api\/v1\/bills\/intake\/([^/]+)$/.exec(url)
    if (one && method === 'GET')
      return stored[one[1]]
        ? json(200, stored[one[1]])
        : json(404, { error: 'BILL_INTAKE_NOT_FOUND' })
    if (one && method === 'DELETE') return new Response(null, { status: 204 })
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, { items: [], page: 0, pageSize: 20, total: 0 })
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
  vi.useRealTimers()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/bills/upload" element={<UploadBillPage />} />
        <Route path="/expenditure/bills/upload/:intakeId" element={<UploadBillPage />} />
        <Route path="/expenditure/bills/scan" element={<ScanReceiptsPage />} />
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

const pdf = () => new File(['%PDF-1.4'], 'bill.pdf', { type: 'application/pdf' })
const photo = (name = 'IMG_4473.jpg') => new File(['jpeg'], name, { type: 'image/jpeg' })
const isAmber = (element: Element | null) => (element?.className ?? '').includes(AMBER)

describe('what the reader said, as the screens read it', () => {
  it('marks amber what scored under 0.9, what is missing and what was worked out', () => {
    expect([...unsureFields(READ_BILL)].sort()).toEqual(['dueDate', 'lines'])
    expect([...unsureFields(WORKED_OUT)].sort()).toEqual([
      'billNumber',
      'dueDate',
      'lines',
      'net',
      'supplierVatNumber',
      'vat',
    ])
    expect(confidentCount(READ_BILL)).toEqual({ read: 8, fields: 10 })
    expect(vatWorkedOut(WORKED_OUT)).toBe(true)
    expect(vatWorkedOut(READ_BILL)).toBe(false)
  })

  it('does not mark again what a person corrected and saved', () => {
    const corrected = intake('i-kept', {
      ...READ_BILL,
      extracted: {
        ...READ_BILL.extracted,
        confidence: { ...READ_BILL.extracted.confidence, dueDate: true, lines: true },
        reading: { ...READ_BILL.extracted.reading!, workedOut: [] },
      },
    })
    expect(unsureFields(corrected).size).toBe(0)
  })

  it('prefills only a category the screen offers', () => {
    expect(guessedCategory(WORKED_OUT)).toBe('Repairs & maintenance')
    const odd = {
      ...WORKED_OUT,
      extracted: {
        ...WORKED_OUT.extracted,
        reading: { ...WORKED_OUT.extracted.reading!, category: 'Groceries' },
      },
    }
    expect(guessedCategory(odd)).toBeNull()
  })

  it('marks nothing on XML, a file read while reading was off, or one that was not read', () => {
    expect(unsureFields(intake('i-off')).size).toBe(0)
    expect(confidentCount(notRead('i-f', 'READ_FAILED', 'UPLOADED'))).toBeNull()
    expect(notReadReason(notRead('i-l', 'DAILY_LIMIT_REACHED', 'UPLOADED'))).toBe('dailyLimit')
    expect(notReadReason(notRead('i-p', 'PLAN_FEATURE_NOT_INCLUDED', 'UPLOADED'))).toBe('plan')
    expect(notReadReason(notRead('i-f', 'READ_FAILED', 'UPLOADED'))).toBeNull()
    expect(notReadReason(intake('i-off'))).toBeNull()
  })

  it('fills the progress bar towards the reading time, never to the end', () => {
    expect(readingPercent(0)).toBe(0)
    expect(readingPercent(60)).toBe(50)
    expect(readingPercent(120)).toBe(95)
  })
})

describe('an upload that outlasts the wait', () => {
  const noAnswer = () => new Response('', { status: 504, headers: { 'Content-Type': 'text/html' } })
  const MAY_HAVE_ARRIVED = /may still have been received/

  it("waits past the gateway's 120 seconds, and stops before nginx's 130", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
    )
    const settled = vi.fn()
    const upload = uploadIntake(pdf(), 'UPLOADED').catch((error: unknown) => {
      settled()
      return error
    })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await upload).toMatchObject({ name: 'NetworkError', reason: 'timeout' })
  })

  it('treats only a timeout and a 504 as an upload that may have arrived', () => {
    expect(uploadMayHaveArrived(new NetworkError('timeout'))).toBe(true)
    expect(uploadMayHaveArrived(new NetworkError('offline'))).toBe(false)
    const answered = (status: number) => new ApiError({ status, problemType: null })
    expect(uploadMayHaveArrived(answered(504))).toBe(true)
    expect(uploadMayHaveArrived(answered(500))).toBe(false)
    expect(uploadMayHaveArrived(answered(400))).toBe(false)
  })

  it('says a 504 on Upload a bill may have been received, not that it failed', async () => {
    const before = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.startsWith('/api/v1/bills/intake?source=') ? noAnswer() : before(url, init),
    )
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])
    expect((await screen.findByRole('alert')).textContent).toMatch(MAY_HAVE_ARRIVED)
  })

  it('says the same on Scan receipts', async () => {
    const before = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.startsWith('/api/v1/bills/intake?source=') ? noAnswer() : before(url, init),
    )
    renderAt('/expenditure/bills/scan')
    await pick([photo()])
    expect((await screen.findByRole('alert')).textContent).toMatch(MAY_HAVE_ARRIVED)
  })

  it('keeps the plain failure for a server fault', async () => {
    const before = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.startsWith('/api/v1/bills/intake?source=') ? json(500, {}) : before(url, init),
    )
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])
    expect((await screen.findByRole('alert')).textContent).not.toMatch(MAY_HAVE_ARRIVED)
  })
})

describe('upload a bill, read', () => {
  it('shows reading progress while the upload waits, then what was read with the unsure amber', async () => {
    uploads.push(READ_BILL)
    release = () => undefined
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])

    expect(await screen.findByText(/Reading the file/)).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    await act(async () => release?.())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check what we read' }),
    ).toBeTruthy()
    expect(screen.getByText(/Anything it wasn't sure of is marked amber/)).toBeTruthy()
    expect(
      screen.getByText(/^2 pages · 248 KB · read in \d+ seconds · 8 of 10 fields confident$/),
    ).toBeTruthy()

    // Read and sure: plain. Unsure (the due date, the half-read line): amber.
    expect((document.getElementById('bill-number') as HTMLInputElement).value).toBe('SP-INV-1152')
    expect(isAmber(document.getElementById('bill-number'))).toBe(false)
    expect(isAmber(document.getElementById('bill-total'))).toBe(false)
    expect(isAmber(screen.getByRole('button', { name: 'Payment due' }))).toBe(true)
    const lines = screen.getAllByLabelText('Description') as HTMLInputElement[]
    expect(lines.map((line) => isAmber(line))).toEqual([false, true])

    // Typing over a line settles it.
    fireEvent.change(lines[1], { target: { value: 'Pallet handling, 1 pallet' } })
    expect(isAmber(screen.getAllByLabelText('Description')[1])).toBe(false)
  })

  it('keeps an XML bill exactly as before: no amber, the e-invoice wording', async () => {
    uploads.push(
      intake('i-xml', {
        filename: 'bill.xml',
        contentType: 'application/xml',
        extractionStatus: 'EXTRACTED',
        extracted: {
          ...intake('i-xml').extracted,
          supplierName: 'Muscat Roastery Co',
          billNumber: 'MR-1',
          confidence: { supplierName: true, billNumber: true },
          reading: null,
        },
      }),
    )
    renderAt('/expenditure/bills/upload')
    await pick([new File(['<Invoice/>'], 'bill.xml', { type: 'application/xml' })])

    expect(await screen.findByText(/read the e-invoice file for you/)).toBeTruthy()
    expect(screen.getByText(/2 fields filled from the e-invoice/)).toBeTruthy()
    expect(screen.queryByText(/Reading the file/)).toBeNull()
    expect(isAmber(document.getElementById('bill-number'))).toBe(false)
  })

  it.each([
    ['DAILY_LIMIT_REACHED', "You've reached today's limit for reading bills. Try again tomorrow."],
    ['PLAN_FEATURE_NOT_INCLUDED', /Your plan does not include scanning bills and receipts/],
  ] as const)(
    'says why a %s file was not read, and still lets it be typed in',
    async (outcome, why) => {
      uploads.push(notRead('i-no', outcome, 'UPLOADED'))
      renderAt('/expenditure/bills/upload')
      await pick([pdf()])

      expect(await screen.findByText(/PDF or photo, not read/)).toBeTruthy()
      expect(screen.getByText(why)).toBeTruthy()
      expect(screen.getByRole('heading', { level: 1, name: 'Type in the bill' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Save the bill' })).toBeTruthy()
    },
  )

  it('says only "not read" when the read failed', async () => {
    uploads.push(notRead('i-failed', 'READ_FAILED', 'UPLOADED'))
    renderAt('/expenditure/bills/upload')
    await pick([pdf()])

    expect(await screen.findByText(/PDF or photo, not read/)).toBeTruthy()
    expect(screen.queryByText(/today's limit/)).toBeNull()
    expect(screen.queryByText(/Your plan does not include/)).toBeNull()
  })
})

describe('scan receipts, read', () => {
  it('prefills the guessed category, keeps a worked-out VAT amber until typed, and sends both', async () => {
    uploads.push(WORKED_OUT)
    renderAt('/expenditure/bills/scan')
    await pick([photo()])

    expect(await screen.findByText('Receipt 1 of 1')).toBeTruthy()
    expect(
      screen.getByText(/Fawtir read it. Anything it wasn't sure of is marked amber/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Category' }).textContent).toContain(
      'Repairs & maintenance',
    )
    expect(isAmber(screen.getByRole('button', { name: 'Category' }))).toBe(true) // 0.86
    expect(screen.getByText("Guessed from the receipt. Change it if that's wrong.")).toBeTruthy()

    const vat = screen.getByLabelText('VAT on it') as HTMLInputElement
    expect(vat.value).toBe('1.352')
    expect(isAmber(vat)).toBe(true)
    expect(screen.getByText(/Worked out from the total and the rate/)).toBeTruthy()
    // The unsure receipt number is amber, the sure total is not.
    expect(isAmber(screen.getByLabelText(/Receipt number/))).toBe(true)
    expect(isAmber(screen.getByLabelText(/Total paid/))).toBe(false)

    fireEvent.change(vat, { target: { value: '1.350' } })
    expect(isAmber(screen.getByLabelText('VAT on it'))).toBe(false)
    expect(screen.queryByText(/Worked out from the total and the rate/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))
    await waitFor(() =>
      expect(calls('POST', '/api/v1/bills/intake/r-read/confirm')).toHaveLength(1),
    )
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-read/confirm')[0])).toMatchObject({
      supplierName: 'Nizwa Hardware Store',
      billNumber: '4473',
      category: 'Repairs & maintenance',
      vat: 1.35,
      total: 28.4,
    })
  })

  it('leaves a guess the screen does not offer unset, and a read VAT plain', async () => {
    uploads.push({
      ...WORKED_OUT,
      extracted: {
        ...WORKED_OUT.extracted,
        vat: 1.35,
        confidence: { ...WORKED_OUT.extracted.confidence, vat: true },
        reading: {
          ...WORKED_OUT.extracted.reading!,
          scores: { ...RECEIPT_SCORES, vat: 0.95 },
          category: 'Groceries',
          workedOut: [],
        },
      },
    })
    renderAt('/expenditure/bills/scan')
    await pick([photo()])

    expect(await screen.findByText('Receipt 1 of 1')).toBeTruthy()
    expect(screen.getByText('Pick what it was for.')).toBeTruthy()
    const vat = screen.getByLabelText('VAT on it') as HTMLInputElement
    expect(vat.value).toBe('1.350')
    expect(isAmber(vat)).toBe(false)
  })

  it('says why a receipt was not read over the daily limit, and leaves it to be typed', async () => {
    uploads.push(notRead('r-limit', 'DAILY_LIMIT_REACHED', 'SCANNED'))
    renderAt('/expenditure/bills/scan')
    await pick([photo('IMG_4475.jpg')])

    expect(
      await screen.findByText(
        "You've reached today's limit for reading bills. Try again tomorrow.",
      ),
    ).toBeTruthy()
    expect((screen.getByLabelText(/Total paid/) as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Pick what it was for.')).toBeTruthy()
  })

  it('brings a read receipt back from a draft row with its amber', async () => {
    stored = { 'r-read': WORKED_OUT }
    renderAt('/expenditure/bills/scan?intake=r-read')

    expect(await screen.findByText('Receipt 1 of 1')).toBeTruthy()
    expect(isAmber(screen.getByLabelText('VAT on it'))).toBe(true)
    expect(calls('POST', '/api/v1/bills/intake?source=')).toHaveLength(0)
  })
})
