import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import type { BillRowDto } from '../../api/expenditure/bills'
import { SessionContext } from '../../lib/session/session'
import { SupplierNoteIntake, type NoteKind } from '../../components/debit/SupplierNoteIntake'
import { fromIntake, toConfirmation } from '../../lib/billIntake'
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
/** The supplier's documents the bill list answers with. */
let billRows: BillRowDto[]

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([called, init]) =>
      String(called).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

const CONFIRM = `/api/v1/bills/intake/${XML_NOTE.id}/confirm`

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  confirmAnswer = null
  billRows = [BILL]
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
    if (url.startsWith('/api/v1/bills/intake/') && method === 'DELETE')
      return new Response(null, { status: 204 })
    if (url.startsWith('/api/v1/bills?') && method === 'GET')
      return json(200, { items: billRows, page: 0, pageSize: 10, total: billRows.length })
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
      // The reason as typed; the form has no CL-02-OM code to pick, so no `reasonCode`.
      reasonDetail: REASON,
    })
    // No bill was chosen, so none is named, nothing is held against one, and nothing follows.
    expect(body).not.toHaveProperty('relatedBillId')
    expect(body).not.toHaveProperty('holdAsCredit')
    expect(calls('POST', '/api/v1/credit-notes/')).toHaveLength(0)
  })

  it('names the chosen bill on the confirm, which sets the credit against it, and calls no apply', async () => {
    await uploadNote()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))

    expect(await screen.findByText('credit note page')).toBeTruthy()
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.documentTypeCode).toBe('381')
    expect(confirmed.relatedBillId).toBe(BILL_ID)
    // Set against is the server's default, so no `holdAsCredit` is sent.
    expect(confirmed).not.toHaveProperty('holdAsCredit')
    expect(confirmed.reasonDetail).toBe(REASON)
    expect(confirmed).not.toHaveProperty('reasonCode')
    // The server applies the credit in the confirm itself; a second apply would be refused.
    expect(calls('POST', '/api/v1/credit-notes/')).toHaveLength(0)
  })

  it('keeps the chosen bill as the reference when the credit is held, and asks the server to apply nothing', async () => {
    await uploadNote()
    await chooseBill()
    fireEvent.click(screen.getByRole('radio', { name: /Hold it as credit/ }))
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the credit note' }))

    expect(await screen.findByText('credit note page')).toBeTruthy()
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.documentTypeCode).toBe('381')
    expect(confirmed.relatedBillId).toBe(BILL_ID)
    expect(confirmed.holdAsCredit).toBe(true)
    expect(confirmed.reasonDetail).toBe(REASON)
    expect(calls('POST', '/api/v1/credit-notes/')).toHaveLength(0)
  })

  it('saves nothing when the chosen bill cannot take the credit, and stays on the form to choose again', async () => {
    confirmAnswer = async () =>
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
        'This credit note is from a different supplier than that bill. A credit can only reduce a bill from the supplier who issued it.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('credit note page')).toBeNull()
    // Nothing was saved, so the form offers to save again rather than to open a note.
    expect(screen.queryByRole('link', { name: 'Open the note' })).toBeNull()
    const primary = screen.getByRole('button', { name: 'Save and set against the bill' })
    expect((primary as HTMLButtonElement).disabled).toBe(false)
    expect(calls('POST', '/api/v1/credit-notes/')).toHaveLength(0)
  })

  it('reads a refusal it has no sentence for as the generic refusal, not a retry', async () => {
    confirmAnswer = async () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'SOME_RULE_THIS_BUILD_HAS_NOT_MAPPED',
      })
    await uploadNote()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))

    expect(await screen.findByText(/^The server refused this\. Nothing was changed/)).toBeTruthy()
    expect(calls('POST', CONFIRM)).toHaveLength(1)
  })

  // The confirm sets the credit against the chosen bill in the same request, so it is refused
  // with the apply's own code, and says the owner's sentence for it.
  it('says the chosen bill is on hold when the confirm is refused for it', async () => {
    confirmAnswer = async () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'CREDIT_NOTE_TARGET_ON_HOLD',
      })
    await uploadNote()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))

    expect(
      await screen.findByText(
        'This bill is on hold. Release it before setting a credit against it.',
      ),
    ).toBeTruthy()
    expect(calls('POST', CONFIRM)).toHaveLength(1)
    expect(screen.queryByText('credit note page')).toBeNull()
  })

  it('names the payment run the chosen bill is in, in both languages', async () => {
    confirmAnswer = async () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'CREDIT_NOTE_TARGET_IN_PAYMENT_RUN',
        paymentRunReference: 'PR-0007',
      })
    await uploadNote()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))
    expect(
      await screen.findByText(
        'This bill is already in payment run PR-0007. Take it out of the run first.',
      ),
    ).toBeTruthy()

    await i18n.changeLanguage('ar')
    fireEvent.click(await screen.findByRole('button', { name: 'احفظ واخصمه من الفاتورة' }))
    expect(
      await screen.findByText(
        'هذه الفاتورة ضمن دفعة السداد PR-0007 بالفعل. أخرجها من الدفعة أولًا.',
      ),
    ).toBeTruthy()
    expect(calls('POST', CONFIRM)).toHaveLength(2)
  })

  // Owner, 6 Oct: the frame's "pay OMR ... less" is a designer's slip; money shows the sign.
  it('shows the amount the credit takes off the bill with the Rial sign, not "OMR"', async () => {
    await uploadNote()
    await chooseBill()
    const visible = (element: Element) => {
      const copy = element.cloneNode(true) as Element
      copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
      return copy.textContent ?? ''
    }

    const english = screen.getByText(/^The bill is unpaid, so you simply pay/)
    expect(english.querySelector('svg')).not.toBeNull()
    expect(visible(english)).toMatch(/^The bill is unpaid, so you simply pay\s+105\.000 less\.$/)
    expect(visible(english)).not.toContain('OMR')

    await i18n.changeLanguage('ar')
    const arabic = await screen.findByText(/^الفاتورة غير مدفوعة، فتدفع ببساطة أقل بمقدار/)
    expect(arabic.querySelector('svg')).not.toBeNull()
    expect(visible(arabic)).not.toContain('OMR')
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

/**
 * What the composer reports once saved: the confirm answer's `creditApplied` says whether any
 * credit came off the chosen bill; an older server that omits it leaves the bill as listed to
 * decide.
 */
describe('the outcome of a credit note set against its bill on upload', () => {
  async function saveAgainstBill(creditApplied: unknown) {
    confirmAnswer = async () =>
      json(201, {
        id: NOTE_ID,
        supplierBillNumber: 'MR-CN-0042',
        totalIncludingVat: 105,
        currencyCode: 'OMR',
        ...(creditApplied === undefined ? {} : { creditApplied }),
      })
    const onSaved = vi.fn()
    render(
      <MemoryRouter>
        <SessionContext.Provider value={MANAGER}>
          <SupplierNoteIntake
            kind="credit"
            intake={XML_NOTE}
            file={new File(['<CreditNote/>'], 'note.xml', { type: 'application/xml' })}
            cancelTo="/expenditure/credit-notes"
            onReplace={() => {}}
            onSaved={onSaved}
          />
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
    await chooseBill()
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodyOf(calls('POST', CONFIRM)[0]).relatedBillId).toBe(BILL_ID)
    return onSaved.mock.calls[0][1]
  }

  it('says it was set against the bill when the server took credit off it', async () => {
    expect(await saveAgainstBill({ billId: BILL_ID, amount: 105 })).toBe(
      'supplierCreditNotes.upload.savedApplied',
    )
  })

  it('says the credit is held when the server took nothing off the bill', async () => {
    expect(await saveAgainstBill(null)).toBe('supplierCreditNotes.upload.savedHeld')
  })

  it('falls back to the bill as listed when the server does not say', async () => {
    // The chosen bill still owed 315.000, so the credit came off it.
    expect(await saveAgainstBill(undefined)).toBe('supplierCreditNotes.upload.savedApplied')
  })
})

/** "Hold it as credit" (`holdAsCredit`) belongs to a credit note: the server refuses it on a 383. */
describe('holding a credit against its bill on upload', () => {
  function renderComposer(kind: NoteKind, onSaved = vi.fn()) {
    render(
      <MemoryRouter>
        <SessionContext.Provider value={MANAGER}>
          <SupplierNoteIntake
            kind={kind}
            intake={XML_NOTE}
            file={new File(['<Note/>'], 'note.xml', { type: 'application/xml' })}
            cancelTo="/expenditure"
            onReplace={() => {}}
            onSaved={onSaved}
          />
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    return onSaved
  }

  it('says the credit is held once saved, as before', async () => {
    confirmAnswer = async () =>
      json(201, {
        id: NOTE_ID,
        supplierBillNumber: 'MR-CN-0042',
        totalIncludingVat: 105,
        currencyCode: 'OMR',
        creditApplied: null,
      })
    const onSaved = renderComposer('credit')
    expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
    await chooseBill()
    fireEvent.click(screen.getByRole('radio', { name: /Hold it as credit/ }))
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the credit note' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.relatedBillId).toBe(BILL_ID)
    expect(confirmed.holdAsCredit).toBe(true)
    expect(onSaved.mock.calls[0][1]).toBe('supplierCreditNotes.upload.savedHeld')
  })

  it('never sends it on a debit note, even with a bill chosen, but sends the bill', async () => {
    const onSaved = renderComposer('debit')
    expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /MR-INV-8821/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save the debit note' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.documentTypeCode).toBe('383')
    expect(confirmed).not.toHaveProperty('holdAsCredit')
    // The bill the charge adds to: the server records it as the note's link (it applies nothing).
    expect(confirmed.relatedBillId).toBeTruthy()
  })

  it('is dropped from any confirmation that is not a credit note', () => {
    const form = fromIntake(XML_NOTE)
    for (const documentTypeCode of ['380', '383'] as const)
      expect(
        toConfirmation(form, { documentTypeCode, relatedBillId: BILL_ID, holdAsCredit: true }),
      ).not.toHaveProperty('holdAsCredit')
    expect(
      toConfirmation(form, { documentTypeCode: '381', relatedBillId: BILL_ID, holdAsCredit: true })
        .holdAsCredit,
    ).toBe(true)
  })
})

/**
 * Owner, 8 Oct 2026: a credit note may correct one of the supplier's debit notes (383), which the
 * bill list already carries. The credit note's list names it "Debit note"; a debit note's list
 * does not offer it, since a debit note adds to a bill only.
 */
describe('a credit note correcting a supplier debit note on upload', () => {
  const DEBIT_NOTE_ID = '81000000-0000-0000-0000-000000000003'
  const DEBIT_NOTE: BillRowDto = {
    ...BILL,
    id: DEBIT_NOTE_ID,
    documentTypeCode: '383',
    supplierBillNumber: 'MR-DN-0007',
    totalIncludingVat: 52.5,
    vatAmount: 2.5,
    outstandingAmount: 52.5,
    workflowState: 'NEW',
    debitNoteDecision: 'REFUSED',
  }
  /** The same debit note, not yet accepted or refused. */
  const OPEN_DEBIT_NOTE: BillRowDto = { ...DEBIT_NOTE, debitNoteDecision: null }

  beforeEach(() => {
    billRows = [BILL, DEBIT_NOTE]
  })

  function renderComposer(kind: NoteKind, onSaved = vi.fn()) {
    render(
      <MemoryRouter>
        <SessionContext.Provider value={MANAGER}>
          <SupplierNoteIntake
            kind={kind}
            intake={XML_NOTE}
            file={new File(['<Note/>'], 'note.xml', { type: 'application/xml' })}
            cancelTo="/expenditure"
            onReplace={() => {}}
            onSaved={onSaved}
          />
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    return onSaved
  }

  const debitNoteRow = () => screen.findByRole('button', { name: /MR-DN-0007/ })

  it('lists the debit note beside the bills, named "Debit note", in both languages', async () => {
    await uploadNote()
    const row = await debitNoteRow()
    expect(row.textContent).toContain('Debit note · ')
    // A bill keeps its row as it was.
    const bill = screen.getByRole('button', { name: /MR-INV-8821/ })
    expect(bill.textContent).not.toContain('Debit note')
    // The list is the same request as before: the supplier's documents, no new route or filter.
    const listed = calls('GET', '/api/v1/bills?')
    expect(listed.length).toBeGreaterThan(0)
    for (const [url] of listed) expect(String(url)).not.toMatch(/document|type=/i)

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect((await debitNoteRow()).textContent).toContain('إشعار مدين · ')
  })

  it("sends the chosen debit note's id as the bill the credit corrects", async () => {
    await uploadNote()
    fireEvent.click(await debitNoteRow())
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save and set against the bill' }),
    )

    expect(await screen.findByText('credit note page')).toBeTruthy()
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.documentTypeCode).toBe('381')
    expect(confirmed.relatedBillId).toBe(DEBIT_NOTE_ID)
    expect(confirmed).not.toHaveProperty('holdAsCredit')
    expect(calls('POST', '/api/v1/credit-notes/')).toHaveLength(0)
  })

  it('sends "Hold it as credit" for a debit note exactly as for a bill', async () => {
    billRows = [BILL, OPEN_DEBIT_NOTE]
    await uploadNote()
    fireEvent.click(await debitNoteRow())
    fireEvent.click(await screen.findByRole('radio', { name: /Hold it as credit/ }))
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the credit note' }))

    expect(await screen.findByText('credit note page')).toBeTruthy()
    const confirmed = bodyOf(calls('POST', CONFIRM)[0])
    expect(confirmed.relatedBillId).toBe(DEBIT_NOTE_ID)
    expect(confirmed.holdAsCredit).toBe(true)
  })

  it('closes a refused debit note: no choice, one line instead, in both languages', async () => {
    await uploadNote()
    fireEvent.click(await debitNoteRow())
    const line =
      'This debit note was refused, so the credit closes it. Anything left over stays as credit.'
    expect(await screen.findByText(line)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Set it against/ })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Hold it as credit/ })).toBeNull()
    // The refund row, unreachable here anyway, stays as it was.
    expect(screen.getByRole('radio', { name: /Ask for a refund/ })).toBeTruthy()

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(
      await screen.findByText('هذا الإشعار المدين مرفوض، لذا يُغلقه هذا الرصيد. وما يزيد يبقى رصيدًا.'),
    ).toBeTruthy()
  })

  it('says once saved that the credit closes the refused debit note, naming it', async () => {
    // The server closes a refused debit note with the credit whichever choice is made, and says
    // so in `creditApplied`.
    confirmAnswer = async () =>
      json(201, {
        id: NOTE_ID,
        supplierBillNumber: 'MR-CN-0042',
        totalIncludingVat: 105,
        currencyCode: 'OMR',
        creditApplied: { billId: DEBIT_NOTE_ID, amount: 52.5 },
      })
    const onSaved = renderComposer('credit')
    expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
    fireEvent.click(await debitNoteRow())
    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodyOf(calls('POST', CONFIRM)[0]).relatedBillId).toBe(DEBIT_NOTE_ID)
    const [, key, values] = onSaved.mock.calls[0]
    expect(key).toBe('supplierCreditNotes.upload.savedClosesRefusedDebitNote')
    expect(values).toEqual({ note: 'MR-DN-0007' })
    expect(i18n.t(key, values)).toBe(
      'Saved. The credit closes refused debit note MR-DN-0007; anything left over stays as credit.',
    )
    expect(i18n.t(key, { ...values, lng: 'ar' })).toBe(
      'حُفظ. يُغلق هذا الرصيد الإشعار المدين المرفوض MR-DN-0007، وما يزيد يبقى رصيدًا.',
    )
  })

  for (const decision of [null, 'ACCEPTED'] as const)
    it(`names the debit note the credit is set against (${decision ?? 'undecided'})`, async () => {
      billRows = [BILL, { ...DEBIT_NOTE, debitNoteDecision: decision }]
      confirmAnswer = async () =>
        json(201, {
          id: NOTE_ID,
          supplierBillNumber: 'MR-CN-0042',
          totalIncludingVat: 105,
          currencyCode: 'OMR',
          creditApplied: { billId: DEBIT_NOTE_ID, amount: 52.5 },
        })
      const onSaved = renderComposer('credit')
      expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
      fireEvent.click(await debitNoteRow())
      const setNow = await screen.findByRole('radio', { name: /Set it against MR-DN-0007 now/ })
      expect(setNow.textContent).not.toContain('The bill is unpaid')
      // The amount carries the Rial sign, as the bill's sentence does.
      const english = screen.getByText(/^The debit note is unpaid, so you simply pay/)
      expect(english.querySelector('svg')).not.toBeNull()
      const shown = english.cloneNode(true) as Element
      shown.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
      expect(shown.textContent).toMatch(
        /^The debit note is unpaid, so you simply pay\s+105\.000 less\.$/,
      )
      expect(screen.getByRole('radio', { name: /Hold it as credit/ })).toBeTruthy()
      expect(screen.queryByText(/This debit note was refused/)).toBeNull()

      fireEvent.change(reasonField(), { target: { value: REASON } })
      fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      const [, key, values] = onSaved.mock.calls[0]
      expect(key).toBe('supplierCreditNotes.upload.savedAppliedDebitNote')
      expect(values).toBeUndefined()
      expect(i18n.t(key)).toBe('Saved and set against the debit note.')
      expect(i18n.t(key, { lng: 'ar' })).toBe('حُفظ وخُصم من الإشعار المدين.')

      await act(async () => {
        await i18n.changeLanguage('ar')
      })
      const setNowAr = await screen.findByRole('radio', { name: /MR-DN-0007/ })
      expect(setNowAr.textContent).toContain('الإشعار المدين غير مدفوع، فتدفع ببساطة أقل بمقدار')
    })

  it("keeps a bill's sentences as they were", async () => {
    const onSaved = renderComposer('credit')
    expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
    await chooseBill()
    const setNow = screen.getByRole('radio', { name: /Set it against MR-INV-8821 now/ })
    expect(setNow.textContent).toContain('The bill is unpaid, so you simply pay')
    expect(screen.getByRole('radio', { name: /Hold it as credit/ })).toBeTruthy()
    expect(screen.queryByText(/This debit note was refused/)).toBeNull()

    fireEvent.change(reasonField(), { target: { value: REASON } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and set against the bill' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][1]).toBe('supplierCreditNotes.upload.savedApplied')
    expect(onSaved.mock.calls[0][2]).toBeUndefined()
    expect(i18n.t('supplierCreditNotes.upload.savedApplied')).toBe(
      'Saved and set against the bill.',
    )

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect((await screen.findByRole('radio', { name: /MR-INV-8821/ })).textContent).toContain(
      'الفاتورة غير مدفوعة، فتدفع ببساطة أقل بمقدار',
    )
  })

  it("offers no debit note on a debit note's list, only the bills", async () => {
    renderComposer('debit')
    expect(await screen.findByDisplayValue('MR-CN-0042')).toBeTruthy()
    expect(await screen.findByRole('button', { name: /MR-INV-8821/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /MR-DN-0007/ })).toBeNull()
    expect(screen.queryByText(/Debit note · /)).toBeNull()
  })
})
