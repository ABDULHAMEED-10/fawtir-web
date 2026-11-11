import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { suggestedFrom } from '../../lib/catalogTemplates'
import { resetSharedRequests } from '../../api'
import type { TemplateGroupDto, TemplateItemDto } from '../../api/catalog/templates'
import { SIGNUP_BUSINESS_TYPES } from '../../test/businessTypes'
import { BuildCatalogPage } from './BuildCatalogPage'

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

const BRANCHES = [
  { id: 'b-1', code: 'MCT', name: 'Muscat', type: 'STORE', city: 'Muscat' },
  { id: 'b-2', code: 'HO', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
  { id: 'b-3', code: 'NZW', name: 'Nizwa', type: 'STORE', city: 'Nizwa' },
]

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const item = (name: string, extra: Partial<TemplateItemDto> = {}): TemplateItemDto => ({
  name,
  nameAr: null,
  classification: { goodsOrService: 'G', hsCode: '000000000000', serviceTypeCode: null },
  defaultUnitCode: 'EA',
  defaultTaxCategory: 'S',
  defaultTaxReasonCode: null,
  defaultTaxReasonText: null,
  barcode: null,
  variants: null,
  addOns: [],
  ...extra,
})

const GROUPS: TemplateGroupDto[] = [
  {
    name: 'Desserts',
    nameAr: 'حلويات',
    kinds: [
      {
        name: 'Cakes & Pastries',
        nameAr: null,
        items: [
          item('Chocolate cake bar', { barcode: '6281007062251' }),
          item('Brownie', { nameAr: 'براوني' }),
          item('Gift box', { defaultSelected: false }),
        ],
      },
    ],
  },
]

/** `GET /catalog/templates` for the company's own sub type (Catalogue guide 1A). */
const TEMPLATE = {
  subBusinessTypeCode: 'COFFEE_SHOP',
  version: 2,
  publishedAt: '2026-10-25T12:00:00Z',
  groups: GROUPS,
}

let templateAnswer: () => Response
const requested: string[] = []
/** Every write, as `METHOD path body`, in the order it was sent. */
let writes: { method: string; url: string; body: Record<string, unknown> }[] = []
/** A product create the server refuses, by name, until cleared. */
let refuseProduct: string | null = null

/** Catalogue templates by sub-business type (owner, 21 Oct 2026), read from the server. */
describe('building a catalog from a template', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    forgetEntitlements()
    resetSharedRequests()
    window.localStorage.clear()
    requested.length = 0
    writes = []
    refuseProduct = null
    templateAnswer = () => json(TEMPLATE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requested.push(url)
        const method = init?.method ?? 'GET'
        if (method !== 'GET') {
          const body = init?.body ? JSON.parse(String(init.body)) : {}
          writes.push({ method, url, body })
          if (url === '/api/v1/catalog/groups')
            return json({ id: 'g-new', ...body, sortOrder: 0, version: 0, kinds: [] })
          if (url === '/api/v1/catalog/groups/g-new/kinds')
            return json({ id: 'k-new', groupId: 'g-new', ...body, sortOrder: 0, version: 0 })
          if (url === '/api/v1/products') {
            if (body.name === refuseProduct) {
              return new Response(
                JSON.stringify({
                  type: 'https://api.fawtir.om/problems/validation-failed',
                  status: 400,
                  code: 'PRODUCT_BARCODE_INVALID',
                }),
                { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
              )
            }
            return json({ id: `p-${writes.length}`, ...body, active: true, version: 0 })
          }
        }
        if (url === '/api/v1/catalog/groups') return json({ groups: [] })
        if (url === '/api/v1/me/entitlements') return json(OWNER)
        if (url === '/api/v1/branches') return json(BRANCHES)
        if (url === '/api/v1/catalog/templates') return templateAnswer()
        if (url === '/api/v1/auth/signup/business-types') return json(SIGNUP_BUSINESS_TYPES)
        return new Response('', { status: 404 })
      }),
    )
  })

  const renderBuild = () =>
    render(
      <MemoryRouter initialEntries={['/catalog/build']}>
        <Routes>
          <Route path="/catalog/build" element={<BuildCatalogPage />} />
        </Routes>
      </MemoryRouter>,
    )

  it("opens on the company's own template, read from the server and named by its sub type", async () => {
    renderBuild()
    expect(await screen.findByText('Cakes & Pastries')).toBeTruthy()
    expect(requested).toContain('/api/v1/catalog/templates')
    expect((await screen.findAllByText(/^Coffee shop$/)).length).toBeGreaterThan(0)
    expect(screen.getByText('Chocolate cake bar')).toBeTruthy()
    expect(screen.getByText('6281007062251')).toBeTruthy()
  })

  it('starts an own catalog with nothing suggested', async () => {
    renderBuild()
    await screen.findByText('Cakes & Pastries')
    fireEvent.click(screen.getByRole('button', { name: 'Business type' }))
    fireEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Start my own catalog' }),
    )
    expect(await screen.findByText('Your own catalog starts empty.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add your first item' }).getAttribute('href')).toBe(
      '/catalog/new',
    )
  })

  it('says when the business type has no template, and offers only an own catalog', async () => {
    templateAnswer = () =>
      new Response(JSON.stringify({ type: 'https://api.fawtir.om/problems/resource-not-found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/problem+json' },
      })
    renderBuild()
    expect(await screen.findByText(i18n.t('buildCatalog.noTemplateNote'))).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: i18n.t('buildCatalog.chooseBusinessType') })
        .getAttribute('href'),
    ).toBe('/settings/company')
    fireEvent.click(screen.getByRole('button', { name: 'Business type' }))
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('Start my own catalog')
  })

  it('lets every suggested price be typed and keeps it at three decimals', async () => {
    renderBuild()
    const [price] = await screen.findAllByLabelText('Price')
    expect((price as HTMLInputElement).value).toBe('')
    fireEvent.change(price, { target: { value: '1.2' } })
    fireEvent.blur(price)
    expect((price as HTMLInputElement).value).toBe('1.200')
  })

  it('starts an item the template marks zero-rated as Z with its reason, exempt as E', () => {
    const [group] = suggestedFrom([
      {
        name: 'Baby Formula & Food',
        nameAr: null,
        kinds: [
          {
            name: 'Baby Milk',
            nameAr: null,
            items: [
              item('Formula 400 g', {
                defaultTaxCategory: 'Z',
                defaultTaxReasonCode: 'VATZR-OM-01',
              }),
              item('Wipes', { defaultUnitCode: 'PK' }),
              item('Clinic visit', {
                defaultTaxCategory: 'E',
                defaultTaxReasonCode: 'VATEX-OM-01',
              }),
            ],
          },
        ],
      },
    ])
    expect(
      group.kinds[0].sizes.map((size) => [size.taxCode, size.reasonCode, size.soldAs]),
    ).toEqual([
      ['Z0', 'VATZR-OM-01', 'EA'],
      // A bare Rec 21 package code starts in its X form (ibr-cl-23).
      ['S5', undefined, 'XPK'],
      ['E0', 'VATEX-OM-01', 'EA'],
    ])
  })

  it('names groups in Arabic where the template has an Arabic name, in English otherwise', () => {
    const [group] = suggestedFrom(GROUPS, 'ar')
    expect(group.name).toBe('حلويات')
    expect(group.kinds[0].name).toBe('Cakes & Pastries')
  })

  it('starts an item the template marks not selected unticked (W-3)', async () => {
    renderBuild()
    await screen.findByText('Gift box')
    const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
    expect(box('Chocolate cake bar').checked).toBe(true)
    expect(box('Brownie').checked).toBe(true)
    expect(box('Gift box').checked).toBe(false)
  })

  it('counts only what would be added: nothing under an unticked kind or group, and items not sizes (E2E L-9)', async () => {
    renderBuild()
    await screen.findByText('Gift box')
    expect(screen.getByText('2 items picked')).toBeTruthy()
    expect(screen.getByText('1 kind picked')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cakes & Pastries' }))
    expect(screen.queryByText('2 items picked')).toBeNull()
    expect(screen.queryByText('1 kind picked')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cakes & Pastries' }))
    expect(screen.getByText('1 kind picked')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Desserts' }))
    expect(screen.queryByText('1 kind picked')).toBeNull()
    expect(i18n.t('buildCatalog.itemsPicked', { count: 11, lng: 'ar' })).toBe('11 صنفًا محددًا')
    expect(i18n.t('buildCatalog.itemsPicked', { count: 2, lng: 'ar' })).toBe('صنفان محددان')
  })

  it('keeps ticks and prices when the language changes (W-4)', async () => {
    renderBuild()
    const [price] = await screen.findAllByLabelText('Price')
    fireEvent.change(price, { target: { value: '2.5' } })
    fireEvent.blur(price)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Brownie' }))
    await act(() => i18n.changeLanguage('ar'))
    expect(await screen.findByText('براوني')).toBeTruthy()
    expect(
      (screen.getAllByLabelText(i18n.t('buildCatalog.col.price'))[0] as HTMLInputElement).value,
    ).toBe('2.500')
    expect((screen.getByRole('checkbox', { name: 'براوني' }) as HTMLInputElement).checked).toBe(
      false,
    )
  })

  it('adds the ticked items: group, kind, then each product, and says what happened (B-1)', async () => {
    renderBuild()
    const [price] = await screen.findAllByLabelText('Price')
    fireEvent.change(price, { target: { value: '0.8' } })
    fireEvent.blur(price)
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to the catalog' }))
    expect(
      await screen.findByText('Added 2, skipped 0 already in your catalog, 0 failed.'),
    ).toBeTruthy()
    expect(writes.map((w) => `${w.method} ${w.url}`)).toEqual([
      'POST /api/v1/catalog/groups',
      'POST /api/v1/catalog/groups/g-new/kinds',
      'POST /api/v1/products',
      'POST /api/v1/products',
    ])
    expect(writes[0].body).toMatchObject({ name: 'Desserts', nameAr: 'حلويات' })
    expect(writes[2].body).toMatchObject({
      name: 'Chocolate cake bar',
      kindId: 'k-new',
      defaultUnitPrice: 0.8,
      barcode: '6281007062251',
      classification: { goodsOrService: 'G', hsCode: '000000000000' },
    })
    // Both names whatever the screen's language.
    expect(writes[3].body).toMatchObject({ name: 'Brownie', nameAr: 'براوني', defaultUnitPrice: 0 })
    expect(screen.getByRole('link', { name: 'Open the catalog' }).getAttribute('href')).toBe(
      '/catalog',
    )
  })

  it('says how many added items still have no price and links to Wanting attention', async () => {
    renderBuild()
    const [price] = await screen.findAllByLabelText('Price')
    fireEvent.change(price, { target: { value: '0.8' } })
    fireEvent.blur(price)
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to the catalog' }))
    expect(await screen.findByText(/1 item still has no price\./)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'See them in Wanting attention' }).getAttribute('href'),
    ).toBe('/catalog?tab=attention&sort=priceLow')
  })

  it('says nothing about prices when every item added has one', async () => {
    renderBuild()
    for (const price of await screen.findAllByLabelText('Price')) {
      fireEvent.change(price, { target: { value: '0.8' } })
      fireEvent.blur(price)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to the catalog' }))
    await screen.findByText('Added 2, skipped 0 already in your catalog, 0 failed.')
    expect(screen.queryByText(/still has no price|still have no price/)).toBeNull()
  })

  it('shows the notice on prices, in English and Arabic', async () => {
    renderBuild()
    expect(
      await screen.findByText(
        'These are suggestions. Prices start at 0.000: set your own prices, units, VAT and stock counting to match how you sell, before you sell.',
      ),
    ).toBeTruthy()
    await act(() => i18n.changeLanguage('ar'))
    expect(
      await screen.findByText(
        'هذه اقتراحات. تبدأ الأسعار من 0.000: حدّد أسعارك ووحداتك وضريبتك ومتابعة المخزون بما يناسب طريقة بيعك، قبل البيع.',
      ),
    ).toBeTruthy()
  })

  it('lists what failed and why, and tries only those again', async () => {
    refuseProduct = 'Brownie'
    renderBuild()
    await screen.findByText('Brownie')
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to the catalog' }))
    expect(
      await screen.findByText('Added 1, skipped 0 already in your catalog, 1 failed.'),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('buildCatalog.failedTitle'))).toBeTruthy()
    refuseProduct = null
    writes = []
    fireEvent.click(screen.getByRole('button', { name: 'Try the failed ones again' }))
    expect(
      await screen.findByText('Added 2, skipped 0 already in your catalog, 0 failed.'),
    ).toBeTruthy()
    // The group and kind are found, not made again; only the failed item is sent.
    expect(writes.map((w) => w.body.name)).toEqual(['Desserts', 'Cakes & Pastries', 'Brownie'])
  })

  it('saves the work to finish later, per company, and puts it back', async () => {
    const { unmount } = renderBuild()
    const [price] = await screen.findAllByLabelText('Price')
    fireEvent.change(price, { target: { value: '1.1' } })
    fireEvent.blur(price)
    fireEvent.click(screen.getByRole('button', { name: 'Save and finish later' }))
    expect(writes).toEqual([])
    unmount()
    resetSharedRequests()
    renderBuild()
    await waitFor(() =>
      expect((screen.getAllByLabelText('Price')[0] as HTMLInputElement).value).toBe('1.100'),
    )
    expect(screen.getByText(/Your saved ticks and prices are back/)).toBeTruthy()
  })
})
