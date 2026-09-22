import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ReminderLogDto, ReminderPreviewDto, ReminderScheduleDto } from '../../api/invoices/reminders'
import {
  hasMorePages,
  normaliseOffsets,
  rangeProblem,
  rungNote,
  rungProblem,
  rungToday,
  scheduleChanged,
  scheduleProblem,
} from '../../lib/paymentReminders'
import { RemindersPage } from './RemindersPage'
import { PaymentRemindersPage } from '../PaymentRemindersPage/PaymentRemindersPage'
import { InvoiceRemindersCard } from '../../components/invoice/InvoiceRemindersCard'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'admin.settings.manage', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}

const READER: Entitlements = { ...ADMIN, permissions: ['invoice.read'] }

const SCHEDULE: ReminderScheduleDto = { offsets: [-3, 0, 7], enabled: true }

const row = (over: Partial<ReminderLogDto>): ReminderLogDto => ({
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-2026-000001',
  daysFromDue: -3,
  firedOn: '2026-09-10',
  recipient: 'billing@example.com',
  locale: 'EN',
  outcome: 'SENT',
  failureReason: null,
  createdAt: '2026-09-10T04:00:00Z',
  ...over,
})

const LOG: ReminderLogDto[] = [
  row({}),
  row({ invoiceId: 'inv-2', invoiceNumber: 'INV-2026-000002', daysFromDue: 7, outcome: 'FAILED', failureReason: 'MailAuthenticationException' }),
  row({ invoiceId: 'inv-3', invoiceNumber: 'INV-2026-000003', daysFromDue: 0, outcome: 'SKIPPED' }),
]

// Far enough from the due date that no rung of any sane ladder falls today — the ordinary case,
// and the one where the message was previously unreachable.
const DUE_DATE = '2026-10-16'

const PREVIEW: ReminderPreviewDto = {
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-2026-000001',
  verdict: 'SEND',
  rung: 7,
  recipient: 'billing@example.com',
  language: 'EN',
  subject: 'Invoice INV-2026-000001 is overdue',
  body: 'Dear customer,\n\nOMR 120.000 was due on 10 September 2026.',
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let schedule: ReminderScheduleDto
let log: ReminderLogDto[]
let preview: ReminderPreviewDto
let sendResponse: () => Response

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  schedule = { ...SCHEDULE }
  log = LOG
  preview = PREVIEW
  sendResponse = () => json(201, { ...PREVIEW, verdict: 'SEND' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/payment-reminders/schedule')) {
      if (method === 'PUT') {
        const sent = JSON.parse(String(init?.body)) as ReminderScheduleDto
        // The server deduplicates and sorts, so the double is not a mirror.
        schedule = { offsets: [...new Set(sent.offsets)].sort((a, b) => a - b), enabled: sent.enabled }
      }
      return json(200, schedule)
    }
    if (url.includes('/reminders/preview')) return json(200, preview)
    if (url.endsWith('/reminders/send')) return sendResponse()
    if (url.includes('/authored-invoices/') && url.endsWith('/reminders')) return json(200, [row({})])
    if (url.startsWith('/api/v1/payment-reminders/log')) {
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 0)
      const outcome = new URL(url, 'http://x').searchParams.get('outcome')
      if (page > 0) return json(200, [])
      return json(200, outcome ? log.filter((entry) => entry.outcome === outcome) : log)
    }
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
        <Route path="/income/reminders" element={<RemindersPage />} />
        <Route path="/income/reminders/settings" element={<PaymentRemindersPage />} />
        <Route path="/invoices/:id" element={<p>invoice page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Payment reminders, wired to the API', () => {
  it('shows what actually fired, and says it is a history rather than a queue', async () => {
    renderAt('/income/reminders')

    expect(await screen.findByRole('heading', { level: 1, name: 'Reminders sent' })).toBeTruthy()
    expect(screen.getByText(/Fawtir keeps no queue of reminders still to come/)).toBeTruthy()

    expect((await screen.findByRole('link', { name: 'INV-2026-000001' })).getAttribute('href')).toBe('/invoices/inv-1')
    expect(screen.getByText('3 days before due')).toBeTruthy()
    expect(screen.getByText('Could not be sent: MailAuthenticationException')).toBeTruthy()
    // A skipped row must not invent a reason the server never stored.
    expect(screen.getByText(/Fawtir records that the rung was used, not why/)).toBeTruthy()
  })

  it('narrows by outcome and by date, and refuses a backwards range before asking the server', async () => {
    renderAt('/income/reminders')
    await screen.findByRole('link', { name: 'INV-2026-000001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Failed' }))
    await waitFor(() => expect(calls('GET', '/api/v1/payment-reminders/log').some((call) => String(call[0]).includes('outcome=FAILED'))).toBe(true))
    expect(await screen.findByRole('link', { name: 'INV-2026-000002' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-30' } })
    await waitFor(() => expect(calls('GET', '/api/v1/payment-reminders/log').some((call) => String(call[0]).includes('from=2026-09-30'))).toBe(true))
    const before = calls('GET', '/api/v1/payment-reminders/log').length

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } })

    expect(await screen.findByRole('alert')).toBeTruthy()
    // A range the server would refuse is never sent.
    expect(calls('GET', '/api/v1/payment-reminders/log')).toHaveLength(before)
  })

  it('offers no paging when the page is not full, since a short page is the last one', async () => {
    renderAt('/income/reminders')
    await screen.findByRole('link', { name: 'INV-2026-000001' })

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('pages forward without pretending to know a total', async () => {
    log = Array.from({ length: 20 }, (_, index) => row({ invoiceId: `inv-${index}`, invoiceNumber: `INV-2026-0000${index}` }))
    renderAt('/income/reminders')

    await screen.findByRole('link', { name: 'INV-2026-00000' })
    expect(screen.getByText(/the API sends no total, so there is no page count/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Nothing on this page. Go back a page.')).toBeTruthy()
  })

  it('edits the ladder in days from the due date, and reads back what the server stored', async () => {
    renderAt('/income/reminders/settings')
    await screen.findByRole('heading', { level: 1, name: 'When reminders go out' })

    expect(await screen.findByText('3 days before due')).toBeTruthy()
    expect(screen.getByText('On the due date')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Rung 1, days from the due date'), { target: { value: '400' } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('Rung 1, days from the due date'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(calls('PUT', '/api/v1/payment-reminders/schedule')).toHaveLength(1))
    // 21 was typed first but the server stores it last, and the page says so instead of
    // silently rearranging the rows.
    expect(await screen.findByText('Saved. Fawtir sorted the rungs and dropped any repeats.')).toBeTruthy()
  })

  it('refuses an enabled ladder with no rungs, in the server’s own words', async () => {
    schedule = { offsets: [7], enabled: true }
    renderAt('/income/reminders/settings')
    await screen.findByText('7 days after due')

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Add a rung, or switch automatic reminders off.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    expect(calls('PUT', '/api/v1/payment-reminders/schedule')).toHaveLength(0)
  })

  it('offers the settings only to someone who may manage them', async () => {
    who = READER
    renderAt('/income/reminders/settings')

    expect(await screen.findByText('No access')).toBeTruthy()
    expect(calls('GET', '/api/v1/payment-reminders/schedule')).toHaveLength(0)
  })
})

describe('Reminders on one invoice', () => {
  const renderCard = () =>
    render(
      <MemoryRouter initialEntries={['/invoices/inv-1']}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceRemindersCard invoiceId="inv-1" dueDate={DUE_DATE} />} />
        </Routes>
      </MemoryRouter>,
    )

  it('shows the real message that would go out, not a template', async () => {
    renderCard()

    expect(await screen.findByText('This would go out now.')).toBeTruthy()
    expect(screen.queryByText('Invoice INV-2026-000001 is overdue')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show the message that would be sent' }))
    expect(await screen.findByText('Invoice INV-2026-000001 is overdue')).toBeTruthy()
    expect(screen.getByText(/OMR 120.000 was due on 10 September 2026/)).toBeTruthy()
  })

  it('reads the message on a day when no rung falls, and still offers a manual send', async () => {
    // Derived, not written down: the card previews at today's distance from the due date, so a
    // hard-coded offset is only correct on the day it was written. Computed from the same helper
    // the card uses, against the same Muscat "today", so the expectation moves with the calendar.
    const offset = rungToday(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date()),
      DUE_DATE,
    )
    preview = { ...PREVIEW, verdict: 'NO_RUNG_TODAY', rung: offset }
    renderCard()

    // Previewing at today's distance from the due date is what makes the message readable at all.
    await waitFor(() => expect(calls('GET', '/api/v1/authored-invoices/inv-1/reminders/preview').some((call) =>
      String(call[0]).includes(`days_from_due=${offset}`))).toBe(true))

    expect(await screen.findByText(/No rung falls today\./)).toBeTruthy()
    expect(screen.getByText(/You can still send one yourself\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send one now' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show the message that would be sent' }))
    expect(await screen.findByText('Invoice INV-2026-000001 is overdue')).toBeTruthy()
  })

  it('names the verdict when nothing would go out, and offers no send', async () => {
    preview = { ...PREVIEW, verdict: 'SETTLED', rung: null, subject: null, body: null }
    renderCard()

    expect(await screen.findByText('The invoice is settled, so there is nothing to chase.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send one now' })).toBeNull()
  })

  it('says plainly when the deployment cannot send mail', async () => {
    sendResponse = () =>
      json(503, { type: 'https://api.fawtir.om/problems/reminder-delivery-unavailable', code: 'REMINDER_DELIVERY_UNAVAILABLE', title: 'No mail sender', status: 503 })
    renderCard()
    await screen.findByText('This would go out now.')

    fireEvent.click(screen.getByRole('button', { name: 'Send one now' }))

    expect(await screen.findByText(/E-mail sending is not switched on for this installation/)).toBeTruthy()
  })
})

describe('what the page works out for itself', () => {
  it('reads a rung in words, by its sign', () => {
    expect(rungNote(0).key).toBe('paymentReminders.rung.onDueDate')
    expect(rungNote(-3)).toEqual({ key: 'paymentReminders.rung.before', values: { count: 3 } })
    expect(rungNote(14)).toEqual({ key: 'paymentReminders.rung.after', values: { count: 14 } })
  })

  it('catches what the schedule route would answer 500 for', () => {
    expect(rungProblem('400', [])).toBe('outOfRange')
    expect(rungProblem('-366', [])).toBe('outOfRange')
    expect(rungProblem('3.5', [])).toBe('notWhole')
    expect(rungProblem('', [])).toBe('notWhole')
    expect(rungProblem('7', [7])).toBe('duplicate')
    expect(rungProblem('-365', [0])).toBeNull()
    expect(scheduleProblem([], true)).toBe('emptyWhileOn')
    expect(scheduleProblem([], false)).toBeNull()
    expect(scheduleProblem(Array.from({ length: 11 }, (_, i) => i), true)).toBe('tooMany')
  })

  it('sorts and deduplicates the way the server does, so “changed” means changed', () => {
    expect(normaliseOffsets([7, -3, 7, 0])).toEqual([-3, 0, 7])
    expect(scheduleChanged({ offsets: [-3, 0, 7], enabled: true }, [7, 0, -3], true)).toBe(false)
    expect(scheduleChanged({ offsets: [-3, 0, 7], enabled: true }, [-3, 0, 7], false)).toBe(true)
    expect(scheduleChanged({ offsets: [-3, 0, 7], enabled: true }, [-3, 0], true)).toBe(true)
  })

  it('infers “there is more” from a full page, because no total is sent', () => {
    expect(hasMorePages(Array.from({ length: 20 }, () => row({})), 20)).toBe(true)
    expect(hasMorePages(Array.from({ length: 19 }, () => row({})), 20)).toBe(false)
    expect(rangeProblem('2026-09-30', '2026-09-01')).toBe(true)
    expect(rangeProblem('', '2026-09-01')).toBe(false)
  })
})
