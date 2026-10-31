import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillRowDto } from '../../api/expenditure/bills'
import type {
  DebitNoteDecisionDto,
  DebitNoteRowDto,
  DebitNoteSummaryDto,
} from '../../api/expenditure/notes'
import { toDebitNoteItem } from '../../lib/supplierNoteList'
import { debitEffect, debitNoteChecks } from '../../lib/supplierDebitNotes'
import { SupplierDebitNotesPage } from './SupplierDebitNotesPage'
import { SupplierDebitNoteDetailPage } from '../SupplierDebitNoteDetailPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/debit-notes/summary'
const NOTE_ID = '80000000-0000-0000-0000-000000000001'
/** A supplier record's id, as the server's are. */
const NIZWA = '5d000000-0000-4000-8000-000000000002'

const APPROVER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.approve'],
  scopes: [],
  featureFlags: {},
}

const READER: Entitlements = { ...APPROVER, permissions: ['invoice.read'] }

const SUMMARY: DebitNoteSummaryDto = {
  currencyCode: 'OMR',
  needsCheckingCount: 2,
  needsCheckingTotal: 130.75,
  acceptedThisQuarterCount: 5,
  acceptedThisQuarterTotal: 640,
  acceptedOpenTotal: 200,
  rejectedThisYearCount: 3,
  rejectedThisYearTotal: 95.5,
  excludedFromTotals: 0,
  tabs: { all: 10, unchecked: 2, accepted: 5, refused: 3 },
}

function note(overrides: Partial<DebitNoteRowDto> = {}): DebitNoteRowDto {
  return {
    id: NOTE_ID,
    inboundDeliveryId: null,
    source: 'PEPPOL',
    networkVerified: true,
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    supplierParticipantId: '0248:1234567890',
    debitNoteNumber: 'QMS-DN-1',
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    overdue: false,
    currencyCode: 'OMR',
    taxCurrencyCode: null,
    totalIncludingVat: 75.5,
    vatAmount: 3.595,
    amountDue: 75.5,
    reasonCode: 'CL02-LATEFEE',
    approval: 'NONE',
    paidAmount: 0,
    creditedAmount: 0,
    outstandingAmount: 75.5,
    paymentState: 'UNPAID',
    status: 'UNCHECKED',
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    relatesTo: { billNumber: 'QMS-7781', issueDate: '2026-08-20', documentUuid: 'x' },
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let notes: DebitNoteRowDto[]
let decisions: DebitNoteDecisionDto[]
let refuseBody: unknown
let acceptCalls: number
/** What the refusal answers when a test needs the server to refuse it. */
let refuseFailure: (() => Response) | null
/** The supplier's bills, when a test needs the note's bill on file; unanswered otherwise. */
let billRows: BillRowDto[] | null
/** The note's own bill (`GET /bills/{noteId}`), when a test needs it; unanswered otherwise. */
let ownBill: unknown

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = APPROVER
  notes = [note()]
  decisions = []
  refuseBody = null
  acceptCalls = 0
  refuseFailure = null
  billRows = null
  ownBill = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    // Narrowed by a search or a supplier, the summary counts its tabs over what is left.
    if (url.startsWith(`${SUMMARY_URL}?`))
      return json(200, { ...SUMMARY, tabs: { all: 1, unchecked: 1, accepted: 0, refused: 0 } })
    if (url.startsWith(SUMMARY_URL)) return json(200, SUMMARY)
    if (url.includes(`/debit-notes/${NOTE_ID}/decisions`)) return json(200, decisions)
    if (url.includes(`/debit-notes/${NOTE_ID}/accept`)) {
      acceptCalls += 1
      return json(200, {
        decision: 'ACCEPTED',
        reason: null,
        decidedBy: 'u-1',
        decidedAt: '2026-09-21T10:00:00Z',
      })
    }
    if (url.includes(`/debit-notes/${NOTE_ID}/refuse`)) {
      refuseBody = JSON.parse(String(init?.body))
      if (refuseFailure) return refuseFailure()
      return json(200, {
        decision: 'REFUSED',
        reason: 'x',
        decidedBy: 'u-1',
        decidedAt: '2026-09-21T10:00:00Z',
      })
    }
    if (url.includes(`/debit-notes/${NOTE_ID}`)) return json(200, notes[0])
    if (url.includes('/debit-notes')) {
      return json(200, {
        items: notes,
        page: 0,
        pageSize: 20,
        count: notes.length,
        total: notes.length,
      })
    }
    if (ownBill && url === `/api/v1/bills/${NOTE_ID}`) return json(200, ownBill)
    if (billRows && url.startsWith('/api/v1/bills?')) {
      return json(200, {
        items: billRows,
        page: 0,
        pageSize: 10,
        count: billRows.length,
        total: billRows.length,
      })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderList = (path = '/expenditure/debit-notes') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/debit-notes" element={<SupplierDebitNotesPage />} />
      </Routes>
    </MemoryRouter>,
  )

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={[`/expenditure/debit-notes/${NOTE_ID}`]}>
      <Routes>
        <Route path="/expenditure/debit-notes/:id" element={<SupplierDebitNoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

/** The decision card's buttons; the header repeats them, so the card's come last. */
const cardButton = (name: string) => screen.getAllByRole('button', { name }).at(-1)!

describe('Debit notes list, wired to the API', () => {
  it('opens on All as the frame does, and asks the server for each tab', async () => {
    renderList()
    await screen.findByText('QMS-DN-1')
    // The frame's default tab is All; the charges nobody has checked are one click away on the
    // highlighted card (below), which asks the server for them rather than filtering here.
    expect(calls('/api/v1/debit-notes?')).toEqual([
      '/api/v1/debit-notes?status=ALL&page=0&page_size=20',
    ])

    fireEvent.click(screen.getByRole('tab', { name: /^Accepted/ }))
    await waitFor(() =>
      expect(calls('/api/v1/debit-notes?').at(-1)).toBe(
        '/api/v1/debit-notes?status=ACCEPTED&page=0&page_size=20',
      ),
    )
  })

  it("counts every tab from the summary's tabs", async () => {
    renderList()
    await screen.findByText('QMS-DN-1')
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'All10',
        'Accepted5',
        'Refused3',
      ]),
    )
  })

  it('sends the search, the supplier and the sort to the server, and counts the tabs over them', async () => {
    notes = [
      note(),
      note({
        id: 'other',
        debitNoteNumber: 'NDT-DN-2',
        supplierId: NIZWA,
        supplierName: 'Nizwa Dates Trading',
      }),
    ]
    renderList()
    await screen.findByText('NDT-DN-2')

    fireEvent.change(screen.getByLabelText('Search supplier, bill number...'), {
      target: { value: 'late fee' },
    })
    await waitFor(() =>
      expect(calls('/api/v1/debit-notes?').at(-1)).toBe(
        '/api/v1/debit-notes?status=ALL&q=late+fee&page=0&page_size=20',
      ),
    )
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'All1',
        'Accepted0',
        'Refused0',
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Nizwa Dates Trading' }))
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Supplier A to Z' }))
    await waitFor(() =>
      expect(calls('/api/v1/debit-notes?').at(-1)).toBe(
        `/api/v1/debit-notes?status=ALL&q=late+fee&supplier_id=${NIZWA}&sort=SUPPLIER&page=0&page_size=20`,
      ),
    )
    expect(calls(`${SUMMARY_URL}?`).at(-1)).toBe(`${SUMMARY_URL}?q=late+fee&supplier_id=${NIZWA}`)
  })

  it('ignores an old link whose supplier was a name, rather than sending it as supplier_id', async () => {
    renderList('/expenditure/debit-notes?supplier=Nizwa%20Dates%20Trading')
    await screen.findByText('QMS-DN-1')
    expect(calls('/api/v1/debit-notes?')).toEqual([
      '/api/v1/debit-notes?status=ALL&page=0&page_size=20',
    ])
    expect(calls(`${SUMMARY_URL}?`)).toEqual([])
  })

  it('reaches what needs checking from the highlighted card, as a server filter', async () => {
    renderList()
    await screen.findByText('QMS-DN-1')
    fireEvent.click(screen.getByRole('link', { name: /Needs checking/ }))
    await waitFor(() =>
      expect(calls('/api/v1/debit-notes?').at(-1)).toBe(
        '/api/v1/debit-notes?status=UNCHECKED&page=0&page_size=20',
      ),
    )
    expect(screen.getByRole('tab', { name: /Needs checking/ })).toBeTruthy()
  })

  it('shows the summary and what is outstanding on the row', async () => {
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByText('130.750')).toBeTruthy()
    expect(screen.getByText('640.000')).toBeTruthy()
    expect(screen.getByText('95.500')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('75.500')).toBeTruthy()
    // An unchecked charge: the frame's "you'd pay more" under a plus figure.
    expect(screen.getByText("you'd pay more")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Accept or refuse' })).toBeTruthy()
  })

  it('says Arrived with the day it reached us, and the issue date only as Issued (B-9)', async () => {
    notes = [
      note({ id: 'dn-a', debitNoteNumber: 'QMS-DN-A', receivedAt: '2026-10-29T08:00:00Z' }),
      note({ id: 'dn-b', debitNoteNumber: 'QMS-DN-B', receivedAt: null }),
    ]
    renderList()
    const row = async (name: string) => within((await screen.findByText(name)).closest('tr')!)
    expect((await row('QMS-DN-A')).getByText('Arrived 29 Oct 2026')).toBeTruthy()
    expect((await row('QMS-DN-B')).getByText('Issued 1 Sept 2026')).toBeTruthy()
    expect(screen.queryByText('Arrived 1 Sept 2026')).toBeNull()
  })

  it('does not present a refused charge as money owed', async () => {
    // The figure the supplier asked for still shows; what changes is that it is not a debt.
    expect(toDebitNoteItem(note({ status: 'REFUSED' })).owes).toBe(false)
    expect(toDebitNoteItem(note({ status: 'ACCEPTED' })).owes).toBe(true)

    notes = [note({ status: 'REFUSED' })]
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByText('Refused: not treated as owed')).toBeTruthy()
    expect(screen.queryByText(/outstanding/)).toBeNull()
  })

  it('takes overdue from the server rather than the due date', async () => {
    // Same rule as the Bills list: the flag decides, never this browser's calendar.
    expect(toDebitNoteItem(note({ dueDate: '2020-01-01', overdue: false })).overdue).toBe(false)
    expect(toDebitNoteItem(note({ dueDate: '2099-01-01', overdue: true })).overdue).toBe(true)

    notes = [note({ status: 'ACCEPTED', overdue: true })]
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByText('75.500 outstanding, late')).toBeTruthy()
  })
})

describe('One debit note', () => {
  it('draws the frame: chips, the sand banner, the checks, and the side cards', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getByText('Debit note · Peppol')).toBeTruthy()
    expect(screen.getByText(/They want/)).toBeTruthy()
    expect(screen.getByText('Does this look right')).toBeTruthy()
    expect(screen.getByText('Validated on the Peppol network')).toBeTruthy()
    expect(screen.getByText('Against your rate card')).toBeTruthy()
    expect(screen.getByText('Effect on your VAT')).toBeTruthy()
    expect(
      within(screen.getByRole('list', { name: 'Activity' })).getByText(
        'Waiting for someone to decide',
      ),
    ).toBeTruthy()
  })

  // Owner, 12 Oct 2026: the VAT card says a note out of input VAT is not counted until accepted.
  it('says in the VAT card that a refused note is not counted until accepted', async () => {
    notes = [note({ status: 'REFUSED', decisionReason: 'Already charged' })]
    ownBill = {
      bill: {
        id: NOTE_ID,
        inboundDeliveryId: null,
        documentTypeCode: '383',
        inputVat: {
          counted: false,
          countedOn: null,
          reason: 'DEBIT_NOTE_NOT_ACCEPTED',
          vatAmountOmr: null,
        },
      },
      lines: [],
      intake: null,
    }
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await screen.findByText('Not counted in VAT until you accept it.')).toBeTruthy()
    // Beside the card's own note, not instead of it.
    expect(screen.getByText('Nothing changes on your return unless you accept.')).toBeTruthy()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    ownBill = {
      bill: {
        id: NOTE_ID,
        inboundDeliveryId: null,
        inputVat: {
          counted: false,
          countedOn: null,
          reason: 'DEBIT_NOTE_NOT_ACCEPTED',
          vatAmountOmr: null,
        },
      },
      lines: [],
      intake: null,
    }
    renderDetail()
    expect(
      await screen.findByText('لا تُحتسب في ضريبة القيمة المضافة حتى تقبلها.'),
    ).toBeTruthy()
  })

  it('says nothing about counting once accepted, or from a server that does not send it', async () => {
    notes = [note({ status: 'ACCEPTED' })]
    ownBill = {
      bill: {
        id: NOTE_ID,
        inboundDeliveryId: null,
        inputVat: { counted: true, countedOn: '2026-09-21', reason: 'COUNTED', vatAmountOmr: 3.5 },
      },
      lines: [],
      intake: null,
    }
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    await waitFor(() => expect(calls(`/api/v1/bills/${NOTE_ID}`).length).toBeGreaterThan(0))
    expect(screen.queryByText(/Not counted in VAT/)).toBeNull()
  })

  it('accepts the charge', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    fireEvent.click(cardButton('Accept it'))
    await waitFor(() => expect(acceptCalls).toBe(1))
    expect(await screen.findByText(/The decision is recorded/)).toBeTruthy()
  })

  it('sends the chosen preset as the reason when refusing', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    fireEvent.click(cardButton('Refuse it'))
    fireEvent.click(screen.getByRole('radio', { name: 'Already charged' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record the refusal' }))
    await waitFor(() => expect(refuseBody).toEqual({ reason: 'Already charged' }))
  })

  it('will not send an empty free-text reason, which the server refuses anyway', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    fireEvent.click(cardButton('Refuse it'))
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))

    expect(screen.getByRole('button', { name: 'Record the refusal' })).toHaveProperty(
      'disabled',
      true,
    )

    fireEvent.change(screen.getByPlaceholderText('Your reason, in one line'), {
      target: { value: 'We never ordered this' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record the refusal' }))
    await waitFor(() => expect(refuseBody).toEqual({ reason: 'We never ordered this' }))
  })

  it('offers only the opposite decision once one has been recorded', async () => {
    // Restating a decision is refused by the server and records nothing, so it is not offered:
    // hidden, not greyed (owner, 8 Oct 2026). Reversing always is: that is why the history exists.
    notes = [note({ status: 'ACCEPTED' })]
    const accepted = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })

    expect(screen.queryByRole('button', { name: 'Accept it' })).toBeNull()
    // The header's and the decision card's.
    expect(screen.getAllByRole('button', { name: 'Refuse it' })).toHaveLength(2)
    for (const button of screen.getAllByRole('button', { name: 'Refuse it' })) {
      expect(button).toHaveProperty('disabled', false)
    }
    // Owner, D1 (12 Oct 2026): a whole sentence per decision, never the chip's capitalised word.
    expect(
      screen.getByText('Already accepted. Only the opposite decision can be recorded.'),
    ).toBeTruthy()
    accepted.unmount()

    notes = [note({ status: 'REFUSED', decisionReason: 'Already charged' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(
      screen.getByText('Already refused. Only the opposite decision can be recorded.'),
    ).toBeTruthy()
    expect(screen.queryByText(/Already Refused/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuse it' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Accept it' })).toHaveLength(2)
    for (const button of screen.getAllByRole('button', { name: 'Accept it' })) {
      expect(button).toHaveProperty('disabled', false)
    }
  })

  it('says the decision is already taken in Arabic, one sentence per decision', async () => {
    await i18n.changeLanguage('ar')
    notes = [note({ status: 'REFUSED', decisionReason: 'Already charged' })]
    const refused = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getByText('مرفوض بالفعل. لا يمكن تسجيل سوى القرار المعاكس.')).toBeTruthy()
    refused.unmount()

    notes = [note({ status: 'ACCEPTED' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getByText('مقبول بالفعل. لا يمكن تسجيل سوى القرار المعاكس.')).toBeTruthy()
  })

  it('offers both decisions on a charge nobody has checked', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getAllByRole('button', { name: 'Accept it' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Refuse it' })).toHaveLength(2)
  })

  it('hides "Put on hold" once a decision is taken, rather than greying it', async () => {
    // Owner, 8 Oct 2026: hidden, not greyed. Holding is offered only before a decision.
    for (const status of ['ACCEPTED', 'REFUSED'] as const) {
      notes = [note({ status, decisionReason: status === 'REFUSED' ? 'Already charged' : null })]
      const view = renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
      expect(screen.queryByRole('button', { name: 'Put on hold' }), status).toBeNull()
      expect(screen.queryByText('Put on hold'), status).toBeNull()
      view.unmount()
    }

    notes = [note({ status: 'UNCHECKED' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getByRole('button', { name: 'Put on hold' })).toHaveProperty('disabled', false)
  })

  it("says a note already paid cannot be refused, in the owner's words", async () => {
    notes = [
      note({ status: 'ACCEPTED', paidAmount: 75.5, outstandingAmount: 0, paymentState: 'PAID' }),
    ]
    refuseFailure = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        status: 400,
        error: 'DEBIT_NOTE_ALREADY_PAID',
        detail: 'This debit note is already paid. Record a refund from the supplier instead.',
        trace_id: 'trace-9',
      })
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    fireEvent.click(cardButton('Refuse it'))
    fireEvent.click(screen.getByRole('radio', { name: 'Already charged' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record the refusal' }))
    expect(
      await screen.findByText(
        /^This debit note is already paid\. Record a refund from the supplier instead\./,
      ),
    ).toBeTruthy()
  })

  it('holds the charge without a request, since an unchecked charge already is on hold', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Put on hold' }))
    expect(screen.getByText(/On hold\. Nothing is added/)).toBeTruthy()
    expect(acceptCalls).toBe(0)
    expect(refuseBody).toBeNull()
  })

  it('claims nothing the server does not do', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    // Accepting records a decision. It does not message the supplier, move the charge onto a
    // bill, or add it to a payment run: the frame's copy said all three.
    expect(screen.getByText(/It is not sent to the supplier from here/)).toBeTruthy()
    // "Received over Peppol" is a true statement about how the document arrived, so the check is
    // for the claim that a DECISION travels that way, not for the word.
    expect(screen.queryByText(/supplier has been told/)).toBeNull()
    expect(screen.queryByText(/sends the supplier your reason/)).toBeNull()
    expect(screen.queryByText(/payment run/)).toBeNull()

    // The controls too, not only the prose around them.
    fireEvent.click(cardButton('Refuse it'))
    expect(screen.getByRole('button', { name: 'Record the refusal' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    expect(screen.getByPlaceholderText('Your reason, in one line')).toBeTruthy()
    for (const label of [/tell them/i, /send the refusal/i, /tell the supplier/i]) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('lists the decisions with their reasons, newest first as the server sends them', async () => {
    decisions = [
      {
        decision: 'REFUSED',
        reason: 'Not in our agreed rates',
        decidedBy: 'u-1',
        decidedAt: '2026-09-20T10:00:00Z',
      },
      { decision: 'ACCEPTED', reason: null, decidedBy: 'u-1', decidedAt: '2026-09-18T09:00:00Z' },
    ]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })

    // The decisions sit in the Activity trail, after the state that stands and before the
    // arrival, in the order the server sent them.
    const entries = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')
    const texts = entries.map((entry) => entry.textContent ?? '')
    const refused = texts.findIndex((text) => text.includes('Not in our agreed rates'))
    const accepted = texts.findIndex((text) => text.startsWith('Accepted'))
    expect(refused).toBeGreaterThan(0)
    expect(accepted).toBeGreaterThan(refused)
  })

  it('offers no decision to someone who may only read', async () => {
    who = READER
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.queryByRole('button', { name: 'Accept it' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuse it' })).toBeNull()
  })
})

// The owner's answers of 8 Oct 2026 for the debit-note list and detail.
describe('a debit note names its bill and who decided', () => {
  const BILL_ID = '90000000-0000-0000-0000-000000000009'
  const linked = {
    billNumber: 'QMS-7781',
    issueDate: '2026-08-20',
    documentUuid: 'x',
    billId: BILL_ID,
  }

  it('links the bill it adds to from the row, as the credit-note row does', async () => {
    notes = [note({ relatesTo: linked })]
    renderList()
    const link = await screen.findByRole('link', { name: 'QMS-7781' })
    expect(link.getAttribute('href')).toBe(`/expenditure/bills/${BILL_ID}`)
  })

  it('opens the bill from "View the bill" on an accepted row', async () => {
    notes = [note({ status: 'ACCEPTED', relatesTo: linked })]
    renderList()
    const view = await screen.findByRole('link', { name: 'View the bill' })
    expect(view.getAttribute('href')).toBe(`/expenditure/bills/${BILL_ID}`)
  })

  it('keeps the bill number as text when the server names no bill on file', async () => {
    notes = [note({ status: 'ACCEPTED' })]
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByText('QMS-7781')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'QMS-7781' })).toBeNull()
    expect(screen.getByRole('link', { name: 'View the bill' }).getAttribute('href')).toBe(
      `/expenditure/debit-notes/${NOTE_ID}`,
    )
  })

  it('links the bill from the detail and reads it by its id', async () => {
    notes = [note({ relatesTo: linked })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    await waitFor(() => expect(calls(`/api/v1/bills/${BILL_ID}`)).toHaveLength(1))
    const links = screen
      .getAllByRole('link', { name: /QMS-7781/ })
      .map((link) => link.getAttribute('href'))
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) expect(href).toBe(`/expenditure/bills/${BILL_ID}`)
  })

  it('says who accepted or refused it on the row', async () => {
    notes = [
      note({ status: 'ACCEPTED', decidedBy: 'u-9', decidedByName: 'Hafidh Saif' }),
      note({
        id: 'other',
        debitNoteNumber: 'QMS-DN-2',
        status: 'REFUSED',
        decidedBy: 'u-9',
        decidedByName: 'Hafidh Saif',
        decisionReason: 'Already charged',
      }),
    ]
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByText('Accepted by Hafidh Saif')).toBeTruthy()
    expect(screen.getByText('Refused by Hafidh Saif')).toBeTruthy()
  })

  it('keeps the row as it was when the server sends no name', async () => {
    notes = [
      note({ status: 'ACCEPTED', decidedBy: 'u-9' }),
      note({
        id: 'other',
        debitNoteNumber: 'QMS-DN-2',
        status: 'REFUSED',
        decidedBy: 'u-9',
        decisionReason: 'Already charged',
      }),
    ]
    renderList()
    await screen.findByText('QMS-DN-1')
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Accepted')).toBeTruthy()
    expect(table.getByText('Refused · Already charged')).toBeTruthy()
    expect(table.queryByText(/ by /)).toBeNull()
  })

  it('says who decided in the Activity line, and what it said before without a name', async () => {
    notes = [
      note({
        status: 'ACCEPTED',
        decidedBy: 'u-9',
        decidedByName: 'Hafidh Saif',
        decidedAt: '2026-09-21T10:00:00Z',
      }),
    ]
    const named = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    const activity = () => within(screen.getByRole('list', { name: 'Activity' }))
    expect(activity().getByText('Accepted by Hafidh Saif')).toBeTruthy()
    named.unmount()

    notes = [
      note({
        status: 'REFUSED',
        decidedBy: 'u-9',
        decidedByName: 'Hafidh Saif',
        decidedAt: '2026-09-21T10:00:00Z',
        decisionReason: 'Already charged',
      }),
    ]
    const refused = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(activity().getByText('Refused by Hafidh Saif')).toBeTruthy()
    refused.unmount()

    notes = [note({ status: 'ACCEPTED', decidedBy: 'u-9', decidedAt: '2026-09-21T10:00:00Z' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(activity().getByText('Accepted')).toBeTruthy()
    expect(activity().queryByText(/ by /)).toBeNull()
  })

  it('says who decided in Arabic', async () => {
    await i18n.changeLanguage('ar')
    notes = [
      note({
        status: 'REFUSED',
        decidedBy: 'u-9',
        decidedByName: 'Hafidh Saif',
        decidedAt: '2026-09-21T10:00:00Z',
        decisionReason: 'Already charged',
      }),
    ]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(
      within(screen.getByRole('list', { name: 'النشاط' })).getByText('رفضه Hafidh Saif'),
    ).toBeTruthy()
  })
})

// Owner, 9 Oct 2026: a refused charge is not added, so "You'd pay" is the bill without it.
describe("a debit note's You'd pay", () => {
  const BILL_ROW: BillRowDto = {
    id: 'b-7781',
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '380',
    supplierBillNumber: 'QMS-7781',
    issueDate: '2026-08-20',
    dueDate: '2026-09-19',
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 300,
    vatAmount: 14.286,
    paidAmount: 0,
    outstandingAmount: 300,
    purchaseOrderReference: null,
    workflowState: 'APPROVED',
    readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
    match: null,
    hold: null,
    paymentRunReference: null,
    paidOnTheSpot: false,
  }

  /** The "You'd pay" tile's figure as seen, and whether it carries the drawn rial sign. */
  const youdPay = async (label: string) => {
    const tile = (await screen.findByText(label)).parentElement!
    await waitFor(() => expect(tile.textContent).toMatch(/\d/))
    const value = tile.children[1]
    const copy = value.cloneNode(true) as Element
    copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    return { text: (copy.textContent ?? '').trim(), rial: value.querySelector('svg') !== null }
  }

  beforeEach(() => {
    billRows = [BILL_ROW]
  })

  it('is the bill without the charge on a refused note', async () => {
    notes = [note({ status: 'REFUSED', decisionReason: 'Already charged' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getByText(/refused$/)).toBeTruthy()
    expect(screen.getByText(/^Nothing was added to what you owe/)).toBeTruthy()
    expect(await youdPay("You'd pay")).toEqual({ text: '300.000', rial: true })
  })

  it('still adds the charge while the note is undecided', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await youdPay("You'd pay")).toEqual({ text: '375.500', rial: true })
  })

  it('reads in Arabic on a refused note', async () => {
    await i18n.changeLanguage('ar')
    notes = [note({ status: 'REFUSED', decisionReason: 'Already charged' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await youdPay('ستدفع')).toEqual({ text: '300.000', rial: true })
  })

  // Browser re-check of 11 Oct 2026 (W-2): with a credit on the bill the tiles read
  // 60.000 + 5.000 = 55.000. Both ends are now what the bill still owes.
  it('adds up once a credit has lowered the bill: what it still owes + the charge', async () => {
    billRows = [{ ...BILL_ROW, totalIncludingVat: 60, outstandingAmount: 50 }]
    notes = [note({ status: 'ACCEPTED', totalIncludingVat: 5, amountDue: 5, outstandingAmount: 5 })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await youdPay('The bill still owes')).toEqual({ text: '50.000', rial: true })
    expect(await youdPay("You'd pay")).toEqual({ text: '55.000', rial: true })
    expect(screen.queryByText('They billed')).toBeNull()
  })

  it('keeps "They billed" while nothing has lowered the bill', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await youdPay('They billed')).toEqual({ text: '300.000', rial: true })
    expect(screen.queryByText('The bill still owes')).toBeNull()
  })

  it('says what the bill still owes in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billRows = [{ ...BILL_ROW, totalIncludingVat: 60, outstandingAmount: 50 }]
    notes = [note({ status: 'ACCEPTED', totalIncludingVat: 5, amountDue: 5, outstandingAmount: 5 })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await youdPay('المتبقي على الفاتورة')).toEqual({ text: '50.000', rial: true })
    expect(await youdPay('ستدفع')).toEqual({ text: '55.000', rial: true })
  })

  // Owner, C9 (12 Oct 2026): with a bill named, the caption never says "No bill yet".
  it('captions You\'d pay "after this note" when a bill is named but no date is known', async () => {
    billRows = [{ ...BILL_ROW, dueDate: null }]
    notes = [note({ dueDate: null })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    const tile = (await screen.findByText("You'd pay")).parentElement!
    await waitFor(() => expect(tile.textContent).toContain('after this note'))
    expect(tile.textContent).not.toContain('No bill yet')
  })

  it('captions You\'d pay "after this note" when the named bill is not on file', async () => {
    billRows = null
    notes = [note({ dueDate: null })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    const tile = (await screen.findByText("You'd pay")).parentElement!
    expect(tile.textContent).toContain('after this note')
    expect(tile.textContent).not.toContain('No bill yet')
  })

  it('keeps "No bill yet" under You\'d pay when no bill is named', async () => {
    notes = [note({ dueDate: null, relatesTo: null })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    const tile = (await screen.findByText("You'd pay")).parentElement!
    expect(tile.textContent).toContain('No bill yet')
    expect(tile.textContent).not.toContain('after this note')
  })

  it('keeps the due date under You\'d pay when the bill has one', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    const tile = (await screen.findByText("You'd pay")).parentElement!
    await waitFor(() => expect(tile.textContent).toContain('due 19 Sept 2026'))
  })

  it('captions You\'d pay "after this note" in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billRows = [{ ...BILL_ROW, dueDate: null }]
    notes = [note({ dueDate: null })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    const tile = (await screen.findByText('ستدفع')).parentElement!
    await waitFor(() => expect(tile.textContent).toContain('بعد هذا الإشعار'))
  })

  // Owner, D2 (12 Oct 2026): a bill without a due date reads "no due date", never "· due".
  it('says the linked bill has no due date rather than "due" with nothing after it', async () => {
    billRows = [{ ...BILL_ROW, dueDate: null }]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await screen.findByText('Received 20 Aug 2026 · Approved · no due date')).toBeTruthy()
    expect(screen.queryByText(/· due\s*$/)).toBeNull()
  })

  it('keeps the due date on the linked bill when it has one', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(
      await screen.findByText('Received 20 Aug 2026 · Approved · due 19 Sept 2026'),
    ).toBeTruthy()
  })

  it('drops "Received" from the linked bill when it has no received date', async () => {
    billRows = [{ ...BILL_ROW, issueDate: null, dueDate: null }]
    const view = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await screen.findByText('Approved · no due date')).toBeTruthy()
    expect(screen.queryByText(/^Received\s+·/)).toBeNull()
    view.unmount()

    billRows = [{ ...BILL_ROW, issueDate: null }]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await screen.findByText('Approved · due 19 Sept 2026')).toBeTruthy()
  })

  it('says the linked bill has no due date in Arabic', async () => {
    await i18n.changeLanguage('ar')
    billRows = [{ ...BILL_ROW, issueDate: null, dueDate: null }]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await screen.findByText('معتمدة · بلا تاريخ استحقاق')).toBeTruthy()
  })

  it('works the tiles out on one basis', () => {
    const bill = { totalIncludingVat: 60, outstandingAmount: 50 }
    expect(debitEffect(bill, 5, false)).toEqual({ billed: 50, reduced: true, willPay: 55 })
    expect(debitEffect(bill, 5, true)).toEqual({ billed: 50, reduced: true, willPay: 50 })
    expect(debitEffect({ totalIncludingVat: 60, outstandingAmount: 60 }, 0.1, false)).toEqual({
      billed: 60,
      reduced: false,
      willPay: 60.1,
    })
    expect(debitEffect(null, 5, false)).toEqual({ billed: null, reduced: false, willPay: null })
  })
})

// Owner's answer C9 (8 Oct 2026): someone without invoice.approve is offered no decision.
describe('a debit note for someone who may only read', () => {
  it('offers no "Accept or refuse" on the row', async () => {
    who = READER
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.queryByRole('link', { name: 'Accept or refuse' })).toBeNull()
    // The note itself still opens.
    expect(screen.getByRole('link', { name: 'QMS-DN-1' })).toBeTruthy()
  })

  it("offers no decision on the detail, whatever the note's state", async () => {
    who = READER
    for (const status of ['UNCHECKED', 'ACCEPTED', 'REFUSED'] as const) {
      notes = [note({ status })]
      const view = renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
      expect(screen.queryByRole('button', { name: 'Accept it' }), status).toBeNull()
      expect(screen.queryByRole('button', { name: 'Refuse it' }), status).toBeNull()
      view.unmount()
    }
  })
})

describe('the end-to-end check of 10 Oct 2026', () => {
  const PAYER: Entitlements = {
    ...APPROVER,
    permissions: ['invoice.read', 'invoice.approve', 'invoice.payment.manage'],
  }

  // F-20: a Viewer saw "Upload a debit note"; Credit notes hides its Upload.
  it('draws Upload a debit note only for someone who may record one, hidden for a reader', async () => {
    who = READER
    const view = renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.queryByRole('link', { name: 'Upload a debit note' })).toBeNull()
    expect(screen.queryByText('Upload a debit note')).toBeNull()
    view.unmount()

    who = PAYER
    forgetEntitlements()
    renderList()
    expect(await screen.findByRole('link', { name: 'Upload a debit note' })).toBeTruthy()
  })

  // F-24: the list said "Rejected" where every other screen says "Refused".
  it('calls refused notes Refused on the list, in both languages', async () => {
    const view = renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByRole('tab', { name: /^Refused/ })).toBeTruthy()
    expect(screen.getByText('Refused this year')).toBeTruthy()
    expect(screen.queryByText(/Rejected/)).toBeNull()
    view.unmount()

    await i18n.changeLanguage('ar')
    renderList()
    await screen.findByText('QMS-DN-1')
    expect(screen.getByRole('tab', { name: /^مرفوضة/ })).toBeTruthy()
  })

  // F-15: "The charge was accepted and is owed, due ." with no date.
  it('drops the due clause of an accepted note that has no due date', async () => {
    notes = [note({ status: 'ACCEPTED', dueDate: null })]
    renderDetail()
    expect(await screen.findByText('The charge was accepted and is owed.')).toBeTruthy()
    expect(screen.queryByText(/due \./)).toBeNull()
  })

  it('keeps the due date when the note has one', async () => {
    notes = [note({ status: 'ACCEPTED' })]
    renderDetail()
    expect(await screen.findByText(/^The charge was accepted and is owed, due \d/)).toBeTruthy()
  })

  // F-21: the Activity listed one refusal twice, "Refused by Eman Admin" and "Refused".
  it('lists the decision the note stands on once in its Activity', async () => {
    notes = [
      note({
        status: 'REFUSED',
        decidedBy: 'u-9',
        decidedByName: 'Eman Admin',
        decidedAt: '2026-10-10T00:20:00Z',
        decisionReason: 'Already charged',
      }),
    ]
    decisions = [
      {
        decision: 'REFUSED',
        reason: 'Already charged',
        decidedBy: 'u-9',
        decidedAt: '2026-10-10T00:20:00Z',
      },
      { decision: 'ACCEPTED', reason: null, decidedBy: 'u-9', decidedAt: '2026-10-09T10:00:00Z' },
    ]
    renderDetail()
    const activity = await screen.findByRole('list', { name: 'Activity' })
    await waitFor(() => expect(within(activity).getByText('Refused by Eman Admin')).toBeTruthy())
    await waitFor(() => expect(activity.textContent).toMatch(/Accepted/))
    expect(within(activity).queryAllByText(/^Refused$/)).toHaveLength(0)
  })
})

const HOLD = i18n.t('supplierDebitNotes.detail.hold', { lng: 'en' })

// Backend #804: accepting a held copy is refused until its duplicate check is decided; refusing
// it is a separate decision the server still takes.
describe('a debit note held as a possible duplicate', () => {
  it('offers Refuse and not Accept, says why, and leads to its duplicate check', async () => {
    notes = [note({ heldAsDuplicate: true })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getAllByText('Held as duplicate').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Accept it' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Refuse it' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/You can still refuse it\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open the duplicate check' })).toBeTruthy()
    // Held already: no person hold on top, and the chip wears the waiting tone, not a refusal's.
    expect(screen.queryByRole('button', { name: HOLD })).toBeNull()
    const chip = screen.getAllByText('Held as duplicate')[0].closest('span')!
    expect(chip.className).toContain('bg-pending-100')
    expect(chip.className).not.toContain('bg-danger-100')
  })

  it('does not advise looking closer before accepting a held note it cannot accept', async () => {
    // No bill on file for the number it names: one check to look at.
    notes = [note({ heldAsDuplicate: true })]
    billRows = []
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(await screen.findByText('Read the points marked Check, then decide.')).toBeTruthy()
    expect(screen.queryByText('Read the points marked Check before you accept the charge.')).toBeNull()
  })

  it('keeps Hold and the advice on a note that is not held', async () => {
    notes = [note()]
    billRows = []
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getAllByRole('button', { name: HOLD }).length).toBeGreaterThan(0)
    expect(await screen.findByText('Read the points marked Check before you accept the charge.')).toBeTruthy()
  })

  it('drops "You can still refuse it" once the held note is refused, and keeps the rest', async () => {
    notes = [note({ heldAsDuplicate: true, status: 'REFUSED', decisionReason: 'Already charged' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(
      screen.getByText(
        "Held as a possible duplicate: it can't be accepted until the duplicate check on its bill record is decided.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/You can still refuse it/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Open the duplicate check' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept it' })).toBeNull()
  })

  it('still offers Accept on a note not held, and on one from a server that does not say', async () => {
    notes = [note({ heldAsDuplicate: false })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    expect(screen.getAllByRole('button', { name: 'Accept it' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Held as duplicate')).toBeNull()
  })

  it('says why accepting is refused when the note became held after it was read, and reads it again', async () => {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes(`/debit-notes/${NOTE_ID}/accept`)) {
        acceptCalls += 1
        // The re-read finds it held.
        notes = [note({ heldAsDuplicate: true })]
        return json(409, {
          type: 'https://api.fawtir.om/problems/resource-conflict',
          error: 'DEBIT_NOTE_HELD_AS_DUPLICATE',
          detail: 'English detail never shown',
        })
      }
      return base(input, init)
    })
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-DN-1' })
    fireEvent.click(cardButton('Accept it'))
    expect(
      await screen.findByText(
        "This debit note is held as a possible duplicate, so it can't be accepted yet. Decide the duplicate check on its bill first.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText('English detail never shown')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept it' })).toBeNull())
    expect(acceptCalls).toBe(1)
    expect(calls(`/api/v1/debit-notes/${NOTE_ID}`).filter((url) => !url.includes('/decisions')).length).toBeGreaterThan(1)
  })

  it('shows the held chip in the list, with the way to its duplicate check', async () => {
    notes = [note({ heldAsDuplicate: true })]
    renderList()
    await screen.findByText('QMS-DN-1')
    const chip = screen.getByText('Held as duplicate').parentElement!
    expect(chip.className).toContain('bg-pending-100')
    expect(screen.queryByText('Nobody has checked it')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the duplicate check' }).getAttribute('href')).toBe(
      `/expenditure/bills/${NOTE_ID}`,
    )
    expect(screen.queryByRole('link', { name: 'Accept or refuse' })).toBeNull()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    notes = [note({ heldAsDuplicate: true })]
    renderDetail()
    expect((await screen.findAllByText('محجوز كنسخة مكررة')).length).toBeGreaterThan(0)
  })
})

describe("the debit note's check on its bill (B-12)", () => {
  const BILL: BillRowDto = {
    id: 'b-1',
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '380',
    supplierBillNumber: 'QMS-7781',
    issueDate: '2026-08-20',
    dueDate: '2026-09-19',
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 300,
    vatAmount: 14.286,
    paidAmount: 0,
    outstandingAmount: 0,
    purchaseOrderReference: null,
    workflowState: 'PAID',
    readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
    match: null,
    hold: null,
    paymentRunReference: null,
    paidOnTheSpot: false,
  }
  const fmt = {
    money: (value: number) => value.toFixed(3),
    date: (iso: string) => iso,
    when: (iso: string) => iso,
  }
  const realBill = (bill: BillRowDto) =>
    debitNoteChecks(note(), bill, fmt).find((check) => check.id === 'realBill')?.detailKey

  it('says a bill a credit cleared is settled by credit, not paid in full', () => {
    expect(realBill(BILL)).toBe('supplierDebitNotes.checks.realBillSettledByCredit')
    expect(realBill({ ...BILL, paidAmount: 300 })).toBe('supplierDebitNotes.checks.realBillPaid')
    expect(realBill({ ...BILL, outstandingAmount: 20, workflowState: 'APPROVED' })).toBe(
      'supplierDebitNotes.checks.realBillOpen',
    )
  })
})

describe("the debit note's VAT check (B-13)", () => {
  const fmt = {
    money: (value: number) => value.toFixed(3),
    date: (iso: string) => iso,
    when: (iso: string) => iso,
  }
  const vatCheck = (totalIncludingVat: number, vatAmount: number) =>
    debitNoteChecks(note({ totalIncludingVat, vatAmount }), null, fmt).find((check) => check.id === 'vat')!

  it('passes a two-decimal VAT within the server tolerance of 0.005', () => {
    // 11,175.444 includes 532.164 of 5% VAT; the supplier stated 532.16 (PINT allows two decimals).
    expect(vatCheck(11175.444, 532.16)).toMatchObject({
      titleKey: 'supplierDebitNotes.checks.vatAddsUp',
      verdict: 'fine',
    })
    expect(vatCheck(11175.444, 532.164).verdict).toBe('fine')
  })

  it('still flags a VAT further off than the tolerance, saying the figure it expected', () => {
    expect(vatCheck(11175.444, 532.15)).toMatchObject({
      titleKey: 'supplierDebitNotes.checks.vatOdd',
      verdict: 'check',
      values: { vat: '532.150', expected: '532.164' },
    })
  })
})

describe("the debit note's VAT check at the tolerance's edge (B-13 review)", () => {
  const fmt = {
    money: (value: number) => value.toFixed(3),
    date: (iso: string) => iso,
    when: (iso: string) => iso,
  }
  const verdict = (vatAmount: number) =>
    debitNoteChecks(note({ totalIncludingVat: 11175.444, vatAmount }), null, fmt).find(
      (check) => check.id === 'vat',
    )!.verdict

  it('passes 0.005 OMR off the expected 532.164 and flags 0.006', () => {
    expect(verdict(532.159)).toBe('fine')
    expect(verdict(532.169)).toBe('fine')
    expect(verdict(532.158)).toBe('check')
    expect(verdict(532.17)).toBe('check')
  })
})

describe('a debit note that names a credit note (DB-9)', () => {
  const fmt = {
    money: (value: number) => value.toFixed(3),
    date: (iso: string) => iso,
    when: (iso: string) => iso,
  }
  const target = (documentTypeCode: string): BillRowDto => ({
    id: 'b-cn',
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode,
    supplierBillNumber: 'DPB1-CN-1',
    issueDate: '2026-10-20',
    dueDate: null,
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 10.5,
    vatAmount: 0.5,
    paidAmount: 0,
    outstandingAmount: 0,
    purchaseOrderReference: null,
    workflowState: 'PAID',
    readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
    match: null,
    hold: null,
    paymentRunReference: null,
    paidOnTheSpot: false,
  })

  it.each(['381', '261'])('says it points at a credit note (%s) and asks for a look', (code) => {
    const check = debitNoteChecks(note(), target(code), fmt).find((entry) => entry.id === 'realBill')!
    expect(check).toMatchObject({
      titleKey: 'supplierDebitNotes.checks.creditNoteTarget',
      detailKey: 'supplierDebitNotes.checks.creditNoteTargetDetail',
      verdict: 'check',
    })
  })

  it('still says a real bill for an invoice', () => {
    expect(
      debitNoteChecks(note(), target('380'), fmt).find((entry) => entry.id === 'realBill')!.titleKey,
    ).toBe('supplierDebitNotes.checks.realBill')
  })
})
