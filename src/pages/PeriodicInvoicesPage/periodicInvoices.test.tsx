import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { PeriodicRunDto, PeriodicScheduleDto } from '../../api/invoices/periodic'
import {
  blankPeriodicForm,
  blankPeriodicLine,
  dateForRepeat,
  daysBetween,
  draftedCount,
  formOfSchedule,
  narrowSchedules,
  periodicCounts,
  periodicProblems,
  repeatValue,
  scheduleNote,
  scheduleTone,
  templateOfForm,
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

const LAPSED: PeriodicScheduleDto = {
  ...MONTHLY,
  id: 'sch-2',
  customerId: 'cus-2',
  nextRunDate: plusDays(-3),
  interval: 'QUARTERLY',
  transactionSubtype: 'CONTINUOUS_SUPPLY',
}
const PAUSED: PeriodicScheduleDto = {
  ...MONTHLY,
  id: 'sch-3',
  customerId: 'cus-3',
  active: false,
  remainingOccurrences: null,
}

const RUNS: PeriodicRunDto[] = [
  {
    runDate: plusDays(-20),
    periodStart: plusDays(-50),
    periodEnd: plusDays(-21),
    outcome: 'DRAFTED',
    draftInvoiceId: 'inv-9',
    draftInvoice: '/api/v1/authored-invoices/inv-9',
    failureReason: null,
    createdAt: '2026-08-01T06:00:00Z',
  },
  {
    runDate: plusDays(-50),
    periodStart: plusDays(-80),
    periodEnd: plusDays(-51),
    outcome: 'FAILED',
    draftInvoiceId: null,
    draftInvoice: null,
    failureReason: 'template gone',
    createdAt: '2026-07-01T06:00:00Z',
  },
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

const BRANCHES = [
  {
    id: 'br-main',
    code: 'MAIN',
    name: 'Al Bahja Coffee (Main)',
    type: 'HEAD_OFFICE',
    city: 'Muscat',
  },
]

const INVOICES = {
  content: [
    {
      id: 'inv-1',
      type: 'INVOICE',
      version: 3,
      authoringState: 'ISSUED',
      deliveryState: 'NOT_SUBMITTED',
      customerId: 'cus-1',
      currency: 'OMR',
      invoiceNumber: 'INV-2026-000012',
      issueDate: plusDays(-30),
      dueDate: null,
      details: null,
      lines: [],
      totals: { totalAmount: 58.59 },
    },
  ],
  number: 0,
  size: 50,
  totalElements: 1,
  totalPages: 1,
}

/** The invoice a schedule was copied from, as the detail route answers it: the pre-fill. */
const TEMPLATE = {
  id: 'inv-1',
  type: 'INVOICE',
  correctionOfInvoiceId: null,
  version: 3,
  authoringState: 'ISSUED',
  deliveryState: 'NOT_SUBMITTED',
  deliveryBlocker: null,
  customerId: 'cus-1',
  branchId: 'br-main',
  currency: 'OMR',
  vatMode: 'EXCLUSIVE',
  invoiceNumber: 'INV-2026-000012',
  issueDate: plusDays(-30),
  dueDate: null,
  issuedAt: null,
  details: {
    deliveryDate: null,
    subject: 'Monthly coffee supply',
    purchaseOrderReference: 'PO-88213',
    customerVisibleNote: null,
    paymentTerms: { code: 'NET30', label: 'Net 30 days' },
    paymentMethod: null,
    correctionReasonCode: null,
    buyerReference: null,
    contractReference: null,
    transactionType: null,
    transactionSubtypes: null,
    invoicingPeriod: null,
  },
  headerDiscount: null,
  lines: [
    {
      lineNumber: 1,
      productId: null,
      productCode: null,
      description: 'Cappuccino - Large',
      unitCode: 'EA',
      quantity: 12,
      unitPrice: 1.8,
      discountType: 'PERCENTAGE',
      discountValue: 0,
      taxCategoryCode: 'S5',
      en16931Category: 'S',
      taxRate: 5,
      exemptionReason: null,
    },
    {
      lineNumber: 2,
      productId: null,
      productCode: null,
      description: 'Coffee Beans 1kg',
      unitCode: 'KGM',
      quantity: 4,
      unitPrice: 9.5,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      taxCategoryCode: 'S5',
      en16931Category: 'S',
      taxRate: 5,
      exemptionReason: null,
    },
  ],
  totals: null,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let schedules: PeriodicScheduleDto[]
let createResponse: () => Response

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )

const sentBody = (method: string, prefix: string) =>
  JSON.parse(String(calls(method, prefix)[0][1]?.body))

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
    if (url === '/api/v1/branches') return json(200, BRANCHES)
    if (url.startsWith('/api/v1/authored-invoices?')) return json(200, INVOICES)
    if (url === '/api/v1/authored-invoices/inv-1') return json(200, TEMPLATE)
    if (url === '/api/v1/authored-invoices/inv-1/internal-note')
      return json(200, { internalNote: null })
    if (url.endsWith('/pause')) return json(200, { ...MONTHLY, active: false })
    if (url.endsWith('/resume')) return json(200, { ...PAUSED, active: true, nextRunDate: TODAY })
    if (url.endsWith('/sch-1/runs')) return json(200, RUNS)
    if (url === '/api/v1/periodic-invoice-schedules/sch-1')
      return method === 'PUT'
        ? json(200, { ...MONTHLY, interval: 'QUARTERLY' })
        : json(200, MONTHLY)
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
    expect(screen.getByText('In 10 days')).toBeTruthy()
    expect(screen.getByText(/Was due/)).toBeTruthy()
    // The counts are the page's own, from the list it holds.
    expect(screen.getByText('3 recurring schedules · 2 active')).toBeTruthy()
    expect(
      within(screen.getByText('Due next 30 days').closest('article') as HTMLElement).getByText(
        '2 invoices to generate',
      ),
    ).toBeTruthy()
    // The design's "Needs attention" counts the paused and the on-request schedules.
    expect(
      within(screen.getByText('Needs attention').closest('article') as HTMLElement).getByText(
        '1 paused · 0 on request',
      ),
    ).toBeTruthy()
    // Paused schedules are not in the Active tab.
    fireEvent.click(screen.getByRole('tab', { name: /^Active/ }))
    expect(screen.queryByRole('link', { name: 'Nizwa Cafe' })).toBeNull()
    expect(
      screen.getByText(/raises these drafts on its own only where the daily sweep is switched on/),
    ).toBeTruthy()
  })

  it('narrows the list it holds, since the API filters nothing', async () => {
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    const before = calls('GET', '/api/v1/periodic-invoice-schedules').length

    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    expect(await screen.findByRole('link', { name: 'Nizwa Cafe' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search by name, customer, reference…'), {
      target: { value: 'sohar' },
    })
    expect(screen.getByRole('link', { name: 'Sohar Beach Resort' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Muscat Grand Hotel' })).toBeNull()
    expect(calls('GET', '/api/v1/periodic-invoice-schedules')).toHaveLength(before)
  })

  it('offers the designed row menu, and pauses and resumes from it', async () => {
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    const row = screen
      .getByRole('link', { name: 'Muscat Grand Hotel' })
      .closest('tr') as HTMLElement

    fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
    // View schedule / Generate invoice / Pause series / Duplicate / Delete, as the Actions frame lists them.
    expect(await screen.findByRole('menuitem', { name: 'View schedule' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Generate invoice' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' }).getAttribute('href')).toBe(
      '/income/periodic/new?copy=sch-1',
    )
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pause series' }))
    await waitFor(() =>
      expect(calls('POST', '/api/v1/periodic-invoice-schedules/sch-1/pause')).toHaveLength(1),
    )
    expect(await screen.findByText(/No drafts will be raised until you resume it/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /^Paused/ }))
    const paused = (await screen.findByRole('link', { name: 'Nizwa Cafe' })).closest(
      'tr',
    ) as HTMLElement
    fireEvent.click(within(paused).getByRole('button', { name: 'Schedule actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Resume series' }))
    // Resume can move a lapsed run to today, so the page reads the date it got back.
    expect(await screen.findByText(/The next draft is due/)).toBeTruthy()
  })

  it('opens a schedule with the invoice it copies filled in, and what it has done', async () => {
    renderAt('/income/periodic/sch-1')

    // The schedule goes by its subject and the customer's name, so that is the heading.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Monthly coffee supply, Muscat Grand Hotel',
      }),
    ).toBeTruthy()
    // The lines are the copied invoice's own, editable, priced by the same engine as the composer.
    expect(await screen.findByDisplayValue('Cappuccino - Large')).toBeTruthy()
    expect(screen.getByDisplayValue('PO-88213')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Muscat Grand Hotel' }).getAttribute('href')).toBe(
      '/customers/cus-1',
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(
      (await screen.findByRole('menuitem', { name: 'Open the invoice' })).getAttribute('href'),
    ).toBe('/invoices/inv-1')
    expect(screen.getByText('Summary invoice')).toBeTruthy()
    expect(screen.getByText('1 draft raised')).toBeTruthy()
    expect(screen.getByText('Draft raised')).toBeTruthy()
    expect(screen.getByText('Could not be raised')).toBeTruthy()
    expect(screen.getByText('template gone')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the draft' }).getAttribute('href')).toBe(
      '/invoices/inv-9',
    )
  })

  it('sets one up from scratch: a customer, the lines, the schedule', async () => {
    renderAt('/income/periodic/new')
    await screen.findByRole('heading', { level: 1, name: 'Set up a periodic invoice' })

    // Nothing is sent without a customer and a described line.
    fireEvent.click(screen.getByRole('button', { name: 'Start the schedule' }))
    expect(await screen.findAllByRole('alert')).toHaveLength(2)
    expect(calls('POST', '/api/v1/periodic-invoice-schedules')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Customer' }))
    fireEvent.click(await screen.findByRole('option', { name: /Muscat Grand Hotel/ }))
    // The customer card takes the Combobox's place, with the design's "Change".
    expect(await screen.findByRole('button', { name: 'Change' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Subject / about'), {
      target: { value: 'Monthly coffee supply' },
    })
    fireEvent.change(screen.getByLabelText('Description 1'), {
      target: { value: 'Cappuccino - Large' },
    })
    fireEvent.change(screen.getByLabelText('Excl. 1'), { target: { value: '1.8' } })
    fireEvent.blur(screen.getByLabelText('Excl. 1'), { target: { value: '1.8' } })
    fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '12' } })

    fireEvent.click(screen.getByRole('button', { name: 'Start the schedule' }))
    await waitFor(() => expect(calls('POST', '/api/v1/periodic-invoice-schedules')).toHaveLength(1))
    // The schedule fields the route takes, plus the template it does not yet (TODO(backend)).
    expect(sentBody('POST', '/api/v1/periodic-invoice-schedules')).toMatchObject({
      customerId: 'cus-1',
      templateInvoiceId: null,
      interval: 'MONTHLY',
      firstRunDate: TODAY,
      endDate: null,
      occurrences: null,
      template: {
        branchId: 'br-main',
        currency: 'OMR',
        taxCategoryCode: 'S5',
        details: { subject: 'Monthly coffee supply', paymentTerms: { code: 'NET30' } },
        lines: [
          {
            lineNumber: 1,
            description: 'Cappuccino - Large',
            itemType: 'GOODS',
            unitCode: 'EA',
            quantity: 12,
            unitPrice: 1.8,
          },
        ],
      },
    })
  })

  it('pre-fills from an invoice the invoice pages hand over, and names it in the request', async () => {
    renderAt('/income/periodic/new?template=inv-1')

    expect(await screen.findByDisplayValue('Cappuccino - Large')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Change' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start the schedule' }))
    await waitFor(() => expect(calls('POST', '/api/v1/periodic-invoice-schedules')).toHaveLength(1))
    expect(sentBody('POST', '/api/v1/periodic-invoice-schedules')).toMatchObject({
      customerId: 'cus-1',
      templateInvoiceId: 'inv-1',
      template: {
        lines: [{ description: 'Cappuccino - Large' }, { description: 'Coffee Beans 1kg' }],
      },
    })
  })

  it('edits the schedule and its content in place', async () => {
    renderAt('/income/periodic/sch-1/edit')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Monthly coffee supply, Muscat Grand Hotel',
      }),
    ).toBeTruthy()
    await screen.findByDisplayValue('Cappuccino - Large')
    // The customer is a card with "Change", not a bare picker, once one is chosen.
    expect(screen.queryByRole('button', { name: 'Customer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Quarterly' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(calls('PUT', '/api/v1/periodic-invoice-schedules/sch-1')).toHaveLength(1),
    )
    expect(sentBody('PUT', '/api/v1/periodic-invoice-schedules/sch-1')).toMatchObject({
      interval: 'QUARTERLY',
      nextRunDate: MONTHLY.nextRunDate,
      customerId: 'cus-1',
      template: {
        lines: [{ description: 'Cappuccino - Large' }, { description: 'Coffee Beans 1kg' }],
      },
    })
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/income/periodic')
    expect(await screen.findByRole('heading', { level: 1, name: 'الفواتير الدورية' })).toBeTruthy()
    expect(screen.getAllByText('فاتورة ملخّصة').length).toBeGreaterThan(0)
  })
})

describe('periodic schedule helpers', () => {
  it('says where a schedule stands, paused and finished before any date', () => {
    expect(scheduleNote(PAUSED, TODAY)).toEqual({ key: 'periodicList.state.paused' })
    expect(scheduleNote({ ...MONTHLY, remainingOccurrences: 0 }, TODAY)).toEqual({
      key: 'periodicList.state.finished',
    })
    expect(scheduleNote({ ...MONTHLY, nextRunDate: TODAY }, TODAY)).toEqual({
      key: 'periodicList.state.today',
    })
    expect(scheduleNote(MONTHLY, TODAY)).toEqual({
      key: 'periodicList.state.dueIn',
      values: { count: 10 },
    })
    expect(scheduleNote(LAPSED, TODAY)).toEqual({
      key: 'periodicList.state.overdue',
      values: { date: LAPSED.nextRunDate },
    })
    expect(scheduleTone(LAPSED, TODAY)).toBe('warn')
    expect(scheduleTone(PAUSED, TODAY)).toBe('muted')
    expect(daysBetween(TODAY, plusDays(3))).toBe(3)
  })

  it('counts only what it can count from the list it holds', () => {
    // The lapsed one is still owed, so it counts as due.
    expect(periodicCounts([MONTHLY, LAPSED, PAUSED], TODAY)).toEqual({
      total: 3,
      active: 2,
      paused: 1,
      dueSoon: 2,
      overdue: 1,
    })
    expect(draftedCount(RUNS)).toBe(1)
    expect(
      narrowSchedules([MONTHLY, PAUSED], 'active', '', () => undefined).map((s) => s.id),
    ).toEqual(['sch-1'])
    expect(
      narrowSchedules([MONTHLY, PAUSED], 'all', 'nizwa', (id) =>
        id === 'cus-3' ? 'Nizwa Cafe' : 'Other',
      ).map((s) => s.id),
    ).toEqual(['sch-3'])
  })

  it('refuses what the server would, and sends the schedule fields plus the template', () => {
    const form = { ...blankPeriodicForm(TODAY), customerId: 'cus-1', branchId: 'br-main' }
    expect(periodicProblems(form, TODAY, false)).toEqual({})
    expect(periodicProblems({ ...form, customerId: '' }, TODAY, false)).toHaveProperty('customerId')
    expect(periodicProblems(form, TODAY, false, 0)).toHaveProperty('lines')
    expect(periodicProblems({ ...form, firstRunDate: plusDays(-1) }, TODAY, false)).toHaveProperty(
      'firstRunDate',
      'periodicInvoice.error.datePast',
    )
    expect(periodicProblems({ ...form, endDate: plusDays(-5) }, TODAY, false)).toHaveProperty(
      'endDate',
      'periodicInvoice.error.endBeforeStart',
    )
    expect(periodicProblems({ ...form, occurrences: '0' }, TODAY, false)).toHaveProperty(
      'occurrences',
    )
    expect(periodicProblems({ ...form, occurrences: '0' }, TODAY, true)).toEqual({})

    const lines = [
      {
        ...blankPeriodicLine('1', '5'),
        description: 'Cappuccino - Large',
        unitPrice: '1.800',
        quantity: '12',
      },
      blankPeriodicLine('2', '5'),
    ]
    const template = templateOfForm(form, lines, true, 'Net 30 days')
    // An undescribed line is not sent; prices travel ex-VAT with the document's category.
    expect(template.lines).toHaveLength(1)
    expect(template.lines[0]).toMatchObject({
      itemType: 'GOODS',
      unitPrice: 1.8,
      quantity: 12,
      taxCategory: { code: 'S5', en16931Category: 'S', rate: 5 },
    })
    expect(
      templateOfForm(form, [{ ...lines[0], unitPrice: '1.890' }], false, null).lines[0].unitPrice,
    ).toBe(1.8)

    expect(toCreateRequest({ ...form, occurrences: '6' }, template)).toMatchObject({
      customerId: 'cus-1',
      templateInvoiceId: null,
      occurrences: 6,
      endDate: null,
      template: { lines: [{ description: 'Cappuccino - Large' }] },
    })
    expect(toUpdateRequest({ ...form, occurrences: '' }, template)).toMatchObject({
      interval: 'MONTHLY',
      nextRunDate: TODAY,
      endDate: null,
      occurrences: null,
    })
  })

  it('reopens a saved schedule in the form it was saved from', () => {
    expect(formOfSchedule(MONTHLY, TODAY)).toMatchObject({
      customerId: 'cus-1',
      templateInvoiceId: 'inv-1',
      interval: 'MONTHLY',
      firstRunDate: MONTHLY.nextRunDate,
      occurrences: '6',
    })
    expect(formOfSchedule(PAUSED, TODAY)).toMatchObject({ occurrences: '' })
  })

  it('reads "Repeats on" off the first run, and moves the first run when it changes', () => {
    expect(repeatValue('MONTHLY', '2026-10-18')).toBe('d18')
    expect(repeatValue('WEEKLY', '2026-09-26')).toBe('w6')
    // Day 20 in the same month when it has not passed, else the month after.
    expect(dateForRepeat('MONTHLY', 'd20', '2026-10-18', '2026-09-25')).toBe('2026-10-20')
    expect(dateForRepeat('MONTHLY', 'd10', '2026-09-25', '2026-09-25')).toBe('2026-10-10')
    expect(dateForRepeat('MONTHLY', 'd31', '2026-09-25', '2026-09-25')).toBe('2026-09-30')
    // The next Monday on or after today.
    expect(dateForRepeat('WEEKLY', 'w1', '2026-09-25', '2026-09-25')).toBe('2026-09-28')
  })
})
