import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import { saveOnboardingSession } from '../lib/identity/onboardingSession'
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const noContent = () => new Response(null, { status: 204 })
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
    onboardingToken: 'so.token',
    onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  fetchMock = vi.fn().mockResolvedValue(noContent())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Choose a plan, between the address and payment', () => {
  it('saves a priced plan and carries it to "How you\'ll pay"', async () => {
    renderAt('/plans', AFTER_ADDRESS)
    const [starter] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await userEvent.setup({ delay: null }).click(starter)

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/plan',
        body: { onboardingToken: 'so.token', planCode: 'STARTER', billingCycle: 'MONTHLY' },
      },
    ])
  })

  it('saves Business as BUSINESS with the annual cycle', async () => {
    renderAt('/plans', AFTER_ADDRESS)
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('tab', { name: i18n.t('plans.annual') }))
    const [, business] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await user.click(business)

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    expect(requests()[0].body).toMatchObject({ planCode: 'BUSINESS', billingCycle: 'ANNUAL' })
  })

  it('sends Enterprise straight to review with no billing cycle and no payment step', async () => {
    renderAt('/plans', AFTER_ADDRESS)
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.talkToTeam') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/plan',
        body: { onboardingToken: 'so.token', planCode: 'ENTERPRISE', billingCycle: null },
      },
    ])
    expect(stateNow().plan).toBe('enterprise')
    expect(stateNow().paymentMethod).toBeUndefined()
    expect(stateNow().address?.city).toBe('Sohar')
  })

  it('stays on the plans when the plan cannot be saved', async () => {
    fetchMock.mockResolvedValue(json(503, {}))
    renderAt('/plans', AFTER_ADDRESS)
    const [starter] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await userEvent.setup({ delay: null }).click(starter)

    expect(await screen.findByText(i18n.t('identityErrors.service'))).toBeTruthy()
    expect(screen.getByText(i18n.t('plans.title'))).toBeTruthy()
  })

  it('draws the comparison without a duplicate React key', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderAt('/plans', AFTER_ADDRESS)
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.compare.open') }))
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes('same key'))
    expect(keyWarnings).toEqual([])
  })
})

describe("How you'll pay", () => {
  it('charges nothing, saves the method, and continues to review', async () => {
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })

    expect(screen.getByText(i18n.t('payment.descriptionTrial', { count: 14 }))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Pay .* & activate/)
    expect(screen.getByText(/owner@alnoor\.test/)).toBeTruthy()

    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByText(i18n.t('payment.method.cash.title')))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/payment-preference',
        body: {
          onboardingToken: 'so.token',
          method: 'CASH',
          linkChannel: null,
          erpExtractionAddon: false,
        },
      },
    ])
    expect(stateNow()).toMatchObject({ plan: 'premium', billing: 'monthly', paymentMethod: 'cash' })
  })

  it('sends the card link channel only for a card', async () => {
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'businessPlus', billing: 'annual' })
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('radio', { name: new RegExp(i18n.t('payment.cardLink.byVia.whatsapp')) }))
    await user.click(screen.getByLabelText(i18n.t('payment.addon.label')))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(requests()[0].body).toEqual({
      onboardingToken: 'so.token',
      method: 'CARD_LINK',
      linkChannel: 'WHATSAPP',
      erpExtractionAddon: true,
    })
  })

  it('offers bank transfer as unavailable and shows no bank account', async () => {
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly', paymentMethod: 'bankTransfer' })

    const bank = screen.getByRole('button', { name: new RegExp(i18n.t('payment.method.bankTransfer.title')) })
    expect((bank as HTMLButtonElement).disabled).toBe(true)
    expect(bank.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(i18n.t('payment.bank.unavailable'))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/IBAN|OM55|Insight Technology|Bank Muscat/)
  })

  it('does not draw the cash icon as the selected tick', () => {
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    const cash = screen.getByRole('button', { name: new RegExp(i18n.t('payment.method.cash.title')) })
    expect(cash.getAttribute('aria-pressed')).toBe('false')
    expect(cash.querySelectorAll('img')).toHaveLength(1)
    expect(cash.querySelector('img')?.getAttribute('src')).not.toMatch(/tick/)
  })

  it('prints a Business year as 800.000 + 40.000 VAT = 840.000, with no duplicate key', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'annual' })
    const text = document.body.textContent ?? ''
    expect(text).toContain('800.000')
    expect(text).toContain('40.000')
    expect(text).toContain('840.000')
    expect(text).not.toContain('800.004')
    expect(errors.mock.calls.filter((call) => String(call[0]).includes('same key'))).toEqual([])
  })

  it('names a missing plan in words when the server refuses the preference', async () => {
    fetchMock.mockResolvedValue(
      json(409, { type: 'https://api.fawtir.om/problems/signup-plan-required' }),
    )
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect(await screen.findByText(i18n.t('onboarding.planRequired'))).toBeTruthy()
    expect(requests()).toHaveLength(1)
  })

  it('opened without a plan, goes to choose one first', async () => {
    fetchMock.mockResolvedValue(json(200, { stage: 'READY_FOR_SUBMISSION' }))
    renderAt('/payment', AFTER_ADDRESS)
    expect(await screen.findByText(i18n.t('plans.title'))).toBeTruthy()
  })

  it('opened in a new tab, restores the saved plan and preference from the server', async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        stage: 'READY_FOR_SUBMISSION',
        plan: { planCode: 'BUSINESS', billingCycle: 'ANNUAL' },
        paymentPreference: { method: 'CASH', linkChannel: null, erpExtractionAddon: false },
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
    )
    renderAt('/payment')

    expect(await screen.findByText(i18n.t('payment.title'))).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: new RegExp(i18n.t('payment.method.cash.title')) })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(document.body.textContent).toContain('840.000')
  })
})
