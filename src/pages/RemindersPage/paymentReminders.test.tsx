import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  ReminderLogDto,
  ReminderPreviewDto,
  ReminderScheduleDto,
} from '../../api/invoices/reminders'
import {
  buildQueue,
  hasMorePages,
  normaliseOffsets,
  paidAfterReminder,
  rangeProblem,
  rungNote,
  rungProblem,
  rungToday,
  scheduleChanged,
  scheduleProblem,
  stepOf,
  type QueueInvoice,
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

const MUSCAT_TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(
  new Date(),
)
const plusDays = (days: number) => {
  const date = new Date(`${MUSCAT_TODAY}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

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
  row({
    invoiceId: 'inv-2',
    invoiceNumber: 'INV-2026-000002',
    daysFromDue: 7,
    outcome: 'FAILED',
    failureReason: 'MailAuthenticationException',
  }),
  row({ invoiceId: 'inv-3', invoiceNumber: 'INV-2026-000003', daysFromDue: 0, outcome: 'SKIPPED' }),
]

// Far enough from the due date that no rung of any sane ladder falls today — the ordinary case,
// and the one where the message was previously unreachable. Three weeks out, whatever today is.
const DUE_DATE = plusDays(21)
/** Today's distance from that due date, which is the rung the card previews at. */

const invoiceRow = (over: Record<string, unknown>) => ({
  id: 'inv-1',
  type: 'INVOICE',
  version: 2,
  authoringState: 'ISSUED',
  deliveryState: 'SENT_MANUALLY',
  customerId: 'cus-1',
  currency: 'OMR',
  invoiceNumber: 'INV-2026-000001',
  issueDate: plusDays(-9),
  dueDate: DUE_DATE,
  details: null,
  lines: [],
  totals: { totalAmount: 120 },
  customerName: 'Nizwa Souq Cafe',
  payment: {
    state: 'UNPAID',
    overdue: false,
    daysOverdue: null,
    paidAmount: 0,
    creditedAmount: 0,
    outstandingAmount: 120,
  },
  ...over,
})

/** One invoice due in three weeks (the queue), one whose ladder is spent, one paid. */
const INVOICES = {
  content: [
    invoiceRow({}),
    invoiceRow({
      id: 'inv-2',
      invoiceNumber: 'INV-2026-000002',
      customerId: 'cus-2',
      customerName: 'Salalah Beach Resort',
      dueDate: plusDays(-14),
      payment: {
        state: 'UNPAID',
        overdue: true,
        daysOverdue: 14,
        paidAmount: 0,
        creditedAmount: 0,
        outstandingAmount: 1204.5,
      },
    }),
    invoiceRow({
      id: 'inv-3',
      invoiceNumber: 'INV-2026-000003',
      customerId: 'cus-1',
      dueDate: plusDays(-30),
      payment: {
        state: 'PAID',
        overdue: false,
        daysOverdue: null,
        paidAmount: 50,
        creditedAmount: 0,
        outstandingAmount: 0,
      },
    }),
  ],
  number: 0,
  size: 100,
  totalElements: 3,
  totalPages: 1,
}

const CUSTOMERS = {
  content: [
    {
      id: 'cus-1',
      displayName: 'Nizwa Souq Cafe',
      type: 'BUSINESS',
      status: 'ACTIVE',
      profile: { contact: { emailRecipients: ['khalid@nizwasouq.om'] } },
    },
    {
      id: 'cus-2',
      displayName: 'Salalah Beach Resort',
      type: 'BUSINESS',
      status: 'ACTIVE',
      profile: { contact: { emailRecipients: ['finance@salalahbeach.om'] } },
    },
  ],
  number: 0,
  size: 100,
  totalElements: 2,
  totalPages: 1,
}

const SUMMARY = {
  currencyCode: 'OMR',
  asOf: MUSCAT_TODAY,
  all: 3,
  drafts: 0,
  awaiting: 1,
  overdue: 1,
  paid: 1,
  outstandingTotal: 1324.5,
  outstandingInvoices: 2,
  awaitingTotal: 120,
  dueSoonInvoices: 0,
  dueSoonDays: 7,
  overdueTotal: 1204.5,
  overdueInvoices: 6,
  oldestOverdueDueDate: plusDays(-14),
  paidTotal: 50,
  paidInvoices: 1,
}

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
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )

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
        schedule = {
          offsets: [...new Set(sent.offsets)].sort((a, b) => a - b),
          enabled: sent.enabled,
        }
      }
      return json(200, schedule)
    }
    if (url.includes('/reminders/preview')) return json(200, preview)
    if (url.endsWith('/reminders/send')) return sendResponse()
    if (url.includes('/authored-invoices/') && url.endsWith('/reminders'))
      return json(200, [row({})])
    if (url === '/api/v1/authored-invoices/summary') return json(200, SUMMARY)
    if (url.startsWith('/api/v1/authored-invoices?')) return json(200, INVOICES)
    if (url.startsWith('/api/v1/customers?')) return json(200, CUSTOMERS)
    if (url.startsWith('/api/v1/payment-reminders/log')) {
      const outcome = new URL(url, 'http://x').searchParams.get('outcome')
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
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Payment reminders, wired to the API', () => {
  it('works the queue out from the ladder, the unpaid invoices and what already fired', async () => {
    renderAt('/income/reminders')

    expect(await screen.findByRole('heading', { level: 1, name: 'Payment reminders' })).toBeTruthy()
    // The invoice due in three weeks has spent its first rung (the log says so), so the next one
    // is the due date itself: the second step of a three-rung ladder.
    const link = await screen.findByRole('link', { name: 'INV-2026-000001' })
    expect(link.getAttribute('href')).toBe('/invoices/inv-1')
    const queued = link.closest('tr') as HTMLElement
    expect(within(queued).getByText('Follow-up')).toBeTruthy()
    expect(within(queued).getByText('khalid@nizwasouq.om')).toBeTruthy()
    expect(within(queued).getByRole('button', { name: 'Send now' })).toBeTruthy()
    // The overdue invoice has spent every rung, so it is not being chased.
    expect(screen.queryByRole('link', { name: 'INV-2026-000002' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^Not sending/ }))
    expect(await screen.findByRole('link', { name: 'INV-2026-000002' })).toBeTruthy()
    expect(screen.getByText('Every rung has gone out')).toBeTruthy()
  })

  it('shows what actually fired under Sent, and narrows it by outcome', async () => {
    renderAt('/income/reminders')
    await screen.findByRole('link', { name: 'INV-2026-000001' })

    fireEvent.click(screen.getByRole('tab', { name: /^Sent/ }))
    expect(await screen.findByText('Could not be sent: MailAuthenticationException')).toBeTruthy()
    expect(screen.getByText('3 days before due')).toBeTruthy()
    // A skipped row must not invent a reason the server never stored.
    expect(screen.getByText(/Fawtir records that the rung was used, not why/)).toBeTruthy()

    // The design's Filters pill narrows the history the page already holds.
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.click(await screen.findByRole('option', { name: /Failed/ }))
    expect(await screen.findByRole('link', { name: 'INV-2026-000002' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'INV-2026-000003' })).toBeNull()
  })

  it('pages the history the design way, from the page it holds', async () => {
    log = Array.from({ length: 12 }, (_, index) =>
      row({ invoiceId: `inv-${index}`, invoiceNumber: `INV-2026-0000${index}` }),
    )
    renderAt('/income/reminders')
    await screen.findByRole('heading', { level: 1, name: 'Payment reminders' })
    fireEvent.click(screen.getByRole('tab', { name: /^Sent/ }))

    expect(await screen.findByRole('link', { name: 'INV-2026-00000' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'INV-2026-00005' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('link', { name: 'INV-2026-00005' })).toBeTruthy()
  })

  it('pauses everything through the schedule switch, the one pause the API has', async () => {
    renderAt('/income/reminders')
    await screen.findByRole('link', { name: 'INV-2026-000001' })

    fireEvent.click(screen.getByRole('button', { name: 'Pause everything' }))
    await waitFor(() => expect(calls('PUT', '/api/v1/payment-reminders/schedule')).toHaveLength(1))
    expect(
      JSON.parse(String(calls('PUT', '/api/v1/payment-reminders/schedule')[0][1]?.body)),
    ).toEqual({
      offsets: [-3, 0, 7],
      enabled: false,
    })
    expect(await screen.findByRole('button', { name: 'Resume everything' })).toBeTruthy()
  })

  it('sends one now from the queue, at the rung the row is waiting on', async () => {
    renderAt('/income/reminders')
    const queued = (await screen.findByRole('link', { name: 'INV-2026-000001' })).closest(
      'tr',
    ) as HTMLElement
    fireEvent.click(within(queued).getByRole('button', { name: 'Send now' }))

    // The real message, previewed at that rung.
    expect(await screen.findByText('Invoice INV-2026-000001 is overdue')).toBeTruthy()
    await waitFor(() =>
      expect(
        calls('GET', '/api/v1/authored-invoices/inv-1/reminders/preview').some((call) =>
          String(call[0]).includes('days_from_due=0'),
        ),
      ).toBe(true),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send now' }))
    await waitFor(() =>
      expect(calls('POST', '/api/v1/authored-invoices/inv-1/reminders/send')).toHaveLength(1),
    )
    expect(
      JSON.parse(
        String(calls('POST', '/api/v1/authored-invoices/inv-1/reminders/send')[0][1]?.body),
      ),
    ).toEqual({ daysFromDue: 0 })
  })

  it('edits the ladder in days from the due date, and reads back what the server stored', async () => {
    renderAt('/income/reminders/settings')
    await screen.findByRole('heading', { level: 1, name: 'Payment reminders' })

    // Each rung is named in its step card and again under "What a customer sees".
    expect(await screen.findAllByText('3 days before due')).toHaveLength(2)
    expect(screen.getAllByText('On the due date').length).toBeGreaterThan(0)
    // The design's step names follow the ladder's positions.
    expect(screen.getAllByText('Friendly nudge').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Final notice').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Rung 1, days from the due date'), {
      target: { value: '400' },
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('Rung 1, days from the due date'), {
      target: { value: '21' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(calls('PUT', '/api/v1/payment-reminders/schedule')).toHaveLength(1))
    // 21 was typed first but the server stores it last, and the page says so instead of
    // silently rearranging the rows.
    expect(
      await screen.findByText('Saved. Fawtir sorted the rungs and dropped any repeats.'),
    ).toBeTruthy()
  })

  it('refuses an enabled ladder with no rungs, in the server’s own words', async () => {
    schedule = { offsets: [7], enabled: true }
    renderAt('/income/reminders/settings')
    await screen.findAllByText('7 days after due')

    fireEvent.click(screen.getByRole('button', { name: 'Delete step' }))

    expect(await screen.findByText('Add a rung, or switch automatic reminders off.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty('disabled', true)
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
          <Route
            path="/invoices/:id"
            element={<InvoiceRemindersCard invoiceId="inv-1" dueDate={DUE_DATE} />}
          />
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
    await waitFor(() =>
      expect(
        calls('GET', '/api/v1/authored-invoices/inv-1/reminders/preview').some((call) =>
          String(call[0]).includes(`days_from_due=${offset}`),
        ),
      ).toBe(true),
    )

    expect(await screen.findByText(/No rung falls today\./)).toBeTruthy()
    expect(screen.getByText(/You can still send one yourself\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send one now' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show the message that would be sent' }))
    expect(await screen.findByText('Invoice INV-2026-000001 is overdue')).toBeTruthy()
  })

  it('names the verdict when nothing would go out, and offers no send', async () => {
    preview = { ...PREVIEW, verdict: 'SETTLED', rung: null, subject: null, body: null }
    renderCard()

    expect(
      await screen.findByText('The invoice is settled, so there is nothing to chase.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send one now' })).toBeNull()
  })

  it('says plainly when the deployment cannot send mail', async () => {
    sendResponse = () =>
      json(503, {
        type: 'https://api.fawtir.om/problems/reminder-delivery-unavailable',
        code: 'REMINDER_DELIVERY_UNAVAILABLE',
        title: 'No mail sender',
        status: 503,
      })
    renderCard()
    await screen.findByText('This would go out now.')

    fireEvent.click(screen.getByRole('button', { name: 'Send one now' }))

    expect(
      await screen.findByText(/E-mail sending is not switched on for this installation/),
    ).toBeTruthy()
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
    expect(
      scheduleProblem(
        Array.from({ length: 11 }, (_, i) => i),
        true,
      ),
    ).toBe('tooMany')
  })

  it('sorts and deduplicates the way the server does, so “changed” means changed', () => {
    expect(normaliseOffsets([7, -3, 7, 0])).toEqual([-3, 0, 7])
    expect(scheduleChanged({ offsets: [-3, 0, 7], enabled: true }, [7, 0, -3], true)).toBe(false)
    expect(scheduleChanged({ offsets: [-3, 0, 7], enabled: true }, [-3, 0, 7], false)).toBe(true)
    expect(scheduleChanged({ offsets: [-3, 0, 7], enabled: true }, [-3, 0], true)).toBe(true)
  })

  it('infers “there is more” from a full page, because no total is sent', () => {
    expect(
      hasMorePages(
        Array.from({ length: 20 }, () => row({})),
        20,
      ),
    ).toBe(true)
    expect(
      hasMorePages(
        Array.from({ length: 19 }, () => row({})),
        20,
      ),
    ).toBe(false)
    expect(rangeProblem('2026-09-30', '2026-09-01')).toBe(true)
    expect(rangeProblem('', '2026-09-01')).toBe(false)
  })

  it('names the steps by their place on the ladder, and works the queue out per invoice', () => {
    expect(stepOf([-3, 0, 7, 14], -3)).toMatchObject({ index: 1, tone: 'polite' })
    expect(stepOf([-3, 0, 7, 14], 7)).toMatchObject({ index: 3, tone: 'direct' })
    expect(stepOf([-3, 0, 7, 14], 14)).toMatchObject({ index: 4, tone: 'firm' })

    const unpaid: QueueInvoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-1',
      customerId: 'cus-1',
      customerName: 'Nizwa',
      dueDate: '2026-09-10',
      currency: 'OMR',
      outstanding: 120,
      overdue: true,
      daysOverdue: 15,
      paid: false,
    }
    const spent = [row({ daysFromDue: -3 }), row({ daysFromDue: 0 }), row({ daysFromDue: 7 })]
    const email = () => 'a@b.om'
    // The first unspent rung on or after today: the 14 falls on 24 Sep.
    expect(buildQueue([unpaid], [-3, 0, 7, 14], spent, email, '2026-09-20')[0].next).toEqual({
      offset: 14,
      date: '2026-09-24',
    })
    // A rung whose date has passed is skipped even when unspent; none left means not sending.
    expect(buildQueue([unpaid], [-3, 0, 7, 14], spent, email, '2026-09-25')[0]).toMatchObject({
      next: null,
      reason: 'ladderSpent',
    })
    expect(buildQueue([unpaid], [-3, 0, 7, 14], [], () => null, '2026-09-20')[0].reason).toBe(
      'noRecipient',
    )
    expect(buildQueue([{ ...unpaid, paid: true }], [7], [], email, '2026-09-20')).toEqual([])
    expect(
      paidAfterReminder(
        [{ ...unpaid, paid: true }],
        [row({ firedOn: '2026-09-15' })],
        '2026-09-20',
      ),
    ).toEqual({ paid: 1, sent: 1 })
  })
})
