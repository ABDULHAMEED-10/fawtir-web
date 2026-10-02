import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { notesStore } from '../../lib/notifications'
import { AppShell } from './AppShell'

/**
 * "In Fawtir: a count on the bell and on the Bills tab" (Reminders, Figma 163:21448). The Bills
 * entry of the sidebar shows the reader's unread bill reminders, the number the bell shows, read
 * once for the two of them.
 */

const READER: Entitlements = {
  userId: 'u-1',
  username: 'hafidh',
  tenantId: 't-1',
  tenantName: 'Al Bahja Coffee',
  roles: [{ id: 'r-1', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: ['invoice.read'],
  scopes: [],
  featureFlags: {},
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const reminder = (id: string) => ({
  id,
  ruleType: 'LATE',
  subjectType: 'BILL',
  subjectId: `b-${id}`,
  billId: `b-${id}`,
  daysFromDue: 3,
  firedOn: '2026-10-01',
  headline: `ME-${id} is 3 day(s) overdue`,
  outcome: 'SENT',
  createdAt: new Date().toISOString(),
  acknowledgedAt: null as string | null,
  reason: 'LATE',
  subjectDisplay: `ME-${id}`,
  amount: 411.5,
  currency: 'OMR',
})

let fetchMock: ReturnType<typeof vi.fn>
let entitlements: Entitlements
let inbox: ReturnType<typeof reminder>[]
/** Unread rows the server holds beyond the ones the list returns. */
let unreadBeyondTheList: number
let countStatus: number
let calls: { method: string; path: string }[]

const countReads = () =>
  calls.filter((call) => call.path === '/v1/bill-reminders/inbox/unread-count').length

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  notesStore.reset()
  entitlements = READER
  inbox = [reminder('1'), reminder('2'), reminder('3')]
  unreadBeyondTheList = 0
  countStatus = 200
  calls = []

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url),
      'http://localhost',
    )
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace(/^\/api/, '')
    calls.push({ method, path })
    const unread = () => inbox.filter((item) => item.acknowledgedAt === null)

    if (path === '/v1/me/entitlements') return json(200, entitlements)
    if (path === '/v1/bill-reminders/inbox/unread-count') {
      if (countStatus !== 200) return json(countStatus, { status: countStatus })
      return json(200, { unread: unread().length + unreadBeyondTheList })
    }
    if (path === '/v1/bill-reminders/inbox/acknowledge-all' && method === 'POST') {
      const marked = unread().length + unreadBeyondTheList
      inbox = inbox.map((item) => ({ ...item, acknowledgedAt: new Date().toISOString() }))
      unreadBeyondTheList = 0
      return json(200, { acknowledged: marked })
    }
    const acknowledge = /^\/v1\/bill-reminders\/inbox\/([^/]+)\/acknowledge$/.exec(path)
    if (acknowledge && method === 'POST') {
      inbox = inbox.map((item) =>
        item.id === acknowledge[1] ? { ...item, acknowledgedAt: new Date().toISOString() } : item,
      )
      return json(204)
    }
    if (path === '/v1/bill-reminders/inbox') {
      if (countStatus !== 200) return json(countStatus, { status: countStatus })
      return json(
        200,
        inbox.map((item) => ({ ...item, read: item.acknowledgedAt !== null })),
      )
    }
    return json(404, { type: 'https://api.fawtir.om/problems/resource-not-found', status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  notesStore.reset()
  await i18n.changeLanguage('en')
})

async function renderShell() {
  render(
    <MemoryRouter initialEntries={['/expenditure/bills']}>
      <Routes>
        <Route
          path="/expenditure/bills"
          element={
            <AppShell>
              <p>the bills page</p>
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText('the bills page')
}

const nav = () => screen.getByRole('navigation')
const billsEntry = () => within(nav()).getByRole('link', { name: /^Bills/ })
const billsCount = () => billsEntry().querySelector('[data-nav-count]')
const bell = () => screen.getByRole('button', { name: /^Notifications/ })
const bellCount = () => bell().querySelector('span')?.textContent ?? null

describe('the count on the Bills entry of the sidebar', () => {
  it('shows the unread bill reminders, the same number as the bell, from one request', async () => {
    await renderShell()
    await waitFor(() => expect(billsCount()?.textContent).toBe('3'))
    expect(bellCount()).toBe('3')
    // Spoken in full; the figure itself is not read out a second time.
    expect(billsEntry().getAttribute('aria-label') ?? billsEntry().textContent).toMatch(
      /Bills.*Bill reminders, 3 unread/,
    )
    expect(billsCount()?.getAttribute('aria-hidden')).toBe('true')
    // The other entries of the group carry none.
    expect(within(nav()).getByRole('link', { name: 'Payments' }).textContent).toBe('Payments')
    expect(within(nav()).getByRole('link', { name: 'Reminders' }).textContent).toBe('Reminders')
    // One read of the count for the bell and the entry together.
    expect(countReads()).toBe(1)
  })

  it('wears the badge the sidebar already draws on its other entries', async () => {
    await renderShell()
    await waitFor(() => expect(billsCount()).not.toBeNull())
    // "TDD & OTA" carries the sidebar's own count: the same classes, nothing new.
    const existing = within(nav())
      .getByRole('link', { name: /TDD/ })
      .querySelector('span.rounded-full')!
    expect(billsCount()!.className).toBe(existing.className)
  })

  it('shows nothing when there is nothing unread', async () => {
    inbox = []
    await renderShell()
    await waitFor(() => expect(countReads()).toBe(1))
    await waitFor(() => expect(billsEntry().textContent).toBe('Bills'))
    expect(billsCount()).toBeNull()
    expect(bellCount()).toBeNull()
  })

  it('shows nothing when the count cannot be read', async () => {
    countStatus = 500
    await renderShell()
    await waitFor(() => expect(countReads()).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(billsCount()).toBeNull()
    expect(billsEntry().textContent).toBe('Bills')
  })

  it('shows nothing, and asks nothing, for someone who may not read bills', async () => {
    entitlements = { ...READER, permissions: ['reports.read'] }
    await renderShell()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(within(nav()).queryByRole('link', { name: /^Bills/ })).toBeNull()
    expect(nav().querySelector('[data-nav-count]')).toBeNull()
    expect(countReads()).toBe(0)
  })

  it('holds one figure, as the bell does', async () => {
    unreadBeyondTheList = 9
    await renderShell()
    await waitFor(() => expect(billsCount()?.textContent).toBe('9+'))
    expect(bellCount()).toBe('9+')
    expect(billsEntry().textContent).toContain('Bill reminders, 12 unread')
  })

  it('goes down with the bell when a line is read, and away when all are', async () => {
    await renderShell()
    await waitFor(() => expect(billsCount()?.textContent).toBe('3'))

    fireEvent.click(bell())
    const panel = await screen.findByRole('dialog', { name: 'Notifications' })
    const first = (await within(panel).findAllByRole('listitem'))[0]
    fireEvent.click(first)
    await waitFor(() => expect(billsCount()?.textContent).toBe('2'))
    expect(bellCount()).toBe('2')

    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(billsCount()).toBeNull())
    expect(bellCount()).toBeNull()
    // And it stays away once the server has been asked again.
    await waitFor(() =>
      expect(calls.some((call) => call.path === '/v1/bill-reminders/inbox/acknowledge-all')).toBe(
        true,
      ),
    )
    await waitFor(() => expect(countReads()).toBeGreaterThan(1))
    expect(billsCount()).toBeNull()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(
      <MemoryRouter initialEntries={['/expenditure/bills']}>
        <Routes>
          <Route
            path="/expenditure/bills"
            element={
              <AppShell>
                <p>the bills page</p>
              </AppShell>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('the bills page')
    // The entry's own label, read from the locale: the sidebar's wording is not this test's to fix.
    const label = i18n.t('dashboard.nav.expenditureChildren.bills')
    expect(label).not.toContain('dashboard.')
    const named = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    const entry = () => within(nav()).getByRole('link', { name: named })
    await waitFor(() => expect(entry().querySelector('[data-nav-count]')?.textContent).toBe('3'))
    expect(entry().textContent).toContain('تذكيرات الفواتير، 3 غير مقروءة')
    expect(entry().textContent ?? '').not.toMatch(/dashboard\.|unread/)
  })
})
