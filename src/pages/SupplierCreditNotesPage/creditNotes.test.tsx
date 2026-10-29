import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { CreditNoteRowDto, CreditNoteSummaryDto } from '../../api/expenditure/notes'
import { creditRowActionOf, toCreditNoteItem } from '../../lib/supplierNoteList'
import { vatEffect } from '../../lib/supplierCreditNotes'
import { SupplierCreditNotesPage } from './SupplierCreditNotesPage'
import { SupplierCreditNoteDetailPage } from '../SupplierCreditNoteDetailPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/credit-notes/summary'
const NOTE_ID = '70000000-0000-0000-0000-000000000001'
const BILL_ID = '70000000-0000-0000-0000-000000000002'
const OTHER_BILL_ID = '70000000-0000-0000-0000-000000000003'
const SETTLED_BILL_ID = '70000000-0000-0000-0000-000000000004'
const DEBIT_BILL_ID = '70000000-0000-0000-0000-000000000005'
/** A supplier record's id, as the server's are. */
const NIZWA = '5d000000-0000-4000-8000-000000000002'

/** A row of our own supplier's, to vary one field at a time. */
const OURS = {
  source: 'UPLOADED' as const,
  supplierId: 's-1',
  supplierName: 'Qalhat Marine Supplies',
  documentTypeCode: '380',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  overdue: false,
  currencyCode: 'OMR',
  totalIncludingVat: 300,
  vatAmount: 15,
  paidAmount: 0,
  outstandingAmount: 300,
  purchaseOrderReference: null,
  workflowState: 'APPROVED' as const,
  readiness: { state: 'READY' as const, distinctApprovals: 1, required: 1, autoApproved: false },
  match: null,
  hold: null,
  paymentRunReference: null,
  paidOnTheSpot: false,
}

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'bill.settle'],
  scopes: [],
  featureFlags: {},
}

const READER: Entitlements = { ...ADMIN, permissions: ['invoice.read'] }
// RL-4: the Accountant records a supplier credit note (capture) and does not settle it; the
// Finance Manager does (`bill.settle`).
const ACCOUNTANT: Entitlements = {
  ...ADMIN,
  username: 'accountant',
  roles: [{ id: 'r-2', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage'],
}
const FINANCE_MANAGER: Entitlements = {
  ...ADMIN,
  username: 'finance',
  roles: [{ id: 'r-3', code: 'FINANCE_MANAGER', name: 'Finance Manager', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'bill.settle'],
}

const SUMMARY: CreditNoteSummaryDto = {
  currencyCode: 'OMR',
  usableCount: 3,
  usableCredit: 420.5,
  recoveredThisQuarterCount: 2,
  recoveredThisQuarter: 180,
  topSupplier: { supplierId: 's-1', supplierName: 'Qalhat Marine Supplies', noteCount: 4 },
  excludedFromTotals: 1,
  tabs: { all: 5, unapplied: 3, waitingForBill: 0, applied: 1, refunded: 1 },
}

function note(overrides: Partial<CreditNoteRowDto> = {}): CreditNoteRowDto {
  return {
    id: NOTE_ID,
    inboundDeliveryId: null,
    source: 'PEPPOL',
    networkVerified: true,
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    supplierParticipantId: '0248:1234567890',
    documentTypeCode: '381',
    creditNoteNumber: 'QMS-CN-1',
    issueDate: '2026-09-01',
    currencyCode: 'OMR',
    taxCurrencyCode: null,
    creditedAmount: 200,
    vatAmount: 9.524,
    reasonCode: 'CL02-RETURN',
    approval: 'NONE',
    status: 'UNAPPLIED',
    balance: { applied: 0, refunded: 0, remaining: 200 },
    credits: {
      billNumber: null,
      issueDate: null,
      documentUuid: null,
      billId: null,
      applied: false,
    },
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
let notes: CreditNoteRowDto[]
let settlements: unknown[]
let applyBody: unknown
let applyRefusal: Record<string, unknown> | null
let refundBody: unknown
let refundRefusal: Record<string, unknown> | null
let downloads: string[]
/** `GET /bills/{BILL_ID}` as a detail, when a test needs the bill a note names read directly. */
let billDetail: unknown
/** `GET /suppliers/s-1/overview`, when a test needs the supplier panel's figures. */
let overview: unknown

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  notes = [note()]
  settlements = []
  applyBody = null
  applyRefusal = null
  refundBody = null
  refundRefusal = null
  downloads = []
  billDetail = null
  overview = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    if (overview !== null && url.includes('/suppliers/s-1/overview')) return json(200, overview)
    // Narrowed by a search or a supplier, the summary counts its tabs over what is left.
    if (url.startsWith(`${SUMMARY_URL}?`))
      return json(200, {
        ...SUMMARY,
        tabs: { all: 1, unapplied: 1, waitingForBill: 0, applied: 0, refunded: 0 },
      })
    if (url.startsWith(SUMMARY_URL)) return json(200, SUMMARY)
    if (url.includes('/inbound-invoices/') || url.includes('/bills/intake/')) {
      downloads.push(url)
      return new Response('<CreditNote/>', { status: 200 })
    }
    if (url.includes(`/credit-notes/${NOTE_ID}/settlements`)) return json(200, settlements)
    if (url.includes(`/credit-notes/${NOTE_ID}/apply`)) {
      applyBody = JSON.parse(String(init?.body))
      if (applyRefusal !== null) {
        return new Response(
          JSON.stringify({
            ...applyRefusal,
            status: 400,
            type: 'https://api.fawtir.om/problems/expenditure-refused',
          }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }
      return json(200, {
        settlement: {},
        status: 'APPLIED',
        balance: { applied: 200, refunded: 0, remaining: 0 },
      })
    }
    if (url.includes(`/credit-notes/${NOTE_ID}/refund`)) {
      refundBody = JSON.parse(String(init?.body))
      if (refundRefusal !== null) {
        return new Response(
          JSON.stringify({
            ...refundRefusal,
            status: 400,
            type: 'https://api.fawtir.om/problems/expenditure-refused',
          }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }
      return json(200, {
        settlement: {},
        status: 'REFUNDED',
        balance: { applied: 0, refunded: 200, remaining: 0 },
      })
    }
    if (url.includes(`/credit-notes/${NOTE_ID}`)) return json(200, notes[0])
    if (url.includes('/credit-notes')) {
      return json(200, {
        items: notes,
        page: 0,
        pageSize: 20,
        count: notes.length,
        total: notes.length,
      })
    }
    if (billDetail !== null && url.includes(`/bills/${BILL_ID}`)) return json(200, billDetail)
    if (url.includes('/bills')) {
      return json(200, {
        items: [
          {
            id: BILL_ID,
            source: 'PEPPOL',
            supplierId: 's-1',
            supplierName: 'Qalhat Marine Supplies',
            documentTypeCode: '380',
            supplierBillNumber: 'QMS-7781',
            issueDate: '2026-09-01',
            dueDate: '2026-10-01',
            overdue: false,
            currencyCode: 'OMR',
            totalIncludingVat: 1000,
            vatAmount: 50,
            paidAmount: 0,
            outstandingAmount: 1000,
            purchaseOrderReference: null,
            workflowState: 'APPROVED',
            readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
            match: null,
            hold: null,
            paymentRunReference: null,
            paidOnTheSpot: false,
          },
          // A bill from a DIFFERENT supplier, which the server's own guard would refuse. The
          // list endpoint takes no supplier parameter, so one arrives here and the screen is
          // what has to keep it out of the picker.
          {
            id: OTHER_BILL_ID,
            source: 'UPLOADED',
            supplierId: 's-2',
            supplierName: 'Browser Check Trading',
            documentTypeCode: '380',
            supplierBillNumber: 'BCT-0001',
            issueDate: '2026-09-02',
            dueDate: '2026-10-02',
            overdue: false,
            currencyCode: 'OMR',
            totalIncludingVat: 500,
            vatAmount: 25,
            paidAmount: 0,
            outstandingAmount: 500,
            purchaseOrderReference: null,
            workflowState: 'APPROVED',
            readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
            match: null,
            hold: null,
            paymentRunReference: null,
            paidOnTheSpot: false,
          },
          // Our supplier, but nothing is owed ON a credit note, so it is not a target.
          {
            ...OURS,
            id: NOTE_ID,
            documentTypeCode: '381',
            supplierBillNumber: 'QMS-CN-1',
            outstandingAmount: 0,
          },
          // Our supplier, already settled: the server would compute nothing to apply.
          {
            ...OURS,
            id: SETTLED_BILL_ID,
            supplierBillNumber: 'QMS-PAID',
            paidAmount: 300,
            outstandingAmount: 0,
          },
          // Our supplier's DEBIT note: it ADDS to what is owed, so a credit may reduce it.
          {
            ...OURS,
            id: DEBIT_BILL_ID,
            documentTypeCode: '383',
            supplierBillNumber: 'QMS-DN-9',
            outstandingAmount: 60,
          },
        ],
        page: 0,
        pageSize: 25,
        count: 5,
        total: 5,
      })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderList(path = '/expenditure/credit-notes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/credit-notes" element={<SupplierCreditNotesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/expenditure/credit-notes/${NOTE_ID}`]}>
      <Routes>
        <Route path="/expenditure/credit-notes/:id" element={<SupplierCreditNoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The decision card's "Set against the bill" opens the bill search (the frame's primary action). */
async function openApply() {
  await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Set against the bill' })[0])
  return screen.getByLabelText('Which bill')
}

describe('Credit notes list, wired to the API', () => {
  it('shows the summary figures and the rows the API returned', async () => {
    renderList()
    expect(await screen.findByText('QMS-CN-1')).toBeTruthy()
    expect(screen.getByText('420.500')).toBeTruthy()
    expect(screen.getByText('180.000')).toBeTruthy()
    // Twice, and both are wanted: the supplier who sent the most notes is a card of its own,
    // and the same name is on the row.
    expect(screen.getAllByText('Qalhat Marine Supplies')).toHaveLength(2)
    expect(screen.getByText('200.000')).toBeTruthy()
    // The frame's chip on an unused note, scoped to the table.
    expect(within(screen.getByRole('table')).getByText('Not yet used')).toBeTruthy()
    // Excluded rows are said out loud rather than quietly dropped from the totals.
    expect(screen.getByText(/not counted above/)).toBeTruthy()
  })

  // Owner, 12 Oct 2026 (C3): a partly used note still has credit to use, so the tile counts
  // notes with credit left rather than notes "not yet set against a bill".
  it('counts the notes with credit left to use under the tile, in both languages', async () => {
    renderList()
    expect(await screen.findByText('3 notes with credit left to use')).toBeTruthy()
    expect(screen.queryByText(/not yet set against a bill/)).toBeNull()

    await i18n.changeLanguage('ar')
    expect(
      await screen.findByText('3 إشعارات دائنة فيها رصيد متبقٍ للاستخدام'),
    ).toBeTruthy()
  })

  it('says the tile count in the singular for one note, and in every Arabic plural form', async () => {
    const meta = (count: number, lng: string) =>
      i18n.t('supplierCreditNotes.kpi.stillUsableMeta', { count, lng })
    expect(meta(1, 'en')).toBe('1 note with credit left to use')
    expect(meta(2, 'en')).toBe('2 notes with credit left to use')
    expect(meta(0, 'ar')).toBe('لا إشعارات دائنة فيها رصيد متبقٍ للاستخدام')
    expect(meta(1, 'ar')).toBe('إشعار دائن واحد فيه رصيد متبقٍ للاستخدام')
    expect(meta(2, 'ar')).toBe('إشعاران دائنان فيهما رصيد متبقٍ للاستخدام')
    expect(meta(5, 'ar')).toBe('5 إشعارات دائنة فيها رصيد متبقٍ للاستخدام')
    expect(meta(11, 'ar')).toBe('11 إشعارًا دائنًا فيه رصيد متبقٍ للاستخدام')
    expect(meta(100, 'ar')).toBe('100 إشعار دائن فيه رصيد متبقٍ للاستخدام')
  })

  it('draws the frame: three tabs, a search box, Filters and Sort, and a row menu', async () => {
    renderList()
    await screen.findByText('QMS-CN-1')
    // Every tab carries the summary's count for it, as the frame draws (All 5 · Used 1 · Refunded 1).
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'All5',
        'Used1',
        'Refunded1',
      ]),
    )
    expect(screen.getByLabelText('Search supplier, bill number...')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Filters/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Sort/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Credit note actions' })).toBeTruthy()
  })

  it('asks the server for the tab rather than filtering a page in the browser', async () => {
    renderList()
    await screen.findByText('QMS-CN-1')
    expect(calls('/api/v1/credit-notes?')).toEqual([
      '/api/v1/credit-notes?status=ALL&page=0&page_size=20',
    ])

    fireEvent.click(screen.getByRole('tab', { name: /^Refunded/ }))
    await waitFor(() =>
      expect(calls('/api/v1/credit-notes?').at(-1)).toBe(
        '/api/v1/credit-notes?status=REFUNDED&page=0&page_size=20',
      ),
    )
  })

  it('reaches the credit nobody has used yet from the highlighted card, as a server filter', async () => {
    renderList()
    await screen.findByText('QMS-CN-1')
    fireEvent.click(screen.getByRole('link', { name: /Credit you can still use/ }))
    await waitFor(() =>
      expect(calls('/api/v1/credit-notes?').at(-1)).toBe(
        '/api/v1/credit-notes?status=UNAPPLIED&page=0&page_size=20',
      ),
    )
    // The strip shows the filter so it can be cleared.
    expect(screen.getByRole('tab', { name: /Not used yet/ })).toBeTruthy()
  })

  it('sends the search to the server once typing pauses, and counts the tabs over it', async () => {
    renderList()
    await screen.findByText('QMS-CN-1')
    fireEvent.change(screen.getByLabelText('Search supplier, bill number...'), {
      target: { value: '  nizwa ' },
    })
    await waitFor(() =>
      expect(calls('/api/v1/credit-notes?').at(-1)).toBe(
        '/api/v1/credit-notes?status=ALL&q=nizwa&page=0&page_size=20',
      ),
    )
    expect(calls(`${SUMMARY_URL}?`)).toEqual([`${SUMMARY_URL}?q=nizwa`])
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'All1',
        'Used0',
        'Refunded0',
      ]),
    )
    // The cards describe the whole ledger, so they stay as they were.
    expect(screen.getByText('420.500')).toBeTruthy()
  })

  it('filters by the supplier record and sorts on the server', async () => {
    notes = [
      note(),
      note({
        id: 'other',
        creditNoteNumber: 'NDT-CN-2',
        supplierId: NIZWA,
        supplierName: 'Nizwa Dates Trading',
      }),
    ]
    renderList()
    await screen.findByText('NDT-CN-2')

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Nizwa Dates Trading' }))
    await waitFor(() =>
      expect(calls('/api/v1/credit-notes?').at(-1)).toBe(
        `/api/v1/credit-notes?status=ALL&supplier_id=${NIZWA}&page=0&page_size=20`,
      ),
    )
    expect(calls(`${SUMMARY_URL}?`)).toEqual([`${SUMMARY_URL}?supplier_id=${NIZWA}`])

    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Amount: high to low' }))
    await waitFor(() =>
      expect(calls('/api/v1/credit-notes?').at(-1)).toBe(
        `/api/v1/credit-notes?status=ALL&supplier_id=${NIZWA}&sort=AMOUNT_HIGHEST&page=0&page_size=20`,
      ),
    )
  })

  it('ignores an old link whose supplier was a name, rather than sending it as supplier_id', async () => {
    renderList('/expenditure/credit-notes?supplier=Nizwa%20Dates%20Trading')
    await screen.findByText('QMS-CN-1')
    expect(calls('/api/v1/credit-notes?')).toEqual([
      '/api/v1/credit-notes?status=ALL&page=0&page_size=20',
    ])
    expect(calls(`${SUMMARY_URL}?`)).toEqual([])
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeTruthy()
  })

  it('says when the note arrived, and downloads an uploaded note from its upload', async () => {
    notes = [
      note({
        source: 'UPLOADED',
        receivedAt: '2026-09-03T21:30:00Z',
        intakeId: 'intake-1',
      }),
    ]
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    )
    renderList()
    await screen.findByText('QMS-CN-1')
    // An instant read in Muscat: 21:30 UTC on the 3rd is the 4th there.
    expect(screen.getByText(/^Arrived 4 Sep/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Credit note actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Download/ }))
    await waitFor(() => expect(downloads).toEqual(['/api/v1/bills/intake/intake-1/file']))
  })

  it('links a credit to its bill only when one bill actually carries it', async () => {
    // The server derives `applied` from `billId`; a note reducing none or several names none.
    expect(toCreditNoteItem(note()).againstBillId).toBeNull()
    expect(
      toCreditNoteItem(
        note({
          credits: {
            billNumber: 'QMS-7781',
            issueDate: null,
            documentUuid: null,
            billId: BILL_ID,
            applied: true,
          },
        }),
      ).againstBillId,
    ).toBe(BILL_ID)

    renderList()
    await screen.findByText('QMS-CN-1')
    expect(screen.getByText('No bill yet')).toBeTruthy()
  })

  it('sets the credit against its bill from the row when the server already names the bill', async () => {
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    renderList()
    await screen.findByText('QMS-CN-1')
    fireEvent.click(
      within(screen.getByRole('table')).getByRole('button', { name: 'Set against the bill' }),
    )
    await waitFor(() => expect(applyBody).toEqual({ billId: BILL_ID, amount: null }))
  })

  it('says why the bill cannot take the credit when the row action is refused', async () => {
    applyRefusal = { error: 'CREDIT_NOTE_TARGET_ON_HOLD', trace_id: 'trace-3' }
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    renderList()
    await screen.findByText('QMS-CN-1')
    fireEvent.click(
      within(screen.getByRole('table')).getByRole('button', { name: 'Set against the bill' }),
    )
    expect(
      await screen.findByText(
        /^This bill is on hold\. Release it before setting a credit against it\. Reference: trace-3$/,
      ),
    ).toBeTruthy()
  })

  // Owner's answer 7 (6 Oct): an action the reader may not take is hidden, not greyed out.
  // E2E 10 Oct, F-2: the partly used note's row read "Not yet used" with "Set against the bill".
  it('shows a partly used note as partly used, and opens it rather than setting it again', async () => {
    notes = [
      note({
        status: 'UNAPPLIED',
        balance: { applied: 150, refunded: 0, remaining: 50 },
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: true,
        },
      }),
    ]
    renderList()
    const row = (await screen.findByRole('link', { name: 'QMS-CN-1' })).closest('tr')!
    expect(within(row).getByText('Partly used')).toBeTruthy()
    expect(within(row).queryByText('Not yet used')).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(within(row).getByRole('link', { name: /Open the note/ })).toBeTruthy()
  })

  it('shows Upload and Set against to someone who may settle a credit', async () => {
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    renderList()
    await screen.findByText('QMS-CN-1')
    // The constraint and the capability: someone who may settle sees both.
    expect(screen.getByRole('link', { name: 'Upload a credit note' })).toBeTruthy()
    expect(
      within(screen.getByRole('table')).getByRole('button', { name: 'Set against the bill' }),
    ).toBeTruthy()
  })

  it('shows an Accountant Upload and no Set against', async () => {
    who = ACCOUNTANT
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    renderList()
    await screen.findByText('QMS-CN-1')
    expect(screen.getByRole('link', { name: 'Upload a credit note' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(applyBody).toBeNull()
  })

  it('shows a Finance Manager Set against from the row', async () => {
    who = FINANCE_MANAGER
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    renderList()
    await screen.findByText('QMS-CN-1')
    expect(
      within(screen.getByRole('table')).getByRole('button', { name: 'Set against the bill' }),
    ).toBeTruthy()
  })

  it('draws no Upload and no Set against for a reader, not even disabled ones', async () => {
    who = READER
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    renderList()
    await screen.findByText('QMS-CN-1')
    expect(screen.queryByRole('link', { name: 'Upload a credit note' })).toBeNull()
    expect(screen.queryByText('Upload a credit note')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(screen.queryByText('Set against the bill')).toBeNull()
    // The note itself still opens from its number.
    expect(screen.getByRole('link', { name: 'QMS-CN-1' })).toBeTruthy()
    expect(applyBody).toBeNull()
  })

  it('offers no Download in the row menu for a note with no file, for anyone', async () => {
    renderList()
    await screen.findByText('QMS-CN-1')
    fireEvent.click(screen.getByRole('button', { name: 'Credit note actions' }))
    expect(screen.getByRole('menuitem', { name: /Open the note/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Download/ })).toBeNull()
    expect(screen.queryByText('Download the file')).toBeNull()
  })

  it('still offers a reader the Download of a note that has a file', async () => {
    who = READER
    notes = [note({ inboundDeliveryId: 'delivery-1' })]
    renderList()
    await screen.findByText('QMS-CN-1')
    fireEvent.click(screen.getByRole('button', { name: 'Credit note actions' }))
    expect(screen.getByRole('menuitem', { name: /Download/ })).toBeTruthy()
  })
})

/** What a reader sees: the rial sign's hidden "OMR" left out, spaces as one. */
function visibleText(element: Element) {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** The effect banner's sentence, once the bill it names has been read. */
async function heroSaying(start: RegExp) {
  return waitFor(() => {
    const hero = screen
      .getAllByRole('heading', { level: 2 })
      .find((heading) => start.test(visibleText(heading)))
    expect(hero).toBeTruthy()
    return hero!
  })
}

/** A note that took `applied` off the bill it names, which still owes `outstanding`. */
function appliedTo(bill: Record<string, unknown>, applied = 10.5) {
  notes = [
    note({
      creditedAmount: applied,
      status: 'APPLIED',
      balance: { applied, refunded: 0, remaining: 0 },
      credits: {
        billNumber: String(bill.supplierBillNumber),
        issueDate: '2026-09-01',
        documentUuid: null,
        billId: BILL_ID,
        applied: true,
      },
    }),
  ]
  billDetail = { bill: { ...OURS, id: BILL_ID, ...bill }, lines: [] }
}

describe('One credit note', () => {
  it('draws the frame: title chips, the effect banner, the side cards and the activity trail', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.getByText('Credit note · Peppol')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /of credit to use/ })).toBeTruthy()
    expect(screen.getByText('They billed')).toBeTruthy()
    expect(screen.getByText("Why they've credited you")).toBeTruthy()
    expect(screen.getByText('Your decision')).toBeTruthy()
    expect(screen.getByText('Effect on your VAT')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Compliance' })).toBeTruthy()
    expect(screen.getByText('Passed PINT-OM validation')).toBeTruthy()
    expect(
      within(screen.getByRole('list', { name: 'Activity' })).getByText(
        'Waiting to be set against the bill',
      ),
    ).toBeTruthy()
  })

  // Owner, 6 Oct: the frame's "still shows the full OMR 933.900" is a designer's slip. The line
  // names no figure, so no "OMR" can reach the screen from it.
  it('says the bill still shows its full amount without printing "OMR"', async () => {
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: null,
          documentUuid: null,
          billId: null,
          applied: false,
        },
      }),
    ]
    renderDetail()
    const activity = await screen.findByRole('list', { name: 'Activity' })
    expect(
      within(activity).getByText('Until it is, QMS-7781 still shows its full amount'),
    ).toBeTruthy()
    expect(activity.textContent).not.toMatch(/OMR\s*\d/)
  })

  // Wording fixes 12 Oct (C7): the credit comes off a bill still to be paid, so the hero says
  // "You'll pay less" until the bill is paid, and only then "You paid less". Both with the sign.
  it.each([
    ['en', 'still unpaid', 39.5, "You'll pay 10.500 less"],
    ['en', 'paid', 0, 'You paid 10.500 less'],
    ['ar', 'still unpaid', 39.5, 'ستدفع أقل بمقدار 10.500'],
    ['ar', 'paid', 0, 'دفعتَ أقل بمقدار 10.500'],
  ] as const)(
    'says what the credit does to a bill (%s, %s) with the rial sign, never "OMR"',
    async (language, _state, outstanding, sentence) => {
      await i18n.changeLanguage(language)
      appliedTo({
        supplierBillNumber: 'QMS-7781',
        totalIncludingVat: 50,
        paidAmount: outstanding > 0 ? 0 : 39.5,
        outstandingAmount: outstanding,
        workflowState: outstanding > 0 ? 'APPROVED' : 'PAID',
      })
      renderDetail()
      const hero = await heroSaying(new RegExp(`^${sentence.split(' 10.500')[0]}`))
      expect(visibleText(hero)).toBe(sentence)
      expect(hero.querySelector('svg')).not.toBeNull()
      expect(visibleText(hero)).not.toMatch(/OMR|ر\.ع/)
    },
  )

  // Wording fixes 12 Oct (C6): a refused debit note was never owed, so its credit only closes it.
  it.each([
    ['en', 'Closes refused debit note QMS-DN-9.', 'Nothing was owed on it.'],
    ['ar', 'يُغلق إشعار المدين المرفوض QMS-DN-9.', 'لم يكن عليه أي مبلغ مستحق.'],
  ] as const)(
    'says a credit closing a refused debit note only closes it (%s)',
    async (language, title, body) => {
      await i18n.changeLanguage(language)
      appliedTo({
        supplierBillNumber: 'QMS-DN-9',
        documentTypeCode: '383',
        debitNoteDecision: 'REFUSED',
        totalIncludingVat: 10.5,
        paidAmount: 0,
        outstandingAmount: 0,
        workflowState: 'PAID',
      })
      renderDetail()
      const hero = await heroSaying(new RegExp(`^${title.split(' ')[0]}`))
      expect(visibleText(hero)).toBe(title)
      expect(screen.getByText(body)).toBeTruthy()
      expect(screen.queryByText(/You paid|came off what you owed|دفعتَ/)).toBeNull()
    },
  )

  // Wording fixes 12 Oct (C8): a held bill refuses the credit, so the panel says release it first.
  it.each([
    ['en', 'QMS-7781 is on hold. Release it before setting this credit against it.'],
    ['ar', 'QMS-7781 قيد الانتظار. أفرِج عنها قبل خصم هذا الرصيد منها.'],
  ] as const)(
    'says the bill is on hold before offering to set the credit (%s)',
    async (language, text) => {
      await i18n.changeLanguage(language)
      notes = [
        note({
          credits: {
            billNumber: 'QMS-7781',
            issueDate: '2026-09-01',
            documentUuid: null,
            billId: BILL_ID,
            applied: false,
          },
        }),
      ]
      billDetail = {
        bill: {
          ...OURS,
          id: BILL_ID,
          supplierBillNumber: 'QMS-7781',
          workflowState: 'ON_HOLD',
          hold: { reason: 'Goods damaged', openedAt: '2026-10-11T08:00:00Z' },
        },
        lines: [],
      }
      renderDetail()
      expect(await screen.findByText(text)).toBeTruthy()
      expect(screen.queryByText(/clears the mismatch|يزيل الاختلاف/)).toBeNull()
    },
  )

  it('still says setting it releases the bill when the bill is not on hold', async () => {
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    billDetail = { bill: { ...OURS, id: BILL_ID, supplierBillNumber: 'QMS-7781' }, lines: [] }
    renderDetail()
    expect(
      await screen.findByText(
        'Setting it against QMS-7781 clears the mismatch and releases the bill for approval.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/is on hold/)).toBeNull()
  })

  // Wording fixes 12 Oct (C9): with a bill named, the You'll pay tile never says "No bill yet".
  it.each([
    ['en', 'after this note'],
    ['ar', 'بعد هذا الإشعار'],
  ] as const)(
    "captions You'll pay \"after this note\" when a bill is named (%s)",
    async (language, caption) => {
      await i18n.changeLanguage(language)
      notes = [
        note({
          credits: {
            billNumber: 'QMS-7781',
            issueDate: '2026-09-01',
            documentUuid: null,
            billId: BILL_ID,
            applied: false,
          },
        }),
      ]
      // No due date, nothing paid yet: the two captions that come first have nothing to say.
      billDetail = {
        bill: { ...OURS, id: BILL_ID, supplierBillNumber: 'QMS-7781', dueDate: null },
        lines: [],
      }
      renderDetail()
      const label = language === 'en' ? "You'll pay" : 'ستدفع'
      await waitFor(() =>
        expect(screen.getByText(label).parentElement?.textContent).toContain(caption),
      )
      expect(screen.getByText(label).parentElement?.textContent).not.toMatch(
        /No bill yet|لا فاتورة بعد/,
      )
    },
  )

  it("keeps \"No bill yet\" under You'll pay when no bill is named", async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    const tile = screen.getByText("You'll pay").parentElement!
    expect(tile.textContent).toContain('No bill yet')
    expect(tile.textContent).not.toContain('after this note')
  })

  // Wording fixes 12 Oct (C13): the supplier panel counts the supplier's credit notes.
  const SUPPLIER_OVERVIEW = {
    tabs: { bills: 9, payments: 3, orders: 2, documents: 1, openBills: 2 },
    match: { agreed: 0, orderBacked: 0, summary: null },
    usualLeadTimeDays: null,
    payables: {
      currencyCode: 'OMR',
      notDue: { amount: 300, bills: 2, nextDue: null },
      dueSoon: { amount: 0, bills: 0, nextDue: null },
      late: { amount: 0, bills: 0, nextDue: null },
      onHold: { amount: 0, bills: 0, nextDue: null },
      everLate: false,
      total: 300,
    },
  }
  const creditNotesRow = () =>
    screen.getByText('Credit notes', { selector: 'dt' }).nextElementSibling?.textContent

  it("counts the supplier's credit notes in the supplier panel", async () => {
    overview = { ...SUPPLIER_OVERVIEW, tabs: { ...SUPPLIER_OVERVIEW.tabs, creditNotes: 6 } }
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    await waitFor(() => expect(creditNotesRow()).toBe('6'))
    expect(calls('/api/v1/suppliers/s-1/overview')).toHaveLength(1)
  })

  it('shows "—" for the credit notes only when the server sends no count', async () => {
    overview = SUPPLIER_OVERVIEW
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    // The overview has answered (the open bills are drawn) and still has no count.
    await waitFor(() =>
      expect(
        screen.getByText('Open bills', { selector: 'dt' }).nextElementSibling?.textContent,
      ).toContain('2'),
    )
    expect(creditNotesRow()).toBe('—')
  })

  // Owner, 12 Oct 2026 (C11): the trail names the bill the credit went to, from the settlement's
  // `billNumber`; an older server that leaves it out keeps "Used against a bill".
  it('names the bill each use of the credit went to, and keeps the old words without one', async () => {
    const settlement = (id: string, amount: number, extra: Record<string, unknown>) => ({
      id,
      creditNoteId: NOTE_ID,
      billId: BILL_ID,
      kind: 'APPLIED',
      amount,
      paymentReference: null,
      settledOn: '2026-09-05',
      actorId: 'u-1',
      occurredAt: `2026-09-05T0${id.length}:00:00Z`,
      ...extra,
    })
    notes = [note({ balance: { applied: 30, refunded: 0, remaining: 170 } })]
    settlements = [
      settlement('st-new', 20, { billNumber: 'QMS-7781', billDocumentTypeCode: '380' }),
      settlement('st-old-server', 10, {}),
    ]
    renderDetail()
    const activity = await screen.findByRole('list', { name: 'Activity' })
    const named = await within(activity).findByText('Used against QMS-7781')
    // The amount stays on the line under it, with the rial sign.
    const detail = named.nextElementSibling as HTMLElement
    expect(detail.querySelector('svg')).not.toBeNull()
    const shown = detail.cloneNode(true) as Element
    shown.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    expect(shown.textContent).toMatch(/^\s*20\.000 on /)
    expect(within(activity).getByText('Used against a bill')).toBeTruthy()

    await i18n.changeLanguage('ar')
    expect(await within(activity).findByText('استُخدم مقابل QMS-7781')).toBeTruthy()
  })

  it('offers no target the guard would refuse: not itself, not a credit note, not a settled bill', async () => {
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    expect(await screen.findByRole('button', { name: /QMS-7781/ })).toBeTruthy()

    // Nothing is owed ON a credit note, and a settled bill would compute an amount of zero.
    expect(screen.queryByRole('button', { name: /QMS-CN-1/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /QMS-PAID/ })).toBeNull()

    // But a DEBIT note is a legitimate target: it adds to what is owed, and the server allows it.
    // The constraint and the capability, or a picker that offered nothing would pass this too.
    expect(screen.getByRole('button', { name: /QMS-DN-9/ })).toBeTruthy()
  })

  it('asks the server to narrow to this supplier rather than filtering a page it was handed', async () => {
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    await waitFor(() => expect(calls('/api/v1/bills').at(-1)).toContain('supplier_id=s-1'))
  })

  it('shows the server refusal by name when one gets through, never "try again"', async () => {
    applyRefusal = { error: 'CREDIT_NOTE_SUPPLIER_MISMATCH', trace_id: 'trace-9' }
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))

    expect(
      await screen.findByText(/A credit can only reduce a bill from the supplier who issued it/),
    ).toBeTruthy()
    expect(screen.queryByText(/Please try again/i)).toBeNull()
  })

  it('names the payment run a bill is in when the apply is refused for it, in both languages', async () => {
    applyRefusal = {
      error: 'CREDIT_NOTE_TARGET_IN_PAYMENT_RUN',
      paymentRunReference: 'PR-0007',
      trace_id: 'trace-9',
    }
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))
    expect(
      await screen.findByText(
        /^This bill is in payment run PR-0007, whose bank file is already made\. Keep the credit for another bill\./,
      ),
    ).toBeTruthy()

    // The bill stays chosen; the same press in Arabic says the same in Arabic.
    await i18n.changeLanguage('ar')
    fireEvent.click(await screen.findByRole('button', { name: 'استخدمه' }))
    expect(
      await screen.findByText(
        /^هذه الفاتورة ضمن دفعة السداد PR-0007 وقد أُنشئ ملفها البنكي\. احتفظ بالرصيد لفاتورة أخرى\./,
      ),
    ).toBeTruthy()
  })

  it.each([
    [
      'CREDIT_NOTE_TARGET_REJECTED',
      'This bill was rejected, so a credit cannot be set against it.',
    ],
    [
      'CREDIT_NOTE_TARGET_DEBIT_NOTE_REFUSED',
      'This debit note was refused, so a credit cannot be set against it.',
    ],
    [
      'CREDIT_NOTE_TARGET_CANCELLED',
      'This bill was cancelled, so a credit cannot be set against it.',
    ],
    ['CREDIT_NOTE_TARGET_FULLY_CREDITED', 'This bill is already fully credited.'],
  ])("shows the owner's sentence when the apply is refused with %s", async (code, sentence) => {
    applyRefusal = { error: code }
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))
    expect(await screen.findByText(sentence)).toBeTruthy()
  })

  it("offers only this supplier's bills, because the server refuses any other outright", async () => {
    renderDetail()
    // Both bills come back from the list endpoint; only one can legally take this credit.
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    expect(await screen.findByRole('button', { name: /QMS-7781/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /BCT-0001/ })).toBeNull()
  })

  it('names the supplier when nothing matches, so an empty list does not read as a broken search', async () => {
    notes = [note({ supplierId: 's-9', supplierName: 'Nobody Else LLC' })]
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    expect(await screen.findByText(/No bills from Nobody Else LLC match that/)).toBeTruthy()
  })

  it('shows all four figures of the balance, so a refunded note still adds up', async () => {
    notes = [note({ creditedAmount: 52.5, balance: { applied: 0, refunded: 12.5, remaining: 40 } })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })

    // 52.500 credited = 0.000 applied + 12.500 refunded + 40.000 left. Drop the refund and the
    // three that remain contradict each other.
    expect(screen.getAllByText('52.500').length).toBeGreaterThan(0)
    expect(screen.getByText('Refunded so far')).toBeTruthy()
    expect(screen.getByText('12.500')).toBeTruthy()
    expect(screen.getAllByText('40.000').length).toBeGreaterThan(0)
  })

  it('applies the credit to a bill the reader picked, and sends the amount they typed', async () => {
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'QMS' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.change(screen.getByLabelText('Amount (optional)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))

    await waitFor(() => expect(applyBody).toEqual({ billId: BILL_ID, amount: 150 }))
  })

  it('sends no amount when none was typed, so the server takes the largest that fits', async () => {
    renderDetail()
    fireEvent.change(await openApply(), { target: { value: 'QMS' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))

    await waitFor(() => expect(applyBody).toEqual({ billId: BILL_ID, amount: null }))
  })

  /**
   * Flake log 24 Oct: between 00:00 and 01:00 in Pakistan the browser's date is already a day ahead
   * of Muscat's. The calendar's "Today" picked the browser's day, which the refund date's "no day
   * after today" limit (Muscat's day) refused. Pinned there, so these tests hold at any hour and
   * on any machine: 2026-10-23T19:30Z is 00:30 on the 24th in Karachi, 23:30 on the 23rd in Muscat.
   */
  const MUSCAT_DAY = '2026-10-23'
  const atKarachiPastMidnight = () => {
    const zone = process.env.TZ
    process.env.TZ = 'Asia/Karachi'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T19:30:00Z'))
    return () => {
      vi.useRealTimers()
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
  }

  it('refuses to send more than the note has left, and never asks the server', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a refund' }))

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } })
    fireEvent.click(screen.getByLabelText('Paid on'))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    expect(screen.getByRole('alert').textContent).toContain('200.000')
    // With the rial sign before it (E2E 10 Oct, F-14).
    expect(screen.getByRole('alert').querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Record the refund' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(refundBody).toBeNull()
  })

  it('records a refund with its date and reference', async () => {
    onTestFinished(atKarachiPastMidnight())
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a refund' }))

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '200' } })
    // The date is picked on the frame's calendar field, not typed: today, so the day is known.
    fireEvent.click(screen.getByLabelText('Paid on'))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    fireEvent.change(screen.getByLabelText('Payment reference (optional)'), {
      target: { value: 'TRF-9' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record the refund' }))

    // Muscat's day, not the browser's.
    await waitFor(() =>
      expect(refundBody).toEqual({ amount: 200, paidOn: MUSCAT_DAY, paymentReference: 'TRF-9' }),
    )
  })

  // Wording fixes 12 Oct (C12): as on Record payment and Mark as paid, no day after today.
  it('offers no day after today for the refund date', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a refund' }))
    fireEvent.click(screen.getByLabelText('Paid on'))
    fireEvent.click(await screen.findByRole('button', { name: 'Next month' }))
    const fifteenth = screen.getAllByRole('button', { name: '15' })
    expect(fifteenth.length).toBeGreaterThan(0)
    for (const day of fifteenth) expect((day as HTMLButtonElement).disabled).toBe(true)
  })

  it.each([
    [
      'CREDIT_NOTE_REFUND_DATE_IN_FUTURE',
      'The refund date cannot be in the future.',
      'لا يمكن أن يكون تاريخ الاسترداد في المستقبل.',
    ],
    [
      'CREDIT_NOTE_REFUND_DATE_BEFORE_NOTE',
      "The refund date cannot be before the credit note's date.",
      'لا يمكن أن يكون تاريخ الاسترداد قبل تاريخ الإشعار الدائن.',
    ],
  ])(
    'says why a refund date was refused (%s), in both languages',
    async (code, english, arabic) => {
      onTestFinished(atKarachiPastMidnight())
      refundRefusal = { error: code, trace_id: 'trace-5' }
      renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
      fireEvent.click(screen.getByRole('button', { name: 'Ask for a refund' }))
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
      fireEvent.click(screen.getByLabelText('Paid on'))
      fireEvent.click(screen.getByRole('button', { name: 'Today' }))
      fireEvent.click(screen.getByRole('button', { name: 'Record the refund' }))
      expect(await screen.findByText(`${english} Reference: trace-5`)).toBeTruthy()

      await i18n.changeLanguage('ar')
      fireEvent.click(await screen.findByRole('button', { name: 'سجّل الاسترداد' }))
      expect(await screen.findByText(new RegExp(`^${arabic}`))).toBeTruthy()
    },
  )

  it('keeps the credit without a request, since an unapplied note already is held credit', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Keep as credit' }))
    expect(screen.getByText(/Kept as credit against Qalhat Marine Supplies/)).toBeTruthy()
    expect(applyBody).toBeNull()
    expect(refundBody).toBeNull()
  })

  // Owner's answer 6 (6 Oct): Keep as credit saves nothing, says so, and can be undone.
  it('keeps as credit with no request to the server, says so, and Undo brings the choices back', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    const before = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Keep as credit' }))

    expect(
      screen.getByText(
        'Kept as credit against Qalhat Marine Supplies. Nothing changes until you set it against a bill.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask for a refund' })).toBeNull()
    // Nothing was written: no request of any kind went out for it.
    expect(fetchMock.mock.calls.slice(before)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Keep as credit' })).toBeTruthy()
    expect(screen.queryByText(/Kept as credit against/)).toBeNull()
    expect(fetchMock.mock.calls.slice(before)).toEqual([])
  })

  it('draws no hold button on a credit note', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.queryByRole('button', { name: /hold/i })).toBeNull()
  })

  it('offers an Accountant no way to apply or refund the credit', async () => {
    who = ACCOUNTANT
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask for a refund' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
  })

  it('offers a Finance Manager the ways to apply or refund the credit', async () => {
    who = FINANCE_MANAGER
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.getAllByRole('button', { name: 'Set against the bill' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Ask for a refund' })).toBeTruthy()
  })

  it('offers no disposition to someone who may only read', async () => {
    who = READER
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })

    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask for a refund' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record the refund' })).toBeNull()
  })

  it('draws no Keep as credit for a reader either, and no disabled copies of any of them', async () => {
    who = READER
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
    expect(screen.queryByText('Set against the bill')).toBeNull()
    expect(screen.queryByText('Ask for a refund')).toBeNull()
    expect(screen.queryByText('Keep as credit')).toBeNull()
  })

  it('draws no Download for a note with no file, rather than a greyed one', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    expect(downloads).toEqual([])
  })

  it('offers a reader the Download of a note that has a file', async () => {
    who = READER
    notes = [note({ inboundDeliveryId: 'delivery-1' })]
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    )
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(downloads).toEqual(['/api/v1/inbound-invoices/delivery-1/document']))
  })

  // E2E 10 Oct, F-1: a used note showed They billed 50.000 − 10.500 = You'll pay 29.000.
  it("takes the credit off once: You'll pay is what the bill still owes after it", async () => {
    notes = [
      note({
        creditedAmount: 10.5,
        status: 'APPLIED',
        balance: { applied: 10.5, refunded: 0, remaining: 0 },
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: true,
        },
      }),
    ]
    billDetail = {
      bill: {
        ...OURS,
        id: BILL_ID,
        supplierBillNumber: 'QMS-7781',
        totalIncludingVat: 50,
        paidAmount: 0,
        outstandingAmount: 39.5,
        dueDate: null,
      },
      lines: [],
    }
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    const tile = await waitFor(() => {
      const label = screen.getByText("You'll pay")
      expect(label.parentElement?.textContent).toContain('39.500')
      return label.parentElement!
    })
    expect(tile.textContent).not.toContain('29.000')
    // What the bill still owes under it, with the rial sign (F-14).
    const owed = within(tile).getByText(
      (_, element) =>
        element?.tagName === 'P' && /39\.500 still unpaid$/.test(element.textContent ?? ''),
    )
    expect(owed.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('This credit').parentElement?.textContent).toContain('10.500')
  })

  // E2E 10 Oct, F-2: a 31.500 note on a 20.000 bill, 20.000 used and 5.000 refunded, still read
  // "Not yet used" and offered the bill it had already cleared.
  it('calls a partly used note partly used, and never offers the bill it already cleared', async () => {
    notes = [
      note({
        creditedAmount: 31.5,
        status: 'UNAPPLIED',
        usage: 'PARTLY_USED',
        balance: { applied: 20, refunded: 5, remaining: 6.5 },
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: true,
        },
      }),
    ]
    billDetail = {
      bill: {
        ...OURS,
        id: BILL_ID,
        supplierBillNumber: 'QMS-7781',
        totalIncludingVat: 20,
        paidAmount: 0,
        outstandingAmount: 0,
      },
      lines: [],
    }
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    await waitFor(() =>
      expect(screen.getByText("You'll pay").parentElement?.textContent).toContain('0.000'),
    )

    expect(screen.getAllByText('Partly used').length).toBeGreaterThan(0)
    expect(screen.queryByText('Not yet used')).toBeNull()
    expect(screen.queryByText(/has already been paid/)).toBeNull()
    expect(screen.getByText(/Part of this credit is already used or refunded/)).toBeTruthy()
    const activity = screen.getByRole('list', { name: 'Activity' })
    expect(within(activity).queryByText('Waiting to be set against the bill')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'Set against a bill' })[0])
    // A search for another bill, not the one it cleared already chosen.
    expect(screen.getByLabelText('Which bill')).toBeTruthy()
    expect(screen.queryByText(/Applying to/)).toBeNull()
  })

  it('reads the state from the balance whatever status word the server sends', () => {
    expect(
      toCreditNoteItem(
        note({ status: 'UNAPPLIED', balance: { applied: 20, refunded: 0, remaining: 5 } }),
      ).status,
    ).toBe('PARTLY_USED')
    expect(
      toCreditNoteItem(
        note({ status: 'UNAPPLIED', balance: { applied: 20, refunded: 5, remaining: 0 } }),
      ).status,
    ).toBe('APPLIED')
    expect(
      toCreditNoteItem(
        note({
          status: 'PARTLY_APPLIED' as CreditNoteRowDto['status'],
          balance: { applied: 20, refunded: 0, remaining: 5 },
        }),
      ).status,
    ).toBe('PARTLY_USED')
    expect(toCreditNoteItem(note()).status).toBe('UNAPPLIED')
  })

  // Backend #477: `usage` says how much has gone, beside a status that says whether any is left.
  it("takes the server's usage first, and the balance only without it", () => {
    const left = { applied: 20, refunded: 0, remaining: 5 }
    expect(toCreditNoteItem(note({ usage: 'PARTLY_USED', balance: left })).status).toBe(
      'PARTLY_USED',
    )
    expect(
      toCreditNoteItem(
        note({
          usage: 'FULLY_USED',
          status: 'REFUNDED',
          balance: { applied: 0, refunded: 200, remaining: 0 },
        }),
      ).status,
    ).toBe('REFUNDED')
    expect(toCreditNoteItem(note({ usage: 'NOT_USED' })).status).toBe('UNAPPLIED')
    expect(toCreditNoteItem(note({ usage: 'NOT_USED', status: 'WAITING_FOR_BILL' })).status).toBe(
      'WAITING_FOR_BILL',
    )
    expect(toCreditNoteItem(note({ usage: null, balance: left })).status).toBe('PARTLY_USED')
  })

  it('offers nothing to dispose of once the credit is spent', async () => {
    notes = [note({ status: 'APPLIED', balance: { applied: 200, refunded: 0, remaining: 0 } })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })

    expect(screen.getByText(/Nothing is left to dispose of/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
  })

  it('labels the three figures as figures, not as the sentence an action answers with', async () => {
    // The success notice for an apply and the label above the "used so far" figure once shared
    // a key, so the card read "The credit was used against that bill." where a heading belonged.
    notes = [note({ balance: { applied: 50, refunded: 25, remaining: 125 } })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })

    expect(screen.getByText('Credited')).toBeTruthy()
    expect(screen.getByText('Used so far')).toBeTruthy()
    expect(screen.getByText('Left to use')).toBeTruthy()
    expect(screen.queryByText(/The credit was used against/)).toBeNull()
    expect(screen.getAllByText('125.000').length).toBeGreaterThan(0)
  })

  it('says a linked bill reduces it automatically when the history is empty', async () => {
    notes = [
      note({
        status: 'APPLIED',
        balance: { applied: 200, refunded: 0, remaining: 0 },
        credits: {
          billNumber: 'QMS-7781',
          issueDate: null,
          documentUuid: null,
          billId: BILL_ID,
          applied: true,
        },
      }),
    ]
    renderDetail()
    expect(await screen.findByText(/reduces it automatically/)).toBeTruthy()
  })

  // Owner, D2 (12 Oct 2026): a bill without a due date reads "no due date", never "· due".
  it('says the linked bill has no due date rather than "due" with nothing after it', async () => {
    notes = [
      note({
        credits: {
          billNumber: 'QMS-7781',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    billDetail = {
      bill: { ...OURS, id: BILL_ID, supplierBillNumber: 'QMS-7781', dueDate: null },
      lines: [],
    }
    const view = renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(await screen.findByText('Received 1 Sept 2026 · Approved · no due date')).toBeTruthy()
    expect(screen.queryByText(/· due\s*$/)).toBeNull()
    view.unmount()

    await i18n.changeLanguage('ar')
    billDetail = {
      bill: {
        ...OURS,
        id: BILL_ID,
        supplierBillNumber: 'QMS-7781',
        issueDate: null,
        dueDate: null,
      },
      lines: [],
    }
    renderDetail()
    expect(await screen.findByText('معتمدة · بلا تاريخ استحقاق')).toBeTruthy()
  })

  it('shows a reason code as the code when nothing names it', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.getAllByText('CL02-RETURN').length).toBeGreaterThan(0)
    expect(screen.getByText('Reason code CL02-RETURN')).toBeTruthy()
  })

  it('prints the words given with the note as its reason, the CL-02-OM code under them', async () => {
    notes = [note({ reasonCode: 'QTY', reasonDetail: 'Three boxes short. Credited in full.' })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.getAllByText('Three boxes short. Credited in full.').length).toBeGreaterThan(0)
    expect(screen.getByText(/^QTY · /)).toBeTruthy()
  })

  it('downloads an uploaded note from its upload when the bill read gives no file', async () => {
    notes = [note({ source: 'UPLOADED', networkVerified: false, intakeId: 'intake-1' })]
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    )
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(downloads).toEqual(['/api/v1/bills/intake/intake-1/file']))
  })
})

// Owner, 9 Oct 2026 (E1): set against a debit note on upload, the note's page says what was done,
// once, in the page's own notice.
describe('arriving from the upload', () => {
  /** The history entry's state, as a reload or a step back would find it. */
  function StateProbe() {
    const location = useLocation()
    return <output data-testid="state">{JSON.stringify(location.state)}</output>
  }

  const arrive = (saved: { key: string; values?: Record<string, string> }) =>
    render(
      <MemoryRouter
        initialEntries={[{ pathname: `/expenditure/credit-notes/${NOTE_ID}`, state: { saved } }]}
      >
        <Routes>
          <Route
            path="/expenditure/credit-notes/:id"
            element={
              <>
                <SupplierCreditNoteDetailPage />
                <StateProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

  it('says it was set against the debit note, then forgets it', async () => {
    arrive({ key: 'supplierCreditNotes.upload.savedAppliedDebitNote' })
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.getByText('Saved and set against the debit note.')).toBeTruthy()
    // Cleared at once, so a reload or coming back to the page does not say it again.
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('null'))
    const said = screen.getByText('Saved and set against the debit note.')
    // The page's own notice: the same card its other "done" sentences use.
    const notice = said.closest('[role=alert]') as HTMLElement
    fireEvent.click(within(notice).getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Saved and set against the debit note.')).toBeNull()
  })

  it('names the refused debit note the credit closes, in both languages', async () => {
    const saved = {
      key: 'supplierCreditNotes.upload.savedClosesRefusedDebitNote',
      values: { note: 'MR-DN-0007' },
    }
    const english = arrive(saved)
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(
      screen.getByText(
        'Saved. The credit closes refused debit note MR-DN-0007; anything left over stays as credit.',
      ),
    ).toBeTruthy()
    english.unmount()

    await i18n.changeLanguage('ar')
    arrive(saved)
    expect(
      await screen.findByText(
        'حُفظ. يُغلق هذا الرصيد الإشعار المدين المرفوض MR-DN-0007، وما يزيد يبقى رصيدًا.',
      ),
    ).toBeTruthy()
  })

  it('says nothing when opened without one', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.queryByText(/^Saved/)).toBeNull()
  })
})

// Browser re-check of 11 Oct 2026 (C-7): the brand is «فوتر», with no vowel mark.
// Owner, 12 Oct 2026: a credit note on a bill out of input VAT (a refused debit note, a rejected
// bill) is left out with it, so the card claims nothing on the bill and takes nothing off.
describe("a credit note's Effect on your VAT", () => {
  /** The figure beside a label in the VAT card, without the screen-reader currency word. */
  const vatRow = async (label: string) => {
    const value = (await screen.findByText(label)).nextElementSibling!
    await waitFor(() => expect(value.textContent).toMatch(/\d|—/))
    const copy = value.cloneNode(true) as Element
    copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    return (copy.textContent ?? '').trim()
  }

  const onBill = (bill: Record<string, unknown>) => {
    notes = [
      note({
        credits: {
          billNumber: 'QMS-DN-1',
          issueDate: '2026-09-01',
          documentUuid: null,
          billId: BILL_ID,
          applied: false,
        },
      }),
    ]
    billDetail = { bill: { ...OURS, id: BILL_ID, supplierBillNumber: 'QMS-DN-1', ...bill }, lines: [] }
  }

  it('claims nothing and reduces nothing when the bill it closes is not counted', async () => {
    onBill({
      documentTypeCode: '383',
      debitNoteDecision: 'REFUSED',
      inputVat: {
        counted: false,
        countedOn: null,
        reason: 'DEBIT_NOTE_NOT_ACCEPTED',
        vatAmountOmr: null,
      },
    })
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    await waitFor(() => expect(calls(`/api/v1/bills/${BILL_ID}`).length).toBeGreaterThan(0))
    await waitFor(async () => expect(await vatRow('Input VAT claimed on the bill')).toBe('—'))
    expect(await vatRow('Reduced by this note')).toBe('−0.000')
    expect(await vatRow('Reclaimable amount')).toBe('—')
  })

  it('reads as before on a counted bill', async () => {
    onBill({
      inputVat: { counted: true, countedOn: '2026-09-02', reason: 'COUNTED', vatAmountOmr: 15 },
    })
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    await waitFor(async () => expect(await vatRow('Input VAT claimed on the bill')).toBe('15.000'))
    expect(await vatRow('Reduced by this note')).toBe('−9.524')
    expect(await vatRow('Reclaimable amount')).toBe('5.476')
  })

  it('works the figures out from whether the bill is counted', () => {
    // A server before `inputVat` (undefined) and a counted bill read the same as before.
    for (const counted of [undefined, true]) {
      const effect = vatEffect(15, 9.524, counted)
      expect(effect.claimed).toBe(15)
      expect(effect.reduced).toBe(9.524)
      expect(effect.reclaimable).toBeCloseTo(5.476, 3)
    }
    expect(vatEffect(15, 9.524, false)).toEqual({ claimed: null, reduced: 0, reclaimable: null })
  })
})

describe("the credit notes' VAT notes in Arabic", () => {
  it('write the brand as «فوتر»', () => {
    const ar = i18n.getFixedT('ar')
    for (const key of ['supplierCreditNotes.detail.vatNote', 'supplierCreditNotes.upload.vatNote']) {
      expect(ar(key)).toContain('فوتر')
      expect(ar(key)).not.toContain('فوتِر')
    }
  })
})

// Business Rules PL-8: recording a supplier's note needs a plan with supplier notes; the notes
// recorded before stay listed and readable.
describe('a plan without supplier notes (PL-8)', () => {
  it('keeps the list and hides Upload', async () => {
    who = { ...ADMIN, planFeaturesEnforced: true, planFeatures: { supplierNotes: false } }
    notes = [note({})]
    renderList()
    await screen.findByText('QMS-CN-1')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Upload a credit note' })).toBeNull(),
    )
  })

  it('offers Upload when the plan has supplier notes', async () => {
    who = { ...ADMIN, planFeaturesEnforced: true, planFeatures: { supplierNotes: true } }
    notes = [note({})]
    renderList()
    await screen.findByText('QMS-CN-1')
    expect(screen.getByRole('link', { name: 'Upload a credit note' })).toBeTruthy()
  })
})

// Backend #784: a later Peppol copy held as a duplicate keeps an UNAPPLIED status, but `/apply`
// and `/refund` refuse it (409 CREDIT_NOTE_HELD_AS_DUPLICATE), so nothing may offer either.
describe('A credit note held as a duplicate', () => {
  const HELD_ID = '70000000-0000-0000-0000-000000000009'
  const namedBill = {
    billNumber: 'QMS-7781',
    issueDate: '2026-09-01',
    documentUuid: null,
    billId: BILL_ID,
    applied: false,
  }

  it('carries the flag, and leaves a held note out of usable credit', () => {
    const held = toCreditNoteItem(note({ heldAsDuplicate: true }))
    expect(held.heldAsDuplicate).toBe(true)
    expect(held.usable).toBe(false)
    expect(held.status).toBe('UNAPPLIED')

    const normal = toCreditNoteItem(note({ heldAsDuplicate: false }))
    expect(normal.heldAsDuplicate).toBe(false)
    expect(normal.usable).toBe(true)
  })

  it('reads a row from a server that does not send the flag as not held', () => {
    const row = note()
    delete row.heldAsDuplicate
    const item = toCreditNoteItem(row)
    expect(item.heldAsDuplicate).toBe(false)
    expect(item.usable).toBe(true)
  })

  it('opens a held note from its row instead of setting it against the bill', () => {
    expect(creditRowActionOf({ status: 'UNAPPLIED', heldAsDuplicate: true })).toEqual({
      labelKey: 'supplierCreditNotes.actions.openNote',
      goesTo: 'note',
    })
    expect(creditRowActionOf({ status: 'UNAPPLIED', heldAsDuplicate: false })).toEqual({
      labelKey: 'supplierCreditNotes.actions.setAgainst',
      primary: true,
      goesTo: 'note',
    })
  })

  it('offers Set against on the normal row and only Open the note on the held one', async () => {
    notes = [
      note({ credits: namedBill }),
      note({
        id: HELD_ID,
        creditNoteNumber: 'QMS-CN-1-COPY',
        heldAsDuplicate: true,
        credits: namedBill,
      }),
    ]
    renderList()
    const normalRow = (await screen.findByRole('link', { name: 'QMS-CN-1' })).closest('tr')!
    const heldRow = screen.getByRole('link', { name: 'QMS-CN-1-COPY' }).closest('tr')!

    expect(within(normalRow).getByRole('button', { name: 'Set against the bill' })).toBeTruthy()
    expect(within(heldRow).queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    const open = within(heldRow).getByRole('link', { name: /Open the note/ })
    expect(open.getAttribute('href')).toBe(`/expenditure/credit-notes/${HELD_ID}`)
  })

  it('opens a held note waiting for its bill, and keeps a spent state its own action', () => {
    expect(creditRowActionOf({ status: 'WAITING_FOR_BILL', heldAsDuplicate: true })).toEqual({
      labelKey: 'supplierCreditNotes.actions.openNote',
      goesTo: 'note',
    })
    expect(creditRowActionOf({ status: 'APPLIED', heldAsDuplicate: true })).toEqual({
      labelKey: 'supplierCreditNotes.actions.viewBill',
      goesTo: 'bill',
    })
  })

  it('offers no settlement on a held note waiting for its bill, on its row or its screen', async () => {
    notes = [note({ status: 'WAITING_FOR_BILL', heldAsDuplicate: true })]
    const list = renderList()
    const row = (await screen.findByRole('link', { name: 'QMS-CN-1' })).closest('tr')!
    expect(within(row).getByText('Waiting for a bill')).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(within(row).getByRole('link', { name: /Open the note/ })).toBeTruthy()
    list.unmount()

    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask for a refund' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
  })

  it('offers no way to apply, refund or keep a held note on its own screen', async () => {
    notes = [note({ heldAsDuplicate: true, credits: namedBill })]
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })

    expect(screen.queryByRole('button', { name: 'Set against the bill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask for a refund' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep as credit' })).toBeNull()
    expect(screen.queryByText(/clears the mismatch/)).toBeNull()
  })
})

// Owner's copy, 28 Oct 2026: a held note is named as held, says why it cannot be used, and makes
// no promise that its credit will reduce a bill.
describe("A held duplicate's wording", () => {
  const HELD_ID = '70000000-0000-0000-0000-000000000009'
  const namedBill = {
    billNumber: 'QMS-7781',
    issueDate: '2026-09-01',
    documentUuid: null,
    billId: BILL_ID,
    applied: false,
  }
  const HELD_DECISION =
    "This looks like a copy of a credit note already on file, so it can't be used until the duplicate check is resolved on its bill."
  const HELD_DECISION_AR =
    'يبدو أن هذا الإشعار نسخة من إشعار دائن مسجّل مسبقًا، لذا لا يمكن استخدامه حتى يُحسم فحص التكرار على فاتورته.'
  const HELD_REFUSED =
    "This credit note is held as a possible duplicate, so it can't be used yet. Check its bill first."
  const HELD_REFUSED_AR =
    'هذا الإشعار الدائن محجوز لاحتمال كونه نسخة مكررة، لذا لا يمكن استخدامه حاليًا. يُرجى مراجعة فاتورته أولًا.'

  /** `POST /apply` answers as the server does when it refuses with this problem. */
  function answerApplyWith(status: number, body: Record<string, unknown>) {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      if (url.includes(`/credit-notes/${NOTE_ID}/apply`)) {
        return new Response(JSON.stringify({ status, ...body }), {
          status,
          headers: { 'Content-Type': 'application/problem+json' },
        })
      }
      return base(input, init)
    })
  }

  async function applyFromTheNote() {
    fireEvent.change(await openApply(), { target: { value: 'test' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))
  }

  it.each([
    ['en', 'Held as duplicate', 'Not yet used', 'Waiting for a bill'],
    ['ar', 'محجوز كنسخة مكررة', 'لم يُستخدم بعد', 'بانتظار فاتورة'],
  ] as const)(
    'names a held row as held (%s), in the amber a pending note is drawn in',
    async (language, held, notUsed, waiting) => {
      await i18n.changeLanguage(language)
      notes = [
        note(),
        note({ id: HELD_ID, creditNoteNumber: 'QMS-CN-1-COPY', heldAsDuplicate: true }),
        note({ id: OTHER_BILL_ID, creditNoteNumber: 'QMS-CN-2', status: 'WAITING_FOR_BILL' }),
      ]
      renderList()
      const normalRow = (await screen.findByRole('link', { name: 'QMS-CN-1' })).closest('tr')!
      const heldRow = screen.getByRole('link', { name: 'QMS-CN-1-COPY' }).closest('tr')!
      const waitingRow = screen.getByRole('link', { name: 'QMS-CN-2' }).closest('tr')!

      const heldChip = within(heldRow).getByText(held)
      expect(within(heldRow).queryByText(notUsed)).toBeNull()
      expect(within(normalRow).getByText(notUsed)).toBeTruthy()
      expect(within(normalRow).queryByText(held)).toBeNull()
      // The existing pending tone: the very classes a note waiting for its bill is drawn in.
      expect(heldChip.className).toBe(within(waitingRow).getByText(waiting).className)
      expect(heldChip.className).toContain('bg-pending-100')
      expect(heldChip.className).toContain('text-pending-700')
    },
  )

  it("makes no \"you'd pay less\" promise under a held row's amount, and keeps it on a normal one", async () => {
    notes = [
      note(),
      note({ id: HELD_ID, creditNoteNumber: 'QMS-CN-1-COPY', heldAsDuplicate: true }),
    ]
    renderList()
    const normalRow = (await screen.findByRole('link', { name: 'QMS-CN-1' })).closest('tr')!
    const heldRow = screen.getByRole('link', { name: 'QMS-CN-1-COPY' }).closest('tr')!
    expect(within(normalRow).getByText("you'd pay less")).toBeTruthy()
    expect(within(heldRow).queryByText("you'd pay less")).toBeNull()
  })

  it.each([
    ['en', 'Held as duplicate', 'Not yet used', HELD_DECISION],
    ['ar', 'محجوز كنسخة مكررة', 'لم يُستخدم بعد', HELD_DECISION_AR],
  ] as const)(
    'names a held note as held on its own screen and says why (%s)',
    async (language, held, notUsed, decision) => {
      await i18n.changeLanguage(language)
      notes = [note({ heldAsDuplicate: true })]
      renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
      const chip = screen.getByText(held)
      expect(chip.className).toContain('bg-pending-100')
      expect(chip.className).toContain('text-pending-700')
      expect(screen.queryByText(notUsed)).toBeNull()
      expect(screen.getByText(decision)).toBeTruthy()
    },
  )

  it('keeps a normal note its own chip and decision, with no word of a hold', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
    expect(screen.getByText('Not yet used')).toBeTruthy()
    expect(screen.queryByText('Held as duplicate')).toBeNull()
    expect(screen.queryByText(HELD_DECISION)).toBeNull()
    expect(screen.getByRole('button', { name: 'Keep as credit' })).toBeTruthy()
  })

  // As the server sends a held copy: the supplier's stated bill, resolved to none (it absorbs
  // nothing), so `credits.billId` is null.
  const heldCopy = () =>
    note({ heldAsDuplicate: true, credits: { ...namedBill, billId: null } })

  it("links a held note to its own bill record, where the duplicate check is decided", async () => {
    notes = [heldCopy()]
    // `GET /bills/{noteId}`: the note's own record, which carries its hold.
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      if (url.endsWith(`/bills/${NOTE_ID}`)) {
        return json(200, {
          bill: { ...OURS, id: NOTE_ID, documentTypeCode: '381', supplierBillNumber: 'QMS-CN-1' },
          lines: [],
        })
      }
      return base(input, init)
    })
    renderDetail()
    const decision = (await screen.findByText(HELD_DECISION)).closest('p')!
    const link = await within(decision).findByRole('link', { name: 'View the bill' })
    expect(link.getAttribute('href')).toBe(`/expenditure/bills/${NOTE_ID}`)
    expect(within(decision).queryByRole('link', { name: /QMS-7781/ })).toBeNull()
  })

  it('offers no link while the note has no bill record to open', async () => {
    notes = [heldCopy()]
    renderDetail()
    const decision = (await screen.findByText(HELD_DECISION)).closest('p')!
    await waitFor(() => expect(calls(`/api/v1/bills/${NOTE_ID}`).length).toBeGreaterThan(0))
    expect(within(decision).queryByRole('link')).toBeNull()
  })

  it.each([
    [false, true],
    [true, false],
  ])(
    'promises "You\'ll pay less" and waits to be set against the bill only when not held (held: %s)',
    async (heldAsDuplicate, shown) => {
      notes = [note({ heldAsDuplicate, credits: namedBill })]
      billDetail = { bill: { ...OURS, id: BILL_ID, supplierBillNumber: 'QMS-7781' }, lines: [] }
      renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
      // The bill read decides the banner's words, so wait for the bill to be named.
      await waitFor(() => expect(screen.getAllByText('QMS-7781').length).toBeGreaterThan(0))
      if (shown) expect(visibleText(await heroSaying(/^You'll pay/))).toBe("You'll pay 200.000 less")
      const promises = screen
        .getAllByRole('heading', { level: 2 })
        .filter((heading) => /You'll pay/.test(visibleText(heading)))
      expect(promises.length > 0).toBe(shown)
      expect(screen.queryByText('They billed') !== null).toBe(shown)
      const activity = screen.getByRole('list', { name: 'Activity' })
      expect(within(activity).queryByText('Waiting to be set against the bill') !== null).toBe(
        shown,
      )
    },
  )

  // A held copy is left out of input VAT (PEPPOL_DUPLICATE_HELD) even when the bill it corrects
  // is counted, so no reduction may be claimed for it.
  it.each([
    [false, true],
    [true, false],
  ])(
    'claims a VAT reduction only for a note not held (held: %s)',
    async (heldAsDuplicate, shown) => {
      notes = [note({ heldAsDuplicate, credits: namedBill })]
      billDetail = {
        bill: {
          ...OURS,
          id: BILL_ID,
          supplierBillNumber: 'QMS-7781',
          inputVat: { counted: true, countedOn: '2026-09-01', reason: 'COUNTED', vatAmountOmr: 15 },
        },
        lines: [],
      }
      renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'QMS-CN-1' })
      await waitFor(() => expect(calls(`/api/v1/bills/${BILL_ID}`).length).toBeGreaterThan(0))
      if (shown) await screen.findByText('Reduced by this note')
      expect(screen.queryByText('Effect on your VAT') !== null).toBe(shown)
      expect(screen.queryByText('Reduced by this note') !== null).toBe(shown)
      expect(screen.queryByText(/Fawtir adjusts this in your VAT return/) !== null).toBe(shown)
    },
  )

  it('says nothing of waiting for its bill when a held note waits for one', async () => {
    notes = [note({ heldAsDuplicate: true, status: 'WAITING_FOR_BILL' })]
    renderDetail()
    const activity = await screen.findByRole('list', { name: 'Activity' })
    expect(within(activity).queryByText('Waiting for the bill it corrects')).toBeNull()
    expect(screen.getByText(HELD_DECISION)).toBeTruthy()
  })

  it('says the note is held when the apply is refused CREDIT_NOTE_HELD_AS_DUPLICATE, in both languages', async () => {
    // Read before the hold opened: the screen still offers the apply, and the server refuses it.
    answerApplyWith(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'CREDIT_NOTE_HELD_AS_DUPLICATE',
      trace_id: 'trace-held',
    })
    renderDetail()
    await applyFromTheNote()
    expect(await screen.findByText(`${HELD_REFUSED} Reference: trace-held`)).toBeTruthy()

    // The bill stays chosen; the same press in Arabic says the same in Arabic.
    await i18n.changeLanguage('ar')
    fireEvent.click(await screen.findByRole('button', { name: 'استخدمه' }))
    expect(await screen.findByText(new RegExp(`^${HELD_REFUSED_AR}`))).toBeTruthy()
  })

  it('keeps the conflict sentence for any other 409', async () => {
    answerApplyWith(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'SOME_OTHER_CONFLICT',
    })
    renderDetail()
    await applyFromTheNote()
    expect(
      await screen.findByText(
        'Someone changed this while you were working on it. Reload to see the latest version, then try again.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(HELD_REFUSED)).toBeNull()
  })
})
