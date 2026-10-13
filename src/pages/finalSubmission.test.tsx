import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import {
  hasEndedOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
  saveOnboardingSession,
} from '../lib/identity/onboardingSession'
import type { OnboardingState } from '../lib/onboarding'
import { SignupPendingPage } from './SignupPendingPage'
import { SignupReviewPage } from './SignupReviewPage'

const TOKEN = 'so.onboarding-token'

const COMPLETE: OnboardingState = {
  businessSize: '11-50',
  invoicingMethod: 'erp',
  businessType: 'food-beverage',
  subBusinessType: 'bakery',
  identity: {
    companyName: 'Al Noor Bakery LLC',
    crNumber: 'CR-99',
    vatin: 'OM1200000001',
    industrialClassification: '561001',
    accent: 'PURPLE',
    logoUrl: null,
  },
  address: {
    addressLine: 'Building 4, Way 2301',
    addressLine2: 'Falaj Al Qabail',
    addressLine3: 'Villa 12',
    postalCode: '322',
    poBox: '',
    city: 'Sohar',
    governorate: 'northBatinah',
    contactName: 'Salim Al Harthy',
    role: 'Owner',
    phone: '9123 4567',
    email: 'salim@example.test',
  },
  accountEmail: 'owner@alnoor.test',
  plan: 'premium',
  billing: 'annual',
  enrollment: 'payNow',
  paymentMethod: 'bankTransfer',
  // As `/signup/status` computed them from the pinned price version (catalogue contract §10).
  planTerms: {
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
  },
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const noContent = () => new Response(null, { status: 204 })
const conflict = () =>
  json(409, {
    type: 'https://api.fawtir.om/problems/resource-conflict',
    detail: 'This onboarding has already been submitted for review.',
  })
const status = (stage: string, extra: Record<string, unknown> = {}) =>
  json(200, {
    stage,
    businessProfileComplete: true,
    businessCategoryComplete: true,
    businessTypeComplete: true,
    businessIdentityComplete: true,
    addressContactComplete: true,
    submitted: stage === 'UNDER_REVIEW' || stage === 'ACTIVATED',
    verificationStatus: 'PENDING_VERIFICATION',
    loginEnabled: stage === 'ACTIVATED',
    ...extra,
  })

function Probe() {
  const location = useLocation()
  return (
    <>
      <p data-testid="location">{location.pathname}</p>
      <pre data-testid="state">{JSON.stringify(location.state)}</pre>
    </>
  )
}

function renderAt(pathname: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/signup-review" element={<SignupReviewPage />} />
        <Route path="/signup-pending" element={<SignupPendingPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const submit = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!
const valueOf = (labelKey: string) =>
  (screen.getByLabelText(i18n.t(labelKey)) as HTMLInputElement).value
const requests = () =>
  (fetchMock.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({
    url,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  saveOnboardingSession({
    onboardingToken: TOKEN,
    onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  fetchMock = vi.fn().mockResolvedValue(noContent())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Review and submit', () => {
  it('shows every saved answer, read-only, without a request', () => {
    renderAt('/signup-review', COMPLETE)

    expect(valueOf('signupReview.fields.size')).toBe(i18n.t('aboutBusiness.size.elevenToFifty'))
    expect(valueOf('signupReview.fields.invoicing')).toBe(i18n.t('aboutBusiness.invoicing.erp'))
    expect(valueOf('signupReview.fields.category')).toBe(
      i18n.t('businessType.options.foodBeverage'),
    )
    expect(valueOf('signupReview.fields.trade')).toBe(i18n.t('subBusinessType.options.bakery'))
    expect(valueOf('businessIdentity.companyNameLabel')).toBe('Al Noor Bakery LLC')
    expect(valueOf('signupReview.fields.activity')).toBe('561001 · Restaurants')
    expect(valueOf('businessIdentity.vatinLabel')).toBe('OM1200000001')
    expect(valueOf('businessIdentity.accentLabel')).toBe(i18n.t('businessIdentity.accents.PURPLE'))
    expect(valueOf('addressContact.governorate')).toBe(i18n.t('governorate.northBatinah'))
    expect(valueOf('addressContact.addressLine2')).toBe('Falaj Al Qabail')
    expect(valueOf('addressContact.addressLine3')).toBe('Villa 12')
    expect(valueOf('addressContact.postalCode')).toBe('322')
    expect(valueOf('addressContact.phone')).toBe('+96891234567')
    expect(screen.getByLabelText(i18n.t('addressContact.email')).hasAttribute('readonly')).toBe(
      true,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a ticked ERP add-on as requested, not as already added', () => {
    renderAt('/signup-review', { ...COMPLETE, addon: true })
    // The tick is not saved yet (TODO(backend), ONBOARDING.md row 1.3) and the Fawtir team confirms
    // it, so review must not read as though the add-on were already part of the account.
    expect(valueOf('payment.addon.title')).toBe(i18n.t('signupReview.addonValue'))
    expect(i18n.t('signupReview.addonValue')).toMatch(/requested/)
    // Review values sit in a one-line read-only field about 308px wide; the first wording ran to
    // 533px and was cut off at "the Fawtir te" in the browser check, on desktop and mobile alike.
    for (const lng of ['en', 'ar']) {
      expect(i18n.t('signupReview.addonValue', { lng }).length).toBeLessThanOrEqual(45)
    }
  })

  it('offers each section for editing with the answers carried along', async () => {
    renderAt('/signup-review', COMPLETE)
    const edits = screen.getAllByRole('link', { name: i18n.t('signupReview.edit') })
    expect(edits.map((link) => link.getAttribute('href'))).toEqual([
      '/about-business',
      '/business-identity',
      '/address-contact',
      '/payment',
    ])

    await userEvent.setup({ delay: null }).click(edits[2])
    expect(screen.getByTestId('location').textContent).toBe('/address-contact')
    expect(JSON.parse(screen.getByTestId('state').textContent ?? '{}').address.city).toBe('Sohar')
  })

  it('submits once, marks the tab submitted, and moves to the waiting screen with nothing forwarded', async () => {
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/final-submission', body: { onboardingToken: TOKEN } },
    ])
    expect(readOnboardingSession()?.submitted).toBe(true)
  })

  it('shows a free-trial choice as the trial with no payment, and the first bill after it', () => {
    renderAt('/signup-review', { ...COMPLETE, enrollment: 'trial', paymentMethod: undefined })
    expect(valueOf('signupReview.fields.payment')).toBe(
      i18n.t('signupReview.payment.trial', { count: 14 }),
    )
    expect(valueOf('signupReview.fields.firstBill')).toBe(
      i18n.t('signupReview.firstBillAfterTrial', { count: 14 }),
    )
  })

  it('treats a draft with a method but no trial-or-pay choice (pre-V287) as not chosen', async () => {
    renderAt('/signup-review', { ...COMPLETE, enrollment: undefined })
    expect(valueOf('signupReview.fields.payment')).toBe(i18n.t('signupReview.notChosen'))
    await userEvent.setup({ delay: null }).click(submit())
    expect(requests()).toEqual([])
  })

  it('shows the plan and payment, and the waiting screen names the account email', async () => {
    renderAt('/signup-review', COMPLETE)
    expect(valueOf('signupReview.fields.plan')).toBe(
      i18n.t('signupReview.planValue', {
        plan: i18n.t('plans.premium.name'),
        cycle: i18n.t('signupReview.billedAnnually'),
      }),
    )
    expect(valueOf('signupReview.fields.payment')).toBe(i18n.t('signupReview.payment.bankTransfer'))
    // Pay-now is paid with the application (V289); the subscription still starts only on activation.
    expect(valueOf('signupReview.fields.startsOn')).toBe(i18n.t('signupReview.startsOnActivation'))
    expect(valueOf('signupReview.fields.paidNow')).toBe('840.000')
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(screen.getByText('owner@alnoor.test').tagName).toBe('B')
    // In time order, the review under way (its marker carries the step's number).
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(steps).toEqual([
      i18n.t('fawtaraStatus.steps.sent'),
      '2' + i18n.t('fawtaraStatus.steps.review') + i18n.t('fawtaraStatus.steps.reviewing'),
      i18n.t('fawtaraStatus.steps.request'),
      i18n.t('fawtaraStatus.steps.accept'),
      i18n.t('fawtaraStatus.steps.register'),
      i18n.t('fawtaraStatus.steps.connected'),
    ])
    // The portal request comes after Fawtir's review, so it is not offered yet.
    expect(screen.queryByText(i18n.t('fawtaraStatus.openPortal'))).toBeNull()
  })

  it('says the amount and trial are not known when the server sent none, and works out neither', () => {
    const { planTerms: _terms, ...older } = COMPLETE
    void _terms
    // A trial whose length the server did not send.
    renderAt('/signup-review', { ...older, enrollment: 'trial', paymentMethod: undefined })
    expect(valueOf('signupReview.fields.firstBillAmount')).toBe(
      i18n.t('signupReview.amountUnavailable'),
    )
    expect(valueOf('signupReview.fields.firstBill')).toBe(i18n.t('signupReview.firstBillUnknown'))
    expect(document.body.textContent).not.toMatch(/840\.000|84\.000/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to submit without a plan and a way to pay, with no request', async () => {
    const { paymentMethod: _method, ...noPayment } = COMPLETE
    void _method
    renderAt('/signup-review', noPayment)
    expect(valueOf('signupReview.fields.payment')).toBe(i18n.t('signupReview.notChosen'))
    await userEvent.setup({ delay: null }).click(submit())

    expect(screen.getByText(i18n.t('signupReview.planMissing'))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('signupReview.choosePayment') }).getAttribute('href'),
    ).toBe('/payment')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('takes Enterprise without a payment step, its terms agreed on a call', async () => {
    const { paymentMethod: _method, ...rest } = COMPLETE
    void _method
    renderAt('/signup-review', { ...rest, plan: 'enterprise' })
    expect(valueOf('signupReview.fields.terms')).toBe(i18n.t('signupReview.enterpriseTerms'))
    await userEvent.setup({ delay: null }).click(submit())
    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtaraStatus.plan.enterprise'))).toBeTruthy()
  })

  it('sends one submission however often it is pressed', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    renderAt('/signup-review', COMPLETE)
    const form = submit().closest('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submit().disabled).toBe(true)
    expect(submit().textContent).toContain(i18n.t('signupReview.submitting'))
    await act(async () => answer(noContent()))
  })

  it('treats "already submitted" as the success it is', async () => {
    fetchMock
      .mockResolvedValueOnce(conflict())
      .mockImplementation(() => Promise.resolve(status('UNDER_REVIEW')))
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(readOnboardingSession()?.submitted).toBe(true)
    // The submission, the status that explained the conflict, and the waiting screen's own read.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports a VATIN or CR another business registered first, and stays editable', async () => {
    fetchMock
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(status('READY_FOR_SUBMISSION'))
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('signupReview.conflict'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('already been submitted')
    expect(submit().disabled).toBe(false)
  })

  it('goes back to a step the server reports missing', async () => {
    fetchMock.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(status('BUSINESS_IDENTITY'))
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect((await screen.findByTestId('location')).textContent).toBe('/business-identity')
  })

  it('reports an ended session in words that do not send the registrant back to signup', async () => {
    fetchMock.mockResolvedValue(
      json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
    )
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    const message = await screen.findByText(i18n.t('onboarding.sessionExpired'))
    expect(message.textContent).not.toMatch(/sign up again/i)
    expect(hasEndedOnboardingSession()).toBe(true)
  })

  it('opened in a new tab, shows the saved answers the status read returns', async () => {
    fetchMock.mockResolvedValue(
      status('READY_FOR_SUBMISSION', {
        planComplete: true,
        paymentPreferenceComplete: true,
        plan: { planCode: 'BUSINESS', billingCycle: 'ANNUAL' },
        paymentPreference: {
          enrollment: 'PAY_NOW',
          method: 'CARD_LINK',
          linkChannel: 'WHATSAPP',
          erpExtractionAddon: false,
        },
        accountEmail: 'owner@alnoor.test',
        draft: {
          businessProfile: {
            businessSize: 'PEOPLE_11_TO_50',
            invoicingMethod: 'FULL_ERP_SYSTEM',
            usesPos: true,
          },
          businessCategory: 'FOOD_AND_BEVERAGE',
          businessType: 'BAKERY',
          businessIdentity: {
            legalCompanyName: 'Al Noor Bakery LLC',
            commercialRegistrationNumber: 'CR-99',
            taxNumber: 'OM1200000001',
            industrialClassificationCode: '561001',
            invoiceAccent: 'PURPLE',
          },
          addressContact: {
            addressLine: 'Building 4, Way 2301',
            addressLine2: 'Falaj Al Qabail',
            addressLine3: 'Villa 12',
            postalCode: '322',
            poBox: null,
            city: 'Sohar',
            governorate: 'North Al Batinah',
            countryCode: 'OM',
            contactPersonName: 'Salim Al Harthy',
            contactRole: 'Owner',
            contactPhone: '+96891234567',
            contactEmail: 'salim@example.test',
          },
        },
      }),
    )
    renderAt('/signup-review')

    expect(await screen.findByText(i18n.t('signupReview.title'))).toBeTruthy()
    expect(document.body.textContent).not.toContain(i18n.t('signupReview.savedEarlier'))
    expect(valueOf('signupReview.fields.size')).toBe(i18n.t('aboutBusiness.size.elevenToFifty'))
    expect(valueOf('signupReview.fields.trade')).toBe(i18n.t('subBusinessType.options.bakery'))
    expect(valueOf('businessIdentity.vatinLabel')).toBe('OM1200000001')
    expect(valueOf('addressContact.governorate')).toBe(i18n.t('governorate.northBatinah'))
    expect(valueOf('addressContact.phone')).toBe('+96891234567')
    expect(valueOf('signupReview.fields.plan')).toBe(
      i18n.t('signupReview.planValue', {
        plan: i18n.t('plans.premium.name'),
        cycle: i18n.t('signupReview.billedAnnually'),
      }),
    )
    // A channel saved before the owner removed the link choice is not shown any more.
    expect(valueOf('signupReview.fields.payment')).toBe(i18n.t('signupReview.payment.card'))
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: TOKEN } },
    ])
  })

  it("reads the contract's shorter draft names as well", async () => {
    fetchMock.mockResolvedValue(
      status('READY_FOR_SUBMISSION', {
        draft: {
          businessIdentity: { legalName: 'Al Noor Bakery LLC', taxNumber: 'OM1200000001', accent: 'RED' },
          addressContact: { registeredAddressLine: 'Building 4', city: 'Sohar', governorate: 'Muscat' },
        },
      }),
    )
    renderAt('/signup-review')

    expect(await screen.findByText(i18n.t('signupReview.title'))).toBeTruthy()
    expect(valueOf('businessIdentity.companyNameLabel')).toBe('Al Noor Bakery LLC')
    expect(valueOf('businessIdentity.accentLabel')).toBe(i18n.t('businessIdentity.accents.RED'))
    expect(valueOf('addressContact.addressLine')).toBe('Building 4')
  })

  it('says "Saved earlier" only for what an older server does not return', async () => {
    fetchMock.mockResolvedValue(status('READY_FOR_SUBMISSION'))
    renderAt('/signup-review')

    expect(await screen.findByText(i18n.t('signupReview.title'))).toBeTruthy()
    expect(valueOf('businessIdentity.vatinLabel')).toBe(i18n.t('signupReview.savedEarlier'))
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: TOKEN } },
    ])
  })

  it.each([
    ['signup-plan-required', 'onboarding.planRequired'],
    ['signup-payment-preference-required', 'onboarding.paymentPreferenceRequired'],
  ])('names what the server says is missing (%s)', async (type, key) => {
    fetchMock.mockResolvedValue(json(409, { type: 'https://api.fawtir.om/problems/' + type }))
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t(key))).toBeTruthy()
    expect(requests()).toHaveLength(1)
    expect(readOnboardingSession()?.submitted).toBe(false)
  })

  it('is closed once this tab has submitted, and the waiting screen reads the real stage', async () => {
    markOnboardingSubmitted(true)
    fetchMock.mockResolvedValue(status('UNDER_REVIEW'))
    renderAt('/signup-review', COMPLETE)
    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: TOKEN } },
    ])
  })

  it('reads in Arabic, with no English server text', async () => {
    await i18n.changeLanguage('ar')
    fetchMock
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(status('READY_FOR_SUBMISSION'))
    renderAt('/signup-review', COMPLETE)
    expect(valueOf('addressContact.governorate')).toBe(i18n.t('governorate.northBatinah'))
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('signupReview.conflict'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('This onboarding has already been submitted')
  })
})

describe('Waiting screen', () => {
  it('straight from submitting: received, with no request', () => {
    renderAt('/signup-pending', { submitted: true })
    expect(screen.getByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtaraStatus.review.badge'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opened later with a live token: reads the status once and never polls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fetchMock.mockResolvedValue(status('UNDER_REVIEW'))
      renderAt('/signup-pending')
      expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
      await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an approval with the way to sign in', async () => {
    fetchMock.mockResolvedValue(status('ACTIVATED'))
    renderAt('/signup-pending')
    // Approved: the taxpayer's turn to send Fawtir the connection request on the portal.
    expect(await screen.findByText(i18n.t('fawtaraStatus.request.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtaraStatus.howTo.h4'))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('fawtaraStatus.openPortal') }).getAttribute('href'),
    ).toBe('https://tms.taxoman.gov.om/portal')

    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('signupPending.approved.signIn') }))
    expect(screen.getByTestId('location').textContent).toBe('/login')
  })

  it('under review, never says approved and offers no sign-in', async () => {
    fetchMock.mockResolvedValue(status('UNDER_REVIEW', { accountEmail: 'owner@alnoor.test' }))
    renderAt('/signup-pending')
    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('fawtaraStatus.steps.approved'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('signupPending.approved.signIn') })).toBeNull()
    // Named from the status read: this tab did not sign up (row 1.8).
    expect(screen.getByText('owner@alnoor.test').tagName).toBe('B')
  })

  it('shows a rejection that reopened the draft, with the way back to correct it', async () => {
    markOnboardingSubmitted(true)
    fetchMock.mockResolvedValue(status('READY_FOR_SUBMISSION', { verificationStatus: 'REJECTED' }))
    renderAt('/signup-pending')

    expect(await screen.findByText(i18n.t('fawtaraStatus.rejected.title'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('fawtaraStatus.request.title'))).toBeNull()
    expect(readOnboardingSession()?.submitted).toBe(false)
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('signupPending.rejected.correct') }))
    expect(await screen.findByText(i18n.t('signupReview.title'))).toBeTruthy()
  })

  it('shows a closed rejection without offering to edit', async () => {
    fetchMock.mockResolvedValue(status('REJECTED', { submitted: true, verificationStatus: 'REJECTED' }))
    renderAt('/signup-pending')
    expect(await screen.findByText(i18n.t('fawtaraStatus.rejected.title'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('signupPending.rejected.correct') })).toBeNull()
  })

  it('sends a draft that is not submitted back to where it stands', async () => {
    markOnboardingSubmitted(true)
    fetchMock.mockResolvedValue(status('READY_FOR_SUBMISSION'))
    sessionStorage.setItem(
      'fawtir.signup.onboarding.v1',
      JSON.stringify({
        onboardingToken: TOKEN,
        onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        submitted: false,
      }),
    )
    renderAt('/signup-pending')
    expect(await screen.findByText(i18n.t('signupReview.title'))).toBeTruthy()
    expect(readOnboardingSession()?.submitted).toBe(false)
  })

  it.each([
    ['no session at all', () => sessionStorage.clear()],
    [
      'an expired session',
      () =>
        saveOnboardingSession({
          onboardingToken: TOKEN,
          onboardingTokenExpiresAt: new Date(Date.now() - 1).toISOString(),
        }),
    ],
  ])(
    'with %s: explains the email decision, never "sign up again", with no request',
    (_label, arrange) => {
      arrange()
      renderAt('/signup-pending')
      expect(screen.getByText(i18n.t('signupPending.ended.title'))).toBeTruthy()
      expect(screen.getByRole('button', { name: i18n.t('signupResume.cta') })).toBeTruthy()
      expect(document.body.textContent).not.toMatch(/sign up again/i)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('treats a refused token as an ended session', async () => {
    fetchMock.mockResolvedValue(
      json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
    )
    renderAt('/signup-pending')
    expect(await screen.findByText(i18n.t('signupPending.ended.title'))).toBeTruthy()
    expect(hasEndedOnboardingSession()).toBe(true)
  })
})
