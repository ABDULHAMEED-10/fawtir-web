import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { resetOpenSale } from '../../lib/posSale'
import {
  flushQueue,
  noteQueueSender,
  queuedFor,
  resetPosQueue,
  type QueuedSale,
} from '../../lib/posQueue'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { PosClosePage } from './PosClosePage'

// NOT RUN (batch 42, static only). OFF-4: closing the till with sales still queued on the device.
// The close is warned about and never stopped (owner batch 42 prompt: blocking the close is a new
// policy and is not approved). The harness is posCloseLateCash.test.tsx's.

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
const CLOSED = {
  shiftId: 'sh-1',
  closedAt: '2026-10-29T14:00:00Z',
  countedCash: 35.649,
  expectedCash: 35.649,
  overShort: 0,
  floatLeft: 30,
  toBank: 5.649,
  cardTerminalTotal: 0,
  cardTerminalDifference: 0,
  cardDifferenceNote: null,
}

const entry = (value: number, extra: Partial<QueuedSale> = {}): QueuedSale => {
  const number = `NZW-T01-INV-2026-${String(value).padStart(6, '0')}`
  return {
    key: `pos-sale-key-${value}`,
    tillId: 'till-1',
    number,
    body: {
      tillId: 'till-1',
      soldAt: '2026-10-29T10:00:00Z',
      queuedOffline: true,
      invoiceNumber: number,
      customer: { kind: 'WALK_IN' },
      draft: { lines: [] } as never,
      lineRefs: [],
      payments: [{ method: 'CASH', amount: 1.5 }],
      tip: null,
    },
    refusal: null,
    // Made by the person closing, whose session sends it by itself (owner round 5, P3b).
    madeBy: { userId: 'u-1', name: 'Maryam' },
    ...extra,
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

/** Every POST in the order it was made: the sales and the close. */
let posted: { url: string; key: string | null }[]
let salesAnswer: boolean
/** While set, the close request waits on it: a close still in flight. */
let closeGate: Promise<void> | null

/** Puts entries in the device's queue as another tab or an earlier session would have left them. */
function queueOnDevice(entries: QueuedSale[]) {
  window.localStorage.setItem('fawtir.pos.queue', JSON.stringify(entries))
  expect(queuedFor('till-1')).toHaveLength(entries.length)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
  noteQueueSender('u-1')
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  posted = []
  salesAnswer = false
  closeGate = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(ME)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        // The connection is down for sales until a test brings it back.
        if (!salesAnswer) throw new TypeError('Failed to fetch')
        const key = new Headers(init.headers).get('Idempotency-Key')
        posted.push({ url, key })
        const body = JSON.parse(String(init.body))
        return json({ saleId: key, invoiceNumber: body.invoiceNumber, warnings: [] }, 201)
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.includes('/close-preview')) return json(PREVIEW)
      if (url.endsWith('/close') && init?.method === 'POST') {
        posted.push({ url, key: new Headers(init.headers).get('Idempotency-Key') })
        if (closeGate) await closeGate
        return json(CLOSED, 201)
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderClose = () =>
  render(
    <MemoryRouter initialEntries={['/pos/close']}>
      <Routes>
        <Route path="/pos/close" element={<PosClosePage />} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const closes = () => posted.filter((post) => post.url.endsWith('/close'))
const sales = () => posted.filter((post) => post.url === '/api/v1/pos/sales')

describe('closing the till with sales still on this device (OFF-4)', () => {
  it('with an empty queue the close goes as before, with no notice', async () => {
    renderClose()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await waitFor(() => expect(closes()).toHaveLength(1))
    expect(sales()).toEqual([])
    expect(screen.queryByText(i18n.t('pos.pendingSync.closeTitle', { count: 1 }))).toBeNull()
  })

  it('says how many sales wait and names them', async () => {
    queueOnDevice([entry(49), entry(50)])
    renderClose()
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 2 })),
    ).toBeTruthy()
    expect(screen.getByText('NZW-T01-INV-2026-000049, NZW-T01-INV-2026-000050')).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.pendingSync.closeNote'))).toBeTruthy()
  })

  it('names the refused ones among them', async () => {
    queueOnDevice([entry(49, { refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true }), entry(50)])
    renderClose()
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.someRefused', { count: 1 })),
    ).toBeTruthy()
  })

  it('back online, it sends the waiting sales first, under their own keys, and has the count checked against the new figures before closing', async () => {
    queueOnDevice([entry(49), entry(50)])
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 2 }))
    salesAnswer = true
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    // The server's expected cash now includes them: the preview is read again and nothing is closed.
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.sentRecount', { count: 2 })),
    ).toBeTruthy()
    expect(closes()).toEqual([])
    expect(screen.queryByText(i18n.t('pos.pendingSync.closeTitle', { count: 2 }))).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await waitFor(() => expect(closes()).toHaveLength(1))
    expect(posted.map((post) => post.key)).toEqual([
      'pos-sale-key-49',
      'pos-sale-key-50',
      closes()[0].key,
    ])
    expect(queuedFor('till-1')).toEqual([])
  })

  it('when they cannot go it warns, keeps them, and the next press closes anyway', async () => {
    const waiting = [entry(49), entry(50)]
    queueOnDevice(waiting)
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 2 }))

    // The sales request gets no answer at all, so the flush comes back offline (ed97c219) and the
    // warning is the offline one; closeLeft is for any other outcome that leaves sales.
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.closeLeftOffline', { count: 2 })),
    ).toBeTruthy()
    expect(closes()).toEqual([])
    expect(queuedFor('till-1').map((sale) => sale.key)).toEqual(waiting.map((sale) => sale.key))

    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pendingSync.closeAnyway') }))
    await waitFor(() => expect(closes()).toHaveLength(1))
    // Closing anyway discards nothing: the sales stay on the device to go later.
    expect(queuedFor('till-1').map((sale) => sale.key)).toEqual(waiting.map((sale) => sale.key))
    expect(sales()).toEqual([])
  })

  // NOT RUN (batch 43, static only). Owner round 5, P3b: the close sends only the closer's own sales.
  it("online, a colleague's queued sale and one with no recorded maker are not sent by the close, only warned of", async () => {
    const waiting = [
      entry(49, { madeBy: { userId: 'u-2', name: 'Salim' } }),
      entry(50, { madeBy: undefined }),
    ]
    queueOnDevice(waiting)
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 2 }))
    salesAnswer = true

    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.closeLeft', { count: 2 })),
    ).toBeTruthy()
    expect(sales()).toEqual([])
    expect(closes()).toEqual([])
    expect(queuedFor('till-1').map((sale) => sale.key)).toEqual(waiting.map((sale) => sale.key))
  })

  it('Try sending again sends them when the connection is back, and the close goes as usual', async () => {
    queueOnDevice([entry(49)])
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 1 }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await screen.findByText(i18n.t('pos.pendingSync.closeLeftOffline', { count: 1 }))

    salesAnswer = true
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pendingSync.sendAgain') }))
    await waitFor(() => expect(queuedFor('till-1')).toEqual([]))
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.sentRecount', { count: 1 })),
    ).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pendingSync.closeLeftOffline', { count: 1 }))).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await waitFor(() => expect(closes()).toHaveLength(1))
    expect(sales().map((post) => post.key)).toEqual(['pos-sale-key-49'])
  })

  it('a sale refused for good is not forced through; the close is warned about, then goes', async () => {
    queueOnDevice([entry(49, { refusal: 'SIMPLIFIED_INVOICE_LIMIT', final: true })])
    salesAnswer = true
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 1 }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await screen.findByText(i18n.t('pos.pendingSync.closeLeft', { count: 1 }))
    expect(sales()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pendingSync.closeAnyway') }))
    await waitFor(() => expect(closes()).toHaveLength(1))
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  it('a sale filed after the warning (background sender, late run) reloads the figures before any close (PRV42W-2)', async () => {
    queueOnDevice([entry(49)])
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 1 }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await screen.findByRole('button', { name: i18n.t('pos.pendingSync.closeAnyway') })

    // The till's own sender files it later, outside the pre-close send.
    salesAnswer = true
    await flushQueue('till-1')
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.sentRecount', { count: 1 })),
    ).toBeTruthy()
    expect(closes()).toEqual([])
    // The form is read again, so the next press is an ordinary close, not Close anyway.
    expect(screen.queryByRole('button', { name: i18n.t('pos.pendingSync.closeAnyway') })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('pos.close.closeTill') }))
    await waitFor(() => expect(closes()).toHaveLength(1))
  })

  it('a filing while the close request is in flight does not reload the form or lose the confirmation (PRV42W-10)', async () => {
    queueOnDevice([entry(49)])
    renderClose()
    await screen.findByText(i18n.t('pos.pendingSync.closeTitle', { count: 1 }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.close.closeTill') }))
    const anyway = await screen.findByRole('button', { name: i18n.t('pos.pendingSync.closeAnyway') })

    let release!: () => void
    closeGate = new Promise<void>((resolve) => {
      release = resolve
    })
    fireEvent.click(anyway)
    await waitFor(() => expect(closes()).toHaveLength(1))

    // The background sender files the waiting sale while the close is still on its way.
    salesAnswer = true
    await flushQueue('till-1')
    expect(queuedFor('till-1')).toEqual([])

    release()
    expect(await screen.findByText(/^Closed at/)).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pendingSync.sentRecount', { count: 1 }))).toBeNull()
    expect(closes()).toHaveLength(1)
  })

  it.each(['en', 'ar'])('has its wording in %s', async (language) => {
    await i18n.changeLanguage(language)
    for (const key of [
      'pos.pendingSync.closeNote',
      'pos.pendingSync.sendAgain',
      'pos.pendingSync.closeAnyway',
      'pos.pendingSync.signOutAnyway',
      'pos.pendingSync.switchAnyway',
    ]) {
      expect(i18n.exists(key)).toBe(true)
    }
    for (const count of [1, 2, 3, 11, 100]) {
      expect(i18n.t('pos.pendingSync.closeLeft', { count })).not.toContain('pos.pendingSync')
      expect(i18n.t('pos.pendingSync.signOutLeft', { count })).not.toContain('pos.pendingSync')
    }
    await i18n.changeLanguage('en')
  })
})
