import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillRowDto, BillSummaryDto } from '../../api/expenditure/bills'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import {
  daysFromMuscatToday,
  dueNoteOf,
  rowActionOf,
  statusLabelKey,
  toBillListItem,
} from '../../lib/billList'
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
/** Captures and pays bills, and exports them, but does not approve: the one who waits on an approver. */
const CAPTURER: Entitlements = {
  ...ADMIN,
  username: 'finance',
  permissions: ['invoice.read', 'invoice.payment.manage', 'invoice.export'],
}

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
  needsAttention: {
    draft: 0,
    new: 2,
    mismatch: 1,
    awaitingApproval: 3,
    total: 6,
    truncated: false,
  },
  tabs: {
    needsAttention: 6,
    all: 31,
    awaitingApproval: 3,
    approved: 4,
    onHold: 1,
    paid: 17,
    truncated: false,
  },
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

function itemsPage(
  items: BillRowDto[],
  total = items.length,
  page = 0,
  pageSize = 10,
  truncated = false,
) {
  return { items, page, pageSize, count: items.length, total, truncated }
}

let fetchMock: ReturnType<typeof vi.fn>
let unconfirmed: IntakeDto[]
let listResponses: Array<() => Response>
let summaryResponse: () => Response
let who: Entitlements
let nudgeResponse: () => Response
/** The summary asked for with a search or a source: its tab counts are the filtered ones. */
let countsResponse: (url: string) => Response
/** Whether the mocked server narrows `GET /bills/intake` by `source`, or ignores the parameter. */
let intakeSourceKnown: boolean
let exportResponse: () => Response
/** What a reject, a hold or a release answers. */
let decisionResponse: () => Response

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
  countsResponse = () => json(200, SUMMARY)
  intakeSourceKnown = true
  nudgeResponse = () =>
    json(202, { billId: ID, nudgedOn: '2026-10-01', approvers: 1 })
  decisionResponse = () => json(200, {})
  exportResponse = () =>
    new Response('supplier\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="fawtir-bills.csv"',
        'X-Fawtir-Export-Truncated': 'false',
      },
    })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url.endsWith('/approval/nudge') && init?.method === 'POST') return nudgeResponse()
    if (url.startsWith('/api/v1/bills/export.csv')) return exportResponse()
    if (url === SUMMARY_URL) return summaryResponse()
    if (url.startsWith(`${SUMMARY_URL}?`)) return countsResponse(url)
    if (url.endsWith('/approval/approve') && init?.method === 'POST') return json(200, {})
    if (/\/(approval\/reject|hold|release)$/.test(url) && init?.method === 'POST')
      return decisionResponse()
    if (url.startsWith('/api/v1/bills?') || url === '/api/v1/bills') {
      const next = listResponses.length > 1 ? listResponses.shift()! : listResponses[0]
      return next()
    }
    if (url.startsWith('/api/v1/bills/intake?status=UNCONFIRMED')) {
      // A server that knows `source` answers that kind only; an older one answers every kind.
      const asked = new URL(url, 'http://x').searchParams.get('source')
      const items =
        intakeSourceKnown && asked ? unconfirmed.filter((row) => row.source === asked) : unconfirmed
      return json(200, { items, page: 0, pageSize: 20, count: items.length })
    }
    if (/\/api\/v1\/bills\/intake\/[^/]+$/.test(url) && init?.method === 'DELETE')
      return new Response(null, { status: 204 })
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
    // One amount column, as the frame draws it; what is still owed is a note under it.
    expect(screen.getByText('1,234.560')).toBeTruthy()
    expect(screen.getByText('incl. VAT 58.789')).toBeTruthy()
    expect(screen.queryByText('Outstanding')).toBeNull()
    expect(screen.getByRole('link', { name: /Start a payment run/ }).getAttribute('href')).toBe(
      '/expenditure/payments/new',
    )
    expect(listCalls()).toEqual([FIRST_PAGE])
  })

  it('notes what is still owed under the amount, and marks the overdue ones', async () => {
    listResponses = [
      () =>
        json(
          200,
          itemsPage([
            bill({
              id: 'b-part',
              supplierBillNumber: 'PART-1',
              paidAmount: 234.56,
              outstandingAmount: 1000,
            }),
            bill({
              id: 'b-late',
              supplierBillNumber: 'LATE-1',
              overdue: true,
              dueDate: muscatDay(-3),
              paidAmount: 734.56,
              outstandingAmount: 500,
            }),
            bill({
              id: 'b-paid',
              supplierBillNumber: 'PAID-1',
              workflowState: 'PAID',
              paidAmount: 1234.56,
              outstandingAmount: 0,
            }),
            bill({
              id: 'b-credit',
              supplierBillNumber: 'CRED-1',
              documentTypeCode: '381',
              outstandingAmount: 90,
            }),
          ]),
        ),
    ]
    renderBills()
    await screen.findByText('PART-1')

    // The frame has no Outstanding column: a part payment is a note under the amount.
    expect(screen.queryByText('Outstanding')).toBeNull()
    expect(screen.getByText('1,000.000 left to pay')).toBeTruthy()
    // A settled bill says what its total included; a credit note says what it is.
    expect(screen.getByText('Credit note')).toBeTruthy()
    expect(
      within(screen.getByText('PAID-1').closest('tr')!).getByText('incl. VAT 58.789'),
    ).toBeTruthy()
    expect(screen.getByText('3 days overdue')).toBeTruthy()

    // The late note is red, and so is the due column's count: colour is not the only carrier.
    const late = screen.getByText('500.000 left to pay')
    expect(late.className).toContain('text-danger-700')
    expect(screen.getByText('3 days overdue').className).toContain('text-danger-700')
  })

  it('asks the server for the tab, the search, the source, the sort and the page size', async () => {
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    await waitFor(() => expect(listCalls().at(-1)).toBe('/api/v1/bills?page=0&page_size=10'))

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'qalhat' } })
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe('/api/v1/bills?q=qalhat&page=0&page_size=10'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Due: soonest first' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/bills?q=qalhat&sort=DUE_SOONEST&page=0&page_size=10',
      ),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Show result:' }))
    fireEvent.click(await screen.findByRole('option', { name: '25' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/bills?q=qalhat&sort=DUE_SOONEST&page=0&page_size=25',
      ),
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
      () =>
        json(
          200,
          itemsPage(
            [
              bill({
                workflowState: 'APPROVED',
                readiness: {
                  state: 'READY',
                  distinctApprovals: 1,
                  required: 1,
                  autoApproved: false,
                },
              }),
            ],
            1,
          ),
        ),
    ]
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/bills/${ID}/approval/approve`,
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    await waitFor(() =>
      expect(
        within(screen.getByText('Qalhat Marine Supplies').closest('tr')!).getByText('Approved'),
      ).toBeTruthy(),
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
            bill({
              id: 'mm',
              supplierName: 'Mismatch Co',
              workflowState: 'MISMATCH',
              match: { verdict: 'MISMATCH', purchaseOrderNumber: 'PO-9', byHand: false },
            }),
            bill({
              id: 'aw',
              supplierName: 'Awaiting Co',
              workflowState: 'AWAITING_APPROVAL',
              readiness: {
                state: 'PENDING',
                distinctApprovals: 1,
                required: 2,
                autoApproved: false,
              },
            }),
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
    // The frame has no notice for drafts: they are rows, and the card counts them.
    expect(await screen.findByText(/newest 2,000 bills only/)).toBeTruthy()
    expect(screen.queryByText(/uploaded or scanned bills are waiting/)).toBeNull()
    expect(
      screen.getByText('2 new · 1 mismatch · 3 awaiting approval · 2 uploads to confirm'),
    ).toBeTruthy()
  })

  it('tells an empty ledger from a search that found nothing', async () => {
    summaryResponse = () =>
      json(200, { ...SUMMARY, tabs: { ...SUMMARY.tabs, all: 0, needsAttention: 0 } })
    listResponses = [() => json(200, itemsPage([], 0))]
    const { unmount } = renderBills()
    expect(await screen.findByText(/No bills yet/)).toBeTruthy()
    unmount()

    summaryResponse = () => json(200, SUMMARY)
    renderBills('/expenditure/bills?q=zzz')
    expect(await screen.findByText('No bills match these filters.')).toBeTruthy()
  })

  it('reads a refusal as "no access", not as an empty list', async () => {
    summaryResponse = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderBills()
    expect(await screen.findByText('No access')).toBeTruthy()
  })

  it('offers a retry with the reference when the list fails', async () => {
    listResponses = [
      () =>
        json(500, {
          type: 'https://api.fawtir.om/problems/internal-error',
          correlationId: 'corr-91',
        }),
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

  it('offers no export without the export permission', async () => {
    // ADMIN here holds no `invoice.export`: hidden, not shown disabled.
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
  })

  it('exports the list it is showing, and warns when the file stops at the cap', async () => {
    who = CAPTURER
    const created = vi.fn(() => 'blob:bills')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    exportResponse = () =>
      new Response('supplier\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="fawtir-bills.csv"',
          'X-Fawtir-Export-Truncated': 'true',
        },
      })
    renderBills('/expenditure/bills?tab=approved&source=peppol&sort=dueAsc&q=qalhat&page=3&size=25')
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))

    expect(await screen.findByText(/stops at 10,000 bills/)).toBeTruthy()
    // The tab, the search, the source and the order the list has; never its page.
    expect(calls('/api/v1/bills/export.csv')).toEqual([
      '/api/v1/bills/export.csv?filter=APPROVED&q=qalhat&source=PEPPOL&sort=DUE_SOONEST',
    ])
    expect(created).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('exports every bill with no filter on, and says why when the server refuses', async () => {
    who = CAPTURER
    exportResponse = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderBills('/expenditure/bills?tab=all')
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    await waitFor(() =>
      expect(calls('/api/v1/bills/export.csv')).toEqual(['/api/v1/bills/export.csv']),
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Export/ })).toBeTruthy()
  })

  it('reads in Arabic with Latin digits', async () => {
    await i18n.changeLanguage('ar')
    renderBills()
    expect(await screen.findByText('Qalhat Marine Supplies')).toBeTruthy()
    expect(screen.getByText('خلال 12 يومًا')).toBeTruthy()
    expect(screen.getByText('جديدة، لم تُراجع')).toBeTruthy()
    // Latin digits either way.
    expect(screen.getByText('1,234.560')).toBeTruthy()
  })
})

describe('bill list mapping', () => {
  it('notes a credit note, and settles counter purchases without a due date', () => {
    expect(toBillListItem(bill({ documentTypeCode: '381' })).amountNote).toEqual({
      key: 'billsPage.rows.creditNote',
    })
    expect(dueNoteOf(toBillListItem(bill({ paidOnTheSpot: true, dueDate: null })))).toEqual({
      key: 'billsPage.rows.cash',
    })
    expect(dueNoteOf(toBillListItem(bill({ workflowState: 'PAID' })))).toBeNull()
  })

  it('carries what is still owed, and owes nothing on a credit note', () => {
    const part = toBillListItem(bill({ paidAmount: 200, outstandingAmount: 1034.56 }))
    expect(part.outstanding).toBe(1034.56)
    expect(part.owes).toBe(true)
    // The frame notes what is left under the amount; there is no column for it.
    expect(part.amountNote).toEqual({
      key: 'billsPage.rows.leftToPay',
      values: { amount: 1034.56 },
    })

    // A credit note lowers a bill. Whatever the server puts in the field, nothing is owed on it.
    expect(toBillListItem(bill({ documentTypeCode: '381', outstandingAmount: 90 })).owes).toBe(
      false,
    )
    expect(toBillListItem(bill({ documentTypeCode: '261', outstandingAmount: 90 })).owes).toBe(
      false,
    )
    expect(toBillListItem(bill({ paidAmount: 1234.56, outstandingAmount: 0 })).owes).toBe(false)
  })

  it("counts days from the Muscat day, not the browser's", () => {
    // 21:30 UTC on 14 Sept is already 15 Sept in Muscat.
    const lateEvening = new Date('2026-09-14T21:30:00Z')
    expect(daysFromMuscatToday('2026-09-15', lateEvening)).toBe(0)
    expect(daysFromMuscatToday('2026-09-10', lateEvening)).toBe(-5)
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-10', overdue: true })), lateEvening),
    ).toEqual({
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
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-14', overdue: false })), lateEvening),
    ).toEqual({
      key: 'billsPage.rows.dueToday',
    })

    // Overdue to the server before the local calendar has caught up: no "0 days overdue".
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-15', overdue: true })), lateEvening),
    ).toEqual({
      key: 'billsPage.rows.overdue',
    })

    // Agreement is the ordinary case and still reads as a count.
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-20', overdue: false })), lateEvening),
    ).toEqual({
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
      dueNoteOf(
        toBillListItem(bill({ dueDate: '2026-09-19', overdue: false, workflowState: 'REJECTED' })),
        now,
      ),
    ).toEqual({ key: 'billsPage.rows.wasDue', values: { count: 5 } })

    // The same the day after it was due: a rejected bill is never the skew, at any width.
    expect(
      dueNoteOf(
        toBillListItem(bill({ dueDate: '2026-09-23', overdue: false, workflowState: 'REJECTED' })),
        now,
      ),
    ).toEqual({ key: 'billsPage.rows.wasDue', values: { count: 1 } })
  })

  it('still absorbs the one-day skew it was written for', () => {
    // 21:30 UTC on 14 Sept is the 15th in Muscat. A bill due on the 14th, unpaid and not rejected,
    // is a day late here and due today to the server. That must keep reading "Due today" — saying
    // "Was due 1 day ago" for four hours every evening would be the same defect in reverse.
    const lateEvening = new Date('2026-09-14T21:30:00Z')
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-14', overdue: false })), lateEvening),
    ).toEqual({
      key: 'billsPage.rows.dueToday',
    })

    // A gap wider than the skew is never the skew, whatever the workflow state says.
    expect(
      dueNoteOf(toBillListItem(bill({ dueDate: '2026-09-12', overdue: false })), lateEvening),
    ).toEqual({
      key: 'billsPage.rows.wasDue',
      values: { count: 3 },
    })
  })

  it('reads NO_ORDER as no order, not as an agreement', () => {
    expect(
      toBillListItem(
        bill({
          match: { verdict: 'NO_ORDER', purchaseOrderNumber: null, byHand: false },
          purchaseOrderReference: 'THEIR-PO-5',
        }),
      ).match,
    ).toEqual({
      verdict: 'none',
      theirOrder: 'THEIR-PO-5',
    })
    expect(
      toBillListItem(
        bill({ match: { verdict: 'MATCHED_BY_HAND', purchaseOrderNumber: 'PO-1', byHand: false } }),
      ).match,
    ).toMatchObject({
      verdict: 'ok',
      note: { key: 'billsPage.rows.matchedByHand' },
    })
  })

  it('names the run a bill is in, and uses the plain label when there is nothing to add', () => {
    expect(
      statusLabelKey(
        toBillListItem(bill({ workflowState: 'IN_PAYMENT_RUN', paymentRunReference: 'RUN-7' })),
      ),
    ).toBe('billsPage.state.inPaymentRunRef')
    expect(statusLabelKey(toBillListItem(bill({ workflowState: 'ON_HOLD' })))).toBe(
      'billsPage.state.onHold',
    )
  })
})

function intakeRow(
  id: string,
  source: IntakeDto['source'],
  typed: { supplierName?: string; billNumber?: string },
): IntakeDto {
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
    expect(
      screen.getByText(/13 open · 2 overdue · 3,140.000 disputed on 1 refused bill/),
    ).toBeTruthy()
  })

  it('says nothing when there is no dispute', async () => {
    renderBills()
    expect(await screen.findByText('8,765.432')).toBeTruthy()
    expect(screen.getByText('13 open · 2 overdue')).toBeTruthy()
    expect(screen.queryByText(/disputed/)).toBeNull()
  })
})

describe('uploads waiting for their details', () => {
  it('draws them as draft rows: an upload goes back to its page, a receipt back into Scan receipts', async () => {
    summaryResponse = () =>
      json(200, { ...SUMMARY, needsAttention: { ...SUMMARY.needsAttention, draft: 2 } })
    unconfirmed = [
      intakeRow('i-1', 'UPLOADED', {
        supplierName: 'Nizwa Hardware Store',
        billNumber: 'NHS-2026-14',
      }),
      intakeRow('i-2', 'SCANNED', {}),
    ]
    renderBills('/expenditure/bills?tab=needsAttention')

    const upload = (await screen.findByText('Nizwa Hardware Store')).closest('tr')!
    expect(within(upload).getByText('NHS-2026-14')).toBeTruthy()
    expect(within(upload).getByText('Draft, confirm details')).toBeTruthy()
    expect(
      within(upload)
        .getByRole('link', { name: /Check and save/ })
        .getAttribute('href'),
    ).toBe('/expenditure/bills/upload/i-1')
    const receipt = screen.getByText('receipt.jpg').closest('tr')!
    expect(
      within(receipt)
        .getByRole('link', { name: /Check and save/ })
        .getAttribute('href'),
    ).toBe('/expenditure/bills/scan?intake=i-2')

    fireEvent.click(within(receipt).getByRole('button', { name: 'Bill actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Discard' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            url === '/api/v1/bills/intake/i-2' &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toHaveLength(1),
    )
  })
})

describe('nudging the approver', () => {
  const awaiting = () => bill({ workflowState: 'AWAITING_APPROVAL' })
  const nudges = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === `/api/v1/bills/${ID}/approval/nudge` &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
  const refusal = (status: number, error: string, type = 'expenditure-refused') => () =>
    json(status, { type: `https://api.fawtir.om/problems/${type}`, error })

  it('sends the nudge and says the approver was reminded', async () => {
    who = CAPTURER
    listResponses = [() => json(200, itemsPage([awaiting()], 1))]
    renderBills()
    fireEvent.click(await screen.findByRole('button', { name: /Nudge the approver/ }))

    expect(await screen.findByText('The approver has been reminded.')).toBeTruthy()
    expect(nudges()).toHaveLength(1)
    expect((nudges()[0][1] as RequestInit).body).toBeUndefined()
    // Nothing on the list changes with a nudge, so it is not read again.
    expect(listCalls()).toEqual([FIRST_PAGE])
  })

  it.each([
    [
      409,
      'BILL_NUDGE_ALREADY_SENT',
      'resource-conflict',
      'A reminder for this bill was already sent today. You can send another tomorrow.',
    ],
    [
      400,
      'BILL_APPROVAL_NOT_PENDING',
      'expenditure-refused',
      'This bill is no longer waiting for approval. Reload to see where it is.',
    ],
    [
      409,
      'BILL_NUDGE_NO_APPROVER',
      'resource-conflict',
      'Nobody on this account can approve this bill. Check the approval rules in Settings.',
    ],
    [
      503,
      'BILL_NUDGE_DELIVERY_UNAVAILABLE',
      'expenditure-refused',
      'Bill reminders are not switched on, so nobody was told.',
    ],
  ])('says why a nudge was refused: %i %s', async (status, error, type, sentence) => {
    who = CAPTURER
    listResponses = [() => json(200, itemsPage([awaiting()], 1))]
    nudgeResponse = refusal(status, error, type)
    renderBills()
    fireEvent.click(await screen.findByRole('button', { name: /Nudge the approver/ }))
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText('The approver has been reminded.')).toBeNull()
  })

  it('reads a bill that has gone as not found', async () => {
    who = CAPTURER
    listResponses = [() => json(200, itemsPage([awaiting()], 1))]
    nudgeResponse = refusal(404, 'BILL_NOT_FOUND', 'resource-not-found')
    renderBills()
    fireEvent.click(await screen.findByRole('button', { name: /Nudge the approver/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('The approver has been reminded.')).toBeNull()
  })

  it('is not offered to a reader who can neither capture, pay nor approve', async () => {
    who = READ_ONLY
    listResponses = [() => json(200, itemsPage([awaiting()], 1))]
    renderBills()
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.queryByRole('button', { name: /Nudge the approver/ })).toBeNull()
  })

  it('is not offered on a bill that is not waiting for approval', async () => {
    who = CAPTURER
    // New and under the approval limit, approved, and on hold: nobody is being waited on.
    listResponses = [
      () =>
        json(
          200,
          itemsPage([
            bill({ id: 'b-new', supplierBillNumber: 'NEW-1', workflowState: 'NEW' }),
            bill({
              id: 'b-ok',
              supplierBillNumber: 'OK-1',
              workflowState: 'APPROVED',
              readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
            }),
          ]),
        ),
    ]
    renderBills()
    await screen.findByText('NEW-1')
    expect(screen.queryByRole('button', { name: /Nudge the approver/ })).toBeNull()
  })

  it('gives an approver Approve in the same place, not a nudge', async () => {
    listResponses = [() => json(200, itemsPage([awaiting()], 1))]
    renderBills()
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Nudge the approver/ })).toBeNull()
  })

  it('decides the row button from the state and the two permissions', () => {
    const waiting = toBillListItem(awaiting())
    expect(rowActionOf(waiting, { canApprove: true, canCapture: true })).toBe('approve')
    expect(rowActionOf(waiting, { canApprove: false, canCapture: true })).toBe('nudge')
    expect(rowActionOf(waiting, { canApprove: false, canCapture: false })).toBeNull()
    const fresh = toBillListItem(bill({ workflowState: 'NEW' }))
    expect(rowActionOf(fresh, { canApprove: true, canCapture: false })).toBe('approve')
    expect(rowActionOf(fresh, { canApprove: false, canCapture: true })).toBeNull()
  })
})

describe('a draft row for a reader who cannot capture bills', () => {
  it('offers no "Check and save", no Discard and no link into the capture pages', async () => {
    who = READ_ONLY
    summaryResponse = () =>
      json(200, { ...SUMMARY, needsAttention: { ...SUMMARY.needsAttention, draft: 2 } })
    unconfirmed = [
      intakeRow('i-1', 'UPLOADED', {
        supplierName: 'Nizwa Hardware Store',
        billNumber: 'NHS-2026-14',
      }),
      intakeRow('i-2', 'SCANNED', {}),
    ]
    renderBills('/expenditure/bills?tab=needsAttention')

    const upload = (await screen.findByText('Nizwa Hardware Store')).closest('tr')!
    // The row is still drawn, with what was typed so far.
    expect(within(upload).getByText('NHS-2026-14')).toBeTruthy()
    expect(within(upload).getByText('Draft, confirm details')).toBeTruthy()
    expect(within(upload).queryByRole('link')).toBeNull()
    expect(within(upload).queryByText(/Check and save/)).toBeNull()
    expect(within(upload).queryByRole('button', { name: 'Bill actions' })).toBeNull()
    const receipt = screen.getByText('receipt.jpg').closest('tr')!
    expect(within(receipt).queryByRole('link')).toBeNull()
    expect(within(receipt).queryByRole('button', { name: 'Bill actions' })).toBeNull()

    // A bill's own row keeps its link and its menu.
    const billRow = screen.getByText('QMS-7781').closest('tr')!
    expect(within(billRow).getByRole('link', { name: 'QMS-7781' })).toBeTruthy()
    expect(within(billRow).getByRole('button', { name: 'Bill actions' })).toBeTruthy()
  })
})

describe('the row menu', () => {
  const posts = (suffix: string) =>
    fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === `/api/v1/bills/${ID}/${suffix}` &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
  const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)
  const openMenu = async () => {
    const row = (await screen.findByText('QMS-7781')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Bill actions' }))
  }

  it('puts a bill on hold with the reason typed, then reads the list again', async () => {
    renderBills()
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Put on hold' }))
    const dialog = await screen.findByRole('dialog')
    // No reason, no hold: the server requires one.
    expect((within(dialog).getByRole('button', { name: /hold/i }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: '  Two deliveries billed twice  ' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /hold/i }))

    await waitFor(() => expect(posts('hold')).toHaveLength(1))
    expect(bodyOf(posts('hold')[0])).toEqual({ reason: 'Two deliveries billed twice' })
    await waitFor(() => expect(listCalls()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('rejects a bill with its reason', async () => {
    renderBills()
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Not ours' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Reject/ }))

    await waitFor(() => expect(posts('approval/reject')).toHaveLength(1))
    expect(bodyOf(posts('approval/reject')[0])).toEqual({ reason: 'Not ours' })
    expect(posts('hold')).toHaveLength(0)
  })

  it('releases a held bill, and offers no second hold on it', async () => {
    listResponses = [
      () =>
        json(
          200,
          itemsPage([
            bill({
              workflowState: 'ON_HOLD',
              hold: { reason: 'Two deliveries billed twice', openedAt: '2026-09-20T08:00:00Z' },
            }),
          ]),
        ),
    ]
    renderBills()
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Put on hold' })).toBeNull()
    fireEvent.click(await screen.findByRole('menuitem', { name: /Release/ }))

    await waitFor(() => expect(posts('release')).toHaveLength(1))
    expect((posts('release')[0][1] as RequestInit).body).toBeUndefined()
    await waitFor(() => expect(listCalls()).toHaveLength(2))
  })

  it('offers a reader none of the three', async () => {
    who = READ_ONLY
    renderBills()
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: /View/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Put on hold' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Reject' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Release/ })).toBeNull()
  })
})

describe('the tab counts under a search or a source filter', () => {
  const countCalls = () => calls(`${SUMMARY_URL}?`)
  const badge = (name: RegExp) => within(screen.getByRole('button', { name })).getByText(/^\d+$/)
  // The search waits out its typing pause before it is sent, and the count is a read after that.
  const SLOW = { timeout: 5000 }
  const FILTERED: BillSummaryDto = {
    ...SUMMARY,
    tabs: {
      needsAttention: 1,
      all: 2,
      awaitingApproval: 1,
      approved: 0,
      onHold: 0,
      paid: 1,
      truncated: false,
    },
  }

  it('asks for the whole ledger only, with no filter on', async () => {
    renderBills('/expenditure/bills?tab=paid&sort=dueAsc')
    await screen.findByText('Qalhat Marine Supplies')
    expect(countCalls()).toEqual([])
    expect(badge(/^Paid/).textContent).toBe('17')
  })

  it('counts the tabs over the same search and source as the rows', async () => {
    countsResponse = () => json(200, FILTERED)
    renderBills('/expenditure/bills?tab=all&q=qalhat&source=peppol')
    await screen.findByText('Qalhat Marine Supplies')

    await waitFor(() => expect(badge(/^All/).textContent).toBe('2'), SLOW)
    expect(badge(/^Paid/).textContent).toBe('1')
    expect(badge(/^Needs attention/).textContent).toBe('1')
    expect(countCalls()).toEqual(['/api/v1/bills/summary?q=qalhat&source=PEPPOL'])
    expect(listCalls()).toEqual(['/api/v1/bills?q=qalhat&source=PEPPOL&page=0&page_size=10'])
    // The cards describe the whole ledger and do not move with the search.
    expect(screen.getByText('8,765.432')).toBeTruthy()
    expect(screen.getByText('13 open · 2 overdue')).toBeTruthy()
  })

  it('follows the search box as it is typed, and goes back when it is cleared', async () => {
    countsResponse = (url) =>
      json(200, url.includes('q=zzz') ? { ...FILTERED, tabs: { ...FILTERED.tabs, all: 0 } } : FILTERED)
    renderBills('/expenditure/bills?tab=all')
    await screen.findByText('Qalhat Marine Supplies')
    expect(badge(/^All/).textContent).toBe('31')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    await waitFor(() => expect(badge(/^All/).textContent).toBe('0'), SLOW)
    expect(countCalls()).toEqual(['/api/v1/bills/summary?q=zzz'])
    // The search box is still there with what was typed: the page did not start over.
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('zzz')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    await waitFor(() => expect(badge(/^All/).textContent).toBe('31'), SLOW)
    expect(countCalls()).toHaveLength(1)
  })

  it('sends the source alone when only the source is filtered', async () => {
    countsResponse = () => json(200, FILTERED)
    renderBills('/expenditure/bills?source=selfBilled')
    await screen.findByText('Qalhat Marine Supplies')
    await waitFor(() => expect(badge(/^Paid/).textContent).toBe('1'), SLOW)
    expect(countCalls()).toEqual(['/api/v1/bills/summary?source=SELF_BILLED'])
  })

  it('keeps an empty search apart from an empty ledger', async () => {
    // Nothing matches, so every filtered count is 0; the ledger itself is not empty.
    countsResponse = () =>
      json(200, {
        ...SUMMARY,
        tabs: { ...SUMMARY.tabs, needsAttention: 0, all: 0, awaitingApproval: 0, paid: 0 },
      })
    listResponses = [() => json(200, itemsPage([], 0))]
    renderBills('/expenditure/bills?q=zzz')
    expect(await screen.findByText('No bills match these filters.')).toBeTruthy()
    expect(screen.queryByText(/No bills yet/)).toBeNull()
  })

  it('shows the whole ledger counts when the filtered count cannot be read', async () => {
    countsResponse = () => json(500, { type: 'https://api.fawtir.om/problems/internal-error' })
    renderBills('/expenditure/bills?tab=all&q=qalhat')
    await screen.findByText('Qalhat Marine Supplies')
    await waitFor(() => expect(countCalls()).toHaveLength(1), SLOW)
    expect(badge(/^All/).textContent).toBe('31')
  })

  it('reads the filtered counts again after an approval', async () => {
    countsResponse = () => json(200, FILTERED)
    renderBills('/expenditure/bills?q=qalhat')
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(countCalls()).toHaveLength(2), SLOW)
  })
})

describe('draft rows under the source filter', () => {
  const withDrafts = () => {
    summaryResponse = () =>
      json(200, { ...SUMMARY, needsAttention: { ...SUMMARY.needsAttention, draft: 2 } })
    unconfirmed = [
      intakeRow('i-1', 'UPLOADED', {
        supplierName: 'Nizwa Hardware Store',
        billNumber: 'NHS-2026-14',
      }),
      intakeRow('i-2', 'SCANNED', {}),
    ]
  }
  const badge = (name: RegExp) => within(screen.getByRole('button', { name })).getByText(/^\d+$/)
  const SLOW = { timeout: 5000 }

  const draftReads = () => calls('/api/v1/bills/intake?status=UNCONFIRMED')

  it('shows both kinds with no source filter on, and asks the server for no kind', async () => {
    withDrafts()
    renderBills()
    expect(await screen.findByText('Nizwa Hardware Store')).toBeTruthy()
    expect(screen.getByText('receipt.jpg')).toBeTruthy()
    expect(draftReads()).toEqual(['/api/v1/bills/intake?status=UNCONFIRMED&page=0&page_size=20'])
  })

  it('asks the server for the uploads under "Uploaded"', async () => {
    withDrafts()
    renderBills('/expenditure/bills?source=uploaded')
    expect(await screen.findByText('Nizwa Hardware Store')).toBeTruthy()
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.queryByText('receipt.jpg')).toBeNull()
    expect(draftReads()).toEqual([
      '/api/v1/bills/intake?status=UNCONFIRMED&source=UPLOADED&page=0&page_size=20',
    ])
  })

  it('asks the server for the receipts under "Scanned"', async () => {
    withDrafts()
    renderBills('/expenditure/bills?source=scanned')
    expect(await screen.findByText('receipt.jpg')).toBeTruthy()
    expect(screen.queryByText('Nizwa Hardware Store')).toBeNull()
    expect(draftReads()).toEqual([
      '/api/v1/bills/intake?status=UNCONFIRMED&source=SCANNED&page=0&page_size=20',
    ])
  })

  it.each([
    ['uploaded', 'Nizwa Hardware Store', 'receipt.jpg'],
    ['scanned', 'receipt.jpg', 'Nizwa Hardware Store'],
  ])(
    'still filters "%s" on the page when an older server ignores the parameter',
    async (source, shown, hidden) => {
      withDrafts()
      intakeSourceKnown = false
      renderBills(`/expenditure/bills?source=${source}`)
      expect(await screen.findByText(shown)).toBeTruthy()
      await screen.findByText('Qalhat Marine Supplies')
      // Both kinds came back; only the kind the filter names is drawn.
      expect(draftReads()).toHaveLength(1)
      expect(screen.queryByText(hidden)).toBeNull()
    },
  )

  it.each([['peppol'], ['recurring'], ['selfBilled']])(
    'shows no draft under "%s", and the badge is the count of the rows that are left',
    async (source) => {
      withDrafts()
      // One bill matches the filter: the badge says 1 and one row is drawn, no draft beside it.
      countsResponse = () =>
        json(200, { ...SUMMARY, tabs: { ...SUMMARY.tabs, needsAttention: 1, all: 1 } })
      renderBills(`/expenditure/bills?source=${source}`)
      await screen.findByText('Qalhat Marine Supplies')
      await waitFor(() => expect(badge(/^Needs attention/).textContent).toBe('1'), SLOW)
      // No draft is of this source, so none is asked for, from a newer server or an older one.
      expect(draftReads()).toEqual([])
      expect(screen.queryByText('Nizwa Hardware Store')).toBeNull()
      expect(screen.queryByText('receipt.jpg')).toBeNull()
      expect(screen.getAllByRole('row')).toHaveLength(2) // the header and the one bill
    },
  )

  it('says nothing matches, not that the ledger is empty, when only drafts exist and the filter hides them', async () => {
    withDrafts()
    summaryResponse = () =>
      json(200, {
        ...SUMMARY,
        needsAttention: { ...SUMMARY.needsAttention, draft: 2 },
        tabs: { ...SUMMARY.tabs, needsAttention: 0, all: 0 },
      })
    listResponses = [() => json(200, itemsPage([], 0))]
    renderBills('/expenditure/bills?source=peppol')
    expect(await screen.findByText('No bills match these filters.')).toBeTruthy()
    expect(screen.queryByText(/No bills yet/)).toBeNull()
  })
})

// Draft wording, pending the owner (Wording-For-Abdul.md section 1, "Rejecting a bill"). A
// correction there changes the sentences below with it.
describe('why a rejection was refused, in its own sentence', () => {
  const refusal = (error: string, extra: Record<string, unknown> = {}) => () =>
    json(400, { type: 'https://api.fawtir.om/problems/expenditure-refused', error, ...extra })
  const GENERIC = /The server refused this\. Nothing was changed/

  // Found by key, so the same steps run in Arabic.
  async function reject() {
    renderBills()
    const row = (await screen.findByText('QMS-7781')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: i18n.t('billsPage.rowMenuLabel') }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('billDetail.actions.reject') }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Not ours' } })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('billDetail.reject.confirm') }))
  }

  it.each([
    [
      'APPROVAL_REJECT_PAYMENT_RECORDED',
      {},
      'A payment is already recorded on this bill, so it can no longer be rejected.',
    ],
    [
      'APPROVAL_REJECT_IN_PAYMENT_RUN',
      { paymentRunReference: 'PR-0007' },
      'This bill is in payment run PR-0007. Take it out of the run before rejecting it.',
    ],
    ['APPROVAL_REASON_TOO_LONG', {}, 'That reason is too long. Shorten it and reject again.'],
  ])('%s', async (error, extra, sentence) => {
    decisionResponse = refusal(error, extra)
    await reject()
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it('names the run in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    decisionResponse = refusal('APPROVAL_REJECT_IN_PAYMENT_RUN', { paymentRunReference: 'PR-0007' })
    await reject()
    expect(
      await screen.findByText('هذه الفاتورة ضمن دفعة السداد PR-0007. أخرجها من الدفعة قبل رفضها.'),
    ).toBeTruthy()
  })

  it('keeps the general refusal for a code with no sentence of its own', async () => {
    decisionResponse = refusal('BILL_HOLD_REASON_TOO_LONG')
    await reject()
    expect(await screen.findByText(GENERIC)).toBeTruthy()
  })
})
