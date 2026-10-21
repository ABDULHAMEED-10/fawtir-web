/**
 * Branch access (Business Rules BA-1, OW-1, OW-4, RL-1, RL-2, RL-3): the people list with the Owner
 * and branches, one person, their branches, role and own permissions, a branch's roster, the Owner
 * and the handover, and the permission catalogue, in the shapes `src/api/settings/branchAccess.ts`
 * and `people.ts` read. Sorts before `paymentsRecurring.mjs`, so it answers `/api/v1/users` with the
 * branch fields. The session (`agreements.mjs`) is `u-nasser`, the Owner. Branch ids are the
 * picker's in `drafts.mjs`.
 */
const person = (id, username, firstName, lastName, roles, branchIds, extra = {}) => ({
  id,
  tenantId: 't-albahja',
  branchId: null,
  username,
  email: `${username}@albahja.example`,
  firstName,
  lastName,
  phone: null,
  enabled: true,
  emailVerified: true,
  mfaEnabled: true,
  roles,
  createdAt: '2026-09-01T08:00:00Z',
  locked: false,
  lockedUntil: null,
  owner: false,
  branchIds,
  ...extra,
})

const SWITCHED_OFF = [
  person('u-salma', 'salma', 'Salma', 'Al Rawahi', [], [], { enabled: false }),
]

const PEOPLE = [
  person('u-nasser', 'nasser.alhabsi', 'Nasser', 'Al Habsi', ['ADMIN'], ['b-main', 'b-nizwa'], {
    owner: true,
  }),
  person('u-yusuf', 'yusuf', 'Yusuf', 'Al Balushi', ['ADMIN'], ['b-main', 'b-nizwa']),
  person('u-hafidh', 'hafidh', 'Hafidh', 'Saif', ['ACCOUNTANT'], ['b-nizwa'], {
    mfaEnabled: false,
  }),
  person(
    'u-aisha',
    'aisha',
    'Aisha',
    'Al Hinai',
    ['SALES_MANAGER'],
    ['b-main', 'b-nizwa', 'b-seeb'],
  ),
]

const ROLE_CODES = {
  ACCOUNTANT: ['invoice.read', 'customer.read', 'tenant.plan.read'],
  SALES_MANAGER: [
    'invoice.read',
    'invoice.draft',
    'invoice.issue',
    'customer.read',
    'customer.manage',
  ],
}

const PERMISSIONS = {
  'u-hafidh': {
    grants: [{ code: 'invoice.approve', qualifier: null, value: null }],
    denials: ['tenant.plan.read'],
  },
  'u-aisha': { grants: [], denials: [] },
}

const CATALOGUE = [
  'invoice.read',
  'invoice.draft',
  'invoice.issue',
  'invoice.approve',
  'invoice.cancel',
  'customer.read',
  'customer.manage',
  'supplier.read',
  'tenant.plan.read',
  'bill.settle',
  'branch.users.manage',
  'admin.users.manage',
].map((code) => ({
  code,
  module: code.split('.')[0].toUpperCase(),
  description: code,
  assignable: true,
}))

const NAMES = Object.fromEntries(PEOPLE.map((p) => [p.id, `${p.firstName} ${p.lastName}`]))
const seesAll = (p) => p.owner || p.roles.includes('ADMIN')

function permissionsOf(id) {
  const who = PEOPLE.find((p) => p.id === id)
  const role = who.roles.find((code) => ROLE_CODES[code]) ?? null
  const own = PERMISSIONS[id] ?? { grants: [], denials: [] }
  const effective = [...new Set([...(ROLE_CODES[role] ?? []), ...own.grants.map((g) => g.code)])]
    .filter((code) => !own.denials.includes(code))
    .sort()
  return {
    userId: id,
    role,
    roleCodes: who.roles,
    grants: own.grants,
    denials: own.denials,
    effective,
  }
}

function roster(branchId) {
  return PEOPLE.filter((p) => p.enabled).map((p) => ({
    userId: p.id,
    name: NAMES[p.id],
    owner: p.owner,
    allBranches: seesAll(p),
    assigned: !seesAll(p) && p.branchIds.includes(branchId),
    otherBranchCount: seesAll(p) ? 0 : p.branchIds.filter((b) => b !== branchId).length,
  }))
}

const refusal = (status, type, detail) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${type}`, title: 'Refused', status, detail },
})

export default [
  {
    match: '/api/v1/users',
    reply: ({ query }) => {
      // The people switched off (switchingOff.mjs): listed only when asked for.
      const content = query.get('status') === 'DEACTIVATED' ? SWITCHED_OFF : PEOPLE
      return { content, totalElements: content.length, totalPages: 1, number: 0, size: 100 }
    },
  },
  {
    match: /^\/api\/v1\/users\/(u-[^/]+)$/,
    reply: ({ params }) => PEOPLE.find((p) => p.id === params[0]) ?? { status: 404 },
  },
  {
    match: /^\/api\/v1\/users\/(u-[^/]+)\/permissions$/,
    reply: ({ params }) => (PERMISSIONS[params[0]] ? permissionsOf(params[0]) : { status: 404 }),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/users\/(u-[^/]+)\/permissions$/,
    reply: ({ params, body }) => {
      if (!PERMISSIONS[params[0]])
        return refusal(409, 'admin-full-access', 'Administrators have full access.')
      PERMISSIONS[params[0]] = {
        grants: (body?.grants ?? []).map((g) => ({
          code: g.code,
          qualifier: g.qualifier ?? null,
          value: g.value ?? null,
        })),
        denials: body?.denials ?? [],
      }
      return permissionsOf(params[0])
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/users\/(u-[^/]+)\/branches$/,
    reply: ({ params, body }) => {
      const who = PEOPLE.find((p) => p.id === params[0])
      if (!who) return { status: 404 }
      if (who.owner) return refusal(403, 'owner-protected', 'The Owner sees every branch.')
      if (!body?.branchIds?.length) return refusal(409, 'branch-required', 'At least one branch.')
      who.branchIds = [...body.branchIds]
      return { userId: who.id, allBranches: seesAll(who), branchIds: who.branchIds }
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/users\/(u-[^/]+)\/role$/,
    reply: ({ params, body }) => {
      const who = PEOPLE.find((p) => p.id === params[0])
      if (!who) return { status: 404 }
      if (who.owner) return refusal(403, 'owner-protected', 'The Owner stays an Administrator.')
      who.roles = [body.roleCode]
      if (!PERMISSIONS[who.id] && body.roleCode !== 'ADMIN')
        PERMISSIONS[who.id] = { grants: [], denials: [] }
      return who.roles
    },
  },
  {
    match: /^\/api\/v1\/branches\/(b-[^/]+)\/people$/,
    reply: ({ params }) => roster(params[0]),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/branches\/(b-[^/]+)\/people$/,
    reply: ({ params, body }) => {
      const wanted = new Set(body?.userIds ?? [])
      const stranded = PEOPLE.filter(
        (p) =>
          !seesAll(p) &&
          p.branchIds.includes(params[0]) &&
          !wanted.has(p.id) &&
          p.branchIds.length === 1,
      )
      if (stranded.length) return refusal(409, 'branch-required', 'Someone would have no branch.')
      for (const p of PEOPLE) {
        if (seesAll(p)) continue
        if (wanted.has(p.id) && !p.branchIds.includes(params[0])) p.branchIds.push(params[0])
        if (!wanted.has(p.id)) p.branchIds = p.branchIds.filter((b) => b !== params[0])
      }
      return roster(params[0])
    },
  },
  {
    match: '/api/v1/settings/owner',
    reply: () => {
      const owner = PEOPLE.find((p) => p.owner)
      return owner ? { userId: owner.id, name: NAMES[owner.id] } : { userId: null, name: null }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/owner/handover',
    reply: ({ body }) => {
      const target = PEOPLE.find((p) => p.id === body?.toUserId)
      if (!target || !target.roles.includes('ADMIN'))
        return refusal(409, 'handover-target-not-administrator', 'Not an Administrator.')
      for (const p of PEOPLE) p.owner = p.id === target.id
      return { userId: target.id, name: NAMES[target.id] }
    },
  },
  { match: '/api/v1/permissions', reply: () => CATALOGUE },
]
