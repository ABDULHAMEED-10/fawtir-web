import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { productListPath, productSearchPath } from '../../api/catalog/products'
import { CatalogPage } from './CatalogPage'

const READER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['product.read'],
  scopes: [],
  featureFlags: {},
}

const TOTAL = 45

/** Product n of the catalogue: every fifth one is a service, sold by the hour. */
const productAt = (n: number) => ({
  id: `p-${n}`,
  code: `SKU-${String(n).padStart(2, '0')}`,
  name: `Item ${String(n).padStart(2, '0')}`,
  description: null,
  defaultUnitCode: n % 5 === 0 ? 'HUR' : 'EA',
  defaultUnitPrice: n,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 0,
})

/** One item taken off sale, for the Off sale tab. */
const ARCHIVED = {
  ...productAt(99),
  name: 'Old syrup',
  active: false,
  archivedAt: '2026-08-14T10:12:00Z',
  version: 2,
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const productCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/v1/products'))

beforeEach(() => {
  resetSharedRequests()
  forgetEntitlements()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === '/api/v1/me/entitlements') return json(READER)
      if (url.includes('/reactivate') && init.method === 'POST') {
        return json({ ...ARCHIVED, active: true, archivedAt: null, version: 3 })
      }
      if (url.startsWith('/api/v1/products')) {
        const query = new URL(url, 'http://x').searchParams
        if (query.get('status') === 'ARCHIVED') {
          return json({ content: [ARCHIVED], page: 0, size: 20, totalElements: 1 })
        }
        const page = Number(query.get('page') ?? 0)
        const size = Number(query.get('size'))
        const from = page * size + 1
        const content = Array.from(
          { length: Math.max(0, Math.min(size, TOTAL - from + 1)) },
          (_, i) => productAt(from + i),
        )
        return json({ content, page, size, totalElements: TOTAL })
      }
      return new Response(null, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the catalogue list', () => {
  it("pages through the server's pages of 20", async () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Item 01')).toBeTruthy()
    // The list waits for the branches; the Off sale count and the zero-rating flags do not.
    expect(
      productCalls().filter((url) => !url.includes('status=') && !url.includes('zero-rating'))[0],
    ).toBe('/api/v1/products?sort=NAME&direction=ASC&size=20')
    const pager = screen.getByRole('navigation', { name: i18n.t('appList.pager.label') })
    expect(within(pager).getByRole('button', { name: '3' })).toBeTruthy()
    expect(within(pager).getByRole('button', { name: '1' }).getAttribute('aria-current')).toBe(
      'page',
    )

    fireEvent.click(within(pager).getByRole('button', { name: '2' }))
    expect(await screen.findByText('Item 21')).toBeTruthy()
    expect(productCalls().at(-1)).toBe('/api/v1/products?sort=NAME&direction=ASC&size=20&page=1')
    expect(screen.queryByText('Item 01')).toBeNull()
  })

  it('opens the tab and order a link asks for, and ignores anything else', async () => {
    const first = render(
      <MemoryRouter initialEntries={['/catalog?tab=attention&sort=priceLow']}>
        <CatalogPage />
      </MemoryRouter>,
    )
    await vi.waitFor(() =>
      expect(productCalls()).toContain('/api/v1/products?sort=PRICE&direction=ASC&size=20'),
    )
    const tabs = await screen.findAllByRole('button', {
      name: new RegExp(i18n.t('catalogReal.tab.attention')),
    })
    expect(tabs.some((tab) => tab.getAttribute('aria-pressed') === 'true')).toBe(true)
    first.unmount()

    resetSharedRequests()
    render(
      <MemoryRouter initialEntries={['/catalog?tab=nonsense&sort=nonsense']}>
        <CatalogPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Item 01')).toBeTruthy()
  })

  it('narrows the loaded page to a tab and sorts it by price', async () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    await screen.findByText('Item 01')
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('catalogReal.tab.services')) }),
    )
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelector('bdi')?.textContent)
    expect(names()).toEqual(['Item 05', 'Item 10', 'Item 15', 'Item 20'])

    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.sort') }))
    fireEvent.click(screen.getByRole('option', { name: i18n.t('catalogReal.sort.priceHigh') }))
    await vi.waitFor(() => expect(names()).toEqual(['Item 20', 'Item 15', 'Item 10', 'Item 05']))
    // The order is the server's, so it holds across pages.
    expect(productCalls()).toContain('/api/v1/products?sort=PRICE&direction=DESC&size=20')
  })

  it("reads the list for the sidebar's working branch, at its price (P.9)", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(READER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' }])
      }
      if (url.startsWith('/api/v1/products')) {
        const branch = new URL(url, 'http://x').searchParams.get('branchId')
        const content = branch ? [{ ...productAt(1), effectivePrice: 7.25 }] : []
        return json({ content, page: 0, size: 20, totalElements: content.length })
      }
      return new Response(null, { status: 404 })
    })
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('7.250')).toBeTruthy()
    expect(productCalls()).toContain(
      '/api/v1/products?branchId=b-main&includeUnavailable=true&sort=NAME&direction=ASC&size=20',
    )
  })

  it('greys an item switched off in the working branch, and it still opens', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(READER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' }])
      }
      if (url.startsWith('/api/v1/products')) {
        const query = new URL(url, 'http://x').searchParams
        const availability = query.get('availability')
        const content = (
          query.get('branchId') && (availability || query.get('includeUnavailable') === 'true')
            ? [
                { ...productAt(1), effectivePrice: 1, availableHere: true },
                { ...productAt(2), effectivePrice: 6.5, availableHere: false },
                { ...productAt(5), effectivePrice: 5, availableHere: true },
              ]
            : []
        ).filter((row) => !availability || row.availableHere === (availability === 'ON_SALE'))
        return json({ content, page: 0, size: 20, totalElements: content.length })
      }
      return new Response(null, { status: 404 })
    })
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    await screen.findByText('Item 01')
    const tabButton = (key: string) =>
      screen.getByRole('button', { name: new RegExp(`^${i18n.t(key)}`) })
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelector('bdi')?.textContent)
    // All, the other tabs and the cards count only what is on sale here.
    expect(names()).toEqual(['Item 01', 'Item 05'])
    expect(tabButton('catalogReal.tab.all').textContent).toContain('2')
    expect(tabButton('catalogReal.tab.goods').textContent).toContain('1')
    expect(tabButton('catalogReal.tab.services').textContent).toContain('1')
    expect(tabButton('catalogReal.tab.switchedOff').textContent).toContain('1')
    expect(
      screen.getByText(i18n.t('catalogReal.kpi.things')).parentElement?.parentElement?.textContent,
    ).toContain('2')
    const on = screen.getByText('Item 01').closest('tr') as HTMLElement
    expect(on.className).not.toContain('opacity-60')
    expect(within(on).queryByText(i18n.t('catalogReal.notOnSaleHere'))).toBeNull()

    // Switched off holds the greyed row, which still opens and shows its effective price.
    fireEvent.click(tabButton('catalogReal.tab.switchedOff'))
    await vi.waitFor(() => expect(names()).toEqual(['Item 02']))
    const off = screen.getByText('Item 02').closest('tr') as HTMLElement
    expect(off.className).toContain('opacity-60')
    expect(within(off).getByText(i18n.t('catalogReal.notOnSaleHere'))).toBeTruthy()
    expect(within(off).getByRole('link').getAttribute('href')).toBe('/catalog/p-2')
    expect(within(off).getByText('6.500')).toBeTruthy()
  })

  it('draws no Switched off tab when nothing is switched off', async () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    await screen.findByText('Item 01')
    expect(
      screen.queryByRole('button', {
        name: new RegExp(`^${i18n.t('catalogReal.tab.switchedOff')}`),
      }),
    ).toBeNull()
  })

  it('asks for unavailable items only with a branch, and only when asked (till and pickers do not)', () => {
    expect(productListPath({ branchId: 'b-main', includeUnavailable: true, size: 20 })).toBe(
      '/v1/products?branchId=b-main&includeUnavailable=true&size=20',
    )
    expect(productListPath({ includeUnavailable: true, size: 20 })).toBe('/v1/products?size=20')
    expect(productListPath({ branchId: 'b-main', size: 20 })).toBe(
      '/v1/products?branchId=b-main&size=20',
    )
    expect(productSearchPath('cup', 20, 0, 'b-main')).not.toContain('includeUnavailable')
  })

  it('lists the items off sale on their own tab, counted by the server, and puts one back (P.14, P.15)', async () => {
    READER.permissions = ['product.read', 'product.manage']
    try {
      render(
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>,
      )
      await screen.findByText('Item 01')
      expect(productCalls()).toContain('/api/v1/products?status=ARCHIVED&size=1')
      const tab = screen.getByRole('button', {
        name: new RegExp(i18n.t('catalogReal.tab.archived')),
      })
      expect(tab.textContent).toContain('1')
      fireEvent.click(tab)
      expect(await screen.findByText('Old syrup')).toBeTruthy()
      expect(productCalls()).toContain(
        '/api/v1/products?status=ARCHIVED&sort=NAME&direction=ASC&size=20',
      )
      fireEvent.click(screen.getByRole('button', { name: i18n.t('catalog.rowMenu.switchOn') }))
      await vi.waitFor(() =>
        expect(
          vi
            .mocked(fetch)
            .mock.calls.some(
              ([url, init]) =>
                String(url) === '/api/v1/products/p-99/reactivate?expectedVersion=2' &&
                init?.method === 'POST',
            ),
        ).toBe(true),
      )
    } finally {
      READER.permissions = ['product.read']
    }
  })

  it('reads On sale and Never sold from the server for the working branch, counted by it', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(READER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' }])
      }
      if (url.startsWith('/api/v1/products')) {
        const query = new URL(url, 'http://x').searchParams
        if (query.get('sales') === 'NEVER_SOLD') {
          return json({ content: [productAt(7)], page: 0, size: 20, totalElements: 4 })
        }
        if (query.get('availability') === 'ON_SALE') {
          return json({ content: [productAt(1)], page: 0, size: 20, totalElements: 9 })
        }
        const content = [productAt(1), productAt(7)]
        return json({ content, page: 0, size: 20, totalElements: content.length })
      }
      return new Response(null, { status: 404 })
    })
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    await screen.findByText('Item 01')
    const tabButton = (key: string) =>
      screen.getByRole('button', { name: new RegExp(`^${i18n.t(key)}`) })
    await vi.waitFor(() =>
      expect(tabButton('catalogReal.tab.neverSold').textContent).toContain('4'),
    )
    expect(tabButton('catalogReal.tab.onSale').textContent).toContain('9')
    expect(productCalls()).toContain('/api/v1/products?branchId=b-main&availability=ON_SALE&size=1')
    expect(productCalls()).toContain(
      '/api/v1/products?branchId=b-main&includeUnavailable=true&sales=NEVER_SOLD&size=1',
    )
    fireEvent.click(tabButton('catalogReal.tab.neverSold'))
    await vi.waitFor(() =>
      expect(productCalls()).toContain(
        '/api/v1/products?branchId=b-main&includeUnavailable=true&sales=NEVER_SOLD&sort=NAME&direction=ASC&size=20',
      ),
    )
    expect(await screen.findByText('Item 07')).toBeTruthy()
    expect(screen.queryByText('Item 01')).toBeNull()
  })

  it('counts the cards and tabs from the server, not the page in view', async () => {
    // 45 active in the branch across pages, 2 of them greyed but neither on this first page.
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(READER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-main', code: 'MAIN', name: 'Main', type: 'HEAD_OFFICE' }])
      }
      if (url.startsWith('/api/v1/products')) {
        const query = new URL(url, 'http://x').searchParams
        if (query.get('availability') === 'ON_SALE') {
          return json({ content: [productAt(1)], page: 0, size: 1, totalElements: 43 })
        }
        if (query.get('availability') === 'SWITCHED_OFF') {
          return json({
            content: [{ ...productAt(44), availableHere: false }],
            page: 0,
            size: 1,
            totalElements: 2,
          })
        }
        const content = Array.from({ length: 20 }, (_, i) => productAt(i + 1))
        return json({ content, page: 0, size: 20, totalElements: 45 })
      }
      return new Response(null, { status: 404 })
    })
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    await screen.findByText('Item 01')
    const tabButton = (key: string) =>
      screen.getByRole('button', { name: new RegExp(`^${i18n.t(key)}`) })
    await vi.waitFor(() =>
      expect(tabButton('catalogReal.tab.switchedOff').textContent).toContain('2'),
    )
    expect(tabButton('catalogReal.tab.all').textContent).toContain('43')
    expect(
      screen.getByText(i18n.t('catalogReal.kpi.things')).parentElement?.parentElement?.textContent,
    ).toContain('43')
    expect(productCalls()).toContain(
      '/api/v1/products?branchId=b-main&availability=SWITCHED_OFF&size=1',
    )

    // Changing tab reads no count again: the numbers already came back.
    const countReads = () => productCalls().filter((url) => url.includes('size=1')).length
    await vi.waitFor(() => expect(countReads()).toBeGreaterThanOrEqual(3))
    const before = countReads()
    fireEvent.click(tabButton('catalogReal.tab.goods'))
    fireEvent.click(tabButton('catalogReal.tab.all'))
    expect(countReads()).toBe(before)
  })

  it('draws no On sale or Never sold tab without a working branch', async () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    )
    await screen.findByText('Item 01')
    expect(
      screen.queryByRole('button', { name: new RegExp(`^${i18n.t('catalogReal.tab.neverSold')}`) }),
    ).toBeNull()
    expect(
      productCalls().some((url) => url.includes('sales=') || url.includes('availability=')),
    ).toBe(false)
  })
})
