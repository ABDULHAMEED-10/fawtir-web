import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  ReceivableBillDto,
  RecurringBillDto,
  RecurringBillRequestDto,
  RecurringRunDto,
  RecurringSummaryDto,
} from '../../api/expenditure/recurringBills'
import {
  WEEKDAY_OPTIONS,
  activityOf,
  amountOf,
  blankRecurringForm,
  cadenceNote,
  canResume,
  chaseNotice,
  formOf,
  isEnded,
  plainWords,
  stateNote,
  toRecurringRequest,
  trackRecord,
  weekdayKey,
} from '../../lib/recurringBills'
import { RecurringBillsPage } from './RecurringBillsPage'
import { RecurringBillDetailPage } from '../RecurringBillDetailPage/RecurringBillDetailPage'
import { NewRecurringBillPage } from '../NewRecurringBillPage/NewRecurringBillPage'

/**
 * The owner-approved Recurring bills items of 1 Oct 2026 (Decisions-Abdul-Answers, items 23 to
 * 32) and the audit's web fixes (REC-05, REC-14), against the backend contract of the same day.
 */

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'invoice.export', 'supplier.read'],
  scopes: [],
  featureFlags: {},
}

const VIEWER: Entitlements = {
  ...MANAGER,
  roles: [{ id: 'r-2', code: 'VIEWER', name: 'Viewer', systemRole: true }],
  permissions: ['invoice.read', 'supplier.read'],
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
  category: 'Rent & premises',
  theirReference: 'LEASE-77',
  arrivesAroundDay: 28,
  paymentDueDay: 5,
  tolerancePercent: 10,
  lateAfterDays: 2,
  autoApproveWithinRange: false,
  notifyUserId: 'u-2',
  watchingFrom: '2026-01-01',
  lastVariancePercent: 0,
  expectation: {
    state: 'LATE',
    expectedOn: '2026-09-28',
    lastArrivedOn: '2026-08-28',
    lastArrivedAmount: 850,
    variancePercent: null,
    lateDays: 2,
  },
  taxCategoryCode: 'Z0',
  status: 'ACTIVE',
  ended: false,
  endedOn: null,
  pausedAt: null,
  pauseReason: null,
  toleranceEnabled: true,
  notifyUserName: 'Yusuf Al Balushi',
  notWatched: [],
}

const ENDED: RecurringBillDto = {
  ...RENT,
  id: 'rb-ended',
  description: 'Old lease',
  active: false,
  status: 'ENDED',
  ended: true,
  endedOn: '2026-06-30',
  endDate: '2026-06-30',
  expectation: { ...RENT.expectation!, state: 'DUE_TO_ARRIVE', lateDays: null },
}

const HELD: RecurringBillDto = {
  ...RENT,
  id: 'rb-held',
  description: 'Water cooler',
  active: false,
  status: 'PAUSED',
  pausedAt: '2026-09-20T08:00:00Z',
  pauseReason: 'SUPPLIER_SWITCHED_OFF',
}

const PAUSED: RecurringBillDto = {
  ...RENT,
  id: 'rb-paused',
  description: 'Coffee machine lease',
  active: false,
  status: 'PAUSED',
  pausedAt: '2026-09-20T08:00:00Z',
  pauseReason: 'MANUAL',
}

const WEEKLY: RecurringBillDto = {
  ...RENT,
  id: 'rb-weekly',
  description: 'Cold delivery',
  interval: 'WEEKLY',
  arrivesAroundDay: 1,
  paymentDueDay: null,
}

const RAISING: RecurringBillDto = {
  ...RENT,
  id: 'rb-raise',
  description: 'Window cleaning',
  mode: 'RAISE',
  currencyCode: 'USD',
  paymentTermsDays: 30,
  remainingOccurrences: 6,
  arrivesAroundDay: null,
  paymentDueDay: null,
  tolerancePercent: null,
  toleranceEnabled: false,
  lateAfterDays: null,
  watchingFrom: null,
  notifyUserId: null,
  notifyUserName: null,
  expectation: null,
}

const SUMMARY: RecurringSummaryDto = {
  expectedMonthly: 850,
  currencyCode: 'OMR',
  recurringCount: 4,
  activeCount: 1,
  lateCount: 1,
  lateDescription: 'Shop rent, 2 days late',
  arrivingNext: '2026-09-28',
  arrivingNextDescription: 'Shop rent, 850.000 OMR',
  pausedCount: 2,
  endedCount: 1,
}

const RUNS: RecurringRunDto[] = [
  {
    id: 'run-1',
    runDate: '2026-09-28',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    billId: null,
    outcome: 'LATE',
    failureReason: null,
    expectedOn: '2026-09-28',
    variancePercent: null,
    billNumber: null,
    billIssueDate: null,
    billAmount: null,
    billCurrency: null,
    paidOn: null,
    markedAsExpected: false,
    receivedManually: false,
  },
  {
    id: 'run-2',
    runDate: '2026-08-28',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    billId: 'bill-9',
    outcome: 'ARRIVED',
    failureReason: null,
    expectedOn: '2026-08-28',
    variancePercent: 1.18,
    billNumber: 'NP-0812',
    billIssueDate: '2026-08-27',
    billAmount: 860.03,
    billCurrency: 'OMR',
    paidOn: '2026-09-04',
    markedAsExpected: false,
    receivedManually: false,
  },
]

const CANDIDATES: ReceivableBillDto[] = [
  {
    billId: 'bill-21',
    billNumber: 'NP-0931',
    issueDate: '2026-09-30',
    totalIncludingVat: 850,
    currencyCode: 'OMR',
    variancePercent: 0,
    inWindow: true,
  },
  {
    billId: 'bill-22',
    billNumber: null,
    issueDate: '2026-07-02',
    totalIncludingVat: 901,
    currencyCode: 'OMR',
    variancePercent: 6,
    inWindow: false,
  },
]

/** The fields `RecurringBillController.RecurringBillRequest` declares; the API refuses any other. */
const REQUEST_FIELDS = [
  'supplierId',
  'supplierName',
  'description',
  'currencyCode',
  'totalIncludingVat',
  'vatAmount',
  'paymentTermsDays',
  'interval',
  'startDate',
  'endDate',
  'occurrences',
  'mode',
  'category',
  'theirReference',
  'arrivesAroundDay',
  'paymentDueDay',
  'tolerancePercent',
  'lateAfterDays',
  'autoApproveWithinRange',
  'notifyUserId',
  'watchingFrom',
  'taxCategoryCode',
  'toleranceEnabled',
]

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const refusal = (code: string, status = 400) =>
  json(status, {
    type: 'https://api.fawtir.om/problems/expenditure-refused',
    error: code,
    detail: 'English only',
  })

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let bills: Record<string, RecurringBillDto>
let listItems: () => RecurringBillDto[]
let chaseResponse: () => Response
let resumeResponse: (id: string) => Response
let recipientsResponse: () => Response
let receivableResponse: () => Response
let markResponse: () => Response
let runsOf: (id: string) => RecurringRunDto[]
let supplierStatus: 'ACTIVE' | 'SWITCHED_OFF' | 'UNREADABLE'
let saved: () => void

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  bills = {
    'rb-1': RENT,
    'rb-ended': ENDED,
    'rb-held': HELD,
    'rb-paused': PAUSED,
    'rb-weekly': WEEKLY,
    'rb-raise': RAISING,
  }
  listItems = () => [RENT, ENDED, HELD, PAUSED]
  chaseResponse = () =>
    json(202, {
      recurringBillId: 'rb-1',
      notifyUserId: 'u-2',
      expectedOn: '2026-09-28',
      told: true,
      toldNames: ['Yusuf Al Balushi'],
      notToldReason: null,
    })
  resumeResponse = (id) => json(200, { ...bills[id], active: true, status: 'ACTIVE' })
  recipientsResponse = () =>
    json(200, [
      { id: 'u-2', displayName: 'Yusuf Al Balushi' },
      { id: 'u-3', displayName: null },
    ])
  receivableResponse = () => json(200, CANDIDATES)
  markResponse = () => json(200, RENT)
  runsOf = (id) => (id === 'rb-1' ? RUNS : [])
  supplierStatus = 'ACTIVE'
  saved = () => {}
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/recurring-bills/summary')) return json(200, SUMMARY)
    if (url === '/api/v1/recurring-bills/recipients') return recipientsResponse()
    if (url.startsWith('/api/v1/recurring-bills?'))
      return json(200, {
        items: listItems(),
        page: Number(new URL(url, 'http://x').searchParams.get('page')),
        pageSize: 50,
        count: listItems().length,
      })
    if (url === '/api/v1/recurring-bills' && method === 'POST') {
      saved()
      return json(201, { ...RENT, id: 'rb-9' })
    }
    const match = /^\/api\/v1\/recurring-bills\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(url)
    if (match) {
      const [, id, rest = ''] = match
      if (!bills[id]) return refusal('RECURRING_BILL_NOT_FOUND', 404)
      if (rest === '' && method === 'GET') return json(200, bills[id])
      if (rest === '' && method === 'PUT') {
        saved()
        return json(200, bills[id])
      }
      if (rest === '/runs') return json(200, runsOf(id))
      if (rest === '/chase') return chaseResponse()
      if (rest === '/pause') return json(200, { ...bills[id], active: false, status: 'PAUSED' })
      if (rest === '/resume') return resumeResponse(id)
      if (rest === '/receivable-bills') return receivableResponse()
      if (rest === '/mark-received') return markResponse()
      if (rest === '/runs/export.csv')
        return new Response('Period start,Period end\n2026-08-01,2026-08-31\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="recurring-bill-history-2026-10-01.csv"',
          },
        })
    }
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, { items: [], page: 0, pageSize: 20, count: 0, total: 0 })
    if (url.startsWith('/api/v1/suppliers/s-1/bills'))
      return json(200, { items: [], page: 0, pageSize: 3, count: 0 })
    if (url === '/api/v1/suppliers/s-1')
      return supplierStatus === 'UNREADABLE'
        ? json(403, { type: 'https://api.fawtir.om/problems/forbidden' })
        : json(200, {
            profile: {
              id: 's-1',
              displayName: 'Nizwa Properties',
              vatNumber: 'OM1100999001',
              receivingChannel: 'PEPPOL',
              emailRecipients: ['ap@nizwa.om'],
              telephone: null,
              registeredOnPeppol: true,
              status: supplierStatus,
            },
          })
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
        <Route path="/suppliers/:id" element={<p>supplier page</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('article') as HTMLElement

async function openDetail(id = 'rb-1', heading = 'Shop rent') {
  renderAt(`/expenditure/recurring-bills/${id}`)
  await screen.findByRole('heading', { level: 1, name: heading })
}

async function openEdit(id: string) {
  renderAt(`/expenditure/recurring-bills/${id}/edit`)
  await screen.findByRole('heading', { level: 1, name: 'Edit a recurring bill' })
}

async function saveEdit(id: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
  await waitFor(() => expect(calls('PUT', `/api/v1/recurring-bills/${id}`)).toHaveLength(1))
  return bodyOf(calls('PUT', `/api/v1/recurring-bills/${id}`)[0]) as RecurringBillRequestDto
}

/* ------------------------------------------------------------------ REC-05 */

describe('the weekday of a weekly watch (REC-05)', () => {
  const NAMES: Record<number, string> = {
    1: 'Mondays',
    2: 'Tuesdays',
    3: 'Wednesdays',
    4: 'Thursdays',
    5: 'Fridays',
    6: 'Saturdays',
    7: 'Sundays',
  }

  it('lists Sunday first and numbers each day as the server does, 1 = Monday to 7 = Sunday', () => {
    expect(WEEKDAY_OPTIONS.map((option) => option.key)).toEqual([
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ])
    expect(WEEKDAY_OPTIONS.map((option) => option.iso)).toEqual([7, 1, 2, 3, 4, 5, 6])
    for (const option of WEEKDAY_OPTIONS) expect(weekdayKey(option.iso)).toBe(option.key)
  })

  it.each([1, 2, 3, 4, 5, 6, 7])(
    'reads a stored weekday %i as its own day everywhere, and sends it back unchanged',
    (iso) => {
      const stored = { ...WEEKLY, arrivesAroundDay: iso }
      const key = `recurringBills.weekday.${NAMES[iso].toLowerCase().replace(/s$/, '')}`
      expect(i18n.t(key)).toBe(NAMES[iso])
      expect(cadenceNote(stored, 'en')).toEqual({
        key: 'recurringBills.cadence.weekly',
        values: { weekday: key },
      })
      const form = formOf(stored, '2026-10-01')
      expect(form.arrivesAroundDay).toBe(String(iso))
      expect(plainWords(form, 'en', 'Yusuf').values?.day).toBe(key)
      expect(toRecurringRequest(form, stored).arrivesAroundDay).toBe(iso)
    },
  )

  it.each([
    ['Sundays', 7],
    ['Mondays', 1],
    ['Tuesdays', 2],
    ['Wednesdays', 3],
    ['Thursdays', 4],
    ['Fridays', 5],
    ['Saturdays', 6],
  ])('picking %s on the form saves weekday %i', async (name, iso) => {
    await openEdit('rb-weekly')
    // The stored 1 is Monday, as the server watches it.
    expect(screen.getByRole('button', { name: 'Arrives on' }).textContent).toContain('Mondays')
    fireEvent.click(screen.getByRole('button', { name: 'Arrives on' }))
    fireEvent.click(await screen.findByRole('option', { name }))
    expect(screen.getByRole('button', { name: 'Arrives on' }).textContent).toContain(name)
    const body = await saveEdit('rb-weekly')
    expect(body.interval).toBe('WEEKLY')
    expect(body.arrivesAroundDay).toBe(iso)
  })

  it('shows the day the server watches on the list and on the detail', async () => {
    bills['rb-weekly'] = { ...WEEKLY, arrivesAroundDay: 7 }
    listItems = () => [bills['rb-weekly']]
    const list = renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Cold delivery' })
    expect(within(rowOf('Cold delivery')).getByText('Weekly, on Sundays')).toBeTruthy()
    list.unmount()

    await openDetail('rb-weekly', 'Cold delivery')
    expect(screen.getAllByText('Weekly, on Sundays').length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ item 24 */

describe('"Mark it as expected" (item 24)', () => {
  it('names the switch and its note as approved, and no longer promises to approve', async () => {
    renderAt('/expenditure/recurring-bills/new')
    await screen.findByRole('heading', { level: 1, name: 'Add a recurring bill' })
    expect(screen.getByRole('switch', { name: 'Mark it as expected' })).toBeTruthy()
    expect(
      screen.getByText(
        'Bills inside the range are marked as expected. They still go through approval.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Approve it automatically/)).toBeNull()
    expect(screen.queryByText(/Skips the approval step/)).toBeNull()
  })

  it('still saves the same field, and the detail reads it under the same name', async () => {
    bills['rb-1'] = { ...RENT, autoApproveWithinRange: false }
    await openEdit('rb-1')
    fireEvent.click(screen.getByRole('switch', { name: 'Mark it as expected' }))
    const body = await saveEdit('rb-1')
    expect(body.autoApproveWithinRange).toBe(true)
  })

  it('reads the mark on the detail under the approved name', async () => {
    bills['rb-1'] = { ...RENT, autoApproveWithinRange: true }
    await openDetail()
    const row = screen.getByText('Mark it as expected').closest('div') as HTMLElement
    expect(within(row).getByText('On')).toBeTruthy()
    expect(screen.queryByText('Approve automatically')).toBeNull()
  })

  it('says both in Arabic as approved', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/expenditure/recurring-bills/new')
    expect(await screen.findByRole('switch', { name: 'علّمها بأنها متوقعة' })).toBeTruthy()
    expect(
      screen.getByText(
        'تُعلَّم الفواتير التي تقع ضمن النطاق بأنها متوقعة، وتبقى بحاجة إلى الاعتماد.',
      ),
    ).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ item 25 */

describe('an honest chase (item 25)', () => {
  it('names who was told', async () => {
    await openDetail()
    fireEvent.click(screen.getAllByRole('button', { name: 'Chase the supplier' })[0])
    expect(
      await screen.findByText('Yusuf Al Balushi has been told to chase the supplier.'),
    ).toBeTruthy()
  })

  it.each(['NOBODY_NAMED', 'RECIPIENT_UNAVAILABLE', 'SENDING_OFF'])(
    'says nobody was told when the server says so (%s)',
    async (reason) => {
      chaseResponse = () =>
        json(202, {
          recurringBillId: 'rb-1',
          notifyUserId: null,
          expectedOn: '2026-09-28',
          told: false,
          toldNames: [],
          notToldReason: reason,
        })
      await openDetail()
      fireEvent.click(screen.getAllByRole('button', { name: 'Chase the supplier' })[0])
      expect(
        await screen.findByText('Nobody was told. Choose who gets told in this recurring bill.'),
      ).toBeTruthy()
      expect(screen.queryByText(/has been told/)).toBeNull()
    },
  )

  it('says the same from the list', async () => {
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Shop rent' })
    fireEvent.click(within(rowOf('Shop rent')).getByRole('button', { name: 'Chase the supplier' }))
    expect(
      await screen.findByText('Yusuf Al Balushi has been told to chase the supplier.'),
    ).toBeTruthy()

    chaseResponse = () => json(202, { recurringBillId: 'rb-1', told: false, toldNames: [] })
    fireEvent.click(within(rowOf('Shop rent')).getByRole('button', { name: 'Chase the supplier' }))
    expect(
      await screen.findByText('Nobody was told. Choose who gets told in this recurring bill.'),
    ).toBeTruthy()
  })

  it('falls back to the sentence without a name when there is no name to give', () => {
    const base = { recurringBillId: 'rb-1', notifyUserId: 'u-2', expectedOn: null }
    expect(chaseNotice({ ...base, told: true, toldNames: [] })).toEqual({
      key: 'recurringBills.done.chased',
    })
    // A server that does not say yet (the fields are absent) reads as before.
    expect(chaseNotice(base)).toEqual({ key: 'recurringBills.done.chased' })
    expect(chaseNotice({ ...base, told: true, toldNames: ['Aisha'] })).toEqual({
      key: 'recurringBills.done.chasedTold',
      values: { name: 'Aisha' },
    })
    expect(chaseNotice({ ...base, told: false, toldNames: ['Aisha'] })).toEqual({
      key: 'recurringBills.done.chasedNobody',
    })
  })

  it('says both answers in Arabic as approved', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('recurringBills.done.chasedTold', { name: 'يوسف' })).toBe(
      'تم إبلاغ يوسف لمطالبة المورد.',
    )
    expect(i18n.t('recurringBills.done.chasedNobody')).toBe(
      'لم يُبلَّغ أحد. اختر من يُبلَّغ في هذه الفاتورة المتكررة.',
    )
  })
})

/* ------------------------------------------------------------------ item 26 */

describe('"Not watched" in Activity (item 26)', () => {
  const GAP = {
    from: '2026-06-28',
    to: '2026-09-27',
    periods: 3,
    reason: 'RESUMED' as const,
    recordedAt: '2026-09-29T07:15:00Z',
  }

  it('adds one line per skipped span, with nothing under it', async () => {
    bills['rb-1'] = { ...RENT, notWatched: [GAP] }
    await openDetail()
    const line = await screen.findByText('Not watched from 28 Jun 2026 to 27 Sept 2026')
    const item = line.closest('li') as HTMLElement
    // One line: the title only, in the list's own item.
    expect(item.querySelectorAll('p')).toHaveLength(1)
    // Newest first: recorded after the late period it follows, and before the day watching began.
    const feed = [...(item.parentElement as HTMLElement).querySelectorAll('li')].map(
      (entry) => entry.querySelector('p')?.textContent,
    )
    expect(feed[0]).toBe('Not watched from 28 Jun 2026 to 27 Sept 2026')
    expect(feed[feed.length - 1]).toBe('Started watching this bill')
  })

  it('places each span by the day it was recorded, and draws none when there are none', () => {
    const day = (iso: string) => iso
    expect(
      activityOf(RENT, RUNS, day)
        .map((item) => item.key)
        .some((key) => key.endsWith('notWatched')),
    ).toBe(false)
    expect(activityOf({ ...RENT, notWatched: null }, RUNS, day)).toHaveLength(3)
    const old = { ...GAP, from: '2026-02-28', to: '2026-04-27', recordedAt: '2026-05-01T05:00:00Z' }
    const feed = activityOf({ ...RENT, notWatched: [GAP, old] }, RUNS, day)
    expect(feed.map((item) => item.id)).toEqual([
      'not-watched-2026-06-28-2026-09-27',
      'run-1',
      'run-2',
      'not-watched-2026-02-28-2026-04-27',
      'started',
    ])
    expect(feed[0]).toMatchObject({
      key: 'recurringBills.detail.activity.notWatched',
      values: { from: '2026-06-28', to: '2026-09-27' },
      detail: false,
    })
  })

  it('says it in Arabic as approved', async () => {
    await i18n.changeLanguage('ar')
    expect(
      i18n.t('recurringBills.detail.activity.notWatched', { from: '٢٨ يونيو', to: '٢٧ سبتمبر' }),
    ).toBe('لم تُراقَب من ٢٨ يونيو إلى ٢٧ سبتمبر')
  })
})

/* ------------------------------------------------------------------ item 27 */

describe('"If the amount is outside the range" off means no flag (item 27)', () => {
  it('sends the switch and keeps the percentage', async () => {
    await openEdit('rb-1')
    fireEvent.click(screen.getByRole('switch', { name: 'If the amount is outside the range' }))
    const body = await saveEdit('rb-1')
    expect(body.toleranceEnabled).toBe(false)
    expect(body.tolerancePercent).toBe(10)
  })

  it('reads the switch from the server, not from the percentage', async () => {
    bills['rb-1'] = { ...RENT, toleranceEnabled: false, tolerancePercent: 15 }
    await openEdit('rb-1')
    expect(
      screen
        .getByRole('switch', { name: 'If the amount is outside the range' })
        .getAttribute('aria-checked'),
    ).toBe('false')
    // The percentage is still there for when the switch comes back on.
    expect(
      (screen.getByRole('textbox', { name: 'Tell me if it moves more than' }) as HTMLInputElement)
        .value,
    ).toBe('15')
    fireEvent.click(screen.getByRole('switch', { name: 'If the amount is outside the range' }))
    const body = await saveEdit('rb-1')
    expect(body).toMatchObject({ toleranceEnabled: true, tolerancePercent: 15 })
  })

  it('says Off on the detail while a percentage is stored', async () => {
    bills['rb-1'] = { ...RENT, toleranceEnabled: false, tolerancePercent: 15 }
    await openDetail()
    const off = screen.getByText('If the amount is off').closest('div') as HTMLElement
    expect(within(off).getByText('Off')).toBeTruthy()
    const flag = screen.getByText('Flag if outside').closest('div') as HTMLElement
    expect(within(flag).getByText('Off')).toBeTruthy()
  })

  it('never sends a percentage the server would refuse while the switch is off', () => {
    const form = {
      ...formOf(RENT, '2026-10-01'),
      flagOutsideRange: false,
      tolerancePercent: '150',
    }
    expect(toRecurringRequest(form, RENT)).toMatchObject({
      toleranceEnabled: false,
      tolerancePercent: null,
    })
    // A watch read from a server that does not send the flag: on exactly when a percentage is stored.
    const { toleranceEnabled: _unused, ...old } = RENT
    void _unused
    expect(formOf(old, '2026-10-01').flagOutsideRange).toBe(true)
    expect(formOf({ ...old, tolerancePercent: null }, '2026-10-01').flagOutsideRange).toBe(false)
    // A RAISE instruction has no range at all.
    expect(toRecurringRequest(formOf(RAISING, '2026-10-01'), RAISING)).toMatchObject({
      toleranceEnabled: null,
      tolerancePercent: null,
    })
  })
})

/* ------------------------------------------------------------------ item 30 */

describe('a recurring bill paused with its supplier (item 30)', () => {
  it('does not offer Resume on the detail while the supplier is switched off', async () => {
    supplierStatus = 'SWITCHED_OFF'
    await openDetail('rb-held', 'Water cooler')
    await screen.findByText('OM1100999001')
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume watching' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause watching' })).toBeNull()
  })

  it('offers Resume again once the supplier is back on, and resumes', async () => {
    supplierStatus = 'ACTIVE'
    await openDetail('rb-held', 'Water cooler')
    fireEvent.click(await screen.findByRole('button', { name: 'Resume watching' }))
    await waitFor(() =>
      expect(calls('POST', '/api/v1/recurring-bills/rb-held/resume')).toHaveLength(1),
    )
    expect(await screen.findByText('Resumed.')).toBeTruthy()
  })

  it('offers Resume on a bill someone paused by hand, whatever the supplier', async () => {
    supplierStatus = 'SWITCHED_OFF'
    await openDetail('rb-paused', 'Coffee machine lease')
    expect(await screen.findByRole('button', { name: 'Resume watching' })).toBeTruthy()
  })

  it('hides Resume on the list row and in its menu while the supplier is off', async () => {
    supplierStatus = 'SWITCHED_OFF'
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Water cooler' })
    await waitFor(() => expect(calls('GET', '/api/v1/suppliers/s-1')).toHaveLength(1))
    expect(
      within(rowOf('Water cooler')).queryByRole('button', { name: 'Resume watching' }),
    ).toBeNull()
    fireEvent.click(
      within(rowOf('Water cooler')).getByRole('button', { name: 'Recurring bill actions' }),
    )
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Resume' })).toBeNull()
    // The row paused by hand keeps it, and the supplier is read for the held row alone.
    expect(
      within(rowOf('Coffee machine lease')).getByRole('button', { name: 'Resume watching' }),
    ).toBeTruthy()
  })

  it('shows Resume on the list row once the supplier is back on', async () => {
    supplierStatus = 'ACTIVE'
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Water cooler' })
    expect(
      await within(rowOf('Water cooler')).findByRole('button', { name: 'Resume watching' }),
    ).toBeTruthy()
  })

  it('knows when Resume can be taken', () => {
    expect(canResume(RENT, false)).toBe(false)
    expect(canResume(PAUSED, true)).toBe(true)
    expect(canResume(HELD, true)).toBe(false)
    expect(canResume(HELD, null)).toBe(false)
    expect(canResume(HELD, false)).toBe(true)
    expect(canResume(ENDED, false)).toBe(false)
  })

  it('lets the server answer when it refuses a resume, in the sentence for it', async () => {
    supplierStatus = 'UNREADABLE'
    resumeResponse = () => refusal('RECURRING_BILL_SUPPLIER_SWITCHED_OFF')
    await openDetail('rb-held', 'Water cooler')
    fireEvent.click(await screen.findByRole('button', { name: 'Resume watching' }))
    expect(
      await screen.findByText(
        'The supplier is switched off. Switch it back on, then resume this recurring bill.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/The server refused this/)).toBeNull()
    expect(screen.queryByText(/RECURRING_BILL_SUPPLIER_SWITCHED_OFF/)).toBeNull()
    expect(screen.queryByText(/English only/)).toBeNull()
  })
})

/* ------------------------------------------------------------------ item 31 */

describe('who gets told, from the names-only list (item 31)', () => {
  it('offers the names the recurring bills route gives, and never asks for the users list', async () => {
    await openEdit('rb-1')
    const who = await screen.findByRole('button', { name: 'Who gets told' })
    expect(who.textContent).toContain('Yusuf Al Balushi')
    fireEvent.click(who)
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent)
    // Nobody, the named person, and a member with no name on file: never an e-mail or a role.
    expect(options).toEqual(['Nobody named', 'Yusuf Al Balushi', 'Someone on the team'])
    fireEvent.click(screen.getByRole('option', { name: 'Someone on the team' }))
    const body = await saveEdit('rb-1')
    expect(body.notifyUserId).toBe('u-3')
    expect(calls('GET', '/api/v1/recurring-bills/recipients')).toHaveLength(1)
    expect(calls('GET', '/api/v1/users')).toHaveLength(0)
  })

  it('shows who is named as text when the list cannot be read', async () => {
    recipientsResponse = () => json(403, { type: 'https://api.fawtir.om/problems/forbidden' })
    await openEdit('rb-1')
    await waitFor(() => expect(calls('GET', '/api/v1/recurring-bills/recipients')).toHaveLength(1))
    expect(await screen.findAllByText('Someone on the team')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Who gets told' })).toBeNull()
  })

  it('names the person on the detail from the bill itself', async () => {
    await openDetail()
    const row = screen.getByText('Who gets told').closest('div') as HTMLElement
    expect(within(row).getByText('Yusuf Al Balushi')).toBeTruthy()
    expect(calls('GET', '/api/v1/users')).toHaveLength(0)
    expect(calls('GET', '/api/v1/recurring-bills/recipients')).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ item 32 */

describe('a finished instruction (item 32)', () => {
  it('shows the Ended pill and the line on the detail, with no Resume and no Chase', async () => {
    await openDetail('rb-ended', 'Old lease')
    expect(screen.getByText('Ended')).toBeTruthy()
    expect(
      screen.getByText('This instruction ended on 30 Jun 2026. Set up a new one to keep watching.'),
    ).toBeTruthy()
    expect(screen.queryByText('Paused')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume watching' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause watching' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Chase the supplier' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
  })

  it('shows the Ended pill on the list, with no Resume on the row or in its menu', async () => {
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Old lease' })
    const row = rowOf('Old lease')
    expect(within(row).getAllByText('Ended').length).toBeGreaterThan(0)
    expect(within(row).queryByText('Paused')).toBeNull()
    expect(within(row).queryByText('Resume to watch again')).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Resume watching' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Recurring bill actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Open it' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Resume' })).toBeNull()
    // A paused one still reads Paused and still offers it.
    expect(within(rowOf('Coffee machine lease')).getAllByText('Paused').length).toBeGreaterThan(0)
  })

  it('tells ended from paused', () => {
    expect(isEnded(ENDED)).toBe(true)
    expect(isEnded(PAUSED)).toBe(false)
    expect(isEnded({ status: undefined, ended: undefined })).toBe(false)
    expect(stateNote(ENDED)).toEqual({ key: 'recurringBills.state.ended' })
    expect(stateNote(PAUSED)).toEqual({ key: 'recurringBills.state.paused' })
  })

  it('says both in Arabic as approved', async () => {
    await i18n.changeLanguage('ar')
    await openDetail('rb-ended', 'Old lease')
    expect(screen.getByText('منتهية')).toBeTruthy()
    expect(
      screen.getByText(/^انتهت هذه التعليمة في .+\. أنشئ تعليمة جديدة لمواصلة المراقبة\.$/),
    ).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ item 23 */

describe('"Mark as received" (item 23)', () => {
  it("asks which of the supplier's bills it was, and says so to the server", async () => {
    await openDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as received' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mark as received' })
    expect(within(dialog).getByText('Expected 28 Sept 2026')).toBeTruthy()
    const first = await within(dialog).findByRole('button', { name: /NP-0931/ })
    expect(first.textContent).toContain('30 Sept 2026')
    expect(first.textContent).toContain('same as usual')
    expect(first.textContent).toContain('850.000')
    // A bill with no number still has a row.
    const second = within(dialog).getByRole('button', { name: /No bill number/ })
    expect(second.textContent).toContain('+6% on usual')
    expect(String(calls('GET', '/api/v1/recurring-bills/rb-1/receivable-bills')[0][0])).toBe(
      '/api/v1/recurring-bills/rb-1/receivable-bills?expectedOn=2026-09-28',
    )

    const readsBefore = calls('GET', '/api/v1/recurring-bills/rb-1/runs').length
    fireEvent.click(first)
    await waitFor(() =>
      expect(calls('POST', '/api/v1/recurring-bills/rb-1/mark-received')).toHaveLength(1),
    )
    expect(bodyOf(calls('POST', '/api/v1/recurring-bills/rb-1/mark-received')[0])).toEqual({
      billId: 'bill-21',
      expectedOn: '2026-09-28',
    })
    // The dialog closes and the page reads the watch and its periods again.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(calls('GET', '/api/v1/recurring-bills/rb-1/runs').length).toBeGreaterThan(readsBefore),
    )
  })

  it('says when there is nothing to pick', async () => {
    receivableResponse = () => json(200, [])
    await openDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as received' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mark as received' })
    expect(await within(dialog).findByText('Nothing here.')).toBeTruthy()
    expect(calls('POST', '/api/v1/recurring-bills/rb-1/mark-received')).toHaveLength(0)
  })

  it.each(['RECURRING_BILL_CODE_WITH_NO_SENTENCE'])(
    'reads a refusal it has no sentence for (%s) in the general refusal words, never as its code',
    async (code) => {
      markResponse = () => refusal(code)
      await openDetail()
      fireEvent.click(screen.getByRole('button', { name: 'Mark as received' }))
      const dialog = await screen.findByRole('dialog', { name: 'Mark as received' })
      fireEvent.click(await within(dialog).findByRole('button', { name: /NP-0931/ }))
      expect(await screen.findByText(/The server refused this/)).toBeTruthy()
      expect(screen.queryByText(new RegExp(code))).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    },
  )

  // Draft wording, pending the owner (Wording-For-Abdul.md section 4, rows 3 to 7). A correction
  // there changes the sentences below with it. The period and the bill that are gone answer 404.
  it.each([
    [
      'RECURRING_BILL_PERIOD_NOT_FOUND',
      404,
      'That period is no longer being watched. Reload to see the current one.',
    ],
    [
      'RECURRING_BILL_PERIOD_ALREADY_RECEIVED',
      400,
      'A bill is already marked as received for this period.',
    ],
    [
      'RECURRING_BILL_ARRIVAL_BILL_NOT_FOUND',
      404,
      'That bill is not on this account. Reload and choose another.',
    ],
    [
      'RECURRING_BILL_ARRIVAL_ALREADY_MATCHED',
      400,
      'That bill is already matched to a recurring bill. Choose another.',
    ],
    [
      'RECURRING_BILL_ARRIVAL_NOT_ELIGIBLE',
      400,
      "That bill cannot be used here. Choose one of this supplier's own bills in the same currency.",
    ],
  ])('says why it was refused (%s), in its own sentence', async (code, status, sentence) => {
    markResponse = () =>
      json(status, {
        type: `https://api.fawtir.om/problems/${status === 404 ? 'resource-not-found' : 'expenditure-refused'}`,
        error: code,
        detail: 'English only',
      })
    await openDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as received' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mark as received' })
    fireEvent.click(await within(dialog).findByRole('button', { name: /NP-0931/ }))
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(/The server refused this|Not found/)).toBeNull()
    expect(screen.queryByText(new RegExp(code))).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says a period already has its bill in Arabic', async () => {
    await i18n.changeLanguage('ar')
    markResponse = () => refusal('RECURRING_BILL_PERIOD_ALREADY_RECEIVED')
    await openDetail()
    const title = i18n.t('recurringBills.detail.markReceived')
    fireEvent.click(screen.getByRole('button', { name: title }))
    const dialog = await screen.findByRole('dialog', { name: title })
    fireEvent.click(await within(dialog).findByRole('button', { name: /NP-0931/ }))
    expect(await screen.findByText('سُجّل استلام فاتورة لهذه الفترة من قبل.')).toBeTruthy()
  })
})

describe('"Export" (item 23)', () => {
  it('downloads the history as the CSV the server names', async () => {
    const createObjectURL = vi.fn(() => 'blob:history')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download)
    })
    await openDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() =>
      expect(calls('GET', '/api/v1/recurring-bills/rb-1/runs/export.csv')).toHaveLength(1),
    )
    await waitFor(() => expect(names).toEqual(['recurring-bill-history-2026-10-01.csv']))
    expect(screen.queryByText(/Not available yet/)).toBeNull()
  })

  it('is hidden from someone who may not export, who keeps everything else', async () => {
    who = { ...MANAGER, permissions: ['invoice.read', 'invoice.payment.manage', 'supplier.read'] }
    await openDetail()
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark as received' })).toBeTruthy()
  })
})

/* ------------------------------------------------------------- permissions */

describe('what a viewer is offered', () => {
  beforeEach(() => {
    who = VIEWER
  })

  it('reads the detail with no action on it', async () => {
    await openDetail()
    expect(screen.getByText("The September bill hasn't arrived")).toBeTruthy()
    for (const name of [
      'Pause watching',
      'Resume watching',
      'Chase the supplier',
      'Mark as received',
      'Export',
    ])
      expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(calls('GET', '/api/v1/recurring-bills/recipients')).toHaveLength(0)
  })

  it('reads the list with no action on a row', async () => {
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Shop rent' })
    await waitFor(() => expect(screen.queryByText('Add a recurring bill')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Chase the supplier' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume watching' })).toBeNull()
    fireEvent.click(
      within(rowOf('Coffee machine lease')).getByRole('button', {
        name: 'Recurring bill actions',
      }),
    )
    expect(await screen.findByRole('menuitem', { name: 'Open it' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Resume' })).toBeNull()
    // The supplier is not read on a viewer's behalf: there is no Resume to decide about.
    expect(calls('GET', '/api/v1/suppliers/s-1')).toHaveLength(0)
  })

  it.each(['/expenditure/recurring-bills/new', '/expenditure/recurring-bills/rb-1/edit'])(
    'is told there is no access at %s, and nothing is read',
    async (path) => {
      renderAt(path)
      expect(
        await screen.findByText(/Your account doesn't have access to this part of Fawtir/),
      ).toBeTruthy()
      expect(
        screen.queryByRole('button', { name: /Add recurring bill|Save the changes/ }),
      ).toBeNull()
      expect(calls('GET', '/api/v1/recurring-bills/rb-1')).toHaveLength(0)
      expect(calls('GET', '/api/v1/recurring-bills/recipients')).toHaveLength(0)
    },
  )
})

/* ------------------------------------------------- the periods' read fields */

describe("each period's bill, as the server sends it", () => {
  it('links the bill by its number and shows its own amount and the day it was paid', async () => {
    await openDetail()
    const link = await screen.findByRole('link', { name: 'NP-0812' })
    expect(link.getAttribute('href')).toBe('/expenditure/bills/bill-9')
    const row = link.closest('tr') as HTMLElement
    // 860.030 is the bill's own total: 850 moved by 1.18% would be 860.030 too, so the next
    // assertion uses a figure the variance cannot produce.
    expect(within(row).getByText('Paid 4 Sept 2026')).toBeTruthy()
    expect(amountOf({ ...RUNS[1], billAmount: 777.123 }, 850)).toBe(777.123)
    expect(amountOf({ ...RUNS[1], billAmount: null }, 850)).toBe(860.03)
    expect(amountOf(RUNS[0], 850)).toBeNull()
  })

  it('keeps the old link and the due day for a period the server sends no bill details for', async () => {
    const bare = RUNS.map((run) => {
      const copy: RecurringRunDto = { ...run }
      delete copy.billNumber
      delete copy.paidOn
      delete copy.billAmount
      return copy
    })
    runsOf = () => bare
    await openDetail()
    expect(await screen.findByRole('link', { name: 'Open the bill' })).toBeTruthy()
    expect(screen.queryByText(/^Paid \d/)).toBeNull()
    expect(screen.getAllByText(/^Due /).length).toBeGreaterThan(0)
  })

  it('adds up "paid this year" from the days bills were paid, where the server says them', () => {
    const paid = trackRecord(RUNS, RENT, '2026-10-01')
    expect(paid.paidThisYear).toBe(860.03)
    const unpaid = trackRecord(
      RUNS.map((run) => ({ ...run, paidOn: null })),
      RENT,
      '2026-10-01',
    )
    expect(unpaid.paidThisYear).toBe(0)
    const lastYear = trackRecord(
      RUNS.map((run) => ({ ...run, paidOn: run.paidOn ? '2025-12-30' : null })),
      RENT,
      '2026-10-01',
    )
    expect(lastYear.paidThisYear).toBe(0)
  })
})

/* ------------------------------------------------------- the composer, edit */

describe('editing a recurring bill', () => {
  it('sends only fields the API declares, and what was stored for those the form does not show', async () => {
    await openEdit('rb-1')
    fireEvent.change(screen.getByLabelText(/^What to call it/), { target: { value: 'Rent' } })
    const body = await saveEdit('rb-1')
    for (const field of Object.keys(body)) expect(REQUEST_FIELDS).toContain(field)
    expect(body).toMatchObject({
      mode: 'EXPECT',
      description: 'Rent',
      supplierId: 's-1',
      supplierName: 'Nizwa Properties',
      currencyCode: 'OMR',
      totalIncludingVat: 850,
      vatAmount: 0,
      taxCategoryCode: 'Z0',
      interval: 'MONTHLY',
      arrivesAroundDay: 28,
      paymentDueDay: 5,
      paymentTermsDays: null,
      watchingFrom: '2026-01-01',
      startDate: null,
      lateAfterDays: 2,
      notifyUserId: 'u-2',
      toleranceEnabled: true,
      tolerancePercent: 10,
      occurrences: null,
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Shop rent' })).toBeTruthy()
  })

  it('keeps the currency, the count left and the terms of an instruction Fawtir raises (REC-14)', async () => {
    await openEdit('rb-raise')
    // A raising instruction asks for its first date, not an arrival day.
    expect(screen.getByText('When it is raised')).toBeTruthy()
    expect(screen.queryByText('When to tell you')).toBeNull()
    fireEvent.change(screen.getByLabelText(/^What to call it/), { target: { value: 'Windows' } })
    const body = await saveEdit('rb-raise')
    for (const field of Object.keys(body)) expect(REQUEST_FIELDS).toContain(field)
    expect(body).toMatchObject({
      mode: 'RAISE',
      description: 'Windows',
      currencyCode: 'USD',
      occurrences: 6,
      paymentTermsDays: null,
      arrivesAroundDay: null,
      watchingFrom: null,
      toleranceEnabled: null,
    })
  })

  it('a new one is still in rial, with no count, and its terms as the due day says', () => {
    const form = {
      ...blankRecurringForm('2026-10-01'),
      supplierName: 'X',
      description: 'Y',
      category: 'Utilities',
      totalIncludingVat: '100',
    }
    expect(toRecurringRequest(form)).toMatchObject({
      currencyCode: 'OMR',
      occurrences: null,
      paymentTermsDays: 0,
      toleranceEnabled: true,
      tolerancePercent: 10,
    })
    expect(toRecurringRequest({ ...form, paymentDueDay: '5' }).paymentTermsDays).toBeNull()
    for (const field of Object.keys(toRecurringRequest(form)))
      expect(REQUEST_FIELDS).toContain(field)
  })

  it('reads a refusal it has no sentence for in the general refusal words', async () => {
    await openEdit('rb-1')
    fetchMock.mockImplementationOnce(async () => refusal('RECURRING_BILL_SUPPLIER_REQUIRED'))
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    expect(await screen.findByText(/The server refused this/)).toBeTruthy()
    expect(screen.queryByText(/RECURRING_BILL_SUPPLIER_REQUIRED/)).toBeNull()
  })

  // Draft wording, pending the owner (Wording-For-Abdul.md section 4, rows 1 and 8).
  it.each([
    [
      'RECURRING_BILL_END_BEFORE_NEXT_RUN',
      'The end date is before the next expected bill. Choose a later end date.',
    ],
    ['RECURRING_BILL_ENDED', 'This recurring bill has ended. Set up a new one to keep watching.'],
  ])('reads a refused save (%s) as its own sentence', async (code, sentence) => {
    await openEdit('rb-1')
    fetchMock.mockImplementationOnce(async () => refusal(code))
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(/The server refused this/)).toBeNull()
  })

  it('reads an arrival day the server refuses as its own sentence', async () => {
    await openEdit('rb-1')
    fetchMock.mockImplementationOnce(async () => refusal('RECURRING_BILL_ARRIVAL_DAY_INVALID'))
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes' }))
    expect(
      await screen.findByText('Use a day this cadence has: 1–7 for weekly, 1–31 otherwise.'),
    ).toBeTruthy()
  })
})

/* ------------------------------------------------------- the detail, the list */

describe('the detail and the list, where the audit found no test', () => {
  it('pauses from the detail and reads the watch again', async () => {
    await openDetail()
    const before = calls('GET', '/api/v1/recurring-bills/rb-1').length
    fireEvent.click(screen.getByRole('button', { name: 'Pause watching' }))
    await waitFor(() => expect(calls('POST', '/api/v1/recurring-bills/rb-1/pause')).toHaveLength(1))
    expect(
      await screen.findByText(/Nothing will be watched or raised until you resume it/),
    ).toBeTruthy()
    await waitFor(() =>
      expect(calls('GET', '/api/v1/recurring-bills/rb-1').length).toBeGreaterThan(before),
    )
  })

  it('resumes a paused one from the list row', async () => {
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Coffee machine lease' })
    fireEvent.click(
      within(rowOf('Coffee machine lease')).getByRole('button', { name: 'Resume watching' }),
    )
    await waitFor(() =>
      expect(calls('POST', '/api/v1/recurring-bills/rb-paused/resume')).toHaveLength(1),
    )
    expect(await screen.findByText('Resumed.')).toBeTruthy()
  })

  it('shows an instruction Fawtir raises, with nothing to chase', async () => {
    await openDetail('rb-raise', 'Window cleaning')
    expect(screen.getByText('Next raised')).toBeTruthy()
    expect(
      screen.getByText('Fawtir writes this bill itself on the day, for the usual amount.'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Chase the supplier' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Mark as received' })).toBeNull()
  })

  it('says a supplier whose record cannot be read is not on file, and still shows the watch', async () => {
    supplierStatus = 'UNREADABLE'
    await openDetail()
    await waitFor(() => expect(calls('GET', '/api/v1/suppliers/s-1')).toHaveLength(1))
    expect((await screen.findAllByText('Not on file')).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open the supplier' })).toBeTruthy()
  })

  it('says a watch that is not there is not found', async () => {
    renderAt('/expenditure/recurring-bills/rb-missing')
    expect(await screen.findByText('Not found')).toBeTruthy()
  })

  it('pages forward only while a page comes back full', async () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      ...RENT,
      id: `rb-p${index}`,
      description: `Watch ${index}`,
    }))
    listItems = () => full
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Watch 0' })
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    listItems = () => [RENT]
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(
        calls('GET', '/api/v1/recurring-bills?').some((call) => String(call[0]).includes('page=1')),
      ).toBe(true),
    )
    await screen.findByRole('link', { name: 'Shop rent' })
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
})

// Draft wording, pending the owner (Wording-For-Abdul.md section 4, rows 1 and 2). Resume is not
// drawn where the page knows it would be refused, so these show when the page is out of date.
describe('a resume the server refuses, on the list', () => {
  it.each([
    ['RECURRING_BILL_ENDED', 'This recurring bill has ended. Set up a new one to keep watching.'],
    [
      'RECURRING_BILL_SUPPLIER_SWITCHED_OFF',
      'The supplier is switched off. Switch it back on, then resume this recurring bill.',
    ],
  ])('says why (%s), in its own sentence', async (code, sentence) => {
    resumeResponse = () => refusal(code)
    renderAt('/expenditure/recurring-bills')
    await screen.findByRole('link', { name: 'Water cooler' })
    fireEvent.click(
      await within(rowOf('Water cooler')).findByRole('button', { name: 'Resume watching' }),
    )
    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.queryByText(/The server refused this/)).toBeNull()
  })
})
