import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import { resetSharedRequests } from '../api'
import type { SignupPaymentOptions, SignupStatusPlan } from '../lib/identity/onboarding'
import { saveOnboardingSession } from '../lib/identity/onboardingSession'
import type { SignupCataloguePlan } from '../lib/identity/signupPlans'
import type { OnboardingState } from '../lib/onboarding'
import { PaymentPage } from './PaymentPage'
import { PlansPage } from './PlansPage'

const AFTER_ADDRESS: OnboardingState = {
  businessSize: 'just-me',
  invoicingMethod: 'paper',
  usesPos: false,
  identity: {
    companyName: 'Al Noor Bakery LLC',
    crNumber: 'CR-99',
    vatin: 'OM1200000001',
    industrialClassification: '561001',
    accent: 'PURPLE',
    logoUrl: null,
  },
  address: {
    addressLine: 'Building 4',
    addressLine2: 'Falaj Al Qabail',
    addressLine3: 'Villa 12',
    postalCode: '322',
    poBox: '',
    city: 'Sohar',
    governorate: 'northBatinah',
    contactName: 'Salim',
    role: '',
    phone: '9123 4567',
    email: 'salim@example.test',
  },
  accountEmail: 'owner@alnoor.test',
}

const PLANS_URL = '/api/v1/auth/signup/plans'
const PLAN_URL = '/api/v1/auth/signup/plan'
const STATUS_URL = '/api/v1/auth/signup/status'
const PREFERENCE_URL = '/api/v1/auth/signup/payment-preference'
const OPTIONS_URL = '/api/v1/auth/signup/payment-options'

/** Every method available, with a confirmed account: what a configured server answers. */
const SERVER_OPTIONS: SignupPaymentOptions = {
  bankTransfer: true,
  bankTransferStatus: 'AVAILABLE',
  cash: true,
  card: true,
  beneficiary: {
    legalName: 'Fawtir Test LLC',
    bankName: 'Bank Muscat',
    iban: 'OM810180000001299123456',
    swiftCode: 'BMUSOMRX',
  },
}

const features = (on: string[], off: string[] = []) => [
  ...on.map((key) => ({ key, enabled: true })),
  ...off.map((key) => ({ key, enabled: false })),
]

// Figures deliberately unlike the launch catalogue in lib/plans.ts (35 / 80 / 150, 14-day trial,
// two months free), so a figure on screen can only have come from the server.
const STARTER: SignupCataloguePlan = {
  code: 'STARTER',
  nameEn: 'Starter',
  nameAr: 'المبتدئة',
  descriptionEn: 'For a kiosk that sells one thing well.',
  descriptionAr: 'لكشك يبيع شيئًا واحدًا جيدًا.',
  currency: 'OMR',
  priceVersionId: 'pv-starter-2',
  monthlyPrice: '41.250',
  annualPrice: '371.250',
  annualFreeMonths: 3,
  invoicesPerMonth: 240,
  peopleIncluded: 3,
  extraPersonPrice: '3.500',
  branchesIncluded: 1,
  extraBranchPrice: '9.000',
  overagePricePerInvoice: '0.175',
  apiAccess: false,
  prioritySupport: true,
  recommended: false,
  trialDays: 21,
  trialDocuments: 30,
  features: features(['peppol', 'invoices', 'pos', 'futureThing'], ['api']),
  sortOrder: 10,
}
const BUSINESS: SignupCataloguePlan = {
  ...STARTER,
  code: 'BUSINESS',
  nameEn: 'Business',
  nameAr: 'الأعمال',
  descriptionEn: null,
  descriptionAr: null,
  priceVersionId: 'pv-business-2',
  monthlyPrice: '92.000',
  annualPrice: '828.000',
  invoicesPerMonth: 1300,
  peopleIncluded: 6,
  recommended: true,
  features: features(['peppol', 'invoices', 'pos', 'approvals'], ['api']),
  sortOrder: 20,
}
const CATALOGUE = [STARTER, BUSINESS]

type Handler = (init: RequestInit) => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const noContent = () => new Response(null, { status: 204 })

/** Answers by URL; an array is a queue whose last answer repeats. Anything else is a 204. */
function answer(routes: Record<string, Handler | Handler[]>) {
  const withOptions: Record<string, Handler | Handler[]> = {
    [OPTIONS_URL]: () => json(200, SERVER_OPTIONS),
    ...routes,
  }
  const queues = Object.fromEntries(
    Object.entries(withOptions).map(([url, handler]) => [
      url,
      Array.isArray(handler) ? [...handler] : handler,
    ]),
  )
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) return noContent()
    return handler(init)
  })
}

const calls = () =>
  (fetchMock.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({
    url,
    method: init.method ?? 'GET',
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
  }))
const writes = () =>
  calls().filter(
    (call) => call.method !== 'GET' && call.url !== STATUS_URL && call.url !== OPTIONS_URL,
  )
const callsTo = (url: string) => calls().filter((call) => call.url === url)

function Probe() {
  const location = useLocation()
  return (
    <>
      <p data-testid="location">{location.pathname}</p>
      <pre data-testid="state">{JSON.stringify(location.state)}</pre>
    </>
  )
}

const stateNow = () =>
  JSON.parse(screen.getByTestId('state').textContent ?? '{}') as OnboardingState

function renderAt(pathname: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const text = () => document.body.textContent ?? ''

/** None of lib/plans.ts's launch prices, in either of the forms a card or table prints them. */
function expectNoLaunchPrices() {
  for (const launch of ['35', '80', '150', '35.000', '80.000', '150.000', '29.167', '66.667']) {
    expect(screen.queryByText(launch)).toBeNull()
  }
}

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  saveOnboardingSession({
    onboardingToken: 'so.token',
    onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  answer({ [PLANS_URL]: () => json(200, CATALOGUE) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openPlans(state: OnboardingState = AFTER_ADDRESS) {
  renderAt('/plans', state)
  await screen.findAllByRole('button', { name: i18n.t('plans.getStarted') })
}

describe('Choose a plan: the published catalogue', () => {
  it('draws every card from the server: names, descriptions, prices, limits and the trial', async () => {
    await openPlans()

    expect(callsTo(PLANS_URL)).toEqual([{ url: PLANS_URL, method: 'GET', body: undefined }])
    expect(screen.getByText('For a kiosk that sells one thing well.')).toBeTruthy()
    // No published description: the app's own audience line fills in, never a price.
    expect(screen.getByText(i18n.t('plan.audience.business'))).toBeTruthy()
    expect(screen.getAllByText('41.25').length).toBeGreaterThan(0)
    expect(screen.getAllByText('92').length).toBeGreaterThan(0)
    expect(screen.getAllByText('240').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,300').length).toBeGreaterThan(0)
    expect(text()).toContain(i18n.t('plans.trialNote', { days: 21, documents: 30 }))
    expectNoLaunchPrices()
    expect(text()).not.toContain(i18n.t('plans.trialNote', { days: 14, documents: 25 }))
  })

  it('marks the plan the server recommends as the popular one', async () => {
    answer({
      [PLANS_URL]: () =>
        json(200, [
          { ...STARTER, recommended: true },
          { ...BUSINESS, recommended: false },
        ]),
    })
    await openPlans()
    expect(screen.getAllByText(i18n.t('plans.mostPopular'))).toHaveLength(1)
    const badge = screen.getByText(i18n.t('plans.mostPopular'))
    // The badge sits on the Starter card, the one the server marked.
    expect(badge.parentElement?.parentElement?.textContent).toContain('Starter')
    expect(badge.parentElement?.parentElement?.textContent).not.toContain('Business')
  })

  it('prices the annual cycle from the published year and its free months', async () => {
    await openPlans()
    expect(screen.getByText(i18n.t('plans.saveAnnualMonths', { count: 3 }))).toBeTruthy()
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('tab', { name: i18n.t('plans.annual') }))
    // Owner, 9 Oct 2026: the annual cycle shows what the year costs (the published annual price),
    // never a monthly equivalent such as 30.938.
    expect(screen.getAllByText('371.25').length).toBeGreaterThan(0)
    expect(screen.getAllByText('828').length).toBeGreaterThan(0)
    expect(screen.queryByText('30.938')).toBeNull()
    expect(screen.getAllByText(i18n.t('plans.perYear')).length).toBeGreaterThan(0)
  })

  it('makes no trial promise when the catalogue offers no trial', async () => {
    answer({
      [PLANS_URL]: () =>
        json(
          200,
          CATALOGUE.map((plan) => ({ ...plan, trialDays: null, trialDocuments: null })),
        ),
    })
    await openPlans()
    expect(text()).not.toMatch(/-day free trial/)
    expect(text()).toContain(i18n.t('plans.payNote'))
  })

  it('reads in Arabic with the published Arabic names and descriptions', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/plans', AFTER_ADDRESS)
    expect(await screen.findByRole('heading', { level: 3, name: 'المبتدئة' })).toBeTruthy()
    expect(screen.getByText('لكشك يبيع شيئًا واحدًا جيدًا.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'الأعمال' })).toBeTruthy()
    expect(screen.queryByText('Starter')).toBeNull()
    expect(text()).toContain(i18n.t('plans.saveAnnualMonths', { count: 3 }))
  })

  it('shows a loading state, then on failure offers a retry and never the launch prices', async () => {
    answer({ [PLANS_URL]: [() => json(503, {}), () => json(200, CATALOGUE)] })
    renderAt('/plans', AFTER_ADDRESS)
    expect(screen.getByRole('status').textContent).toBe(i18n.t('plans.loading'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(i18n.t('plans.unavailable'))
    expect(screen.queryAllByRole('button', { name: i18n.t('plans.getStarted') })).toHaveLength(0)
    expectNoLaunchPrices()

    await userEvent
      .setup({ delay: null })
      .click(within(alert).getByRole('button', { name: i18n.t('plans.retry') }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Starter' })).toBeTruthy()
    expect(callsTo(PLANS_URL)).toHaveLength(2)
  })

  it('says so when no plan is offered, and still offers Enterprise', async () => {
    answer({ [PLANS_URL]: () => json(200, []) })
    renderAt('/plans', AFTER_ADDRESS)
    expect(await screen.findByText(i18n.t('plans.empty'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('plans.talkToTeam') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('plans.compare.open') })).toBeNull()
  })

  it('tells a registrant whose saved plan is withdrawn to choose another', async () => {
    await openPlans({ ...AFTER_ADDRESS, plan: 'businessPlus', billing: 'monthly' })
    expect(
      screen.getByText(
        i18n.t('plans.noLongerOffered', { plan: i18n.t('plans.businessPlus.name') }),
      ),
    ).toBeTruthy()
  })

  it('lists the catalogue features in the comparison and hides keys it has no name for', async () => {
    await openPlans()
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.compare.open') }))
    expect(
      screen.getByRole('rowheader', { name: i18n.t('plan.featureName.approvals') }),
    ).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: i18n.t('plan.featureName.pos') })).toBeTruthy()
    // Listed by no plan: not drawn from the launch matrix.
    expect(
      screen.queryByRole('rowheader', { name: i18n.t('plan.featureName.webhooks') }),
    ).toBeNull()
    expect(text()).not.toContain('futureThing')
    expect(text()).toContain(i18n.t('plans.compare.value.monthsFree', { count: 3 }))
  })
})

describe('Choose a plan: saving the choice', () => {
  it('reopens on the saved cycle when the history entry carries none (browser Back)', async () => {
    answer({
      [PLANS_URL]: () => json(200, CATALOGUE),
      [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: BUSINESS_ANNUAL }),
    })
    await openPlans()
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: i18n.t('plans.annual') }).getAttribute('aria-selected'),
      ).toBe('true'),
    )
  })

  it('sends the price version the card showed and carries the plan to "How you\'ll pay"', async () => {
    await openPlans()
    const [starter] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await userEvent.setup({ delay: null }).click(starter)

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    expect(writes()[0]).toEqual({
      url: PLAN_URL,
      method: 'POST',
      body: {
        onboardingToken: 'so.token',
        planCode: 'STARTER',
        billingCycle: 'MONTHLY',
        priceVersionId: 'pv-starter-2',
      },
    })
  })

  it('saves Business as BUSINESS with the annual cycle', async () => {
    await openPlans()
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('tab', { name: i18n.t('plans.annual') }))
    const [, business] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await user.click(business)

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    expect(writes()[0].body).toMatchObject({
      planCode: 'BUSINESS',
      billingCycle: 'ANNUAL',
      priceVersionId: 'pv-business-2',
    })
  })

  it('reloads the catalogue and asks for a review when the price changed meanwhile', async () => {
    answer({
      [PLANS_URL]: [
        () => json(200, CATALOGUE),
        () =>
          json(200, [
            { ...STARTER, monthlyPrice: '44.000', priceVersionId: 'pv-starter-3' },
            BUSINESS,
          ]),
      ],
      [PLAN_URL]: () =>
        json(409, {
          type: 'https://api.fawtir.om/problems/plan-price-changed',
          detail: 'English prose',
        }),
    })
    await openPlans()
    const statusReadsBefore = callsTo(STATUS_URL).length
    const [starter] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await userEvent.setup({ delay: null }).click(starter)

    expect(await screen.findByText(i18n.t('plans.priceChanged'))).toBeTruthy()
    expect((await screen.findAllByText('44')).length).toBeGreaterThan(0)
    expect(callsTo(PLANS_URL)).toHaveLength(2)
    // The 409 is not read as a missing earlier step, so it adds no status read of its own.
    expect(callsTo(STATUS_URL)).toHaveLength(statusReadsBefore)
    expect(screen.getByText(i18n.t('plans.title'))).toBeTruthy()
    expect(text()).not.toContain('English prose')
  })

  it('sends Enterprise straight to review with no billing cycle, price version or payment step', async () => {
    await openPlans()
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.talkToTeam') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(writes()).toEqual([
      {
        url: PLAN_URL,
        method: 'POST',
        body: { onboardingToken: 'so.token', planCode: 'ENTERPRISE', billingCycle: null },
      },
    ])
    expect(stateNow().plan).toBe('enterprise')
    expect(stateNow().paymentMethod).toBeUndefined()
    expect(stateNow().address?.city).toBe('Sohar')
  })

  it('carries a plan the app has no name for by its code, with the published names', async () => {
    answer({
      [PLANS_URL]: () =>
        json(200, [
          { ...STARTER, code: 'GROWTH', nameEn: 'Growth', nameAr: 'النمو', priceVersionId: 'pv-g' },
        ]),
    })
    renderAt('/plans', AFTER_ADDRESS)
    await screen.findByRole('heading', { level: 3, name: 'Growth' })
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.getStarted') }))

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    expect(writes()[0].body).toMatchObject({ planCode: 'GROWTH', priceVersionId: 'pv-g' })
    expect(screen.getAllByText('Growth').length).toBeGreaterThan(0)
  })

  it('stays on the plans when the plan cannot be saved', async () => {
    answer({ [PLANS_URL]: () => json(200, CATALOGUE), [PLAN_URL]: () => json(503, {}) })
    await openPlans()
    const [starter] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await userEvent.setup({ delay: null }).click(starter)

    expect(await screen.findByText(i18n.t('identityErrors.service'))).toBeTruthy()
    expect(screen.getByText(i18n.t('plans.title'))).toBeTruthy()
  })

  it('draws the comparison without a duplicate React key', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await openPlans()
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.compare.open') }))
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes('same key'))
    expect(keyWarnings).toEqual([])
  })
})

/** What the backend computes for Business, annual, at the owner's figures (catalogue contract). */
const BUSINESS_ANNUAL: SignupStatusPlan = {
  planCode: 'BUSINESS',
  billingCycle: 'ANNUAL',
  priceVersionId: 'pv-business-2',
  currency: 'OMR',
  monthlyPrice: '80.000',
  annualPrice: '800.000',
  amountExclVat: '800.000',
  vatRate: '0.05',
  vatAmount: '40.000',
  amountInclVat: '840.000',
  trialDays: 14,
}
const BUSINESS_MONTHLY: SignupStatusPlan = {
  ...BUSINESS_ANNUAL,
  billingCycle: 'MONTHLY',
  amountExclVat: '80.000',
  vatAmount: '4.000',
  amountInclVat: '84.000',
}

describe("How you'll pay", () => {
  const methodButton = (method: 'cardLink' | 'bankTransfer' | 'cash') =>
    screen.getByRole('button', { name: new RegExp(i18n.t(`payment.method.${method}.title`)) })
  const trialSwitch = () =>
    screen.getByRole('switch', { name: i18n.t('payment.trial.toggle', { count: 14 }) })
  const withTerms = (plan: SignupStatusPlan = BUSINESS_MONTHLY) =>
    answer({ [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan }) })

  it('preselects the saved method from the server over a stale history entry (browser Back)', async () => {
    answer({
      [STATUS_URL]: () =>
        json(200, {
          stage: 'READY_FOR_SUBMISSION',
          plan: BUSINESS_ANNUAL,
          paymentPreference: {
            enrollment: 'PAY_NOW',
            method: 'CASH',
            linkChannel: null,
            erpExtractionAddon: false,
          },
        }),
    })
    // The history entry from before the method was chosen carries none.
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'annual' })

    await waitFor(() => expect(methodButton('cash').getAttribute('aria-pressed')).toBe('true'))
    expect(trialSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('shows the free-trial toggle OFF by default, with the methods to choose from', async () => {
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })

    expect(await screen.findByText(i18n.t('payment.descriptionChoose'))).toBeTruthy()
    expect(trialSwitch().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(i18n.t('payment.trial.offHint'))).toBeTruthy()
    await waitFor(() => expect((methodButton('cash') as HTMLButtonElement).disabled).toBe(false))
    // No method is assumed: the registrant picks one.
    expect(methodButton('cash').getAttribute('aria-pressed')).toBe('false')
  })

  it('pay-now: charges nothing, saves PAY_NOW with cash, and continues to review', async () => {
    withTerms()
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'premium',
      billing: 'monthly',
      planTerms: BUSINESS_MONTHLY,
    })
    expect(await screen.findByText(i18n.t('payment.descriptionChoose'))).toBeTruthy()
    expect(text()).not.toMatch(/Pay .* & activate/)

    const user = userEvent.setup({ delay: null })
    await waitFor(() => expect((methodButton('cash') as HTMLButtonElement).disabled).toBe(false))
    await user.click(methodButton('cash'))
    expect(screen.getByText(i18n.t('payment.cash.noteLater', { when: i18n.t('payment.when.onApproval') }))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    // The figures always come from the server (never the tab's history): one status read, one write.
    expect(callsTo(STATUS_URL)).toHaveLength(1)
    expect(writes()).toEqual([
      {
        url: PREFERENCE_URL,
        method: 'POST',
        body: {
          onboardingToken: 'so.token',
          enrollment: 'PAY_NOW',
          method: 'CASH',
          erpExtractionAddon: false,
        },
      },
    ])
    expect(stateNow()).toMatchObject({
      plan: 'premium',
      billing: 'monthly',
      enrollment: 'payNow',
      paymentMethod: 'cash',
      planTerms: { amountInclVat: '84.000' },
    })
  })

  it('trial ON hides every payment method and saves TRIAL with no method', async () => {
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly', paymentMethod: 'cash' })
    const user = userEvent.setup({ delay: null })
    await user.click(await screen.findByRole('switch'))

    expect(trialSwitch().getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('button', { name: new RegExp(i18n.t('payment.method.cash.title')) })).toBeNull()
    expect(screen.queryByRole('button', { name: new RegExp(i18n.t('payment.method.cardLink.title')) })).toBeNull()
    expect(screen.getByText(i18n.t('payment.trial.note', { count: 14 }))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(writes()[0].body).toEqual({
      onboardingToken: 'so.token',
      enrollment: 'TRIAL',
      method: null,
      erpExtractionAddon: false,
    })
    expect(stateNow().enrollment).toBe('trial')
    expect(stateNow().paymentMethod).toBeUndefined()
  })

  it('trial OFF again brings the methods back', async () => {
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    const user = userEvent.setup({ delay: null })
    await user.click(await screen.findByRole('switch'))
    await user.click(trialSwitch())

    expect(trialSwitch().getAttribute('aria-checked')).toBe('false')
    expect(methodButton('cash')).toBeTruthy()
    expect(methodButton('bankTransfer')).toBeTruthy()
  })

  it('restores a saved TRIAL from the server with the toggle ON', async () => {
    answer({
      [STATUS_URL]: () =>
        json(200, {
          stage: 'READY_FOR_SUBMISSION',
          plan: BUSINESS_MONTHLY,
          paymentPreference: {
            enrollment: 'TRIAL',
            method: null,
            linkChannel: null,
            erpExtractionAddon: false,
          },
        }),
    })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    await waitFor(() => expect(trialSwitch().getAttribute('aria-checked')).toBe('true'))
    expect(screen.queryByRole('button', { name: new RegExp(i18n.t('payment.method.cash.title')) })).toBeNull()
  })

  it('offers no trial toggle on a plan without a trial', async () => {
    withTerms({ ...BUSINESS_MONTHLY, trialDays: null })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    expect(await screen.findByText(i18n.t('payment.descriptionNoTrial'))).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('asks for a method instead of saving a pay-now choice without one', async () => {
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    const user = userEvent.setup({ delay: null })
    await screen.findByRole('switch')
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: i18n.t('payment.continueCta') }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    )
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect(await screen.findByText(i18n.t('payment.methodRequired'))).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('asks for no payment-link channel: no email or WhatsApp choice anywhere', async () => {
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'businessPlus', billing: 'annual' })
    const user = userEvent.setup({ delay: null })
    await waitFor(() => expect((methodButton('cardLink') as HTMLButtonElement).disabled).toBe(false))
    await user.click(methodButton('cardLink'))

    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(text()).not.toMatch(/WhatsApp|Send the payment link|By email|valid 7 days/i)
    expect(screen.getByText(i18n.t('payment.cardLink.noteHosted'))).toBeTruthy()
    await user.click(screen.getByLabelText(i18n.t('payment.addon.label')))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(writes()[0].body).toEqual({
      onboardingToken: 'so.token',
      enrollment: 'PAY_NOW',
      method: 'CARD_LINK',
      erpExtractionAddon: true,
    })
  })

  it('shows the confirmed account, and the receipt and notes as disabled until the first bill', async () => {
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    const user = userEvent.setup({ delay: null })
    await waitFor(() =>
      expect((methodButton('bankTransfer') as HTMLButtonElement).disabled).toBe(false),
    )
    await user.click(methodButton('bankTransfer'))

    expect(screen.getByText(SERVER_OPTIONS.beneficiary!.iban)).toBeTruthy()
    expect(screen.getByText(SERVER_OPTIONS.beneficiary!.legalName)).toBeTruthy()
    expect(screen.getByText(i18n.t('payment.bank.afterApproval'))).toBeTruthy()
    // A receipt belongs to a bill, and bills exist only after approval: shown, never usable here.
    const receipt = screen.getByLabelText(i18n.t('payment.bank.receiptLabel')) as HTMLInputElement
    const notes = screen.getByLabelText(i18n.t('payment.bank.notesLabel')) as HTMLTextAreaElement
    expect(receipt.type).toBe('file')
    expect(receipt.matches(':disabled')).toBe(true)
    expect(notes.matches(':disabled')).toBe(true)
    expect(screen.getByText(i18n.t('payment.bank.evidenceLater'))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))
    expect(writes()[0].body).toEqual({
      onboardingToken: 'so.token',
      enrollment: 'PAY_NOW',
      method: 'BANK_TRANSFER',
      erpExtractionAddon: false,
    })
  })

  it('offers bank transfer as unavailable without a confirmed account, and shows none', async () => {
    withTerms()
    answer({
      [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: BUSINESS_MONTHLY }),
      [OPTIONS_URL]: () =>
        json(200, {
          ...SERVER_OPTIONS,
          bankTransfer: false,
          bankTransferStatus: 'NO_ACCOUNT',
          beneficiary: null,
        }),
    })
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'premium',
      billing: 'monthly',
      paymentMethod: 'bankTransfer',
      planTerms: BUSINESS_MONTHLY,
    })

    expect(await screen.findByText(i18n.t('payment.bank.unavailable'))).toBeTruthy()
    const bank = methodButton('bankTransfer')
    expect((bank as HTMLButtonElement).disabled).toBe(true)
    expect(text()).not.toMatch(/IBAN|OM55|Insight Technology/)
  })

  it('offers card as unavailable while Paymob is switched off', async () => {
    answer({
      [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: BUSINESS_MONTHLY }),
      [OPTIONS_URL]: () => json(200, { ...SERVER_OPTIONS, card: false }),
    })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })

    expect(await screen.findByText(i18n.t('payment.cardUnavailable'))).toBeTruthy()
    expect((methodButton('cardLink') as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers no method when the server cannot say which are available, but the trial still works', async () => {
    answer({
      [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: BUSINESS_MONTHLY }),
      [OPTIONS_URL]: () => json(500, {}),
    })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })

    expect(await screen.findByText(i18n.t('payment.optionsFailed'))).toBeTruthy()
    expect((methodButton('cash') as HTMLButtonElement).disabled).toBe(true)
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))
    expect(writes()[0].body).toMatchObject({ enrollment: 'TRIAL', method: null })
  })

  it('reads the trial toggle in Arabic', async () => {
    await i18n.changeLanguage('ar')
    withTerms()
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    const toggle = await screen.findByRole('switch')
    expect(toggle.getAttribute('aria-label')).toBe(i18n.t('payment.trial.toggle', { count: 14 }))
    expect(toggle.getAttribute('aria-label')).toMatch(/تجريبية/)
  })

  it('shows the server quote, never stale figures carried in the tab history (browser Back)', async () => {
    // The tab carries the older version's bill; the server has since pinned a newer price.
    const newer: SignupStatusPlan = {
      ...BUSINESS_ANNUAL,
      priceVersionId: 'v-newer',
      annualPrice: '810.000',
      amountExclVat: '810.000',
      vatAmount: '40.500',
      amountInclVat: '850.500',
    }
    answer({ [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: newer }) })
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'premium',
      billing: 'annual',
      planTerms: BUSINESS_ANNUAL,
    })

    expect(await screen.findByText('850.500')).toBeTruthy()
    expect(text()).not.toContain('840.000')
  })

  it('reads the server figures once when it arrives without them, and prints them as sent', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    answer({ [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: BUSINESS_ANNUAL }) })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'annual' })

    expect(await screen.findByText('840.000')).toBeTruthy()
    expect(text()).toContain('800.000')
    expect(text()).toContain('40.000')
    expect(text()).toContain(i18n.t('payment.summary.vatRate', { rate: '5' }))
    expect(text()).not.toContain('800.004')
    // 80.000 a month beside an 800.000 year: the summary names the 2 free months, not a bare 12.
    expect(text()).toContain(i18n.t('payment.summary.monthsWithFree', { count: 12, free: 2 }))
    expect(callsTo(STATUS_URL)).toEqual([
      { url: STATUS_URL, method: 'POST', body: { onboardingToken: 'so.token' } },
    ])
    expect(errors.mock.calls.filter((call) => String(call[0]).includes('same key'))).toEqual([])
  })

  it('shows the amounts as unavailable for an older server, and works out none itself', async () => {
    answer({
      [STATUS_URL]: () =>
        json(200, { stage: 'PAYMENT', plan: { planCode: 'BUSINESS', billingCycle: 'ANNUAL' } }),
    })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'annual' })

    expect((await screen.findAllByText(i18n.t('payment.summary.unavailable'))).length).toBe(3)
    expect(text()).not.toMatch(/840\.000|800\.000|40\.000/)
    expect(screen.getByText(i18n.t('payment.descriptionPending'))).toBeTruthy()
  })

  it('never shows figures the server computed for another plan or cycle', async () => {
    answer({ [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: BUSINESS_MONTHLY }) })
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'annual' })
    expect((await screen.findAllByText(i18n.t('payment.summary.unavailable'))).length).toBe(3)
    expect(text()).not.toContain('84.000')
  })

  it('keeps the add-on out of the server total and prices it on its own line', async () => {
    const plusAnnual: SignupStatusPlan = {
      ...BUSINESS_ANNUAL,
      planCode: 'BUSINESS_PLUS',
      amountExclVat: '1500.000',
      vatAmount: '75.000',
      amountInclVat: '1575.000',
    }
    answer({ [STATUS_URL]: () => json(200, { stage: 'PAYMENT', plan: plusAnnual }) })
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'businessPlus',
      billing: 'annual',
      planTerms: plusAnnual,
    })
    await userEvent
      .setup({ delay: null })
      .click(screen.getByLabelText(i18n.t('payment.addon.label')))

    expect(screen.getByText('1575.000')).toBeTruthy()
    expect(
      screen.getByText(
        i18n.t('payment.summary.addonOnTop', { cycle: i18n.t('payment.summary.annual') }),
      ),
    ).toBeTruthy()
  })

  it('does not draw the cash icon as the selected tick', () => {
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'premium',
      billing: 'monthly',
      planTerms: BUSINESS_MONTHLY,
    })
    const cash = methodButton('cash')
    expect(cash.getAttribute('aria-pressed')).toBe('false')
    expect(cash.querySelectorAll('img')).toHaveLength(1)
    expect(cash.querySelector('img')?.getAttribute('src')).not.toMatch(/tick/)
  })

  it('names a missing plan in words when the server refuses the preference', async () => {
    answer({
      [PREFERENCE_URL]: () =>
        json(409, { type: 'https://api.fawtir.om/problems/signup-plan-required' }),
    })
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'premium',
      billing: 'monthly',
      paymentMethod: 'cash',
      planTerms: BUSINESS_MONTHLY,
    })
    const user = userEvent.setup({ delay: null })
    await waitFor(() => expect((methodButton('cash') as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect(await screen.findByText(i18n.t('onboarding.planRequired'))).toBeTruthy()
    expect(writes()).toHaveLength(1)
  })

  it('offers the ERP extraction add-on where the console prices it, and carries the tick to review', async () => {
    renderAt('/payment', {
      ...AFTER_ADDRESS,
      plan: 'businessPlus',
      billing: 'monthly',
      paymentMethod: 'cash',
    })
    // The owner keeps the add-on (handbook section 6); what it says must still be true: no promise
    // to write anything back to the ERP, which the product does not do.
    expect(document.body.textContent).not.toMatch(/write.{0,10}back/i)
    const user = userEvent.setup({ delay: null })
    await waitFor(() => expect((methodButton('cash') as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('checkbox', { name: i18n.t('payment.addon.label') }))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))
    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(stateNow().addon).toBe(true)
    expect(writes()[0].body).toMatchObject({ erpExtractionAddon: true })
  })

  it('opened without a plan, goes to choose one first', async () => {
    answer({
      [STATUS_URL]: () => json(200, { stage: 'READY_FOR_SUBMISSION' }),
      [PLANS_URL]: () => json(200, CATALOGUE),
    })
    renderAt('/payment', AFTER_ADDRESS)
    expect(await screen.findByText(i18n.t('plans.title'))).toBeTruthy()
  })

  it('opened in a new tab, restores the saved plan, preference and amounts from the server', async () => {
    answer({
      [STATUS_URL]: () =>
        json(200, {
          stage: 'READY_FOR_SUBMISSION',
          plan: BUSINESS_ANNUAL,
          paymentPreference: {
            enrollment: 'PAY_NOW',
            method: 'CASH',
            linkChannel: null,
            erpExtractionAddon: false,
          },
          accountEmail: 'owner@alnoor.test',
          draft: {
            addressContact: {
              addressLine: 'Building 4',
              addressLine2: 'Falaj Al Qabail',
              addressLine3: 'Villa 12',
              postalCode: '322',
              city: 'Sohar',
              governorate: 'North Al Batinah',
              contactPersonName: 'Salim',
              contactPhone: '+96891234567',
              contactEmail: 'salim@example.test',
            },
          },
        }),
    })
    renderAt('/payment')

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    await waitFor(() => expect(methodButton('cash').getAttribute('aria-pressed')).toBe('true'))
    expect(await screen.findByText('840.000')).toBeTruthy()
    // The gate restores the choice; the amounts are read again so they are never carried figures.
    expect(callsTo(STATUS_URL)).toHaveLength(2)
  })
})
