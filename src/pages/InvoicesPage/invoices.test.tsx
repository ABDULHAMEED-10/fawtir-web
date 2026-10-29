import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
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
  permissions: ['invoice.read', 'invoice.draft', 'invoice.export', 'branch.read'],
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
let ruleResponse: () => Response
let who: Entitlements
/** `GET /settings/subscription`, asked only for a reader with `tenant.plan.read`. */
let subscriptionResponse: () => Response

/** The sales approval rule as a server reads it with its switch off: never set, off, not available. */
const RULE_OFF = {
  version: 0,
  enabled: false,
  covers: { invoice: true, creditNote: true, debitNote: true, selfBilled: false },
  requiredApprovals: 1,
  autoApproveBelow: null,
  reason: null,
  updatedBy: null,
  updatedAt: null,
  approverCount: 0,
  available: false,
}
const RULE_ON = {
  ...RULE_OFF,
  version: 2,
  enabled: true,
  requiredApprovals: 2,
  approverCount: 3,
  available: true,
}

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))
const listCalls = () => calls('/api/v1/authored-invoices?')

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  forgetSubscriptionStanding()
  who = ADMIN
  subscriptionResponse = () => json(404, { status: 404 })
  summaryResponse = () => json(200, SUMMARY)
  salesSummaryResponse = () => json(200, { ...SUMMARY, awaiting: 6, overdue: 4, paid: 17 })
  listResponses = [() => json(200, springPage([issued(), draft()], 2))]
  discardResponse = () => json(200, draft({ authoringState: 'DISCARDED' }))
  ruleResponse = () => json(200, RULE_OFF)
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
    if (url === '/api/v1/settings/subscription') return subscriptionResponse()
    if (url === SALES_SUMMARY_URL) return salesSummaryResponse()
    if (url === '/api/v1/settings/sales-approval-rule') return ruleResponse()
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
        <Route path="/invoices/:id" element={<p>invoice page</p>} />
        <Route path="/income/credit-notes/:id" element={<p>credit note page</p>} />
        <Route path="/income/debit-notes/:id" element={<p>debit note page</p>} />
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
    // A cleared receivable may have been cleared by credit, with no cash (ACC-10).
    expect(screen.getByText('Settled')).toBeTruthy()
    expect(screen.getByText('18 documents settled by payment or credit')).toBeTruthy()
    expect(screen.queryByText(/invoices collected/)).toBeNull()
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

  it('keeps the validation sentence and a retry when the list answers 400, not "Not found"', async () => {
    // A list's 400 is a bad query parameter; only a record page reads a 400 as a missing record.
    listResponses = [
      () => json(400, { type: 'https://api.fawtir.om/problems/validation-failed', status: 400 }),
      () => json(200, springPage([issued()], 1)),
    ]
    renderInvoices()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Some details were not accepted')
    expect(screen.queryByText('Not found')).toBeNull()
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

  it('opens a credit or debit note on its own page, from the row and from the menu', async () => {
    const credit = issued({
      id: 'cn-1',
      type: 'CREDIT_NOTE',
      invoiceNumber: 'CRN-2026-0001',
      customerName: 'Credit Customer',
      payment: {
        state: 'NOT_APPLICABLE',
        overdue: false,
        daysOverdue: null,
        paidAmount: null,
        creditedAmount: null,
        outstandingAmount: null,
      },
    })
    const debit = issued({
      id: 'dn-1',
      type: 'DEBIT_NOTE',
      invoiceNumber: 'DBN-2026-0001',
      customerName: 'Debit Customer',
    })
    listResponses = [() => json(200, springPage([credit, debit, issued()], 3))]
    renderInvoices()
    const creditRow = (await screen.findByText('CRN-2026-0001')).closest('tr')!
    fireEvent.click(within(creditRow).getByRole('button', { name: 'Invoice actions' }))
    expect(
      (await screen.findByRole('menuitem', { name: 'View invoice' })).getAttribute('href'),
    ).toBe('/income/credit-notes/cn-1')
    fireEvent.keyDown(document, { key: 'Escape' })
    const debitRow = screen.getByText('DBN-2026-0001').closest('tr')!
    fireEvent.click(within(debitRow).getByRole('button', { name: 'Invoice actions' }))
    expect(
      (await screen.findByRole('menuitem', { name: 'View invoice' })).getAttribute('href'),
    ).toBe('/income/debit-notes/dn-1')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByText('Credit Customer'))
    expect(await screen.findByText('credit note page')).toBeTruthy()
  })

  it('opens an invoice row on the invoice page', async () => {
    renderInvoices()
    fireEvent.click(await screen.findByText('Sohar Port Logistics'))
    expect(await screen.findByText('invoice page')).toBeTruthy()
  })

  it('words a note as the notes lists do: To be sent until delivered, not Issued', async () => {
    const credit = (overrides: Partial<InvoiceRowDto>) =>
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
        ...overrides,
      })
    listResponses = [
      () =>
        json(
          200,
          springPage(
            [
              credit({ id: 'cn-1', invoiceNumber: 'CRN-1', customerName: 'Unsent Co' }),
              credit({
                id: 'cn-2',
                invoiceNumber: 'CRN-2',
                customerName: 'Peppol Co',
                peppolResponse: 'AP',
              }),
            ],
            2,
          ),
        ),
    ]
    renderInvoices()
    const row = (name: string) => within(screen.getByText(name).closest('tr')!)
    await screen.findByText('Unsent Co')
    expect(row('Unsent Co').getByText('To be sent')).toBeTruthy()
    expect(row('Unsent Co').queryByText('Issued')).toBeNull()
    expect(row('Peppol Co').getByText('Applied')).toBeTruthy()
  })

  it('keeps the payment pill on a paid, overdue or partly paid debit note nobody marked delivered', async () => {
    const debit = (overrides: Partial<InvoiceRowDto>) =>
      issued({ type: 'DEBIT_NOTE', deliveryState: 'NOT_SUBMITTED', ...overrides })
    const pay = (
      state: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID',
      overdue = false,
    ): NonNullable<InvoiceRowDto['payment']> => ({
      state,
      overdue,
      daysOverdue: overdue ? 4 : null,
      paidAmount: state === 'PAID' ? 10 : 0,
      creditedAmount: 0,
      outstandingAmount: state === 'PAID' ? 0 : 10,
    })
    listResponses = [
      () =>
        json(
          200,
          springPage(
            [
              debit({ id: 'dn-p', customerName: 'Paid Co', payment: pay('PAID') }),
              debit({ id: 'dn-o', customerName: 'Late Co', payment: pay('UNPAID', true) }),
              debit({ id: 'dn-h', customerName: 'Half Co', payment: pay('PARTIALLY_PAID') }),
              debit({
                id: 'dn-d',
                customerName: 'Gone Co',
                authoringState: 'DISCARDED',
                payment: null,
              }),
            ],
            4,
          ),
        ),
    ]
    renderInvoices()
    const row = (name: string) => within(screen.getByText(name).closest('tr')!)
    await screen.findByText('Paid Co')
    expect(row('Paid Co').getByText('Paid')).toBeTruthy()
    expect(row('Late Co').getByText('Overdue')).toBeTruthy()
    expect(row('Half Co').getByText('Partially paid')).toBeTruthy()
    expect(row('Gone Co').getByText('Discarded')).toBeTruthy()
    expect(screen.queryByText('To be sent')).toBeNull()
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

    expect(
      await screen.findByText('The invoice was validated and queued for sending.'),
    ).toBeTruthy()
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

describe('Read-only subscription: no new drafts and nothing sent (ST-2, CA-3; owner, 23 Oct 2026)', () => {
  const OWNER: Entitlements = {
    ...ADMIN,
    permissions: [...ADMIN.permissions, 'invoice.issue', 'creditnote.create', 'tenant.plan.read'],
  }
  const standing = (restriction: string | null, extra: Record<string, unknown> = {}) => ({
    tracked: true,
    access: restriction ? 'PAYMENT_REQUIRED' : 'ACTIVE',
    restrictionsEnforced: true,
    restriction,
    today: '2026-10-23',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodPrice: '80.000',
    trialStartsOn: null,
    trialEndsOn: null,
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: '2026-10-14',
    renewsOn: '2026-10-15',
    graceDays: 7,
    graceUntil: '2026-10-21',
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: null,
    enterprise: null,
    ...extra,
  })
  const subscriptionRead = () => calls('/api/v1/settings/subscription').length > 0
  const issuedRowMenu = async () => {
    const row = screen.getByText('INV-2026-0042').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Invoice actions' }))
    await screen.findByRole('menuitem', { name: 'View invoice' })
  }

  it('offers Create invoice, Bulk upload, Send, Duplicate, credit note and periodic while usable', async () => {
    who = OWNER
    subscriptionResponse = () => json(200, standing(null))
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    expect(screen.getByRole('link', { name: /Create Invoice/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Bulk upload/ })).toBeTruthy()
    await issuedRowMenu()
    expect(screen.getByRole('menuitem', { name: 'Send' })).toBeTruthy()
    expect(
      screen.getByRole('menuitem', { name: i18n.t('rowActions.invoice.duplicate') }),
    ).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Issue credit note' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Periodic invoice' })).toBeTruthy()
  })

  it.each([
    ['suspended', standing('SUBSCRIPTION_SUSPENDED')],
    [
      'trial ended unpaid',
      standing('SUBSCRIPTION_SUSPENDED', { paidThrough: null, trialEndsOn: '2026-10-21' }),
    ],
    ['cancelled', standing('SUBSCRIPTION_CANCELLED', { access: 'CANCELLED' })],
  ])('hides them while %s; viewing and discarding an old draft stay', async (_, status) => {
    who = OWNER
    subscriptionResponse = () => json(200, status)
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    await waitFor(() => expect(screen.queryByRole('link', { name: /Create Invoice/ })).toBeNull())
    expect(screen.queryByRole('button', { name: /Bulk upload/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Export/ })).toBeTruthy()
    await issuedRowMenu()
    expect(screen.queryByRole('menuitem', { name: 'Send' })).toBeNull()
    expect(
      screen.queryByRole('menuitem', { name: i18n.t('rowActions.invoice.duplicate') }),
    ).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Issue credit note' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Periodic invoice' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    const draftRow = screen.getByText('Nizwa Dates Co').closest('tr')!
    fireEvent.click(within(draftRow).getByRole('button', { name: 'Invoice actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeTruthy()
  })

  it('hides nothing with the backend switch off', async () => {
    who = OWNER
    subscriptionResponse = () =>
      json(200, standing(null, { restrictionsEnforced: false, access: 'PAYMENT_REQUIRED' }))
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    expect(screen.getByRole('link', { name: /Create Invoice/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Bulk upload/ })).toBeTruthy()
  })

  // Both checks hold together: read-only (ST-2) and the plan's switch (PL-8). A door shows only
  // when both allow it.
  const withPlan = (on: boolean): Entitlements => ({
    ...OWNER,
    planFeaturesEnforced: true,
    planFeatures: { bulkUpload: on, recurringInvoices: on },
  })

  it('shows Bulk upload and Periodic invoice when usable and the plan has them', async () => {
    who = withPlan(true)
    subscriptionResponse = () => json(200, standing(null))
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    expect(await screen.findByRole('button', { name: /Bulk upload/ })).toBeTruthy()
    await issuedRowMenu()
    expect(screen.getByRole('menuitem', { name: 'Periodic invoice' })).toBeTruthy()
  })

  it('hides them when usable but the plan lacks them', async () => {
    who = withPlan(false)
    subscriptionResponse = () => json(200, standing(null))
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    expect(screen.getByRole('link', { name: /Create Invoice/ })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Bulk upload/ })).toBeNull())
    await issuedRowMenu()
    expect(screen.queryByRole('menuitem', { name: 'Periodic invoice' })).toBeNull()
  })

  it('hides them when the plan has them but the subscription is read-only', async () => {
    who = withPlan(true)
    subscriptionResponse = () => json(200, standing('SUBSCRIPTION_SUSPENDED'))
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    await waitFor(() => expect(screen.queryByRole('link', { name: /Create Invoice/ })).toBeNull())
    expect(screen.queryByRole('button', { name: /Bulk upload/ })).toBeNull()
    await issuedRowMenu()
    expect(screen.queryByRole('menuitem', { name: 'Periodic invoice' })).toBeNull()
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
    expect(note).toMatchObject({
      authoring: 'issued',
      payment: null,
      amountNote: null,
      noteStatus: 'toSend',
    })
    expect(toInvoiceListItem(issued()).noteStatus).toBeNull()
    // A debit note's payment outranks "To be sent": the backend sends no Peppol response, so an
    // undelivered paid note is the normal case.
    const paidDebit = toInvoiceListItem(
      issued({
        type: 'DEBIT_NOTE',
        payment: {
          state: 'PAID',
          overdue: false,
          daysOverdue: null,
          paidAmount: 845.125,
          creditedAmount: 0,
          outstandingAmount: 0,
        },
      }),
    )
    expect(paidDebit).toMatchObject({ noteStatus: null, payment: 'paid' })
    expect(toInvoiceListItem(issued({ type: 'DEBIT_NOTE' }))).toMatchObject({
      noteStatus: null,
      payment: 'overdue',
    })

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

describe("the approvers' queue (RL-6)", () => {
  const APPROVER: Entitlements = {
    ...ADMIN,
    permissions: [...ADMIN.permissions, 'invoice.approve'],
  }

  it('is offered to an approver while the company rule is on, counted from the summary', async () => {
    who = APPROVER
    ruleResponse = () => json(200, RULE_ON)
    salesSummaryResponse = () =>
      json(200, { ...SUMMARY, awaiting: 6, overdue: 4, paid: 17, awaitingApproval: 2 })
    renderInvoices()
    const tab = await screen.findByRole('button', { name: /To approve/ })
    expect(within(tab).getByText('2')).toBeTruthy()
  })

  it('is not offered to an approver while sales approval is off, whatever the summary says', async () => {
    // A bill approver on a deployment with the switch off: the rule reads off, and the summary
    // carries awaitingApproval 0 as it always does.
    who = APPROVER
    salesSummaryResponse = () =>
      json(200, { ...SUMMARY, awaiting: 6, overdue: 4, paid: 17, awaitingApproval: 0 })
    renderInvoices('/invoices?tab=toApprove')
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('button', { name: /To approve/ })).toBeNull()
    // The address naming the queue opens on All, and nothing asks for approval=PENDING.
    expect(listCalls()[0]).toBe(FIRST_PAGE)
    expect(listCalls().some((url) => url.includes('approval='))).toBe(false)
  })

  it('is not offered for a rule left on after the deployment switch was turned off', async () => {
    who = APPROVER
    ruleResponse = () => json(200, { ...RULE_ON, available: false })
    salesSummaryResponse = () =>
      json(200, { ...SUMMARY, awaiting: 6, overdue: 4, paid: 17, awaitingApproval: 2 })
    renderInvoices('/invoices?tab=toApprove')
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('button', { name: /To approve/ })).toBeNull()
    expect(listCalls().some((url) => url.includes('approval='))).toBe(false)
  })

  it('is not offered by a server that does not say whether sales approval is available', async () => {
    who = APPROVER
    const older: Partial<typeof RULE_ON> = { ...RULE_ON }
    delete older.available
    ruleResponse = () => json(200, older)
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('button', { name: /To approve/ })).toBeNull()
  })

  it('is not offered when the rule cannot be read (switched off, refused)', async () => {
    who = APPROVER
    ruleResponse = () => json(503, { status: 503, code: 'SALES_APPROVAL_UNAVAILABLE' })
    renderInvoices()
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('button', { name: /To approve/ })).toBeNull()
  })

  it('is not offered without the code, and the rule is not even asked for', async () => {
    renderInvoices('/invoices?tab=toApprove')
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('button', { name: /To approve/ })).toBeNull()
    expect(listCalls()[0]).toBe(FIRST_PAGE)
    expect(calls('/api/v1/settings/sales-approval-rule')).toHaveLength(0)
  })

  it('asks for drafts waiting for approval, and says so when there are none', async () => {
    who = APPROVER
    ruleResponse = () => json(200, RULE_ON)
    listResponses = [() => json(200, springPage([]))]
    renderInvoices('/invoices?tab=toApprove')
    expect(await screen.findByText('Nothing is waiting for your approval.')).toBeTruthy()
    // The list waited for the rule: its first request is already the queue's.
    const asked = listCalls()[0]
    expect(asked).toContain('state=DRAFT&')
    expect(asked).toContain('approval=PENDING')
  })

  it('marks a draft row with its approval state', async () => {
    listResponses = [() => json(200, springPage([draft({ approvalState: 'PENDING' })]))]
    renderInvoices()
    expect(await screen.findByText('Waiting for approval')).toBeTruthy()
    expect(toInvoiceListItem(draft({ approvalState: 'REJECTED' })).approval).toBe('REJECTED')
    // An issued row never carries one, whatever arrives.
    expect(toInvoiceListItem(issued({ approvalState: 'APPROVED' })).approval).toBeNull()
  })
})

// Business Rules PL-8: bulk upload and periodic invoices are plan features; a plan that has them
// switched off keeps the list and hides the doors to them.
describe('a plan without bulk upload or periodic invoices (PL-8)', () => {
  it("hides Bulk upload and the row menu's Periodic invoice", async () => {
    who = {
      ...ADMIN,
      planFeaturesEnforced: true,
      planFeatures: { bulkUpload: false, recurringInvoices: false },
    }
    renderInvoices()
    const issuedRow = (await screen.findByText('INV-2026-0042')).closest('tr')!
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bulk upload' })).toBeNull())
    fireEvent.click(within(issuedRow).getByRole('button', { name: 'Invoice actions' }))
    expect(await screen.findByRole('menuitem', { name: 'View invoice' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Periodic invoice' })).toBeNull()
  })

  it('offers both when the plan has them', async () => {
    who = {
      ...ADMIN,
      planFeaturesEnforced: true,
      planFeatures: { bulkUpload: true, recurringInvoices: true },
    }
    renderInvoices()
    await screen.findByText('INV-2026-0042')
    expect(await screen.findByRole('button', { name: 'Bulk upload' })).toBeTruthy()
  })
})
