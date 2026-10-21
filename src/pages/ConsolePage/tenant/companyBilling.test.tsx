import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import en from '../../../i18n/locales/en.json'
import ar from '../../../i18n/locales/ar.json'
import { ApiError, resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { describePayLinkFailure } from '../../../lib/console/payLinks'
import type { TenantOverview } from '../../../lib/console/tenantOverview'
import { CompanyBillingCard } from './CompanyBillingCard'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const TENANT = '11111111-1111-4111-8111-111111111111'
const COMPANY = `/api/v1/platform/companies/${TENANT}`
const SUBSCRIPTION = `${COMPANY}/subscription`
const BILLS = `${COMPANY}/bills?limit=25`
const TERMS = `${COMPANY}/enterprise-terms`
const PLANS = '/api/v1/platform/plans'
const PAY_LINK_SETTINGS = '/api/v1/platform/billing/pay-link-settings'
const BILL_ID = 'b0000000-0000-4000-8000-000000000001'
const LINKS = `/api/v1/platform/billing/bills/${BILL_ID}/pay-links`

const ADMIN: Entitlements = {
  userId: 'u-admin',
  username: 'tenant.admin',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform', systemRole: true }],
  permissions: ['platform.billing.read', 'platform.billing.manage', 'platform.plans.read'],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = { ...ADMIN, permissions: ['platform.billing.read'] }

const OVERVIEW = {
  identity: {
    tenantId: TENANT,
    tenantCode: 'FT1111',
    tenantName: 'Sur Marine',
    tenantStatus: 'ACTIVE',
    identityStatus: 'READY',
  },
  company: {
    legalName: 'Sur Marine LLC',
    legalNameAr: null,
    tradingName: null,
    commercialRegistrationNumber: null,
    taxNumber: null,
    country: 'OM',
    registeredAddressLine1: null,
    registeredAddressLine2: null,
    registeredAddressLine3: null,
    registeredCity: null,
    registeredPostalCode: null,
    registeredCountrySubdivision: null,
    registeredPoBox: null,
    timezone: null,
    contactPersonName: 'Aisha',
    contactPhone: '+96899112233',
    contactEmail: 'accounts@sur.test',
  },
  verification: {
    status: 'VERIFIED',
    method: null,
    rejectionReason: null,
    attestationReference: null,
    evidenceRecorded: false,
    profileRevision: 1,
    submittedAt: null,
    submittedBy: null,
    decidedAt: null,
    decidedBy: null,
  },
  subscription: {
    planCode: 'STARTER',
    planName: 'Starter',
    monthlyPrice: '35.000',
    invoicesPerMonth: 200,
    overageEnabled: false,
    implicitDefault: true,
    startedOn: null,
    changedAt: null,
  },
  operational: { ready: true, reasonCode: null },
} as unknown as TenantOverview

function subscription(tracked: boolean) {
  return {
    status: {
      tracked,
      access: tracked ? 'PAYMENT_REQUIRED' : 'NOT_TRACKED',
      restrictionsEnforced: false,
      today: '2026-10-17',
      planCode: 'STARTER',
      planName: 'Starter',
      billingCycle: tracked ? 'MONTHLY' : null,
      periodPrice: null,
      trialStartsOn: null,
      trialEndsOn: null,
      trialDay: null,
      trialDaysLeft: null,
      paidThrough: null,
      renewsOn: null,
      graceDays: 7,
      graceUntil: null,
      autoRenew: false,
      autoRenewAvailable: false,
      autoRenewChangedAt: null,
      cancelAtPeriodEnd: false,
      accessEndsOn: null,
      scheduledChange: null,
    },
    events: [],
  }
}

function bill(over: Record<string, unknown> = {}) {
  return {
    id: BILL_ID,
    number: 'FSB-2026-0042',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodStartsOn: '2026-10-17',
    periodEndsOn: '2026-11-16',
    subtotal: '80.000',
    vatRate: '0.00000',
    vatAmount: '0.000',
    total: '80.000',
    currency: 'OMR',
    status: 'OPEN',
    dueOn: '2026-10-24',
    issuedAt: '2026-10-17T06:00:00Z',
    version: 0,
    ...over,
  }
}

const PLAN = (code: string, name: string, monthly: string, annual: string) => ({
  code,
  nameEn: name,
  nameAr: null,
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: true,
  recommended: false,
  sortOrder: 1,
  annualFreeMonths: 2,
  trialDays: 14,
  trialDocuments: null,
  version: 1,
  features: [],
  currentVersion: {
    id: `v-${code}`,
    planCode: code,
    versionNumber: 1,
    effectiveFrom: '2026-10-01',
    monthlyPrice: monthly,
    annualPrice: annual,
    invoicesPerMonth: 1000,
    peopleIncluded: 5,
    extraPersonPrice: null,
    branchesIncluded: 2,
    extraBranchPrice: null,
    overagePricePerInvoice: null,
    apiAccess: false,
    prioritySupport: false,
    reason: null,
    createdBy: null,
    createdAt: '2026-10-01T00:00:00Z',
  },
})

function link(over: Record<string, unknown> = {}) {
  return {
    id: 'l-1',
    billId: BILL_ID,
    status: 'ACTIVE',
    channel: 'EMAIL',
    language: 'en',
    tokenHint: 'x9Qa',
    recipient: 'a***@sur.test',
    maskedEmail: 'a***@sur.test',
    maskedPhone: null,
    createdBy: 'u-admin',
    createdAt: '2026-10-17T07:00:00Z',
    sentAt: '2026-10-17T07:00:05Z',
    firstOpenedAt: null,
    openCount: 0,
    expiresAt: '2026-10-24T07:00:00Z',
    closedAt: null,
    closeReason: null,
    version: 3,
    ...over,
  }
}

function created(over: Record<string, unknown>) {
  return {
    link: link(),
    payLinkUrl: null,
    shareText: null,
    tokenShownOnce: false,
    emailSent: null,
    ...over,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const problem = (status: number, type: string) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${type}`,
    title: type,
    status,
    detail: 'English detail',
  })

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  who = ADMIN
  answers = {
    [SUBSCRIPTION]: () => json(200, subscription(true)),
    [BILLS]: () =>
      json(200, { items: [{ bill: bill(), kind: 'SUBSCRIPTION', lines: [] }], nextCursor: null }),
    [PAY_LINK_SETTINGS]: () =>
      json(200, {
        enabled: true,
        cardEnabled: true,
        validityDays: 7,
        maxValidityDays: 7,
        settingsVersion: 4,
      }),
    [LINKS]: () => json(200, []),
    [TERMS]: () =>
      json(200, {
        tenantId: TENANT,
        state: 'TERMS_NOT_SET',
        version: 0,
        plan: null,
        nextBill: null,
      }),
    [PLANS]: () =>
      json(200, [
        PLAN('STARTER', 'Starter', '35.000', '350.000'),
        PLAN('BUSINESS', 'Business', '80.000', '800.000'),
      ]),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const P = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`console.payLinks.${key}`, options)
const REASON = () => new RegExp(i18n.t('console.operators.reason.label'))

function renderCard(onStarted = vi.fn()) {
  render(
    <MemoryRouter>
      <CompanyBillingCard overview={OVERVIEW} onStarted={onStarted} />
    </MemoryRouter>,
  )
  return onStarted
}

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call
    ? {
        init: call[1] as RequestInit,
        body: call[1]?.body ? JSON.parse(String(call[1].body)) : undefined,
      }
    : null
}

async function card(title = P('title')) {
  return waitFor(() => {
    const section = screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
    expect(within(section).queryByRole('status', { name: '' })).toBeNull()
    expect(within(section).queryByText(P('loading'))).toBeNull()
    return within(section)
  })
}

describe('Console › Tenant › Start billing', () => {
  beforeEach(() => {
    answers[SUBSCRIPTION] = () => json(200, subscription(false))
    answers[BILLS] = () => json(200, { items: [], nextCursor: null })
  })

  it('starts a staff-created company on a plan and cycle, with the typed code and a reason', async () => {
    answers[`POST ${SUBSCRIPTION}/start`] = () =>
      json(200, {
        plan: { planCode: 'BUSINESS', planName: 'Business', billingCycle: 'ANNUAL' },
        subscription: subscription(true).status,
        bill: bill({ number: 'FSB-2026-0050' }),
      })
    const user = userEvent.setup({ delay: null })
    const onStarted = renderCard()

    const box = await card()
    expect(box.getByText(P('notBilled'))).toBeTruthy()
    await user.click(box.getByRole('button', { name: P('start.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: P('start.plan') }))
    await user.click(await screen.findByRole('option', { name: 'Business' }))
    await user.click(within(dialog).getByRole('button', { name: P('start.cycle') }))
    await user.click(await screen.findByRole('option', { name: P('start.cycleName.ANNUAL') }))
    // The server's price for that plan and cycle, never one worked out here.
    expect(within(dialog).getByText(P('start.quotePlan.ANNUAL'))).toBeTruthy()
    expect(within(dialog).getByText('800.000')).toBeTruthy()

    await user.type(within(dialog).getByRole('textbox', { name: REASON() }), 'Contract signed')
    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(P('start.confirmLabel', { code: 'FT1111' })),
      }),
      'FT11',
    )
    await user.click(within(dialog).getByRole('button', { name: P('start.confirm') }))
    expect(within(dialog).getByText(P('start.confirmMismatch', { code: 'FT1111' }))).toBeTruthy()
    expect(sent('POST', `${SUBSCRIPTION}/start`)).toBeNull()

    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(P('start.confirmLabel', { code: 'FT1111' })),
      }),
      '11',
    )
    await user.click(within(dialog).getByRole('button', { name: P('start.confirm') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('POST', `${SUBSCRIPTION}/start`)!.body).toEqual({
      planCode: 'BUSINESS',
      billingCycle: 'ANNUAL',
      reason: 'Contract signed',
    })
    expect(onStarted).toHaveBeenCalled()
    expect(await screen.findByText(/FSB-2026-0050/)).toBeTruthy()
  })

  it('bills an Enterprise company on its own plan, showing the terms quote and sending no plan', async () => {
    answers[TERMS] = () =>
      json(200, {
        tenantId: TENANT,
        state: 'TERMS_SET',
        version: 2,
        plan: { code: 'ENT-1111', nameEn: 'Sur Marine Enterprise', nameAr: null },
        nextBill: {
          billingCycle: 'ANNUAL',
          amountExclVat: '1200.000',
          vatRate: '0.05000',
          vatAmount: '60.000',
          amountInclVat: '1260.000',
          currency: 'OMR',
        },
      })
    answers[`POST ${SUBSCRIPTION}/start`] = () =>
      json(200, {
        plan: { planCode: 'ENT-1111', planName: 'Ent', billingCycle: 'ANNUAL' },
        subscription: subscription(true).status,
        bill: bill(),
      })
    const user = userEvent.setup({ delay: null })
    renderCard()

    await user.click((await card()).getByRole('button', { name: P('start.open') }))
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText(P('start.enterprisePlan', { plan: 'Sur Marine Enterprise' })),
    ).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: P('start.plan') })).toBeNull()
    expect(within(dialog).getByText('1260.000')).toBeTruthy()
    expect(within(dialog).getByText(P('start.quoteVat'))).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === PLANS)).toBe(false)

    await user.type(within(dialog).getByRole('textbox', { name: REASON() }), 'Terms agreed')
    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(P('start.confirmLabel', { code: 'FT1111' })),
      }),
      'FT1111',
    )
    await user.click(within(dialog).getByRole('button', { name: P('start.confirm') }))
    await waitFor(() => expect(sent('POST', `${SUBSCRIPTION}/start`)).not.toBeNull())
    expect(sent('POST', `${SUBSCRIPTION}/start`)!.body).toEqual({
      billingCycle: 'ANNUAL',
      reason: 'Terms agreed',
    })
  })

  it('says in words why the server refused, never its detail', async () => {
    answers[`POST ${SUBSCRIPTION}/start`] = () => problem(409, 'enterprise-terms-required')
    const user = userEvent.setup({ delay: null })
    renderCard()

    await user.click((await card()).getByRole('button', { name: P('start.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: P('start.plan') }))
    await user.click(await screen.findByRole('option', { name: 'Starter' }))
    await user.click(within(dialog).getByRole('button', { name: P('start.cycle') }))
    await user.click(await screen.findByRole('option', { name: P('start.cycleName.MONTHLY') }))
    await user.type(within(dialog).getByRole('textbox', { name: REASON() }), 'Go')
    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(P('start.confirmLabel', { code: 'FT1111' })),
      }),
      'FT1111',
    )
    await user.click(within(dialog).getByRole('button', { name: P('start.confirm') }))

    expect(await within(dialog).findByText(P('refusal.termsRequired'))).toBeTruthy()
    expect(within(dialog).queryByText('English detail')).toBeNull()
  })

  it('offers no Start billing before the company is verified', async () => {
    const unverified = {
      ...OVERVIEW,
      verification: { ...OVERVIEW.verification, status: 'PENDING_VERIFICATION' },
    } as TenantOverview
    render(
      <MemoryRouter>
        <CompanyBillingCard overview={unverified} onStarted={vi.fn()} />
      </MemoryRouter>,
    )
    const box = await card()
    expect(box.getByText(P('notBilledUnverified'))).toBeTruthy()
    expect(box.queryByRole('button', { name: P('start.open') })).toBeNull()
  })
})

describe('Console › Tenant › Payment links', () => {
  it('emails a link with an Idempotency-Key and shows it once', async () => {
    answers[`POST ${LINKS}`] = () =>
      json(
        200,
        created({
          link: link({ id: 'l-2', tokenHint: 'DEFG' }),
          payLinkUrl: 'https://app.fawtir.om/pay#abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
          shareText: 'Pay bill FSB-2026-0042: https://app.fawtir.om/pay#abc',
          emailSent: true,
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderCard()

    const box = await card()
    await user.click(box.getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    // Prefilled from the company contact.
    expect(
      (
        within(dialog).getByRole('textbox', {
          name: new RegExp(P('send.payerEmail')),
        }) as HTMLInputElement
      ).value,
    ).toBe('accounts@sur.test')
    expect(within(dialog).getByText(P('send.validity', { count: 7 }))).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.EMAIL') }))

    expect(await within(dialog).findByText(P('send.onlyOnce'))).toBeTruthy()
    expect(within(dialog).getByText(/app\.fawtir\.om\/pay#abcdef/)).toBeTruthy()
    const post = sent('POST', LINKS)!
    expect((post.init.headers as Record<string, string>)['Idempotency-Key']).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(post.body).toEqual({
      channel: 'EMAIL',
      language: 'en',
      payerName: 'Aisha',
      payerEmail: 'accounts@sur.test',
      payerPhone: '+96899112233',
    })
  })

  it('needs an email for Email and a phone for WhatsApp before sending', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <CompanyBillingCard
          overview={
            {
              ...OVERVIEW,
              company: { ...OVERVIEW.company, contactEmail: null, contactPhone: null },
            } as TenantOverview
          }
          onStarted={vi.fn()}
        />
      </MemoryRouter>,
    )
    await user.click((await card()).getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.EMAIL') }))
    expect(within(dialog).getByText(i18n.t('validation.required'))).toBeTruthy()
    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(P('send.channels.WHATSAPP.title')) }),
    )
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.WHATSAPP') }))
    expect(within(dialog).getByText(i18n.t('validation.required'))).toBeTruthy()
    expect(sent('POST', LINKS)).toBeNull()
  })

  it('opens the WhatsApp chat with the server message', async () => {
    answers[`POST ${LINKS}`] = () =>
      json(
        200,
        created({
          link: link({ id: 'l-3', channel: 'WHATSAPP', tokenHint: 'xtok' }),
          payLinkUrl: 'https://app.fawtir.om/pay#tok',
          shareText: 'Hello, pay here https://app.fawtir.om/pay#tok',
        }),
      )
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup({ delay: null })
    renderCard()
    await user.click((await card()).getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(P('send.channels.WHATSAPP.title')) }),
    )
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.WHATSAPP') }))
    await user.click(await within(dialog).findByRole('button', { name: P('send.openWhatsapp') }))
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/96899112233?text=${encodeURIComponent('Hello, pay here https://app.fawtir.om/pay#tok')}`,
      '_blank',
      'noopener,noreferrer',
    )
    open.mockRestore()
  })

  it('says the link was shown once when a replay comes back without it', async () => {
    answers[`POST ${LINKS}`] = () =>
      json(
        200,
        created({
          link: link({ id: 'l-2', channel: 'COPIED' }),
          payLinkUrl: null,
          shareText: null,
          tokenShownOnce: true,
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderCard()
    await user.click((await card()).getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(P('send.channels.COPIED.title')) }),
    )
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.COPIED') }))
    expect(await within(dialog).findByText(P('send.shownOnce'))).toBeTruthy()
  })

  it('words the link as a card-payment reminder, valid 7 days, with nothing to set (D9)', async () => {
    const user = userEvent.setup({ delay: null })
    renderCard()
    await user.click((await card()).getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(P('send.subtitle', { tenant: 'Sur Marine' }))).toBeTruthy()
    expect(within(dialog).getByText(P('send.validity', { count: 7 }))).toBeTruthy()
    // No validity to choose, and no QuickLink note while the server makes Fawtir links.
    expect(within(dialog).queryByRole('spinbutton')).toBeNull()
    expect(within(dialog).queryByText(P('send.quickLinkNote'))).toBeNull()
  })

  it("shows Paymob's own payment link when the server made a QuickLink", async () => {
    answers[PAY_LINK_SETTINGS] = () =>
      json(200, {
        enabled: true,
        cardEnabled: true,
        validityDays: 7,
        maxValidityDays: 7,
        settingsVersion: 4,
        paymobQuickLink: true,
      })
    answers[`POST ${LINKS}`] = () =>
      json(
        200,
        created({
          link: link({ id: 'l-3', channel: 'COPIED', tokenHint: 'QL01' }),
          payLinkUrl: 'https://oman.paymob.com/standalone/?ref=ql-1',
          shareText: 'Pay bill FSB-2026-0042: https://oman.paymob.com/standalone/?ref=ql-1',
          paymobQuickLink: true,
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderCard()
    await user.click((await card()).getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(P('send.quickLinkNote'))).toBeTruthy()
    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(P('send.channels.COPIED.title')) }),
    )
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.COPIED') }))
    expect(await within(dialog).findByText(P('send.quickLinkCreated'))).toBeTruthy()
    expect(within(dialog).getByText('https://oman.paymob.com/standalone/?ref=ql-1')).toBeTruthy()
    expect(within(dialog).getByText(P('send.onlyOnce'))).toBeTruthy()
  })

  it("lists a bill's links and revokes an active one with If-Match and a reason", async () => {
    answers[LINKS] = () =>
      json(200, [link(), link({ id: 'l-0', status: 'SUPERSEDED', tokenHint: 'old1', version: 1 })])
    answers[`POST /api/v1/platform/billing/pay-links/l-1/revocation`] = () =>
      json(200, link({ status: 'REVOKED' }))
    const user = userEvent.setup({ delay: null })
    renderCard()

    const box = await card()
    await user.click(box.getByRole('button', { name: P('links.show') }))
    expect(await box.findByText(P('links.status.ACTIVE'))).toBeTruthy()
    expect(box.getByText(P('links.status.SUPERSEDED'))).toBeTruthy()
    expect(box.getAllByText('a***@sur.test')).toHaveLength(2)
    // Only the active link can be revoked.
    expect(box.getAllByRole('button', { name: P('revoke.open') })).toHaveLength(1)
    await user.click(box.getByRole('button', { name: P('revoke.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByRole('textbox', { name: REASON() }),
      'Sent to the wrong person',
    )
    await user.click(within(dialog).getByRole('button', { name: P('revoke.confirm') }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const post = sent('POST', '/api/v1/platform/billing/pay-links/l-1/revocation')!
    expect((post.init.headers as Record<string, string>)['If-Match']).toBe('"3"')
    expect(post.body).toEqual({ reason: 'Sent to the wrong person' })
  })

  it('shows support the bills and links without any action', async () => {
    who = SUPPORT
    answers[LINKS] = () => json(200, [link()])
    const user = userEvent.setup({ delay: null })
    renderCard()
    const box = await card()
    expect(box.getByText(P('bill.number', { number: 'FSB-2026-0042' }))).toBeTruthy()
    expect(box.queryByRole('button', { name: P('send.open') })).toBeNull()
    expect(box.queryByRole('button', { name: P('raise.open') })).toBeNull()
    await user.click(box.getByRole('button', { name: P('links.show') }))
    expect(await box.findByText(P('links.status.ACTIVE'))).toBeTruthy()
    expect(box.queryByRole('button', { name: P('revoke.open') })).toBeNull()
  })

  it('requests nothing without platform.billing.read', async () => {
    who = { ...ADMIN, permissions: [] }
    renderCard()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(ENTITLEMENTS_URL, expect.anything()))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchMock.mock.calls.filter(([url]) => url !== ENTITLEMENTS_URL)).toHaveLength(0)
  })

  it('raises the next bill when nothing is open', async () => {
    answers[BILLS] = () =>
      json(200, {
        items: [{ bill: bill({ status: 'PAID' }), kind: 'SUBSCRIPTION', lines: [] }],
        nextCursor: null,
      })
    answers[`POST ${COMPANY}/bills`] = () => json(200, bill({ id: 'b2', number: 'FSB-2026-0043' }))
    const user = userEvent.setup({ delay: null })
    renderCard()
    const box = await card()
    expect(box.queryByRole('button', { name: P('send.open') })).toBeNull()
    await user.click(box.getByRole('button', { name: P('raise.open') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: P('raise.confirm') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('POST', `${COMPANY}/bills`)).not.toBeNull()
    expect(await screen.findByText(/FSB-2026-0043/)).toBeTruthy()
  })

  it('says when the email did not go, and the link stays usable', async () => {
    answers[`POST ${LINKS}`] = () =>
      json(
        200,
        created({
          link: link({ id: 'l-4' }),
          payLinkUrl: 'https://app.fawtir.om/pay#tok4',
          shareText: 'Pay https://app.fawtir.om/pay#tok4',
          emailSent: false,
        }),
      )
    const user = userEvent.setup({ delay: null })
    renderCard()
    await user.click((await card()).getAllByRole('button', { name: P('send.open') })[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: P('send.submit.EMAIL') }))
    expect(await within(dialog).findByText(P('send.emailNotSent'))).toBeTruthy()
    expect(within(dialog).getAllByText(/app\.fawtir\.om\/pay#tok4/).length).toBeGreaterThan(0)
  })

  it('words why the server closed a link, never its code', async () => {
    answers[LINKS] = () =>
      json(200, [
        link({
          id: 'l-0',
          status: 'SUPERSEDED',
          closedAt: '2026-10-17T08:00:00Z',
          closeReason: 'NEW_LINK',
        }),
        link({
          id: 'l-9',
          status: 'REVOKED',
          tokenHint: 'QL09',
          closedAt: '2026-10-17T08:00:00Z',
          closeReason: 'PAYMOB_LINK_REFUSED',
        }),
      ])
    const user = userEvent.setup({ delay: null })
    renderCard()
    const box = await card()
    await user.click(box.getByRole('button', { name: P('links.show') }))
    expect(await box.findByText(P('links.closeReason.NEW_LINK'))).toBeTruthy()
    expect(box.getByText(P('links.closeReason.PAYMOB_LINK_REFUSED'))).toBeTruthy()
    expect(box.queryByText('NEW_LINK')).toBeNull()
    expect(box.queryByText(/PAYMOB_LINK_REFUSED/)).toBeNull()
  })
})

describe('Console › Tenant › Billing card follows the server', () => {
  it('draws nothing, not even a loader, while the server has no payment links (404)', async () => {
    delete answers[PAY_LINK_SETTINGS]
    renderCard()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === PAY_LINK_SETTINGS)).toBe(true),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('heading', { name: P('title') })).toBeNull()
    expect(screen.queryByText(P('loading'))).toBeNull()
    expect(screen.queryByRole('button', { name: P('start.open') })).toBeNull()
    // Nothing else is asked of an older server.
    expect(fetchMock.mock.calls.some(([url]) => url === BILLS || url === SUBSCRIPTION)).toBe(false)
  })

  const SETTINGS = { cardEnabled: true, validityDays: 7, maxValidityDays: 7, settingsVersion: 4 }
  /** Bills and start billing stay; every payment-link part is gone, title included. */
  async function expectNoPayLinkParts() {
    const box = await card(P('titleBills'))
    expect(screen.queryByRole('heading', { name: P('title') })).toBeNull()
    expect(box.getByText(P('bill.number', { number: 'FSB-2026-0042' }))).toBeTruthy()
    expect(box.queryByRole('button', { name: P('send.open') })).toBeNull()
    expect(box.queryByRole('button', { name: P('links.show') })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === LINKS)).toBe(false)
  }

  it('offers no payment link while links are switched off at the server', async () => {
    answers[PAY_LINK_SETTINGS] = () =>
      json(200, { ...SETTINGS, enabled: false, cardEnabled: false })
    renderCard()
    await expectNoPayLinkParts()
  })

  it('reads a settings answer without `enabled` as links off', async () => {
    answers[PAY_LINK_SETTINGS] = () => json(200, SETTINGS)
    renderCard()
    await expectNoPayLinkParts()
  })

  it('reads anything but `enabled: true` as links off', async () => {
    answers[PAY_LINK_SETTINGS] = () => json(200, { ...SETTINGS, enabled: 'true' })
    renderCard()
    await expectNoPayLinkParts()
  })

  it('shows the payment-link parts while links are switched on', async () => {
    answers[PAY_LINK_SETTINGS] = () => json(200, { ...SETTINGS, enabled: true })
    renderCard()
    const box = await card(P('title'))
    expect(screen.queryByRole('heading', { name: P('titleBills') })).toBeNull()
    expect(box.getByRole('button', { name: P('send.open') })).toBeTruthy()
    expect(box.getByRole('button', { name: P('links.show') })).toBeTruthy()
  })

  it('draws nothing when the settings read fails', async () => {
    answers[PAY_LINK_SETTINGS] = () => json(500, { status: 500 })
    renderCard()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === PAY_LINK_SETTINGS)).toBe(true),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('heading', { name: P('title') })).toBeNull()
    expect(screen.queryByRole('heading', { name: P('titleBills') })).toBeNull()
    expect(screen.queryByRole('button', { name: P('send.open') })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === LINKS)).toBe(false)
  })
})

describe('Console › payment link refusals', () => {
  const CODES = [
    'subscription-state-conflict',
    'company-not-verified',
    'disconnected-from-fawtir',
    'enterprise-terms-required',
    'billing-not-configured',
    'subscription-change-blocked-by-payment',
    'subscription-not-tracked',
    'bill-not-payable',
    'bill-stale',
    'pay-link-state-conflict',
    'payment-method-unavailable',
  ]
  const lookup = (tree: unknown, key: string) =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)

  it.each(CODES)('words %s in English and Arabic', (code) => {
    const message = describePayLinkFailure(new ApiError({ status: 409, problemType: code }))
    expect(message.key.startsWith('console.payLinks.refusal.')).toBe(true)
    expect(typeof lookup(en, message.key)).toBe('string')
    expect(typeof lookup(ar, message.key)).toBe('string')
  })
})

describe('Console › Arabic names the subscription bill «مطالبة» on the billing card', () => {
  it.each(['title', 'titleBills', 'loading', 'noBills', 'bill.number'])('%s', (key) => {
    const text = i18n.t(`console.payLinks.${key}`, { lng: 'ar', number: 'FWT-SUB-2026-000001' })
    expect(text).not.toMatch(/فاتور|فواتير/)
    expect(text).toMatch(/مطالب/)
  })
})
