import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import type { ReminderInboxItemDto } from '../../api/expenditure/billReminders'
import type { Entitlements } from '../../lib/identity/entitlements'
import { NOTES, noteValues, notesStore, type NoteScope } from '../../lib/notifications'
import { SessionContext } from '../../lib/session/session'
import { NotificationsBell } from './NotificationsBell'
import sidebarBillsIcon from '../../assets/dashboard/nav-figma/expenditure.svg'

/**
 * The bell against the reader's own reminder inbox (`BillReminderController`, section 4 of the
 * bill-reminders contract): the count on the bell, the lines in the panel, reading one, reading
 * them all, and where each line leads. Also against a server from before the bell's routes and
 * fields, which must still give a working bell.
 */

const READER: Entitlements = {
  userId: 'u-1',
  username: 'hafidh',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'VIEWER', name: 'Viewer', systemRole: true }],
  permissions: ['invoice.read'],
  scopes: [],
  featureFlags: {},
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

function line(over: Partial<ReminderInboxItemDto> & { id: string }): ReminderInboxItemDto {
  return {
    ruleType: 'LATE',
    subjectType: 'BILL',
    subjectId: 'b-1',
    billId: 'b-1',
    daysFromDue: 3,
    firedOn: '2026-10-01',
    headline: 'ME-991 is 3 day(s) overdue',
    outcome: 'SENT',
    createdAt: hoursAgo(0),
    acknowledgedAt: null,
    reason: 'LATE',
    occasion: null,
    occasionDate: null,
    subjectDisplay: 'ME-991',
    amount: 411.5,
    currency: 'OMR',
    recurringBillId: null,
    intakeId: null,
    arrivedBillId: null,
    variancePercent: null,
    ...over,
  }
}

const LATE = line({ id: 'n-late' })
const DUE = line({
  id: 'n-due',
  ruleType: 'BEFORE_DUE',
  reason: 'BEFORE_DUE',
  subjectId: 'b-2',
  billId: 'b-2',
  subjectDisplay: 'SP-1140',
  headline: 'SP-1140 is due in 2 day(s)',
  daysFromDue: -2,
  amount: 3140,
})
const RENT = line({
  id: 'n-rent',
  ruleType: 'RECURRING_LATE',
  reason: 'RECURRING_LATE',
  occasion: 'LATE',
  subjectType: 'RECURRING_BILL',
  subjectId: 'rb-1',
  recurringBillId: 'rb-1',
  billId: null,
  subjectDisplay: 'Office rent',
  headline: 'Recurring bill Office rent has not arrived',
  daysFromDue: 4,
  amount: 650,
  createdAt: hoursAgo(24 * 5),
})
const READ = line({
  id: 'n-read',
  subjectId: 'b-9',
  billId: 'b-9',
  subjectDisplay: 'AND-3370',
  headline: 'AND-3370 is 9 day(s) overdue',
  daysFromDue: 9,
  createdAt: hoursAgo(24 * 6),
  acknowledgedAt: hoursAgo(24 * 5),
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const NOT_FOUND = { type: 'https://api.fawtir.om/problems/resource-not-found', status: 404 }

let fetchMock: ReturnType<typeof vi.fn>
/** The server as it answers when it is up, so a test that breaks it can put it back. */
let server: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
/** The reader's inbox on the server, newest first. */
let inbox: ReminderInboxItemDto[]
/** Unread rows the server holds beyond the ones the list returns. */
let unreadBeyondTheList: number
/** False is a server from before the bell: no count, no mark-all, none of the new fields. */
let modern: boolean
/** The status a single acknowledge answers. */
let acknowledgeStatus: number
let calls: { method: string; path: string }[]

const called = (method: string, path: string | RegExp) =>
  calls.filter(
    (call) =>
      call.method === method &&
      (typeof path === 'string' ? call.path === path : path.test(call.path)),
  )

const ORIGINAL_FIELDS = [
  'id',
  'ruleType',
  'subjectType',
  'subjectId',
  'billId',
  'daysFromDue',
  'firedOn',
  'headline',
  'outcome',
  'createdAt',
  'acknowledgedAt',
] as const

/** What the server answers for a row: with `read`, or only the fields it had before the bell. */
function answer(item: ReminderInboxItemDto) {
  if (modern) return { ...item, read: item.acknowledgedAt !== null }
  return Object.fromEntries(ORIGINAL_FIELDS.map((field) => [field, item[field]]))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  notesStore.reset()
  inbox = []
  unreadBeyondTheList = 0
  modern = true
  acknowledgeStatus = 204
  calls = []

  server = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url),
      'http://localhost',
    )
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace(/^\/api/, '')
    calls.push({ method, path })
    const unread = () => inbox.filter((item) => item.acknowledgedAt === null)

    if (path === '/v1/bill-reminders/inbox/unread-count' && method === 'GET') {
      if (!modern) return json(404, NOT_FOUND)
      return json(200, { unread: unread().length + unreadBeyondTheList })
    }
    if (path === '/v1/bill-reminders/inbox/acknowledge-all' && method === 'POST') {
      if (!modern) return json(404, NOT_FOUND)
      const marked = unread().length + unreadBeyondTheList
      inbox = inbox.map((item) => ({ ...item, acknowledgedAt: item.acknowledgedAt ?? hoursAgo(0) }))
      unreadBeyondTheList = 0
      return json(200, { acknowledged: marked })
    }
    const acknowledge = /^\/v1\/bill-reminders\/inbox\/([^/]+)\/acknowledge$/.exec(path)
    if (acknowledge && method === 'POST') {
      if (acknowledgeStatus !== 204) return json(acknowledgeStatus, { status: acknowledgeStatus })
      inbox = inbox.map((item) =>
        item.id === acknowledge[1]
          ? { ...item, acknowledgedAt: item.acknowledgedAt ?? hoursAgo(0) }
          : item,
      )
      return json(204)
    }
    if (path === '/v1/bill-reminders/inbox' && method === 'GET') {
      const rows = url.searchParams.get('unread') === 'true' ? unread() : inbox
      return json(200, rows.slice(0, Number(url.searchParams.get('limit'))).map(answer))
    }
    return json(404, NOT_FOUND)
  }
  fetchMock = vi.fn(server)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  notesStore.reset()
  await i18n.changeLanguage('en')
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderBell(session: Entitlements | null = READER, scope: NoteScope = 'tenant') {
  return render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={['/start']}>
        <NotificationsBell scope={scope} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  )
}

const bell = () => screen.getByRole('button', { name: /^Notifications/ })
const openPanel = async () => {
  fireEvent.click(bell())
  return screen.findByRole('dialog', { name: 'Notifications' })
}
const rowOf = (text: string) => screen.getByText(text).closest('li')!
const markAll = (panel: HTMLElement) =>
  within(panel).getByRole('button', { name: 'Mark all as read' })

describe('the count on the bell', () => {
  it('shows no count with nothing unread, and says so in the panel', async () => {
    inbox = [READ]
    renderBell()
    await waitFor(() =>
      expect(called('GET', '/v1/bill-reminders/inbox/unread-count')).toHaveLength(1),
    )
    expect(bell().getAttribute('aria-label')).toBe('Notifications')
    expect(bell().textContent).toBe('')

    const panel = await openPanel()
    // The line that was read is still listed, as read; nothing is "new".
    expect(await within(panel).findByText('Bill AND-3370 is 9 days late')).toBeTruthy()
    expect(within(panel).queryByText(/ new$/)).toBeNull()
    expect(markAll(panel)).toHaveProperty('disabled', true)
  })

  it('says "all caught up" for an empty inbox', async () => {
    renderBell()
    const panel = await openPanel()
    expect(await within(panel).findByText('You are all caught up.')).toBeTruthy()
    expect(bell().textContent).toBe('')
  })

  it('counts one unread', async () => {
    inbox = [LATE, READ]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread')

    const panel = await openPanel()
    expect(await within(panel).findByText('Bill ME-991 is 3 days late')).toBeTruthy()
    expect(within(panel).getByText('1 new')).toBeTruthy()
    expect(markAll(panel)).toHaveProperty('disabled', false)
  })

  it('counts several unread, and lists them newest first under Today and Earlier', async () => {
    inbox = [LATE, DUE, RENT, READ]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('3'))
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 3 unread')

    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    expect(within(panel).getByText('3 new')).toBeTruthy()
    const titles = within(panel)
      .getAllByRole('listitem')
      .map((row) => row.querySelector('p')!.textContent)
    expect(titles).toEqual([
      'Bill ME-991 is 3 days late',
      'Bill SP-1140 is due in 2 days',
      'Office rent is 4 days late arriving',
      'Bill AND-3370 is 9 days late',
    ])
    expect(within(panel).getByText('Today')).toBeTruthy()
    expect(within(panel).getByText('Earlier')).toBeTruthy()
    // The amount under each title, with the rial sign and never the letters beside the figure.
    expect(rowOf('Bill ME-991 is 3 days late').textContent).toContain('411.500 still to pay.')
    expect(rowOf('Bill SP-1140 is due in 2 days').textContent).toContain('3,140.000 still to pay.')
    expect(rowOf('Office rent is 4 days late arriving').textContent).toContain('650.000.')
    expect(within(rowOf('Bill ME-991 is 3 days late')).getByText('OMR').className).toContain(
      'sr-only',
    )
  })

  it('counts what the server counts, not only the lines it lists', async () => {
    // Twelve unread, of which the list shows two: the dot holds one figure, the words say twelve.
    inbox = [LATE, DUE]
    unreadBeyondTheList = 10
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('9+'))
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 12 unread')
    const panel = await openPanel()
    expect(await within(panel).findByText('12 new')).toBeTruthy()
  })

  it('asks for the count alone until the panel is opened', async () => {
    inbox = [LATE]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    expect(called('GET', '/v1/bill-reminders/inbox')).toHaveLength(0)
    await openPanel()
    await screen.findByText('Bill ME-991 is 3 days late')
    expect(called('GET', '/v1/bill-reminders/inbox')).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('limit=20'))).toBe(true)
  })

  it('no longer shows the sample list the bell used to carry', async () => {
    inbox = [LATE]
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1)
    expect(within(panel).queryByText(/Peppol certificate/)).toBeNull()
    expect(within(panel).queryByText(/was refused by the Tax Authority/)).toBeNull()
    expect(within(panel).queryByText(/signed in from a new device/)).toBeNull()
  })
})

describe('the icon on a bill reminder', () => {
  it('is the Bills icon the sidebar shows, the same file, for every kind of reminder', async () => {
    inbox = [LATE, DUE, RENT]
    renderBell()
    const panel = await openPanel()
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(3))
    for (const row of within(panel).getAllByRole('listitem')) {
      // The first image of a row is the one on its tinted tile.
      const icon = row.querySelector('img')!
      expect(icon.getAttribute('src')).toBe(sidebarBillsIcon)
      // Drawn as the panel draws every icon: no filter, no recolouring.
      expect(icon.getAttribute('style')).toBeNull()
      expect(icon.className).toBe('block size-4 max-w-none')
    }
  })
})

describe('the seven sample notices the design typed in', () => {
  // Certificate, plan usage, refused invoice, stock, accepted, invitation, new device: none has a
  // source, so none is shown to anyone. What the bell holds is what the server sent.
  const PEOPLE: { who: string; session: Entitlements | null; scope: NoteScope; reads: boolean }[] =
    [
      ...['ADMIN', 'FINANCE_MANAGER', 'APPROVER', 'VIEWER'].map((code) => ({
        who: code,
        session: { ...READER, roles: [{ id: 'r-1', code, name: code, systemRole: true }] },
        scope: 'tenant' as const,
        reads: true,
      })),
      {
        who: 'someone who may not read bills',
        session: { ...READER, permissions: ['customer.read'] },
        scope: 'tenant',
        reads: false,
      },
      { who: 'nobody signed in', session: null, scope: 'tenant', reads: false },
      { who: 'the console operator', session: READER, scope: 'console', reads: false },
    ]

  const sampleSentences = (language: string) =>
    NOTES.flatMap((note) => {
      const values = noteValues(note, language)
      return [
        i18n.t(note.titleKey, values),
        ...note.actions.map((action) => i18n.t(action.labelKey, values)),
      ]
    })

  for (const language of ['en', 'ar'] as const) {
    for (const person of PEOPLE) {
      for (const filled of [true, false]) {
        it(`shows none of them to ${person.who}, in ${language}, with ${
          filled ? 'a reminder' : 'nothing'
        } in the inbox`, async () => {
          await i18n.changeLanguage(language)
          inbox = filled ? [LATE] : []
          renderBell(person.session, person.scope)
          fireEvent.click(screen.getByRole('button', { name: i18n.t('dashboard.notifications') }))
          const panel = await screen.findByRole('dialog', { name: i18n.t('notes.title') })
          const expected = filled && person.reads ? 1 : 0
          await waitFor(() =>
            expect(within(panel).queryAllByRole('listitem')).toHaveLength(expected),
          )
          if (expected === 0) await within(panel).findByText(i18n.t('notes.allCaughtUp'))

          const samples = sampleSentences(language)
          // Seven titles and their buttons, each a real sentence and not a bare key.
          expect(samples.length).toBeGreaterThanOrEqual(7)
          for (const sentence of samples) {
            expect(sentence).not.toMatch(/^notes\./)
            expect(panel.textContent ?? '', sentence).not.toContain(sentence)
          }
        })
      }
    }
  }
})

describe('reading a line', () => {
  it('marks it read on the server, and the count goes down', async () => {
    inbox = [LATE, DUE]
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    await waitFor(() => expect(bell().textContent).toBe('2'))

    fireEvent.click(rowOf('Bill ME-991 is 3 days late'))
    await waitFor(() => expect(bell().textContent).toBe('1'))
    expect(within(panel).getByText('1 new')).toBeTruthy()
    await waitFor(() =>
      expect(called('POST', '/v1/bill-reminders/inbox/n-late/acknowledge')).toHaveLength(1),
    )
    expect(inbox.find((item) => item.id === 'n-late')!.acknowledgedAt).not.toBeNull()
    // Still listed, no longer marked unread.
    expect(rowOf('Bill ME-991 is 3 days late').className).not.toContain('bg-primary-25')
    expect(rowOf('Bill SP-1140 is due in 2 days').className).toContain('bg-primary-25')

    // Reading it again asks nothing of the server.
    fireEvent.click(rowOf('Bill ME-991 is 3 days late'))
    await Promise.resolve()
    expect(called('POST', /acknowledge/)).toHaveLength(1)
    expect(bell().textContent).toBe('1')
  })

  it('opens the bill it is about, and marks it read on the way', async () => {
    inbox = [LATE]
    renderBell()
    const panel = await openPanel()
    const row = (await within(panel).findByText('Bill ME-991 is 3 days late')).closest('li')!

    fireEvent.click(within(row).getByRole('button', { name: 'Open the bill' }))
    expect(screen.getByTestId('where').textContent).toBe('/expenditure/bills/b-1')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() =>
      expect(called('POST', '/v1/bill-reminders/inbox/n-late/acknowledge')).toHaveLength(1),
    )
    await waitFor(() => expect(bell().textContent).toBe(''))
  })

  it('opens the recurring bill, the bill that arrived, or the upload to check', async () => {
    const arrived = line({
      ...RENT,
      id: 'n-range',
      reason: 'RECURRING_OUT_OF_RANGE',
      occasion: 'OUT_OF_RANGE',
      daysFromDue: 0,
      arrivedBillId: 'b-77',
      variancePercent: 16.67,
      subjectDisplay: 'Electricity',
    })
    const scan = line({
      id: 'n-scan',
      ruleType: 'SCAN_UNCONFIRMED',
      reason: 'SCAN_UNCONFIRMED',
      subjectType: 'INTAKE',
      subjectId: 'in-7',
      intakeId: 'in-7',
      billId: null,
      subjectDisplay: 'receipt-12.jpg',
      daysFromDue: 2,
      amount: null,
      currency: null,
    })
    inbox = [RENT, arrived, scan]
    renderBell()

    const go = async (title: string, button: string) => {
      const panel = await openPanel()
      const row = (await within(panel).findByText(title)).closest('li')!
      fireEvent.click(within(row).getByRole('button', { name: button }))
      return screen.getByTestId('where').textContent
    }
    expect(await go('Office rent is 4 days late arriving', 'Open it')).toBe(
      '/expenditure/recurring-bills/rb-1',
    )
    expect(await go('Electricity arrived outside its usual range', 'Open the bill')).toBe(
      '/expenditure/bills/b-77',
    )
    expect(await go('receipt-12.jpg has waited 2 days to be confirmed', 'Check and save')).toBe(
      '/expenditure/bills/upload/in-7',
    )
    await waitFor(() => expect(called('POST', /\/acknowledge$/)).toHaveLength(3))
  })

  it('shows the line as unread again if the server did not take it', async () => {
    inbox = [LATE]
    acknowledgeStatus = 500
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    await waitFor(() => expect(bell().textContent).toBe('1'))

    fireEvent.click(rowOf('Bill ME-991 is 3 days late'))
    await waitFor(() => expect(called('POST', /acknowledge/)).toHaveLength(1))
    // Read again from the server, which still holds it unread.
    await waitFor(() => expect(called('GET', '/v1/bill-reminders/inbox')).toHaveLength(2))
    await waitFor(() => expect(bell().textContent).toBe('1'))
    expect(rowOf('Bill ME-991 is 3 days late').className).toContain('bg-primary-25')
  })

  it('puts a line away, read, and brings it back with "See them all"', async () => {
    inbox = [LATE, DUE]
    renderBell()
    const panel = await openPanel()
    const row = (await within(panel).findByText('Bill ME-991 is 3 days late')).closest('li')!

    fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(within(panel).queryByText('Bill ME-991 is 3 days late')).toBeNull())
    await waitFor(() =>
      expect(called('POST', '/v1/bill-reminders/inbox/n-late/acknowledge')).toHaveLength(1),
    )
    await waitFor(() => expect(bell().textContent).toBe('1'))

    fireEvent.click(within(panel).getByRole('button', { name: 'See them all' }))
    expect(await within(panel).findByText('Bill ME-991 is 3 days late')).toBeTruthy()
    expect(rowOf('Bill ME-991 is 3 days late').className).not.toContain('bg-primary-25')
  })
})

describe('mark all as read', () => {
  it('marks everything read with one request, beyond the lines on show too', async () => {
    inbox = [LATE, DUE, RENT]
    unreadBeyondTheList = 4
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    await waitFor(() => expect(bell().textContent).toBe('7'))

    fireEvent.click(markAll(panel))
    await waitFor(() => expect(bell().textContent).toBe(''))
    await waitFor(() =>
      expect(called('POST', '/v1/bill-reminders/inbox/acknowledge-all')).toHaveLength(1),
    )
    expect(called('POST', /\/inbox\/[^/]+\/acknowledge$/)).toHaveLength(0)
    expect(inbox.every((item) => item.acknowledgedAt !== null)).toBe(true)
    await waitFor(() => expect(markAll(panel)).toHaveProperty('disabled', true))
    expect(within(panel).queryByText(/ new$/)).toBeNull()
    // The lines stay, read.
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
    expect(bell().getAttribute('aria-label')).toBe('Notifications')
  })
})

describe('a server from before the bell (no count, no mark-all, none of the new fields)', () => {
  beforeEach(() => {
    modern = false
  })

  it('still counts, from the unread lines it can read', async () => {
    inbox = [LATE, DUE, READ]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('2'))
    expect(called('GET', '/v1/bill-reminders/inbox/unread-count')).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('unread=true'))).toBe(true)
  })

  it('shows the sentence the server wrote, and what kind of reminder it is', async () => {
    inbox = [LATE, RENT]
    renderBell()
    const panel = await openPanel()
    // No name and no reason arrive, so no sentence can be written around them.
    const row = (await within(panel).findByText('ME-991 is 3 day(s) overdue')).closest('li')!
    expect(within(row).getByText('Once a bill is late')).toBeTruthy()
    expect(within(row).queryByText(/still to pay/)).toBeNull()

    // The line still leads to its bill, and reading it still marks it read.
    fireEvent.click(within(row).getByRole('button', { name: 'Open the bill' }))
    expect(screen.getByTestId('where').textContent).toBe('/expenditure/bills/b-1')
    await waitFor(() =>
      expect(called('POST', '/v1/bill-reminders/inbox/n-late/acknowledge')).toHaveLength(1),
    )
    await waitFor(() => expect(bell().textContent).toBe('1'))
  })

  it('marks all read one line at a time when there is no route for all', async () => {
    inbox = [LATE, DUE, READ]
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText('ME-991 is 3 day(s) overdue')
    await waitFor(() => expect(bell().textContent).toBe('2'))

    fireEvent.click(markAll(panel))
    await waitFor(() => expect(called('POST', /\/inbox\/[^/]+\/acknowledge$/)).toHaveLength(2))
    expect(called('POST', '/v1/bill-reminders/inbox/acknowledge-all')).toHaveLength(1)
    await waitFor(() => expect(inbox.every((item) => item.acknowledgedAt !== null)).toBe(true))
    await waitFor(() => expect(bell().textContent).toBe(''))
  })
})

describe('whose bell it is', () => {
  it('asks nothing for someone who may not read bills, and stays quiet', async () => {
    inbox = [LATE]
    renderBell({ ...READER, permissions: ['customer.read'] })
    const panel = await openPanel()
    expect(within(panel).getByText('You are all caught up.')).toBeTruthy()
    expect(bell().textContent).toBe('')
    expect(calls).toHaveLength(0)
  })

  it('asks nothing in the console', async () => {
    inbox = [LATE]
    renderBell(READER, 'console')
    const panel = await openPanel()
    expect(within(panel).getByText('You are all caught up.')).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it('asks nothing while nobody is signed in', async () => {
    inbox = [LATE]
    renderBell(null)
    await openPanel()
    expect(calls).toHaveLength(0)
    expect(bell().textContent).toBe('')
  })

  it('keeps the count between pages, and asks again on each', async () => {
    inbox = [LATE]
    const first = renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    first.unmount()

    // The next page mounts its own shell: the count is there at once, then read afresh.
    inbox = [LATE, DUE]
    renderBell()
    expect(bell().textContent).toBe('1')
    await waitFor(() => expect(bell().textContent).toBe('2'))
    expect(called('GET', '/v1/bill-reminders/inbox/unread-count')).toHaveLength(2)
  })

  it('does not show one person the reminders of another', async () => {
    inbox = [LATE, DUE]
    const first = renderBell()
    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    await waitFor(() => expect(bell().textContent).toBe('2'))
    first.unmount()

    // Someone else signs in on the same browser, with an inbox of their own.
    inbox = []
    renderBell({ ...READER, userId: 'u-2' })
    expect(bell().textContent).toBe('')
    const theirs = await openPanel()
    expect(await within(theirs).findByText('You are all caught up.')).toBeTruthy()
    expect(within(theirs).queryByText('Bill ME-991 is 3 days late')).toBeNull()
  })
})

describe('an inbox that cannot be read', () => {
  const SENTENCE = 'Reminders could not be read. Reload to try again.'
  const failEverything = () => fetchMock.mockImplementation(async () => json(500, { status: 500 }))

  it('says so in the panel, in the line that otherwise says there is nothing', async () => {
    failEverything()
    renderBell()
    const panel = await openPanel()
    const line = await within(panel).findByText(SENTENCE)
    // The panel's own empty-state line, not a new element beside it.
    expect(line.tagName).toBe('P')
    expect(line.className).toContain('py-12')
    expect(line.className).toContain('text-center')
    // No count, no line, and no claim that there is nothing.
    expect(bell().textContent).toBe('')
    expect(within(panel).queryAllByRole('listitem')).toHaveLength(0)
    expect(within(panel).queryByText('You are all caught up.')).toBeNull()
    expect(markAll(panel)).toHaveProperty('disabled', true)
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    failEverything()
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /^الإشعارات/ }))
    const panel = await screen.findByRole('dialog', { name: 'الإشعارات' })
    expect(
      await within(panel).findByText('تعذّرت قراءة التذكيرات. أعد التحميل للمحاولة مجددًا.'),
    ).toBeTruthy()
    expect(within(panel).queryByText('لا جديد لديك.')).toBeNull()
    expect(within(panel).queryByText(/could not be read/)).toBeNull()
  })

  it('does not go on saying "all caught up" when a later read of an empty inbox fails', async () => {
    renderBell()
    const panel = await openPanel()
    expect(await within(panel).findByText('You are all caught up.')).toBeTruthy()
    fireEvent.click(bell())

    failEverything()
    const again = await openPanel()
    expect(await within(again).findByText(SENTENCE)).toBeTruthy()
    expect(within(again).queryByText('You are all caught up.')).toBeNull()
  })

  it('keeps the lines it had when a later read fails, and shows no sentence over them', async () => {
    inbox = [LATE]
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText('Bill ME-991 is 3 days late')
    fireEvent.click(bell())

    // Counted on the stub itself: the failing server keeps no log of its own.
    const listReads = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/bill-reminders/inbox?')).length
    const before = listReads()
    failEverything()
    const again = await openPanel()
    await waitFor(() => expect(listReads()).toBeGreaterThan(before))
    await waitFor(() => expect(within(again).getByText('Bill ME-991 is 3 days late')).toBeTruthy())
    expect(within(again).queryByText(SENTENCE)).toBeNull()
  })

  it('shows the lines again once the read answers', async () => {
    failEverything()
    renderBell()
    const panel = await openPanel()
    await within(panel).findByText(SENTENCE)
    fireEvent.click(bell())

    inbox = [LATE]
    fetchMock.mockImplementation(server)
    const again = await openPanel()
    expect(await within(again).findByText('Bill ME-991 is 3 days late')).toBeTruthy()
    expect(within(again).queryByText(SENTENCE)).toBeNull()
    await waitFor(() => expect(bell().textContent).toBe('1'))
  })

  it('does not say it for a server from before the bell, whose list still answers', async () => {
    modern = false
    renderBell()
    const panel = await openPanel()
    expect(await within(panel).findByText('You are all caught up.')).toBeTruthy()
    expect(within(panel).queryByText(SENTENCE)).toBeNull()
  })

  it('does not say it to someone with no inbox to read', async () => {
    failEverything()
    renderBell({ ...READER, permissions: ['customer.read'] })
    const panel = await openPanel()
    expect(within(panel).getByText('You are all caught up.')).toBeTruthy()
    expect(within(panel).queryByText(SENTENCE)).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('the bell in Arabic', () => {
  it('writes each line, its amount and its button in Arabic', async () => {
    await i18n.changeLanguage('ar')
    inbox = [LATE, DUE, RENT]
    renderBell()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'الإشعارات، 3 غير مقروءة' })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: /^الإشعارات/ }))
    const panel = await screen.findByRole('dialog', { name: 'الإشعارات' })

    const late = (await within(panel).findByText('الفاتورة ME-991 متأخرة 3 أيام')).closest('li')!
    expect(late.textContent).toContain('لم تُسدَّد بعد.')
    expect(within(late).getByRole('button', { name: 'افتح الفاتورة' })).toBeTruthy()
    expect(within(panel).getByText('تستحق الفاتورة SP-1140 بعد يومين')).toBeTruthy()
    const rent = within(panel).getByText('تأخر وصول Office rent 4 أيام').closest('li')!
    expect(rent.textContent).toContain('المبلغ المعتاد')
    expect(within(panel).getByText('3 جديدة')).toBeTruthy()

    // No key and no English sentence left on the Arabic panel.
    const text = panel.textContent ?? ''
    expect(text).not.toMatch(/notes\.|expenditureReminders\.|recurringBills\./)
    for (const english of ['is 3 days late', 'still to pay', 'Open the bill', 'overdue']) {
      expect(text, english).not.toContain(english)
    }
  })
})
