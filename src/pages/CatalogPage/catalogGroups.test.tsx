import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { reorderMoves } from '../../lib/catalogGroups'
import { CatalogGroupsPage } from './CatalogGroupsPage'
import type { CatalogGroupsDto } from '../../api/catalog/groups'

const reader = (permissions: string[]): Entitlements => ({
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions,
  scopes: [],
  featureFlags: {},
})

const kind = (id: string, groupId: string, name: string, sortOrder: number, version = 0) => ({
  id,
  groupId,
  name,
  nameAr: null as string | null,
  sortOrder,
  version,
})

const TREE = (): CatalogGroupsDto => ({
  groups: [
    {
      id: 'g-hot',
      name: 'Hot drinks',
      nameAr: 'المشروبات الساخنة',
      sortOrder: 0,
      version: 2,
      kinds: [
        kind('k-milk', 'g-hot', 'Milk coffee', 0),
        kind('k-black', 'g-hot', 'Black coffee', 1),
      ],
    },
    { id: 'g-cold', name: 'Cold drinks', nameAr: null, sortOrder: 1, version: 5, kinds: [] },
  ],
})

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let permissions: string[]
let tree: CatalogGroupsDto
let onWrite: (url: string, init: RequestInit) => Response

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  permissions = ['product.read', 'product.manage']
  tree = TREE()
  onWrite = (_url, init) => json({ ...JSON.parse(String(init.body ?? '{}')), id: 'x', version: 1 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(reader(permissions))
      if (url === '/api/v1/branches') return json([])
      if (init.method && init.method !== 'GET') return onWrite(url, init)
      if (url === '/api/v1/catalog/groups') return json(tree)
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
    .map(([url, init]) => ({
      url: String(url),
      method: init!.method,
      body: init!.body ? JSON.parse(String(init!.body)) : undefined,
    }))

const open = () =>
  render(
    <MemoryRouter initialEntries={['/catalog/groups']}>
      <Routes>
        <Route path="/catalog/groups" element={<CatalogGroupsPage />} />
      </Routes>
    </MemoryRouter>,
  )

const groupReads = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url, init]) =>
        String(url) === '/api/v1/catalog/groups' && (init?.method ?? 'GET') === 'GET',
    )

describe('Catalog › Groups on /v1/catalog/groups', () => {
  it('lists the groups with their kinds, in the order the server sends', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Hot drinks' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cold drinks' })).toBeTruthy()
    const kinds = screen.getByRole('list', {
      name: i18n.t('catalogGroups.kindsIn', { group: 'Hot drinks' }),
    })
    expect(
      within(kinds)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Milk coffee', 'Black coffee'].map((name) => expect.stringContaining(name)))
    expect(screen.getByText(i18n.t('catalogGroups.noKinds'))).toBeTruthy()
  })

  it('shows the Arabic names in Arabic', async () => {
    await i18n.changeLanguage('ar')
    open()
    expect(await screen.findByRole('heading', { name: 'المشروبات الساخنة' })).toBeTruthy()
  })

  it('offers a first group to a new company that has none', async () => {
    tree = { groups: [] }
    onWrite = (_url, init) =>
      json({ ...JSON.parse(String(init.body)), id: 'g-new', version: 0, kinds: [] }, 201)
    open()
    expect(await screen.findByText(i18n.t('catalogGroups.emptyTitle'))).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('catalogGroups.newGroup') })[0])
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('catalogGroups.dialog.groupName'))), {
      target: { value: '  Hot drinks ' },
    })
    fireEvent.change(screen.getByLabelText(i18n.t('catalogGroups.dialog.arabicName')), {
      target: { value: 'المشروبات الساخنة' },
    })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.save') }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups',
      method: 'POST',
      body: { name: 'Hot drinks', nameAr: 'المشروبات الساخنة', sortOrder: 0 },
    })
    await waitFor(() => expect(groupReads().length).toBeGreaterThan(1))
  })

  it('refuses an empty name before asking the server', async () => {
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.newGroup') }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.save') }))
    expect(await screen.findByText(i18n.t('catalogGroups.refusal.nameRequired'))).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('puts a new group at the end and words a duplicate name under the name', async () => {
    onWrite = () => json({ status: 409, code: 'CATALOGUE_GROUP_NAME_DUPLICATE' }, 409)
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.newGroup') }))
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('catalogGroups.dialog.groupName'))), {
      target: { value: 'hot DRINKS' },
    })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.save') }))
    expect(await screen.findByText(i18n.t('catalogGroups.refusal.groupNameTaken'))).toBeTruthy()
    expect(writes()[0].body).toEqual({ name: 'hot DRINKS', nameAr: null, sortOrder: 2 })
  })

  it('renames a group with PUT, the version it read and its own sort order', async () => {
    open()
    await screen.findByRole('heading', { name: 'Cold drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.groupActions', { name: 'Cold drinks' }),
      }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('catalog.groupMenu.renameIt') }),
    )
    const field = screen.getByLabelText(new RegExp(i18n.t('catalogGroups.dialog.groupName')))
    expect((field as HTMLInputElement).value).toBe('Cold drinks')
    fireEvent.change(field, { target: { value: 'Iced drinks' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.save') }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups/g-cold?expectedVersion=5',
      method: 'PUT',
      body: { name: 'Iced drinks', nameAr: null, sortOrder: 1 },
    })
  })

  it('adds a kind inside a group at the end of its kinds', async () => {
    onWrite = (_url, init) =>
      json({ ...JSON.parse(String(init.body)), id: 'k-new', groupId: 'g-hot', version: 0 }, 201)
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.addKindTo', { group: 'Hot drinks' }),
      }),
    )
    fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('catalogGroups.dialog.kindName'))), {
      target: { value: 'Tea' },
    })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.save') }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups/g-hot/kinds',
      method: 'POST',
      body: { name: 'Tea', nameAr: null, sortOrder: 2 },
    })
  })

  it('moves a kind to another group with groupId, at the end of that group', async () => {
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.kindActions', { name: 'Black coffee' }),
      }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('catalogGroups.renameKind') }),
    )
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.inGroup') }))
    fireEvent.click(screen.getByRole('option', { name: 'Cold drinks' }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.dialog.save') }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/kinds/k-black?expectedVersion=0',
      method: 'PUT',
      body: { name: 'Black coffee', nameAr: null, sortOrder: 0, groupId: 'g-cold' },
    })
  })

  const moveHotDown = async () => {
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.moveDown', { name: 'Hot drinks' }),
      }),
    )
  }

  it('reorders groups in one step with every group and its version (backend #812)', async () => {
    await moveHotDown()
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups/order',
      method: 'PUT',
      body: {
        items: [
          { id: 'g-cold', expectedVersion: 5 },
          { id: 'g-hot', expectedVersion: 2 },
        ],
      },
    })
    await waitFor(() => expect(groupReads().length).toBeGreaterThan(1))
  })

  it('reorders kinds within their group in one step', async () => {
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.moveUp', { name: 'Black coffee' }),
      }),
    )
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups/g-hot/kinds/order',
      method: 'PUT',
      body: {
        items: [
          { id: 'k-black', expectedVersion: 0 },
          { id: 'k-milk', expectedVersion: 0 },
        ],
      },
    })
  })

  it.each([
    ['404, no such route', 404],
    ['405, method not allowed', 405],
    ['400, "order" read as a group id', 400],
  ])(
    'falls back to saving each moved group on a server without the order route (%s)',
    async (_label, status) => {
      onWrite = (url, init) =>
        url.endsWith('/order')
          ? json({ status }, status)
          : json({ ...JSON.parse(String(init.body ?? '{}')), id: 'x', version: 9 })
      await moveHotDown()
      await waitFor(() => expect(writes()).toHaveLength(3))
      expect(writes().slice(1)).toEqual([
        {
          url: '/api/v1/catalog/groups/g-cold?expectedVersion=5',
          method: 'PUT',
          body: { name: 'Cold drinks', nameAr: null, sortOrder: 0 },
        },
        {
          url: '/api/v1/catalog/groups/g-hot?expectedVersion=2',
          method: 'PUT',
          body: { name: 'Hot drinks', nameAr: 'المشروبات الساخنة', sortOrder: 1 },
        },
      ])
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

  it.each([
    ['CATALOGUE_ORDER_INVALID', 400, 'catalogGroups.refusal.orderInvalid'],
    ['CATALOGUE_GROUP_VERSION_CONFLICT', 409, 'catalogGroups.refusal.changedMeanwhile'],
    ['CATALOGUE_GROUP_NOT_FOUND', 404, 'catalogGroups.refusal.groupGone'],
  ])('words %s from the order route and does not fall back', async (code, status, key) => {
    onWrite = () => json({ status, code }, status)
    await moveHotDown()
    expect(await screen.findByText(i18n.t(key))).toBeTruthy()
    expect(writes()).toHaveLength(1)
  })

  it('shows item counts when the server sends them, and kinds alone when it does not', async () => {
    tree.groups[0] = {
      ...tree.groups[0],
      kindCount: 2,
      productCount: 7,
      kinds: [
        { ...tree.groups[0].kinds[0], productCount: 7 },
        { ...tree.groups[0].kinds[1], productCount: 0 },
      ],
    }
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    expect(
      screen.getByText(
        `${i18n.t('catalogGroups.kindCount', { count: 2 })} · ${i18n.t('catalogGroups.itemCount', { count: 7 })}`,
        { exact: false },
      ),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('catalogGroups.itemCount', { count: 0 }))).toBeTruthy()
    // Cold drinks comes from a server without counts: kinds only.
    expect(screen.getByText(i18n.t('catalogGroups.kindCount', { count: 0 }))).toBeTruthy()
  })

  it('deletes an empty group with its version', async () => {
    onWrite = () => json(null, 204)
    open()
    await screen.findByRole('heading', { name: 'Cold drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.groupActions', { name: 'Cold drinks' }),
      }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('catalog.groupMenu.removeTheGroup') }),
    )
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.remove.confirm') }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      url: '/api/v1/catalog/groups/g-cold?expectedVersion=5',
      method: 'DELETE',
      body: undefined,
    })
  })

  const openRemove = async (actions: string, item: string, name: string) => {
    fireEvent.click(screen.getByRole('button', { name: i18n.t(actions, { name }) }))
    fireEvent.click(await screen.findByRole('menuitem', { name: i18n.t(item) }))
  }

  it('says up front that a group with kinds cannot be removed, and sends nothing', async () => {
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    await openRemove('catalogGroups.groupActions', 'catalog.groupMenu.removeTheGroup', 'Hot drinks')
    expect(screen.getByText(i18n.t('catalogGroups.remove.groupBlocked', { count: 2 }))).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('catalogGroups.remove.confirm') }),
    ).toBeNull()
    expect(writes()).toHaveLength(0)
  })

  it('says up front that a kind items on sale are filed under cannot be removed', async () => {
    tree.groups[0].kinds[0] = { ...tree.groups[0].kinds[0], productCount: 3 }
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    await openRemove('catalogGroups.kindActions', 'catalogGroups.removeKind', 'Milk coffee')
    expect(screen.getByText(i18n.t('catalogGroups.remove.kindBlocked', { count: 3 }))).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: i18n.t('catalogGroups.remove.confirm') }),
    ).toBeNull()
  })

  it('words the refusal when a kind was added to the group meanwhile', async () => {
    onWrite = () => json({ status: 409, code: 'CATALOGUE_GROUP_NOT_EMPTY' }, 409)
    open()
    await screen.findByRole('heading', { name: 'Cold drinks' })
    await openRemove(
      'catalogGroups.groupActions',
      'catalog.groupMenu.removeTheGroup',
      'Cold drinks',
    )
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.remove.confirm') }))
    expect(await screen.findByText(i18n.t('catalogGroups.refusal.groupNotEmpty'))).toBeTruthy()
  })

  it('words the refusal to delete a kind items on sale are filed under', async () => {
    onWrite = () => json({ status: 409, code: 'CATALOGUE_KIND_IN_USE' }, 409)
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.kindActions', { name: 'Milk coffee' }),
      }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('catalogGroups.removeKind') }),
    )
    fireEvent.click(screen.getByRole('button', { name: i18n.t('catalogGroups.remove.confirm') }))
    expect(await screen.findByText(i18n.t('catalogGroups.refusal.kindInUse'))).toBeTruthy()
    expect(writes()[0].url).toBe('/api/v1/catalog/kinds/k-milk?expectedVersion=0')
  })

  it('is read-only without product.manage', async () => {
    permissions = ['product.read']
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: i18n.t('catalogGroups.newGroup') })).toBeNull(),
    )
    expect(
      screen.queryByRole('button', {
        name: i18n.t('catalogGroups.groupActions', { name: 'Hot drinks' }),
      }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: i18n.t('catalogGroups.moveDown', { name: 'Hot drinks' }),
      }),
    ).toBeNull()
  })

  it('says no access when the read is refused', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(reader([]))
      return json({ status: 403, type: 'https://api.fawtir.om/problems/forbidden' }, 403)
    })
    open()
    expect(await screen.findByText(i18n.t('appAccess.missingPermission'))).toBeTruthy()
  })
})

describe('reorderMoves', () => {
  const rows = [kind('a', 'g', 'A', 0), kind('b', 'g', 'B', 1), kind('c', 'g', 'C', 5)]

  it('returns only the rows whose sort order changes', () => {
    expect(reorderMoves(rows, 'c', -1).map((m) => [m.row.id, m.sortOrder])).toEqual([
      ['c', 1],
      ['b', 2],
    ])
  })

  it('does nothing past either end', () => {
    expect(reorderMoves(rows, 'a', -1)).toEqual([])
    expect(reorderMoves(rows, 'c', 1)).toEqual([])
  })
})
