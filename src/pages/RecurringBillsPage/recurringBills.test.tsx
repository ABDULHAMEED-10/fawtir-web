import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { RecurringBillDto, RecurringRunDto, RecurringSummaryDto } from '../../api/expenditure/recurringBills'
import {
  blankRecurringForm,
  chaseBlocker,
  formOf,
  formatVariance,
  hasMore,
  narrow,
  plainWords,
  recurringProblems,
  stateNote,
  toRecurringRequest,
  toneOf,
} from '../../lib/recurringBills'
import { RecurringBillsPage } from './RecurringBillsPage'
import { RecurringBillDetailPage } from '../RecurringBillDetailPage/RecurringBillDetailPage'
import { NewRecurringBillPage } from '../NewRecurringBillPage/NewRecurringBillPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'supplier.read'],
  scopes: [],
  featureFlags: {},
}

const RENT: RecurringBillDto = {
  id: 'rb-1',
  supplierId: 's-1',
  supplierName: 'Nizwa Properties',
  description: 'Shop rent',
  currencyCode: 'OMR',
  totalIncludingVat: 850,
  vatAmount: 0,
  paymentTermsDays: 5,
  interval: 'MONTHLY',
  nextRunDate: '2026-09-28',
  endDate: null,
  remainingOccurrences: null,
  active: true,
  lastRunDate: '2026-08-28',
  mode: 'EXPECT',
  category: 'Premises',
  theirReference: 'LEASE-77',
  arrivesAroundDay: 28,
  paymentDueDay: 5,
  tolerancePercent: 10,
  lateAfterDays: 3,
  autoApproveWithinRange: false,
  notifyUserId: null,
  watchingFrom: '2026-01-01',
  lastVariancePercent: 0,
  expectation: { state: 'LATE', expectedOn: '2026-09-28', lastArrivedOn: '2026-08-28', lastArrivedAmount: 850, variancePercent: null, lateDays: 2 },
}

const SOFTWARE: RecurringBillDto = {
  ...RENT,
  id: 'rb-2',
  supplierName: 'Muscat Cloud',
  description: 'Accounting software',
  category: 'Software',
  theirReference: 'CLOUD-1',
  mode: 'RAISE',
  totalIncludingVat: 42.5,
  arrivesAroundDay: null,
  tolerancePercent: null,
  lateAfterDays: null,
  watchingFrom: null,
  expectation: null,
}

const PAUSED: RecurringBillDto = { ...RENT, id: 'rb-3', description: 'Water cooler', supplierName: 'Sur Water', category: null, theirReference: null, active: false }

const SUMMARY: RecurringSummaryDto = {
  expectedMonthly: 892.5,
  currencyCode: 'OMR',
  recurringCount: 3,
  activeCount: 2,
  lateCount: 1,
  lateDescription: 'Shop rent, 2 days late',
  arrivingNext: '2026-09-28',
  arrivingNextDescription: 'Shop rent, 850.000 OMR',
}

const RUNS: RecurringRunDto[] = [
  { id: 'run-1', runDate: '2026-09-28', periodStart: '2026-09-01', periodEnd: '2026-09-30', billId: null, outcome: 'EXPECTED', failureReason: null, expectedOn: '2026-09-28', variancePercent: null },
  { id: 'run-2', runDate: '2026-08-28', periodStart: '2026-08-01', periodEnd: '2026-08-31', billId: 'bill-9', outcome: 'ARRIVED_OUT_OF_RANGE', failureReason: null, expectedOn: '2026-08-28', variancePercent: 22 },
]

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let listResponse: () => Response
let chaseResponse: () => Response
let saveResponse: () => Response

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  listResponse = () => json(200, { items: [RENT, SOFTWARE, PAUSED], page: 0, pageSize: 50, count: 3 })
  chaseResponse = () => json(202, { recurringBillId: 'rb-1', notifyUserId: null, expectedOn: '2026-09-28' })
  saveResponse = () => json(201, { ...RENT, id: 'rb-9' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/recurring-bills/summary')) return json(200, SUMMARY)
    if (url.endsWith('/rb-1/chase')) return chaseResponse()
    if (url.endsWith('/pause') || url.endsWith('/resume')) return json(200, { ...RENT, active: url.endsWith('/resume') })
    if (url.includes('/rb-1/runs')) return json(200, RUNS)
    if (url === '/api/v1/recurring-bills/rb-1') return json(200, RENT)
    if (url === '/api/v1/recurring-bills' && method === 'POST') return saveResponse()
    if (url.startsWith('/api/v1/recurring-bills?')) return listResponse()
    if (url.startsWith('/api/v1/suppliers?')) return json(200, { items: [], page: 0, pageSize: 20, count: 0, total: 0 })
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
        <Route path="/expenditure/recurring-bills" element={<RecurringBillsPage />} />
        <Route path="/expenditure/recurring-bills/new" element={<NewRecurringBillPage />} />
        <Route path="/expenditure/recurring-bills/:id" element={<RecurringBillDetailPage />} />
        <Route path="/expenditure/recurring-bills/:id/edit" element={<NewRecurringBillPage />} />
        <Route path="/expenditure/bills/:id" element={<p>bill page</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Recurring bills, wired to the API', () => {
  it('shows the summary and every watch, saying where each stands', async () => {
    renderAt('/expenditure/recurring-bills')

    expect(await screen.findByRole('link', { name: 'Shop rent' })).toBeTruthy()
    expect(screen.getByText('892.500')).toBeTruthy()
    expect(screen.getByText('3 set up · 2 active')).toBeTruthy()
    expect(screen.getByText('Shop rent, 2 days late')).toBeTruthy()
    // Each row reads its own state: late, a raising watch, and a paused one.
    expect(screen.getByText('2 days late')).toBeTruthy()
    expect(screen.getByText('Next raised 28 Sept 2026')).toBeTruthy()
    const pausedRow = screen.getByRole('link', { name: 'Water cooler' }).closest('tr') as HTMLElement
    expect(within(pausedRow).getByText('Paused')).toBeTruthy()
    expect(screen.getByText(/only watches and raises on its own where the daily sweep is switched on/)).toBeTruthy()
  })

  it('asks the server for each state, and narrows the page it has with search and category', async () => {
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Shop rent' })
    expect(String(calls('GET', '/api/v1/recurring-bills?')[0][0])).toContain('state=ACTIVE')

    fireEvent.click(screen.getByRole('tab', { name: 'Paused' }))
    await waitFor(() => expect(calls('GET', '/api/v1/recurring-bills?').some((call) => String(call[0]).includes('state=PAUSED'))).toBe(true))

    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    await waitFor(() => expect(calls('GET', '/api/v1/recurring-bills?').some((call) => String(call[0]).includes('state=ALL'))).toBe(true))

    // Search and category are local: the API filters by state only.
    const before = calls('GET', '/api/v1/recurring-bills?').length
    fireEvent.change(screen.getByPlaceholderText('Search what it is, the supplier or their reference'), { target: { value: 'software' } })
    expect(await screen.findByRole('link', { name: 'Accounting software' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Shop rent' })).toBeNull()
    expect(calls('GET', '/api/v1/recurring-bills?')).toHaveLength(before)
  })

  it('pauses a watch from the list and says what that means', async () => {
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Shop rent' })
    const row = screen.getByRole('link', { name: 'Shop rent' }).closest('tr') as HTMLElement

    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(calls('POST', '/api/v1/recurring-bills/rb-1/pause')).toHaveLength(1))
    expect(await screen.findByText(/Nothing will be watched or raised until you resume it/)).toBeTruthy()
  })

  it('opens a watch, shows its periods, and chases it', async () => {
    renderAt('/expenditure/recurring-bills/rb-1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Shop rent' })).toBeTruthy()
    expect(screen.getByText('28 Aug 2026 · 850.000')).toBeTruthy()
    expect(screen.getByText('Waiting for it')).toBeTruthy()
    expect(screen.getByText('Arrived, outside range')).toBeTruthy()
    expect(screen.getByText('+22%')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the bill' }).getAttribute('href')).toBe('/expenditure/bills/bill-9')

    fireEvent.click(screen.getByRole('button', { name: 'Chase it' }))
    await waitFor(() => expect(calls('POST', '/api/v1/recurring-bills/rb-1/chase')).toHaveLength(1))
    expect(await screen.findByText('Whoever is named has been told.')).toBeTruthy()
  })

  it('reads a refused chase as its own sentence', async () => {
    chaseResponse = () => json(400, { type: 'https://api.fawtir.om/problems/expenditure-refused', error: 'RECURRING_BILL_PAUSED', detail: 'no' })
    renderAt('/expenditure/recurring-bills/rb-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Chase it' }))
    expect(await screen.findByText('This one is paused. Resume it before chasing.')).toBeTruthy()
  })

  it('sets one up, asking only what the chosen mode needs', async () => {
    renderAt('/expenditure/recurring-bills/new')
    await screen.findByRole('heading', { level: 1, name: 'Set up a recurring bill' })

    // Watching: an arrival day and a tolerance. Raising: neither, but a first date.
    expect(screen.getByLabelText('Usually arrives on day')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Fawtir raises it/ }))
    expect(screen.queryByLabelText('Usually arrives on day')).toBeNull()
    expect(screen.getByLabelText('First raised on')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Watching for it/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }))
    expect(await screen.findAllByRole('alert')).toHaveLength(3)
    expect(calls('POST', '/api/v1/recurring-bills')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('What to call it'), { target: { value: 'Shop rent' } })
    fireEvent.change(screen.getByLabelText('Usual amount, VAT included'), { target: { value: '850' } })
    fireEvent.change(screen.getByLabelText('Usually arrives on day'), { target: { value: '28' } })
    // The supplier picker takes a name as written when nobody is chosen from the list.
    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    fireEvent.change(await screen.findByPlaceholderText('Search your suppliers'), { target: { value: 'Nizwa Properties' } })
    fireEvent.click(await screen.findByRole('button', { name: /Use “Nizwa Properties” as written/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }))
    await waitFor(() => expect(calls('POST', '/api/v1/recurring-bills')).toHaveLength(1))
    const body = JSON.parse(String(calls('POST', '/api/v1/recurring-bills')[0][1]?.body))
    expect(body).toMatchObject({ mode: 'EXPECT', description: 'Shop rent', totalIncludingVat: 850, arrivesAroundDay: 28, startDate: null })
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/expenditure/recurring-bills')
    expect(await screen.findByRole('heading', { level: 1, name: 'الفواتير المتكررة' })).toBeTruthy()
    expect(screen.getByText('متأخرة يومين')).toBeTruthy()
    const paused = screen.getByRole('link', { name: 'Water cooler' }).closest('tr') as HTMLElement
    expect(within(paused).getByText('موقوفة')).toBeTruthy()
  })
})

describe('recurring bill helpers', () => {
  it('says where a watch stands, paused before anything else', () => {
    expect(stateNote(RENT)).toEqual({ key: 'recurringBills.state.late', values: { count: 2 } })
    expect(stateNote(PAUSED)).toEqual({ key: 'recurringBills.state.paused' })
    expect(stateNote(SOFTWARE)).toEqual({ key: 'recurringBills.state.willRaise', values: { date: '2026-09-28' } })
    expect(stateNote({ ...RENT, expectation: { ...RENT.expectation!, state: 'ARRIVED_OUT_OF_RANGE', variancePercent: 22 } })).toEqual({
      key: 'recurringBills.state.outOfRange',
      values: { percent: '+22%' },
    })
    expect(toneOf(RENT)).toBe('warn')
    expect(toneOf(PAUSED)).toBe('muted')
    expect(formatVariance(-5.25)).toBe('-5.3%')
    expect(formatVariance(null)).toBe('—')
  })

  it('knows what the server would refuse before asking', () => {
    const form = { ...blankRecurringForm('2026-09-18'), supplierName: 'X', description: 'Y', totalIncludingVat: '100' }
    expect(recurringProblems(form)).toEqual({})
    expect(recurringProblems({ ...form, totalIncludingVat: '0' })).toHaveProperty('totalIncludingVat')
    expect(recurringProblems({ ...form, vatAmount: '200' })).toHaveProperty('vatAmount', 'recurringBills.error.vatExceedsTotal')
    expect(recurringProblems({ ...form, arrivesAroundDay: '' })).toHaveProperty('arrivesAroundDay', 'recurringBills.error.arrivalDayRequired')
    expect(recurringProblems({ ...form, interval: 'WEEKLY', arrivesAroundDay: '9' })).toHaveProperty('arrivesAroundDay', 'recurringBills.error.arrivalDayInvalid')
    expect(recurringProblems({ ...form, tolerancePercent: '150' })).toHaveProperty('tolerancePercent')
    expect(recurringProblems({ ...form, lateAfterDays: '90' })).toHaveProperty('lateAfterDays')
    expect(recurringProblems({ ...form, paymentDueDay: '40' })).toHaveProperty('paymentDueDay')
  })

  it('sends only what the chosen mode uses', () => {
    const form = { ...blankRecurringForm('2026-09-18'), supplierName: 'X', description: 'Y', totalIncludingVat: '100' }
    const watching = toRecurringRequest(form)
    expect(watching).toMatchObject({ mode: 'EXPECT', arrivesAroundDay: 1, tolerancePercent: 10, lateAfterDays: 5, startDate: null, watchingFrom: '2026-09-18' })
    const raising = toRecurringRequest({ ...form, mode: 'RAISE' })
    expect(raising).toMatchObject({ mode: 'RAISE', arrivesAroundDay: null, tolerancePercent: null, lateAfterDays: null, autoApproveWithinRange: null, startDate: '2026-09-18', watchingFrom: null })
  })

  it('reopens a saved watch in the form it was saved from', () => {
    const form = formOf(RENT, '2026-09-18')
    expect(form).toMatchObject({ mode: 'EXPECT', supplierName: 'Nizwa Properties', arrivesAroundDay: '28', tolerancePercent: '10', lateAfterDays: '3' })
    expect(formOf(SOFTWARE, '2026-09-18')).toMatchObject({ mode: 'RAISE', arrivesAroundDay: '', tolerancePercent: '' })
  })

  it('says why a chase cannot be sent, and reads the whole thing back in words', () => {
    expect(chaseBlocker(RENT)).toBeNull()
    expect(chaseBlocker(SOFTWARE)).toBe('recurringBills.chase.notExpecting')
    expect(chaseBlocker(PAUSED)).toBe('recurringBills.chase.paused')
    expect(plainWords({ ...blankRecurringForm('2026-09-18'), supplierName: 'Nizwa', description: 'Rent', totalIncludingVat: '850' })).toEqual({
      key: 'recurringBills.plain.expect',
      values: { supplier: 'Nizwa', description: 'Rent', amount: '850', day: '1', tolerance: '10', count: 5 },
    })
  })

  it('narrows a page without pretending to filter the server, and knows a full page may have more', () => {
    expect(narrow([RENT, SOFTWARE, PAUSED], 'lease', '').map((bill) => bill.id)).toEqual(['rb-1'])
    expect(narrow([RENT, SOFTWARE, PAUSED], '', 'Software').map((bill) => bill.id)).toEqual(['rb-2'])
    expect(narrow([RENT, SOFTWARE, PAUSED], 'sur', '').map((bill) => bill.id)).toEqual(['rb-3'])
    expect(hasMore({ count: 50, pageSize: 50 })).toBe(true)
    expect(hasMore({ count: 3, pageSize: 50 })).toBe(false)
  })
})
