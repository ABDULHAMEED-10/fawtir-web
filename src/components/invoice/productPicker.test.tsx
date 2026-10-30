import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceDataContext } from '../../lib/reference/referenceData'
import { SEEDED_REFERENCE, SEEDED_TAX_CATEGORIES } from '../../testing/referenceData'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ProductDto } from '../../api/catalog/products'
import {
  lineFromProduct,
  lineHasNoPrice,
  newProductFrom,
  suggestProductCode,
  taxCategoryOf,
} from '../../lib/productLine'
import { SessionContext } from '../../lib/session/session'
import { ProductPicker } from './ProductPicker'
import { CreateInvoicePage, SelfBilledComposerPage } from '../../pages/CreateInvoicePage'

function product(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'p-1',
    code: 'FLT-1',
    name: 'Flat White',
    description: null,
    defaultUnitCode: 'EA',
    defaultUnitPrice: 1.6,
    defaultTaxCategory: 'S',
    defaultTaxRate: 5,
    active: true,
    version: 0,
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const springPage = (content: ProductDto[]) => ({
  content,
  page: 0,
  size: 20,
  totalElements: content.length,
})

let fetchMock: ReturnType<typeof vi.fn>
let createResponse: () => Response

const productCalls = () =>
  fetchMock.mock.calls
    .map(
      ([url, init]) => [String(url), (init as RequestInit | undefined)?.method ?? 'GET'] as const,
    )
    .filter(([url]) => url.startsWith('/api/v1/products'))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  createResponse = () =>
    json(201, product({ id: 'p-new', code: 'T-1234', name: 'Karak Tea', defaultUnitPrice: 0.3 }))
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    if (url.startsWith('/api/v1/products') && init?.method === 'POST') return createResponse()
    if (url.startsWith('/api/v1/products')) {
      const q = new URL(url, 'http://x').searchParams.get('q')
      return json(
        200,
        springPage(
          q
            ? [product()].filter((p) => p.name.toLowerCase().includes(q))
            : [product(), product({ id: 'p-2', code: 'ESP-1', name: 'Espresso' })],
        ),
      )
    }
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['product.read', 'product.manage', 'invoice.read', 'invoice.draft'],
  scopes: [],
  featureFlags: {},
}

function renderPicker(onPick = vi.fn(), permissions = ADMIN.permissions) {
  render(
    <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
      <MemoryRouter>
        <SessionContext.Provider value={{ ...ADMIN, permissions }}>
          <ProductPicker productId={null} label="" onPick={onPick} />
        </SessionContext.Provider>
      </MemoryRouter>
    </ReferenceDataContext.Provider>,
  )
  return onPick
}

describe('ProductPicker', () => {
  it('asks the catalogue only once opened, then searches what is typed', async () => {
    const onPick = renderPicker()
    expect(productCalls()).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Description' }))
    expect(await screen.findByRole('option', { name: /Espresso/ })).toBeTruthy()
    expect(productCalls()[0]).toEqual(['/api/v1/products?size=20', 'GET'])

    fireEvent.change(screen.getByPlaceholderText('Search products by name or code'), {
      target: { value: 'flat' },
    })
    await waitFor(() =>
      expect(productCalls().at(-1)).toEqual(['/api/v1/products?q=flat&size=20', 'GET']),
    )
    await waitFor(() => expect(screen.queryByRole('option', { name: /Espresso/ })).toBeNull())

    fireEvent.click(screen.getByRole('option', { name: /Flat White/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1', name: 'Flat White' }))
  })

  it('quick-creates a product from what was typed, and puts it on the line', async () => {
    const onPick = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Description' }))
    fireEvent.change(await screen.findByPlaceholderText('Search products by name or code'), {
      target: { value: 'Karak Tea' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Create “Karak Tea” as a product' }))

    const dialog = await screen.findByRole('dialog', { name: 'New product' })
    expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Karak Tea')
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).value).toMatch(/^KT-\d{4}$/)
    fireEvent.change(within(dialog).getByLabelText(/^Price/), { target: { value: '0.300' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and use' }))

    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-new' })),
    )
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({
      name: 'Karak Tea',
      defaultUnitCode: 'EA',
      defaultUnitPrice: 0.3,
      defaultTaxCategory: 'S',
      defaultTaxRate: 5,
    })
  })

  it('says so on the code field when the code is taken', async () => {
    createResponse = () =>
      new Response(
        JSON.stringify({
          type: 'https://api.fawtir.om/problems/conflict',
          status: 409,
          code: 'PRODUCT_CODE_DUPLICATE',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      )
    const onPick = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Description' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New product' }))
    const dialog = await screen.findByRole('dialog', { name: 'New product' })
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Flat White' } })
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'FLT-1' } })
    fireEvent.change(within(dialog).getByLabelText(/^Price/), { target: { value: '1.6' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and use' }))
    expect(await within(dialog).findByText('Another product already uses this code.')).toBeTruthy()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('offers no quick-create to someone who may not manage products', async () => {
    renderPicker(vi.fn(), ['product.read'])
    fireEvent.click(screen.getByRole('button', { name: 'Description' }))
    await screen.findByRole('option', { name: /Espresso/ })
    expect(screen.queryByRole('button', { name: 'New product' })).toBeNull()
  })
})

describe('the invoice line a product starts', () => {
  it('fills the description, price, unit and tax category from the product', async () => {
    render(
      <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
        <MemoryRouter initialEntries={['/invoices/new']}>
          <Routes>
            <Route path="/invoices/new" element={<CreateInvoicePage />} />
          </Routes>
        </MemoryRouter>
      </ReferenceDataContext.Provider>,
    )
    // The description is typed text now; the catalogue opens from the button at its end.
    const [first] = await screen.findAllByRole('button', { name: /Pick from catalogue/ })
    fireEvent.click(first)
    fireEvent.click(await screen.findByRole('option', { name: /Flat White/ }))
    await waitFor(() =>
      expect(
        (screen.getAllByRole('textbox', { name: 'Description' })[0] as HTMLInputElement).value,
      ).toContain('Flat White'),
    )
    expect(
      (screen.getAllByRole('textbox', { name: 'Price excl.' })[0] as HTMLInputElement).value,
    ).toBe('1.600')
  })
})

describe('a line with no price yet', () => {
  const NO_PRICE = 'This item has no price yet'
  const price = () => screen.getAllByRole('textbox', { name: 'Price excl.' })[0] as HTMLInputElement

  const pickFree = async (page = <CreateInvoicePage />) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
      if (url.startsWith('/api/v1/products')) {
        return json(200, springPage([product({ defaultUnitPrice: 0 })]))
      }
      throw new Error(`unexpected request to ${url}`)
    })
    render(
      <ReferenceDataContext.Provider value={SEEDED_REFERENCE}>
        <MemoryRouter initialEntries={['/invoices/new']}>
          <Routes>
            <Route path="/invoices/new" element={page} />
          </Routes>
        </MemoryRouter>
      </ReferenceDataContext.Provider>,
    )
    const [first] = await screen.findAllByRole('button', { name: /Pick from catalogue/ })
    expect(screen.queryByText(NO_PRICE)).toBeNull()
    fireEvent.click(first)
    fireEvent.click(await screen.findByRole('option', { name: /Flat White/ }))
    await waitFor(() => expect(price().value).toBe('0.000'))
  }

  it('warns on a 0.000 product, and the warning clears when a price is typed', async () => {
    await pickFree()
    expect(screen.getByText(NO_PRICE)).toBeTruthy()
    fireEvent.change(price(), { target: { value: '1.500' } })
    expect(screen.queryByText(NO_PRICE)).toBeNull()
    fireEvent.change(price(), { target: { value: '0' } })
    expect(screen.getByText(NO_PRICE)).toBeTruthy()
  })

  it('does not stop the draft being saved', async () => {
    await pickFree()
    const save = screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
  })

  it("stays off a self-billed document, whose price is the supplier's", async () => {
    await pickFree(<SelfBilledComposerPage />)
    expect(screen.queryByText(NO_PRICE)).toBeNull()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('invoiceDraft.lineNoPrice')).toBe('لا يوجد سعر لهذا الصنف بعد')
  })

  it('reads the price, not what is left after a discount, and needs a product', () => {
    expect(lineHasNoPrice({ productId: 'p', unitPrice: '0.000' })).toBe(true)
    expect(lineHasNoPrice({ productId: 'p', unitPrice: '' })).toBe(true)
    expect(lineHasNoPrice({ productId: 'p', unitPrice: '1.500' })).toBe(false)
    expect(lineHasNoPrice({ productId: null, unitPrice: '0.000' })).toBe(false)
    expect(lineHasNoPrice({ productId: 'p', unitPrice: '0.001' })).toBe(false)
  })
})

describe('product line mapping', () => {
  it('finds the tax option by category and rate, so exempt is not read as zero-rated', () => {
    expect(taxCategoryOf(SEEDED_TAX_CATEGORIES, 'E', null)?.code).toBe('E0')
    expect(taxCategoryOf(SEEDED_TAX_CATEGORIES, 'Z', 0)?.code).toBe('Z0')
    expect(taxCategoryOf(SEEDED_TAX_CATEGORIES, 'S', 5)?.code).toBe('S5')
    expect(taxCategoryOf(SEEDED_TAX_CATEGORIES, 'S', 10)).toBeNull()
  })

  it("starts the line at the working branch's price when the list was read for a branch (P.9)", () => {
    const priced = product({ defaultUnitPrice: 10, effectivePrice: 12 })
    expect(lineFromProduct(SEEDED_TAX_CATEGORIES, priced, true).unitPrice).toBe('12.000')
    expect(lineFromProduct(SEEDED_TAX_CATEGORIES, priced, false).unitPrice).toBe('12.600')
    expect(
      lineFromProduct(SEEDED_TAX_CATEGORIES, product({ effectivePrice: null }), true).unitPrice,
    ).toBe('1.600')
  })

  it('prices the line inclusive of VAT when the line is being entered that way', () => {
    expect(
      lineFromProduct(SEEDED_TAX_CATEGORIES, product({ defaultUnitPrice: 10 }), true).unitPrice,
    ).toBe('10.000')
    expect(
      lineFromProduct(SEEDED_TAX_CATEGORIES, product({ defaultUnitPrice: 10 }), false).unitPrice,
    ).toBe('10.500')
    expect(
      lineFromProduct(
        SEEDED_TAX_CATEGORIES,
        product({ defaultTaxCategory: 'E', defaultTaxRate: null }),
        false,
      ),
    ).toMatchObject({
      vatRate: '0',
      taxCode: 'E0',
    })
  })

  it("carries the product's kind, classification, reason and discount onto the line (owner, 21 Oct 2026)", () => {
    expect(
      lineFromProduct(
        SEEDED_TAX_CATEGORIES,
        product({
          classificationGoodsOrService: 'G',
          classificationHsCode: '040110000000',
          classificationServiceTypeCode: '00000000',
          defaultTaxCategory: 'Z',
          defaultTaxRate: 0,
          defaultTaxReasonCode: 'VATZR-OM-01',
          defaultDiscount: { type: 'PERCENTAGE', value: 10 },
        }),
        true,
      ),
    ).toMatchObject({
      itemType: 'goods',
      hsCode: '040110000000',
      exemptionReasonCode: 'VATZR-OM-01',
      discountType: 'PERCENTAGE',
      discountValue: '10',
    })
    // A goods product's stray service type is not carried; a product without extras adds none.
    const plain = lineFromProduct(SEEDED_TAX_CATEGORIES, product(), true)
    expect(plain).not.toHaveProperty('itemType')
    expect(plain).not.toHaveProperty('hsCode')
    expect(plain).not.toHaveProperty('discountType')
    expect(
      lineFromProduct(
        SEEDED_TAX_CATEGORIES,
        product({
          classificationGoodsOrService: 'S',
          classificationServiceTypeCode: '00000000',
          classificationHsCode: '040110000000',
        }),
        true,
      ),
    ).toMatchObject({ itemType: 'service', serviceType: '00000000' })
  })

  it('stores exempt and out-of-scope products without a rate', () => {
    expect(
      newProductFrom(SEEDED_TAX_CATEGORIES, {
        code: 'X',
        name: 'X',
        unit: 'EA',
        price: '2',
        taxCode: 'E0',
      }),
    ).toMatchObject({
      defaultTaxCategory: 'E',
      defaultTaxRate: null,
    })
    expect(
      newProductFrom(SEEDED_TAX_CATEGORIES, {
        code: 'X',
        name: 'X',
        unit: 'EA',
        price: '2.5',
        taxCode: 'Z0',
      }),
    ).toMatchObject({
      defaultTaxCategory: 'Z',
      defaultTaxRate: 0,
      defaultUnitPrice: 2.5,
    })
  })

  it('suggests a code from the name', () => {
    expect(suggestProductCode('Coffee Beans 1kg', () => 0)).toBe('CB1-1000')
    expect(suggestProductCode('!!!', () => 0.5)).toBe('P-5500')
  })
})
