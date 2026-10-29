import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { reorderMoves } from '../../lib/catalogGroups'
import { CatalogGroupsPage } from './CatalogGroupsPage'

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

const TREE = () => ({
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
let tree: ReturnType<typeof TREE>
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

  it('reorders by saving each group whose place changed', async () => {
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.moveDown', { name: 'Hot drinks' }),
      }),
    )
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()).toEqual([
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
    expect(
      (
        screen.getByRole('button', {
          name: i18n.t('catalogGroups.moveUp', { name: 'Hot drinks' }),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
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

  it('words the refusal to delete a group that still has kinds', async () => {
    onWrite = () => json({ status: 409, code: 'CATALOGUE_GROUP_NOT_EMPTY' }, 409)
    open()
    await screen.findByRole('heading', { name: 'Hot drinks' })
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('catalogGroups.groupActions', { name: 'Hot drinks' }),
      }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: i18n.t('catalog.groupMenu.removeTheGroup') }),
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
