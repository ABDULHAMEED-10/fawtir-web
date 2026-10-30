import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosPage } from './PosPage'
import { PosRefundPage } from './PosRefundPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, useOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

/**
 * The till on the fields of backend #808 and #815 (not deployed on 29 Oct 2026): sizes, add-ons
 * and stock on the shelf's list rows, and the filing on the refund lookup. Each is read when the
 * server sends it, and the till works as before when it does not.
 */

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.refund', 'stock.read'],
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

const product = (id: string, name: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: id.toUpperCase(),
  name,
  nameAr: null,
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 2,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  active: true,
  version: 1,
  effectivePrice: 2,
  availableHere: true,
  sizes: null,
  options: null,
  variants: null,
  addOns: null,
  ...patch,
})

/** The rows as #808 and #815 answer them: a cup out of stock, beans in two sizes. */
const NEW_ROWS = [
  product('cups', 'Takeaway cups', {
    sizes: [],
    options: [],
    variants: [],
    addOns: [],
    stock: { onHand: 0, reorderLevel: 4, state: 'OUT', variants: [] },
  }),
  product('beans', 'Coffee beans', {
    sizes: [
      { id: 's-1', name: '250 g', nameAr: null, priceDelta: 0, sortOrder: 0 },
      { id: 's-2', name: '1 kg', nameAr: null, priceDelta: 6, sortOrder: 1 },
    ],
    options: [],
    variants: [
      {
        id: 'v-1',
        sizeId: 's-1',
        size: '250 g',
        optionId: null,
        option: null,
        name: 'Coffee beans · 250 g',
        code: 'BEANS-1',
        priceOverride: null,
        price: 2,
        onSale: true,
        branchPrice: 2,
      },
      {
        id: 'v-2',
        sizeId: 's-2',
        size: '1 kg',
        optionId: null,
        option: null,
        name: 'Coffee beans · 1 kg',
        code: 'BEANS-2',
        priceOverride: null,
        price: 8,
        onSale: true,
        branchPrice: 8,
      },
    ],
    addOns: [],
    stock: {
      onHand: null,
      reorderLevel: null,
      state: null,
      variants: [
        { variantId: 'v-1', onHand: 3, reorderLevel: 2, state: 'OK' },
        { variantId: 'v-2', onHand: -1, reorderLevel: 2, state: 'BELOW_ZERO' },
      ],
    },
  }),
]

/** The same rows from a server without #808 and #815. */
const OLD_ROWS = NEW_ROWS.map((row) => ({
  ...row,
  sizes: null,
  options: null,
  variants: null,
  addOns: null,
  stock: undefined,
}))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let calls: string[]
let offline: boolean
let rows: unknown[]
let answer: (url: string) => Response | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale([])
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  calls = []
  offline = false
  rows = NEW_ROWS
  answer = () => null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (offline) throw new TypeError('Failed to fetch')
      const own = answer(url)
      if (own) return own
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/products?')) {
        return json({ content: rows, page: 0, size: 200, totalElements: rows.length })
      }
      if (url === '/api/v1/catalog/groups') return json({ groups: [] })
      if (url === '/api/v1/products/beans') return json({ ...NEW_ROWS[1], stock: null })
      if (url === '/api/v1/products/cups') return json({ ...NEW_ROWS[0], stock: null })
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function Lines() {
  const { lines } = useOpenSale()
  return (
    <p data-testid="lines">{lines.map((line) => `${line.productCode}x${line.qty}`).join(',')}</p>
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/pos"
          element={
            <>
              <PosPage />
              <Lines />
            </>
          }
        />
        <Route path="/pos/refund" element={<PosRefundPage />} />
      </Routes>
    </MemoryRouter>,
  )

const tile = async (name: string) =>
  (await screen.findByText(name, { selector: 'span' })).closest('button') as HTMLButtonElement

describe('the shelf on backend #808 and #815', () => {
  it('asks for sizes, add-ons and stock with the list, and flags the tile without blocking it', async () => {
    renderAt('/pos')
    const cups = await tile('Takeaway cups')
    expect(within(cups).getByText('Out of stock')).toBeTruthy()
    expect(cups.disabled).toBe(false)
    const list = calls.find((url) => url.startsWith('/api/v1/products?'))!
    expect(new URL(list, 'http://x').searchParams.get('include')).toBe('variants,addOns,stock')
    // A size in stock leaves the beans tile unflagged; "2 sizes" shows before any tap.
    const beans = await tile('Coffee beans')
    expect(within(beans).queryByText('Below zero')).toBeNull()
    expect(within(beans).getByText('2 sizes')).toBeTruthy()

    fireEvent.click(cups)
    await waitFor(() => expect(screen.getByTestId('lines').textContent).toBe('CUPSx1'))
  })

  it('opens the size chooser from the list row, flags the size, and reads no product', async () => {
    renderAt('/pos')
    fireEvent.click(await tile('Coffee beans'))
    const dialog = await screen.findByRole('dialog')
    const kilo = within(dialog).getByRole('button', { name: /1 kg/ })
    expect(within(kilo).getByText('Below zero')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /250 g/ }).textContent).not.toContain(
      'Below zero',
    )
    fireEvent.click(kilo)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the sale' }))
    await waitFor(() => expect(screen.getByTestId('lines').textContent).toBe('BEANS-2x1'))
    expect(calls.some((url) => url.startsWith('/api/v1/products/'))).toBe(false)
  })

  it('sells an item never opened while offline, from the kept shelf', async () => {
    const first = renderAt('/pos')
    await tile('Coffee beans')
    first.unmount()
    offline = true
    resetSharedRequests()
    renderAt('/pos')
    fireEvent.click(await tile('Coffee beans'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the sale' }))
    await waitFor(() => expect(screen.getByTestId('lines').textContent).toBe('BEANS-1x1'))
  })

  it('works as before against a server without them: no flag, the product read on a tap', async () => {
    rows = OLD_ROWS
    renderAt('/pos')
    const cups = await tile('Takeaway cups')
    expect(within(cups).queryByText('Out of stock')).toBeNull()
    fireEvent.click(await tile('Coffee beans'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(calls).toContain('/api/v1/products/beans')
  })
})

const LOOKUP = {
  saleId: 's-1',
  invoiceId: 'inv-1',
  invoiceNumber: 'NZW-T01-INV-2026-000001',
  soldAt: '2026-10-29T08:00:00Z',
  transactionType: 'SIMPLIFIED',
  branch: { id: 'b-1', name: 'Nizwa' },
  customer: { kind: 'WALK_IN', customerId: 'c-0', name: null },
  headerDiscount: null,
  lines: [
    {
      lineNumber: 1,
      role: 'ITEM',
      productId: 'p-1',
      description: 'Butter croissant',
      quantitySold: 1,
      quantityRefunded: 0,
      unitPrice: 1,
      discount: null,
      vatRate: 5,
      vatCategory: 'S',
      refundable: true,
    },
  ],
  paid: { byMethod: [{ method: 'CASH', amount: 1.05 }], total: 1.05, paidBack: 0 },
  total: 1.05,
  tip: 0,
  tipMethod: null,
  credited: 0,
  owed: 0,
  creditNoteNumbers: [],
}

describe('the refund screen on backend #808 (P.31)', () => {
  const filing = (acceptedAt: string | null) => ({
    dispatchState: 'DISPATCHED',
    tddStatus: acceptedAt ? 'ACCEPTED' : null,
    acceptedAt,
    channel: 'TAX_AUTHORITY',
  })

  it('says the Authority accepted the invoice when the lookup says so', async () => {
    answer = (url) =>
      url.startsWith('/api/v1/pos/refund-lookup')
        ? json({ ...LOOKUP, filing: filing('2026-10-29T08:00:05Z') })
        : null
    renderAt('/pos/refund?invoice=NZW-T01-INV-2026-000001')
    expect(await screen.findByText('Accepted by the OTA')).toBeTruthy()
  })

  it('says nothing while it is not accepted, or when the lookup does not say', async () => {
    answer = (url) =>
      url.startsWith('/api/v1/pos/refund-lookup') ? json({ ...LOOKUP, filing: filing(null) }) : null
    const first = renderAt('/pos/refund?invoice=NZW-T01-INV-2026-000001')
    await screen.findByText('Butter croissant')
    expect(screen.queryByText('Accepted by the OTA')).toBeNull()
    first.unmount()
    resetSharedRequests()
    answer = (url) => (url.startsWith('/api/v1/pos/refund-lookup') ? json(LOOKUP) : null)
    renderAt('/pos/refund?invoice=NZW-T01-INV-2026-000001')
    await screen.findByText('Butter croissant')
    expect(screen.queryByText('Accepted by the OTA')).toBeNull()
  })
})
