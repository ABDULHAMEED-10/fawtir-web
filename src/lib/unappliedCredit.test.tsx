import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import i18n from '../i18n'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import type { ReceivableRowDto } from '../api/reports/dashboard'
import type { CustomerReceivableDto } from '../api/customers/customers'
import { KpiCards } from '../pages/DashboardPage/KpiSection'
import { creditHeld, netOf, serverFigure } from './unappliedCredit'
import { toReceivableView } from './customerList'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

const ROW: ReceivableRowDto = {
  currency: 'OMR',
  outstanding: 812.5,
  overdue: 100,
  overdueCount: 1,
  openCount: 4,
  dueThisMonth: 50,
}

function renderTile(row: ReceivableRowDto) {
  return render(
    <KpiCards
      cash={{ kind: 'loading' }}
      receivables={{ kind: 'ok', data: [row] }}
      payables={{ kind: 'loading' }}
    />,
  )
}

const owing = (overrides: Partial<CustomerReceivableDto> = {}): CustomerReceivableDto => ({
  customerId: 'c-1',
  outstanding: 845.125,
  overdue: 0,
  invoices: 5,
  openInvoices: 3,
  partlyPaidInvoices: 0,
  oldestOverdueDueDate: null,
  daysOverdue: null,
  ...overrides,
})

describe('unapplied credit figures (D-30(a))', () => {
  it('has English and Arabic wording', () => {
    for (const key of ['unapplied', 'net', 'customers', 'hint'] as const) {
      expect(typeof en.receivableCredit[key]).toBe('string')
      expect(ar.receivableCredit[key]).not.toBe(en.receivableCredit[key])
    }
  })

  it('takes the credit as the server sends it, never floored, and shows none when it is zero or absent', () => {
    expect(creditHeld(-45.25)).toBe(-45.25)
    expect(creditHeld('-0.005')).toBe(-0.005)
    expect(creditHeld(0)).toBeNull()
    expect(creditHeld(undefined)).toBeNull()
    expect(serverFigure(undefined)).toBeNull()
    expect(serverFigure(-3)).toBe(-3)
  })

  it('adds outstanding and credit in minor units, and lets the net fall below zero', () => {
    expect(netOf(812.5, -45.25, 'OMR')).toBe(767.25)
    expect(netOf('0.3', -0.1, 'OMR')).toBe(0.2)
    expect(netOf(0, -12.5, 'OMR')).toBe(-12.5)
    expect(netOf(10, -0.005, 'BHD')).toBe(9.995)
  })

  it('keeps a customer row\'s outstanding as it is and carries the credit and the server\'s net beside it', () => {
    expect(toReceivableView(owing({ unappliedCredit: -20, netBalance: 825.125 }))).toMatchObject({
      state: 'attention',
      amount: 845.125,
      credit: -20,
      net: 825.125,
    })
    // Only in credit: owes nothing, still holds the credit; the net is the server's, below zero.
    expect(
      toReceivableView(owing({ outstanding: 0, unappliedCredit: -12.5, netBalance: -12.5 })),
    ).toMatchObject({ state: 'settled', amount: null, credit: -12.5, net: -12.5 })
    expect(toReceivableView(owing())).toMatchObject({ credit: null, net: null })
  })

  it('shows the dashboard\'s credit on its own line and the net the tile adds up, outstanding unchanged', () => {
    renderTile({ ...ROW, unappliedCredit: -45.25 })
    expect(screen.getByText('812.500')).toBeTruthy()
    const credit = screen.getByTestId('unapplied-credit')
    expect(within(credit).getByText('Unapplied credit')).toBeTruthy()
    expect(within(credit).getByText('-45.250')).toBeTruthy()
    expect(within(credit).getByText('Net balance')).toBeTruthy()
    expect(within(credit).getByText('767.250')).toBeTruthy()
  })

  it('shows a net below zero when the business only holds credit, not zero', () => {
    renderTile({ ...ROW, outstanding: 0, openCount: 0, overdueCount: 0, unappliedCredit: -12.5 })
    const credit = screen.getByTestId('unapplied-credit')
    expect(within(credit).getAllByText('-12.500')).toHaveLength(2)
  })

  it('leaves the tile as it was when the server sends no credit', () => {
    renderTile(ROW)
    expect(screen.getByText('812.500')).toBeTruthy()
    expect(screen.queryByTestId('unapplied-credit')).toBeNull()
    renderTile({ ...ROW, unappliedCredit: 0 })
    expect(screen.queryByTestId('unapplied-credit')).toBeNull()
  })
})
