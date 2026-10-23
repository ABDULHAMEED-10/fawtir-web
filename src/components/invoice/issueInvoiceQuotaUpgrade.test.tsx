import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { SessionContext } from '../../lib/session/session'
import type { Entitlements } from '../../lib/identity/entitlements'
import { muscatToday } from '../../lib/invoiceIssue'
import { IssueInvoiceModal } from './IssueInvoiceModal'
import { answerStanding, settle, standingRead } from '../../testing/subscriptionStanding'

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions: ['invoice.read', 'invoice.issue', 'tenant.plan.read', 'tenant.plan.manage'],
  scopes: [],
  featureFlags: {},
}
const ISSUER: Entitlements = { ...OWNER, permissions: ['invoice.read', 'invoice.issue'] }

const PREVIEW = {
  currency: 'OMR',
  lines: [],
  totals: {
    subtotal: 10, itemLevelDiscount: 0, headerDiscount: 0, totalDiscount: 0, taxableAmount: 10,
    vatAmount: 0.5, totalAmount: 10.5,
  },
}

let selfService: boolean
let fetchMock: ReturnType<typeof vi.fn>

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  selfService = true
  fetchMock = vi.fn(async (url: string) => {
    const path = String(url).split('?')[0]
    if (path.endsWith('/preview')) return json(200, PREVIEW)
    if (path.endsWith('/issue')) {
      return json(409, {
        type: 'about:blank', title: 'Quota exceeded', status: 409, code: 'QUOTA_EXCEEDED', detail: 'No documents left',
      })
    }
    if (path === '/api/v1/settings/plan/changes') {
      return json(200, { available: selfService, pending: null, history: [] })
    }
    return json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function refuseAtZeroLeft(session: Entitlements, waitForStanding = false) {
  const user = userEvent.setup({ delay: null })
  const today = muscatToday()
  render(
    <MemoryRouter>
      <SessionContext.Provider value={session}>
        <IssueInvoiceModal
          invoiceId="d-1"
          version={1}
          initialIssueDate={today}
          initialDueDate={today}
          onClose={() => {}}
          onIssued={() => {}}
        />
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  if (waitForStanding) {
    await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
    await settle()
  }
  await user.click(screen.getByRole('button', { name: i18n.t('invoiceIssue.submit') }))
  expect(await screen.findByText(i18n.t('invoiceIssue.refused.quota'))).toBeTruthy()
}

describe('Issue refused at 0 documents left (Plan v4 §7.1)', () => {
  it('offers the upgrade beside "Buy extra documents" while self-service upgrades are on', async () => {
    await refuseAtZeroLeft(OWNER)
    const buy = screen.getByRole('link', { name: i18n.t('extraDocuments.entry') })
    expect(buy.getAttribute('href')).toBe('/settings/plan/extra-documents')
    const upgrade = await screen.findByRole('link', { name: i18n.t('planGate.seePlans') })
    expect(upgrade.getAttribute('href')).toBe('/settings/plan')
  })

  it('offers only "Buy extra documents" while upgrades go through the Fawtir team', async () => {
    selfService = false
    await refuseAtZeroLeft(OWNER)
    expect(screen.getByRole('link', { name: i18n.t('extraDocuments.entry') })).toBeTruthy()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/v1/settings/plan/changes')).toBe(true),
    )
    expect(screen.queryByRole('link', { name: i18n.t('planGate.seePlans') })).toBeNull()
  })

  it('offers neither to someone who may not manage the plan, and does not ask about the switch', async () => {
    await refuseAtZeroLeft(ISSUER)
    expect(screen.queryByRole('link', { name: i18n.t('extraDocuments.entry') })).toBeNull()
    expect(screen.queryByRole('link', { name: i18n.t('planGate.seePlans') })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/plan/changes'))).toBe(false)
  })
})

describe('Issue refused at 0 left while the subscription is read-only (ST-2, owner 23 Oct)', () => {
  it('offers the upgrade but not "Buy extra documents"', async () => {
    answerStanding(fetchMock, 'SUBSCRIPTION_SUSPENDED')
    await refuseAtZeroLeft(OWNER, true)
    expect(await screen.findByRole('link', { name: i18n.t('planGate.seePlans') })).toBeTruthy()
    expect(screen.queryByRole('link', { name: i18n.t('extraDocuments.entry') })).toBeNull()
  })
})
