import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import type { BillRowDto } from '../../api/expenditure/bills'
import type { CreditNoteActionDto } from '../../api/expenditure/notes'
import { UploadCreditNotePage } from './UploadCreditNotePage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'supplier.read'],
  scopes: [],
  featureFlags: {},
}

/** Can read bills, but not record what is owed or paid. */
const READER: Entitlements = { ...MANAGER, permissions: ['invoice.read', 'supplier.read'] }

const NOTE_ID = '81000000-0000-0000-0000-000000000001'
const BILL_ID = '81000000-0000-0000-0000-000000000002'
const REASON = 'Two sacks returned damaged'

/** A supplier's credit note as a Peppol XML file, read by the server. */
const XML_NOTE: IntakeDto = {
  id: 'i-cn',
  source: 'UPLOADED',
  filename: 'note.xml',
  contentType: 'application/xml',
  byteSize: 120,
  sha256: 'x',
  documentTypeCode: null,
  extractionStatus: 'EXTRACTED',
  extracted: {
    supplierName: 'Muscat Roastery Co',
    supplierVatNumber: 'OM1100999001',
    billNumber: 'MR-CN-0042',
    issueDate: '2026-09-10',
    dueDate: null,
    currency: 'OMR',
    net: 100,
    vat: 5,
    total: 105,
    lines: [
      {
        description: 'Arabica beans, returned',
        quantity: 2,
        unitPrice: 50,
        vatRate: 5,
        amount: 100,
        confident: true,
      },
    ],
    confidence: { supplierName: true },
  },
  confirmedBillId: null,
  workflowState: 'DRAFT',
  uploadedAt: '2026-09-17T08:00:00Z',
}

/** The bill the credit corrects: the same supplier, still owing. */
const BILL: BillRowDto = {
  id: BILL_ID,
  source: 'UPLOADED',
  supplierId: null,
  supplierName: 'Muscat Roastery Co',
  documentTypeCode: '380',
  supplierBillNumber: 'MR-INV-8821',
  issueDate: '2026-08-30',
  dueDate: '2026-09-29',
  overdue: false,
  currencyCode: 'OMR',
  totalIncludingVat: 315,
  vatAmount: 15,
  paidAmount: 0,
  outstandingAmount: 315,
  purchaseOrderReference: null,
  workflowState: 'APPROVED',
  readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
  match: null,
  hold: null,
  paymentRunReference: null,
  paidOnTheSpot: false,
}

const APPLIED: CreditNoteActionDto = {
  settlement: {
    id: 's-1',
    creditNoteId: NOTE_ID,
    billId: BILL_ID,
    kind: 'APPLIED',
    amount: 105,
    paymentReference: null,
    settledOn: '2026-09-17',
    actorId: 'u-1',
    occurredAt: '2026-09-17T08:01:00Z',
  },
  status: 'APPLIED',
  balance: { applied: 105, refunded: 0, remaining: 0 },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
/** What the confirm answers, when set; a saved note otherwise. */
let confirmAnswer: (() => Promise<Response>) | null
/** What the apply answers, when set; a settlement otherwise. */
let applyAnswer: (() => Response) | null

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([called, init]) =>
      String(called).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

const CONFIRM = `/api/v1/bills/intake/${XML_NOTE.id}/confirm`
const APPLY = `/api/v1/credit-notes/${NOTE_ID}/apply`

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  confirmAnswer = null
  applyAnswer = null
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/bills/intake?source=UPLOADED' && method === 'POST')
      return json(201, XML_NOTE)
    if (url === CONFIRM && method === 'POST')
      return confirmAnswer
        ? confirmAnswer()
        : json(201, {
            id: NOTE_ID,
            supplierBillNumber: 'MR-CN-0042',
            totalIncludingVat: 105,
            currencyCode: 'OMR',
          })
    if (url === APPLY && method === 'POST') return applyAnswer ? applyAnswer() : json(200, APPLIED)
    if (url.startsWith('/api/v1/bills/intake/') && method === 'DELETE')
      return new Response(null, { status: 204 })
    if (url.startsWith('/api/v1/bills?') && method === 'GET')
      return json(200, { items: [BILL], page: 0, pageSize: 10, total: 1 })
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/expenditure/credit-notes/upload']}>
      <Routes>
        <Route path="/expenditure/credit-notes/upload" element={<UploadCreditNotePage />} />
        <Route path="/expenditure/credit-notes/:id" element={<p>credit note page</p>} />
        <Route path="/expenditure/credit-notes" element={<p>credit notes list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Uploads the XML note and waits for the form to be filled from it. */
async function uploadNote() {
  renderPage()
  await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull())
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(['<CreditNote/>'], 'note.xml', { type: 'application/xml' })] },
    })
  })
  expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
}

const reasonField = () => screen.getByRole('textbox', { name: /^Reason/ })

async function chooseBill() {
  fireEvent.click(await screen.findByRole('button', { name: /MR-INV-8821/ }))
  expect(await screen.findByRole('button', { name: 'Save and set against the bill' })).toBeTruthy()
}

describe('upload a supplier credit note', () => {
  it('will not save without a reason, and names it as the field to fill', async () => {
    await uploadNote()
    fireEvent.click(screen.getByRole('button', { name: 'Save the credit note' }))

    expect(
      await screen.findByText('Some fields need attention before the bill can be saved.'),
    ).toBeTruthy()
    expect(screen.getByText('This field is required')).toBeTruthy()
    expect(calls('POST', CONFIRM)).toHaveLength(0)
  })

  it('confirms the note as a 381 with its lines, and opens it on the credit-note screen', async () => {
    await uploadNote()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the credit note' }))

    expect(await screen.findByText('credit note page')).toBeTruthy()
    expect(calls('POST', CONFIRM)).toHaveLength(1)
    const body = bodyOf(calls('POST', CONFIRM)[0])
    expect(body).toEqual({
      supplierId: null,
      supplierName: 'Muscat Roastery Co',
      documentTypeCode: '381',
      billNumber: 'MR-CN-0042',
      issueDate: '2026-09-10',
      dueDate: null,
      currency: 'OMR',
      vat: 5,
      total: 105,
      lines: [
        {
          description: 'Arabica beans, returned',
          quantity: 2,
          unit: null,
          unitPrice: 50,
          vatRate: 5,
          taxCategoryCode: 'S5',
          lineNet: 100,
        },
      ],
      purchaseOrderId: null,
      goodsReceiptId: null,
      purchaseOrderReference: null,
      category: null,
      paidOnTheSpot: null,
      notDuplicateOf: null,
    })
    // The current contract (row 5.12): the confirm request has no place for the note's reason,
    // so the reason typed on the screen is not sent anywhere. When the backend adds the field,
    // this assertion is the one to turn around.
    expect(JSON.stringify(body)).not.toContain(REASON)
    // No bill was chosen, so nothing follows the save.
    expect(calls('POST', '/api/v1/credit-notes/')).toHaveLength(0)
  })

  it('sets the credit against the chosen bill after saving it', async () => {
    await uploadNote()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))

    expect(await screen.findByText('credit note page')).toBeTruthy()
    // The current contract (row 5.12): the confirm request has no place for the bill the note
    // corrects either; the bill only reaches the server through the apply call that follows.
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.documentTypeCode).toBe('381')
    expect(JSON.stringify(confirmed)).not.toContain(BILL_ID)
    expect(JSON.stringify(confirmed)).not.toContain(REASON)

    expect(calls('POST', APPLY)).toHaveLength(1)
    // A null amount asks for the largest amount that fits both the credit and the bill.
    expect(bodyOf(calls('POST', APPLY)[0])).toEqual({ billId: BILL_ID, amount: null })
    // The save comes first: the apply names the note the confirm created.
    const order = fetchMock.mock.calls.map(([url]) => String(url))
    expect(order.indexOf(CONFIRM)).toBeLessThan(order.indexOf(APPLY))
  })

  it('keeps the note saved when setting it against the bill is refused, and says so', async () => {
    applyAnswer = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'CREDIT_NOTE_SUPPLIER_MISMATCH',
      })
    await uploadNote()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))

    expect(
      await screen.findByText(
        'The note is saved, but the next step did not go through. This credit note is from a different supplier than that bill. A credit can only reduce a bill from the supplier who issued it.',
      ),
    ).toBeTruthy()
    // Still on the form, which now points at the saved note instead of offering to save again.
    expect(screen.queryByText('credit note page')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the note' }).getAttribute('href')).toBe(
      `/expenditure/credit-notes/${NOTE_ID}`,
    )
    const primary = screen.getByRole('button', { name: 'Save and set against the bill' })
    expect((primary as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(primary)
    expect(calls('POST', CONFIRM)).toHaveLength(1)
    expect(calls('POST', APPLY)).toHaveLength(1)
  })

  it('sends one confirm however quickly the button is pressed twice', async () => {
    let answer: (response: Response) => void = () => {}
    confirmAnswer = () =>
      new Promise<Response>((resolve) => {
        answer = resolve
      })
    await uploadNote()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    const primary = screen.getByRole('button', { name: 'Save the credit note' })
    fireEvent.click(primary)
    fireEvent.click(primary)
    fireEvent.submit(primary.closest('form')!)

    await waitFor(() => expect(calls('POST', CONFIRM)).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()

    await act(async () => {
      answer(
        json(201, {
          id: NOTE_ID,
          supplierBillNumber: 'MR-CN-0042',
          totalIncludingVat: 105,
          currencyCode: 'OMR',
        }),
      )
    })
    expect(await screen.findByText('credit note page')).toBeTruthy()
    expect(calls('POST', CONFIRM)).toHaveLength(1)
  })

  it('refuses the page without the right to record what is owed', async () => {
    who = READER
    renderPage()

    await waitFor(() => expect(calls('GET', '/api/v1/me/entitlements')).toHaveLength(1))
    expect(
      await screen.findByText(
        "Your account doesn't have access to this part of Fawtir. Ask an administrator in your company if you need it.",
      ),
    ).toBeTruthy()
    expect(screen.getByText('No access')).toBeTruthy()
    expect(document.querySelector('input[type=file]')).toBeNull()
    expect(screen.queryByText("Choose the supplier's credit note")).toBeNull()
    expect(calls('POST', '/api/v1/bills/intake')).toHaveLength(0)
  })
})
