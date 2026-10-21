import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
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
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(READER)
      if (url.startsWith('/api/v1/products')) {
        const query = new URL(url, 'http://x').searchParams
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
    expect(productCalls()[0]).toBe('/api/v1/products?size=20')
    const pager = screen.getByRole('navigation', { name: i18n.t('appList.pager.label') })
    expect(within(pager).getByRole('button', { name: '3' })).toBeTruthy()
    expect(within(pager).getByRole('button', { name: '1' }).getAttribute('aria-current')).toBe(
      'page',
    )

    fireEvent.click(within(pager).getByRole('button', { name: '2' }))
    expect(await screen.findByText('Item 21')).toBeTruthy()
    expect(productCalls().at(-1)).toBe('/api/v1/products?size=20&page=1')
    expect(screen.queryByText('Item 01')).toBeNull()
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
    expect(names()).toEqual(['Item 20', 'Item 15', 'Item 10', 'Item 05'])
  })
})
