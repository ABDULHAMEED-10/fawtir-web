import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosPage } from './PosPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, useOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { playErrorBeep } from '../../lib/posBeep'

vi.mock('../../lib/posBeep', () => ({ playErrorBeep: vi.fn() }))

/**
 * Barcode scanning at the till (Abdul, 30 Oct 2026): the shelf first, then the server's lookup
 * (backend V509) for a code the shelf does not hold, a size's own barcode adding that size
 * directly, an unknown code said and beeped, and scans caught wherever the cursor is except in a
 * field a person types in.
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

const variant = (id: string, size: string, barcode: string | null, price: number) => ({
  id,
  sizeId: `s-${id}`,
  size,
  optionId: null,
  option: null,
  name: `Coffee beans · ${size}`,
  code: id.toUpperCase(),
  priceOverride: null,
  price,
  onSale: true,
  branchPrice: price,
  barcode,
})

const SHELF = [
  product('cups', 'Takeaway cups', {
    barcode: '6290000000011',
    sizes: [],
    options: [],
    variants: [],
    addOns: [],
    stock: { onHand: 0, reorderLevel: 4, state: 'OUT', variants: [] },
  }),
  product('beans', 'Coffee beans', {
    sizes: [
      { id: 's-v-250', name: '250 g', nameAr: null, priceDelta: 0, sortOrder: 0 },
      { id: 's-v-1k', name: '1 kg', nameAr: null, priceDelta: 6, sortOrder: 1 },
    ],
    options: [],
    variants: [variant('v-250', '250 g', null, 2), variant('v-1k', '1 kg', '6290000000028', 8)],
    addOns: [],
  }),
]

/** On the server only: a branch with more items than the shelf reads. */
const FAR = product('far', 'Cardamom tin', {
  barcode: '6290000000035',
  sizes: [],
  options: [],
  variants: [],
  addOns: [],
  matchedVariantId: null,
})

const FAR_SIZED = product('saffron', 'Saffron', {
  sizes: [
    { id: 's-sf-1', name: '1 g', nameAr: null, priceDelta: 0, sortOrder: 0 },
    { id: 's-sf-5', name: '5 g', nameAr: null, priceDelta: 4, sortOrder: 1 },
  ],
  options: [],
  variants: [
    { ...variant('sf-1', '1 g', null, 2), name: 'Saffron · 1 g' },
    { ...variant('sf-5', '5 g', '6290000000042', 6), name: 'Saffron · 5 g' },
  ],
  addOns: [],
  matchedVariantId: 'sf-5',
})

type ServerRow = { barcode?: string; variants: { barcode: string | null }[] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let calls: string[]
let offline: boolean
let lookupAnswer: (barcode: string) => Response

const page = (rows: unknown[]) =>
  json({ content: rows, page: 0, size: 200, totalElements: rows.length })

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale([])
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  vi.mocked(playErrorBeep).mockClear()
  calls = []
  offline = false
  lookupAnswer = (barcode) =>
    page(
      ([FAR, FAR_SIZED] as unknown as ServerRow[]).filter(
        (row) => row.barcode === barcode || row.variants.some((v) => v.barcode === barcode),
      ),
    )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (offline) throw new TypeError('Failed to fetch')
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/products?')) {
        const barcode = new URL(url, 'http://x').searchParams.get('barcode')
        return barcode ? lookupAnswer(barcode) : page(SHELF)
      }
      if (url === '/api/v1/catalog/groups') return json({ groups: [] })
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

const renderTill = async () => {
  render(
    <MemoryRouter initialEntries={['/pos']}>
      <Routes>
        <Route
          path="/pos"
          element={
            <>
              <PosPage />
              <Lines />
              <input aria-label="a field a person types in" />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText('Coffee beans', { selector: 'span' })
}

const lines = () => screen.getByTestId('lines').textContent

/** What a USB scanner does: the code, key by key and fast, then Enter, at whatever has focus. */
const scanAt = (target: Element, code: string) => {
  for (const key of code) fireEvent.keyDown(target, { key })
  fireEvent.keyDown(target, { key: 'Enter' })
}

const scanBox = () =>
  screen.getByPlaceholderText('Scan a barcode, or type to find something…') as HTMLInputElement

const scanIntoBox = (code: string) => {
  fireEvent.change(scanBox(), { target: { value: code } })
  fireEvent.keyDown(scanBox(), { key: 'Enter' })
}

const lookups = () => calls.filter((url) => url.includes('barcode='))

describe('barcode scanning at the till', () => {
  it('adds a product found on the shelf by its own barcode, without asking the server', async () => {
    await renderTill()
    scanIntoBox('6290000000011')
    await waitFor(() => expect(lines()).toBe('CUPSx1'))
    expect(lookups()).toHaveLength(0)
    expect(scanBox().value).toBe('')
    // Out of stock is a flag only: a second scan still adds it.
    scanIntoBox('6290000000011')
    await waitFor(() => expect(lines()).toBe('CUPSx2'))
  })

  it("adds a size directly by the size's own barcode, without the chooser", async () => {
    await renderTill()
    scanIntoBox('6290000000028')
    await waitFor(() => expect(lines()).toBe('V-1Kx1'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("looks a code the shelf does not hold up on the server, in the till's branch", async () => {
    await renderTill()
    scanIntoBox('6290000000035')
    await waitFor(() => expect(lines()).toBe('FARx1'))
    const url = new URL(lookups()[0], 'http://x')
    expect(url.searchParams.get('branchId')).toBe('b-1')
    expect(url.searchParams.get('barcode')).toBe('6290000000035')
    expect(url.searchParams.get('include')).toBe('variants,addOns,stock')
    expect(url.searchParams.get('includeUnavailable')).toBeNull()
  })

  it('adds the size the server names (matchedVariantId) directly', async () => {
    await renderTill()
    scanIntoBox('6290000000042')
    await waitFor(() => expect(lines()).toBe('SF-5x1'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('an unknown code says so and beeps; nothing is added', async () => {
    await renderTill()
    scanIntoBox('9999999999')
    expect(await screen.findByText(/No item with barcode/)).toBeTruthy()
    expect(screen.getByText('9999999999').getAttribute('dir')).toBe('ltr')
    expect(playErrorBeep).toHaveBeenCalledTimes(1)
    expect(lines()).toBe('')
    // Typing clears the message.
    fireEvent.change(scanBox(), { target: { value: 'c' } })
    expect(screen.queryByText(/No item with barcode/)).toBeNull()
  })

  it('an older server without the lookup (404, or a product with another barcode) reads as not found', async () => {
    lookupAnswer = () => json({ type: 'about:blank', status: 404 }, 404)
    await renderTill()
    scanIntoBox('6290000000035')
    expect(await screen.findByText(/No item with barcode/)).toBeTruthy()
    lookupAnswer = () => page([{ ...FAR, barcode: 'something-else', matchedVariantId: undefined }])
    scanIntoBox('6290000000035')
    await waitFor(() => expect(playErrorBeep).toHaveBeenCalledTimes(2))
    expect(lines()).toBe('')
  })

  it('catches a scan with the cursor anywhere on the page, not only in the scan box', async () => {
    await renderTill()
    const tile = screen.getByText('Coffee beans', { selector: 'span' }).closest('button')!
    tile.focus()
    scanAt(tile, '6290000000011')
    await waitFor(() => expect(lines()).toBe('CUPSx1'))
    // The scan's Enter did not press the focused tile (that would open the size chooser).
    expect(screen.queryByRole('dialog')).toBeNull()
    scanAt(document.body, '6290000000028')
    await waitFor(() => expect(lines()).toBe('CUPSx1,V-1Kx1'))
  })

  it('leaves a field a person types in alone', async () => {
    await renderTill()
    const field = screen.getByLabelText('a field a person types in')
    field.focus()
    scanAt(field, '6290000000011')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(lines()).toBe('')
    expect(playErrorBeep).not.toHaveBeenCalled()
  })

  it('offline: the shelf still answers; a code it does not hold is not found', async () => {
    await renderTill()
    offline = true
    scanIntoBox('6290000000028')
    await waitFor(() => expect(lines()).toBe('V-1Kx1'))
    scanIntoBox('6290000000035')
    expect(await screen.findByText(/No item with barcode/)).toBeTruthy()
    expect(lines()).toBe('V-1Kx1')
  })

  it('words typed in the scan box that the search matches are a search, not an unknown barcode', async () => {
    await renderTill()
    scanIntoBox('Coffee')
    await waitFor(() => expect(lookups()).toHaveLength(1))
    expect(screen.queryByText(/No item with barcode/)).toBeNull()
    expect(playErrorBeep).not.toHaveBeenCalled()
    expect(scanBox().value).toBe('Coffee')
  })
})
