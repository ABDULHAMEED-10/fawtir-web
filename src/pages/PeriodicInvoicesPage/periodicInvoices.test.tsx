import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { PeriodicRunDto, PeriodicScheduleDto } from '../../api/invoices/periodic'
import {
  blankPeriodicForm,
  daysBetween,
  draftedCount,
  formOfSchedule,
  narrowSchedules,
  periodicCounts,
  periodicProblems,
  scheduleNote,
  scheduleTone,
  toCreateRequest,
  toUpdateRequest,
} from '../../lib/periodicInvoice'
import { PeriodicInvoicesPage } from './PeriodicInvoicesPage'
import { PeriodicInvoicePage } from '../PeriodicInvoicePage/PeriodicInvoicePage'

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
const plusDays = (days: number) => {
  const date = new Date(`${TODAY}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const DRAFTER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.draft', 'customer.read'],
  scopes: [],
  featureFlags: {},
}

const MONTHLY: PeriodicScheduleDto = {
  id: 'sch-1',
  customerId: 'cus-1',
  templateInvoiceId: 'inv-1',
  interval: 'MONTHLY',
  transactionSubtype: 'SUMMARY',
  nextRunDate: plusDays(10),
  endDate: null,
  remainingOccurrences: 6,
  active: true,
}

const LAPSED: PeriodicScheduleDto = { ...MONTHLY, id: 'sch-2', customerId: 'cus-2', nextRunDate: plusDays(-3), interval: 'QUARTERLY', transactionSubtype: 'CONTINUOUS_SUPPLY' }
const PAUSED: PeriodicScheduleDto = { ...MONTHLY, id: 'sch-3', customerId: 'cus-3', active: false, remainingOccurrences: null }

const RUNS: PeriodicRunDto[] = [
  { runDate: plusDays(-20), periodStart: plusDays(-50), periodEnd: plusDays(-21), outcome: 'DRAFTED', draftInvoiceId: 'inv-9', draftInvoice: '/api/v1/authored-invoices/inv-9', failureReason: null, createdAt: '2026-08-01T06:00:00Z' },
  { runDate: plusDays(-50), periodStart: plusDays(-80), periodEnd: plusDays(-51), outcome: 'FAILED', draftInvoiceId: null, draftInvoice: null, failureReason: 'template gone', createdAt: '2026-07-01T06:00:00Z' },
]

const CUSTOMERS = {
  content: [
    { id: 'cus-1', displayName: 'Muscat Grand Hotel', type: 'BUSINESS', status: 'ACTIVE' },
    { id: 'cus-2', displayName: 'Sohar Beach Resort', type: 'BUSINESS', status: 'ACTIVE' },
    { id: 'cus-3', displayName: 'Nizwa Cafe', type: 'BUSINESS', status: 'ACTIVE' },
  ],
  number: 0,
  size: 200,
  totalElements: 3,
  totalPages: 1,
}

const INVOICES = {
  content: [
    { id: 'inv-1', type: 'INVOICE', version: 3, authoringState: 'ISSUED', deliveryState: 'NOT_SUBMITTED', customerId: 'cus-1', currency: 'OMR', invoiceNumber: 'INV-2026-000012', issueDate: plusDays(-30), dueDate: null, details: null, lines: [], totals: { totalAmount: 58.59 } },
  ],
  number: 0,
  size: 50,
  totalElements: 1,
  totalPages: 1,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let schedules: PeriodicScheduleDto[]
let createResponse: () => Response

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = DRAFTER
  schedules = [MONTHLY, LAPSED, PAUSED]
  createResponse = () => json(201, { ...MONTHLY, id: 'sch-new' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/customers?')) return json(200, CUSTOMERS)
    if (url === '/api/v1/customers/cus-1') return json(200, CUSTOMERS.content[0])
    if (url.startsWith('/api/v1/authored-invoices?')) return json(200, INVOICES)
    if (url.endsWith('/pause')) return json(200, { ...MONTHLY, active: false })
    if (url.endsWith('/resume')) return json(200, { ...PAUSED, active: true, nextRunDate: TODAY })
    if (url.endsWith('/sch-1/runs')) return json(200, RUNS)
    if (url === '/api/v1/periodic-invoice-schedules/sch-1') return method === 'PUT' ? json(200, { ...MONTHLY, interval: 'QUARTERLY' }) : json(200, MONTHLY)
    if (url === '/api/v1/periodic-invoice-schedules' && method === 'POST') return createResponse()
    if (url === '/api/v1/periodic-invoice-schedules') return json(200, schedules)
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/income/periodic" element={<PeriodicInvoicesPage />} />
        <Route path="/income/periodic/new" element={<PeriodicInvoicePage mode="create" />} />
        <Route path="/income/periodic/:id" element={<PeriodicInvoicePage mode="view" />} />
        <Route path="/income/periodic/:id/edit" element={<PeriodicInvoicePage mode="edit" />} />
        <Route path="/invoices/:id" element={<p>invoice page</p>} />
        <Route path="/customers/:id" element={<p>customer page</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Periodic invoices, wired to the API', () => {
  it('names each customer and says where each schedule stands', async () => {
    renderAt('/income/periodic')

    expect(await screen.findByRole('link', { name: 'Muscat Grand Hotel' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sohar Beach Resort' })).toBeTruthy()
    // Paused schedules are not in the Active tab.
    expect(screen.queryByRole('link', { name: 'Nizwa Cafe' })).toBeNull()
    expect(screen.getByText('In 10 days')).toBeTruthy()
    expect(screen.getByText(/Was due/)).toBeTruthy()
    // The counts are the page's own, from the list it holds.
    expect(within(screen.getByText('Schedules').closest('article') as HTMLElement).getByText('3')).toBeTruthy()
    expect(within(screen.getByText('Due in 30 days').closest('article') as HTMLElement).getByText('2')).toBeTruthy()
    expect(screen.getByText(/raises these drafts on its own only where the daily sweep is switched on/)).toBeTruthy()
  })

  it('narrows the list it holds, since the API filters nothing', async () => {
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    const before = calls('GET', '/api/v1/periodic-invoice-schedules').length

    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(await screen.findByRole('link', { name: 'Nizwa Cafe' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search by customer'), { target: { value: 'sohar' } })
    expect(screen.getByRole('link', { name: 'Sohar Beach Resort' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Muscat Grand Hotel' })).toBeNull()
    expect(calls('GET', '/api/v1/periodic-invoice-schedules')).toHaveLength(before)
  })

  it('pauses from the list, and says where a resumed schedule now falls', async () => {
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    const row = screen.getByRole('link', { name: 'Muscat Grand Hotel' }).closest('tr') as HTMLElement

    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(calls('POST', '/api/v1/periodic-invoice-schedules/sch-1/pause')).toHaveLength(1))
    expect(await screen.findByText(/No drafts will be raised until you resume it/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Paused' }))
    const paused = (await screen.findByRole('link', { name: 'Nizwa Cafe' })).closest('tr') as HTMLElement
    fireEvent.click(within(paused).getByRole('button', { name: 'Resume' }))
    // Resume can move a lapsed run to today, so the page reads the date it got back.
    expect(await screen.findByText(/The next draft is due/)).toBeTruthy()
  })

  it('opens a schedule, naming the customer, the invoice it copies and what it has done', async () => {
    renderAt('/income/periodic/sch-1')

    // The customer's name is what anyone recognises the schedule by, so it is the heading.
    expect(await screen.findByRole('heading', { level: 1, name: 'Muscat Grand Hotel' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the invoice' }).getAttribute('href')).toBe('/invoices/inv-1')
    expect(screen.getByRole('link', { name: 'Muscat Grand Hotel' }).getAttribute('href')).toBe('/customers/cus-1')
    expect(screen.getByText('Summary invoice')).toBeTruthy()
    expect(screen.getByText('1 draft raised')).toBeTruthy()
    expect(screen.getByText('Draft raised')).toBeTruthy()
    expect(screen.getByText('Could not be raised')).toBeTruthy()
    expect(screen.getByText('template gone')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the draft' }).getAttribute('href')).toBe('/invoices/inv-9')
  })

  it('sets one up by choosing a customer and one of their invoices', async () => {
    renderAt('/income/periodic/new')
    await screen.findByRole('heading', { level: 1, name: 'Set up a periodic invoice' })

    fireEvent.click(screen.getByRole('button', { name: 'Start the schedule' }))
    expect(await screen.findAllByRole('alert')).toHaveLength(2)
    expect(calls('POST', '/api/v1/periodic-invoice-schedules')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Customer' }))
    fireEvent.click(await screen.findByRole('option', { name: /Muscat Grand Hotel/ }))
    // The invoices offered are that customer's own.
    await waitFor(() => expect(calls('GET', '/api/v1/authored-invoices?').some((call) => String(call[0]).includes('customer_id=cus-1'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Invoice to copy' }))
    fireEvent.click(await screen.findByRole('option', { name: /INV-2026-000012/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Start the schedule' }))
    await waitFor(() => expect(calls('POST', '/api/v1/periodic-invoice-schedules')).toHaveLength(1))
    expect(JSON.parse(String(calls('POST', '/api/v1/periodic-invoice-schedules')[0][1]?.body))).toMatchObject({
      customerId: 'cus-1',
      templateInvoiceId: 'inv-1',
      interval: 'MONTHLY',
      firstRunDate: TODAY,
      endDate: null,
      occurrences: null,
    })
  })

  it('edits only what the API lets it, and says why the rest is fixed', async () => {
    renderAt('/income/periodic/sch-1/edit')
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit the schedule' })).toBeTruthy()
    expect(screen.getByText(/fixed once a schedule exists/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Customer' })).toBeNull()

    fireEvent.change(screen.getByLabelText('How often'), { target: { value: 'QUARTERLY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/periodic-invoice-schedules/sch-1')).toHaveLength(1))
    expect(JSON.parse(String(calls('PUT', '/api/v1/periodic-invoice-schedules/sch-1')[0][1]?.body))).toMatchObject({
      interval: 'QUARTERLY',
      nextRunDate: MONTHLY.nextRunDate,
    })
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/income/periodic')
    expect(await screen.findByRole('heading', { level: 1, name: 'الفواتير الدورية' })).toBeTruthy()
    expect(screen.getByText('فاتورة ملخّصة')).toBeTruthy()
  })
})

describe('periodic schedule helpers', () => {
  it('says where a schedule stands, paused and finished before any date', () => {
    expect(scheduleNote(PAUSED, TODAY)).toEqual({ key: 'periodicList.state.paused' })
    expect(scheduleNote({ ...MONTHLY, remainingOccurrences: 0 }, TODAY)).toEqual({ key: 'periodicList.state.finished' })
    expect(scheduleNote({ ...MONTHLY, nextRunDate: TODAY }, TODAY)).toEqual({ key: 'periodicList.state.today' })
    expect(scheduleNote(MONTHLY, TODAY)).toEqual({ key: 'periodicList.state.dueIn', values: { count: 10 } })
    expect(scheduleNote(LAPSED, TODAY)).toEqual({ key: 'periodicList.state.overdue', values: { date: LAPSED.nextRunDate } })
    expect(scheduleTone(LAPSED, TODAY)).toBe('warn')
    expect(scheduleTone(PAUSED, TODAY)).toBe('muted')
    expect(daysBetween(TODAY, plusDays(3))).toBe(3)
  })

  it('counts only what it can count from the list it holds', () => {
    // The lapsed one is still owed, so it counts as due.
    expect(periodicCounts([MONTHLY, LAPSED, PAUSED], TODAY)).toEqual({ total: 3, active: 2, paused: 1, dueSoon: 2 })
    expect(draftedCount(RUNS)).toBe(1)
    expect(narrowSchedules([MONTHLY, PAUSED], 'active', '', () => undefined).map((s) => s.id)).toEqual(['sch-1'])
    expect(narrowSchedules([MONTHLY, PAUSED], 'all', 'nizwa', (id) => (id === 'cus-3' ? 'Nizwa Cafe' : 'Other')).map((s) => s.id)).toEqual(['sch-3'])
  })

  it('refuses what the server would, and sends only the fields each route takes', () => {
    const form = { ...blankPeriodicForm(TODAY), customerId: 'cus-1', templateInvoiceId: 'inv-1' }
    expect(periodicProblems(form, TODAY, false)).toEqual({})
    expect(periodicProblems({ ...form, customerId: '' }, TODAY, false)).toHaveProperty('customerId')
    // Editing cannot change the customer or the template, so neither is asked for.
    expect(periodicProblems({ ...form, customerId: '', templateInvoiceId: '' }, TODAY, true)).toEqual({})
    expect(periodicProblems({ ...form, firstRunDate: plusDays(-1) }, TODAY, false)).toHaveProperty('firstRunDate', 'periodicInvoice.error.datePast')
    expect(periodicProblems({ ...form, endDate: plusDays(-5) }, TODAY, false)).toHaveProperty('endDate', 'periodicInvoice.error.endBeforeStart')
    expect(periodicProblems({ ...form, occurrences: '0' }, TODAY, false)).toHaveProperty('occurrences')
    expect(periodicProblems({ ...form, occurrences: '0' }, TODAY, true)).toEqual({})

    expect(toCreateRequest({ ...form, occurrences: '6' })).toMatchObject({ customerId: 'cus-1', templateInvoiceId: 'inv-1', occurrences: 6, endDate: null })
    expect(toUpdateRequest({ ...form, occurrences: '' })).toEqual({ interval: 'MONTHLY', nextRunDate: TODAY, endDate: null, occurrences: null })
  })

  it('reopens a saved schedule in the form it was saved from', () => {
    expect(formOfSchedule(MONTHLY, 'Muscat Grand Hotel', 'INV-1')).toMatchObject({
      customerId: 'cus-1',
      templateInvoiceId: 'inv-1',
      interval: 'MONTHLY',
      firstRunDate: MONTHLY.nextRunDate,
      occurrences: '6',
    })
    expect(formOfSchedule(PAUSED, '', '')).toMatchObject({ occurrences: '' })
  })
})
