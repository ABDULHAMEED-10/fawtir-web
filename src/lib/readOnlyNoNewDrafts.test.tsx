import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import { forgetEntitlements, type Entitlements } from './identity/entitlements'
import { forgetSubscriptionStanding } from './subscriptionReadOnly'
import { resetSharedRequests } from '../api'
import { SessionContext } from './session/session'
import { Topbar } from '../layouts/AppShell/Topbar'
import { ActivityEmptyState } from '../pages/ActivityPage/ActivityEmptyState'
import { CreditNotesPage } from '../pages/CreditNotesPage/CreditNotesPage'
import { DebitNotesPage } from '../pages/DebitNotesPage/DebitNotesPage'
import { SelfBillingPage } from '../pages/SelfBillingPage/SelfBillingPage'
import { PeriodicInvoicesPage } from '../pages/PeriodicInvoicesPage/PeriodicInvoicesPage'

/**
 * Owner rule, 23 Oct 2026 (ST-2, CA-3): a read-only subscription makes no new drafts. Every link
 * that starts one (a new invoice, credit or debit note, self-billed invoice or periodic invoice) is
 * hidden, not greyed, while the server reports a restriction; with the switch off nothing hides.
 */
const OWNER = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'tenant.plan.read',
    'invoice.read',
    'invoice.draft',
    'invoice.export',
    'creditnote.read',
    'creditnote.create',
    'debitnote.read',
    'debitnote.create',
    'selfbilling.read',
    'selfbilling.create',
  ],
  scopes: [],
  featureFlags: {},
} as Entitlements

const standing = (restrictionsEnforced: boolean, restriction: string | null) => ({
  tracked: true,
  access: restriction ? 'PAYMENT_REQUIRED' : 'ACTIVE',
  restrictionsEnforced,
  restriction,
  today: '2026-10-23',
  planCode: 'BUSINESS_PLUS',
  planName: 'Business Plus',
  billingCycle: 'MONTHLY',
  periodPrice: '80.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-10-14',
  renewsOn: '2026-10-15',
  graceDays: 7,
  graceUntil: '2026-10-21',
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
  enterprise: null,
})

let subscription: unknown
let fetchMock: ReturnType<typeof vi.fn>

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  subscription = standing(true, null)
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, OWNER)
    if (url === '/api/v1/settings/subscription') return json(200, subscription)
    return json(404, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const subscriptionRead = () =>
  fetchMock.mock.calls.some(([url]) => url === '/api/v1/settings/subscription')

const linksTo = (href: string) =>
  screen.queryAllByRole('link').filter((link) => link.getAttribute('href') === href)

const entryPoints: Array<[string, () => ReactElement, string, string]> = [
  // These two are drawn inside the shell, which provides the session.
  [
    'the top bar',
    () => (
      <SessionContext.Provider value={OWNER}>
        <Topbar />
      </SessionContext.Provider>
    ),
    '/dashboard',
    '/invoices/new',
  ],
  [
    'Activity before the first invoice',
    () => (
      <SessionContext.Provider value={OWNER}>
        <ActivityEmptyState />
      </SessionContext.Provider>
    ),
    '/activity',
    '/invoices/new',
  ],
  ['Credit notes', () => <CreditNotesPage />, '/income/credit-notes', '/income/credit-notes/new'],
  ['Debit notes', () => <DebitNotesPage />, '/income/debit-notes', '/income/debit-notes/new'],
  [
    'Self-billing',
    () => <SelfBillingPage />,
    '/expenditure/self-billing',
    '/expenditure/self-billing/new',
  ],
  ['Periodic invoices', () => <PeriodicInvoicesPage />, '/income/periodic', '/income/periodic/new'],
]

function renderAt(page: () => ReactElement, path: string) {
  return render(<MemoryRouter initialEntries={[path]}>{page()}</MemoryRouter>)
}

describe.each(entryPoints)('%s', (_, page, path, href) => {
  it(`offers ${href} while the subscription is usable`, async () => {
    renderAt(page, path)
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    await waitFor(() => expect(linksTo(href).length).toBeGreaterThan(0))
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    `hides ${href} while %s`,
    async (restriction) => {
      subscription = standing(true, restriction)
      renderAt(page, path)
      await waitFor(() => expect(subscriptionRead()).toBe(true))
      // Let the page settle with the answer, then check nothing starts a new draft.
      await new Promise((resolve) => setTimeout(resolve, 50))
      await waitFor(() => expect(linksTo(href)).toHaveLength(0))
    },
  )

  it(`offers ${href} with the backend switch off`, async () => {
    subscription = standing(false, null)
    renderAt(page, path)
    await waitFor(() => expect(subscriptionRead()).toBe(true))
    await waitFor(() => expect(linksTo(href).length).toBeGreaterThan(0))
  })
})
