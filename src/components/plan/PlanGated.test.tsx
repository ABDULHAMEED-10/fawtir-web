import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { UpsellPanel } from './PlanGated'

const catalogue = (vatRate: string | null | undefined) => [
  {
    code: 'BUSINESS',
    nameEn: 'Business',
    monthlyPrice: '92.500',
    sortOrder: 1,
    features: [],
    ...(vatRate === undefined ? {} : { vatRate }),
  },
]
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let answer: () => Response
beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => answer()),
  )
})
afterEach(() => vi.unstubAllGlobals())

const renderGate = () =>
  render(
    <MemoryRouter>
      <UpsellPanel feature="recurringBills" neededPlan="business" />
    </MemoryRouter>,
  )

// Plan gating is switched off in the app; this is the panel a gated screen shows once it is on.
describe('Plan gate: the price follows the subscription VAT setting', () => {
  it('says "before VAT" when the catalogue charges VAT', async () => {
    answer = () => json(200, catalogue('0.05000'))
    renderGate()
    expect(await screen.findByText(i18n.t('planGate.perMonth'))).toBeTruthy()
  })

  it('has no VAT wording when VAT is off', async () => {
    answer = () => json(200, catalogue('0.00000'))
    renderGate()
    expect(await screen.findByText(i18n.t('planGate.perMonthNoVat'))).toBeTruthy()
    expect(screen.queryByText(/VAT/)).toBeNull()
  })

  it('makes no VAT claim while the rate is unknown', async () => {
    answer = () => json(200, catalogue(undefined))
    renderGate()
    expect(await screen.findByText(i18n.t('planGate.perMonthNoVat'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('planGate.perMonth'))).toBeNull()
  })
})

describe('Plan gate: the price is the published catalogue\'s (GEN-1, PL-6)', () => {
  it('shows the needed plan\'s monthly price as the server sends it, not the launch figure', async () => {
    answer = () => json(200, catalogue('0.05000'))
    renderGate()
    expect(await screen.findByText('92.500')).toBeTruthy()
    expect(screen.queryByText('80.000')).toBeNull()
  })

  it('shows no figure for a plan the catalogue does not list', async () => {
    answer = () => json(200, [{ ...catalogue('0.05000')[0], code: 'BUSINESS_PLUS' }])
    renderGate()
    expect(await screen.findByRole('link', { name: i18n.t('planGate.seePlans') })).toBeTruthy()
    await screen.findByRole('heading')
    expect(screen.queryByText('80.000')).toBeNull()
    expect(screen.queryByText(i18n.t('planGate.perMonth'))).toBeNull()
  })

  it('offers a retry, never a launch price, when the catalogue cannot be read', async () => {
    answer = () => json(503, {})
    renderGate()
    expect(await screen.findByText(i18n.t('planGate.priceUnavailable'))).toBeTruthy()
    expect(screen.queryByText('80.000')).toBeNull()
    answer = () => json(200, catalogue('0.05000'))
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: i18n.t('plans.retry') }))
    expect(await screen.findByText('92.500')).toBeTruthy()
  })

  it('has the loading and failure words in Arabic too', () => {
    for (const key of ['planGate.priceLoading', 'planGate.priceUnavailable']) {
      expect(i18n.t(key, { lng: 'ar' })).not.toBe(key)
      expect(i18n.t(key, { lng: 'ar' })).not.toBe(i18n.t(key, { lng: 'en' }))
    }
  })
})
