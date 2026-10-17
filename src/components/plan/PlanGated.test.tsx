import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { UpsellPanel } from './PlanGated'

const catalogue = (vatRate: string | null | undefined) => [
  {
    code: 'BUSINESS',
    nameEn: 'Business',
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
    answer = () => json(503, {})
    renderGate()
    expect(await screen.findByText(i18n.t('planGate.perMonthNoVat'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('planGate.perMonth'))).toBeNull()
  })
})
