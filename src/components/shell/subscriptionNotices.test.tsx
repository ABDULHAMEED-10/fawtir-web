import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import type { SubscriptionNoticeDto } from '../../api/settings/subscription'
import type { Entitlements } from '../../lib/identity/entitlements'
import { notesStore, type NoteScope } from '../../lib/notifications'
import { SessionContext } from '../../lib/session/session'
import { NotificationsBell } from './NotificationsBell'

/**
 * The trial-ending and grace reminders in the bell (`GET /settings/subscription/notices`, V299,
 * backend #515): the count, the line in each language, the button to the route the server names,
 * marking read through `POST .../acknowledge`, the permission that gates the read, and a server
 * from before the route, which must show nothing and no error.
 */

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'invoice.read'],
  scopes: [],
  featureFlags: {},
}

const NOTICES = '/v1/settings/subscription/notices'
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

const TRIAL: SubscriptionNoticeDto = {
  id: 's-trial',
  kind: 'TRIAL_ENDING',
  coveredThrough: '2026-10-27',
  graceDay: null,
  graceUntil: null,
  noticeOn: '2026-10-24',
  headline:
    'Your free trial ends on 27 October 2026. Choose a plan to keep issuing documents and open the ones you receive.',
  actionLabel: 'Choose a plan',
  actionPath: '/settings/plan',
  createdAt: hoursAgo(1),
  read: false,
}
const GRACE: SubscriptionNoticeDto = {
  id: 's-grace',
  kind: 'GRACE',
  coveredThrough: '2026-11-22',
  graceDay: 1,
  graceUntil: '2026-11-29',
  noticeOn: '2026-11-23',
  headline: 'Your subscription ended on 22 November 2026 and the renewal is unpaid.',
  actionLabel: 'Pay the bill',
  actionPath: '/settings/bills',
  createdAt: hoursAgo(2),
  read: false,
}

/** CA-9, V365: the server sends the last covered day; the cancellation took effect the day after. */
const CANCELLED: SubscriptionNoticeDto = {
  id: 's-cancelled',
  kind: 'CANCELLED_BY_FAWTIR',
  coveredThrough: '2026-10-16',
  graceDay: null,
  graceUntil: null,
  noticeOn: '2026-10-17',
  headline: 'Fawtir cancelled your subscription on 17 October 2026. Your account is read-only.',
  actionLabel: 'View your plan',
  actionPath: '/settings/plan',
  createdAt: hoursAgo(1),
  read: false,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let notices: SubscriptionNoticeDto[]
/** The bill reminders' inbox, for the test that mixes the two. */
let billInbox: unknown[]
/** False is a server from before V299, which has no such route. */
let modern: boolean
let calls: { method: string; path: string; search: string }[]

const called = (method: string, path: string | RegExp) =>
  calls.filter(
    (call) =>
      call.method === method &&
      (typeof path === 'string' ? call.path === path : path.test(call.path)),
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  notesStore.reset()
  notices = []
  billInbox = []
  modern = true
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url),
        'http://localhost',
      )
      const method = init?.method ?? 'GET'
      const path = url.pathname.replace(/^\/api/, '')
      calls.push({ method, path, search: url.search })

      if (path === NOTICES && method === 'GET') {
        if (!modern) return json(404, { status: 404 })
        const rows =
          url.searchParams.get('unread') === 'true' ? notices.filter((n) => !n.read) : notices
        return json(200, rows.slice(0, Number(url.searchParams.get('limit') ?? 20)))
      }
      const ack = new RegExp(`^${NOTICES}/([^/]+)/acknowledge$`).exec(path)
      if (ack && method === 'POST') {
        if (!modern) return json(404, { status: 404 })
        notices = notices.map((n) => (n.id === ack[1] ? { ...n, read: true } : n))
        return json(204)
      }
      // The bill reminders' inbox is empty here; its own suite covers it.
      if (path === '/v1/bill-reminders/inbox/unread-count')
        return json(200, { unread: billInbox.length })
      if (path === '/v1/bill-reminders/inbox') return json(200, billInbox)
      if (path === '/v1/bill-reminders/inbox/acknowledge-all') return json(200, { acknowledged: 0 })
      return json(404, { status: 404 })
    }),
  )
})

afterEach(async () => {
  vi.unstubAllGlobals()
  notesStore.reset()
  await i18n.changeLanguage('en')
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderBell(session: Entitlements | null = OWNER, scope: NoteScope = 'tenant') {
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

const bell = () => screen.getByRole('button', { name: /^(Notifications|الإشعارات)/ })
const openPanel = async (name = 'Notifications') => {
  fireEvent.click(bell())
  return screen.findByRole('dialog', { name })
}

describe('subscription reminders in the bell', () => {
  it('counts the unread reminders and words each one from its dates', async () => {
    notices = [TRIAL, GRACE]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('2'))
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 2 unread')
    // The count asks for the unread list only; the lines wait for the panel.
    expect(called('GET', NOTICES).map((c) => c.search)).toEqual(['?unread=true&limit=100'])

    const panel = await openPanel()
    const trial = (
      await within(panel).findByText('Your free trial ends on 27 October 2026.')
    ).closest('li')!
    expect(trial.textContent).toContain('Choose a plan to keep issuing documents and open the ones you receive.')
    expect(within(trial).getByRole('button', { name: 'Choose a plan' })).toBeTruthy()

    const grace = within(panel)
      .getByText('Your subscription ended on 22 November 2026 and the renewal is unpaid.')
      .closest('li')!
    expect(grace.textContent).toContain(
      'Pay it by 29 November 2026 to keep issuing documents and open the ones you receive.',
    )
    expect(within(grace).getByRole('button', { name: 'Pay the bill' })).toBeTruthy()
    expect(called('GET', NOTICES).some((c) => c.search === '?limit=20')).toBe(true)
    expect(panel.textContent).not.toMatch(/TRIAL_ENDING|GRACE|notes\.|—/)
  })

  it('opens the route the server names and marks the reminder read', async () => {
    notices = [TRIAL, GRACE]
    renderBell()
    const panel = await openPanel()
    const grace = (
      await within(panel).findByText(
        'Your subscription ended on 22 November 2026 and the renewal is unpaid.',
      )
    ).closest('li')!
    fireEvent.click(within(grace).getByRole('button', { name: 'Pay the bill' }))

    expect(screen.getByTestId('where').textContent).toBe('/settings/bills')
    await waitFor(() => expect(called('POST', `${NOTICES}/s-grace/acknowledge`)).toHaveLength(1))
    await waitFor(() => expect(bell().textContent).toBe('1'))
  })

  it('words the cancellation by Fawtir from the day it took effect and opens the plan', async () => {
    notices = [CANCELLED]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    const panel = await openPanel()
    const line = (
      await within(panel).findByText('Fawtir cancelled your subscription on 17 October 2026.')
    ).closest('li')!
    expect(line.textContent).toContain('Your account is read-only.')
    fireEvent.click(within(line).getByRole('button', { name: 'View your plan' }))
    expect(screen.getByTestId('where').textContent).toBe('/settings/plan')
    await waitFor(() => expect(called('POST', `${NOTICES}/s-cancelled/acknowledge`)).toHaveLength(1))
  })

  it('words the cancellation by Fawtir in Arabic, with the Arabic brand only', async () => {
    await i18n.changeLanguage('ar')
    notices = [CANCELLED]
    renderBell()
    const panel = await openPanel('الإشعارات')
    const line = (await within(panel).findByText(/^ألغت فوتر اشتراكك في 17 /)).closest('li')!
    expect(line.textContent).toContain('حسابك الآن للقراءة فقط.')
    expect(within(line).getByRole('button', { name: 'اعرض خطتك' })).toBeTruthy()
    expect(line.textContent).not.toMatch(/Fawtir|فوتير|notes\./)
  })

  it('takes the trial reader to the plan page', async () => {
    notices = [TRIAL]
    renderBell()
    const panel = await openPanel()
    fireEvent.click(await within(panel).findByRole('button', { name: 'Choose a plan' }))
    expect(screen.getByTestId('where').textContent).toBe('/settings/plan')
    await waitFor(() => expect(called('POST', `${NOTICES}/s-trial/acknowledge`)).toHaveLength(1))
  })

  it('marks a reminder read when its line is clicked', async () => {
    notices = [TRIAL]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    const panel = await openPanel()
    fireEvent.click(await within(panel).findByText('Your free trial ends on 27 October 2026.'))
    await waitFor(() => expect(called('POST', `${NOTICES}/s-trial/acknowledge`)).toHaveLength(1))
    await waitFor(() => expect(bell().textContent).toBe(''))
  })

  it('"Mark all as read" acknowledges each unread reminder', async () => {
    notices = [TRIAL, GRACE, { ...TRIAL, id: 's-old', read: true, createdAt: hoursAgo(80) }]
    renderBell()
    const panel = await openPanel()
    await within(panel).findAllByText('Your free trial ends on 27 October 2026.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(called('POST', /\/acknowledge$/)).toHaveLength(2))
    expect(called('POST', `${NOTICES}/s-old/acknowledge`)).toHaveLength(0)
    await waitFor(() => expect(bell().textContent).toBe(''))
  })

  it('says the same in Arabic, with Latin digits', async () => {
    await i18n.changeLanguage('ar')
    notices = [TRIAL, GRACE]
    renderBell()
    const panel = await openPanel('الإشعارات')
    const trial = (
      await within(panel).findByText(/^تنتهي فترتك التجريبية المجانية في 27 /)
    ).closest('li')!
    expect(trial.textContent).toContain('اختر خطة لمواصلة إصدار المستندات وفتح المستندات التي تستلمها.')
    expect(within(trial).getByRole('button', { name: 'اختر خطة' })).toBeTruthy()
    const grace = within(panel)
      .getByText(/^انتهى اشتراكك في 22 /)
      .closest('li')!
    expect(grace.textContent).toMatch(/ادفعها حتى 29 .+ 2026 لمواصلة/)
    expect(within(grace).getByRole('button', { name: 'ادفع المطالبة' })).toBeTruthy()
    expect(panel.textContent ?? '').not.toMatch(/[٠-٩]|notes\.|Choose a plan|Pay the bill/)
  })

  it('words a grace reminder with no last day without one', async () => {
    notices = [{ ...GRACE, graceUntil: null }]
    renderBell()
    const panel = await openPanel()
    const row = (
      await within(panel).findByText(
        'Your subscription ended on 22 November 2026 and the renewal is unpaid.',
      )
    ).closest('li')!
    expect(row.textContent).toContain('Pay the bill to keep issuing documents and open the ones you receive.')
  })

  it('shows the server’s own sentence for a kind it does not know, and never leaves the app', async () => {
    notices = [
      {
        ...TRIAL,
        id: 's-new',
        kind: 'SOMETHING_NEW',
        headline: 'Something new about your subscription.',
        actionPath: 'https://elsewhere.example/settings/plan',
      },
    ]
    renderBell()
    const panel = await openPanel()
    const row = (await within(panel).findByText('Something new about your subscription.')).closest(
      'li',
    )!
    fireEvent.click(within(row).getByRole('button', { name: 'Choose a plan' }))
    expect(screen.getByTestId('where').textContent).toBe('/settings/plan')
  })

  it('shows nothing and no error on a server without the route, and stops asking', async () => {
    modern = false
    renderBell({ ...OWNER, permissions: ['tenant.plan.read'] })
    await waitFor(() => expect(called('GET', NOTICES)).toHaveLength(1))
    expect(bell().textContent).toBe('')
    const panel = await openPanel()
    expect(await within(panel).findByText('You are all caught up.')).toBeTruthy()
    expect(within(panel).queryByText('The notifications could not be read.')).toBeNull()
    expect(called('GET', NOTICES)).toHaveLength(1)
  })

  it('asks nothing without tenant.plan.read, and nothing in the console', async () => {
    notices = [TRIAL]
    const { unmount } = renderBell({ ...OWNER, permissions: ['invoice.read'] })
    await waitFor(() =>
      expect(called('GET', '/v1/bill-reminders/inbox/unread-count')).toHaveLength(1),
    )
    expect(called('GET', NOTICES)).toHaveLength(0)
    unmount()

    renderBell(OWNER, 'console')
    fireEvent.click(bell())
    await screen.findByRole('dialog', { name: 'Notifications' })
    expect(called('GET', NOTICES)).toHaveLength(0)
  })

  it('reads the reminders for a reader who may read the plan but not invoices', async () => {
    notices = [GRACE]
    renderBell({ ...OWNER, permissions: ['tenant.plan.read'] })
    await waitFor(() => expect(bell().textContent).toBe('1'))
    expect(called('GET', /bill-reminders/)).toHaveLength(0)
    const panel = await openPanel()
    expect(
      await within(panel).findByText(
        'Your subscription ended on 22 November 2026 and the renewal is unpaid.',
      ),
    ).toBeTruthy()
  })

  it('sits among the bill reminders newest first, and the count adds both', async () => {
    notices = [{ ...TRIAL, createdAt: hoursAgo(3) }]
    billInbox = [
      {
        id: 'b-new',
        ruleType: 'LATE',
        subjectType: 'BILL',
        subjectId: 'b-1',
        billId: 'b-1',
        daysFromDue: 3,
        firedOn: '2026-10-01',
        headline: 'ME-991 is 3 day(s) overdue',
        outcome: 'SENT',
        createdAt: hoursAgo(1),
        acknowledgedAt: null,
        read: false,
        subjectDisplay: 'ME-991',
      },
      {
        id: 'b-old',
        ruleType: 'LATE',
        subjectType: 'BILL',
        subjectId: 'b-2',
        billId: 'b-2',
        daysFromDue: 9,
        firedOn: '2026-09-25',
        headline: 'AND-3370 is 9 day(s) overdue',
        outcome: 'SENT',
        createdAt: hoursAgo(30),
        acknowledgedAt: null,
        read: false,
        subjectDisplay: 'AND-3370',
      },
    ]
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('3'))
    const panel = await openPanel()
    await within(panel).findByText('Your free trial ends on 27 October 2026.')
    const titles = within(panel)
      .getAllByRole('listitem')
      .map((row) => row.querySelector('p')!.textContent)
    expect(titles).toEqual([
      'Bill ME-991 is 3 days late',
      'Your free trial ends on 27 October 2026.',
      'Bill AND-3370 is 9 days late',
    ])
  })
})
