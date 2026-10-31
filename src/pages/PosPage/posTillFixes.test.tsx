import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosPaymentPage } from './PosPaymentPage'
import { PosCompanyPage } from './PosCompanyPage'
import { PosDonePage } from './PosDonePage'
import { PosClosePage } from './PosClosePage'
import { PosRefundPage } from './PosRefundPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, setFinishedSale, setSaleCompany, useFinishedSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { NO_SALE_DISCOUNT, totalsFor } from '../../lib/pos'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

/**
 * The till's defects from the browser run against a real backend (E2E 29 Oct 2026): a company
 * added at the till that could never be invoiced (F-1), the local phone number (F-2), the till
 * offline across screens (F-4), the online sale behind a queued one (F-5), the full-invoice
 * receipt (F-6) and closing the till (F-13).
 */

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.close', 'pos.refund', 'customer.manage'],
  scopes: [],
  featureFlags: {},
}

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const sold = (number: string, patch: Record<string, unknown> = {}) => ({
  saleId: `s-${number}`,
  invoiceNumber: number,
  transactionType: 'SIMPLIFIED',
  receivedAt: '2026-10-29T10:00:00Z',
  cashier: { userId: 'u-1', name: 'Maryam' },
  receipt: { invoiceTotal: 5.649, tip: 0, qr: { status: 'PENDING' } },
  filing: { dispatchState: 'QUEUED', acceptedAt: null },
  warnings: [],
  ...patch,
})

let calls: { url: string; init?: RequestInit; offline: boolean }[]
let offline: boolean
let tillShift: typeof TILL.openShift | null
let answer: (url: string, init?: RequestInit) => Response | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  calls = []
  offline = false
  tillShift = TILL.openShift
  answer = () => null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init, offline })
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (offline) throw new TypeError('Failed to fetch')
      const own = answer(url, init)
      if (own) return own
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([{ ...TILL, openShift: tillShift }])
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        return json(sold('NZW-T01-INV-2026-000049'), 201)
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function Done() {
  const done = useFinishedSale()
  return (
    <p>
      done {done?.sale ? 'sent' : 'queued'} {done?.sale?.invoiceNumber ?? done?.queuedNumber}
    </p>
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pos/payment" element={<PosPaymentPage />} />
        <Route path="/pos/company" element={<PosCompanyPage />} />
        <Route path="/pos/done" element={<Done />} />
        <Route path="/pos/receipt" element={<PosDonePage />} />
        <Route path="/pos/close" element={<PosClosePage />} />
        <Route path="/pos/refund" element={<PosRefundPage />} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const sales = () => calls.filter((call) => call.url === '/api/v1/pos/sales')
const bodyOf = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body))

/** Pays the sample sale in cash and opens the full-invoice offer. */
async function overTheLimit() {
  answer = (url, init) =>
    url === '/api/v1/pos/sales' && init?.method === 'POST' && sales().length === 1
      ? json(
          {
            type: 'https://api.fawtir.om/problems/simplified-invoice-limit',
            status: 422,
            code: 'SIMPLIFIED_INVOICE_LIMIT',
            buyerIdentifierSchemes: ['CR', 'CID'],
          },
          422,
        )
      : null
  renderAt('/pos/payment')
  fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
  await screen.findByRole('button', { name: 'Make it a full invoice' })
  fireEvent.change(screen.getByLabelText("Buyer's name"), { target: { value: 'Saif Al Busaidi' } })
  fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '12345678' } })
}

describe('the buyer’s phone on a full invoice (F-2)', () => {
  it('sends an Omani number typed as eight digits as +968 (E.164)', async () => {
    await overTheLimit()
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '9234 5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make it a full invoice' }))
    await screen.findByText(/^done sent/)
    expect(bodyOf(sales()[1]).customer.consumer.contact).toBe('+96892345678')
  })

  it('says on the field what is wrong with a number that is not one, and sends nothing', async () => {
    await overTheLimit()
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '12ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make it a full invoice' }))
    expect(await screen.findByText(/Type the phone number as 8 digits/)).toBeTruthy()
    expect(sales()).toHaveLength(1)
  })

  it('puts the server’s own phone refusal on the field, not the general failure', async () => {
    await overTheLimit()
    answer = (url, init) =>
      url === '/api/v1/pos/sales' && init?.method === 'POST'
        ? json(
            {
              type: 'https://api.fawtir.om/problems/validation-failed',
              status: 400,
              errors: [
                {
                  field: 'contact.mobilePhone',
                  code: 'INVALID_FORMAT',
                  message: 'Mobile phone must use international E.164 format',
                },
              ],
            },
            400,
          )
        : null
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '+9689' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make it a full invoice' }))
    expect(await screen.findByText(/Type the phone number as 8 digits/)).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.refusal.failed'))).toBeNull()
  })
})

describe('a company the till cannot invoice yet (F-1)', () => {
  it('names what is missing and where to add it when the sale is refused', async () => {
    setSaleCompany({ id: 'c-1', name: 'Muscat Hotels LLC', kind: 'BUSINESS' })
    answer = (url, init) =>
      url === '/api/v1/pos/sales' && init?.method === 'POST'
        ? json(
            {
              type: 'https://api.fawtir.om/problems/customer-not-invoice-eligible',
              status: 400,
              code: 'CUSTOMER_NOT_INVOICE_ELIGIBLE',
              detail:
                'Customer is missing invoice fields: invoiceAddress.countryCode, invoiceAddress.cityName, invoiceAddress.streetName',
            },
            400,
          )
        : null
    renderAt('/pos/payment')
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    const alert = await screen.findByText(/cannot get a full invoice yet/)
    expect(alert.textContent).toContain('the invoice address (country, city, and street)')
    // The link opens the company screen straight at the address form (retest N-1).
    fireEvent.click(screen.getByRole('link', { name: 'Complete it on the company screen' }))
    expect(
      await screen.findByText(/needs the invoice address \(country, city, and street\)/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save the address' })).toBeTruthy()
  })

  it('adds a company by hand with its invoice address, Oman chosen, and the VAT typed in the lookup', async () => {
    answer = (url, init) => {
      if (url.startsWith('/api/v1/customers?')) {
        return json({ content: [], totalElements: 0, number: 0, size: 10, totalPages: 0 })
      }
      if (url.startsWith('/api/v1/pos/sales')) {
        return json({ content: [], totalElements: 0, page: 0, size: 50, branchId: 'b-1' })
      }
      if (url === '/api/v1/pos/customers' && init?.method === 'POST') {
        return json(
          {
            id: 'c-9',
            type: 'BUSINESS',
            displayName: 'Sohar Traders LLC',
            invoiceEligible: true,
            missingInvoiceFields: [],
            profile: { details: { vatRegistrationNumber: 'OM1100223344' } },
          },
          201,
        )
      }
      return null
    }
    renderAt('/pos/company')
    fireEvent.change(await screen.findByLabelText('VAT number'), {
      target: { value: 'OM1100223344' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter it by hand instead' }))
    const form = (await screen.findByRole('button', { name: 'Add the company' })).closest(
      'div.rounded-md',
    ) as HTMLElement
    const field = (label: string) => within(form).getByLabelText(label)
    fireEvent.change(field('Legal name'), { target: { value: 'Sohar Traders LLC' } })
    fireEvent.change(field('Contact person'), { target: { value: 'Ali' } })
    expect((field('VAT number') as HTMLInputElement).value).toBe('OM1100223344')
    // A greyed button says why.
    expect(
      within(form).getByText('Still needed: City / Governorate and Street & building.'),
    ).toBeTruthy()
    // Not ready without the address a full invoice needs.
    expect(within(form).getByRole('button', { name: 'Add the company' })).toHaveProperty(
      'disabled',
      true,
    )
    fireEvent.change(field('City / Governorate'), { target: { value: 'Sohar' } })
    fireEvent.change(field('Street & building'), { target: { value: 'Way 12, Building 4' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the company' }))
    await waitFor(() =>
      expect(calls.some((call) => call.url === '/api/v1/pos/customers')).toBe(true),
    )
    const added = bodyOf(calls.find((call) => call.url === '/api/v1/pos/customers')!)
    expect(added).toMatchObject({
      tillId: 'till-1',
      name: 'Sohar Traders LLC',
      vatNumber: 'OM1100223344',
      address: { countryCode: 'OM', cityName: 'Sohar', streetName: 'Way 12, Building 4' },
    })
  })

  it('puts a refused VAT number on the field, in place of the general failure', async () => {
    answer = (url, init) => {
      if (url.startsWith('/api/v1/customers?')) {
        return json({ content: [], totalElements: 0, number: 0, size: 10, totalPages: 0 })
      }
      if (url.startsWith('/api/v1/pos/sales')) {
        return json({ content: [], totalElements: 0, page: 0, size: 50, branchId: 'b-1' })
      }
      if (url === '/api/v1/pos/customers' && init?.method === 'POST') {
        return json(
          {
            type: 'https://api.fawtir.om/problems/validation-failed',
            title: 'Validation failed',
            status: 400,
            errors: [
              {
                field: 'details.vatRegistrationNumber',
                code: 'INVALID_CHARACTERS',
                message: 'VAT registration number contains unsupported characters',
              },
            ],
          },
          400,
        )
      }
      return null
    }
    renderAt('/pos/company')
    fireEvent.change(await screen.findByLabelText('VAT number'), {
      target: { value: 'not a number' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter it by hand instead' }))
    const form = (await screen.findByRole('button', { name: 'Add the company' })).closest(
      'div.rounded-md',
    ) as HTMLElement
    const field = (label: string) => within(form).getByLabelText(label)
    fireEvent.change(field('Legal name'), { target: { value: 'Sohar Traders LLC' } })
    fireEvent.change(field('Contact person'), { target: { value: 'Ali' } })
    fireEvent.change(field('City / Governorate'), { target: { value: 'Sohar' } })
    fireEvent.change(field('Street & building'), { target: { value: 'Way 12' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the company' }))
    expect(await within(form).findByText(i18n.t('validation.vatin'))).toBeTruthy()
    expect(within(form).queryByText(i18n.t('pos.refusal.failed'))).toBeNull()
    // Typing again takes the complaint away.
    fireEvent.change(field('Legal name'), { target: { value: 'Sohar Traders' } })
    expect(within(form).queryByText(i18n.t('validation.vatin'))).toBeNull()
  })

  it('names what is missing when the server refuses the company itself (backend #810)', async () => {
    answer = (url, init) => {
      if (url.startsWith('/api/v1/customers?')) {
        return json({ content: [], totalElements: 0, number: 0, size: 10, totalPages: 0 })
      }
      if (url.startsWith('/api/v1/pos/sales')) {
        return json({ content: [], totalElements: 0, page: 0, size: 50, branchId: 'b-1' })
      }
      if (url === '/api/v1/pos/customers' && init?.method === 'POST') {
        return json(
          {
            type: 'https://api.fawtir.om/problems/customer-not-invoice-eligible',
            status: 400,
            code: 'CUSTOMER_NOT_INVOICE_ELIGIBLE',
            missingInvoiceFields: ['invoiceAddress.streetName'],
          },
          400,
        )
      }
      return null
    }
    renderAt('/pos/company')
    fireEvent.click(await screen.findByRole('button', { name: 'Enter it by hand instead' }))
    const form = (await screen.findByRole('button', { name: 'Add the company' })).closest(
      'div.rounded-md',
    ) as HTMLElement
    const field = (label: string) => within(form).getByLabelText(label)
    fireEvent.change(field('Legal name'), { target: { value: 'Sohar Traders LLC' } })
    fireEvent.change(field('Contact person'), { target: { value: 'Ali' } })
    fireEvent.change(field('VAT number'), { target: { value: 'OM1100223344' } })
    fireEvent.change(field('City / Governorate'), { target: { value: 'Sohar' } })
    fireEvent.change(field('Street & building'), { target: { value: 'x' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the company' }))
    expect(
      await within(form).findByText(
        'A full invoice to this company needs the invoice address (street).',
      ),
    ).toBeTruthy()
  })

  it('completes the address of a company found by VAT number, for whoever may edit customers', async () => {
    const found = {
      id: 'c-2',
      type: 'BUSINESS',
      displayName: 'Nizwa Foods LLC',
      invoiceEligible: false,
      missingInvoiceFields: ['invoiceAddress.cityName', 'invoiceAddress.streetName'],
      profile: { details: { vatRegistrationNumber: 'OM1100556677' }, invoiceAddress: null },
      status: 'ACTIVE',
    }
    answer = (url, init) => {
      if (url.startsWith('/api/v1/customers?')) {
        return json({ content: [found], totalElements: 1, number: 0, size: 10, totalPages: 1 })
      }
      if (url.startsWith('/api/v1/pos/sales')) {
        return json({ content: [], totalElements: 0, page: 0, size: 50, branchId: 'b-1' })
      }
      if (url === '/api/v1/customers/c-2' && init?.method === 'PATCH') {
        return json({ ...found, invoiceEligible: true, missingInvoiceFields: [], version: 4 })
      }
      if (url === '/api/v1/customers/c-2') return json({ ...found, version: 3 })
      return null
    }
    renderAt('/pos/company')
    fireEvent.change(await screen.findByLabelText('VAT number'), {
      target: { value: 'OM1100556677' },
    })
    expect(await screen.findByText(/needs the invoice address \(city and street\)/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('City / Governorate'), { target: { value: 'Nizwa' } })
    fireEvent.change(screen.getByLabelText('Street & building'), { target: { value: 'Souq Rd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the address' }))
    await waitFor(() => expect(screen.queryByText(/needs the invoice address/)).toBeNull())
    const patch = calls.find((call) => call.init?.method === 'PATCH')!
    expect(bodyOf(patch)).toEqual({
      invoiceAddress: { countryCode: 'OM', cityName: 'Nizwa', streetName: 'Souq Rd' },
      expectedVersion: 3,
    })
  })
})

describe('the till offline across screens (F-4) and back online (F-5)', () => {
  it('keeps its branch and till when a screen opens offline, and sells twice in a row', async () => {
    // Online once: the branch and the till are read and kept on this device.
    const first = renderAt('/pos/payment')
    await screen.findByRole('button', { name: /Take 5.649 in cash/ })
    first.unmount()

    offline = true
    resetSharedRequests()
    const second = renderAt('/pos/payment')
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    expect(screen.queryByText(i18n.t('pos.till.noBranch'))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done queued NZW-T01-INV-2026-000049')).toBeTruthy()
    second.unmount()

    resetOpenSale(SAMPLE_SALE)
    resetSharedRequests()
    renderAt('/pos/payment')
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done queued NZW-T01-INV-2026-000050')).toBeTruthy()
    const queued = JSON.parse(window.localStorage.getItem('fawtir.pos.queue') ?? '[]')
    expect(queued.map((entry: { number: string }) => entry.number)).toEqual([
      'NZW-T01-INV-2026-000049',
      'NZW-T01-INV-2026-000050',
    ])
  })

  it('sends the queued sale first, then makes the next one an ordinary online sale', async () => {
    const first = renderAt('/pos/payment')
    await screen.findByRole('button', { name: /Take 5.649 in cash/ })
    first.unmount()
    offline = true
    resetSharedRequests()
    const second = renderAt('/pos/payment')
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    await screen.findByText('done queued NZW-T01-INV-2026-000049')
    second.unmount()

    offline = false
    answer = (url, init) => {
      if (url !== '/api/v1/pos/sales' || init?.method !== 'POST') return null
      const body = JSON.parse(String(init.body))
      return json(sold(body.invoiceNumber ?? 'NZW-T01-INV-2026-000050'), 201)
    }
    resetOpenSale(SAMPLE_SALE)
    resetSharedRequests()
    renderAt('/pos/payment')
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText('done sent NZW-T01-INV-2026-000050')).toBeTruthy()
    const sent = sales().filter((call) => call.init?.method === 'POST' && !call.offline)
    expect(sent.map((call) => bodyOf(call).queuedOffline)).toEqual([true, false])
    expect(window.localStorage.getItem('fawtir.pos.queue')).toBe('[]')
  })
})

describe('the full invoice receipt (F-6)', () => {
  it('prints a tax invoice in both languages and names the buyer with their ID', async () => {
    const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
    setFinishedSale({
      lines: SAMPLE_SALE,
      totals,
      tip: 0,
      change: 0,
      company: null,
      buyer: { name: 'Saif Al Busaidi', identifierScheme: 'CID', identifierValue: '12345678' },
      payments: [{ method: 'card', amount: totals.sale }],
      sale: sold('NZW-T01-INV-2026-000006', {
        transactionType: 'FULL_TAX',
        receipt: { invoiceTotal: 5.649, tip: 0, qr: { status: 'NOT_APPLICABLE' } },
        filing: { dispatchState: 'DISPATCHED', acceptedAt: null },
        warnings: [{ code: 'ZR_FOOD_CHARGED_STANDARD', line: 3 }],
      }) as never,
      queuedNumber: null,
      finishedAt: '2026-10-29T11:35:22Z',
    })
    renderAt('/pos/receipt')
    expect(await screen.findByText('Tax invoice')).toBeTruthy()
    expect(screen.getByText('فاتورة ضريبية')).toBeTruthy()
    expect(screen.queryByText('فاتورة ضريبية مبسطة')).toBeNull()
    expect(screen.getByText('Saif Al Busaidi')).toBeTruthy()
    expect(screen.getByText('12345678')).toBeTruthy()
    // The server's food-list warning in its own words, not "Fawtir noted something" (F-8).
    expect(screen.getByText(/Line 3 is on Oman's zero-rated food list/)).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.warning.other'))).toBeNull()
  })
})

/** A refund lookup as a server older than backend #810 answers it: no tip. */
const LOOKUP = {
  saleId: 's-1',
  invoiceId: 'i-1',
  invoiceNumber: 'NZW-T01-INV-2026-000001',
  soldAt: '2026-10-29T08:00:00Z',
  transactionType: 'SIMPLIFIED',
  branch: { id: 'b-1', name: 'Nizwa' },
  customer: { kind: 'WALK_IN', customerId: 'c-0', name: null },
  headerDiscount: null,
  lines: [
    {
      lineNumber: 1,
      role: 'ITEM',
      productId: 'p-1',
      description: 'Butter croissant',
      quantitySold: 2,
      quantityRefunded: 0,
      unitPrice: 0.8,
      discount: null,
      vatRate: 5,
      vatCategory: 'S',
      refundable: true,
    },
  ],
  paid: { byMethod: [{ method: 'CASH', amount: 1.68 }], total: 1.68, paidBack: 0 },
  total: 1.68,
  credited: 0,
  owed: 0,
  creditNoteNumbers: [],
}

describe('the refund page (F-11)', () => {
  it('shows the tip the customer paid, which is not refunded', async () => {
    answer = (url) => {
      if (url.startsWith('/api/v1/pos/refund-lookup')) {
        return json(LOOKUP)
      }
      if (url.startsWith('/api/v1/pos/sales/s-1')) return json(sold('x', { tip: 0.588 }))
      return null
    }
    renderAt('/pos/refund?invoice=NZW-T01-INV-2026-000001')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Butter croissant/ }))
    const tipRow = (await screen.findByText(i18n.t('pos.refund.tipNotRefunded'))).parentElement!
    await waitFor(() => expect(tipRow.textContent).toContain('0.588'))
  })

  it('takes the tip from the lookup when the server sends it, and reads nothing more (backend #810)', async () => {
    answer = (url) =>
      url.startsWith('/api/v1/pos/refund-lookup')
        ? json({ ...LOOKUP, tip: 0.412, tipMethod: 'CASH' })
        : null
    renderAt('/pos/refund?invoice=NZW-T01-INV-2026-000001')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Butter croissant/ }))
    const tipRow = (await screen.findByText(i18n.t('pos.refund.tipNotRefunded'))).parentElement!
    expect(tipRow.textContent).toContain('0.412')
    expect(calls.some((call) => call.url.startsWith('/api/v1/pos/sales/s-1'))).toBe(false)
  })
})

describe('the receipt of a company without a VAT number (retest N-8)', () => {
  it('prints its CR number', async () => {
    const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
    setFinishedSale({
      lines: SAMPLE_SALE,
      totals,
      tip: 0,
      change: 0,
      company: {
        id: 'c-3',
        name: 'Ibri Traders SPC',
        kind: 'BUSINESS',
        vat: null,
        identifier: { scheme: 'CR', value: '1468035' },
      },
      payments: [{ method: 'cash', amount: totals.sale }],
      sale: sold('NZW-T01-INV-2026-000007', { transactionType: 'FULL_TAX' }) as never,
      queuedNumber: null,
      finishedAt: '2026-10-29T11:35:22Z',
    })
    renderAt('/pos/receipt')
    expect(await screen.findByText('Ibri Traders SPC')).toBeTruthy()
    expect(screen.getByText(i18n.t('customerForm.identifier.schemes.CR'))).toBeTruthy()
    expect(screen.getByText('1468035')).toBeTruthy()
  })
})

describe('the receipt of a sale queued offline (retest N-6)', () => {
  const queued = () => {
    const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
    setFinishedSale({
      lines: SAMPLE_SALE,
      totals,
      tip: 0,
      change: 0,
      company: null,
      payments: [{ method: 'cash', amount: totals.sale }],
      sale: null,
      queuedNumber: 'NZW-T01-INV-2026-000049',
      finishedAt: '2026-10-29T11:35:22Z',
    })
  }

  afterEach(() => vi.useRealTimers())

  it('says it waits to be filed, not that it is filed, and that the QR comes later', async () => {
    queued()
    renderAt('/pos/receipt')
    expect(await screen.findByText(/This sale is waiting to be filed/)).toBeTruthy()
    expect(screen.queryByText(/has already been filed/)).toBeNull()
    expect(screen.getByText(i18n.t('pos.done.qrAfterFiling'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.done.qrAlreadyUp'))).toBeNull()
  })

  it('clears itself for the next customer after 20 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    queued()
    renderAt('/pos/receipt')
    await screen.findByText(/This sale is waiting to be filed/)
    expect(screen.queryByText('the sale screen')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_500)
    })
    expect(await screen.findByText('the sale screen')).toBeTruthy()
  })

  it('clears itself on Enter, as the screen says', async () => {
    queued()
    renderAt('/pos/receipt')
    await screen.findByText(/This sale is waiting to be filed/)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(await screen.findByText('the sale screen')).toBeTruthy()
  })
})

describe('closing the till (F-13)', () => {
  it('shows when it closed and what went to the bank once the shift is gone', async () => {
    answer = (url, init) => {
      if (url.startsWith('/api/v1/pos/shifts/sh-1/close-preview')) {
        return json({
          shiftId: 'sh-1',
          tillId: 'till-1',
          tillNumber: 1,
          branchId: 'b-1',
          cashier: { userId: 'u-1', name: 'Maryam' },
          status: 'OPEN',
          businessDate: '2026-10-29',
          openedAt: '2026-10-29T03:00:00Z',
          endedAt: null,
          openingFloat: 30,
          openingFloatSource: 'DEFAULT',
          salesCount: 1,
          salesAmount: 5.649,
          byMethod: [{ method: 'CASH', sales: 1, taken: 5.649, refunded: 0, tips: 0 }],
          companyInvoices: 0,
          vatWithin: 0.269,
          discounts: 0,
          tips: 0,
          paidOut: 0,
          paidIn: 0,
          cashRefunded: 0,
          expectedCash: 35.649,
          looseEnds: {
            onAccountOpen: { count: 0, amount: 0 },
            notYetAccepted: 0,
            cardSalesForTerminalCheck: { count: 0, amount: 0 },
          },
          movements: [],
          at: '2026-10-29T14:00:00Z',
        })
      }
      if (url === '/api/v1/pos/shifts/sh-1/close' && init?.method === 'POST') {
        tillShift = null
        return json(
          {
            shiftId: 'sh-1',
            closedAt: '2026-10-29T14:00:00Z',
            countedCash: 35.649,
            expectedCash: 35.649,
            overShort: 0,
            floatLeft: 30,
            toBank: 5.649,
            cardTerminalTotal: 0,
            cardTerminalDifference: 0,
            cardDifferenceNote: null,
          },
          201,
        )
      }
      return null
    }
    renderAt('/pos/close')
    // One sale, in the singular (retest N-5).
    expect(await screen.findByText('1 sale · 5.649 average')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.closeTill') }))
    expect(await screen.findByText(/^Closed at/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText(i18n.t('pos.close.summary.toBank'))).toBeTruthy())
    expect(screen.queryByText(i18n.t('pos.close.noShift'))).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('pos.close.printSummary') })).toBeTruthy()
  })
})

describe('a till refund the credit cap refuses (DA-1 option B)', () => {
  it.each([
    ['en', /^Only .* left to credit in the Standard category/],
    ['ar', /^لم يتبقَّ للخصم في الفئة القياسية/],
  ])('names the rate and what is left in the till’s refusal line (%s)', async (language, start) => {
    await i18n.changeLanguage(language)
    answer = (url, init) => {
      if (url.startsWith('/api/v1/pos/refund-lookup')) return json(LOOKUP)
      if (url.includes('/refunds') && init?.method === 'POST')
        return json(
          {
            status: 409,
            code: 'CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING',
            taxCategory: 'S',
            taxRate: '5',
            remainingTaxableAmount: '1.5',
            remainingVatAmount: '0.075',
          },
          409,
        )
      return null
    }
    renderAt('/pos/refund?invoice=NZW-T01-INV-2026-000001')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Butter croissant|كرواسون/ }))
    const button = screen
      .getAllByRole('button')
      .find((candidate) => candidate.className.includes('bg-danger-700')) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false))
    fireEvent.click(button)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(start)
    expect(alert.textContent).toContain('1.500')
    expect(alert.textContent).toContain('0.075')
  })
})
