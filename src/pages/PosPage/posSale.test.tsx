import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { OPEN_SALE } from '../../lib/pos'
import { PosSalePanel } from './PosSalePanel'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  resetOpenSale,
  setSaleDiscount,
  setSaleLines,
  startNewSale,
  useOpenSale,
} from '../../lib/posSale'

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

/** The panel as the sale screen mounts it: on the shared open sale. */
function SharedPanel() {
  const { lines } = useOpenSale()
  return <PosSalePanel lines={lines} onLines={setSaleLines} onTakePayment={vi.fn()} />
}
const renderPanelWith = () =>
  render(
    <MemoryRouter>
      <SharedPanel />
    </MemoryRouter>,
  )

/** The till's totals are the invoice's (owner, 21 Oct 2026). */
describe('the sale panel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale()
  })

  const renderPanel = () =>
    render(
      <MemoryRouter>
        <PosSalePanel lines={OPEN_SALE} onLines={vi.fn()} onTakePayment={vi.fn()} />
      </MemoryRouter>,
    )

  it('takes a discount on the whole sale after the price rule and before VAT', () => {
    renderPanel()
    expect(screen.getByText('VAT 5%')).toBeTruthy()
    expect(screen.getByText('5.649')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Discount/ }))
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '10' } })
    expect(screen.getByText('Discount on the sale')).toBeTruthy()
    expect(screen.getByText('−0.538')).toBeTruthy()
    expect(screen.getByText('5.084')).toBeTruthy()
  })
})

describe('the open sale across the till screens (owner, 21 Oct 2026)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale()
    forgetEntitlements()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/v1/me/entitlements'
          ? new Response(JSON.stringify(OWNER), { headers: { 'Content-Type': 'application/json' } })
          : new Response('', { status: 404 }),
      ),
    )
  })

  it('charges on the payment screen what the sale screen discounted', async () => {
    setSaleDiscount({ type: 'PERCENTAGE', value: '10' })
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Discount on the sale')).toBeTruthy()
    expect(screen.getByText('−0.538')).toBeTruthy()
    // The sale (5.084) before the tip; the till's own tip goes on top.
    expect(screen.getAllByText('5.084').length).toBeGreaterThan(0)
  })

  it('starts the next sale empty', () => {
    setSaleLines((current) => current.slice(0, 1))
    startNewSale()
    renderPanelWith()
    expect(screen.getByText('Nothing on this sale yet.', { exact: false })).toBeTruthy()
  })
})
