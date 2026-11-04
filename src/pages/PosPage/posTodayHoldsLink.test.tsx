import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosTodayPage } from './PosTodayPage'
import {
  forgetEntitlements,
  loadEntitlements,
  peekEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'
import { noteQueueSender, resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

// NOT RUN (batch 43, static only). PRV43-OFF L-5: the Today link to the offline holds, round 5 P3b.

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const person = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let signedIn: Entitlements

beforeEach(async () => {
  await i18n.changeLanguage('en')
  // A build that does not sign: the link must not depend on signing, since an unsigned queued sale
  // with a manual discount is held too.
  vi.stubEnv('VITE_POS_OFFLINE_SIGNING', 'off')
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(signedIn)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function today(permissions: string[]) {
  signedIn = person(permissions)
  // Loaded before the page renders, so its first render already has them: the till is ready, and the
  // heading drawn, before the entitlements answer otherwise, and until it lands every link reads as
  // not permitted, which would let the cashier case pass whatever the page does (PRV43-OFF2 N-8).
  await loadEntitlements()
  expect(peekEntitlements()?.permissions).toEqual(permissions)
  render(
    <MemoryRouter initialEntries={['/pos/today']}>
      <Routes>
        <Route path="/pos/today" element={<PosTodayPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: i18n.t('pos.today.title') })
}

const holdsLink = () => screen.queryByRole('link', { name: i18n.t('pos.offline.holds.link') })

describe('the offline holds link on Today, on a build that does not sign', () => {
  it('is there for whoever closes tills, and leads to the holds', async () => {
    await today(['pos.read', 'pos.sell', 'pos.close'])
    expect(holdsLink()?.getAttribute('href')).toBe('/pos/offline-holds')
  })

  it('is there for whoever manages tills', async () => {
    await today(['pos.read', 'pos.sell', 'pos.till.manage'])
    expect(holdsLink()?.getAttribute('href')).toBe('/pos/offline-holds')
  })

  it('is not there for a cashier who only sells', async () => {
    await today(['pos.read', 'pos.sell'])
    expect(holdsLink()).toBeNull()
  })
})
