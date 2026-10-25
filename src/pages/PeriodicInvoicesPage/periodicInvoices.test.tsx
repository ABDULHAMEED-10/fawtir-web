import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { answerStanding as answer, settle } from '../../testing/subscriptionStanding'
import type { PeriodicRunDto, PeriodicScheduleDto } from '../../api/invoices/periodic'
import {
  blankPeriodicForm,
  blankPeriodicLine,
  dateForRepeat,
  daysBetween,
  draftedCount,
  formOfSchedule,
  narrowSchedules,
  ownTemplateInfo,
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
let runNowResponse: () => Response
let deleteResponse: () => Response
let updateResponse: () => Response
let scheduleDetail: PeriodicScheduleDto
let runList: PeriodicRunDto[]

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
  runNowResponse = () =>
    json(200, { ...RUNS[0], runDate: MONTHLY.nextRunDate, draftInvoiceId: 'inv-10' })
  deleteResponse = () => new Response(null, { status: 204 })
  updateResponse = () => json(200, { ...MONTHLY, interval: 'QUARTERLY' })
  scheduleDetail = MONTHLY
  runList = RUNS
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
    if (url.endsWith('/sch-1/runs'))
      return method === 'POST' ? runNowResponse() : json(200, runList)
    if (url === '/api/v1/periodic-invoice-schedules/sch-1')
      return method === 'PUT'
        ? updateResponse()
        : method === 'DELETE'
          ? deleteResponse()
          : json(200, scheduleDetail)
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

/** Opens a row's menu, read afresh since the list re-renders after each action. */
async function chooseFromRow(customer: string, item: string) {
  const row = (await screen.findByRole('link', { name: customer })).closest('tr') as HTMLElement
  fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: item }))
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
    fireEvent.change(screen.getByLabelText('Price excl. 1'), { target: { value: '1.8' } })
    fireEvent.blur(screen.getByLabelText('Price excl. 1'), { target: { value: '1.8' } })
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

  it('generates an invoice from the row menu after asking, and says when the server refuses', async () => {
    const confirmGenerate = async () =>
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generate invoice' }),
      )
    renderAt('/income/periodic')

    // A mis-click sends nothing: the dialog names the date the schedule moves to, and Cancel stops.
    await chooseFromRow('Muscat Grand Hotel', 'Generate invoice')
    expect(await screen.findByText('Raise the next invoice now?')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByText(/^The schedule moves to /)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls('POST', '/api/v1/periodic-invoice-schedules/sch-1/runs')).toHaveLength(0)

    await chooseFromRow('Muscat Grand Hotel', 'Generate invoice')
    await confirmGenerate()
    await waitFor(() =>
      expect(calls('POST', '/api/v1/periodic-invoice-schedules/sch-1/runs')).toHaveLength(1),
    )
    expect(sentBody('POST', '/api/v1/periodic-invoice-schedules/sch-1/runs')).toEqual({})
    expect(await screen.findByText(/Draft raised\. The next one is due/)).toBeTruthy()

    runNowResponse = () =>
      json(409, { title: 'Refused', status: 409, code: 'PERIODIC_RUN_IN_PROGRESS' })
    await chooseFromRow('Muscat Grand Hotel', 'Generate invoice')
    await confirmGenerate()
    expect(await screen.findByText(/is being raised right now/)).toBeTruthy()

    runNowResponse = () =>
      json(200, { ...RUNS[1], outcome: 'DEAD_LETTERED', retryable: true, runDate: TODAY })
    await chooseFromRow('Muscat Grand Hotel', 'Generate invoice')
    await confirmGenerate()
    expect(await screen.findByText(/The draft could not be raised/)).toBeTruthy()
  })

  it('offers Generate only on an active series, and says "last" only with one run left', async () => {
    schedules = [{ ...MONTHLY, remainingOccurrences: 1 }, LAPSED, PAUSED]
    renderAt('/income/periodic')

    // A paused series is refused by the server, so its menu offers no Generate.
    const paused = (await screen.findByRole('link', { name: 'Nizwa Cafe' })).closest(
      'tr',
    ) as HTMLElement
    fireEvent.click(within(paused).getByRole('button', { name: 'Schedule actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Resume series' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Generate invoice' })).toBeNull()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await chooseFromRow('Muscat Grand Hotel', 'Generate invoice')
    expect(
      await within(await screen.findByRole('dialog')).findByText(/schedule's last invoice/),
    ).toBeTruthy()
  })

  it('shows a finished series as finished, not paused, with nothing to resume or generate', async () => {
    const FINISHED: PeriodicScheduleDto = {
      ...PAUSED,
      remainingOccurrences: 0,
    }
    schedules = [MONTHLY, LAPSED, FINISHED]
    renderAt('/income/periodic')
    const row = (await screen.findByRole('link', { name: 'Nizwa Cafe' })).closest(
      'tr',
    ) as HTMLElement
    expect(within(row).getAllByText('Finished').length).toBeGreaterThan(0)
    expect(within(row).queryByText('Paused')).toBeNull()
    expect(
      within(screen.getByText('Needs attention').closest('article') as HTMLElement).getByText(
        '0 paused · 0 on request',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Paused/ }).textContent).toContain('0')
    fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
    expect(await screen.findByRole('menuitem', { name: 'View schedule' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Resume series' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Generate invoice' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Pause series' })).toBeNull()
  })

  it('exports only the ticked schedules, else the list as narrowed', async () => {
    const blobs: Blob[] = []
    const create = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:periodic'
    })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect((await blobs[0].text()).trim().split('\n')).toHaveLength(4)

    fireEvent.click(screen.getByRole('checkbox', { name: /Sohar Beach Resort/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    const picked = (await blobs[1].text()).trim().split('\n')
    expect(picked).toHaveLength(2)
    expect(picked[1]).toContain('Sohar Beach Resort')
  })

  it('offers a viewer nothing that changes a schedule', async () => {
    who = { ...DRAFTER, permissions: ['invoice.read', 'reports.read'] }
    renderAt('/income/periodic')
    const row = (await screen.findByRole('link', { name: 'Muscat Grand Hotel' })).closest(
      'tr',
    ) as HTMLElement
    expect(screen.queryByRole('link', { name: /New periodic invoice/ })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
    expect(await screen.findByRole('menuitem', { name: 'View schedule' })).toBeTruthy()
    for (const name of ['Generate invoice', 'Pause series', 'Delete', 'Duplicate'])
      expect(screen.queryByRole('menuitem', { name })).toBeNull()
  })

  it('deletes a schedule after asking, and says why when it has an open run', async () => {
    renderAt('/income/periodic')
    await chooseFromRow('Muscat Grand Hotel', 'Delete')
    // Nothing is sent until the dialog is confirmed.
    expect(await screen.findByText('Delete this schedule?')).toBeTruthy()
    expect(calls('DELETE', '/api/v1/periodic-invoice-schedules/sch-1')).toHaveLength(0)

    deleteResponse = () =>
      json(409, { title: 'Refused', status: 409, code: 'PERIODIC_SCHEDULE_HAS_OPEN_RUN' })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/has a run in progress or waiting to be retried/)).toBeTruthy()

    deleteResponse = () => new Response(null, { status: 204 })
    const before = calls('GET', '/api/v1/periodic-invoice-schedules').length
    await chooseFromRow('Muscat Grand Hotel', 'Delete')
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    )
    expect(await screen.findByText('Deleted. The drafts it raised are kept.')).toBeTruthy()
    expect(calls('DELETE', '/api/v1/periodic-invoice-schedules/sch-1')).toHaveLength(2)
    await waitFor(() =>
      expect(calls('GET', '/api/v1/periodic-invoice-schedules').length).toBeGreaterThan(before),
    )
  })

  it('dates "Started" in Muscat and badges a run issued once it has a number', async () => {
    // 00:56 in Muscat on 1 Oct is still 30 Sep in UTC.
    scheduleDetail = { ...MONTHLY, createdAt: '2026-09-30T20:56:00Z' }
    runList = [{ ...RUNS[0], invoiceNumber: 'INV-2026-000031' }, RUNS[1]]
    renderAt('/income/periodic/sch-1')
    expect(await screen.findByText('INV-2026-000031')).toBeTruthy()
    const started = screen.getByText('Started').parentElement as HTMLElement
    expect(within(started).getByText(/1 Oct 2026/)).toBeTruthy()
    const run = screen.getByText('INV-2026-000031').closest('div.flex') as HTMLElement
    expect(within(run.parentElement as HTMLElement).getByText('Issued')).toBeTruthy()
    // "Issued" counts the runs that took a number, not every run raised.
    const issued = screen
      .getAllByText('Issued')
      .find((node) => node.parentElement?.textContent?.includes('1 invoice'))
    expect(issued).toBeTruthy()
  })

  it('asks for a reload when the schedule raised a draft since it was opened', async () => {
    updateResponse = () =>
      json(409, { title: 'Refused', status: 409, code: 'PERIODIC_RUN_ALREADY_RAISED' })
    renderAt('/income/periodic/sch-1/edit')
    await screen.findByDisplayValue('Cappuccino - Large')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/This schedule changed since you opened it/)).toBeTruthy()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/income/periodic')
    expect(await screen.findByRole('heading', { level: 1, name: 'الفواتير الدورية' })).toBeTruthy()
    expect((await screen.findAllByText('فاتورة ملخّصة')).length).toBeGreaterThan(0)
  })
})

describe('Pause, Resume and Generate while the subscription is read-only (owner, 23 Oct 2026)', () => {
  // A read-only subscription skips the runs; Pause stays, Resume and Generate wait until they pay.
  const answerStanding = (restriction: string | null) => {
    who = { ...DRAFTER, permissions: [...DRAFTER.permissions, 'tenant.plan.read'] }
    answer(fetchMock, restriction)
  }
  const subscriptionRead = () => calls('GET', '/api/v1/settings/subscription').length > 0

  async function openMenu(customer: string) {
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    const row = (await screen.findByRole('link', { name: customer })).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
  }

  it('offers Resume on a paused series while the subscription is usable', async () => {
    answerStanding(null)
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    await openMenu('Nizwa Cafe')
    expect(await screen.findByRole('menuitem', { name: 'Resume series' })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await openMenu('Muscat Grand Hotel')
    expect(await screen.findByRole('menuitem', { name: 'Generate invoice' })).toBeTruthy()
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'hides Resume but keeps Pause in the list while %s',
    async (restriction) => {
      answerStanding(restriction)
      renderAt('/income/periodic')
      await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
      await waitFor(() => expect(subscriptionRead()).toBe(true))
      await settle()
      await openMenu('Nizwa Cafe')
      expect(await screen.findByRole('menuitem', { name: 'View schedule' })).toBeTruthy()
      expect(screen.queryByRole('menuitem', { name: 'Resume series' })).toBeNull()
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      await openMenu('Muscat Grand Hotel')
      expect(await screen.findByRole('menuitem', { name: 'Pause series' })).toBeTruthy()
      // Generate makes a new draft now, so it is not offered either.
      expect(screen.queryByRole('menuitem', { name: 'Generate invoice' })).toBeNull()
    },
  )

  it('offers Resume on the paused series page while the subscription is usable', async () => {
    answerStanding(null)
    scheduleDetail = { ...MONTHLY, active: false }
    renderAt('/income/periodic/sch-1')
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    expect(await screen.findByRole('button', { name: 'Resume series' })).toBeTruthy()
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'hides Resume on the paused series page while %s, and keeps Pause on an active one',
    async (restriction) => {
      answerStanding(restriction)
      scheduleDetail = { ...MONTHLY, active: false }
      const view = renderAt('/income/periodic/sch-1')
      await screen.findByRole('heading', {
        level: 1,
        name: 'Monthly coffee supply, Muscat Grand Hotel',
      })
      await waitFor(() => expect(subscriptionRead()).toBe(true))
      await settle()
      expect(screen.queryByRole('button', { name: 'Resume series' })).toBeNull()
      view.unmount()

      scheduleDetail = MONTHLY
      renderAt('/income/periodic/sch-1')
      expect(await screen.findByRole('button', { name: 'Pause series' })).toBeTruthy()
    },
  )
})

// Both checks hold together: read-only (ST-2) and the plan's switch (PL-8). Resume and Generate
// show only when both allow them; Pause stays under either.
describe('read-only and the plan together (ST-2 and PL-8)', () => {
  const withPlan = (on: boolean, restriction: string | null) => {
    who = {
      ...DRAFTER,
      permissions: [...DRAFTER.permissions, 'tenant.plan.read'],
      planFeaturesEnforced: true,
      planFeatures: { recurringInvoices: on },
    }
    answer(fetchMock, restriction)
  }
  const subscriptionRead = () => calls('GET', '/api/v1/settings/subscription').length > 0

  async function menuOf(customer: string) {
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    const row = (await screen.findByRole('link', { name: customer })).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
  }

  it.each([
    ['usable, plan has it', true, null, true],
    ['usable, plan lacks it', false, null, false],
    ['read-only, plan has it', true, 'SUBSCRIPTION_SUSPENDED', false],
  ] as const)('%s', async (_, on, restriction, offered) => {
    withPlan(on, restriction)
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    await settle()
    await menuOf('Muscat Grand Hotel')
    expect(await screen.findByRole('menuitem', { name: 'Pause series' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Generate invoice' }) !== null).toBe(offered)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await menuOf('Nizwa Cafe')
    await screen.findByRole('menuitem', { name: 'View schedule' })
    expect(screen.queryByRole('menuitem', { name: 'Resume series' }) !== null).toBe(offered)
    expect(screen.queryByRole('link', { name: 'New periodic invoice' }) !== null).toBe(offered)
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

  it('prices a schedule from its own template, as a run would draft it', () => {
    const form = {
      ...blankPeriodicForm(TODAY),
      customerId: 'cus-1',
      branchId: 'br-main',
      subject: 'Coffee supply',
    }
    const line = { ...blankPeriodicLine('1', '5'), description: 'Cappuccino - Large' }
    const small = templateOfForm(
      form,
      [{ ...line, unitPrice: '1.800', quantity: '12' }],
      true,
      null,
    )
    // 12 x 1.800 = 21.600, plus 5% VAT.
    expect(ownTemplateInfo(small)).toMatchObject({
      number: null,
      subject: 'Coffee supply',
      total: 22.68,
      currency: 'OMR',
    })
    // Past a thousand the figure stays a number (no grouping separator in the way).
    const large = templateOfForm(
      form,
      [{ ...line, unitPrice: '1250.000', quantity: '1' }],
      true,
      null,
    )
    expect(ownTemplateInfo(large).total).toBe(1312.5)
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

// Business Rules PL-8: a plan without periodic invoices keeps every series made before readable
// and pausable; making, generating, copying, resuming and saving wait for a plan that has them.
describe('a plan without periodic invoices (PL-8)', () => {
  const plan = (on: boolean): Entitlements => ({
    ...DRAFTER,
    planFeaturesEnforced: true,
    planFeatures: { recurringInvoices: on },
  })

  it('keeps the list, View, Pause and Delete, and hides New, Generate and Duplicate', async () => {
    who = plan(false)
    renderAt('/income/periodic')
    const row = (await screen.findByRole('link', { name: 'Muscat Grand Hotel' })).closest(
      'tr',
    ) as HTMLElement
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'New periodic invoice' })).toBeNull(),
    )
    fireEvent.click(within(row).getByRole('button', { name: 'Schedule actions' }))
    expect(await screen.findByRole('menuitem', { name: 'View schedule' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Pause series' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Generate invoice' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).toBeNull()
  })

  it('offers New when the plan has periodic invoices', async () => {
    who = plan(true)
    renderAt('/income/periodic')
    await screen.findByRole('link', { name: 'Muscat Grand Hotel' })
    expect(await screen.findByRole('link', { name: 'New periodic invoice' })).toBeTruthy()
  })

  it('opens a series read-only, with Pause and no Save', async () => {
    who = plan(false)
    renderAt('/income/periodic/sch-1')
    expect(await screen.findByRole('button', { name: 'Pause series' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
  })

  it('says beside Paused when a plan change paused a series, on the list and its page', async () => {
    const REASON = 'Your plan does not include periodic invoices'
    who = plan(false)
    schedules = [MONTHLY, { ...PAUSED, pauseReason: 'PLAN_FEATURE_NOT_INCLUDED' }]
    const view = renderAt('/income/periodic')
    const row = (await screen.findByRole('link', { name: 'Nizwa Cafe' })).closest(
      'tr',
    ) as HTMLElement
    expect(within(row).getByText(REASON)).toBeTruthy()
    const active = screen.getByRole('link', { name: 'Muscat Grand Hotel' }).closest(
      'tr',
    ) as HTMLElement
    expect(within(active).queryByText(REASON)).toBeNull()
    view.unmount()

    scheduleDetail = { ...MONTHLY, active: false, pauseReason: 'PLAN_FEATURE_NOT_INCLUDED' }
    renderAt('/income/periodic/sch-1')
    expect(await screen.findByText(REASON)).toBeTruthy()
  })

  it('adds nothing beside Paused for a pause by hand or a reason it does not know', async () => {
    who = plan(true)
    schedules = [
      { ...PAUSED, pauseReason: null },
      {
        ...PAUSED,
        id: 'sch-4',
        pauseReason: 'SOMETHING_NEW' as unknown as 'PLAN_FEATURE_NOT_INCLUDED',
      },
    ]
    renderAt('/income/periodic')
    expect((await screen.findAllByRole('link', { name: 'Nizwa Cafe' })).length).toBe(2)
    expect(screen.queryByText('Your plan does not include periodic invoices')).toBeNull()
  })
})
