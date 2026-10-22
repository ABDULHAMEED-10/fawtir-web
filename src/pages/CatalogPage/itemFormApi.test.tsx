import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ItemFormPage } from './ItemFormPage'
import { ItemOptionsPage } from './ItemOptionsPage'

const reader = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const DATES = {
  id: 'p-dates',
  code: 'DATES-KH',
  name: 'Khalas dates 1kg',
  description: null,
  defaultUnitCode: 'KGM',
  defaultUnitPrice: 3.2,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  classificationGoodsOrService: 'G',
  classificationIsicCode: null,
  classificationHsCode: '080410000000',
  classificationServiceTypeCode: '00000000',
  active: true,
  archivedAt: null,
  version: 3,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let permissions: string[]
let stored: typeof DATES
let onWrite: (url: string, init: RequestInit) => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  permissions = ['product.read', 'product.manage']
  stored = { ...DATES }
  onWrite = (_url, init) =>
    json({ ...stored, ...JSON.parse(String(init.body ?? '{}')), version: 4 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(reader(permissions))
      if (url === '/api/v1/branches') return json([])
      if (url.includes('/code-lists/hs')) return json({ items: [], total: 0 })
      if (url.startsWith('/api/v1/products') && init.method && init.method !== 'GET') {
        return onWrite(url, init)
      }
      if (url === '/api/v1/products/p-dates') return json(stored)
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const writes = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([url, init]) => ({ url: String(url), method: init!.method, body: init!.body }))

const openItem = async (path = '/catalog/p-dates') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/catalog/new" element={<ItemFormPage mode="new" />} />
        <Route path="/catalog/:id" element={<ItemFormPage mode="edit" />} />
        <Route path="/catalog/:id/options" element={<ItemOptionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the item form on /v1/products', () => {
  it('opens the real item (P.13) and saves it with PUT and the version it read', async () => {
    await openItem()
    const name = (await screen.findByLabelText(/^Name/)) as HTMLInputElement
    expect(name.value).toBe('Khalas dates 1kg')
    expect((screen.getByLabelText(/Base price/) as HTMLInputElement).value).toBe('3.200')
    fireEvent.change(name, { target: { value: 'Khalas dates 2kg' } })
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('item.save') })[0])
    await waitFor(() => expect(writes()).toHaveLength(1))
    const [put] = writes()
    expect(put.url).toBe('/api/v1/products/p-dates?expectedVersion=3')
    expect(put.method).toBe('PUT')
    expect(JSON.parse(String(put.body))).toMatchObject({
      code: 'DATES-KH',
      name: 'Khalas dates 2kg',
      defaultUnitCode: 'KGM',
      defaultUnitPrice: 3.2,
      defaultTaxCategory: 'S',
      defaultTaxRate: 5,
      classification: { goodsOrService: 'G', hsCode: '080410000000', serviceTypeCode: null },
    })
  })

  it('offers to reload when someone else changed the item first', async () => {
    onWrite = () => json({ status: 409, code: 'PRODUCT_VERSION_CONFLICT' }, 409)
    await openItem()
    await screen.findByLabelText(/^Name/)
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('item.save') })[0])
    expect(await screen.findByText(i18n.t('itemForm.refused.changed'))).toBeTruthy()
    stored = { ...DATES, name: 'Khalas dates (renamed)', version: 4 }
    fireEvent.click(screen.getByRole('button', { name: i18n.t('itemForm.reload') }))
    await waitFor(() =>
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe(
        'Khalas dates (renamed)',
      ),
    )
  })

  it('archives with DELETE and the version, then is read-only', async () => {
    onWrite = () =>
      json({ ...stored, active: false, archivedAt: '2026-10-21T09:00:00Z', version: 4 })
    await openItem()
    await screen.findByLabelText(/^Name/)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalog.rowMenu.switchOff') }))
    const confirm = await screen.findAllByRole('button', {
      name: i18n.t('catalog.rowMenu.switchOff'),
    })
    fireEvent.click(confirm.at(-1)!)
    expect(await screen.findByText(i18n.t('itemForm.archivedNote'))).toBeTruthy()
    expect(writes()).toEqual([
      { url: '/api/v1/products/p-dates?expectedVersion=3', method: 'DELETE', body: undefined },
    ])
    expect(screen.queryByRole('button', { name: i18n.t('item.save') })).toBeNull()
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).closest('fieldset')!.disabled).toBe(
      true,
    )
  })

  it('is read-only without product.manage', async () => {
    permissions = ['product.read']
    await openItem()
    await screen.findByLabelText(/^Name/)
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/^Name/) as HTMLInputElement).closest('fieldset')!.disabled,
      ).toBe(true),
    )
    expect(screen.queryByRole('button', { name: i18n.t('item.save') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('catalog.rowMenu.switchOff') })).toBeNull()
  })

  it('creates a new item with POST, and refuses a goods item with no HS code first', async () => {
    onWrite = (_url, init) =>
      json({ ...JSON.parse(String(init.body)), id: 'p-new', version: 0 }, 201)
    await openItem('/catalog/new')
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Cardamom' } })
    fireEvent.change(screen.getAllByLabelText(i18n.t('item.itemCode'))[0], {
      target: { value: 'CARD-1' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('item.save') })[0])
    expect(await screen.findByText(i18n.t('itemForm.problem.hsCode'))).toBeTruthy()
    expect(writes()).toEqual([])

    // A service carries no HS code, so it can be saved as it is.
    fireEvent.click(screen.getByRole('button', { name: /Something you do/ }))
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('item.save') })[0])
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toMatchObject({ url: '/api/v1/products', method: 'POST' })
    expect(JSON.parse(String(writes()[0].body))).toMatchObject({
      code: 'CARD-1',
      name: 'Cardamom',
      classification: { goodsOrService: 'S', hsCode: null },
    })
  })

  it('says New item is not allowed without product.manage', async () => {
    permissions = ['product.read']
    await openItem('/catalog/new')
    expect(await screen.findByText(i18n.t('appAccess.missingPermission'))).toBeTruthy()
  })

  it('names the real item on its Sizes and options page', async () => {
    await openItem('/catalog/p-dates/options')
    expect(
      await screen.findByRole('heading', {
        name: i18n.t('itemOptions.title', { name: 'Khalas dates 1kg' }),
      }),
    ).toBeTruthy()
  })
})
