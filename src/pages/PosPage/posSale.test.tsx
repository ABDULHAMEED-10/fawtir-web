import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { OPEN_SALE } from '../../lib/pos'
import { PosSalePanel } from './PosSalePanel'

/** The till's totals are the invoice's (owner, 21 Oct 2026). */
describe('the sale panel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
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
