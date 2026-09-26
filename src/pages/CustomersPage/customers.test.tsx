import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  CustomerDto,
  CustomerReceivableDto,
  CustomerSummaryDto,
} from '../../api/customers/customers'
import { toCustomerListItem, toReceivableView } from '../../lib/customerList'
import { CustomersPage } from './CustomersPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/customers/summary'
const FIRST_PAGE = '/api/v1/customers?status=ACTIVE&sort=NAME_ASC&page=0&size=10'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'customer.read',
    'customer.manage',
    'customer.import',
    'customer.export',
    'invoice.draft',
  ],
  scopes: [],
  featureFlags: {},
}
const READ_ONLY: Entitlements = { ...ADMIN, username: 'viewer', permissions: ['customer.read'] }

// Figures unlike the design's mock book (8 customers, 217.490 receivable), so a figure on screen
// can only have come from the API.
const SUMMARY: CustomerSummaryDto = {
  currencyCode: 'OMR',
  asOf: '2026-09-15',
  total: 27,
  archived: 2,
  byType: { business: 19, government: 3, consumer: 5 },
  peppolReady: 11,
  peppolEligible: 22,
  receivables: {
    outstanding: 1234.5,
    overdue: 610.25,
    openInvoices: 9,
    overdueInvoices: 4,
    customersOwing: 6,
    customersOverdue: 3,
  },
}

const ID = '11111111-1111-1111-1111-111111111111'

function customer(overrides: Partial<CustomerDto> = {}): CustomerDto {
  return {
    id: ID,
    type: 'BUSINESS',
    displayName: 'Sohar Port Logistics',
    profile: {
      details: { vatRegistrationNumber: 'OM1100999001' },
      contact: {
        contactPerson: 'Laila Al Harthy',
        emailRecipients: ['ap@soharport.om', 'cfo@soharport.om'],
      },
      deliveryPreferences: { sendingMethod: 'PEPPOL' },
      invoiceAddress: { cityName: 'Sohar', countryCode: 'OM' },
    },
    peppolDelivery: 'ACTIVE',
    status: 'ACTIVE',
    updatedAt: '2026-09-10T08:00:00Z',
    ...overrides,
  }
}

function owing(overrides: Partial<CustomerReceivableDto> = {}): CustomerReceivableDto {
  return {
    customerId: ID,
    outstanding: 845.125,
    overdue: 300,
    invoices: 5,
    openInvoices: 3,
    partlyPaidInvoices: 1,
    oldestOverdueDueDate: '2026-07-07',
    daysOverdue: 70,
    ...overrides,
  }
}

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function springPage(content: CustomerDto[], totalElements = content.length, page = 0, size = 10) {
  return { content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) }
}

let fetchMock: ReturnType<typeof vi.fn>
let listResponses: Array<() => Response>
let summaryResponse: () => Response
let receivablesResponse: () => Response
let exportResponse: () => Response
let who: Entitlements

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))
const listCalls = () => calls('/api/v1/customers?')

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  summaryResponse = () => json(200, SUMMARY)
  listResponses = [() => json(200, springPage([customer()], 1))]
  receivablesResponse = () =>
    json(200, { currencyCode: 'OMR', asOf: '2026-09-15', items: [owing()] })
  exportResponse = () =>
    new Response('Type,Name\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="fawtir-customers.csv"',
      },
    })
  fetchMock = vi.fn(async (url: string) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === SUMMARY_URL) return summaryResponse()
    if (url.startsWith('/api/v1/customers/receivables?')) return receivablesResponse()
    if (url.startsWith('/api/v1/customers/export')) return exportResponse()
    if (url.startsWith('/api/v1/customers?')) {
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

function renderCustomers(path = '/customers') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Customers list, wired to the API', () => {
  it('shows the cards, tab counts and rows the API returned', async () => {
    renderCustomers()
    expect(await screen.findByText('Sohar Port Logistics')).toBeTruthy()
    // The rial sign is drawn (with a spoken "OMR"), so the line is read as text, not matched whole.
    const subtitle = screen.getByRole('heading', { level: 1, name: 'Customers' }).nextElementSibling
    expect(subtitle?.querySelector('svg')).toBeTruthy()
    expect(subtitle?.textContent).toMatch(/^27 customers · .*1,234\.500 receivable$/)
    expect(screen.getByText('610.250')).toBeTruthy()
    expect(screen.getByText('Owed by 6 customers')).toBeTruthy()
    expect(screen.getByText('From 3 customers')).toBeTruthy()
    expect(screen.getByText('19 business · 3 government · 5 consumer')).toBeTruthy()
    expect(screen.getByText('11')).toBeTruthy()
    expect(screen.getByText('of 22')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /Government/ })).getByText('3')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /All/ })).getByText('27')).toBeTruthy()

    // The row, from the customer record and then from its receivables.
    expect(screen.getByText('VAT OM1100999001')).toBeTruthy()
    expect(screen.getByText('Laila Al Harthy')).toBeTruthy()
    expect(screen.getByText('ap@soharport.om')).toBeTruthy()
    expect(screen.getByText('Sohar, Oman')).toBeTruthy()
    expect(screen.getByText('On Peppol')).toBeTruthy()
    expect(await screen.findByText('5 invoices')).toBeTruthy()
    expect(screen.getByText('845.125')).toBeTruthy()
    expect(screen.getByText('70 days overdue')).toBeTruthy()

    expect(listCalls()).toEqual([FIRST_PAGE])
    expect(calls('/api/v1/customers/receivables')).toEqual([
      `/api/v1/customers/receivables?customer_id=${ID}`,
    ])
  })

  it('asks the server for the tab, the search, the sort and the page size', async () => {
    renderCustomers()
    await screen.findByText('Sohar Port Logistics')

    // Anchored: the account switcher now carries the plan, so its accessible name ends
    // "… Business plan" and an unanchored /Business/ matches it as well as the tab.
    fireEvent.click(screen.getByRole('button', { name: /^Business/ }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/customers?status=ACTIVE&type=BUSINESS&sort=NAME_ASC&page=0&size=10',
      ),
    )

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sohar' } })
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/customers?status=ACTIVE&type=BUSINESS&search=sohar&sort=NAME_ASC&page=0&size=10',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Recently updated' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/customers?status=ACTIVE&type=BUSINESS&search=sohar&sort=RECENT&page=0&size=10',
      ),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Show result:' }))
    fireEvent.click(await screen.findByRole('option', { name: '25' }))
    await waitFor(() =>
      expect(listCalls().at(-1)).toBe(
        '/api/v1/customers?status=ACTIVE&type=BUSINESS&search=sohar&sort=RECENT&page=0&size=25',
      ),
    )
  })

  it("pages with the total the server counted, and asks for that page's receivables", async () => {
    listResponses = [
      () => json(200, springPage([customer()], 27)),
      () => json(200, springPage([customer({ id: '2', displayName: 'Nizwa Dates Co' })], 27, 2)),
    ]
    renderCustomers()
    await screen.findByText('Sohar Port Logistics')
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(await screen.findByText('Nizwa Dates Co')).toBeTruthy()
    expect(listCalls().at(-1)).toBe('/api/v1/customers?status=ACTIVE&sort=NAME_ASC&page=2&size=10')
    await waitFor(() =>
      expect(calls('/api/v1/customers/receivables').at(-1)).toBe(
        '/api/v1/customers/receivables?customer_id=2',
      ),
    )
  })

  it('tells settled, never-invoiced and part-paid customers apart', async () => {
    listResponses = [
      () =>
        json(
          200,
          springPage([
            customer(),
            customer({ id: 'settled', displayName: 'Settled Trading' }),
            customer({ id: 'new', displayName: 'Brand New LLC' }),
          ]),
        ),
    ]
    receivablesResponse = () =>
      json(200, {
        currencyCode: 'OMR',
        asOf: '2026-09-15',
        items: [
          owing({ overdue: 0, daysOverdue: null, oldestOverdueDueDate: null, outstanding: 40 }),
          owing({
            customerId: 'settled',
            outstanding: 0,
            overdue: 0,
            invoices: 2,
            openInvoices: 0,
            partlyPaidInvoices: 0,
            daysOverdue: null,
          }),
        ],
      })
    renderCustomers()
    expect(await screen.findByText('partially paid')).toBeTruthy()
    const settled = screen.getByText('Settled Trading').closest('tr')!
    expect(within(settled).getByText('2 invoices')).toBeTruthy()
    expect(within(settled).getByText('Settled')).toBeTruthy()
    const fresh = screen.getByText('Brand New LLC').closest('tr')!
    expect(within(fresh).getByText('0 invoices')).toBeTruthy()
    expect(within(fresh).queryByText('Settled')).toBeNull()
  })

  it('says the directory is empty, and separately that a search found no one', async () => {
    summaryResponse = () =>
      json(200, { ...SUMMARY, total: 0, byType: { business: 0, government: 0, consumer: 0 } })
    listResponses = [() => json(200, springPage([], 0))]
    const { unmount } = renderCustomers()
    expect(await screen.findByText(/No customers yet/)).toBeTruthy()
    expect(calls('/api/v1/customers/receivables')).toEqual([])
    unmount()

    summaryResponse = () => json(200, SUMMARY)
    renderCustomers('/customers?q=zzz')
    expect(await screen.findByText('No customers match this search.')).toBeTruthy()
  })

  it('reads a refusal as "no access", not as an empty list', async () => {
    summaryResponse = () =>
      json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
    renderCustomers()
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(screen.queryByText(/No customers yet/)).toBeNull()
  })

  it('offers a retry with the reference when the list fails', async () => {
    listResponses = [
      () =>
        json(500, {
          type: 'https://api.fawtir.om/problems/internal-error',
          correlationId: 'corr-81',
        }),
      () => json(200, springPage([customer()], 1)),
    ]
    renderCustomers()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: corr-81')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sohar Port Logistics')).toBeTruthy()
  })

  it('keeps the rows when only the receivables fail, and says so', async () => {
    receivablesResponse = () =>
      json(500, { type: 'https://api.fawtir.om/problems/internal-error', correlationId: 'corr-82' })
    renderCustomers()
    expect(await screen.findByText('Sohar Port Logistics')).toBeTruthy()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Reference: corr-82')
    expect(screen.queryByText('845.125')).toBeNull()
  })

  it('offers only what the reader may do', async () => {
    who = READ_ONLY
    renderCustomers()
    await screen.findByText('Sohar Port Logistics')
    expect(screen.queryByRole('link', { name: /New customer/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Bulk upload/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Row actions' })).toBeNull()
  })

  it('exports the list it is showing, and warns when the file stops at the cap', async () => {
    const created = vi.fn(() => 'blob:customers')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    exportResponse = () =>
      new Response('Type,Name\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="fawtir-customers.csv"',
          'X-Fawtir-Export-Truncated': 'true',
        },
      })
    renderCustomers('/customers?tab=government&q=ministry')
    await screen.findByText('Sohar Port Logistics')
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    expect(await screen.findByText(/stops at the export limit/)).toBeTruthy()
    expect(calls('/api/v1/customers/export')).toEqual([
      '/api/v1/customers/export?status=ACTIVE&type=GOVERNMENT&search=ministry',
    ])
    expect(created).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('reads in Arabic with Latin digits', async () => {
    await i18n.changeLanguage('ar')
    renderCustomers()
    expect(await screen.findByText('Sohar Port Logistics')).toBeTruthy()
    expect(await screen.findByText('متأخرة 70 يومًا')).toBeTruthy()
    expect(screen.getByText('الرقم الضريبي OM1100999001')).toBeTruthy()
    expect(screen.getByText('845.125')).toBeTruthy()
    expect(screen.getByText('مسجّل على Peppol')).toBeTruthy()
  })
})

describe('customer list mapping', () => {
  it('counts only verified capability as on Peppol, and consumers as QR receipts', () => {
    expect(toCustomerListItem(customer()).peppol).toBe('onPeppol')
    expect(toCustomerListItem(customer({ peppolDelivery: 'PENDING_VERIFICATION' })).peppol).toBe(
      'notConnected',
    )
    expect(toCustomerListItem(customer({ peppolDelivery: 'REJECTED' })).peppol).toBe('notConnected')
    expect(
      toCustomerListItem(customer({ type: 'CONSUMER', peppolDelivery: 'NOT_APPLICABLE' })).peppol,
    ).toBe('qrReceipt')
  })

  it('writes the channel under the name when there is no VAT number', () => {
    const government = toCustomerListItem(
      customer({
        type: 'GOVERNMENT',
        profile: { ...customer().profile, details: { vatRegistrationNumber: null } },
      }),
    )
    expect(government.subtitle).toEqual({
      parts: [
        { key: 'customersPage.line.intent.b2g' },
        { key: 'customersPage.line.channel.peppol' },
      ],
    })
    const consumer = toCustomerListItem(
      customer({
        type: 'CONSUMER',
        displayName: 'Ahmed Al Rawahi',
        profile: {
          details: null,
          contact: { contactPerson: null, emailRecipients: [] },
          deliveryPreferences: { sendingMethod: 'QR_RECEIPT' },
          invoiceAddress: null,
        },
      }),
    )
    expect(consumer).toMatchObject({
      contactName: 'Ahmed Al Rawahi',
      contactEmail: null,
      city: null,
      initials: 'AA',
    })
  })

  it('shows an overdue note only for money that is late', () => {
    expect(toReceivableView(owing()).state).toBe('overdue')
    expect(
      toReceivableView(owing({ overdue: 0, daysOverdue: null, partlyPaidInvoices: 0 })),
    ).toMatchObject({
      state: 'attention',
      note: null,
    })
    expect(toReceivableView(undefined)).toEqual({
      invoices: 0,
      state: 'settled',
      amount: null,
      note: null,
    })
  })
})
