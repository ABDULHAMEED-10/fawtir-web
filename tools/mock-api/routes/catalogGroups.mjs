/**
 * The catalogue's groups and kinds (`/v1/catalog`): two levels above the item, as
 * `src/api/catalog/groups.ts` reads them. Names are unique per company (groups) and within their
 * group (kinds), case-insensitive; a group with kinds and a kind an active product sits in cannot
 * be deleted. In memory.
 */

import { PRODUCTS_FOR_ROUTES } from './products.mjs'

let nextId = 1
const newId = (prefix) => `${prefix}-new-${nextId++}`

const kind = (id, groupId, name, nameAr, sortOrder) => ({
  id,
  groupId,
  name,
  nameAr,
  sortOrder,
  version: 0,
})

const GROUPS = [
  {
    id: 'g-drinks',
    name: 'Brewed drinks',
    nameAr: 'المشروبات المحضّرة',
    sortOrder: 0,
    version: 0,
    kinds: [
      kind('k-milk', 'g-drinks', 'Milk coffee', 'قهوة بالحليب', 0),
      kind('k-black', 'g-drinks', 'Black coffee', 'قهوة سوداء', 1),
    ],
  },
  {
    id: 'g-beans',
    name: 'Beans and ground',
    nameAr: 'البن الحب والمطحون',
    sortOrder: 1,
    version: 0,
    kinds: [kind('k-beans', 'g-beans', 'Roasted beans', 'بن محمص', 0)],
  },
  {
    id: 'g-services',
    name: 'Services',
    nameAr: 'الخدمات',
    sortOrder: 2,
    version: 0,
    kinds: [kind('k-training', 'g-services', 'Training', 'التدريب', 0)],
  },
]

/** Every kind, for the product routes to check a product's `kindId`. */
export const KINDS = () => GROUPS.flatMap((group) => group.kinds)

const problem = (
  status,
  code,
  slug = status === 409 ? 'resource-conflict' : 'validation-failed',
) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, status, code },
})

const same = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase()
const ordered = (rows) =>
  [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
const view = (group) => ({ ...group, kinds: ordered(group.kinds) })

const GROUP = /^\/api\/v1\/catalog\/groups\/([^/]+)$/
const KIND = /^\/api\/v1\/catalog\/kinds\/([^/]+)$/

export default [
  {
    match: '/api/v1/catalog/groups',
    reply: () => ({ groups: ordered(GROUPS).map(view) }),
  },
  {
    method: 'POST',
    match: '/api/v1/catalog/groups',
    reply: ({ body }) => {
      const name = String(body?.name ?? '').trim()
      if (!name) return problem(400, 'CATALOGUE_NAME_REQUIRED')
      if (GROUPS.some((g) => same(g.name, name)))
        return problem(409, 'CATALOGUE_GROUP_NAME_DUPLICATE')
      const group = {
        id: newId('g'),
        name,
        nameAr: body.nameAr ?? null,
        sortOrder: body.sortOrder ?? 0,
        version: 0,
        kinds: [],
      }
      GROUPS.push(group)
      return { status: 201, body: view(group) }
    },
  },
  {
    method: 'PUT',
    match: GROUP,
    reply: ({ params, query, body }) => {
      const group = GROUPS.find((g) => g.id === params[0])
      if (!group) return problem(404, 'CATALOGUE_GROUP_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== group.version) {
        return problem(409, 'CATALOGUE_GROUP_VERSION_CONFLICT')
      }
      const name = String(body?.name ?? '').trim()
      if (!name) return problem(400, 'CATALOGUE_NAME_REQUIRED')
      if (GROUPS.some((g) => g !== group && same(g.name, name))) {
        return problem(409, 'CATALOGUE_GROUP_NAME_DUPLICATE')
      }
      Object.assign(group, {
        name,
        nameAr: body.nameAr ?? null,
        sortOrder: body.sortOrder ?? group.sortOrder,
        version: group.version + 1,
      })
      return view(group)
    },
  },
  {
    method: 'DELETE',
    match: GROUP,
    reply: ({ params, query }) => {
      const index = GROUPS.findIndex((g) => g.id === params[0])
      if (index < 0) return problem(404, 'CATALOGUE_GROUP_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== GROUPS[index].version) {
        return problem(409, 'CATALOGUE_GROUP_VERSION_CONFLICT')
      }
      if (GROUPS[index].kinds.length) return problem(409, 'CATALOGUE_GROUP_NOT_EMPTY')
      GROUPS.splice(index, 1)
      return { status: 204 }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/catalog\/groups\/([^/]+)\/kinds$/,
    reply: ({ params, body }) => {
      const group = GROUPS.find((g) => g.id === params[0])
      if (!group) return problem(404, 'CATALOGUE_GROUP_NOT_FOUND', 'not-found')
      const name = String(body?.name ?? '').trim()
      if (!name) return problem(400, 'CATALOGUE_NAME_REQUIRED')
      if (group.kinds.some((k) => same(k.name, name)))
        return problem(409, 'CATALOGUE_KIND_NAME_DUPLICATE')
      const created = kind(newId('k'), group.id, name, body.nameAr ?? null, body.sortOrder ?? 0)
      group.kinds.push(created)
      return { status: 201, body: created }
    },
  },
  {
    method: 'PUT',
    match: KIND,
    reply: ({ params, query, body }) => {
      const found = KINDS().find((k) => k.id === params[0])
      if (!found) return problem(404, 'CATALOGUE_KIND_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'CATALOGUE_GROUP_VERSION_CONFLICT')
      }
      const name = String(body?.name ?? '').trim()
      if (!name) return problem(400, 'CATALOGUE_NAME_REQUIRED')
      const target = GROUPS.find((g) => g.id === (body.groupId ?? found.groupId))
      if (!target) return problem(404, 'CATALOGUE_GROUP_NOT_FOUND', 'not-found')
      if (target.kinds.some((k) => k !== found && same(k.name, name))) {
        return problem(409, 'CATALOGUE_KIND_NAME_DUPLICATE')
      }
      const from = GROUPS.find((g) => g.id === found.groupId)
      if (from !== target) {
        from.kinds = from.kinds.filter((k) => k !== found)
        target.kinds.push(found)
      }
      Object.assign(found, {
        name,
        nameAr: body.nameAr ?? null,
        sortOrder: body.sortOrder ?? found.sortOrder,
        groupId: target.id,
        version: found.version + 1,
      })
      return found
    },
  },
  {
    method: 'DELETE',
    match: KIND,
    reply: ({ params, query }) => {
      const found = KINDS().find((k) => k.id === params[0])
      if (!found) return problem(404, 'CATALOGUE_KIND_NOT_FOUND', 'not-found')
      if (Number(query.get('expectedVersion')) !== found.version) {
        return problem(409, 'CATALOGUE_GROUP_VERSION_CONFLICT')
      }
      if (PRODUCTS_FOR_ROUTES().some((p) => p.active && p.kindId === found.id)) {
        return problem(409, 'CATALOGUE_KIND_IN_USE')
      }
      const group = GROUPS.find((g) => g.id === found.groupId)
      group.kinds = group.kinds.filter((k) => k !== found)
      return { status: 204 }
    },
  },
]
