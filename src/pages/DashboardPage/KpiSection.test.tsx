import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import type { Entitlements } from '../../lib/identity/entitlements'
import { SessionContext } from '../../lib/session/session'
import { DashboardHeader } from './KpiSection'

const SESSION: Entitlements = {
  userId: 'u-1',
  username: 'saji.khan',
  tenantId: 't-1',
  tenantName: 'Sohar Marine Supplies',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

// 09:00, 14:00 and 20:00 in Muscat (UTC+4), whatever zone the test machine runs in.
const MORNING = new Date('2026-10-08T05:00:00Z')
const AFTERNOON = new Date('2026-10-08T10:00:00Z')
const EVENING = new Date('2026-10-08T16:00:00Z')

function renderHeader(session: Entitlements | null, now: Date = MORNING) {
  return render(
    <SessionContext.Provider value={session}>
      <DashboardHeader now={now} />
    </SessionContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardHeader greeting', () => {
  it('greets the signed-in user, never the demo user', () => {
    renderHeader(SESSION)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, saji.khan')
    expect(document.body.textContent).not.toContain('Hafidh')
  })

  it('greets nobody by name before the session has answered', () => {
    renderHeader(null)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning')
  })

  it('follows the time of day in the business zone, not a fixed morning', () => {
    renderHeader(SESSION, AFTERNOON)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good afternoon, saji.khan')
  })

  it('says good evening in the evening', () => {
    renderHeader(null, EVENING)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening')
  })

  it('greets the person by their name when their record has one (E9)', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      new Response(
        JSON.stringify({ id: 'u-1', username: 'saji.khan', firstName: 'Sajid', lastName: 'Khan' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderHeader({ ...SESSION, permissions: ['admin.users.manage'] }, EVENING)
    // Not the username first and the name after: no name until the record has answered.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, Sajid Khan'),
    )
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/users/u-1')
  })

  it('falls back to the username when the record has no name or cannot be read (E9)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'u-1', username: 'saji.khan', firstName: null, lastName: ' ' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const { unmount } = renderHeader({ ...SESSION, permissions: ['branch.users.manage'] }, EVENING)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, saji.khan'),
    )
    unmount()

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    renderHeader({ ...SESSION, permissions: ['admin.users.manage'] }, EVENING)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, saji.khan'),
    )
  })

  it('asks for no record when the person may not read people, and uses the username', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHeader(SESSION, EVENING)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, saji.khan')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('greets in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderHeader(SESSION)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('صباح الخير، saji.khan')
  })
})
