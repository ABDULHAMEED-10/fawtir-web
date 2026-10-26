import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import type { TemplateGroupDto, TemplateItemDto } from '../../../api/catalog/templates'
import type { ConsoleTemplateDto } from '../../../api/platform/businessTypes'
import { ConsoleTemplateEditorPage } from './ConsoleTemplateEditorPage'

/** Console › Settings › Business types › Template (Catalogue guide 1A). */
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
  permissions: ['platform.catalogue.manage'],
  scopes: [],
  featureFlags: {},
}

const item = (name: string, extra: Partial<TemplateItemDto> = {}): TemplateItemDto => ({
  name,
  nameAr: null,
  classification: { goodsOrService: 'G', hsCode: '000000000000', serviceTypeCode: null },
  defaultUnitCode: 'C62',
  defaultTaxCategory: 'S',
  defaultTaxReasonCode: null,
  defaultTaxReasonText: null,
  barcode: null,
  variants: {
    sizes: [
      { name: 'Small', nameAr: 'صغير' },
      { name: 'Large', nameAr: null },
    ],
    options: [],
  },
  addOns: [{ name: 'Extra shot', nameAr: null }],
  ...extra,
})

const DRAFT: TemplateGroupDto[] = [
  {
    name: 'Hot drinks',
    nameAr: null,
    kinds: [{ name: 'Coffee', nameAr: null, items: [item('Cappuccino'), item('Flat white')] }],
  },
]
const V1: TemplateGroupDto[] = [
  {
    name: 'Old menu',
    nameAr: null,
    kinds: [{ name: 'Tea', nameAr: null, items: [item('Karak')] }],
  },
]

const TEMPLATE: ConsoleTemplateDto = {
  subBusinessTypeCode: 'COFFEE_SHOP',
  draft: { revision: 3, updatedAt: '2026-10-26T08:00:00Z', itemCount: 2, groups: DRAFT },
  published: { version: 1, publishedAt: '2026-10-20T08:00:00Z', itemCount: 1, groups: V1 },
  versions: [{ version: 1, publishedAt: '2026-10-20T08:00:00Z', itemCount: 1 }],
}

const PATH = '/api/v1/platform/sub-business-types/COFFEE_SHOP/template'

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
    if (url === PATH && (init?.method ?? 'GET') === 'GET') return json(200, TEMPLATE)
    if (url === `${PATH}/versions/1`) return json(200, { ...TEMPLATE.versions[0], groups: V1 })
    if (url === '/api/v1/platform/business-types') return json(200, [])
    if (url.startsWith('/api/v1/code-lists/hs')) return json(200, { items: [] })
    return json(404, { title: 'Not found', status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/console/settings/business-types/COFFEE_SHOP/template']}>
      <Routes>
        <Route
          path="/console/settings/business-types/:code/template"
          element={<ConsoleTemplateEditorPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(
    ([u, init]) => u === url && (init as RequestInit | undefined)?.method === method,
  )

const openItem = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: /^Hot drinks/ }))
  fireEvent.click(await screen.findByRole('button', { name: /^Coffee/ }))
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('Console › template editor', () => {
  it('shows the draft as a Group › Kind › Item tree, with sizes, options and add-ons as names', async () => {
    renderEditor()
    expect(await screen.findByText(/2 items, saved/)).toBeTruthy()
    expect(screen.getByText(/Version 1, 1 item, published/)).toBeTruthy()
    await openItem('Cappuccino')
    expect((screen.getByLabelText(/^Sizes/) as HTMLInputElement).value).toBe('Small=صغير, Large')
    expect((screen.getByLabelText(/^Add-ons/) as HTMLInputElement).value).toBe('Extra shot')
    // No price anywhere in a template.
    expect(screen.queryByLabelText(/price/i)).toBeNull()
  })

  it('saves the whole draft with the revision it was read at', async () => {
    answer = (url, init) =>
      url === `${PATH}/draft` && init?.method === 'PUT'
        ? json(200, { ...TEMPLATE, draft: { ...TEMPLATE.draft!, revision: 4 } })
        : undefined
    renderEditor()
    await openItem('Cappuccino')
    fireEvent.change(screen.getByLabelText(/^Name\*?$/), { target: { value: 'Cappuccino grande' } })
    const sizes = screen.getByLabelText(/^Sizes/)
    fireEvent.change(sizes, { target: { value: 'Small, Medium=وسط, Large' } })
    fireEvent.blur(sizes)
    fireEvent.click(screen.getByRole('button', { name: 'Save the draft' }))

    await waitFor(() => expect(calls('PUT', `${PATH}/draft`)).toHaveLength(1))
    const body = JSON.parse((calls('PUT', `${PATH}/draft`)[0][1] as RequestInit).body as string)
    expect(body.expectedRevision).toBe(3)
    const saved = body.groups[0].kinds[0].items[0]
    expect(saved.name).toBe('Cappuccino grande')
    expect(saved.variants.sizes).toEqual([
      { name: 'Small', nameAr: null },
      { name: 'Medium', nameAr: 'وسط' },
      { name: 'Large', nameAr: null },
    ])
    expect(await screen.findByText('Draft saved.')).toBeTruthy()
  })

  it('shows every row the server refuses on import, and keeps the draft', async () => {
    answer = (url, init) =>
      url === `${PATH}/import?expectedRevision=3` && init?.method === 'POST'
        ? json(400, {
            type: 'https://api.fawtir.om/problems/catalogue-template-invalid',
            status: 400,
            errors: [
              { row: 4, path: null, field: 'hs_code', message: 'Not on the Oman HS list.' },
              { row: 9, path: null, field: 'vat_reason_code', message: 'Export reason.' },
            ],
          })
        : undefined
    renderEditor()
    await screen.findByText(/2 items, saved/)
    const file = new File(['group,kind,item\n'], 'menu.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Import a spreadsheet', { selector: 'input' }), {
      target: { files: [file] },
    })

    const errors = await screen.findByRole('region', { name: 'What needs fixing' })
    expect(
      within(errors).getByText(/The spreadsheet was not imported: 2 rows need fixing/),
    ).toBeTruthy()
    expect(within(errors).getByText('Row 4 · HS code')).toBeTruthy()
    expect(within(errors).getByText('Row 9 · VAT reason')).toBeTruthy()
    const sent = calls('POST', `${PATH}/import?expectedRevision=3`)[0][1] as RequestInit
    expect(sent.body).toBeInstanceOf(FormData)
    expect(((sent.body as FormData).get('file') as File).name).toBe('menu.csv')
    // The draft on screen is unchanged.
    expect(screen.getByText(/2 items, saved/)).toBeTruthy()
  })

  it('publishes the saved draft, and not while there are unsaved changes', async () => {
    answer = (url, init) =>
      url === `${PATH}/publish` && init?.method === 'POST'
        ? json(200, {
            ...TEMPLATE,
            versions: [
              { version: 2, publishedAt: '2026-10-26T10:00:00Z', itemCount: 2 },
              ...TEMPLATE.versions,
            ],
          })
        : undefined
    renderEditor()
    await openItem('Flat white')
    fireEvent.change(screen.getByLabelText(/^Barcode/), { target: { value: '6281000000001' } })
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo the changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(calls('POST', `${PATH}/publish`)).toHaveLength(1))
    expect(await screen.findByText(/Published as version 2/)).toBeTruthy()
    expect(screen.getByText('Version 2')).toBeTruthy()
  })

  it('shows an earlier version read only', async () => {
    renderEditor()
    await screen.findByText(/2 items, saved/)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByText(/Viewing version 1/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Old menu/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save the draft' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the draft' }))
    expect(await screen.findByRole('button', { name: /^Hot drinks/ })).toBeTruthy()
  })

  it('says when someone else saved the draft first', async () => {
    answer = (url, init) =>
      url === `${PATH}/draft` && init?.method === 'PUT'
        ? json(409, {
            type: 'https://api.fawtir.om/problems/catalogue-template-draft-conflict',
            status: 409,
          })
        : undefined
    renderEditor()
    await openItem('Cappuccino')
    fireEvent.change(screen.getByLabelText(/^Name\*?$/), { target: { value: 'Latte' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the draft' }))
    expect(
      await screen.findByText(i18n.t('console.businessTypes.error.draftConflict')),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })
})
