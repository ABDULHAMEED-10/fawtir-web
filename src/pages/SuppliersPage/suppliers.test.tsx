import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { answerStanding, settle, standingRead } from '../../testing/subscriptionStanding'
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

/** The body of the one `switch-off` call, or undefined when none was made (or it carried none). */
const switchOffBody = () => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/switch-off'))
  const body = (call?.[1] as RequestInit | undefined)?.body
  return typeof body === 'string' ? JSON.parse(body) : undefined
}

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
    // The server is asked for the channel. This one ignored it (an older backend answers every
    // channel), and the list still shows only the matching rows of the page, as it did before.
    expect(listCalls().at(-1)).toBe('/api/v1/suppliers?channel=PAPER&page=0&page_size=10')
  })

  it('lets the server narrow the rows and the total by channel', async () => {
    const paper = row({
      id: '2',
      displayName: 'Paper Trail Stationery',
      billingChannel: 'PAPER',
      participantId: null,
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (url === ENTITLEMENTS_URL) return json(200, who)
      if (url === SUMMARY_URL) return summaryResponse()
      // A backend that filters: only the paper suppliers, and how many of them there are.
      if (url.includes('channel=PAPER'))
        return json(200, { items: [paper], page: 0, pageSize: 10, count: 1, total: 14 })
      return json(200, { items: [row(), paper], page: 2, pageSize: 10, count: 2, total: 23 })
    })
    renderSuppliers('/suppliers?page=3')
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Paper' }))
    await waitFor(() => expect(screen.queryByText('Qalhat Marine Supplies')).toBeNull())
    expect(screen.getByText('Paper Trail Stationery')).toBeTruthy()
    expect(screen.getByText('Showing 1 of 14 suppliers')).toBeTruthy()
    // The filtered list starts at its own first page.
    expect(listCalls().at(-1)).toBe('/api/v1/suppliers?channel=PAPER&page=0&page_size=10')

    // The menu's button now names the channel chosen.
    fireEvent.click(screen.getByRole('button', { name: /Paper/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Email PDF' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe('/api/v1/suppliers?channel=EMAIL_PDF&page=0&page_size=10'),
    )
    fireEvent.click(screen.getByRole('button', { name: /Email PDF/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'All channels' }))
    await waitFor(() => expect(listCalls().at(-1)).toBe('/api/v1/suppliers?page=0&page_size=10'))
  })

  it('offers a new order and a new bill in the row menu of an active supplier', async () => {
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByText('New purchase order')).toBeTruthy()
    expect(screen.getByText('Record a bill')).toBeTruthy()
    expect(screen.getByText('Pay them now')).toBeTruthy()
    // "Copy into a new supplier" names the row it copies.
    expect(screen.getByText('Copy into a new supplier').closest('a')?.getAttribute('href')).toBe(
      '/suppliers/new?copy=11111111-1111-1111-1111-111111111111',
    )
  })

  // Owner's answer 6 and confirmation (2 Oct): Viewer and Approver read Suppliers, and "read-only
  // users see no buttons".
  const EVERY_ISSUE = () =>
    json(200, {
      items: [
        row({ id: 's-ok', displayName: 'Complete Co' }),
        row({
          id: 's-bank',
          displayName: 'Bank Changed Co',
          record: { ...row().record, health: ['BANK_CHANGED_UNCONFIRMED'] },
        }),
        row({
          id: 's-vat',
          displayName: 'No Vat Co',
          vatNumber: null,
          record: { ...row().record, health: ['NO_VAT_NUMBER'] },
        }),
        row({
          id: 's-paper',
          displayName: 'Paper Co',
          billingChannel: 'EMAIL_PDF',
          participantId: null,
        }),
        row({ id: 's-off', displayName: 'Switched Off Co', status: 'SWITCHED_OFF' }),
      ],
      page: 0,
      pageSize: 10,
      count: 5,
      total: 5,
    })
  const rowOf = async (name: string) =>
    within((await screen.findByText(name)).closest('tr') as HTMLElement)

  it.each([
    ['a Viewer', ['supplier.read', 'invoice.read']],
    ['an Approver', ['supplier.read', 'invoice.read', 'invoice.approve']],
  ])('offers %s no button, no row action and no row menu', async (_who, permissions) => {
    who = { ...ADMIN, username: 'reader', permissions }
    listResponses = [EVERY_ISSUE]
    renderSuppliers('/suppliers?tab=all')
    await screen.findByText('Complete Co')
    expect(screen.queryByRole('link', { name: /New supplier/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Import/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Row actions' })).toBeNull()
    for (const action of ['New bill', 'Check it', 'Add it', 'Chase it'])
      expect(screen.queryByRole('link', { name: action }), action).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn back on' })).toBeNull()
    // The record itself is still theirs to open: each name leads to the supplier's page.
    expect(screen.getByRole('link', { name: 'Complete Co' }).getAttribute('href')).toBe(
      '/suppliers/s-ok',
    )
    // Nothing on the page is a button but the tabs, the sort and the filters.
    expect(screen.queryByText('Export their statement')).toBeNull()
    expect(screen.queryByText('Switch this supplier off')).toBeNull()
  })

  it('offers a Finance Manager the bill and payment actions, and nothing that changes the record', async () => {
    who = {
      ...ADMIN,
      username: 'finance',
      permissions: ['supplier.read', 'invoice.read', 'invoice.payment.manage', 'invoice.approve'],
    }
    listResponses = [EVERY_ISSUE]
    renderSuppliers('/suppliers?tab=all')
    const complete = await rowOf('Complete Co')
    expect(complete.getByRole('link', { name: 'New bill' })).toBeTruthy()
    // Fixing the record needs `supplier.manage`.
    for (const action of ['Check it', 'Add it', 'Chase it'])
      expect(screen.queryByRole('link', { name: action }), action).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn back on' })).toBeNull()
    expect(screen.queryByRole('link', { name: /New supplier/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Import/ })).toBeNull()

    fireEvent.click(complete.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByText('Record a bill')).toBeTruthy()
    expect(screen.getByText('Pay them now')).toBeTruthy()
    expect(screen.getByText('Export their statement')).toBeTruthy()
    expect(screen.queryByText('New purchase order')).toBeNull()
    expect(screen.queryByText('Attach a document')).toBeNull()
    expect(screen.queryByText('Copy into a new supplier')).toBeNull()
    expect(screen.queryByText('Switch this supplier off')).toBeNull()
  })

  it('offers someone who manages suppliers the record fixes, each on the row it belongs to', async () => {
    who = { ...ADMIN, username: 'records', permissions: ['supplier.read', 'supplier.manage'] }
    listResponses = [EVERY_ISSUE]
    renderSuppliers('/suppliers?tab=all')
    // Nobody confirms a changed IBAN since 10 Oct 2026: a row a server still flags has nothing to check.
    const changed = await rowOf('Bank Changed Co')
    expect(changed.queryByRole('link', { name: 'Check it' })).toBeNull()
    expect(changed.queryByText('Bank details to confirm')).toBeNull()
    expect(changed.queryByText('Confirm before the next run')).toBeNull()
    expect(changed.queryByText(/Bank changed/)).toBeNull()
    expect(screen.queryByText(/changed account/)).toBeNull()
    expect((await rowOf('No Vat Co')).getByRole('link', { name: 'Add it' })).toBeTruthy()
    expect((await rowOf('Paper Co')).getByRole('link', { name: 'Chase it' })).toBeTruthy()
    expect((await rowOf('Switched Off Co')).getByRole('button', { name: 'Turn back on' })).toBeTruthy()
    // Recording a bill needs `invoice.payment.manage`.
    expect(screen.queryByRole('link', { name: 'New bill' })).toBeNull()
    expect((await rowOf('Complete Co')).getByRole('button', { name: 'Row actions' })).toBeTruthy()
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
    // The reason goes with the call; no note was typed, so none is sent.
    expect(switchOffBody()).toEqual({ reason: 'STOPPED_TRADING', note: null })
    expect(await screen.findAllByText('Switched off')).toBeTruthy()
  })

  it('sends the reason picked and the note typed in the switch-off dialog', async () => {
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    fireEvent.click(await screen.findByText('Switch this supplier off'))
    const dialog = await screen.findByRole('dialog', { name: 'Switch off Qalhat Marine Supplies' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Moved to another supplier' }))
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Contract moved to Rustaq Timber' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch them off' }))
    await waitFor(() =>
      expect(switchOffBody()).toEqual({
        reason: 'MOVED_SUPPLIER',
        note: 'Contract moved to Rustaq Timber',
      }),
    )
  })

  it('dates a switched-off supplier under its name when the row carries the date', async () => {
    listResponses = [
      () =>
        json(200, {
          items: [row({ status: 'SWITCHED_OFF', switchedOffAt: '2026-04-12T09:30:00Z' })],
          page: 0,
          pageSize: 10,
          count: 1,
          total: 1,
        }),
    ]
    renderSuppliers('/suppliers?tab=switchedOff')
    expect(await screen.findByText('Switched off 12 Apr 2026')).toBeTruthy()
  })

  describe('the reason a supplier was switched off, on its row', () => {
    const offRow = (overrides: Partial<SupplierListRowDto>) => {
      listResponses = [
        () =>
          json(200, {
            items: [row({ status: 'SWITCHED_OFF', ...overrides })],
            page: 0,
            pageSize: 10,
            count: 1,
            total: 1,
          }),
      ]
      renderSuppliers('/suppliers?tab=switchedOff')
    }

    it('follows the date, in the switch-off dialog’s words', async () => {
      offRow({ switchedOffAt: '2026-04-12T09:30:00Z', switchedOffReason: 'MOVED_SUPPLIER' })
      expect(
        await screen.findByText('Switched off 12 Apr 2026 · Moved to another supplier'),
      ).toBeTruthy()
    })

    it('is left out when none was given: the line reads as it always did', async () => {
      offRow({ switchedOffAt: '2026-04-12T09:30:00Z', switchedOffReason: null })
      expect(await screen.findByText('Switched off 12 Apr 2026')).toBeTruthy()
      expect(screen.queryByText(/·\s*(Stopped|They closed|Duplicate|Moved|Something)/)).toBeNull()
    })

    it('is not shown without a date: the row says "Switched off" and nothing more', async () => {
      offRow({ switchedOffReason: 'DUPLICATE' })
      await screen.findByText('Qalhat Marine Supplies')
      const line = screen.getByRole('link', { name: 'Qalhat Marine Supplies' }).nextElementSibling
      expect(line?.textContent).toBe('Switched off')
    })

    it('reads in Arabic', async () => {
      await i18n.changeLanguage('ar')
      offRow({ switchedOffAt: '2026-04-12T09:30:00Z', switchedOffReason: 'CLOSED_DOWN' })
      await screen.findByText('Qalhat Marine Supplies')
      const line = screen.getByRole('link', { name: 'Qalhat Marine Supplies' }).nextElementSibling
      expect(line?.textContent).toMatch(/^أُوقف في .+ · أغلقوا$/)
    })
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
    // Switching on takes no body.
    const on = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/switch-on'))
    expect((on?.[1] as RequestInit).body).toBeUndefined()
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
    expect(screen.queryByText('Pay them now')).toBeNull()
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
    // A changed IBAN is no issue since 10 Oct 2026, so the missing VAT number shows.
    expect(risky.issue).toBe('noVatNumber')
    expect(risky.score).toBe(3)
    expect(risky.recordNote?.key).toBe('suppliersPage.recordNote.cantReclaim')

    const complete = toSupplierListItem(row())
    expect(complete).toMatchObject({ issue: 'complete', score: 4, owedAlert: true })

    // No "Bank changed 4d ago" any more: the record reads as complete.
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
    expect(dated).toMatchObject({ issue: 'complete', score: 4 })
    expect(dated.recordLabel).toEqual({ key: 'suppliersPage.record.complete' })
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

  it('reads the switch-off reason only from a switched-off row, and only one it knows', () => {
    const off = { status: 'SWITCHED_OFF' as const, switchedOffAt: '2026-04-12T09:30:00Z' }
    expect(
      toSupplierListItem(row({ ...off, switchedOffReason: 'STOPPED_TRADING' })).switchedOffReason,
    ).toBe('stoppedTrading')
    // A server without the field, and a code this build does not know, both read as no reason.
    expect(toSupplierListItem(row(off)).switchedOffReason).toBeNull()
    expect(
      toSupplierListItem(row({ ...off, switchedOffReason: 'RETIRED' as never })).switchedOffReason,
    ).toBeNull()
    expect(toSupplierListItem(row({ switchedOffReason: 'DUPLICATE' })).switchedOffReason).toBeNull()
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

describe('New purchase order while the subscription is read-only (owner, 23 Oct 2026)', () => {
  // Nothing new is made while read-only: no purchase order. Recording a bill and paying stay.
  const OWNER: Entitlements = { ...ADMIN, permissions: [...ADMIN.permissions, 'tenant.plan.read'] }

  it('offers New purchase order in the row menu while the subscription is usable', async () => {
    who = OWNER
    answerStanding(fetchMock, null)
    renderSuppliers()
    await screen.findByText('Qalhat Marine Supplies')
    await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByText('New purchase order')).toBeTruthy()
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'hides New purchase order in the row menu while %s',
    async (restriction) => {
      who = OWNER
      answerStanding(fetchMock, restriction)
      renderSuppliers()
      await screen.findByText('Qalhat Marine Supplies')
      await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
      await settle()
      fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
      expect(await screen.findByText('Record a bill')).toBeTruthy()
      expect(screen.queryByText('New purchase order')).toBeNull()
    },
  )
})
