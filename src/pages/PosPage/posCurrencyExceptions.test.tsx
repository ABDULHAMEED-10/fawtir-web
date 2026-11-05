import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { PosCurrencyExceptionsPage } from './PosCurrencyExceptionsPage'
import { forgetEntitlements, loadEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

// The currency-exceptions report (FIN-2a-REPORT, backend cb02428c7, openapi 626a6235b), with the
// coordinator's rules: withheld figures are "Not available", never 0; a movement with no currency is
// "Currency unknown" with no sign; nothing is totalled across shifts or currencies; a cut list says so.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const shift = (over: Record<string, unknown> = {}) => ({
  shiftId: 'sh-1',
  tillId: 'till-1',
  tillNumber: 1,
  branchId: 'b-1',
  cashier: { userId: 'u-1', name: 'Maryam' },
  status: 'CLOSED',
  businessDate: '2026-11-04',
  openedAt: '2026-11-04T04:00:00Z',
  endedAt: '2026-11-04T14:00:00Z',
  state: 'POS_SHIFT_CURRENCY_MIXED',
  currencies: ['OMR', 'AED'],
  unrecordedMovements: 1,
  cash: [
    { currency: 'OMR', currencyRecorded: true, paidIn: 10, paidOut: 2.5, movements: 3 },
    { currency: 'AED', currencyRecorded: true, paidIn: null, paidOut: 7.25, movements: 1 },
    { currency: null, currencyRecorded: false, paidIn: 4.2, paidOut: null, movements: 1 },
  ],
  storedClose: {
    closedAt: '2026-11-04T14:05:00Z',
    expectedCash: 50.5,
    countedCash: null,
    overShort: null,
    currencyRecorded: false,
  },
  ...over,
})

let report: () => Response
let calls: string[]
let permissions: string[]

const person = (): Entitlements => ({
  userId: 'u-mgr',
  username: 'manager',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  calls = []
  permissions = ['pos.read']
  report = () => json({ from: '2026-10-06', to: '2026-11-05', truncated: false, shifts: [shift()] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url === '/api/v1/me/entitlements') return json(person())
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/shifts/currency-exceptions?')) return report()
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function open() {
  await loadEntitlements()
  render(
    <MemoryRouter initialEntries={['/pos/currency-exceptions']}>
      <Routes>
        <Route path="/pos/currency-exceptions" element={<PosCurrencyExceptionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const asked = () => calls.filter((url) => url.startsWith('/api/v1/pos/shifts/currency-exceptions?'))

describe('the currency-exceptions report', () => {
  it('asks for a from and to date and the working branch', async () => {
    await open()
    await waitFor(() => expect(asked().length).toBeGreaterThan(0))
    const query = new URL(asked().at(-1)!, 'http://x').searchParams
    expect(query.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(query.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(query.get('from')! <= query.get('to')!).toBe(true)
  })

  it('shows a withheld figure as Not available, never 0, and a currency-less row with no sign', async () => {
    await open()
    expect(await screen.findByText('Till 1 · 4 Nov 2026')).toBeTruthy()
    const rows = screen.getAllByRole('row').map((row) => row.textContent ?? '')
    expect(rows.find((row) => row.startsWith('OMR'))).toBe('OMR10.000 OMR2.500 OMR3')
    expect(rows.find((row) => row.startsWith('AED'))).toBe('AEDNot available7.25 AED1')
    const unknown = rows.find((row) => row.startsWith('Currency unknown'))!
    expect(unknown).toBe('Currency unknown4.200Not available1')
    expect(unknown).not.toMatch(/OMR|ر\.ع/)
    // The stored close: summed across currencies, so no currency, and its withheld figures as such.
    expect(screen.getByText(/Expected: 50.500 · Counted: Not available · Over or short: Not available/)).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.currencyExceptions.storedCloseNote'))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/(^|[^.\d])0(\.0+)?( |$)/)
  })

  it('totals nothing across shifts or currencies', async () => {
    report = () =>
      json({ from: 'x', to: 'y', truncated: false, shifts: [shift(), shift({ shiftId: 'sh-2', tillNumber: 2 })] })
    await open()
    await screen.findByText('Till 2 · 4 Nov 2026')
    const text = document.body.textContent ?? ''
    // Whole word: the intro itself says shifts "cannot be totalled".
    expect(text).not.toMatch(/\btotal\b/i)
    // Across shifts (10 + 10), across currencies in one shift (10 + 4.2; 2.5 + 7.25).
    expect(text).not.toContain('20.000')
    expect(text).not.toContain('14.2')
    expect(text).not.toContain('9.75')
  })

  it('says when the list is cut', async () => {
    report = () => json({ from: 'x', to: 'y', truncated: true, shifts: [shift()] })
    await open()
    expect(await screen.findByText(i18n.t('pos.currencyExceptions.truncated'))).toBeTruthy()
  })

  it('words the unrecorded state and its count', async () => {
    report = () =>
      json({
        from: 'x',
        to: 'y',
        truncated: false,
        shifts: [shift({ state: 'POS_SHIFT_CURRENCY_UNRECORDED', currencies: ['OMR'], unrecordedMovements: 2 })],
      })
    await open()
    expect(await screen.findByText('Cash moved with no currency recorded. Movements: 2.')).toBeTruthy()
  })

  it('words 400 POS_REPORT_RANGE_INVALID by its code', async () => {
    report = () => json({ type: 'about:blank', status: 400, code: 'POS_REPORT_RANGE_INVALID' }, 400)
    await open()
    expect(await screen.findByText(i18n.t('pos.currencyExceptions.rangeInvalid'))).toBeTruthy()
  })

  it('asks nothing without pos.read', async () => {
    permissions = ['pos.sell']
    await open()
    expect(await screen.findByText(i18n.t('pos.currencyExceptions.notAllowed'))).toBeTruthy()
    expect(asked()).toEqual([])
  })

  it('has every sentence in Arabic, with the same placeholders', () => {
    const enKeys = en.pos.currencyExceptions as Record<string, unknown>
    const arKeys = ar.pos.currencyExceptions as Record<string, unknown>
    expect(Object.keys(arKeys).sort()).toEqual(Object.keys(enKeys).sort())
    for (const [key, value] of Object.entries(enKeys)) {
      if (typeof value !== 'string') continue
      const holes = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort()
      expect(holes(arKeys[key] as string), key).toEqual(holes(value))
    }
  })
})
