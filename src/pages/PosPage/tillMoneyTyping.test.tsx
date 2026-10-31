import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { parseBaisa, typedBaisa } from '../../lib/posPayment'
import { PosClosePage } from './PosClosePage'
import { PosPaymentPage } from './PosPaymentPage'

/** The till's money fields, typed key by key as a person types them (browser check, 31 Oct 2026). */

const ME: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.close'],
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
        <Route path="/pos/payment" element={<PosPaymentPage />} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const drawer = async () =>
  (await screen.findByRole('textbox', { name: i18n.t('pos.close.actuallyIn') })) as HTMLInputElement
const closeButton = () =>
  screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }) as HTMLButtonElement

describe('the drawer count', () => {
  it('keeps every keystroke as typed and shows three decimals on leaving', async () => {
    const user = userEvent.setup()
    renderAt('/pos/close')
    const field = await drawer()
    expect(field.value).toBe('35.649')
    await user.click(field)
    await user.keyboard('1')
    expect(field.value).toBe('1')
    await user.keyboard('.')
    expect(field.value).toBe('1.')
    await user.keyboard('470')
    expect(field.value).toBe('1.470')
    await user.tab()
    expect(field.value).toBe('1.470')
    await user.click(field)
    await user.keyboard('2.5')
    await user.tab()
    expect(field.value).toBe('2.500')
  })

  it('says so when what was typed is not a figure, instead of a silent Close', async () => {
    const user = userEvent.setup()
    renderAt('/pos/close')
    const field = await drawer()
    await user.click(field)
    await user.keyboard('4.514.5')
    const wrong = i18n.t('pos.moneyNotAFigure')
    expect(screen.getByRole('alert').textContent).toBe(wrong)
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(closeButton().disabled).toBe(true)
    expect(screen.queryByText(i18n.t('pos.close.shortBy'))).toBeNull()
    expect(screen.getByText(i18n.t('pos.close.countFirst'))).toBeTruthy()
    // Leaving the field keeps the text and the line: nothing empties it unexplained.
    await user.tab()
    expect(field.value).toBe('4.514.5')
    expect(screen.getByRole('alert').textContent).toBe(wrong)
    await user.clear(field)
    await user.keyboard('4.510')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(i18n.t('pos.close.shortBy'))).toBeTruthy()
  })

  it('saves what was typed, and only the reason that was chosen', async () => {
    const user = userEvent.setup()
    renderAt('/pos/close')
    const field = await drawer()
    await user.click(field)
    await user.keyboard('1.470')
    // Short, with no reason chosen: nothing preselected, nothing sent, and the page says why.
    expect(closeButton().disabled).toBe(true)
    expect(screen.getByText(/Pick a reason/)).toBeTruthy()
    const reason = screen.getByRole('button', { name: new RegExp(i18n.t('pos.close.changeWrong')) })
    expect(reason.getAttribute('aria-pressed')).toBe('false')
    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('pos.close.dontKnow')) }))
    expect(closeButton().disabled).toBe(false)
    await user.click(closeButton())
    await waitFor(() => expect(closes).toHaveLength(1))
    expect(closes[0].counting).toEqual({ mode: 'TOTAL', total: 1.47 })
    expect(closes[0].overShortReason).toBe('DONT_KNOW')
  })

  it('sends no reason when the drawer balances', async () => {
    const user = userEvent.setup()
    renderAt('/pos/close')
    await drawer()
    await user.click(closeButton())
    await waitFor(() => expect(closes).toHaveLength(1))
    expect(closes[0].overShortReason).toBeNull()
  })

  it('will not close on an empty field or text that is no figure', async () => {
    const user = userEvent.setup()
    renderAt('/pos/close')
    const field = await drawer()
    await user.clear(field)
    expect(closeButton().disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('pos.close.dontKnow')) }))
    expect(closeButton().disabled).toBe(true)
    await user.type(field, '1.2.3')
    expect(field.value).toBe('1.2.3')
    expect(closeButton().disabled).toBe(true)
  })

  it('says so when the open shift is someone else’s, not that the account has no access', async () => {
    preview = () => json({ status: 403, code: 'POS_SHIFT_NOT_OWN' }, 403)
    renderAt('/pos/close')
    expect(await screen.findByText(i18n.t('pos.refusal.POS_SHIFT_NOT_OWN'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('appAccess.missingPermission'))).toBeNull()
  })
})

describe('the other money fields at the till', () => {
  it('takes pay in and the bank machine total key by key', async () => {
    const user = userEvent.setup()
    renderAt('/pos/close')
    await drawer()
    const terminal = screen.getByRole('textbox', {
      name: i18n.t('pos.close.terminalTotal'),
    }) as HTMLInputElement
    await user.click(terminal)
    await user.keyboard('1.470')
    expect(terminal.value).toBe('1.470')
    const amount = screen.getByPlaceholderText('0.000') as HTMLInputElement
    await user.type(amount, '12.345')
    expect(amount.value).toBe('12.345')
  })

  it('takes the cash handed over key by key, and the change follows', async () => {
    const user = userEvent.setup()
    renderAt('/pos/payment')
    const field = (await screen.findByRole('textbox', {
      name: i18n.t('pos.pay.handedOverLabel'),
    })) as HTMLInputElement
    await user.click(field)
    await user.keyboard('2')
    expect(field.value).toBe('2')
    await user.keyboard('0.500')
    expect(field.value).toBe('20.500')
  })

  it('takes a split amount key by key; clearing it does not snap back mid-edit', async () => {
    const user = userEvent.setup()
    renderAt('/pos/payment')
    await screen.findByRole('textbox', { name: i18n.t('pos.pay.handedOverLabel') })
    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('pos.pay.card')) }))
    const field = screen.getByRole('textbox', {
      name: i18n.t('pos.pay.amount'),
    }) as HTMLInputElement
    await user.click(field)
    await user.keyboard('1.25')
    expect(field.value).toBe('1.25')
    await user.clear(field)
    expect(field.value).toBe('')
  })
})

describe('reading a typed figure', () => {
  it('reads Arabic digits, and refuses what is not a figure rather than saying 0', () => {
    expect(typedBaisa('١٫٤٧٠')).toBe(1470)
    expect(parseBaisa('١٫٤٧٠')).toBe(1470)
    expect(typedBaisa('1.470')).toBe(1470)
    expect(typedBaisa('.5')).toBe(500)
    expect(typedBaisa('')).toBeNull()
    expect(typedBaisa('1.2.3')).toBeNull()
    expect(typedBaisa('1,470')).toBeNull()
    expect(typedBaisa('abc')).toBeNull()
  })
})
