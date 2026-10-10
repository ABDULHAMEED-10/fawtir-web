import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceRowDto, InvoiceSummaryDto } from '../../api/invoices/list'
import { periodRange, toInvoiceListItem } from '../../lib/invoiceList'
import { InvoicesPage } from './InvoicesPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/authored-invoices/summary'
// Every tab and count asks for sales documents only: self-billed documents are purchases and live
// under Expenditure › Self-billing (owner decision, 6 Oct 2026).
const SALES_SUMMARY_URL = `${SUMMARY_URL}?type=INVOICE%2CCREDIT_NOTE%2CDEBIT_NOTE`
const FIRST_PAGE =
  '/api/v1/authored-invoices?state=DRAFT%2CISSUED%2CCANCELLED&type=INVOICE%2CCREDIT_NOTE%2CDEBIT_NOTE&sort=UPDATED&page=0&size=10'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'invoice.export'],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['invoice.read'] }

// Figures unlike the design's mock book (342 documents, 217.490 outstanding), so a figure on
// screen can only have come from the API.
const SUMMARY: InvoiceSummaryDto = {
  currencyCode: 'OMR',
  asOf: '2026-09-15',
  all: 41,
  drafts: 3,
  awaiting: 7,
  overdue: 5,
  paid: 19,
  outstandingTotal: 1234.5,
  outstandingInvoices: 12,
  awaitingTotal: 624.25,
  dueSoonInvoices: 2,
  dueSoonDays: 7,
  overdueTotal: 610.25,
  overdueInvoices: 4,
  oldestOverdueDueDate: '2026-07-07',
  paidTotal: 9876.125,
  paidInvoices: 18,
}

function issued(overrides: Partial<InvoiceRowDto> = {}): InvoiceRowDto {
  return {
    id: 'inv-1',
    type: 'INVOICE',
    version: 4,
    authoringState: 'ISSUED',
    deliveryState: 'NOT_SUBMITTED',
    customerId: 'c-1',
    currency: 'OMR',
    invoiceNumber: 'INV-2026-0042',
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    details: { subject: 'August supply', purchaseOrderReference: null },
    headerDiscount: { type: 'PERCENTAGE', value: 0 },
    lines: [],
    totals: { totalAmount: 845.125 },
    customerName: 'Sohar Port Logistics',
    payment: {
      state: 'PARTIALLY_PAID',
      overdue: true,
      daysOverdue: 15,
      paidAmount: 245.125,
      creditedAmount: 0,
      outstandingAmount: 600,
    },
    ...overrides,
  }
}

function draft(overrides: Partial<InvoiceRowDto> = {}): InvoiceRowDto {
  return issued({
    id: 'draft-1',
    version: 2,
    authoringState: 'DRAFT',
    invoiceNumber: null,
    issueDate: null,
    dueDate: null,
    details: { subject: null, purchaseOrderReference: 'PO-77' },
    // 12 × 1.600 exclusive at 5% = 19.200 + 0.960.
    lines: [
      {
        lineNumber: 1,
        quantity: 12,
        unitPrice: 1.6,
        discountType: 'PERCENTAGE',
        discountValue: 0,
        taxRate: 5,
      },
    ],
    totals: null,
    customerName: 'Nizwa Dates Co',
    payment: null,
    ...overrides,
  })
}

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function springPage(content: InvoiceRowDto[], totalElements = content.length, page = 0, size = 10) {
  return { content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) }
}

let fetchMock: ReturnType<typeof vi.fn>
let listResponses: Array<() => Response>
let summaryResponse: () => Response
let salesSummaryResponse: () => Response
let exportResponse: () => Response
let discardResponse: () => Response
let who: Entitlements

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))
const listCalls = () => calls('/api/v1/authored-invoices?')

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  summaryResponse = () => json(200, SUMMARY)
  salesSummaryResponse = () => json(200, { ...SUMMARY, awaiting: 6, overdue: 4, paid: 17 })
  listResponses = [() => json(200, springPage([issued(), draft()], 2))]
  discardResponse = () => json(200, draft({ authoringState: 'DISCARDED' }))
  exportResponse = () =>
    new Response('invoiceNumber\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="fawtir-invoices.csv"',
      },
    })
  fetchMock = vi.fn(async (url: string) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === SUMMARY_URL) return summaryResponse()
    if (url === SALES_SUMMARY_URL) return salesSummaryResponse()
    if (url.startsWith('/api/v1/authored-invoices/export.csv')) return exportResponse()
    if (url.startsWith('/api/v1/invoice-drafts/')) return discardResponse()
    if (url === '/api/v1/authored-invoices/inv-1/send')
      return json(200, {
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-2026-0042',
        outcome: 'DISPATCHED',
        reasonCode: null,
        dispatch: {
          state: 'QUEUED',
          reasonCode: null,
          attempts: 0,
          nextAttemptAt: null,
          dispatchedAt: '2026-10-04T10:00:00Z',
          sendable: false,
        },
      })
    if (url === '/api/v1/branches')
      return json(200, [
        { id: 'b-1', code: 'MAIN', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
      ])
    // The sidebar's own account switcher, unrelated to anything under test here.
    if (url === '/api/v1/branches/overview')
      return json(200, {
        openCount: 0,
        everCount: 0,
        peopleAcross: 0,
        invoicesThisMonth: 0,
        branches: [],
      })
    if (url.startsWith('/api/v1/authored-invoices?')) {
      const next = listResponses.length > 1 ? listResponses.shift()! : listResponses[0]
      return next()
    }
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderInvoices(path = '/invoices') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id/edit" element={<p>draft editor</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Invoices list, wired to the API', () => {
  it('shows the cards, tab counts and rows the API returned', async () => {
    renderInvoices()
    expect(await screen.findByText('Sohar Port Logistics')).toBeTruthy()
    expect(screen.getByText('1,234.500')).toBeTruthy()
    expect(screen.getByText('Across 12 unpaid invoices')).toBeTruthy()
    expect(screen.getByText('9,876.125')).toBeTruthy()
    expect(screen.getByText('18 invoices collected')).toBeTruthy()
    expect(screen.getByText('2 invoices due soon')).toBeTruthy()
    // 7 July to 15 September.
    expect(screen.getByText('4 invoices · oldest 70 days')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /^All\s?41$/ })).getByText('41')).toBeTruthy()
    // The payment tabs count sales documents only; All counts every type.
    expect(within(screen.getByRole('button', { name: /^Overdue/ })).getByText('4')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /^Paid/ })).getByText('17')).toBeTruthy()
    // The design's "To send" tab and PEPPOL/OTA column are drawn; the summary carries no count for
    // the tab yet, and the column prints a Peppol response code only when the row carries one.
    expect(screen.getByRole('button', { name: /^To send/ })).toBeTruthy()
    expect(screen.getByText('PEPPOL/OTA')).toBeTruthy()

    const row = screen.getByText('INV-2026-0042').closest('tr')!
    expect(within(row).getByText('August supply')).toBeTruthy()
    expect(within(row).getByText('1 Aug 2026')).toBeTruthy()
    expect(within(row).getByText('845.125')).toBeTruthy()
    // The pill reads "Overdue", as designed; how late it is sits in its tooltip.
    expect(within(row).getByText('Overdue').closest('span[title]')?.getAttribute('title')).toBe(
      '15 days overdue',
    )
    expect(within(row).queryByText('Not sent')).toBeNull()

    expect(listCalls()).toEqual([FIRST_PAGE])
  })

  it('names the issuing branch under the customer, and prints a Peppol response code when there is one', async () => {
    listResponses = [
      () =>
        json(
          200,
          springPage(
            [
              issued({
                branchId: 'b-1',
                peppolResponse: 'AP',
                payment: {
                  state: 'UNPAID',
                  overdue: false,
                  daysOverdue: null,
                  paidAmount: 0,
                  creditedAmount: 0,
                  outstandingAmount: 845.125,
                },
              }),
              issued({
                id: 'inv-2',
                invoiceNumber: 'INV-2026-0043',
                deliveryState: 'SENT_MANUALLY',
              }),
            ],
            2,
          ),
        ),
    ]
    renderInvoices()
    const row = (await screen.findByText('INV-2026-0042')).closest('tr')!
    expect(await within(row).findByText('Head office')).toBeTruthy()
    expect(within(row).getByText('Awaiting payment')).toBeTruthy()
    expect(within(row).getByText('AP')).toBeTruthy()
    const manual = screen.getByText('INV-2026-0043').closest('tr')!
    expect(within(manual).getByText('Sent manually')).toBeTruthy()
    // Exact match: the sidebar's own account switcher now also reads '/api/v1/branches/overview',
    // which a plain prefix match would double-count alongside this screen's '/api/v1/branches'.
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/branches')).toHaveLength(1)
  })

  it('prices a draft in the browser and says it is an estimate', async () => {
    renderInvoices()
    const row = (await screen.findByText('Nizwa Dates Co')).closest('tr')!
    expect(within(row).getByText('Draft', { selector: 'p' })).toBeTruthy()
    expect(within(row).getByText('PO-77')).toBeTruthy()
    expect(within(row).getByText('20.160').closest('span[title]')?.getAttribute('title')).toBe(
      'Estimate · priced at issue',
    )
  })

  it('asks for the To send tab by delivery state, so its rows are what its badge counts', async () => {
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    fireEvent.click(screen.getByRole('button', { name: /^To send/ }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('delivery=TO_SEND'))
    expect(listCalls().at(-1)).toContain('state=ISSUED')
  })

  it('duplicates an invoice by opening the composer filled from it', async () => {
    renderInvoices()
    const row = (await screen.findByText('INV-2026-0042')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Invoice actions' }))
    const duplicate = await screen.findByRole('menuitem', { name: 'Duplicate' })
    expect(duplicate.getAttribute('href')).toBe('/invoices/new?duplicate=inv-1')
  })

  it('asks the server for the tab, search, type, period, sort and page size', async () => {
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')

    fireEvent.click(screen.getByRole('button', { name: /^Overdue/ }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/authored-invoices?payment=OVERDUE&type=INVOICE%2CCREDIT_NOTE%2CDEBIT_NOTE&sort=UPDATED&page=0&size=10',
      ),
    )

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sohar' } })
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/authored-invoices?payment=OVERDUE&type=INVOICE%2CCREDIT_NOTE%2CDEBIT_NOTE&q=sohar&sort=UPDATED&page=0&size=10',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: /Doc Type/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Debit note' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('type=DEBIT_NOTE'))

    fireEvent.click(screen.getByRole('button', { name: /All time/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Last month' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('from=2026-08-01&to=2026-08-31'))

    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Due soonest' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('sort=DUE_SOONEST'))

    fireEvent.click(await screen.findByRole('button', { name: 'Show result:' }))
    fireEvent.click(await screen.findByRole('option', { name: '25' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/authored-invoices?payment=OVERDUE&type=DEBIT_NOTE&from=2026-08-01&to=2026-08-31&q=sohar&sort=DUE_SOONEST&page=0&size=25',
      ),
    )
    // Eight controls walked through role queries over the whole shell: slow in JSDOM, not stuck.
  }, 30_000)

  it('asks the server for the channel the reader picked, and drops it again for all channels', async () => {
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    expect(listCalls().at(-1)).not.toContain('channel=')

    fireEvent.click(screen.getByRole('button', { name: /Channel/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Peppol network' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('channel=PEPPOL'))

    fireEvent.click(screen.getByRole('button', { name: /Channel|Peppol network/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Email' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('channel=EMAIL'))

    fireEvent.click(screen.getByRole('button', { name: /Channel|Email/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'All channels' }))
    await waitFor(() => expect(listCalls().at(-1)).not.toContain('channel='))
  }, 30_000)

  it('pages with the total the server counted', async () => {
    listResponses = [
      () => json(200, springPage([issued()], 41)),
      () => json(200, springPage([issued({ id: 'inv-9', invoiceNumber: 'INV-2026-0009' })], 41, 2)),
    ]
    renderInvoices()
    await screen.findByText('INV-2026-0042')
    // 41 documents at 10 a page: five pages, the last one offered.
    expect(screen.getByRole('button', { name: '5' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(await screen.findByText('INV-2026-0009')).toBeTruthy()
    expect(listCalls().at(-1)).toBe(
      '/api/v1/authored-invoices?state=DRAFT%2CISSUED%2CCANCELLED&type=INVOICE%2CCREDIT_NOTE%2CDEBIT_NOTE&sort=UPDATED&page=2&size=10',
    )
  })

  it('says there are no invoices yet, and separately that a filter matched none', async () => {
    summaryResponse = () =>
      json(200, { ...SUMMARY, all: 0, drafts: 0, awaiting: 0, overdue: 0, paid: 0 })
    // The page counts sales documents, so the empty account is empty in the sales summary too.
    salesSummaryResponse = summaryResponse
    listResponses = [() => json(200, springPage([], 0))]
    const { unmount } = renderInvoices()
    expect(await screen.findByText(/No invoices yet/)).toBeTruthy()
    unmount()

    summaryResponse = () => json(200, SUMMARY)
    renderInvoices('/invoices?q=zzz')
    expect(await screen.findByText('No invoices match this filter.')).toBeTruthy()
  })

  it('reads a refusal as "no access", not as an empty list', async () => {
    summaryResponse = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderInvoices()
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(screen.queryByText(/No invoices yet/)).toBeNull()
  })

  it('offers a retry with the reference when the list fails', async () => {
    listResponses = [
      () =>
        json(500, {
          type: 'https://api.fawtir.om/problems/internal-error',
          correlationId: 'corr-91',
        }),
      () => json(200, springPage([issued()], 1)),
    ]
    renderInvoices()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: corr-91')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sohar Port Logistics')).toBeTruthy()
  })

  it('offers the row menu on every row, and discards a draft from its Delete', async () => {
    renderInvoices()
    const issuedRow = (await screen.findByText('INV-2026-0042')).closest('tr')!
    fireEvent.click(within(issuedRow).getByRole('button', { name: 'Invoice actions' }))
    expect(await screen.findByRole('menuitem', { name: 'View invoice' })).toBeTruthy()
    // A credit note needs creditnote.create, which this reader lacks; the periodic entry needs invoice.draft.
    expect(screen.queryByRole('menuitem', { name: 'Issue credit note' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Periodic invoice' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    const draftRow = screen.getByText('Nizwa Dates Co').closest('tr')!
    fireEvent.click(within(draftRow).getByRole('button', { name: 'Invoice actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Periodic invoice' })).toBeNull()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: /Discard/, hidden: false }))
    await waitFor(() =>
      expect(calls('/api/v1/invoice-drafts/')).toEqual([
        '/api/v1/invoice-drafts/draft-1?expected_version=2',
      ]),
    )
    await waitFor(() => expect(listCalls()).toHaveLength(2))
  })

  it('opens a draft in the editor when its row is clicked', async () => {
    renderInvoices()
    fireEvent.click(await screen.findByText('Nizwa Dates Co'))
    expect(await screen.findByText('draft editor')).toBeTruthy()
  })

  it('offers only what the reader may do', async () => {
    who = READ_ONLY
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('link', { name: /Create Invoice/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Bulk upload/ })).toBeNull()
    // The menu stays (view, duplicate); what needs a permission is left out of it, Send included.
    fireEvent.click(screen.getAllByRole('button', { name: 'Invoice actions' })[1])
    expect(await screen.findByRole('menuitem', { name: 'View invoice' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Issue credit note' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Send' })).toBeNull()
  })

  it('sends an issued row from its menu, once, and offers no Send on a draft', async () => {
    who = { ...ADMIN, permissions: [...ADMIN.permissions, 'invoice.issue'] }
    renderInvoices()
    const draftRow = (await screen.findByText('Nizwa Dates Co')).closest('tr')!
    fireEvent.click(within(draftRow).getByRole('button', { name: 'Invoice actions' }))
    expect(await screen.findByRole('menuitem', { name: 'View invoice' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Send' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })

    const issuedRow = screen.getByText('INV-2026-0042').closest('tr')!
    fireEvent.click(within(issuedRow).getByRole('button', { name: 'Invoice actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Send' }))
    const dialog = await screen.findByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Send invoice' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(await screen.findByText('The invoice was validated and queued for sending.')).toBeTruthy()
    expect(calls('/api/v1/authored-invoices/inv-1/send')).toHaveLength(1)
    await waitFor(() => expect(listCalls()).toHaveLength(2))
  })

  it('exports the list it is showing, and warns when the file stops at the cap', async () => {
    const created = vi.fn(() => 'blob:invoices')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    exportResponse = () =>
      new Response('invoiceNumber\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="fawtir-invoices.csv"',
          'X-Fawtir-Export-Truncated': 'true',
        },
      })
    renderInvoices('/invoices?tab=overdue&type=INVOICE&period=thisMonth&q=sohar')
    await screen.findByText('Sohar Port Logistics')
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    expect(await screen.findByText(/stops at 10,000 documents/)).toBeTruthy()
    expect(calls('/api/v1/authored-invoices/export.csv')).toEqual([
      '/api/v1/authored-invoices/export.csv?payment=OVERDUE&type=INVOICE&from=2026-09-01&q=sohar',
    ])
    expect(created).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('reads in Arabic with Latin digits', async () => {
    await i18n.changeLanguage('ar')
    renderInvoices()
    const row = (await screen.findByText('Sohar Port Logistics')).closest('tr')!
    expect(within(row).getByText('متأخر')).toBeTruthy()
    expect(screen.getByText('845.125')).toBeTruthy()
    expect(screen.getByText('عبر 12 فاتورة غير مدفوعة')).toBeTruthy()
  })
})

describe('invoice list mapping', () => {
  it('reads the period back from the server day, across a year end', () => {
    expect(periodRange('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange('last3Months', '2026-02-28')).toEqual({ from: '2025-12-01', to: null })
    expect(periodRange('thisYear', '2026-09-15')).toEqual({ from: '2026-01-01', to: null })
    expect(periodRange('all', '2026-09-15')).toEqual({ from: null, to: null })
  })

  it('keeps authoring, payment and delivery apart', () => {
    const credited = toInvoiceListItem(
      issued({
        payment: {
          state: 'PAID',
          overdue: false,
          daysOverdue: null,
          paidAmount: 0,
          creditedAmount: 845.125,
          outstandingAmount: 0,
        },
        deliveryState: 'SENT_MANUALLY',
      }),
    )
    expect(credited).toMatchObject({ authoring: 'issued', payment: 'paid', sentManually: true })
    expect(credited.amountNote).toEqual({
      key: 'invoicesPage.amountNote.credited',
      values: { amount: 845.125 },
    })

    const note = toInvoiceListItem(
      issued({
        type: 'CREDIT_NOTE',
        payment: {
          state: 'NOT_APPLICABLE',
          overdue: false,
          daysOverdue: null,
          paidAmount: null,
          creditedAmount: null,
          outstandingAmount: null,
        },
      }),
    )
    expect(note).toMatchObject({ authoring: 'issued', payment: null, amountNote: null })

    const awaiting_row = () =>
      issued({
        payment: {
          state: 'UNPAID',
          overdue: false,
          daysOverdue: null,
          paidAmount: 0,
          creditedAmount: 0,
          outstandingAmount: 845.125,
        },
      })
    const awaiting = toInvoiceListItem(awaiting_row())
    // Unpaid and never delivered: the design's "To be sent". Delivered by hand: awaiting payment.
    expect(awaiting).toMatchObject({ payment: 'toSend', amountNote: null })
    expect(toInvoiceListItem({ ...awaiting_row(), deliveryState: 'SENT_MANUALLY' }).payment).toBe(
      'awaiting',
    )
    expect(toInvoiceListItem({ ...awaiting_row(), peppolResponse: 'AB' })).toMatchObject({
      payment: 'awaiting',
      peppolResponse: 'AB',
    })
    expect(
      toInvoiceListItem(issued({ authoringState: 'CANCELLED', payment: null })).authoring,
    ).toBe('cancelled')
  })
})
