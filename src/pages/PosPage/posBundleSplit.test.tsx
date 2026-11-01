import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosPage } from './PosPage'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, useOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { invoiceLinesFor, totalsFor } from '../../lib/pos'
import { posLineRefs } from '../../lib/posInvoice'
import { bundleSaleLine, shelfItem, type PosItem } from '../../lib/posShelf'
import { creditFor } from '../../lib/posRefund'
import { DESIGN_REFERENCE } from '../../lib/invoiceDraft'
import { ApiError } from '../../api'
import { posRefusalKey } from '../../lib/posRefusals'

/**
 * A bundle whose parts differ in VAT at the till (E2E 30 Oct 2026, H-2). The figures are worked by
 * hand from the server's `BundleInvoiceLines.partUnitPrices`: a 2.000 bundle of Coffee (1.600 alone,
 * 5%) and Beans (0.900 alone, zero-rated). Together they sell for 2.500 alone. Beans, not the
 * balancing part: 2.000 x 0.900 / 2.500 = 0.720. Coffee, the larger share, takes what is left:
 * 1.280. VAT is 5% of 1.280 = 0.064, so 2.064 to pay, not the 2.100 of 5% on the whole bundle.
 */

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
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

const row = (id: string, name: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: id.toUpperCase(),
  name,
  nameAr: null,
  description: null,
  defaultUnitCode: 'C62',
  defaultUnitPrice: 2,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  active: true,
  version: 1,
  effectivePrice: 2,
  availableHere: true,
  staffCanChangePrice: false,
  barcode: null,
  itemKind: 'BUNDLE',
  sizes: [],
  options: [],
  variants: [],
  addOns: [],
  ...patch,
})

const MIXED = row('mixed', 'Breakfast')
const SAME = row('same', 'Two teas', { defaultUnitPrice: 3, effectivePrice: 3 })
const TEA = row('tea', 'Tea', { itemKind: 'HAND_OVER', defaultUnitPrice: 1, effectivePrice: 1 })

const part = (id: string, name: string, unitPrice: number, category: string, rate: number) => ({
  productId: id,
  variantId: null,
  productCode: id.toUpperCase(),
  description: `Breakfast: ${name}`,
  unitCode: 'C62',
  quantity: 1,
  unitPrice,
  discount: { type: 'PERCENTAGE', value: 0 },
  taxCategory: {
    code: category,
    en16931Category: category,
    rate,
    exemptionReason: null,
    exemptionReasonCode: category === 'Z' ? 'VATZR-OM-01' : null,
  },
  classification: { goodsOrService: 'G', hsCode: '090111000000', serviceTypeCode: null },
  bundleId: 'mixed',
})

const MIXED_LINES = {
  bundleId: 'mixed',
  branchId: 'b-1',
  quantity: 1,
  split: true,
  splitBecause: 'VAT_TREATMENTS_DIFFER',
  lines: [part('coffee', 'Coffee', 1.28, 'S', 5), part('beans', 'Beans', 0.72, 'Z', 0)],
}

const SAME_LINES = {
  bundleId: 'same',
  branchId: 'b-1',
  quantity: 1,
  split: false,
  splitBecause: null,
  lines: [{ ...part('same', 'Two teas', 3, 'S', 5), description: 'Two teas', bundleId: null }],
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let offline: boolean
let calls: string[]
/** The bundle ids whose lines the "server" answers while online. */
let serving: Record<string, unknown>

beforeEach(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  forgetEntitlements()
  forgetWorkingBranch()
  resetSharedRequests()
  resetOpenSale()
  await resetPosQueue()
  await i18n.changeLanguage('en')
  offline = false
  calls = []
  serving = { mixed: MIXED_LINES, same: SAME_LINES }
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
        return json({ content: [MIXED, SAME, TEA], page: 0, size: 200, totalElements: 3 })
      }
      if (url === '/api/v1/catalog/groups') return json({ groups: [] })
      const lines = url.match(/^\/api\/v1\/bundles\/([^/]+)\/invoice-lines/)
      if (lines && serving[lines[1]]) return json(serving[lines[1]])
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function Lines() {
  const { lines } = useOpenSale()
  return (
    <p data-testid="sale">
      {invoiceLinesFor(lines)
        .map((line) => `${line.productId}@${line.unitPrice}x${line.quantity}`)
        .join(' ')}
    </p>
  )
}

function renderTill() {
  return render(
    <MemoryRouter initialEntries={['/pos']}>
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
      </Routes>
    </MemoryRouter>,
  )
}

const tile = (name: string) =>
  screen.findByRole('button', { name: new RegExp(`^${name}`) }).then((button) => {
    fireEvent.click(button)
  })

const sale = () => screen.getByTestId('sale').textContent
const panel = () =>
  screen
    .getAllByRole('button', { name: 'Take payment' })
    .map((button) => button.closest('aside'))
    .find(Boolean) as HTMLElement

const mixedItem = (): PosItem => shelfItem(MIXED as never, false)
const mixedLine = () =>
  bundleSaleLine(DESIGN_REFERENCE.taxCategories, mixedItem(), MIXED_LINES as never)

describe('what a split bundle comes to', () => {
  it('charges each part at its own VAT', () => {
    const totals = totalsFor([mixedLine()])
    expect(totals.items).toBe(2000)
    expect(totals.vat).toBe(64)
    expect(totals.sale).toBe(2064)
    expect(totals.vatRates.sort()).toEqual([0, 5])
  })

  it('scales the parts with the quantity', () => {
    const totals = totalsFor([{ ...mixedLine(), qty: 3 }])
    expect(totals.items).toBe(6000)
    // 5% of 3.840.
    expect(totals.vat).toBe(192)
    expect(totals.sale).toBe(6192)
  })

  it('files one line per part, each an ITEM of the part with the bundle named', () => {
    const line = { ...mixedLine(), qty: 2 }
    const filed = invoiceLinesFor([line])
    expect(
      filed.map((entry) => [entry.productId, entry.bundleId, entry.quantity, entry.unitPrice]),
    ).toEqual([
      ['coffee', 'mixed', '2', '1.280'],
      ['beans', 'mixed', '2', '0.720'],
    ])
    expect(filed.map((entry) => entry.taxCode)).toEqual(['S5', 'Z0'])
    expect(filed[1].exemptionReasonCode).toBe('VATZR-OM-01')
    // ITEM lines for the parts: that is what lowers the parts' stock on the server.
    expect(posLineRefs([line])).toEqual([
      expect.objectContaining({ lineNumber: 1, role: 'ITEM', productId: 'coffee', addOnId: null }),
      expect.objectContaining({ lineNumber: 2, role: 'ITEM', productId: 'beans', addOnId: null }),
    ])
  })

  it('keeps a part sold by several in one bundle, at its price per unit', () => {
    // A 1.000 bundle of 3 x 0.200 (5%) and 1 x 0.400 (0%).
    const line = bundleSaleLine(DESIGN_REFERENCE.taxCategories, mixedItem(), {
      ...MIXED_LINES,
      lines: [
        { ...part('cup', 'Cup', 0.2, 'S', 5), quantity: 3 },
        { ...part('lid', 'Lid', 0.4, 'Z', 0), quantity: 1 },
      ],
    } as never)
    expect(line.price).toBe(1000)
    expect(invoiceLinesFor([{ ...line, qty: 2 }])[0].quantity).toBe('6')
    expect(totalsFor([{ ...line, qty: 2 }]).vat).toBe(60)
  })

  it('agrees with the local server on a real bundle', () => {
    // GET /bundles/{id}/invoice-lines, Head branch: 2 croissants at 0.640 (5%) + 1 milk at 0.720 (0%).
    // POST /pos/sales answered totals 2.000 / VAT 0.064 / 2.064 and moved stock by -2 and -1.
    const line = bundleSaleLine(DESIGN_REFERENCE.taxCategories, mixedItem(), {
      ...MIXED_LINES,
      lines: [
        { ...part('croissant', 'Butter Croissant', 0.64, 'S', 5), quantity: 2 },
        part('milk', 'Fresh Milk 1 L', 0.72, 'Z', 0),
      ],
    } as never)
    expect(line.price).toBe(2000)
    expect(totalsFor([line]).vat).toBe(64)
    expect(totalsFor([line]).sale).toBe(2064)
  })

  it('gives each returned part back at its own VAT', () => {
    const lookupLine = (lineNumber: number, unitPrice: number, vatRate: number) => ({
      lineNumber,
      role: 'ITEM',
      productId: 'p',
      description: 'part',
      quantitySold: 1,
      quantityRefunded: 0,
      unitPrice,
      discount: null,
      vatRate,
      vatCategory: vatRate ? 'S' : 'Z',
      refundable: true,
    })
    const lookup = {
      lines: [lookupLine(1, 1.28, 5), lookupLine(2, 0.72, 0)],
      headerDiscount: null,
    } as never
    expect(creditFor(lookup, [{ lineNumber: 1, qty: 1 }]).back).toBe(1344)
    expect(creditFor(lookup, [{ lineNumber: 2, qty: 1 }]).back).toBe(720)
    expect(
      creditFor(lookup, [
        { lineNumber: 1, qty: 1 },
        { lineNumber: 2, qty: 1 },
      ]).back,
    ).toBe(2064)
  })
})

describe('on the till', () => {
  it('shows one row at the right total and asks the server how it goes on the invoice', async () => {
    renderTill()
    await tile('Breakfast')
    await waitFor(() => expect(sale()).toBe('coffee@1.280x1 beans@0.720x1'))
    expect(within(panel()).getByText('Breakfast')).toBeTruthy()
    expect(screen.getByText(/Coffee, Beans/)).toBeTruthy()
    expect(within(panel()).getByText('2.064')).toBeTruthy()
    expect(within(panel()).getByText('0.064')).toBeTruthy()
    expect(within(panel()).queryByText('2.100')).toBeNull()
    expect(
      calls.some((url) => url.includes('/bundles/mixed/invoice-lines?branchId=b-1&quantity=1')),
    ).toBe(true)
  })

  it('adds to the row when tapped again', async () => {
    renderTill()
    await tile('Breakfast')
    await waitFor(() => expect(sale()).toContain('x1'))
    await tile('Breakfast')
    await waitFor(() => expect(sale()).toBe('coffee@1.280x2 beans@0.720x2'))
  })

  it('leaves a same-VAT bundle on its one line', async () => {
    renderTill()
    await tile('Two teas')
    await waitFor(() => expect(sale()).toBe('same@3.000x1'))
  })

  it('asks nothing extra for an item that is not a bundle when tapped', async () => {
    renderTill()
    await tile('Tea')
    await waitFor(() => expect(sale()).toBe('tea@1.000x1'))
  })

  it('splits offline from the copy it read while online', async () => {
    renderTill()
    await screen.findByRole('button', { name: /^Breakfast/ })
    await waitFor(() =>
      expect(calls.filter((url) => url.includes('/invoice-lines')).length).toBeGreaterThanOrEqual(
        2,
      ),
    )
    offline = true
    await tile('Breakfast')
    await waitFor(() => expect(sale()).toBe('coffee@1.280x1 beans@0.720x1'))
    expect(within(panel()).getByText('2.064')).toBeTruthy()
  })

  it('says No price yet for a split bundle whose parts come to nothing, and adds nothing', async () => {
    serving = {
      mixed: {
        ...MIXED_LINES,
        lines: [part('coffee', 'Coffee', 0, 'S', 5), part('beans', 'Beans', 0, 'Z', 0)],
      },
    }
    renderTill()
    await tile('Breakfast')
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(sale()).toBe('')
  })

  it('keeps a split bundle with one part at 0.000 when the bundle has a price', async () => {
    serving = {
      mixed: {
        ...MIXED_LINES,
        lines: [part('coffee', 'Coffee', 2, 'S', 5), part('beans', 'Beans', 0, 'Z', 0)],
      },
    }
    renderTill()
    await tile('Breakfast')
    await waitFor(() => expect(sale()).toBe('coffee@2.000x1 beans@0.000x1'))
  })

  it('refuses a bundle offline in words when it has no copy, and puts nothing on the sale', async () => {
    serving = {}
    renderTill()
    const button = await screen.findByRole('button', { name: /^Breakfast/ })
    offline = true
    fireEvent.click(button)
    expect((await screen.findByRole('alert')).textContent).toContain("can't be sold while offline")
    expect(sale()).toBe('')
  })

  it('files the split lines through the payment screen', async () => {
    const posted: Record<string, unknown>[] = []
    const reply = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json(
          {
            type: 'https://api.fawtir.om/problems/validation-failed',
            status: 422,
            code: 'POS_BUNDLE_SPLIT_REQUIRED',
            line: 1,
          },
          422,
        )
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    })
    vi.stubGlobal('fetch', reply)
    resetOpenSale([mixedLine()])
    render(
      <MemoryRouter initialEntries={['/pos/payment']}>
        <Routes>
          <Route path="/pos/payment" element={<PosPaymentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect((await screen.findAllByText('2.064')).length).toBeGreaterThan(0)
    fireEvent.change(await screen.findByLabelText('Cash handed over'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Take 2.064 in cash/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
    await waitFor(() => expect(posted.length).toBe(1))
    const draft = posted[0].draft as { lines: Record<string, unknown>[] }
    expect(draft.lines.map((line) => [line.productId, line.bundleId, line.unitPrice])).toEqual([
      ['coffee', 'mixed', 1.28],
      ['beans', 'mixed', 0.72],
    ])
    expect((posted[0].payments as { amount: number }[])[0].amount).toBe(2.064)
    // If it is still refused (the bundle changed under an open sale), it is said in words.
    expect((await screen.findByRole('alert')).textContent).toContain('add it again')
  })
})

describe('the refusal', () => {
  it('has its own sentence, in both languages', async () => {
    const error = new ApiError({
      status: 422,
      problemType: 'validation-failed',
      code: 'POS_BUNDLE_SPLIT_REQUIRED',
    })
    const key = posRefusalKey(error)
    expect(key).toBe('pos.refusal.POS_BUNDLE_SPLIT_REQUIRED')
    expect(i18n.t(key)).toContain('add it again')
    await i18n.changeLanguage('ar')
    expect(i18n.t(key)).not.toBe(key)
    expect(i18n.t(key)).not.toContain('add it again')
  })
})
