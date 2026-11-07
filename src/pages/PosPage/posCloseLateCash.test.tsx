import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { PosClosePage } from './PosClosePage'

// NOT RUN (batch 39, static only). B39-SR-3 WEB-9: the late-cash line on the close preview
// (fix/b39-fin-latecash 0ff5228cb). The harness is tillMoneyTyping.test.tsx's.

const ME: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  // pos.cash.pay_out: backend cb9898ac3 copies it to every pos.close holder, and Paid out asks it.
  permissions: ['pos.read', 'pos.sell', 'pos.close', 'pos.cash.pay_out'],
  scopes: [],
  featureFlags: {},
}
const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}
const PREVIEW = {
  shiftId: 'sh-1',
  tillId: 'till-1',
  tillNumber: 1,
  branchId: 'b-1',
  cashier: { userId: 'u-1', name: 'Maryam' },
  status: 'OPEN',
  businessDate: '2026-10-29',
  openedAt: '2026-10-29T03:00:00Z',
  endedAt: null,
  openingFloat: 30,
  openingFloatSource: 'DEFAULT',
  salesCount: 1,
  salesAmount: 5.649,
  byMethod: [{ method: 'CASH', sales: 1, taken: 5.649, refunded: 0, tips: 0 }],
  companyInvoices: 0,
  vatWithin: 0.269,
  discounts: 0,
  tips: 0,
  paidOut: 0,
  paidIn: 0,
  cashRefunded: 0,
  expectedCash: 35.649,
  looseEnds: {
    onAccountOpen: { count: 0, amount: 0 },
    notYetAccepted: 0,
    cardSalesForTerminalCheck: { count: 0, amount: 0 },
  },
  movements: [],
  at: '2026-10-29T14:00:00Z',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let closes: Record<string, unknown>[]
let preview: () => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  closes = []
  preview = () => json(PREVIEW)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(ME)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.includes('/close-preview')) return preview()
      if (url.endsWith('/close') && init?.method === 'POST') {
        closes.push(JSON.parse(String(init.body)))
        return json(
          {
            shiftId: 'sh-1',
            closedAt: '2026-10-29T14:00:00Z',
            countedCash: 1.47,
            expectedCash: 35.649,
            overShort: -34.179,
            floatLeft: 1.47,
            toBank: 0,
            cardTerminalTotal: 0,
            cardTerminalDifference: 0,
            cardDifferenceNote: null,
          },
          201,
        )
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pos/close" element={<PosClosePage />} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const late = (amount?: number) => () =>
  json(amount === undefined ? PREVIEW : { ...PREVIEW, lateCashFromHandedOverShift: amount })

describe('late cash from the handed-over shift (WEB-9)', () => {
  it('shows the line under the expected cash and leaves the expected figure alone', async () => {
    preview = late(1.25)
    renderAt('/pos/close')
    expect(
      await screen.findByText(i18n.t('pos.close.lateCash', { amount: '1.250' })),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.close.lateCashHint'))).toBeTruthy()
    const field = (await screen.findByRole('textbox', {
      name: i18n.t('pos.close.actuallyIn'),
    })) as HTMLInputElement
    expect(field.value).toBe('35.649')
  })

  it.each([[0], [undefined]])('shows nothing for %s (zero, or an older server)', async (amount) => {
    preview = late(amount)
    renderAt('/pos/close')
    await screen.findByText(i18n.t('pos.close.shouldHold'))
    expect(screen.queryByText(i18n.t('pos.close.lateCashHint'))).toBeNull()
  })
})

describe('a paid-out is not a refund (FIN-P1)', () => {
  it.each(['en', 'ar'])('says refunds are made from the sale while Paid out is chosen (%s)', async (language) => {
    await i18n.changeLanguage(language)
    renderAt('/pos/close')
    const note = i18n.t('pos.close.paidOutNotRefund')
    expect(await screen.findByText(note)).toBeTruthy()
    if (language === 'ar') expect(note).not.toBe('Refunds are made from the sale, not here.')
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.move.PAID_IN') }))
    expect(screen.queryByText(note)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.move.PAID_OUT') }))
    expect(screen.getByText(note)).toBeTruthy()
    await i18n.changeLanguage('en')
  })
})
