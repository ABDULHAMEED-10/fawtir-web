import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosPage } from './PosPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, useOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

/** A 0.000 item must never be sold for free by mistake (Abdul, 30 Oct 2026). */

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

const product = (id: string, name: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: id.toUpperCase(),
  name,
  nameAr: null,
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 0,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  active: true,
  version: 1,
  effectivePrice: 0,
  availableHere: true,
  staffCanChangePrice: false,
  barcode: null,
  sizes: [],
  options: [],
  variants: [],
  addOns: [],
  ...patch,
})

const variant = (
  id: string,
  sizeId: string,
  size: string,
  branchPrice: number,
  barcode: string | null = null,
) => ({
  barcode,
  id,
  sizeId,
  size,
  optionId: null,
  option: null,
  code: id.toUpperCase(),
  name: size,
  price: branchPrice,
  priceOverride: null,
  branchPrice,
  onSale: true,
})

const sizeOf = (id: string, name: string) => ({
  id,
  name,
  nameAr: null,
  priceDelta: 0,
  sortOrder: 0,
})

const addOn = (id: string, name: string, price: number) => ({
  id,
  name,
  nameAr: null,
  price,
  free: price === 0,
  sortOrder: 0,
})

const ROWS = [
  product('fixed', 'Fixed tin', { barcode: '111' }),
  product('open', 'Open wrap', { barcode: '222', staffCanChangePrice: true }),
  product('branch-zero', 'Branch zero', { defaultUnitPrice: 5, effectivePrice: 0 }),
  product('branch-priced', 'Branch priced', { defaultUnitPrice: 0, effectivePrice: 1.5 }),
  product('priced', 'Priced tea', { defaultUnitPrice: 2, effectivePrice: 2, barcode: '333' }),
  product('sized', 'Sized karak', {
    sizes: [sizeOf('s-1', 'Small'), sizeOf('s-2', 'Large')],
    variants: [
      variant('v-1', 's-1', 'Small', 0, '555'),
      variant('v-2', 's-2', 'Large', 0.5, '556'),
    ],
  }),
  product('sized-open', 'Sized open', {
    staffCanChangePrice: true,
    sizes: [sizeOf('s-1', 'Small')],
    variants: [variant('v-3', 's-1', 'Small', 0, '557')],
  }),
  product('all-zero', 'All zero sizes', {
    barcode: '444',
    sizes: [sizeOf('s-1', 'Small')],
    variants: [variant('v-4', 's-1', 'Small', 0)],
  }),
  product('free-addon', 'Tea with free sugar', {
    defaultUnitPrice: 1,
    effectivePrice: 1,
    addOns: [addOn('a-1', 'Sugar', 0)],
  }),
  product('zero-addon', 'Zero with paid add-on', { addOns: [addOn('a-2', 'Shot', 0.3)] }),
  product('all-off', 'Fully discounted', {
    defaultUnitPrice: 3,
    effectivePrice: 3,
    defaultDiscount: { type: 'PERCENTAGE', value: 100 },
  }),
]

/** Beyond the 200 the shelf reads: only the server's barcode lookup finds these. */
const OFF_SHELF = [
  product('far-fixed', 'Far fixed', { barcode: '901' }),
  product('far-open', 'Far open', { barcode: '902', staffCanChangePrice: true }),
  product('far-priced', 'Far priced', { barcode: '903', defaultUnitPrice: 2, effectivePrice: 2 }),
  product('far-size', 'Far size', {
    staffCanChangePrice: true,
    sizes: [sizeOf('s-1', 'Small')],
    variants: [variant('v-9', 's-1', 'Small', 0, '904')],
    matchedVariantId: 'v-9',
  }),
]

let entitlements: Entitlements
let offline: boolean
let rows: ReturnType<typeof product>[]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  forgetEntitlements()
  forgetWorkingBranch()
  resetSharedRequests()
  resetOpenSale()
  await resetPosQueue()
  await i18n.changeLanguage('en')
  entitlements = CASHIER
  offline = false
  rows = ROWS
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(entitlements)
      if (offline) throw new TypeError('Failed to fetch')
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/products?')) {
        const barcode = new URL(url, 'http://x').searchParams.get('barcode')
        if (barcode) {
          const hit = OFF_SHELF.filter(
            (row) =>
              row.barcode === barcode ||
              (row.variants as { barcode: string | null }[]).some((v) => v.barcode === barcode),
          )
          return json({ content: hit, page: 0, size: 5, totalElements: hit.length })
        }
        return json({ content: rows, page: 0, size: 200, totalElements: rows.length })
      }
      if (url === '/api/v1/catalog/groups') return json({ groups: [] })
      const one = url.match(/^\/api\/v1\/products\/([^/?]+)$/)
      const found = one && rows.find((row) => row.id === one[1])
      if (found) return json(found)
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function Lines() {
  const { lines } = useOpenSale()
  return (
    <p data-testid="lines">
      {lines
        .map(
          (line) =>
            `${line.productId}${line.variant ? `/${line.variant.id}` : ''}@${line.price}x${line.qty}`,
        )
        .join(',')}
    </p>
  )
}

const renderTill = () =>
  render(
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

const tile = async (name: string) =>
  (await screen.findByText(name, { selector: 'span' })).closest('button') as HTMLButtonElement
const lines = () => screen.getByTestId('lines').textContent
const scanBox = () => screen.getByPlaceholderText(i18n.t('pos.scanPlaceholder'))
const scan = (code: string) => {
  fireEvent.change(scanBox(), { target: { value: code } })
  fireEvent.keyDown(scanBox(), { key: 'Enter' })
}
const addButton = () => screen.getByRole('button', { name: 'Add to the sale' }) as HTMLButtonElement
const priceField = () => screen.getByLabelText('Price before VAT')

describe('a tile tap', () => {
  it('says No price yet and adds nothing when staff may not change the price', async () => {
    renderTill()
    fireEvent.click(await tile('Fixed tin'))
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('draws No price yet on the tile instead of 0.000', async () => {
    renderTill()
    const fixed = await tile('Fixed tin')
    expect(fixed.textContent).toContain('No price yet')
    expect(fixed.textContent).not.toContain('0.000')
    expect((await tile('Priced tea')).textContent).not.toContain('No price yet')
  })

  it('asks the price when allowed, adds it at that price, and not before', async () => {
    renderTill()
    fireEvent.click(await tile('Open wrap'))
    await screen.findByRole('dialog')
    expect(addButton().disabled).toBe(true)
    for (const nothing of ['0', '0.000', '.', 'abc']) {
      fireEvent.change(priceField(), { target: { value: nothing } })
      expect(addButton().disabled).toBe(true)
    }
    fireEvent.change(priceField(), { target: { value: '1.250' } })
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('open@1250x1'))
  })

  it('refuses for someone without pos.sell, even on an item staff may price', async () => {
    entitlements = { ...CASHIER, permissions: ['pos.read'] }
    renderTill()
    fireEvent.click(await tile('Open wrap'))
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps two different typed prices on their own lines', async () => {
    renderTill()
    for (const price of ['1.000', '2.000', '2.000']) {
      fireEvent.click(await tile('Open wrap'))
      await screen.findByRole('dialog')
      fireEvent.change(priceField(), { target: { value: price } })
      fireEvent.click(addButton())
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    expect(lines()).toBe('open@1000x1,open@2000x2')
  })

  it('goes by the branch price, not the base price', async () => {
    renderTill()
    fireEvent.click(await tile('Branch zero'))
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
    fireEvent.click(await tile('Branch priced'))
    await waitFor(() => expect(lines()).toBe('branch-priced@1500x1'))
  })

  it('leaves a priced item as it was', async () => {
    renderTill()
    fireEvent.click(await tile('Priced tea'))
    await waitFor(() => expect(lines()).toBe('priced@2000x1'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a line that comes to 0 through a discount is not "no price"', async () => {
    renderTill()
    fireEvent.click(await tile('Fully discounted'))
    await waitFor(() => expect(lines()).toBe('all-off@3000x1'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the size chooser', () => {
  it('judges each size: 0.000 cannot be added, the priced one can', async () => {
    renderTill()
    fireEvent.click(await tile('Sized karak'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /Small/ }).textContent).toContain(
      'No price yet',
    )
    expect(within(dialog).getByRole('alert').textContent).toContain('No price yet')
    expect(addButton().disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: /Large/ }))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('sized/v-2@500x1'))
  })

  it('asks the price of a 0.000 size when allowed', async () => {
    renderTill()
    fireEvent.click(await tile('Sized open'))
    await screen.findByRole('dialog')
    fireEvent.change(priceField(), { target: { value: '0.750' } })
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('sized-open/v-3@750x1'))
  })

  it('does not open when every size is 0.000 and no price can be typed', async () => {
    renderTill()
    fireEvent.click(await tile('All zero sizes'))
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('add-ons', () => {
  it('an add-on at 0 does not trigger it', async () => {
    renderTill()
    fireEvent.click(await tile('Tea with free sugar'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Sugar/ }))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(screen.queryByLabelText('Price before VAT')).toBeNull()
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('free-addon@1000x1'))
  })

  it('a paid add-on does not make a 0.000 item sellable', async () => {
    renderTill()
    fireEvent.click(await tile('Zero with paid add-on'))
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
  })
})

describe('a barcode scan', () => {
  it('refuses a 0.000 item, asks when allowed, and adds a priced one', async () => {
    renderTill()
    await tile('Fixed tin')
    scan('111')
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')

    scan('333')
    await waitFor(() => expect(lines()).toBe('priced@2000x1'))
    expect(screen.queryByRole('alert')).toBeNull()

    scan('222')
    await screen.findByRole('dialog')
    fireEvent.change(priceField(), { target: { value: '3' } })
    fireEvent.keyDown(priceField(), { key: 'Enter' })
    await waitFor(() => expect(lines()).toBe('priced@2000x1,open@3000x1'))
  })

  it('refuses an item whose every size is 0.000', async () => {
    renderTill()
    await tile('All zero sizes')
    scan('444')
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
  })
})

describe('a size’s own barcode', () => {
  it('refuses a 0.000 size, without the chooser, when no price can be typed', async () => {
    renderTill()
    await tile('Sized karak')
    scan('555')
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds a priced size directly, and clears the message', async () => {
    renderTill()
    await tile('Sized karak')
    scan('555')
    await screen.findByRole('alert')
    scan('556')
    await waitFor(() => expect(lines()).toBe('sized/v-2@500x1'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks the price of that very size when allowed', async () => {
    renderTill()
    await tile('Sized open')
    scan('557')
    await screen.findByRole('dialog')
    fireEvent.change(priceField(), { target: { value: '1.100' } })
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('sized-open/v-3@1100x1'))
  })
})

describe('the server’s barcode lookup', () => {
  it('refuses a 0.000 item found only on the server', async () => {
    renderTill()
    await tile('Fixed tin')
    scan('901')
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')
  })

  it('asks the price of one when allowed, and adds it', async () => {
    renderTill()
    await tile('Fixed tin')
    scan('902')
    await screen.findByRole('dialog')
    fireEvent.change(priceField(), { target: { value: '2.200' } })
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('far-open@2200x1'))
  })

  it('asks for a 0.000 size found by its own barcode', async () => {
    renderTill()
    await tile('Fixed tin')
    scan('904')
    await screen.findByRole('dialog')
    fireEvent.change(priceField(), { target: { value: '0.900' } })
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('far-size/v-9@900x1'))
  })

  it('adds a priced one as before', async () => {
    renderTill()
    await tile('Fixed tin')
    scan('903')
    await waitFor(() => expect(lines()).toBe('far-priced@2000x1'))
  })
})

describe('offline', () => {
  it('holds on the kept shelf: refuses, asks, and sells at the typed price', async () => {
    const first = renderTill()
    await tile('Fixed tin')
    first.unmount()
    offline = true
    forgetWorkingBranch()
    resetSharedRequests()
    renderTill()

    fireEvent.click(await tile('Fixed tin'))
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')

    scan('444')
    expect((await screen.findByRole('alert')).textContent).toContain('No price yet')
    expect(lines()).toBe('')

    fireEvent.click(await tile('Open wrap'))
    await screen.findByRole('dialog')
    fireEvent.change(priceField(), { target: { value: '4.500' } })
    fireEvent.click(addButton())
    await waitFor(() => expect(lines()).toBe('open@4500x1'))
  })
})

describe('in Arabic', () => {
  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderTill()
    const fixed = await tile('Fixed tin')
    expect(fixed.textContent).toContain('لا يوجد سعر بعد')
    fireEvent.click(fixed)
    expect((await screen.findByRole('alert')).textContent).toContain('لا يوجد سعر بعد')
  })
})
