import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { UploadMenuPage } from './UploadMenuPage'

const FILE_ID = '7f1c2a50-0000-4000-8000-000000000001'

const reader = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const row = (
  id: string,
  name: string,
  price: number | null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  nameAr: null,
  description: null,
  price,
  priceAsPrinted: price === null ? null : price.toFixed(3),
  currency: 'OMR',
  sizes: [],
  confidence: 0.95,
  state: 'clear',
  ticked: true,
  concerns: [],
  soldAs: 'C62',
  taxCategory: 'S',
  taxPercent: 5,
  goodsOrService: 'G',
  itemKind: 'HAND_OVER',
  hsCode: '000000000000',
  ...extra,
})

const READING = {
  fileId: FILE_ID,
  reason: null,
  summary: { clear: 3, needChecking: 1, headings: 2 },
  groups: [
    {
      id: 'g1',
      heading: 'Brewed Coffee',
      headingAr: null,
      becomes: 'Brewed coffee',
      existingGroupId: null,
      rows: [
        row('g1-r1', 'Espresso', 0.8),
        row('g1-r2', 'V60 Pour Over', null, {
          priceAsPrinted: '1.8OO',
          state: 'check',
          ticked: false,
          concerns: [{ code: 'PRICE_UNREADABLE', message: 'SERVER ENGLISH NEVER SHOWN' }],
        }),
      ],
    },
    {
      id: 'g2',
      heading: 'Sweets',
      headingAr: 'حلويات',
      becomes: 'Sweets',
      existingGroupId: null,
      rows: [row('g2-r1', 'Date cake', 1.2), row('g2-r2', 'Halwa', 2)],
    },
  ],
}

const GROUPS = {
  groups: [
    {
      id: 'g-drinks',
      name: 'Drinks',
      nameAr: null,
      sortOrder: 0,
      version: 0,
      kinds: [
        {
          id: 'k-coffee',
          groupId: 'g-drinks',
          name: 'Coffee',
          nameAr: null,
          sortOrder: 0,
          version: 0,
        },
      ],
    },
  ],
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let permissions: string[]
let onRead: () => Response
let onConfirm: (init: RequestInit) => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  permissions = ['product.read', 'product.manage']
  onRead = () => json(READING)
  onConfirm = (init) => {
    const body = JSON.parse(String(init.body))
    const count = body.groups.reduce((n: number, g: { items: unknown[] }) => n + g.items.length, 0)
    return json(
      {
        confirmationId: 'c-1',
        fileId: FILE_ID,
        replayed: false,
        productCount: count,
        products: [],
      },
      201,
    )
  }
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:menu', revokeObjectURL: () => undefined }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(reader(permissions))
      if (url === '/api/v1/catalog/groups') return json(GROUPS)
      if (url === '/api/v1/catalog/menu-scans' && init.method === 'POST') {
        return json(
          {
            fileId: FILE_ID,
            contentType: 'image/png',
            byteSize: 4,
            sha256: 'x',
            uploadedAt: '2026-10-29T08:00:00Z',
          },
          201,
        )
      }
      if (url === `/api/v1/catalog/menu-scans/${FILE_ID}/read`) return onRead()
      if (url === `/api/v1/catalog/menu-scans/${FILE_ID}/file`) {
        return new Response('png', {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      }
      if (url === `/api/v1/catalog/menu-scans/${FILE_ID}/confirm`) return onConfirm(init)
      return json({ type: 'about:blank' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const calls = (suffix: string) =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).endsWith(suffix))
    .map(([url, init]) => ({ url: String(url), init: init ?? {} }))

const open = () =>
  render(
    <MemoryRouter initialEntries={['/catalog/upload']}>
      <Routes>
        <Route path="/catalog/upload" element={<UploadMenuPage />} />
        <Route path="/catalog" element={<p>catalog list</p>} />
        <Route path="/catalog/new" element={<p>new item</p>} />
      </Routes>
    </MemoryRouter>,
  )

const pick = async (file = new File(['png'], 'menu.png', { type: 'image/png' })) => {
  const input = (await screen.findByTestId('menu-file')) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

const lineOf = (name: string) => screen.getByDisplayValue(name).closest('li') as HTMLElement

describe('Upload a menu on /v1/catalog/menu-scans', () => {
  it('is closed to a reader without product.manage, and calls nothing', async () => {
    permissions = ['product.read']
    open()
    expect(await screen.findByText(i18n.t('appAccess.missingPermission'))).toBeTruthy()
    expect(screen.queryByTestId('menu-file')).toBeNull()
    expect(calls('/menu-scans')).toHaveLength(0)
  })

  it('uploads the file, reads it, shows the original and words each concern', async () => {
    open()
    await pick()
    expect(await screen.findByDisplayValue('Espresso')).toBeTruthy()

    const [upload] = calls('/api/v1/catalog/menu-scans')
    expect(upload.init.method).toBe('POST')
    expect(upload.init.body).toBeInstanceOf(FormData)
    expect((upload.init.body as FormData).get('file')).toBeInstanceOf(File)
    expect(calls('/read')[0].init.method).toBe('POST')
    expect(calls('/file')).toHaveLength(1)
    expect(
      ((await screen.findByAltText(i18n.t('uploadMenu.paperAlt'))) as HTMLImageElement).src,
    ).toBe('blob:menu')

    // A check row is highlighted with the concern in our own words, never the server's English.
    const v60 = lineOf('V60 Pour Over')
    expect(
      within(v60).getByText(i18n.t('uploadMenu.concern.priceUnreadable', { printed: '1.8OO' })),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain('SERVER ENGLISH NEVER SHOWN')
    expect(screen.getByText(i18n.t('uploadMenu.tickedOf', { ticked: 3, total: 4 }))).toBeTruthy()
  })

  it('sends only the kept rows, with edits and a heading mapped to an existing kind, under an Idempotency-Key', async () => {
    open()
    await pick()
    await screen.findByDisplayValue('Espresso')

    // Edit a name, put a price on the doubtful line and tick it, drop Halwa, map Brewed Coffee.
    fireEvent.change(screen.getByDisplayValue('Espresso'), { target: { value: 'Espresso single' } })
    const v60 = lineOf('V60 Pour Over')
    fireEvent.change(
      within(v60).getByLabelText(i18n.t('uploadMenu.priceOf', { name: 'V60 Pour Over' })),
      {
        target: { value: '1.800' },
      },
    )
    fireEvent.click(within(v60).getByRole('checkbox'))
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('uploadMenu.removeRowOf', { name: 'Halwa' }) }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('uploadMenu.groupTarget', { heading: 'Brewed Coffee' }),
      }),
    )
    fireEvent.click(await screen.findByRole('option', { name: 'Drinks › Coffee' }))

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('uploadMenu.addItems', { count: 3 }) }),
    )
    expect(await screen.findByText(i18n.t('uploadMenu.addedCount', { count: 3 }))).toBeTruthy()

    const [confirm] = calls('/confirm')
    expect(confirm.init.method).toBe('POST')
    const key = (confirm.init.headers as Record<string, string>)['Idempotency-Key']
    expect(key).toMatch(/^[A-Za-z0-9._:-]{1,100}$/)
    expect(JSON.parse(String(confirm.init.body))).toEqual({
      groups: [
        {
          kindId: 'k-coffee',
          items: [
            expect.objectContaining({
              name: 'Espresso single',
              price: 0.8,
              unitCode: 'C62',
              taxCategory: 'S',
              taxRate: 5,
              itemKind: 'HAND_OVER',
              hsCode: '000000000000',
            }),
            expect.objectContaining({ name: 'V60 Pour Over', price: 1.8 }),
          ],
        },
        {
          name: 'Sweets',
          nameAr: 'حلويات',
          items: [expect.objectContaining({ name: 'Date cake', price: 1.2 })],
        },
      ],
    })
    expect(
      screen.getByRole('link', { name: i18n.t('uploadMenu.openCatalog') }).getAttribute('href'),
    ).toBe('/catalog')
  })

  it('places refused rows on their lines and keeps the key for the same list, a new one for an edited list', async () => {
    onConfirm = () =>
      json(
        {
          status: 400,
          code: 'MENU_SCAN_ROWS_REFUSED',
          rows: [
            { group: 0, item: 1, field: 'price', code: 'MENU_SCAN_PRICE_REQUIRED', message: 'x' },
          ],
        },
        400,
      )
    open()
    await pick()
    await screen.findByDisplayValue('Espresso')
    fireEvent.click(within(lineOf('V60 Pour Over')).getByRole('checkbox'))
    const add = screen.getByRole('button', { name: i18n.t('uploadMenu.addItems', { count: 4 }) })
    fireEvent.click(add)

    expect(
      await within(lineOf('V60 Pour Over')).findByText(i18n.t('uploadMenu.rowError.priceRequired')),
    ).toBeTruthy()
    expect(
      within(lineOf('Espresso')).queryByText(i18n.t('uploadMenu.rowError.priceRequired')),
    ).toBeNull()
    expect(screen.getByText(i18n.t('uploadMenu.rowsRefused', { count: 1 }))).toBeTruthy()

    fireEvent.click(add)
    await waitFor(() => expect(calls('/confirm')).toHaveLength(2))
    fireEvent.change(
      within(lineOf('V60 Pour Over')).getByLabelText(
        i18n.t('uploadMenu.priceOf', { name: 'V60 Pour Over' }),
      ),
      { target: { value: '1.8' } },
    )
    fireEvent.click(add)
    await waitFor(() => expect(calls('/confirm')).toHaveLength(3))
    const keys = calls('/confirm').map(
      ({ init }) => (init.headers as Record<string, string>)['Idempotency-Key'],
    )
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[1])
  })

  it("says today's limit is reached and keeps the photo with the way to add by hand", async () => {
    onRead = () =>
      json(
        {
          status: 429,
          code: 'MENU_SCAN_DAILY_LIMIT',
          detail: "You've reached today's limit",
          limit: 20,
        },
        429,
      )
    open()
    await pick()
    expect(await screen.findByText(i18n.t('uploadMenu.unread.DAILY_LIMIT.body'))).toBeTruthy()
    expect(await screen.findByAltText(i18n.t('uploadMenu.paperAlt'))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('uploadMenu.addByHand') }).getAttribute('href'),
    ).toBe('/catalog/new')
    expect(screen.queryByRole('button', { name: i18n.t('uploadMenu.tryAgain') })).toBeNull()
  })

  it('offers add by hand and the suggested list when reading is unavailable', async () => {
    onRead = () =>
      json({
        fileId: FILE_ID,
        reason: 'READING_UNAVAILABLE',
        summary: { clear: 0, needChecking: 0, headings: 0 },
        groups: [],
      })
    open()
    await pick()
    expect(
      await screen.findByText(i18n.t('uploadMenu.unread.READING_UNAVAILABLE.title')),
    ).toBeTruthy()
    expect(await screen.findByAltText(i18n.t('uploadMenu.paperAlt'))).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('uploadMenu.addByHand') })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: i18n.t('uploadMenu.buildFromList') }).getAttribute('href'),
    ).toBe('/catalog/build')
    expect(calls('/confirm')).toHaveLength(0)
  })

  it('reads again after a failed read', async () => {
    onRead = () =>
      json({
        fileId: FILE_ID,
        reason: 'READ_FAILED',
        summary: { clear: 0, needChecking: 0, headings: 0 },
        groups: [],
      })
    open()
    await pick()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('uploadMenu.tryAgain') }))
    await waitFor(() => expect(calls('/read')).toHaveLength(2))
  })

  it('refuses a file type the server would not take, before uploading', async () => {
    open()
    await pick(new File(['x'], 'menu.txt', { type: 'text/plain' }))
    expect(await screen.findByText(i18n.t('uploadMenu.pick.wrongType'))).toBeTruthy()
    expect(calls('/api/v1/catalog/menu-scans')).toHaveLength(0)
  })
})
