import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SupplierListRowDto, SupplierSummaryDto } from '../../api/expenditure/suppliers'
import { toSupplierListItem } from '../../lib/supplierList'
import { SuppliersPage } from './SuppliersPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/suppliers/summary'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'supplier.read',
    'supplier.manage',
    'customer.import',
    'invoice.payment.manage',
    'purchase-order.manage',
  ],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['supplier.read'] }

// Figures unlike the mock book (68 suppliers, 11,247.880 owed), so a figure on screen can only
// have come from the API.
const SUMMARY: SupplierSummaryDto = {
  currencyCode: 'OMR',
  total: 23,
  active: 21,
  switchedOff: 2,
  onPeppol: 9,
  notOnPeppol: 14,
  owedTotal: 4321.5,
  openBills: 7,
  needsFix: { noBankDetails: 4, noVat: 3, bankChanged: 1 },
  owedSuppliers: 5,
  needsFixSuppliers: 6,
}

function row(overrides: Partial<SupplierListRowDto> = {}): SupplierListRowDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    displayName: 'Qalhat Marine Supplies',
    vatNumber: 'OM1100999001',
    billingChannel: 'PEPPOL',
    participantId: '0248:OM1100999001',
    selfBilling: false,
    terms: {
      paymentTerms: 'Net 45',
      netDays: 45,
      earlyPaymentDiscountPercent: 1.5,
      earlyPaymentDiscountDays: 10,
      earlyPaymentDiscount: '1.5% within 10 days',
    },
    youOwe: { amount: 812.25, currency: 'OMR', openBills: 3, onHold: 1 },
    record: {
      health: [],
      paidOnTimeCount: 7,
      settledCount: 9,
      paidOnTime: '7 of 9',
      bankChangedAt: null,
    },
    status: 'ACTIVE',
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
let listResponses: Array<() => Response>
let summaryResponse: () => Response
let who: Entitlements

const listCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/v1/suppliers?') || url === '/api/v1/suppliers')

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  summaryResponse = () => json(200, SUMMARY)
  listResponses = [() => json(200, { items: [row()], page: 0, pageSize: 10, count: 1, total: 1 })]
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === SUMMARY_URL) return summaryResponse()
    if (/\/switch-(off|on)$/.test(url) && init?.method === 'POST') return json(200, {})
    if (url.startsWith('/api/v1/suppliers')) {
      const next = listResponses.length > 1 ? listResponses.shift()! : listResponses[0]
      return next()
    }
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSuppliers(path = '/suppliers') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Suppliers list, wired to the API', () => {
  it('shows the summary cards, tab counts and rows the API returned', async () => {
    renderSuppliers()
    expect(await screen.findByText('Qalhat Marine Supplies')).toBeTruthy()
    expect(screen.getAllByText('23')).toHaveLength(2) // the Suppliers card and the All tab
    expect(screen.getByText('4,321.500')).toBeTruthy()
    const tabs = screen.getByRole('button', { name: /Needs fix/ })
    expect(within(tabs).getByText('6')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /You owe them/ })).getByText('5')).toBeTruthy()
    // The row is written from the row's own fields.
    expect(screen.getByText('812.250')).toBeTruthy()
    expect(screen.getByText('3 open · 1 on hold')).toBeTruthy()
    expect(screen.getByText('Net 45')).toBeTruthy()
    expect(screen.getByText('1.5% if paid in 10 days')).toBeTruthy()
    expect(screen.getByText('7 of 9 paid on time')).toBeTruthy()
    expect(listCalls()[0]).toBe('/api/v1/suppliers?page=0&page_size=10')
  })

  it('asks the server for the tab, the search and the sort', async () => {
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')

    fireEvent.click(screen.getByRole('button', { name: /You owe them/ }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe('/api/v1/suppliers?filter=OWED&page=0&page_size=10'),
    )

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'qalhat' } })
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe('/api/v1/suppliers?filter=OWED&q=qalhat&page=0&page_size=10'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Most owed first' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/suppliers?filter=OWED&q=qalhat&sort=OWED_DESC&page=0&page_size=10',
      ),
    )
  })

  it('pages with the total the server counted', async () => {
    listResponses = [
      () => json(200, { items: [row()], page: 0, pageSize: 10, count: 10, total: 23 }),
      () =>
        json(200, {
          items: [row({ id: '2', displayName: 'Second Page Trading' })],
          page: 1,
          pageSize: 10,
          count: 10,
          total: 23,
        }),
    ]
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.getByText('Showing 1 of 23 suppliers')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(await screen.findByText('Second Page Trading')).toBeTruthy()
    expect(listCalls().at(-1)).toBe('/api/v1/suppliers?page=2&page_size=10')
  })

  it('shows the first-supplier state for an empty directory', async () => {
    summaryResponse = () => json(200, { ...SUMMARY, total: 0, active: 0, switchedOff: 0 })
    renderSuppliers()
    expect(await screen.findByRole('link', { name: /Add your first supplier/i })).toBeTruthy()
  })

  it('says nothing matched when a filter finds no one', async () => {
    listResponses = [() => json(200, { items: [], page: 0, pageSize: 10, count: 0, total: 0 })]
    renderSuppliers('/suppliers?q=zzz')
    expect(await screen.findByText('No suppliers match what you are looking for.')).toBeTruthy()
  })

  it('reads a refusal as "no access", not as an empty list', async () => {
    summaryResponse = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderSuppliers()
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(screen.queryByText('No suppliers match what you are looking for.')).toBeNull()
  })

  it('offers a retry with the reference when the list fails', async () => {
    listResponses = [
      () =>
        json(500, {
          type: 'https://api.fawtir.om/problems/internal-error',
          correlationId: 'corr-77',
        }),
      () => json(200, { items: [row()], page: 0, pageSize: 10, count: 1, total: 1 }),
    ]
    renderSuppliers()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: corr-77')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Qalhat Marine Supplies')).toBeTruthy()
  })

  it('narrows the fetched page by channel from the Filters menu', async () => {
    listResponses = [
      () =>
        json(200, {
          items: [
            row(),
            row({
              id: '2',
              displayName: 'Paper Trail Stationery',
              billingChannel: 'PAPER',
              participantId: null,
            }),
          ],
          page: 0,
          pageSize: 10,
          count: 2,
          total: 2,
        }),
    ]
    renderSuppliers()
    await screen.findByText('Paper Trail Stationery')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Paper' }))
    await waitFor(() => expect(screen.queryByText('Qalhat Marine Supplies')).toBeNull())
    expect(screen.getByText('Paper Trail Stationery')).toBeTruthy()
    expect(screen.getByText('Showing 1 of 2 suppliers')).toBeTruthy()
    // No channel parameter exists on the API yet: the request is the same page.
    expect(listCalls().at(-1)).toBe('/api/v1/suppliers?page=0&page_size=10')
  })

  it('offers a new order and a new bill in the row menu of an active supplier', async () => {
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByText('New purchase order')).toBeTruthy()
    expect(screen.getByText('Record a bill')).toBeTruthy()
    // "Copy into a new supplier" names the row it copies.
    expect(screen.getByText('Copy into a new supplier').closest('a')?.getAttribute('href')).toBe(
      '/suppliers/new?copy=11111111-1111-1111-1111-111111111111',
    )
  })

  it('offers only what the reader may do', async () => {
    who = READ_ONLY
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.queryByRole('link', { name: /New supplier/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Import/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByText('Export their statement')).toBeTruthy()
    expect(screen.queryByText('Switch this supplier off')).toBeNull()
  })

  it('switches a supplier off on the server after the dialog, then reads the list again', async () => {
    listResponses = [
      () => json(200, { items: [row()], page: 0, pageSize: 10, count: 1, total: 1 }),
      () =>
        json(200, {
          items: [row({ status: 'SWITCHED_OFF' })],
          page: 0,
          pageSize: 10,
          count: 1,
          total: 1,
        }),
    ]
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    fireEvent.click(await screen.findByText('Switch this supplier off'))
    // The frame's dialog (163:29066) asks first: nothing is sent until "Switch them off".
    const dialog = await screen.findByRole('dialog', { name: 'Switch off Qalhat Marine Supplies' })
    expect(within(dialog).getByText('3 bills are still open with them')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/switch-off'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stopped trading with them' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch them off' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/suppliers/11111111-1111-1111-1111-111111111111/switch-off',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findAllByText('Switched off')).toBeTruthy()
  })
})

describe('Switched-off suppliers', () => {
  it('turns one back on from the row button instead of opening its record', async () => {
    listResponses = [
      () =>
        json(200, {
          items: [row({ status: 'SWITCHED_OFF' })],
          page: 0,
          pageSize: 10,
          count: 1,
          total: 1,
        }),
      () => json(200, { items: [row()], page: 0, pageSize: 10, count: 1, total: 1 }),
    ]
    renderSuppliers('/suppliers?tab=switchedOff')
    fireEvent.click(await screen.findByRole('button', { name: 'Turn back on' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/suppliers/11111111-1111-1111-1111-111111111111/switch-on',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('offers no new order and no new bill for one in the row menu', async () => {
    listResponses = [
      () =>
        json(200, {
          items: [row({ status: 'SWITCHED_OFF' })],
          page: 0,
          pageSize: 10,
          count: 1,
          total: 1,
        }),
    ]
    renderSuppliers('/suppliers?tab=switchedOff')
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByText('Export their statement')).toBeTruthy()
    expect(screen.queryByText('New purchase order')).toBeNull()
    expect(screen.queryByText('Record a bill')).toBeNull()
  })

  it('does not offer it to someone who may not manage suppliers', async () => {
    who = READ_ONLY
    listResponses = [
      () =>
        json(200, {
          items: [row({ status: 'SWITCHED_OFF' })],
          page: 0,
          pageSize: 10,
          count: 1,
          total: 1,
        }),
    ]
    renderSuppliers('/suppliers?tab=switchedOff')
    await screen.findByText('Qalhat Marine Supplies')
    expect(screen.queryByRole('button', { name: 'Turn back on' })).toBeNull()
  })
})

describe('toSupplierListItem', () => {
  it('shows the worst issue first and scores the four record checks', () => {
    const risky = toSupplierListItem(
      row({ record: { ...row().record, health: ['NO_VAT_NUMBER', 'BANK_CHANGED_UNCONFIRMED'] } }),
    )
    expect(risky.issue).toBe('bankChanged')
    expect(risky.score).toBe(2)
    expect(risky.recordNote?.key).toBe('suppliersPage.recordNote.confirmBeforeRun')

    const complete = toSupplierListItem(row())
    expect(complete).toMatchObject({ issue: 'complete', score: 4, owedAlert: true })

    // The frame's "Bank changed 4d ago", from the row's own date.
    const now = Date.parse('2026-09-25T12:00:00Z')
    const dated = toSupplierListItem(
      row({
        record: {
          ...row().record,
          health: ['BANK_CHANGED_UNCONFIRMED'],
          bankChangedAt: '2026-09-21T09:00:00Z',
        },
      }),
      now,
    )
    expect(dated.recordLabel).toEqual({
      key: 'suppliersPage.record.bankChangedAgo',
      values: { count: 4 },
    })
    expect(
      toSupplierListItem(row({ status: 'SWITCHED_OFF', switchedOffAt: '2026-04-12T09:30:00Z' }))
        .switchedOffAt,
    ).toBe('2026-04-12T09:30:00Z')

    const offNetwork = toSupplierListItem(row({ billingChannel: 'MANUAL', participantId: null }))
    expect(offNetwork).toMatchObject({
      issue: 'notOnPeppol',
      channel: 'manual',
      channelNote: null,
      score: 3,
    })

    expect(toSupplierListItem(row({ status: 'SWITCHED_OFF' }))).toMatchObject({
      issue: 'switchedOff',
      score: 0,
    })
  })

  it('writes nothing the row cannot support', () => {
    const bare = toSupplierListItem(
      row({
        terms: {
          paymentTerms: null,
          netDays: null,
          earlyPaymentDiscountPercent: null,
          earlyPaymentDiscountDays: null,
          earlyPaymentDiscount: null,
        },
        youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
        record: {
          health: [],
          paidOnTimeCount: 0,
          settledCount: 0,
          paidOnTime: '0 of 0',
          bankChangedAt: null,
        },
      }),
    )
    expect(bare.terms).toEqual({ key: 'suppliersPage.terms.none' })
    expect(bare.termsNote).toBeNull()
    expect(bare.owedNote.key).toBe('suppliersPage.owedNote.nothingOpen')
    expect(bare.recordNote).toBeNull()
    expect(
      toSupplierListItem(
        row({ terms: { ...row().terms, netDays: 0, paymentTerms: 'DUE_ON_RECEIPT' } }),
      ).terms,
    ).toEqual({
      key: 'suppliersPage.terms.onReceipt',
    })
    expect(
      toSupplierListItem(
        row({ terms: { ...row().terms, netDays: null, paymentTerms: 'End of month' } }),
      ).terms,
    ).toEqual({
      text: 'End of month',
    })
  })
})
