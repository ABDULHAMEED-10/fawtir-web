import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import {
  resetOpenSale,
  setSaleDiscount,
  setSaleLines,
  startNewSale,
  useFinishedSale,
  useOpenSale,
} from '../../lib/posSale'
import { noteQueueSender, resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'

// Stage B E-01: once a sale's request went out with no definite answer, the till offers only the
// same sale again, under the same key, or today's sales; the basket and payment cannot change.

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
  scopes: [],
  featureFlags: {},
}

// No QR profile on the till's detail: a walk-in sale cannot be kept offline, so an unknown outcome
// leaves the sale held on the screen rather than queued.
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
  openShift: { shiftId: 'sh-1', cashier: { userId: 'u-1', name: 'Maryam' }, openedAt: '2026-10-28T03:00:00Z' },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const SOLD = {
  saleId: 's-1',
  invoiceNumber: 'NZW-T01-INV-2026-000049',
  receipt: { qr: { status: 'PENDING' } },
  filing: { dispatchState: 'QUEUED', acceptedAt: null },
  warnings: [],
}

let posts: { key: string; body: string }[]
let replies: (() => Response)[]

function Done() {
  const done = useFinishedSale()
  return <p>done {done?.sale?.invoiceNumber ?? done?.queuedNumber}</p>
}

function Lines() {
  const { lines, saleDiscount } = useOpenSale()
  return <p>{`lines ${lines.length} discount ${saleDiscount.value}`}</p>
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  noteQueueSender('u-1')
  resetSharedRequests()
  forgetEntitlements()
  window.localStorage.clear()
  posts = []
  replies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url === '/api/v1/pos/tills/till-1') return json(TILL)
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        posts.push({ key: (init.headers as Record<string, string>)['Idempotency-Key'], body: String(init.body) })
        return (replies.shift() ?? (() => json(SOLD, 201)))()
      }
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderPayment = () =>
  render(
    <MemoryRouter initialEntries={['/pos/payment']}>
      <Routes>
        <Route path="/pos/payment" element={<><PosPaymentPage /><Lines /></>} />
        <Route path="/pos/done" element={<Done />} />
        <Route path="/pos/today" element={<p>today’s sales</p>} />
      </Routes>
    </MemoryRouter>,
  )

const retry = () => screen.getByRole('button', { name: i18n.t('pos.pay.uncertain.retry') }) as HTMLButtonElement

async function sendIntoUnknown(status: number) {
  replies.push(() => new Response('', { status }))
  renderPayment()
  fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
  expect(await screen.findByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
}

describe('a sale whose outcome is unknown (E-01)', () => {
  it.each([502, 503, 504])('after an uncoded %i, nothing but the same sale again or today’s sales', async (status) => {
    await sendIntoUnknown(status)
    expect(screen.getByText(i18n.t('pos.refusal.offlineQrUnavailableAfterSend'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Finish the sale' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Take .* in cash/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Card/ })).toBeNull()
    expect(screen.getByRole('link', { name: i18n.t('pos.pay.uncertain.checkToday') })).toBeTruthy()
  })

  it.each([
    ['emptied', () => setSaleLines([])],
    ['discounted', () => setSaleDiscount({ type: 'PERCENTAGE', value: '50' })],
    ['started afresh', () => startNewSale()],
  ])('the basket cannot be %s while it is held', async (_how, change) => {
    await sendIntoUnknown(503)
    const before = screen.getByText(/^lines /).textContent
    act(() => change())
    expect(screen.getByText(/^lines /).textContent).toBe(before)
    expect(before).toContain(`lines ${SAMPLE_SALE.length}`)
  })

  it('sends the same sale again under the same key and with the same body, then shows its receipt', async () => {
    await sendIntoUnknown(503)
    fireEvent.click(retry())
    expect(await screen.findByText('done NZW-T01-INV-2026-000049')).toBeTruthy()
    expect(posts).toHaveLength(2)
    expect(posts[1].key).toBe(posts[0].key)
    expect(posts[1].body).toBe(posts[0].body)
  })

  it('stays held while the answer is still unknown, and keeps the key', async () => {
    await sendIntoUnknown(504)
    replies.push(() => new Response('', { status: 502 }))
    fireEvent.click(retry())
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(await screen.findByText(i18n.t('pos.pay.uncertain.title'))).toBeTruthy()
    expect(posts[1].key).toBe(posts[0].key)
  })

  it('a coded refusal of the same key settles it: the sale may be changed again', async () => {
    await sendIntoUnknown(503)
    replies.push(() => json({ type: 'about:blank', status: 409, code: 'POS_TILL_NOT_OPEN' }, 409))
    fireEvent.click(retry())
    expect(await screen.findByRole('button', { name: 'Finish the sale' })).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.title'))).toBeNull()
    act(() => setSaleLines([]))
    expect(screen.getByText(/^lines /).textContent).toContain('lines 0')
  })

  it('Check today’s sales goes to the day’s list', async () => {
    await sendIntoUnknown(503)
    fireEvent.click(screen.getByRole('link', { name: i18n.t('pos.pay.uncertain.checkToday') }))
    expect(await screen.findByText('today’s sales')).toBeTruthy()
  })
})

// RB-1 STUCK-QR (owner Option 1), TEMPORARY: the server's 422 is definite; nothing was charged,
// numbered or printed, and the cart stays as it was.
describe('a sale the server cannot issue with a QR (STUCK-QR)', () => {
  it('says so, keeps the cart, and does not hold the sale', async () => {
    replies.push(() =>
      json({ type: 'about:blank', status: 422, code: 'POS_SALE_QR_UNAVAILABLE_FOR_BUYER' }, 422),
    )
    renderPayment()
    fireEvent.click(await screen.findByRole('button', { name: /Take 5.649 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    expect(await screen.findByText(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'))).toBeTruthy()
    expect(i18n.t('pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER')).toMatch(/Nothing was charged, numbered or printed/)
    expect(screen.getByRole('button', { name: 'Finish the sale' })).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.pay.uncertain.title'))).toBeNull()
    expect(screen.getByText(/^lines /).textContent).toContain(`lines ${SAMPLE_SALE.length}`)
    expect(window.localStorage.getItem('fawtir.pos.queue') ?? '[]').toBe('[]')
  })

  it('has the wording in both languages', () => {
    const key = 'pos.refusal.POS_SALE_QR_UNAVAILABLE_FOR_BUYER'
    expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
    expect(i18n.t(key, { lng: 'ar' })).not.toBe(i18n.t(key, { lng: 'en' }))
  })
})
