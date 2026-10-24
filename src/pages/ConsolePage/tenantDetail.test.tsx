import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { TenantOverview } from '../../lib/console/tenantOverview'
import { TenantDetailPage } from './TenantDetailPage'
import { subscriptionsStore } from '../../lib/consoleSubscriptions'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OVERVIEW_URL = `/api/v1/platform/companies/${TENANT_ID}/overview`
/** A slug id, as the console's prototype screens still link with. */
const PROTOTYPE_ID = 'sur-trading'

const OPERATOR: Entitlements = {
  userId: 'u-1',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform',
      systemRole: true,
    },
  ],
  permissions: ['platform.tenants.manage'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}
const SUPPORT_ONLY: Entitlements = {
  ...OPERATOR,
  username: 'ops.support',
  permissions: ['platform.support'],
  scopes: ['platform.support'],
}

const OVERVIEW: TenantOverview = {
  identity: {
    tenantId: TENANT_ID,
    tenantCode: 'FT3GDWM54D',
    tenantName: 'Al Noor Bakery',
    tenantStatus: 'PENDING',
    identityStatus: 'READY',
  },
  company: {
    legalName: 'Al Noor Bakery LLC',
    legalNameAr: null,
    tradingName: 'Al Noor',
    commercialRegistrationNumber: '1234567',
    taxNumber: 'OM1100000001',
    country: 'OM',
    registeredAddressLine1: 'Way 2301',
    registeredAddressLine2: null,
    registeredAddressLine3: null,
    registeredCity: 'Sohar',
    registeredPostalCode: '311',
    registeredCountrySubdivision: null,
    registeredPoBox: null,
    timezone: 'Asia/Muscat',
    contactPersonName: 'Salim Al Hinai',
    contactPhone: '+96899000000',
    contactEmail: 'ops@alnoor.test',
  },
  verification: {
    status: 'PENDING_VERIFICATION',
    method: null,
    rejectionReason: null,
    attestationReference: null,
    evidenceRecorded: false,
    profileRevision: 2,
    submittedAt: '2026-09-12T05:10:00Z',
    submittedBy: 'u-registrant',
    decidedAt: null,
    decidedBy: null,
  },
  subscription: {
    planCode: 'STANDARD',
    planName: 'Standard',
    monthlyPrice: '39.000',
    invoicesPerMonth: 500,
    overageEnabled: false,
    implicitDefault: false,
    startedOn: '2026-09-01',
    changedAt: '2026-09-01T00:00:00Z',
  },
  operational: { ready: false, reasonCode: 'COMPANY_VERIFICATION_PENDING' },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler>) {
  fetchMock.mockImplementation(async (url: string) => {
    const handler = handlers[url]
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/tenants/:id" element={<TenantDetailPage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const ready = {
  [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
  [OVERVIEW_URL]: () => json(200, OVERVIEW),
}

beforeEach(async () => {
  // A test that ends while its overview read is still settling leaves the read in the shared
  // registry, and the next tests join it and wait out their timeout (see `inflight.ts`).
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Tenant detail — real backend data', () => {
  it('E01/E02 a real tenant id reads the overview and renders its identity', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)

    expect(await screen.findByRole('heading', { name: 'Al Noor Bakery' })).toBeTruthy()
    expect(callsTo(OVERVIEW_URL)).toHaveLength(1)
    expect(screen.getByText('FT3GDWM54D')).toBeTruthy()
  })

  it('E03 company fields come from the real contract', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })

    expect(screen.getByText('1234567')).toBeTruthy()
    expect(screen.getByText('Asia/Muscat')).toBeTruthy()
    expect(screen.getByText('ops@alnoor.test')).toBeTruthy()
    expect(screen.getByText(/Way 2301/)).toBeTruthy()
  })

  it('E04/E13 verification status renders and pending links to the verification queue', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })

    expect(screen.getByText('Waiting for review')).toBeTruthy()
    const review = screen.getByRole('link', { name: 'Review' })
    expect(review.getAttribute('href')).toBe(`/console/onboarding/${TENANT_ID}`)
  })

  it('E05/E06/E07 plan is priced and allowanced, never paid and never consumed', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })

    expect(screen.getByText('Standard')).toBeTruthy()
    // The price is drawn with the rial sign, so the words sit beside the figure, not in one node.
    expect(document.body.textContent).toMatch(/39\.000 a month, plan price/)
    expect(screen.getByText(/500 invoices a month included/)).toBeTruthy()

    const body = document.body.textContent ?? ''
    for (const forbidden of ['Revenue', 'MRR', 'Paid', 'Amount received', 'Settled']) {
      expect(body).not.toContain(forbidden)
    }
    // No consumption may appear: the contract does not carry it and it must not be derived.
    expect(body).not.toMatch(/\d+\s*of\s*500/)
    expect(body).not.toContain('remaining')
  })

  it('E08 readiness uses the evaluator semantics, not a health label', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })

    expect(screen.getByText('Not active')).toBeTruthy()
    expect(screen.getByText('Company verification is waiting for review')).toBeTruthy()
    expect(screen.queryByText('COMPANY_VERIFICATION_PENDING')).toBeNull()
    const body = document.body.textContent ?? ''
    for (const forbidden of ['Gone quiet', 'At risk', 'Filing health', 'Certificate', 'Ready to submit']) {
      expect(body).not.toContain(forbidden)
    }
  })

  it('an active account is not "ready to submit": invoicing shows the company\'s own prerequisites', async () => {
    answer({
      ...ready,
      [OVERVIEW_URL]: () =>
        json(200, {
          ...OVERVIEW,
          operational: { ready: true, reasonCode: 'READY' },
          invoicing: {
            ready: false,
            items: [
              { code: 'COMPANY_VERIFIED', status: 'DONE', owner: 'PLATFORM' },
              { code: 'PARTICIPANT_VERIFIED', status: 'AWAITING_PLATFORM', owner: 'PLATFORM' },
              { code: 'ACTIVE_BRANCH', status: 'ACTION_REQUIRED', owner: 'COMPANY' },
            ],
          },
        }),
    })
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('Cannot issue invoices yet')).toBeTruthy()
    const participant = screen.getByText(i18n.t('readiness.item.PARTICIPANT_VERIFIED')).closest('li')!
    expect(participant.textContent).toContain(i18n.t('readiness.awaitingFawtir'))
    const branch = screen.getByText(i18n.t('readiness.item.ACTIVE_BRANCH')).closest('li')!
    expect(branch.textContent).toContain(i18n.t('readiness.actionRequired'))
  })

  it('an older backend without invoicing says it is not reported rather than guessing', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })
    expect(screen.getByText('Not reported by this server')).toBeTruthy()
    expect(screen.queryByText('Can issue invoices')).toBeNull()
  })

  it('E14 no approval action is offered here', async () => {
    answer(ready)
    renderAt(`/console/tenants/${TENANT_ID}`)
    await screen.findByRole('heading', { name: 'Al Noor Bakery' })

    for (const action of ['Approve', 'Reject', 'Attest']) {
      expect(screen.queryByRole('button', { name: new RegExp(action, 'i') })).toBeNull()
    }
  })

  it('E09 shows a loading state before the tenant arrives', async () => {
    let release: (value: Response) => void = () => {}
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => new Promise<Response>((resolve) => (release = resolve)),
    })
    renderAt(`/console/tenants/${TENANT_ID}`)

    expect(await screen.findByText('Loading this tenant…')).toBeTruthy()
    release(json(200, OVERVIEW))
    expect(await screen.findByRole('heading', { name: 'Al Noor Bakery' })).toBeTruthy()
  })

  it('E10/E12/E16 a 404 is not found, and never falls back to sample data', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => json(404),
    })
    renderAt(`/console/tenants/${TENANT_ID}`)

    expect(await screen.findByRole('alert')).toBeTruthy()
    // An internal realm answers as 404 too; the client must not manufacture a page for it.
    expect(screen.queryByRole('heading', { name: 'Al Noor Bakery' })).toBeNull()
    expect(document.body.textContent).not.toContain('Sur Trading Co')
  })

  it('E11 a 403 keeps the failure notice rather than claiming the tenant is missing', async () => {
    answer({
      [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
      [OVERVIEW_URL]: () => json(403),
    })
    renderAt(`/console/tenants/${TENANT_ID}`)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(document.body.textContent).not.toContain('No tenant with that id')
  })

  it('E15 without platform.tenants.manage the overview is never requested', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, SUPPORT_ONLY) })
    renderAt(`/console/tenants/${TENANT_ID}`)

    await screen.findByText('ops.support')
    expect(callsTo(OVERVIEW_URL)).toHaveLength(0)
  })
})

describe('Tenant detail — subscription cards', () => {
  it('a real tenant shows its subscription from the platform routes to a billing reader', async () => {
    const BILLING_READER: Entitlements = {
      ...OPERATOR,
      permissions: ['platform.tenants.manage', 'platform.billing.read'],
    }
    answer({
      [ENTITLEMENTS_URL]: () => json(200, BILLING_READER),
      [OVERVIEW_URL]: () => json(200, OVERVIEW),
      [`/api/v1/platform/companies/${TENANT_ID}/subscription`]: () =>
        json(200, {
          status: {
            tracked: true, access: 'ACTIVE', restrictionsEnforced: false, today: '2026-10-16',
            planCode: 'STANDARD', planName: 'Standard', billingCycle: 'MONTHLY', periodPrice: '39.000',
            trialStartsOn: null, trialEndsOn: null, trialDay: null, trialDaysLeft: null,
            paidThrough: '2026-10-31', renewsOn: '2026-11-01', graceDays: 7, graceUntil: null,
            autoRenew: false, autoRenewAvailable: false, autoRenewChangedAt: null,
            cancelAtPeriodEnd: false, accessEndsOn: null, scheduledChange: null,
          },
          events: [],
        }),
      [`/api/v1/platform/companies/${TENANT_ID}/extra-documents`]: () => json(404, {}),
    })
    renderAt(`/console/tenants/${TENANT_ID}`)

    expect(
      await screen.findByRole('heading', { name: i18n.t('console.companySubscription.title') }),
    ).toBeTruthy()
    expect(
      await screen.findByText(i18n.t('console.companySubscription.access.ACTIVE')),
    ).toBeTruthy()
    // Not a reader of the plan catalogue: the counting override is never asked for.
    expect(callsTo(`/api/v1/platform/companies/${TENANT_ID}/received-document-counting`)).toHaveLength(0)
  })
})

describe('Tenant detail — deep-link regression', () => {
  const TABS: Array<[string, string]> = [
    ['', 'Subscription'],
    ['?tab=subscription', 'Subscription'],
    ['?tab=filing', 'Filing'],
  ]

  it.each(TABS)('prototype link "%s" selects the %s tab', async (query, tabLabel) => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt(`/console/tenants/${PROTOTYPE_ID}${query}`)

    const tab = await screen.findByRole('button', { name: tabLabel })
    expect(tab.getAttribute('aria-pressed')).toBe('true')
    // A slug never reaches the platform overview.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/overview'))).toHaveLength(0)
  })

  it('an old "?tab=erp" link falls back to Subscription: the fixture ERP tab is gone', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt(`/console/tenants/${PROTOTYPE_ID}?tab=erp`)

    const tab = await screen.findByRole('button', { name: 'Subscription' })
    expect(tab.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'ERP' })).toBeNull()
  })

  const ACTIONS = [
    'recordPayment',
    'sendLink',
    'activate',
    'changePlan',
    'suspend',
    'resume',
  ]

  // Fawtir cancels only for abuse or fraud with two operators (CA-7, CA-9), operator grants carry a
  // reason and an expiry (AL-11), and nothing is billed after the fact: the sample-data dialogs
  // that cancelled, granted or waived on a local ledger are gone, and their old links open nothing.
  it.each(['cancel', 'grantQuota', 'waiveOverage'])(
    'prototype link ?action=%s opens no dialog',
    async (action) => {
      answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
      renderAt(`/console/tenants/${PROTOTYPE_ID}?action=${action}`)

      await screen.findByRole('button', { name: 'Subscription' })
      expect(screen.queryByRole('dialog')).toBeNull()
    },
  )

  it.each(ACTIONS)('prototype link ?action=%s opens its dialog', async (action) => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt(`/console/tenants/${PROTOTYPE_ID}?action=${action}`)

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('prototype link ?action=recordPayment&invoice= carries the invoice through', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt(`/console/tenants/${PROTOTYPE_ID}?action=recordPayment&invoice=inv-1`)

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it.each([
    ['subscriptions', 'Subscriptions'],
    // The back link goes to the page the reader came from (owner, 24 Oct 2026).
    ['invoices', 'Subscription invoices'],
  ])('prototype link ?from=%s leads back to %s', async (from, crumb) => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt(`/console/tenants/${PROTOTYPE_ID}?from=${from}`)

    // The operator's sidebar may carry a link of the same name; the back link is the one outside it.
    const links = await screen.findAllByRole('link', { name: crumb })
    expect(links.filter((link) => link.closest('aside') === null)).toHaveLength(1)
  })

  it('an id that is neither a tenant nor a known prototype is not found', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    renderAt('/console/tenants/no-such-slug')

    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  // The desk onboards a tenant and navigates straight to it. The prototype ids are read from the
  // registry per render for this reason: a map built when the module loaded cannot contain a
  // tenant created after it, and answered "no tenant with that id" for the one just created.
  it('a tenant onboarded at the desk renders, rather than reporting itself missing', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    const { tenantId } = subscriptionsStore.onboard({
      tradingName: 'Wadi Shab Provisions',
      cr: '1234567',
      vat: 'OM1100000000',
      town: 'Muscat',
      businessType: 'trading',
      owner: { name: 'Probe', phone: '+968 9000 0000', email: 'probe@example.test' },
      plan: 'business',
      term: 'monthly',
      method: 'card',
    } as never)

    renderAt(`/console/tenants/${tenantId}`)

    expect(await screen.findByRole('heading', { name: /Wadi Shab Provisions/i })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
