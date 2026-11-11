import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import { NO_SALE_DISCOUNT, totalsFor, omr } from '../../lib/pos'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { resetOpenSale } from '../../lib/posSale'
import { PosPhoneSaleBar, POS_SALE_PANEL_ID } from './PosPhoneSaleBar'

let limits: Record<string, number> | undefined
vi.mock('../../hooks/useEntitlements', () => ({
  useEntitlements: () => ({ entitlements: { discountLimits: limits }, ready: true }),
}))

describe('the till’s bar on a phone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale(SAMPLE_SALE)
    limits = undefined
  })
  afterEach(() => i18n.changeLanguage('en'))

  it('draws nothing with no lines on the sale', () => {
    const { container } = render(<PosPhoneSaleBar lines={[]} onTakePayment={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the panel’s count and total, phone width only, and takes the payment', () => {
    const onTakePayment = vi.fn()
    render(<PosPhoneSaleBar lines={SAMPLE_SALE} onTakePayment={onTakePayment} />)
    const items = SAMPLE_SALE.reduce((sum, line) => sum + line.qty, 0)
    expect(screen.getByText(`${items} items`)).toBeTruthy()
    expect(screen.getByText(omr(totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT).sale))).toBeTruthy()
    const take = screen.getByRole('button', { name: 'Take payment' })
    expect(take.parentElement?.className).toContain('md:hidden')
    expect(take.parentElement?.className).toContain('safe-area-inset-bottom')
    fireEvent.click(take)
    expect(onTakePayment).toHaveBeenCalledOnce()
  })

  it('stops Take payment, as the panel does, while a discount is over the cashier’s limit', () => {
    limits = { 'pos.sell': 10 }
    const onTakePayment = vi.fn()
    const over = SAMPLE_SALE.map((line, index) =>
      index === 0 ? { ...line, lineDiscount: { type: 'PERCENTAGE' as const, value: '50' } } : line,
    )
    render(<PosPhoneSaleBar lines={over} onTakePayment={onTakePayment} />)
    const take = screen.getByRole('button', { name: 'Take payment' }) as HTMLButtonElement
    expect(take.disabled).toBe(true)
    fireEvent.click(take)
    expect(onTakePayment).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'See this sale' })).toBeTruthy()
  })

  it('goes to the sale panel when the summary is tapped', () => {
    const panel = document.createElement('div')
    panel.id = POS_SALE_PANEL_ID
    panel.scrollIntoView = vi.fn()
    document.body.append(panel)
    render(<PosPhoneSaleBar lines={SAMPLE_SALE} onTakePayment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'See this sale' }))
    expect(panel.scrollIntoView).toHaveBeenCalledOnce()
    panel.remove()
  })

  it('counts in Arabic with its plural forms', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('pos.phoneBar.itemCount', { count: 1 })).toBe('صنف واحد')
    expect(i18n.t('pos.phoneBar.itemCount', { count: 2 })).toBe('صنفان')
    expect(i18n.t('pos.phoneBar.itemCount', { count: 3 })).toBe('3 أصناف')
    expect(i18n.t('pos.phoneBar.itemCount', { count: 11 })).toBe('11 صنفًا')
  })
})
