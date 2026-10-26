import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
        items: [item('Chocolate cake bar', { barcode: '6281007062251' }), item('Brownie')],
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

/** Catalogue templates by sub-business type (owner, 21 Oct 2026), read from the server. */
describe('building a catalog from a template', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    forgetEntitlements()
    resetSharedRequests()
    window.localStorage.clear()
    requested.length = 0
    templateAnswer = () => json(TEMPLATE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        requested.push(url)
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
      ['S5', undefined, 'PK'],
      ['E0', 'VATEX-OM-01', 'EA'],
    ])
  })

  it('names groups in Arabic where the template has an Arabic name, in English otherwise', () => {
    const [group] = suggestedFrom(GROUPS, 'ar')
    expect(group.name).toBe('حلويات')
    expect(group.kinds[0].name).toBe('Cakes & Pastries')
  })
})
