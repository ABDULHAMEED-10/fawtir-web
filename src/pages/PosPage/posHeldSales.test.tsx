import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { PosHeldSalesPage } from './PosHeldSalesPage'
import { forgetEntitlements, loadEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

// The held-sales screen (HS-STALL-VIS, backend e371713bf). The body is {items, truncated}, not the
// bare array the endpoint once returned (H4R-7), and either end of a hold or block span may be null.
// Review HSV-2: a row with no reason was never held, only waited for.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const item = (over: Record<string, unknown> = {}) => ({
  tillId: 'till-1',
  tillNumber: 3,
  heldNumber: 'T3-000041',
  reason: 'POS_QUEUED_SALE_HS_CODE_REQUIRED',
  lines: [2, 5],
  firstHeldAt: '2026-11-04T05:00:00Z',
  lastHeldAt: '2026-11-04T06:30:00Z',
  reHeldCount: 2,
  firstBlockedAt: null,
  lastBlockedAt: null,
  expectedNumber: null,
  overdue: false,
  ...over,
})

let list: () => Response
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
  list = () => json({ items: [item()], truncated: false })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url === '/api/v1/me/entitlements') return json(person())
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills/held-sales')) return list()
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
    <MemoryRouter initialEntries={['/pos/held-sales']}>
      <Routes>
        <Route path="/pos/held-sales" element={<PosHeldSalesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const asked = () => calls.filter((url) => url.startsWith('/api/v1/pos/tills/held-sales'))
const text = () => document.body.textContent ?? ''

describe('the held-sales screen', () => {
  it('reads {items, truncated} and words a held sale by its reason and lines', async () => {
    await open()
    expect(await screen.findByText('Till 3 · number T3-000041')).toBeTruthy()
    expect(asked()).toEqual(['/api/v1/pos/tills/held-sales'])
    expect(text()).toContain('Held: a goods line has no HS code. Lines: 2, 5.')
    expect(text()).toContain('Held first 04/11/2026, 09:00:00 GMT+4, last 04/11/2026, 10:30:00 GMT+4.')
    expect(text()).toContain('Held again since: 2.')
    expect(text()).not.toContain('Later sales refused behind it')
    expect(text()).not.toContain(i18n.t('pos.heldSales.overdue'))
  })

  it('words the goods-or-service reason, and any other reason generally', async () => {
    list = () =>
      json({
        items: [
          item({ reason: 'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED', lines: [1] }),
          item({ tillId: 'till-2', tillNumber: 4, heldNumber: 'T4-000002', reason: 'POS_SOMETHING_NEW', lines: [] }),
        ],
        truncated: false,
      })
    await open()
    await screen.findByText('Till 4 · number T4-000002')
    expect(text()).toContain('Held: a line does not say whether it is goods or a service. Lines: 1.')
    expect(text()).toContain('Held by the server for a check before it is filed.')
    expect(text()).not.toContain('POS_SOMETHING_NEW')
  })

  it('HSV-2: a row with no reason says the server has no record of that sale', async () => {
    list = () =>
      json({
        items: [
          item({
            reason: null,
            lines: [],
            heldNumber: 'T3-000040',
            expectedNumber: 'T3-000040',
            firstHeldAt: null,
            lastHeldAt: null,
            reHeldCount: 0,
            firstBlockedAt: '2026-11-04T07:00:00Z',
            lastBlockedAt: '2026-11-04T08:00:00Z',
          }),
        ],
        truncated: false,
      })
    await open()
    expect(
      await screen.findByText('Waiting for number T3-000040; the server has no record of that sale.'),
    ).toBeTruthy()
    expect(text()).not.toContain('Held first')
    expect(text()).not.toContain('Held: ')
    expect(text()).toContain(
      'Later sales refused behind it: first 04/11/2026, 11:00:00 GMT+4, last 04/11/2026, 12:00:00 GMT+4.',
    )
  })

  it('keeps hold times and block times apart, and names the number the queue waits for', async () => {
    list = () =>
      json({
        items: [
          item({
            expectedNumber: 'T3-000041',
            firstBlockedAt: '2026-11-04T07:00:00Z',
            lastBlockedAt: '2026-11-04T08:00:00Z',
          }),
        ],
        truncated: false,
      })
    await open()
    await screen.findByText('Till 3 · number T3-000041')
    const held = screen.getByText(/^Held first/)
    const blocked = screen.getByText(/^Later sales refused behind it/)
    expect(held).not.toBe(blocked)
    expect(held.textContent).not.toContain('11:00:00')
    expect(blocked.textContent).not.toContain('09:00:00')
    expect(blocked.textContent).toContain('The till waits for number T3-000041.')
  })

  it('H4R-7: a null end of a span reads "not recorded", never the other end', async () => {
    list = () => json({ items: [item({ firstHeldAt: null, reHeldCount: 0 })], truncated: false })
    await open()
    expect(await screen.findByText('Held first not recorded, last 04/11/2026, 10:30:00 GMT+4.')).toBeTruthy()
    expect(text()).not.toContain('Held again since')
  })

  it('flags an overdue item visibly', async () => {
    list = () => json({ items: [item({ overdue: true })], truncated: false })
    await open()
    const badge = await screen.findByText(i18n.t('pos.heldSales.overdue'))
    expect(badge.className).toContain('text-danger-700')
  })

  // QB8R-6 (backend f598aa39b): a WITHHELD item is a filed sale with no receipt printed, for review.
  it('words a WITHHELD item as a receipt for manager review, never as a hold or overdue', async () => {
    list = () =>
      json({
        items: [
          item({
            kind: 'WITHHELD',
            reason: 'POS_RECEIPT_WITHHELD',
            lines: [],
            reHeldCount: 1,
            overdue: true,
          }),
        ],
        truncated: false,
      })
    await open()
    expect(await screen.findByText(i18n.t('pos.heldSales.withheld'))).toBeTruthy()
    expect(text()).toContain('Marked first 04/11/2026, 09:00:00 GMT+4, last 04/11/2026, 10:30:00 GMT+4.')
    expect(text()).not.toContain(i18n.t('pos.heldSales.overdue'))
    expect(document.querySelector('.text-danger-700')).toBeNull()
    expect(text()).not.toContain('Held:')
    expect(text()).not.toContain('Held first')
    expect(text()).not.toContain(i18n.t('pos.heldSales.reason.other'))
    expect(text()).not.toContain('POS_RECEIPT_WITHHELD')
  })

  // QW5R-6: a WITHHELD item may carry no number; it never reads "null", and two on one till keep
  // distinct keys.
  it('words a WITHHELD item with no number as not recorded, never "null"', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const withheld = { kind: 'WITHHELD', reason: 'POS_RECEIPT_WITHHELD', lines: [], heldNumber: null }
      list = () =>
        json({
          items: [item(withheld), item({ ...withheld, firstHeldAt: '2026-11-04T07:00:00Z' })],
          truncated: false,
        })
      await open()
      expect(await screen.findAllByText('Till 3 · number not recorded')).toHaveLength(2)
      expect(text()).not.toContain('null')
      expect(error.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false)
    } finally {
      error.mockRestore()
    }
  })

  it('shows a kind this build does not know neutrally: no reason, hold wording or overdue', async () => {
    list = () => json({ items: [item({ kind: 'SOMETHING_NEW', overdue: true })], truncated: false })
    await open()
    expect(await screen.findByText(i18n.t('pos.heldSales.otherKind'))).toBeTruthy()
    expect(text()).not.toContain('Held:')
    expect(text()).not.toContain('Held first')
    expect(text()).not.toContain(i18n.t('pos.heldSales.reason.other'))
    expect(text()).not.toContain(i18n.t('pos.heldSales.overdue'))
    expect(document.querySelector('.text-danger-700')).toBeNull()
  })

  // Coordinator ruling on QB8R-6: REFUSED has its own wording, never a hold and never overdue.
  it('words a REFUSED item as refused by the server, blocking the till, and never overdue', async () => {
    list = () =>
      json({
        items: [
          item({
            kind: 'REFUSED',
            reason: 'POS_SOMETHING_REFUSED',
            lines: [],
            firstHeldAt: null,
            lastHeldAt: null,
            reHeldCount: 0,
            firstRefusedAt: '2026-11-04T05:00:00Z',
            lastRefusedAt: '2026-11-04T06:30:00Z',
            reRefusedCount: 1,
            overdue: true,
          }),
        ],
        truncated: false,
      })
    await open()
    expect(await screen.findByText(i18n.t('pos.heldSales.refused', { number: 'T3-000041' }))).toBeTruthy()
    expect(text()).toContain('Refused first 04/11/2026, 09:00:00 GMT+4, last 04/11/2026, 10:30:00 GMT+4.')
    expect(text()).toContain('Refused again since: 1.')
    expect(text()).not.toContain(i18n.t('pos.heldSales.overdue'))
    expect(document.querySelector('.text-danger-700')).toBeNull()
    expect(text()).not.toContain('Held:')
    expect(text()).not.toContain(i18n.t('pos.heldSales.otherKind'))
    expect(text()).not.toContain('POS_SOMETHING_REFUSED')
  })

  it('an item marked HELD reads as before, overdue included', async () => {
    list = () => json({ items: [item({ kind: 'HELD', overdue: true })], truncated: false })
    await open()
    expect(await screen.findByText(i18n.t('pos.heldSales.overdue'))).toBeTruthy()
    expect(text()).toContain('Held: a goods line has no HS code. Lines: 2, 5.')
  })

  it('has the review wording in both languages', () => {
    for (const key of ['withheld', 'withheldTimes', 'otherKind', 'refused', 'refusedTimes', 'reRefused', 'rowNoNumber'] as const) {
      expect(ar.pos.heldSales[key]).toBeTruthy()
      expect(ar.pos.heldSales[key]).not.toBe(en.pos.heldSales[key])
    }
  })

  it('says when more held sales exist than shown', async () => {
    list = () => json({ items: [item()], truncated: true })
    await open()
    expect(await screen.findByText('More held sales exist than shown.')).toBeTruthy()
  })

  it('says when nothing is held', async () => {
    list = () => json({ items: [], truncated: false })
    await open()
    expect(await screen.findByText(i18n.t('pos.heldSales.none'))).toBeTruthy()
  })

  it('asks nothing without pos.read', async () => {
    permissions = ['pos.sell']
    await open()
    expect(await screen.findByText(i18n.t('pos.heldSales.notAllowed'))).toBeTruthy()
    await waitFor(() => expect(calls).toContain('/api/v1/me/entitlements'))
    expect(asked()).toEqual([])
  })

  it('has every sentence in Arabic, with the same placeholders', () => {
    const flat = (node: unknown, prefix = ''): Record<string, string> =>
      Object.entries(node as Record<string, unknown>).reduce<Record<string, string>>((all, [key, value]) => {
        if (typeof value === 'string') all[prefix + key] = value
        else Object.assign(all, flat(value, `${prefix}${key}.`))
        return all
      }, {})
    const enKeys = flat(en.pos.heldSales)
    const arKeys = flat(ar.pos.heldSales)
    expect(Object.keys(arKeys).sort()).toEqual(Object.keys(enKeys).sort())
    const holes = (value: string) => (value.match(/\{\{\w+\}\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(enKeys)) expect(holes(arKeys[key]), key).toEqual(holes(value))
  })
})
