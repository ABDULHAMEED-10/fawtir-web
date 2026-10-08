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
  paymentMethod: 'bankTransfer',
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

  it('shows the plan and payment, and the waiting screen names the account email', async () => {
    renderAt('/signup-review', COMPLETE)
    expect(valueOf('signupReview.fields.plan')).toBe(
      i18n.t('signupReview.planValue', {
        plan: i18n.t('plans.premium.name'),
        cycle: i18n.t('signupReview.billedAnnually'),
      }),
    )
    expect(valueOf('signupReview.fields.payment')).toBe(i18n.t('signupReview.payment.bankTransfer'))
    expect(valueOf('signupReview.fields.firstBill')).toBe(
      i18n.t('signupReview.firstBillAfterTrial', { count: 14 }),
    )
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(screen.getByText('owner@alnoor.test').tagName).toBe('B')
    // In time order, the review under way (its marker carries the step's number).
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(steps).toEqual([
      i18n.t('fawtaraStatus.steps.sent'),
      '2' + i18n.t('fawtaraStatus.steps.review') + i18n.t('fawtaraStatus.steps.reviewing'),
      i18n.t('fawtaraStatus.steps.authorise'),
      i18n.t('fawtaraStatus.steps.connected'),
    ])
    // Fawtara comes after Fawtir's review, so its portal is not offered yet.
    expect(screen.queryByText(i18n.t('fawtaraStatus.openPortal'))).toBeNull()
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
    fetchMock.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(status('UNDER_REVIEW'))
    renderAt('/signup-review', COMPLETE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(readOnboardingSession()?.submitted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
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

  it('opened by URL, asks where the registrant is once and shows saved steps honestly', async () => {
    fetchMock.mockResolvedValue(status('READY_FOR_SUBMISSION'))
    renderAt('/signup-review')

    expect(await screen.findByText(i18n.t('signupReview.title'))).toBeTruthy()
    expect(valueOf('businessIdentity.vatinLabel')).toBe(i18n.t('signupReview.savedEarlier'))
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: TOKEN } },
    ])
  })

  it('is closed once this tab has submitted', async () => {
    markOnboardingSubmitted(true)
    renderAt('/signup-review', COMPLETE)
    expect(await screen.findByText(i18n.t('fawtaraStatus.review.title'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
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
    expect(await screen.findByText(i18n.t('fawtaraStatus.fawtara.title'))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('fawtaraStatus.openPortal') }).getAttribute('href'),
    ).toBe('https://tms.taxoman.gov.om/portal')

    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('signupPending.approved.signIn') }))
    expect(screen.getByTestId('location').textContent).toBe('/login')
  })

  it('sends a draft that is not (or no longer) submitted back to review', async () => {
    markOnboardingSubmitted(true)
    fetchMock.mockResolvedValue(status('READY_FOR_SUBMISSION', { verificationStatus: 'REJECTED' }))
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
