import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import type {
  ConsoleBusinessTypeDto,
  ConsoleSubBusinessTypeDto,
} from '../../../api/platform/businessTypes'
import { ConsoleBusinessTypesPage } from './ConsoleBusinessTypesPage'

/** Console › Settings › Business types (Catalogue guide 1A). */
const OPERATOR: Entitlements = {
  userId: 'u-admin',
  username: 'super.admin',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
  ],
  permissions: ['platform.tenants.manage', 'platform.catalogue.manage'],
  scopes: [],
  featureFlags: {},
}

const sub = (
  code: string,
  businessTypeCode: string,
  nameEn: string,
  displayOrder: number,
  extra: Partial<ConsoleSubBusinessTypeDto> = {},
): ConsoleSubBusinessTypeDto => ({
  code,
  businessTypeCode,
  nameEn,
  nameAr: null,
  icon: null,
  displayOrder,
  retiredAt: null,
  updatedAt: '2026-10-26T08:00:00Z',
  suggestedIsic: null,
  companies: 0,
  template: null,
  ...extra,
})

const TYPES: ConsoleBusinessTypeDto[] = [
  {
    code: 'FOOD_AND_BEVERAGE',
    nameEn: 'Food & Beverage',
    nameAr: 'الأغذية والمشروبات',
    icon: 'utensils',
    displayOrder: 1,
    openForSignup: true,
    retiredAt: null,
    updatedAt: '2026-10-26T08:00:00Z',
    subTypes: [
      sub('COFFEE_SHOP', 'FOOD_AND_BEVERAGE', 'Coffee shop', 1, {
        suggestedIsic: { code: '563001', nameEn: 'Cafés', nameAr: null },
        companies: 4,
        template: {
          hasDraft: true,
          draftRevision: 3,
          draftUpdatedAt: '2026-10-26T08:00:00Z',
          draftItemCount: 30,
          publishedVersion: 2,
          publishedAt: '2026-10-25T12:00:00Z',
          publishedItemCount: 30,
        },
      }),
      sub('BAKERY', 'FOOD_AND_BEVERAGE', 'Bakery', 2),
    ],
  },
  {
    code: 'RETAIL',
    nameEn: 'Retail',
    nameAr: null,
    icon: 'store',
    displayOrder: 2,
    openForSignup: false,
    retiredAt: null,
    updatedAt: '2026-10-26T08:00:00Z',
    subTypes: [],
  },
]

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

type Answer = (url: string, init?: RequestInit) => Response | undefined
let answer: Answer
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  answer = () => undefined
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, OPERATOR)
    const own = answer(url, init)
    if (own) return own
    if (url === '/api/v1/platform/business-types' && (init?.method ?? 'GET') === 'GET')
      return json(200, TYPES)
    return json(404, { title: 'Not found', status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/console/settings/business-types']}>
      <Routes>
        <Route path="/console/settings/business-types" element={<ConsoleBusinessTypesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const sent = (method: string, url: string) =>
  fetchMock.mock.calls
    .filter(([u, init]) => u === url && (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => {
      const body = (init as RequestInit).body
      return body ? JSON.parse(body as string) : undefined
    })

const typeCard = (name: string) => screen.getByRole('region', { name })

describe('Console › Settings › Business types', () => {
  it('lists both levels in order, with their state, codes, suggestion and template', async () => {
    renderPage()
    const food = await screen.findByRole('region', { name: 'Food & Beverage' })
    expect(within(food).getByText('Open for sign-up', { selector: 'span.uppercase' })).toBeTruthy()
    expect(within(food).getByText('FOOD_AND_BEVERAGE')).toBeTruthy()
    expect(within(food).getByText('Coffee shop')).toBeTruthy()
    expect(within(food).getByText('563001')).toBeTruthy()
    expect(within(food).getByText(/Chosen by 4 companies/)).toBeTruthy()
    expect(within(food).getByText(/Version 2, 30 items/)).toBeTruthy()
    expect(within(food).getAllByRole('link', { name: 'Template' })[0].getAttribute('href')).toBe(
      '/console/settings/business-types/COFFEE_SHOP/template',
    )
    const retail = typeCard('Retail')
    expect(
      within(retail).getByText('Closed for sign-up', { selector: 'span.uppercase' }),
    ).toBeTruthy()
    expect(within(retail).getAllByText(/No Arabic name yet/).length).toBeGreaterThan(0)
  })

  it('opens a type for sign-up, and says why the server refuses one with no active sub type', async () => {
    answer = (url, init) =>
      url === '/api/v1/platform/business-types/RETAIL/signup' && init?.method === 'PUT'
        ? json(409, {
            type: 'https://api.fawtir.om/problems/business-type-has-no-active-sub-type',
            status: 409,
          })
        : undefined
    renderPage()
    const retail = await screen.findByRole('region', { name: 'Retail' })
    fireEvent.click(within(retail).getByRole('switch', { name: 'Open for sign-up' }))

    expect(await within(retail).findByRole('alert')).toBeTruthy()
    expect(within(retail).getByRole('alert').textContent).toBe(
      i18n.t('console.businessTypes.error.noActiveSubType'),
    )
    expect(sent('PUT', '/api/v1/platform/business-types/RETAIL/signup')).toEqual([{ open: true }])
  })

  it('moves a type down by sending the whole order', async () => {
    answer = (url, init) =>
      url === '/api/v1/platform/business-types/order' && init?.method === 'PUT'
        ? json(200, [
            { ...TYPES[1], displayOrder: 1 },
            { ...TYPES[0], displayOrder: 2 },
          ])
        : undefined
    renderPage()
    const food = await screen.findByRole('region', { name: 'Food & Beverage' })
    fireEvent.click(within(food).getByRole('button', { name: 'Actions for Food & Beverage' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Move down/ }))

    await waitFor(() =>
      expect(sent('PUT', '/api/v1/platform/business-types/order')).toEqual([
        { codes: ['RETAIL', 'FOOD_AND_BEVERAGE'] },
      ]),
    )
    await waitFor(() =>
      expect(
        screen.getAllByRole('region').map((region) => region.getAttribute('aria-label')),
      ).toEqual(['Retail', 'Food & Beverage']),
    )
  })

  it('adds a type with a code made from its name, closed for sign-up', async () => {
    answer = (url, init) =>
      url === '/api/v1/platform/business-types' && init?.method === 'POST'
        ? json(201, {
            ...TYPES[1],
            code: 'PET_CARE',
            nameEn: 'Pet care',
            displayOrder: 3,
          })
        : undefined
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a business type' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Name in English/), {
      target: { value: 'Pet care' },
    })
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).value).toBe('PET_CARE')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('region', { name: 'Pet care' })).toBeTruthy()
    expect(sent('POST', '/api/v1/platform/business-types')).toEqual([
      { code: 'PET_CARE', nameEn: 'Pet care' },
    ])
  })

  it('refuses a code already taken, inside the dialog', async () => {
    answer = (url, init) =>
      url === '/api/v1/platform/business-types' && init?.method === 'POST'
        ? json(409, { type: 'https://api.fawtir.om/problems/catalogue-code-taken', status: 409 })
        : undefined
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a business type' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Name in English/), {
      target: { value: 'Retail' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      i18n.t('console.businessTypes.error.codeTaken'),
    )
  })

  it('retires a sub type after asking, and never deletes', async () => {
    answer = (url, init) =>
      url === '/api/v1/platform/sub-business-types/BAKERY/retire' && init?.method === 'POST'
        ? json(200, { ...TYPES[0].subTypes[1], retiredAt: '2026-10-26T09:00:00Z' })
        : undefined
    renderPage()
    const food = await screen.findByRole('region', { name: 'Food & Beverage' })
    fireEvent.click(within(food).getByRole('button', { name: 'Actions for Bakery' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Retire/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retire' }))

    await waitFor(() =>
      expect(sent('POST', '/api/v1/platform/sub-business-types/BAKERY/retire')).toHaveLength(1),
    )
    expect(await within(typeCard('Food & Beverage')).findByText('Retired')).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false)
  })

  it('sets the suggested activity of a sub type', async () => {
    answer = (url, init) =>
      url === '/api/v1/platform/sub-business-types/BAKERY/suggested-isic' && init?.method === 'PUT'
        ? json(200, {
            ...TYPES[0].subTypes[1],
            suggestedIsic: { code: '107101', nameEn: 'Bread', nameAr: null },
          })
        : undefined
    renderPage()
    const food = await screen.findByRole('region', { name: 'Food & Beverage' })
    fireEvent.click(within(food).getByRole('button', { name: 'Actions for Bakery' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Suggested activity/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suggested business activity' }))
    fireEvent.change(await screen.findByPlaceholderText('Search by activity name or code'), {
      target: { value: '107101' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /bread/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(sent('PUT', '/api/v1/platform/sub-business-types/BAKERY/suggested-isic')).toEqual([
        { code: '107101' },
      ]),
    )
    expect(await within(typeCard('Food & Beverage')).findByText('107101')).toBeTruthy()
  })

  it('is in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByRole('heading', { level: 2, name: 'أنواع الأنشطة' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'إضافة نوع نشاط' })).toBeTruthy()
    expect(screen.getAllByText('متاح للتسجيل').length).toBeGreaterThan(0)
  })
})
