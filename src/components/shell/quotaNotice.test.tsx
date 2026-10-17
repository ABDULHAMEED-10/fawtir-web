import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import type { Entitlements } from '../../lib/identity/entitlements'
import { notesStore } from '../../lib/notifications'
import { SessionContext } from '../../lib/session/session'
import { NotificationsBell } from './NotificationsBell'

/**
 * Business Rules AL-8 in the bell: the server's 80%, 90% and 100% allowance warning
 * (`allowance.warningPercent` on `GET /settings/plan`) as a line for whoever reads the plan, the
 * 100% one saying issuing stops and received documents are held, and a fresh line once extras
 * raise the allowance and it runs out again.
 */

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read'],
  scopes: [],
  featureFlags: {},
}

const ALLOWANCE = {
  periodStart: '2026-10-01', periodEnd: '2026-10-31', resetsOn: '2026-11-01', planDocuments: 1000,
  extraDocuments: 0, totalAllowance: 1000, issued: 700, resubmissions: 0, received: 120,
  receivedHidden: 0, used: 820, planUsed: 820, extraUsed: 0, left: 180, warningPercent: 80 as number | null,
  issuingAllowed: true, extrasExpireOn: '2026-10-31', byBranch: [],
}

let allowance: typeof ALLOWANCE
let planReads: number

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  notesStore.reset()
  window.localStorage.clear()
  allowance = { ...ALLOWANCE }
  planReads = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
      if (path === '/v1/settings/plan') {
        planReads += 1
        return json(200, {
          plan: { code: 'BUSINESS', name: 'Business', invoicesPerMonth: 1000, peopleIncluded: 5, branchesIncluded: 2 },
          usage: { period: { start: '2026-10-01', end: '2026-10-31', today: '2026-10-20' }, used: 820, resubmissions: 0, quota: 1000, raisedToday: 3 },
          activePeople: 1, openInvitations: 0, activeBranches: 1, allowance,
        })
      }
      if (path === '/v1/settings/subscription/notices') return json(200, [])
      return json(404, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  notesStore.reset()
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderBell(session: Entitlements = OWNER) {
  return render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={['/start']}>
        <NotificationsBell />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  )
}

const bell = () => screen.getByRole('button', { name: /^(Notifications|الإشعارات)/ })
const openPanel = async () => {
  fireEvent.click(bell())
  return screen.findByRole('dialog', { name: /Notifications|الإشعارات/ })
}

describe('AL-8: the allowance warning in the bell', () => {
  it('counts the 80% warning, words it, and says received documents count too', async () => {
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    const panel = await openPanel()
    const line = (await within(panel).findByText("You have used 80% of this period's documents.")).closest('li')!
    expect(line.textContent).toContain('820 of 1,000')
    expect(line.textContent).toContain('supplier documents you receive count too')
    fireEvent.click(within(line).getByRole('button', { name: 'Look at the plan' }))
    expect(screen.getByTestId('where').textContent).toBe('/settings/plan')
    await waitFor(() => expect(bell().textContent).toBe(''))
  })

  it('says at 100% that issuing stops and received documents are held until extras are bought', async () => {
    allowance = { ...ALLOWANCE, used: 1000, planUsed: 1000, left: 0, warningPercent: 100, issuingAllowed: false }
    renderBell()
    const panel = await openPanel()
    const line = (await within(panel).findByText("You have used all of this period's documents.")).closest('li')!
    expect(line.textContent).toContain(
      'Issuing has stopped, and the supplier documents you receive are held until extra documents are bought.',
    )
  })

  it('stays read on the next page, and comes back when extras run out again', async () => {
    const first = renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
    const panel = await openPanel()
    fireEvent.click(await within(panel).findByText("You have used 80% of this period's documents."))
    await waitFor(() => expect(bell().textContent).toBe(''))
    first.unmount()
    notesStore.reset()

    const second = renderBell()
    await waitFor(() => expect(planReads).toBeGreaterThan(1))
    expect(bell().textContent).toBe('')
    second.unmount()

    // 50 extras bought and used up: a new allowance, a new warning.
    allowance = { ...ALLOWANCE, extraDocuments: 50, totalAllowance: 1050, used: 1050, left: 0, warningPercent: 100 }
    notesStore.reset()
    renderBell()
    await waitFor(() => expect(bell().textContent).toBe('1'))
  })

  it('shows nothing below 80%, and asks nothing of someone who cannot read the plan', async () => {
    allowance = { ...ALLOWANCE, warningPercent: null }
    const view = renderBell()
    await waitFor(() => expect(planReads).toBe(1))
    expect(bell().textContent).toBe('')
    view.unmount()
    notesStore.reset()
    planReads = 0
    renderBell({ ...OWNER, permissions: [] })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(planReads).toBe(0)
  })

  it('is in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    renderBell()
    const panel = await openPanel()
    expect(await within(panel).findByText(i18n.t('quotaWarning.near.title', { percent: 80 }))).toBeTruthy()
    expect(i18n.t('quotaWarning.near.title')).not.toBe('quotaWarning.near.title')
  })
})
