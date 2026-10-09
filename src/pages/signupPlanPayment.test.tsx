import { beforeEach, describe, expect, it, vi } from 'vitest'
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

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  saveOnboardingSession({
    onboardingToken: 'so.token',
    onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('Choose a plan, between the address and payment', () => {
  it('carries a priced plan to "How you\'ll pay"', async () => {
    renderAt('/plans', AFTER_ADDRESS)
    const [starter] = screen.getAllByRole('button', { name: i18n.t('plans.getStarted') })
    await userEvent.setup({ delay: null }).click(starter)

    expect(screen.getByText(i18n.t('payment.title'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends Enterprise straight to review, with no payment step', async () => {
    renderAt('/plans', AFTER_ADDRESS)
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('plans.talkToTeam') }))

    expect(screen.getByTestId('location').textContent).toBe('/signup-review')
    expect(stateNow().plan).toBe('enterprise')
    expect(stateNow().paymentMethod).toBeUndefined()
    expect(stateNow().address?.city).toBe('Sohar')
  })
})

describe("How you'll pay", () => {
  it('charges nothing, says when the first bill comes, and continues to review', async () => {
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'premium', billing: 'monthly' })

    expect(screen.getByText(i18n.t('payment.descriptionTrial', { count: 14 }))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Pay .* & activate/)
    expect(screen.getByText(/owner@alnoor\.test/)).toBeTruthy()

    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByText(i18n.t('payment.method.bankTransfer.title')))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))

    expect(screen.getByTestId('location').textContent).toBe('/signup-review')
    expect(stateNow()).toMatchObject({
      plan: 'premium',
      billing: 'monthly',
      paymentMethod: 'bankTransfer',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers the ERP extraction add-on where the console prices it, and carries the tick to review', async () => {
    renderAt('/payment', { ...AFTER_ADDRESS, plan: 'businessPlus', billing: 'monthly' })
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('checkbox', { name: i18n.t('payment.addon.label') }))
    await user.click(screen.getByRole('button', { name: i18n.t('payment.continueCta') }))
    expect(stateNow().addon).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opened without a plan, goes to choose one first', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ stage: 'READY_FOR_SUBMISSION' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    renderAt('/payment', AFTER_ADDRESS)
    expect(await screen.findByText(i18n.t('plans.title'))).toBeTruthy()
  })
})
