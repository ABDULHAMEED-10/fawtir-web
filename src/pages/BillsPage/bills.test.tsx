import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillRowDto, BillSummaryDto } from '../../api/expenditure/bills'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import { daysFromMuscatToday, dueNoteOf, statusLabelKey, toBillListItem } from '../../lib/billList'
import { BillsPage } from './BillsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/bills/summary'
const FIRST_PAGE = '/api/v1/bills?filter=NEEDS_ATTENTION&page=0&page_size=10'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.approve', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['invoice.read'] }

// Figures unlike the design's mock ledger (5 needing attention, 11,247.880 payable).
const SUMMARY: BillSummaryDto = {
  currencyCode: 'OMR',
  openCount: 13,
  openTotal: 8765.432,
  overdueCount: 2,
  dueThisWeekCount: 3,
  dueThisWeekTotal: 1500.25,
  readyToPayCount: 4,
  readyToPayTotal: 2222.5,
  disputedCount: 0,
  disputedTotal: 0,
  excludedFromTotals: 0,
  needsAttention: { draft: 0, new: 2, mismatch: 1, awaitingApproval: 3, total: 6, truncated: false },
  tabs: { needsAttention: 6, all: 31, awaitingApproval: 3, approved: 4, onHold: 1, paid: 17, truncated: false },
}

const ID = '11111111-1111-1111-1111-111111111111'

/** Today in Muscat plus `days`, as the API writes dates. */
function muscatDay(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function bill(overrides: Partial<BillRowDto> = {}): BillRowDto {
  return {
    id: ID,
    source: 'PEPPOL',
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    documentTypeCode: '380',
    supplierBillNumber: 'QMS-7781',
    issueDate: '2026-09-01',
    dueDate: muscatDay(12),
    overdue: false,
    currencyCode: 'OMR',
    totalIncludingVat: 1234.56,
    vatAmount: 58.789,
    paidAmount: 0,
    outstandingAmount: 1234.56,
    purchaseOrderReference: null,
    workflowState: 'NEW',
    readiness: { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false },
    match: { verdict: 'MATCHED', purchaseOrderNumber: 'PO-0042', byHand: false },
    hold: null,
    paymentRunReference: null,
    paidOnTheSpot: false,
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function itemsPage(items: BillRowDto[], total = items.length, page = 0, pageSize = 10, truncated = false) {
  return { items, page, pageSize, count: items.length, total, truncated }
}

let fetchMock: ReturnType<typeof vi.fn>
let unconfirmed: IntakeDto[]
let listResponses: Array<() => Response>
let summaryResponse: () => Response
let who: Entitlements

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))
const listCalls = () => calls('/api/v1/bills?')

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  summaryResponse = () => json(200, SUMMARY)
  unconfirmed = []
  listResponses = [() => json(200, itemsPage([bill()], 1))]
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === SUMMARY_URL) return summaryResponse()
    if (url.endsWith('/approval/approve') && init?.method === 'POST') return json(200, {})
    if (url.startsWith('/api/v1/bills?') || url === '/api/v1/bills') {
      const next = listResponses.length > 1 ? listResponses.shift()! : listResponses[0]
      return next()
    }
    if (url.startsWith('/api/v1/bills/intake?status=UNCONFIRMED')) return json(200, { items: unconfirmed, page: 0, pageSize: 20, count: unconfirmed.length })
    if (/\/api\/v1\/bills\/intake\/[^/]+$/.test(url) && init?.method === 'DELETE') return new Response(null, { status: 204 })
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderBills(path = '/expenditure/bills') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/bills" element={<BillsPage />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Bills list, wired to the API', () => {
  it('shows the cards, tab counts and rows the API returned', async () => {
    renderBills()
    expect(await screen.findByText('Qalhat Marine Supplies')).toBeTruthy()
    expect(screen.getByText('2 new · 1 mismatch · 3 awaiting approval')).toBeTruthy()
    expect(screen.getByText('1,500.250')).toBeTruthy()
    expect(screen.getByText('3 bills')).toBeTruthy()
    expect(screen.getByText('8,765.432')).toBeTruthy()
    expect(screen.getByText('13 open · 2 overdue')).toBeTruthy()
    expect(screen.getByText('2,222.500')).toBeTruthy()
    expect(screen.getByText('4 approved bills')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /^Paid/ })).getByText('17')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /^All/ })).getByText('31')).toBeTruthy()

    expect(screen.getByText('QMS-7781')).toBeTruthy()
    expect(screen.getByText('Issued 1 Sept 2026')).toBeTruthy()
    expect(screen.getByText('in 12 days')).toBeTruthy()
    expect(screen.getByText('PO-0042')).toBeTruthy()
    expect(screen.getByText('Order and receipt agree')).toBeTruthy()
    expect(screen.getByText('New, not reviewed')).toBeTruthy()
    // Nothing has been paid against this bill, so the amount and what is outstanding are the
    // same figure, once in each column.
    expect(screen.getAllByText('1,234.560')).toHaveLength(2)
    expect(screen.getByText('incl. VAT 58.789')).toBeTruthy()
    expect(listCalls()).toEqual([FIRST_PAGE])
  })

  it('shows what is outstanding per row, and marks the overdue ones', async () => {
    listResponses = [
      () =>
        json(
          200,
          itemsPage([
            bill({ id: 'b-part', supplierBillNumber: 'PART-1', paidAmount: 234.56, outstandingAmount: 1000 }),
            bill({ id: 'b-late', supplierBillNumber: 'LATE-1', overdue: true, dueDate: muscatDay(-3), outstandingAmount: 500 }),
            bill({ id: 'b-paid', supplierBillNumber: 'PAID-1', workflowState: 'PAID', paidAmount: 1234.56, outstandingAmount: 0 }),
            bill({ id: 'b-credit', supplierBillNumber: 'CRED-1', documentTypeCode: '381', outstandingAmount: 90 }),
          ]),
        ),
    ]
    renderBills()
    await screen.findByText('PART-1')

    expect(screen.getByText('Outstanding')).toBeTruthy()
    // Part paid: the amount stands, the outstanding is what is left.
    expect(screen.getByText('1,000.000')).toBeTruthy()
    expect(screen.getByText('500.000')).toBeTruthy()
    // A settled bill and a credit note owe nothing, and neither shows a figure to chase.
    expect(screen.getAllByText('Nothing owed')).toHaveLength(2)
    expect(screen.getByText('3 days overdue')).toBeTruthy()

    // The late figure is red, and red is not the only thing saying so: the cell carries the word
    // for a screen reader. Colour alone would leave the state unreadable to anyone who cannot see it.
    const late = screen.getByText('500.000')
    expect(late.className).toContain('text-danger-700')
    expect(within(late).getByText('Overdue')).toBeTruthy()
  })

  it('asks the server for the tab, the search, the source, the sort and the page size', async () => {
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    await waitFor(() => expect(listCalls().at(-1)).toBe('/api/v1/bills?page=0&page_size=10'))

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'qalhat' } })
    await waitFor(() => expect(listCalls().at(-1)).toBe('/api/v1/bills?q=qalhat&page=0&page_size=10'))

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Due: soonest first' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe('/api/v1/bills?q=qalhat&sort=DUE_SOONEST&page=0&page_size=10'),
    )

    fireEvent.change(await screen.findByRole('combobox', { name: 'Show result:' }), { target: { value: '25' } })
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe('/api/v1/bills?q=qalhat&sort=DUE_SOONEST&page=0&page_size=25'),
    )
  })

  it('reads the source filter from the URL and sends it', async () => {
    renderBills('/expenditure/bills?tab=paid&source=scanned')
    await screen.findByText('Qalhat Marine Supplies')
    expect(listCalls()).toEqual(['/api/v1/bills?filter=PAID&source=SCANNED&page=0&page_size=10'])
  })

  it('pages with the total the server counted', async () => {
    listResponses = [
      () => json(200, itemsPage([bill()], 31)),
      () => json(200, itemsPage([bill({ id: '2', supplierName: 'Sohar Packaging LLC' })], 31, 2)),
    ]
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(await screen.findByText('Sohar Packaging LLC')).toBeTruthy()
    expect(listCalls().at(-1)).toBe('/api/v1/bills?filter=NEEDS_ATTENTION&page=2&page_size=10')
  })

  it('approves on the server, then reads the cards and the list again', async () => {
    listResponses = [
      () => json(200, itemsPage([bill()], 1)),
      () => json(200, itemsPage([bill({ workflowState: 'APPROVED', readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false } })], 1)),
    ]
    renderBills()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/bills/${ID}/approval/approve`,
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    await waitFor(() =>
      expect(within(screen.getByText('Qalhat Marine Supplies').closest('tr')!).getByText('Approved')).toBeTruthy(),
    )
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(calls(SUMMARY_URL).length).toBeGreaterThan(1)
  })

  it('offers Approve only on a new or awaiting bill, never on a mismatch, and names the approvals still needed', async () => {
    listResponses = [
      () =>
        json(
          200,
          itemsPage([
            bill({ id: 'mm', supplierName: 'Mismatch Co', workflowState: 'MISMATCH', match: { verdict: 'MISMATCH', purchaseOrderNumber: 'PO-9', byHand: false } }),
            bill({ id: 'aw', supplierName: 'Awaiting Co', workflowState: 'AWAITING_APPROVAL', readiness: { state: 'PENDING', distinctApprovals: 1, required: 2, autoApproved: false } }),
          ]),
        ),
    ]
    renderBills()
    const mismatch = (await screen.findByText('Mismatch Co')).closest('tr')!
    expect(within(mismatch).queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(within(mismatch).getByText('Differs from the order')).toBeTruthy()
    const awaiting = screen.getByText('Awaiting Co').closest('tr')!
    expect(within(awaiting).getByText('Waiting on approval · 1 of 2')).toBeTruthy()
    expect(within(awaiting).getByRole('button', { name: 'Approve' })).toBeTruthy()
  })

  it('says when drafts are waiting and when a tab stopped at its window', async () => {
    summaryResponse = () =>
      json(200, {
        ...SUMMARY,
        needsAttention: { ...SUMMARY.needsAttention, draft: 2, total: 8 },
        tabs: { ...SUMMARY.tabs, truncated: true },
      })
    renderBills()
    expect(await screen.findByText(/2 uploaded or scanned bills are waiting/)).toBeTruthy()
    expect(screen.getByText(/newest 2,000 bills only/)).toBeTruthy()
    expect(screen.getByText('2 new · 1 mismatch · 3 awaiting approval · 2 uploads to confirm')).toBeTruthy()
  })

  it('tells an empty ledger from a search that found nothing', async () => {
    summaryResponse = () => json(200, { ...SUMMARY, tabs: { ...SUMMARY.tabs, all: 0, needsAttention: 0 } })
    listResponses = [() => json(200, itemsPage([], 0))]
    const { unmount } = renderBills()
    expect(await screen.findByText(/No bills yet/)).toBeTruthy()
    unmount()

    summaryResponse = () => json(200, SUMMARY)
    renderBills('/expenditure/bills?q=zzz')
    expect(await screen.findByText('No bills match these filters.')).toBeTruthy()
  })

  it('reads a refusal as "no access", not as an empty list', async () => {
    summaryResponse = () => json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderBills()
    expect(await screen.findByText('No access')).toBeTruthy()
  })

  it('offers a retry with the reference when the list fails', async () => {
    listResponses = [
      () => json(500, { type: 'https://api.fawtir.om/problems/internal-error', correlationId: 'corr-91' }),
      () => json(200, itemsPage([bill()], 1)),
    ]
    renderBills()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: corr-91')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Qalhat Marine Supplies')).toBeTruthy()
  })

  it('offers only what the reader may do', async () => {
    who = READ_ONLY
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.queryByRole('link', { name: /Upload a bill/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Scan a receipt/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('reads in Arabic with Latin digits', async () => {
    await i18n.changeLanguage('ar')
    renderBills()
    expect(await screen.findByText('Qalhat Marine Supplies')).toBeTruthy()
    expect(screen.getByText('خلال 12 يومًا')).toBeTruthy()
    expect(screen.getByText('جديدة، لم تُراجع')).toBeTruthy()
    expect(screen.getByText('المتبقي')).toBeTruthy()
    // Amount and outstanding: the same figure on an unpaid bill, in Latin digits either way.
    expect(screen.getAllByText('1,234.560')).toHaveLength(2)
  })
})

describe('bill list mapping', () => {
  it('notes a credit note, and settles counter purchases without a due date', () => {
    expect(toBillListItem(bill({ documentTypeCode: '381' })).amountNote).toEqual({ key: 'billsPage.rows.creditNote' })
    expect(dueNoteOf(toBillListItem(bill({ paidOnTheSpot: true, dueDate: null })))).toEqual({ key: 'billsPage.rows.cash' })
    expect(dueNoteOf(toBillListItem(bill({ workflowState: 'PAID' })))).toBeNull()
  })

  it('carries what is still owed, and owes nothing on a credit note', () => {
    const part = toBillListItem(bill({ paidAmount: 200, outstandingAmount: 1034.56 }))
    expect(part.outstanding).toBe(1034.56)
    expect(part.owes).toBe(true)
    // The part payment used to be a note under the amount as well; one figure, one place.
    expect(part.amountNote).toEqual({ key: 'billsPage.rows.inclVat', values: { amount: 58.789 } })

    // A credit note lowers a bill. Whatever the server puts in the field, nothing is owed on it.
    expect(toBillListItem(bill({ documentTypeCode: '381', outstandingAmount: 90 })).owes).toBe(false)
    expect(toBillListItem(bill({ documentTypeCode: '261', outstandingAmount: 90 })).owes).toBe(false)
    expect(toBillListItem(bill({ paidAmount: 1234.56, outstandingAmount: 0 })).owes).toBe(false)
  })

  it('counts days from the Muscat day, not the browser\'s', () => {
    // 21:30 UTC on 14 Sept is already 15 Sept in Muscat.
    const lateEvening = new Date('2026-09-14T21:30:00Z')
    expect(daysFromMuscatToday('2026-09-15', lateEvening)).toBe(0)
    expect(daysFromMuscatToday('2026-09-10', lateEvening)).toBe(-5)
    expect(dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-10', overdue: true })), lateEvening)).toEqual({
      key: 'billsPage.rows.daysOverdue',
      values: { count: 5 },
    })
  })

  it('lets the server, not this browser, decide that a bill is overdue', () => {
    // The two clocks disagree for four hours of every day: 21:30 UTC on 14 Sept is already the
    // 15th in Muscat, so a bill due on the 14th reads as a day late here while the service —
    // running UTC, and the source of the count above the table — still calls it due today.
    const lateEvening = new Date('2026-09-14T21:30:00Z')

    // Past its date locally, not yet overdue to the server: say nothing that contradicts the count.
    expect(dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-14', overdue: false })), lateEvening)).toEqual({
      key: 'billsPage.rows.dueToday',
    })

    // Overdue to the server before the local calendar has caught up: no "0 days overdue".
    expect(dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-15', overdue: true })), lateEvening)).toEqual({
      key: 'billsPage.rows.overdue',
    })

    // Agreement is the ordinary case and still reads as a count.
    expect(dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-20', overdue: false })), lateEvening)).toEqual({
      key: 'billsPage.rows.inDays',
      values: { count: 5 },
    })
  })

  it('does not call a bill refused weeks ago "Due today"', () => {
    // The server stopped counting a REJECTED bill as overdue whatever its date, which left this
    // branch — written only for the one-day clock skew — claiming a bill refused long ago was due
    // today (found 2026-09-24 on the Bills list).
    const now = new Date('2026-09-24T09:00:00Z')

    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-19', overdue: false, workflowState: 'REJECTED' })), now),
    ).toEqual({ key: 'billsPage.rows.wasDue', values: { count: 5 } })

    // The same the day after it was due: a rejected bill is never the skew, at any width.
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-23', overdue: false, workflowState: 'REJECTED' })), now),
    ).toEqual({ key: 'billsPage.rows.wasDue', values: { count: 1 } })
  })

  it('still absorbs the one-day skew it was written for', () => {
    // 21:30 UTC on 14 Sept is the 15th in Muscat. A bill due on the 14th, unpaid and not rejected,
    // is a day late here and due today to the server. That must keep reading "Due today" — saying
    // "Was due 1 day ago" for four hours every evening would be the same defect in reverse.
    const lateEvening = new Date('2026-09-14T21:30:00Z')
    expect(dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-14', overdue: false })), lateEvening)).toEqual({
      key: 'billsPage.rows.dueToday',
    })

    // A gap wider than the skew is never the skew, whatever the workflow state says.
    expect(dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-12', overdue: false })), lateEvening)).toEqual({
      key: 'billsPage.rows.wasDue',
      values: { count: 3 },
    })
  })

  it('reads NO_ORDER as no order, not as an agreement', () => {
    expect(toBillListItem(bill({ match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false }, purchaseOrderReference: 'THEIR-PO-5' })).match).toEqual({
      verdict: 'none',
      theirOrder: 'THEIR-PO-5',
    })
    expect(toBillListItem(bill({ match: { verdict: 'MATCHED_BY_HAND', purchaseOrderNumber: 'PO-1', byHand: false } })).match).toMatchObject({
      verdict: 'ok',
      note: { key: 'billsPage.rows.matchedByHand' },
    })
  })

  it('names the run a bill is in, and uses the plain label when there is nothing to add', () => {
    expect(statusLabelKey(toBillListItem(bill({ workflowState: 'IN_PAYMENT_RUN', paymentRunReference: 'RUN-7' })))).toBe(
      'billsPage.state.inPaymentRunRef',
    )
    expect(statusLabelKey(toBillListItem(bill({ workflowState: 'ON_HOLD' })))).toBe('billsPage.state.onHold')
  })
})

function intakeRow(id: string, source: IntakeDto['source'], typed: { supplierName?: string; billNumber?: string }): IntakeDto {
  return {
    id,
    source,
    filename: source === 'SCANNED' ? 'receipt.jpg' : 'bill.pdf',
    contentType: source === 'SCANNED' ? 'image/jpeg' : 'application/pdf',
    byteSize: 120,
    sha256: 'x',
    documentTypeCode: null,
    extractionStatus: 'NONE',
    extracted: {
      supplierName: typed.supplierName ?? null,
      supplierVatNumber: null,
      billNumber: typed.billNumber ?? null,
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
  }
}

describe('a disputed bill', () => {
  it('is named beside total payable, not folded into it', async () => {
    // Rejecting a bill does not cancel it — the supplier still claims it — so it leaves the
    // payable figure and is reported separately rather than vanishing (decision 3, 2026-09-24).
    summaryResponse = () => json(200, { ...SUMMARY, disputedCount: 1, disputedTotal: 3140 })
    renderBills()

    expect(await screen.findByText('8,765.432')).toBeTruthy()
    expect(screen.getByText(/13 open · 2 overdue · 3,140.000 disputed on 1 refused bill/)).toBeTruthy()
  })

  it('says nothing when there is no dispute', async () => {
    renderBills()
    expect(await screen.findByText('8,765.432')).toBeTruthy()
    expect(screen.getByText('13 open · 2 overdue')).toBeTruthy()
    expect(screen.queryByText(/disputed/)).toBeNull()
  })
})

describe('uploads waiting for their details', () => {
  it('lists them under the drafts notice: a way back to an upload, only a discard for a receipt', async () => {
    summaryResponse = () => json(200, { ...SUMMARY, needsAttention: { ...SUMMARY.needsAttention, draft: 2 } })
    unconfirmed = [intakeRow('i-1', 'UPLOADED', { supplierName: 'Nizwa Hardware Store', billNumber: 'NHS-2026-14' }), intakeRow('i-2', 'SCANNED', {})]
    renderBills('/expenditure/bills?tab=needsAttention')

    const list = await screen.findByRole('list', { name: 'Uploads waiting for their details' })
    const [upload, receipt] = within(list).getAllByRole('listitem')
    expect(within(upload).getByText('Nizwa Hardware Store · NHS-2026-14')).toBeTruthy()
    expect(within(upload).getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/expenditure/bills/upload/i-1')
    expect(within(receipt).getByText('receipt.jpg')).toBeTruthy()
    expect(within(receipt).queryByRole('link', { name: 'Continue' })).toBeNull()

    fireEvent.click(within(receipt).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/v1/bills/intake/i-2' && (init as RequestInit | undefined)?.method === 'DELETE')).toHaveLength(1),
    )
  })
})
