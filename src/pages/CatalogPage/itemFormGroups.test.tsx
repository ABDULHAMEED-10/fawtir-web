import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ItemFormPage } from './ItemFormPage'

/** The item form's "Where it lives" lists: "Add a group" and "Add a kind" for a company with none. */

const reader = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

type Group = {
  id: string
  name: string
  nameAr: string | null
  sortOrder: number
  version: number
  kinds: {
    id: string
    groupId: string
    name: string
    nameAr: string | null
    sortOrder: number
    version: number
  }[]
}

let permissions: string[]
let groups: Group[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  permissions = ['product.read', 'product.manage']
  groups = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      const method = init.method ?? 'GET'
      if (url === '/api/v1/me/entitlements') return json(reader(permissions))
      if (url === '/api/v1/branches') return json([])
      if (url.includes('/code-lists/hs')) return json({ items: [], total: 0 })
      if (url === '/api/v1/catalog/groups' && method === 'GET') return json({ groups })
      if (url === '/api/v1/catalog/groups' && method === 'POST') {
        const body = JSON.parse(String(init.body))
        const created = { ...body, id: 'g-new', version: 0, kinds: [] }
        groups = [...groups, created]
        return json(created, 201)
      }
      const kinds = url.match(/^\/api\/v1\/catalog\/groups\/([^/]+)\/kinds$/)
      if (kinds && method === 'POST') {
        const body = JSON.parse(String(init.body))
        const created = { ...body, id: 'k-new', groupId: kinds[1], version: 0 }
        groups = groups.map((g) => (g.id === kinds[1] ? { ...g, kinds: [...g.kinds, created] } : g))
        return json(created, 201)
      }
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
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init!.body)) }))

const openNew = () =>
  render(
    <MemoryRouter initialEntries={['/catalog/new']}>
      <Routes>
        <Route path="/catalog/new" element={<ItemFormPage mode="new" />} />
      </Routes>
    </MemoryRouter>,
  )

const groupPicker = () => screen.getByRole('button', { name: i18n.t('item.group') })
const kindPicker = () => screen.getByRole('button', { name: i18n.t('item.kindLabel') })

describe('the item form with no catalogue groups yet', () => {
  it('says there are none and adds the first group and kind from the lists', async () => {
    openNew()
    await screen.findByLabelText(/^Name/)
    await waitFor(() => expect(groupPicker().textContent).toContain(i18n.t('item.groupNone')))
    expect(kindPicker().textContent).toContain(i18n.t('item.kindNeedsGroup'))

    fireEvent.click(groupPicker())
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('item.addGroup') }))
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('catalogGroups.dialog.groupName'))), {
      target: { value: 'Hot drinks' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: i18n.t('catalogGroups.dialog.save'),
      }),
    )
    await waitFor(() => expect(groupPicker().textContent).toContain('Hot drinks'))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups',
      body: { name: 'Hot drinks', nameAr: null, sortOrder: 0 },
    })
    expect(kindPicker().textContent).toContain(i18n.t('item.kindNone'))

    fireEvent.click(kindPicker())
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('item.addKind', { group: 'Hot drinks' }),
      }),
    )
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('catalogGroups.dialog.kindName'))), {
      target: { value: 'Milk coffee' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: i18n.t('catalogGroups.dialog.save'),
      }),
    )
    await waitFor(() => expect(kindPicker().textContent).toContain('Milk coffee'))
    expect(writes()[1]).toEqual({
      url: '/api/v1/catalog/groups/g-new/kinds',
      body: { name: 'Milk coffee', nameAr: null, sortOrder: 0 },
    })
  })

  it('lists the existing groups and still offers to add one', async () => {
    groups = [
      {
        id: 'g-hot',
        name: 'Hot drinks',
        nameAr: null,
        sortOrder: 0,
        version: 0,
        kinds: [
          {
            id: 'k-milk',
            groupId: 'g-hot',
            name: 'Milk coffee',
            nameAr: null,
            sortOrder: 0,
            version: 0,
          },
        ],
      },
    ]
    openNew()
    await screen.findByLabelText(/^Name/)
    await waitFor(() => expect(groupPicker().textContent).toContain(i18n.t('item.groupChoose')))
    fireEvent.click(groupPicker())
    expect(await screen.findByRole('option', { name: 'Hot drinks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('item.addGroup') })).toBeTruthy()
  })
})
