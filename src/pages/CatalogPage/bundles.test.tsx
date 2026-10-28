import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { BundlesPage } from './BundlesPage'
import { BundlePage } from './BundlePage'
import { bundleRequest, partFromProduct } from '../../lib/bundleForm'

const part = (productId: string, extra: Record<string, unknown> = {}) => ({
  position: 1,
  productId,
  variantId: null,
  code: productId.toUpperCase(),
  name: `Part ${productId}`,
  quantity: 1,
  free: false,
  unitPrice: 10,
  taxCategory: 'S',
  taxRate: 5,
  taxReasonCode: null,
  goodsOrService: 'G',
  counted: true,
  onHand: 6,
  allows: 6,
  ...extra,
})

const STARTER = {
  id: 'bun-starter',
  code: 'PKG-0003',
  name: 'Starter bundle',
  nameAr: null,
  description: null,
  kindId: null,
  groupId: null,
  barcode: null,
  unitCode: 'C62',
  basePrice: 18,
  price: 18,
  partsValue: 20,
  saving: 2,
  taxCategory: 'S',
  taxRate: 5,
  showParts: true,
  splitOnInvoice: false,
  splitBecause: null,
  active: true,
  version: 4,
  parts: [part('p-green'), part('p-cups', { position: 2, onHand: 0, allows: 0 })],
  availability: {
    branchId: 'b-main',
    available: true,
    canBeMade: 0,
    limitedByProductId: 'p-cups',
    limitedByName: 'Part p-cups',
    unavailableBecause: [],
  },
}

const ARCHIVED = {
  ...STARTER,
  id: 'bun-old',
  code: 'PKG-0002',
  name: 'Ramadan gift box',
  active: false,
  version: 2,
}

const REPORT = {
  from: '2026-07-31',
  to: '2026-10-28',
  branchId: 'b-main',
  revenue: 396,
  discountGiven: 44,
  bundles: [
    {
      bundleId: 'bun-starter',
      code: 'PKG-0003',
      name: 'Starter bundle',
      active: true,
      unitsSold: 22,
      revenue: 396,
      partsValue: 440,
      discountGiven: 44,
    },
  ],
}

const LINES = {
  bundleId: 'bun-starter',
  branchId: 'b-main',
  quantity: 1,
  split: true,
  splitBecause: 'VAT_TREATMENTS_DIFFER',
  lines: [
    {
      productId: 'p-green',
      variantId: null,
      productCode: 'P-GREEN',
      description: 'Part p-green',
      unitCode: 'C62',
      quantity: 1,
      unitPrice: 9,
      discount: null,
      taxCategory: { code: 'S', rate: 5 },
      classification: { goodsOrService: 'G' },
      bundleId: 'bun-starter',
    },
    {
      productId: 'p-dates',
      variantId: null,
      productCode: 'P-DATES',
      description: 'Part p-dates',
      unitCode: 'C62',
      quantity: 1,
      unitPrice: 9,
      discount: null,
      taxCategory: { code: 'Z', rate: 0 },
      classification: { goodsOrService: 'G' },
      bundleId: 'bun-starter',
    },
  ],
}

let permissions: string[]
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const calls = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url))
const writes = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([url, init]) => ({ url: String(url), method: init!.method, body: init!.body }))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  permissions = ['product.read', 'product.manage', 'reports.sales.read']
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') {
        return json({
          userId: 'u',
          username: 'o',
          tenantId: 't',
          roles: [],
          permissions,
          scopes: [],
          featureFlags: {},
        })
      }
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' }])
      }
      if (url === '/api/v1/catalog/groups') return json({ groups: [] })
      if (init.method === 'PUT')
        return json({ ...STARTER, ...JSON.parse(String(init.body)), version: 5 })
      if (init.method === 'DELETE') return json({ ...STARTER, active: false, version: 6 })
      if (url.startsWith('/api/v1/bundles/report')) return json(REPORT)
      if (url.startsWith('/api/v1/bundles/bun-starter/invoice-lines')) return json(LINES)
      if (url.startsWith('/api/v1/bundles/bun-starter')) return json(STARTER)
      if (url.startsWith('/api/v1/bundles')) return json({ content: [STARTER, ARCHIVED] })
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/catalog/bundles" element={<BundlesPage />} />
        <Route path="/catalog/bundles/new" element={<BundlePage />} />
        <Route path="/catalog/bundles/:id" element={<BundlePage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('the bundles list on /v1/bundles', () => {
  it('reads every bundle for the working branch and the report, before VAT', async () => {
    open('/catalog/bundles')
    expect(await screen.findByText('Starter bundle')).toBeTruthy()
    expect(calls()).toContain('/api/v1/bundles?branchId=b-main&status=ALL')
    await waitFor(() => expect(calls()).toContain('/api/v1/bundles/report?branchId=b-main'))
    const row = screen.getByText('Starter bundle').closest('tr')!
    // Can't be made: a counted part holds nothing.
    expect(
      within(row).getByText(i18n.t('bundles.ranOutNoDay', { name: 'Part p-cups' })),
    ).toBeTruthy()
    expect(within(row).getByText(i18n.t('bundles.saves', { amount: '2.000' }))).toBeTruthy()
    expect(await within(row).findByText('22')).toBeTruthy()
    // The archived bundle sits in Switched off.
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${i18n.t('bundles.tab.switchedOff')}`) }),
    )
    expect(screen.queryByText('Starter bundle')).toBeNull()
    expect(screen.getByText('Ramadan gift box')).toBeTruthy()
  })

  it('does not ask for the report without a sales-reports permission', async () => {
    permissions = ['product.read']
    open('/catalog/bundles')
    expect(await screen.findByText('Starter bundle')).toBeTruthy()
    expect(calls().some((url) => url.includes('/bundles/report'))).toBe(false)
    expect(screen.queryByRole('link', { name: i18n.t('bundles.newBundle') })).toBeNull()
  })
})

describe('one bundle', () => {
  it('previews the invoice lines and saves with PUT and the version it read', async () => {
    open('/catalog/bundles/bun-starter')
    expect(await screen.findByDisplayValue('Starter bundle')).toBeTruthy()
    await waitFor(() =>
      expect(calls()).toContain(
        '/api/v1/bundles/bun-starter/invoice-lines?branchId=b-main&quantity=1',
      ),
    )
    expect(
      await screen.findByText(i18n.t('bundle.splitBecause.VAT_TREATMENTS_DIFFER')),
    ).toBeTruthy()

    const price = screen.getByLabelText(/Bundle price/) as HTMLInputElement
    expect(price.value).toBe('18.000')
    fireEvent.change(price, { target: { value: '17.5' } })
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('bundle.save') })[0])
    await waitFor(() => expect(writes()).toHaveLength(1))
    const [put] = writes()
    expect(put.url).toBe('/api/v1/bundles/bun-starter?expectedVersion=4')
    expect(put.method).toBe('PUT')
    const body = JSON.parse(String(put.body))
    expect(body).toMatchObject({
      code: 'PKG-0003',
      name: 'Starter bundle',
      price: 17.5,
      showParts: true,
      parts: [
        { productId: 'p-green', variantId: null, quantity: 1, free: false },
        { productId: 'p-cups', variantId: null, quantity: 1, free: false },
      ],
    })
    // VAT and classification are never sent: the server works them out from the parts.
    expect(body).not.toHaveProperty('taxCategory')
    expect(body).not.toHaveProperty('taxRate')
  })

  it('switches a bundle off with DELETE after saving it', async () => {
    open('/catalog/bundles/bun-starter')
    await screen.findByDisplayValue('Starter bundle')
    fireEvent.click(screen.getByRole('button', { name: i18n.t('bundle.saveAndSwitchOff') }))
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()[1]).toMatchObject({
      url: '/api/v1/bundles/bun-starter?expectedVersion=5',
      method: 'DELETE',
    })
  })

  it('builds the request from picked products, at their size and branch price', () => {
    const picked = partFromProduct({
      id: 'p-flat',
      code: 'FLT-1',
      name: 'Flat White',
      description: null,
      defaultUnitCode: 'EA',
      defaultUnitPrice: 1.333,
      defaultTaxCategory: 'S',
      defaultTaxRate: 5,
      active: true,
      version: 1,
      effectivePrice: 1.4,
      variants: [
        {
          id: 'v-l',
          sizeId: 's-l',
          size: 'Large',
          optionId: null,
          option: null,
          name: 'Flat White · Large',
          code: 'FLT-1-L',
          priceOverride: null,
          price: 1.633,
          onSale: true,
        },
      ],
    })
    expect(picked).toMatchObject({ variantId: 'v-l', unitPrice: 1.633, name: 'Flat White · Large' })
    expect(
      bundleRequest({
        code: ' PKG-9 ',
        name: 'Duo',
        description: '',
        kindId: '',
        price: '3.2',
        showParts: false,
        parts: [picked, { ...picked, key: 'x', productId: 'p-cap', variantId: null, free: true }],
      }),
    ).toEqual({
      code: 'PKG-9',
      name: 'Duo',
      nameAr: null,
      description: null,
      kindId: null,
      barcode: null,
      price: 3.2,
      unitCode: null,
      showParts: false,
      parts: [
        { productId: 'p-flat', variantId: 'v-l', quantity: 1, free: false },
        { productId: 'p-cap', variantId: null, quantity: 1, free: true },
      ],
    })
  })

  it('offers a new bundle with no sample parts and does not save fewer than two', async () => {
    open('/catalog/bundles/new')
    expect(await screen.findByText(i18n.t('bundle.subtitleNew'))).toBeTruthy()
    expect(screen.queryByText('Starter bundle')).toBeNull()
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: i18n.t('bundle.save') }).length).toBeGreaterThan(
        0,
      ),
    )
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('bundle.save') })[0])
    expect(await screen.findByText(i18n.t('bundle.needsMore'))).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })
})
