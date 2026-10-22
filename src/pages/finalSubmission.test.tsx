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
import { withoutContactRead } from '../test/companyContact'

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
  // The waiting screen's support link reads Fawtir's contact details; kept out of these counts.
  vi.stubGlobal('fetch', withoutContactRead(fetchMock))
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
    // The add-on is billed with the first paid period on a bill of its own (backend #611), so
    // review must not read as though it were already part of the account.
    expect(valueOf('payment.addon.title')).toBe(i18n.t('signupReview.addonValue'))
    expect(i18n.t('signupReview.addonValue')).toMatch(/requested/)
    expect(i18n.t('signupReview.addonValue')).toMatch(/first paid period/)
    // Review values sit in a one-line read-only field about 308px wide; the first wording ran to
    // 533px and was cut off at "the Fawtir te" in the browser check, on desktop and mobile alike.
    for (const lng of ['en', 'ar']) {
      expect(i18n.t('signupReview.addonValue', { lng }).length).toBeLessThanOrEqual(45)
    }
  })

  it('says a tick kept as interest only is noted and not billed (erpAddonInterestOnly)', async () => {
    renderAt('/signup-review', { ...COMPLETE, addon: true, addonInterestOnly: true })
    expect(valueOf('payment.addon.title')).toBe(i18n.t('signupReview.addonInterestValue'))
    expect(i18n.t('signupReview.addonInterestValue')).toBe('Interest in the ERP add-on noted, no charge.')
    for (const lng of ['en', 'ar']) {
      expect(i18n.t('signupReview.addonInterestValue', { lng }).length).toBeLessThanOrEqual(45)
      expect(i18n.t('signupReview.addonInterestValue', { lng })).not.toMatch(/—/)
    }
    await act(() => i18n.changeLanguage('ar'))
    expect(valueOf('payment.addon.title')).toBe('سُجّل اهتمامك بإضافة تكامل ERP، دون أي رسوم.')
    await act(() => i18n.changeLanguage('en'))
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

  it('a submission refused because the application was closed goes to the closed screen', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/final-submission')
        ? json(409, { type: 'https://api.fawtir.om/problems/signup-application-closed', detail: 'Closed.' })
        : status('REJECTED', { submitted: true, verificationStatus: 'REJECTED', closed: true, rejectionReason: null }),
    )
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('signupPending.closed.title'))).toBeTruthy()
    expect(readOnboardingSession()?.submitted).toBe(true)
  })

  it('on a server without the closed field, a closed refusal is said on the page, with no way round', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/final-submission')
        ? json(409, { type: 'https://api.fawtir.om/problems/signup-application-closed', detail: 'Closed.' })
        : status('READY_FOR_SUBMISSION', { verificationStatus: 'REJECTED' }),
    )
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('onboarding.applicationClosed'))).toBeTruthy()
    expect(screen.getByText(i18n.t('signupReview.title'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('signupPending.closed.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('signupPending.rejected.correct') })).toBeNull()
    expect(readOnboardingSession()?.submitted).not.toBe(true)
  })

  it('a draft sent back for correction says why and by when, and that the payment is kept', () => {
    renderAt('/signup-review', {
      ...COMPLETE,
      rejectionReason: 'TAX_IDENTITY_EVIDENCE_MISSING',
      correctableUntil: '2026-10-28',
      paymentKept: true,
    })
    const reason = `${i18n.t('console.verification.detail.reason.TAX_IDENTITY_EVIDENCE_MISSING')}.`
    const line = screen.getByRole('status')
    expect(line.textContent).toBe(
      `${i18n.t('signupReview.sentBack', { reason, date: '28 Oct 2026' })} ${i18n.t('signupReview.paymentKept')}`,
    )
    expect(line.textContent).not.toContain('..')
  })

  it('without a deadline from the server, the sent-back line ends at "submit it again"', () => {
    renderAt('/signup-review', { ...COMPLETE, rejectionReason: 'COMPANY_PROFILE_MISMATCH' })
    const reason = `${i18n.t('console.verification.detail.reason.COMPANY_PROFILE_MISMATCH')}.`
    expect(screen.getByRole('status').textContent).toBe(i18n.t('signupReview.sentBackNoDate', { reason }))
  })

  it('a draft never sent back shows no sent-back line', () => {
    renderAt('/signup-review', COMPLETE)
    expect(screen.queryByRole('status')).toBeNull()
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
    // In time order: Fawtir approves only after accepting the portal request, so the request is
    // the step under way (its marker carries the step's number) and approval comes after it.
    const text = screen.getAllByRole('list')[0].textContent ?? ''
    const order = ['sent', 'request', 'accept', 'review', 'register', 'connected'].map((id) =>
      text.indexOf(i18n.t(`fawtaraStatus.steps.${id}`)),
    )
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const current = screen
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('aria-current') === 'step')
    expect(current?.textContent?.startsWith('2' + i18n.t('fawtaraStatus.steps.request'))).toBe(true)
    expect(screen.queryByText(i18n.t('fawtaraStatus.steps.approved'))).toBeNull()
    // The request is asked for while the review runs.
    expect(screen.getByText(i18n.t('fawtaraStatus.howTo.h4'))).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('fawtaraStatus.openPortal') })).toBeTruthy()
  })

  it('says no "VAT included" when the seller charges none, and names the seller as /payment did', () => {
    const noVat = {
      ...COMPLETE,
      planTerms: { ...COMPLETE.planTerms!, vatRate: '0', vatAmount: '0.000', amountInclVat: '800.000' },
      seller: {
        legalNameEn: 'Thumb International SPC',
        legalNameAr: 'الإبهام العالمية ش ش و',
        crNumber: '1234567',
        taxIdentificationNumber: null,
        vatNumber: null,
        addressEn: 'Muscat',
        addressAr: null,
      },
    }
    renderAt('/signup-review', noVat)
    expect(valueOf('signupReview.fields.paidNowNoVat')).toBe('800.000')
    expect(screen.queryByLabelText(i18n.t('signupReview.fields.paidNow'))).toBeNull()
    expect(valueOf('signupReview.fields.seller')).toBe('Thumb International SPC')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('labels a trial first bill without VAT when none is charged', () => {
    renderAt('/signup-review', {
      ...COMPLETE,
      enrollment: 'trial',
      paymentMethod: undefined,
      planTerms: { ...COMPLETE.planTerms!, vatRate: '0', vatAmount: '0.000', amountInclVat: '800.000' },
    })
    expect(valueOf('signupReview.fields.firstBillAmountNoVat')).toBe('800.000')
    expect(screen.queryByLabelText(i18n.t('signupReview.fields.firstBillAmount'))).toBeNull()
    // No seller was carried from /payment (a resumed draft): no seller line rather than a guess.
    expect(screen.queryByLabelText(i18n.t('signupReview.fields.seller'))).toBeNull()
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
    // Approved only after Fawtir accepted the portal request: the SMP registration is next, and
    // the request is not asked for again.
    expect(await screen.findByText(i18n.t('fawtaraStatus.registering.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtaraStatus.steps.approved'))).toBeTruthy()
    expect(screen.getByText(i18n.t('fawtaraStatus.steps.accepted'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('fawtaraStatus.howTo.h4'))).toBeNull()
    expect(screen.queryByRole('link', { name: i18n.t('fawtaraStatus.openPortal') })).toBeNull()

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

  it('a closed application says so, with the reason, the refund for confirmed money, and support', async () => {
    fetchMock.mockResolvedValue(
      status('REJECTED', {
        submitted: true,
        verificationStatus: 'REJECTED',
        closed: true,
        rejectionReason: 'COMPANY_PROFILE_MISMATCH',
        signupPayment: { method: 'BANK_TRANSFER', status: 'FUNDS_VERIFIED', amount: '840.000', reference: 'T-1', hasProof: true },
        refundDue: true,
      }),
    )
    renderAt('/signup-pending')

    expect(await screen.findByText(i18n.t('signupPending.closed.title'))).toBeTruthy()
    const reason = `${i18n.t('console.verification.detail.reason.COMPANY_PROFILE_MISMATCH')}.`
    expect(screen.getByText(i18n.t('signupPending.closed.reason', { reason }))).toBeTruthy()
    expect(screen.getByText(i18n.t('signupPending.closed.final'))).toBeTruthy()
    expect(screen.getByText(i18n.t('signupPending.closed.refund'))).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('signupPending.closed.contact') }).getAttribute('href')).toBe(
      'mailto:support@fawtir.om',
    )
    expect(screen.queryByText(i18n.t('fawtaraStatus.rejected.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('signupPending.rejected.correct') })).toBeNull()
    expect(readOnboardingSession()?.submitted).toBe(true)
  })

  it('a closed application promises no refund unless the server says one is due', async () => {
    fetchMock.mockResolvedValue(
      status('REJECTED', {
        submitted: true,
        verificationStatus: 'REJECTED',
        closed: true,
        rejectionReason: 'COMPANY_PROFILE_MISMATCH',
        // Verified money, but no refundDue from the server: nothing is promised.
        signupPayment: { method: 'BANK_TRANSFER', status: 'FUNDS_VERIFIED', amount: '840.000', reference: 'T-1', hasProof: true },
      }),
    )
    renderAt('/signup-pending')
    expect(await screen.findByText(i18n.t('signupPending.closed.title'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('signupPending.closed.refund'))).toBeNull()
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
