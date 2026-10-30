import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ItemOptionsPage } from './ItemOptionsPage'

const variant = (id: string, size: string, barcode?: string | null) => ({
  id,
  sizeId: `s-${size}`,
  size,
  optionId: null,
  option: null,
  name: `Dates ${size}`,
  code: `D-${size}`,
  priceOverride: null,
  price: 3.2,
  onSale: true,
  ...(barcode === undefined ? {} : { barcode }),
})

const product = (variants: ReturnType<typeof variant>[]) => ({
  id: 'p-dates',
  code: 'D',
  name: 'Dates',
  defaultUnitCode: 'KGM',
  defaultUnitPrice: 3.2,
  active: true,
  version: 3,
  barcode: '111',
  sizes: variants.map((row, sortOrder) => ({
    id: row.sizeId,
    name: row.size,
    nameAr: null,
    priceDelta: 0,
    sortOrder,
  })),
  options: [],
  variants,
  addOns: [],
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })

let stored: ReturnType<typeof product>
let onWrite: () => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  onWrite = () => json(stored)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') {
        return json({
          userId: 'u-1',
          username: 'owner',
          tenantId: 't-1',
          roles: [],
          permissions: ['product.read', 'product.manage'],
          scopes: [],
          featureFlags: {},
        })
      }
      if (init.method === 'PUT') return onWrite()
      if (url === '/api/v1/products/p-dates') return json(stored)
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const open = async () => {
  render(
    <MemoryRouter initialEntries={['/catalog/p-dates/options']}>
      <Routes>
        <Route path="/catalog/:id/options" element={<ItemOptionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('button', {
    name: i18n.t('itemOptions.footer.save', { count: 2 }),
  })
}

const field = (size: string) =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: i18n.t('itemOptions.grid.barcodeOf', { name: size }),
  })

const save = async () => {
  fireEvent.click(
    screen.getByRole('button', {
      name: i18n.t('itemOptions.footer.save', { count: 2 }),
    }),
  )
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true),
  )
}

/** The `variants` of the save, as sent. */
const sentRows = () => {
  const put = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT')
  return JSON.parse(String(put![1]!.body)).variants as Record<string, unknown>[]
}

describe('a size barcode on Sizes and options (backend V509)', () => {
  it('hides the field on an older server and never sends it', async () => {
    stored = product([variant('v-1', 'Box'), variant('v-2', 'Tin')])
    await open()
    expect(screen.queryByRole('textbox', { name: /Barcode for/ })).toBeNull()
    await save()
    for (const row of sentRows()) expect(row).not.toHaveProperty('barcode')
  })

  it('shows the stored barcode, and a save leaves out what did not change', async () => {
    stored = product([variant('v-1', 'Box', '222'), variant('v-2', 'Tin', null)])
    await open()
    expect(field('Box').value).toBe('222')
    expect(field('Tin').value).toBe('')
    await save()
    for (const row of sentRows()) expect(row).not.toHaveProperty('barcode')
  })

  it('sends only the barcode typed, trimmed', async () => {
    stored = product([variant('v-1', 'Box', '222'), variant('v-2', 'Tin', null)])
    await open()
    fireEvent.change(field('Tin'), { target: { value: ' 333 ' } })
    await save()
    expect(sentRows()[0]).not.toHaveProperty('barcode')
    expect(sentRows()[1]).toMatchObject({ size: 'Tin', barcode: '333' })
  })

  it('sends a blank to remove a stored barcode, and nothing when put back as read', async () => {
    stored = product([variant('v-1', 'Box', '222'), variant('v-2', 'Tin', '444')])
    await open()
    fireEvent.change(field('Box'), { target: { value: '' } })
    fireEvent.change(field('Tin'), { target: { value: '9' } })
    fireEvent.change(field('Tin'), { target: { value: '444' } })
    await save()
    expect(sentRows()[0]).toMatchObject({ size: 'Box', barcode: '' })
    expect(sentRows()[1]).not.toHaveProperty('barcode')
  })

  it.each([
    ['PRODUCT_VARIANT_BARCODE_DUPLICATE', 409, 'itemForm.refused.variantBarcodeTaken'],
    ['PRODUCT_VARIANT_BARCODE_INVALID', 400, 'itemForm.refused.barcodeInvalid'],
    ['PRODUCT_BARCODE_DUPLICATE', 409, 'itemForm.refused.barcodeTaken'],
  ])('words %s under the changed field, until it is edited', async (code, status, key) => {
    stored = product([variant('v-1', 'Box', '222'), variant('v-2', 'Tin', null)])
    onWrite = () => json({ status, code }, status)
    await open()
    fireEvent.change(field('Tin'), { target: { value: '333' } })
    await save()
    const line = await screen.findByText(i18n.t(key))
    expect(field('Tin').getAttribute('aria-describedby')).toBe(line.id)
    expect(field('Box').getAttribute('aria-invalid')).toBeNull()
    fireEvent.change(field('Tin'), { target: { value: '334' } })
    expect(screen.queryByText(i18n.t(key))).toBeNull()
  })

  it('puts a duplicate on the two fields holding the same code', async () => {
    stored = product([variant('v-1', 'Box', '222'), variant('v-2', 'Tin', null)])
    onWrite = () => json({ status: 409, code: 'PRODUCT_VARIANT_BARCODE_DUPLICATE' }, 409)
    await open()
    fireEvent.change(field('Tin'), { target: { value: '222' } })
    await save()
    await screen.findAllByText(i18n.t('itemForm.refused.variantBarcodeTaken'))
    expect(field('Box').getAttribute('aria-invalid')).toBe('true')
    expect(field('Tin').getAttribute('aria-invalid')).toBe('true')
  })

  it('has its wording in Arabic', () => {
    for (const key of ['itemForm.refused.variantBarcodeTaken', 'itemOptions.grid.barcodeOf']) {
      expect(i18n.t(key, { lng: 'ar', name: 'x' })).toMatch(/باركود/)
    }
  })
})
