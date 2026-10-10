import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { InvoiceRowDto, InvoiceSummaryDto } from '../../api/invoices/list'
import type { AgreementDto } from '../../api/selfBilling/agreements'
import { SelfBillingPage } from './SelfBillingPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const LIST_URL = '/api/v1/authored-invoices'
const SUMMARY_URL = '/api/v1/authored-invoices/summary'

const USER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'selfbilling.agreement.manage'],
  scopes: [],
  featureFlags: {},
}

function row(overrides: Partial<InvoiceRowDto> = {}): InvoiceRowDto {
  return {
    id: 'i-1',
    type: 'SELF_BILLED_INVOICE',
    version: 1,
    authoringState: 'ISSUED',
    deliveryState: 'NOT_SENT',
    customerId: 'c-1',
    currency: 'OMR',
    invoiceNumber: 'SB-0001',
    issueDate: '2026-09-10',
    dueDate: '2026-10-10',
    details: { subject: null, purchaseOrderReference: null },
    lines: [],
    totals: { totalAmount: 420.5 },
    customerName: 'Muscat Roastery Co',
    payment: null,
    ...overrides,
  }
}

function agreement(overrides: Partial<AgreementDto> = {}): AgreementDto {
  return {
    id: 'a-1',
    customerId: 'c-1',
    agreementReference: 'SBA-1',
    status: 'ACTIVE',
    sellerIdentityAssurance: 'COUNTERPARTY_VERIFIED',
    verifiedParticipant: '0248:om1',
    verifiedAt: '2026-09-01T00:00:00Z',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    withdrawnAt: null,
    withdrawalReason: null,
    version: 0,
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
let rows: InvoiceRowDto[]
let agreements: AgreementDto[]
let summary: Partial<InvoiceSummaryDto>

const calls = () => fetchMock.mock.calls.map(([url]) => String(url))
const listCalls = () =>
  calls().filter((url) => url.startsWith(LIST_URL) && !url.startsWith(SUMMARY_URL))
const summaryCalls = () => calls().filter((url) => url.startsWith(SUMMARY_URL))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = USER
  rows = [row()]
  agreements = [agreement()]
  summary = {
    currencyCode: 'OMR',
    asOf: '2026-09-30',
    issuedThisMonth: { count: 0, total: 0, vat: 0 },
    awaitingSupplier: { count: 0, oldestIssueDate: null },
  }

  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    if (url.startsWith('/api/v1/self-billing-agreements')) return json(200, agreements)
    if (url.startsWith(SUMMARY_URL)) return json(200, summary)
    if (url.startsWith(LIST_URL)) {
      const asked = (new URL(url, 'http://x').searchParams.get('type') ?? '')
        .split(',')
        .filter(Boolean)
      const matching =
        asked.length === 0 ? rows : rows.filter((entry) => asked.includes(entry.type))
      return json(200, { content: matching, page: 0, size: 25, totalElements: matching.length })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/**
 * The cards count days from Muscat's today; pin the clock mid-day so the UTC date the tests build
 * from is the same day in Muscat whatever hour the suite runs.
 */
function pinMuscatMidday() {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-25T09:00:00Z'))
}

function renderPage(path = '/expenditure/self-billing') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/self-billing" element={<SelfBillingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the self-billed documents list', () => {
  it('asks for both self-billed types in one request, never for everything', async () => {
    renderPage()
    await screen.findByText('SB-0001')
    // One request the server pages, not two stitched together: stitching drops rows at a page
    // boundary. And the type is always pinned, so no ordinary invoice can reach this page.
    const asked = decodeURIComponent(listCalls().at(-1) ?? '')
    expect(asked).toContain('type=SELF_BILLED_INVOICE,SELF_BILLED_CREDIT_NOTE')
    expect(listCalls()).toHaveLength(1)
  })

  it('shows both types together on All', async () => {
    rows = [row(), row({ id: 'i-2', type: 'SELF_BILLED_CREDIT_NOTE', invoiceNumber: 'SBCN-1' })]
    renderPage()
    expect(await screen.findByText('SB-0001')).toBeTruthy()
    expect(screen.getByText('SBCN-1')).toBeTruthy()
  })

  it('names these as supplier invoices, because the row looks exactly like a receivable otherwise', async () => {
    renderPage()
    await screen.findByText('SB-0001')
    // The frame's title and subtitle (Figma 154:157643).
    expect(screen.getByRole('heading', { level: 1, name: 'Self-billed invoices' })).toBeTruthy()
    expect(screen.getByText(/your supplier invoices via Peppol/i)).toBeTruthy()
    // The design's columns: the counterparty is the supplier, the figure the amount.
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Supplier' })).toBeTruthy()
    // The frame's tabs, in its order.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'All1',
      'Drafts',
      'To send',
      'Awaiting confirmation',
      'Disputed',
      'Confirmed',
      'Paid',
    ])
  })

  it('draws the two tabs no state answers as empty and says why, asking the server for nothing', async () => {
    renderPage()
    await screen.findByText('SB-0001')
    fireEvent.click(screen.getByRole('tab', { name: 'Disputed' }))
    expect(await screen.findByText(/Supplier confirmations are not reported/)).toBeTruthy()
    expect(listCalls()).toHaveLength(1)
  })

  it('names what the agreement on file permits under each supplier', async () => {
    agreements = [agreement({ effectiveTo: '2026-12-31' })]
    renderPage()
    expect(await screen.findByText(/Agreement valid to/)).toBeTruthy()

    cleanup()
    agreements = []
    renderPage()
    expect(await screen.findByText('No signed agreement: cannot be issued')).toBeTruthy()
  })

  it('switches type by asking the server again rather than sifting a page', async () => {
    rows = [row(), row({ id: 'i-2', type: 'SELF_BILLED_CREDIT_NOTE', invoiceNumber: 'SBCN-1' })]
    renderPage()
    await screen.findByText('SB-0001')

    // The type is the design's "Filters" menu, not a second row of tabs.
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Credit notes' }))
    await waitFor(() =>
      expect(decodeURIComponent(listCalls().at(-1) ?? '')).toContain(
        'type=SELF_BILLED_CREDIT_NOTE&',
      ),
    )
    expect(await screen.findByText('SBCN-1')).toBeTruthy()
    expect(screen.queryByText('SB-0001')).toBeNull()
  })

  it('asks the server for what is still to send, rather than every issued document', async () => {
    renderPage('/expenditure/self-billing?tab=toSend')
    await waitFor(() => expect(listCalls().at(-1)).toContain('delivery=TO_SEND'))
    expect(listCalls().at(-1)).toContain('state=ISSUED')
  })

  it('asks the server for the status tab too', async () => {
    renderPage()
    await screen.findByText('SB-0001')
    fireEvent.click(screen.getByRole('tab', { name: 'Drafts' }))
    await waitFor(() => expect(listCalls().at(-1)).toContain('state=DRAFT'))
  })

  it('counts only the agreements that could actually be used', async () => {
    agreements = [
      agreement({ id: 'a-1' }),
      agreement({ id: 'a-2', sellerIdentityAssurance: 'UNVERIFIED' }),
      agreement({ id: 'a-3', status: 'SUSPENDED' }),
    ]
    renderPage()
    // Three agreements, one issuable: an unverified or suspended one authorises nothing.
    expect(await screen.findByText(/1 supplier can be self-billed today/)).toBeTruthy()
  })

  it('warns when nothing can be self-billed at all', async () => {
    agreements = [agreement({ sellerIdentityAssurance: 'UNVERIFIED' })]
    renderPage()
    expect(await screen.findByText(/No supplier can be self-billed today/)).toBeTruthy()
  })

  it("names the supplier whose agreement ends soonest on the frame's fourth card", async () => {
    pinMuscatMidday()
    // Ends in 9 days from the row's issue date... the card counts from today.
    const soon = new Date()
    soon.setUTCDate(soon.getUTCDate() + 9)
    agreements = [agreement({ effectiveTo: soon.toISOString().slice(0, 10) })]
    renderPage()
    expect(await screen.findByText('Muscat Roastery Co expires in 9 days')).toBeTruthy()
  })

  it('counts the agreements ending soon on the fourth card rather than pricing them', async () => {
    pinMuscatMidday()
    const soon = new Date()
    soon.setUTCDate(soon.getUTCDate() + 9)
    const ends = soon.toISOString().slice(0, 10)
    agreements = [
      agreement({ id: 'a-1', effectiveTo: ends }),
      agreement({ id: 'a-2', customerId: 'c-2', effectiveTo: ends }),
    ]
    renderPage()
    const card = (await screen.findByText('Agreements expiring')).closest('article')!
    // Two agreements, drawn as a count: no rial sign, no three decimals.
    expect(await within(card as HTMLElement).findByText('2')).toBeTruthy()
    expect(card.textContent).not.toMatch(/\d\.\d{3}/)
    expect(card.querySelectorAll('img')).toHaveLength(1)
  })

  it('offers the create button only to someone who may self-bill', async () => {
    renderPage()
    await screen.findByText('SB-0001')
    // invoice.draft is not enough: writing on someone else's behalf is a different authority.
    expect(screen.queryByRole('link', { name: /create self-billing invoice/i })).toBeNull()

    cleanup()
    forgetEntitlements()
    who = { ...USER, permissions: [...USER.permissions, 'selfbilling.create'] }
    renderPage()
    await screen.findByText('SB-0001')
    expect(
      screen.getByRole('link', { name: /create self-billing invoice/i }).getAttribute('href'),
    ).toBe('/expenditure/self-billing/new')
  })

  it('draws the first three cards from the summary of self-billed invoices, not from the page', async () => {
    pinMuscatMidday()
    const oldest = new Date()
    oldest.setUTCDate(oldest.getUTCDate() - 4)
    summary = {
      ...summary,
      issuedThisMonth: { count: 3, total: 1234.5, vat: 58.786 },
      awaitingSupplier: { count: 7, oldestIssueDate: oldest.toISOString().slice(0, 10) },
    }
    renderPage()
    // Invoices only (a self-billed credit note would reduce the month), in the rial the cards draw.
    await waitFor(() => expect(summaryCalls()).toHaveLength(1))
    const asked = new URL(summaryCalls()[0], 'http://x').searchParams
    expect(asked.getAll('type')).toEqual(['SELF_BILLED_INVOICE'])
    expect(asked.get('currency')).toBe('OMR')

    expect(await screen.findByText('1,234.500')).toBeTruthy()
    expect(screen.getByText('Across 3 documents')).toBeTruthy()
    expect(screen.getByText('58.786')).toBeTruthy()
    // The page holds one row; the card counts the whole tenant.
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('Oldest raised 4 days ago')).toBeTruthy()
  })

  it('says nothing is waiting on a supplier when the summary counts none', async () => {
    renderPage()
    expect(await screen.findByText('Nothing is waiting on a supplier')).toBeTruthy()
  })

  it('links a row to its own detail page', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: 'SB-0001' })
    expect(link.getAttribute('href')).toBe('/expenditure/self-billing/i-1')
  })

  it("sends a draft's number to the composer the row opens, not the detail page", async () => {
    who = { ...USER, permissions: [...USER.permissions, 'selfbilling.create'] }
    rows = [
      row({
        id: 'sbc-1',
        type: 'SELF_BILLED_CREDIT_NOTE',
        authoringState: 'DRAFT',
        invoiceNumber: null,
      }),
      row({ id: 'sbi-1', authoringState: 'DRAFT', invoiceNumber: null }),
      row({ id: 'i-1' }),
    ]
    renderPage()
    await screen.findByRole('link', { name: 'SB-0001' })
    const drafts = screen.getAllByRole('link', { name: 'Not numbered yet' })
    expect(drafts.map((link) => link.getAttribute('href'))).toEqual([
      '/expenditure/self-billing/credit-notes/sbc-1/edit',
      '/expenditure/self-billing/sbi-1/edit',
    ])
    expect(screen.getByRole('link', { name: 'SB-0001' }).getAttribute('href')).toBe(
      '/expenditure/self-billing/i-1',
    )
  })

  it('reopens a self-billed credit note draft in the credit-note composer it was written in', async () => {
    who = { ...USER, permissions: [...USER.permissions, 'selfbilling.create'] }
    rows = [
      row({
        id: 'sbc-1',
        type: 'SELF_BILLED_CREDIT_NOTE',
        authoringState: 'DRAFT',
        invoiceNumber: null,
        customerName: 'Credit Supplier',
      }),
      row({
        id: 'sbi-1',
        authoringState: 'DRAFT',
        invoiceNumber: null,
        customerName: 'Invoice Supplier',
      }),
    ]
    const at = (path: string) => (
      <Routes>
        <Route path="/expenditure/self-billing" element={<SelfBillingPage />} />
        <Route
          path="/expenditure/self-billing/credit-notes/:id/edit"
          element={<p>note composer {path}</p>}
        />
        <Route path="/expenditure/self-billing/:id/edit" element={<p>self-bill composer</p>} />
      </Routes>
    )
    render(<MemoryRouter initialEntries={['/expenditure/self-billing']}>{at('sbc')}</MemoryRouter>)
    fireEvent.click(await screen.findByText('Credit Supplier'))
    expect(await screen.findByText('note composer sbc')).toBeTruthy()

    cleanup()
    render(<MemoryRouter initialEntries={['/expenditure/self-billing']}>{at('sbi')}</MemoryRouter>)
    fireEvent.click(await screen.findByText('Invoice Supplier'))
    expect(await screen.findByText('self-bill composer')).toBeTruthy()
  })

  it('shows an empty state per type rather than one that could mislead', async () => {
    rows = []
    renderPage()
    expect(await screen.findByText('No self-billed documents here.')).toBeTruthy()
  })
})
