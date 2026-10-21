/**
 * Switching people and branches off and back on (Business Rules US-2, US-3, BR-2, BR-4; option (a),
 * 21 Oct 2026), in the shapes `src/api/settings/removals.ts` reads: switching a person off now,
 * back on, and the branches overview the Branches page closes and reopens from. Salma is switched
 * off; `/api/v1/users?status=DEACTIVATED` is answered by `branchAccess.mjs`, which owns
 * `/api/v1/users`.
 */
const branch = (id, code, name, extra = {}) => ({
  id,
  code,
  name,
  headOffice: false,
  active: true,
  closedOn: null,
  invoicePrefix: code,
  nextNumber: 41,
  invoicesThisMonth: 12,
  invoicedThisMonth: 1840.5,
  people: 2,
  devices: 1,
  ...extra,
})

const BRANCHES = [
  branch('b-main', 'MCT', 'Al Bahja Coffee (Muscat)', { headOffice: true, people: 4, devices: 2 }),
  branch('b-nizwa', 'NZW', 'Al Bahja Coffee (Nizwa)'),
  branch('b-sohar', 'SOH', 'Al Bahja Coffee (Sohar)'),
  branch('b-sur', 'SUR', 'Al Bahja Coffee (Sur)', {
    active: false,
    closedOn: '2026-09-30',
    invoicesThisMonth: 0,
    invoicedThisMonth: 0,
    people: 0,
    devices: 0,
  }),
]

const refusal = (status, type, detail) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${type}`, title: 'Refused', status, detail },
})

export default [
  {
    match: '/api/v1/branches/overview',
    reply: () => ({
      openCount: BRANCHES.filter((b) => b.active).length,
      everCount: BRANCHES.length,
      peopleAcross: 8,
      invoicesThisMonth: 36,
      branches: BRANCHES,
    }),
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/users\/([^/]+)$/,
    reply: ({ params }) =>
      params[0] === 'u-nasser'
        ? refusal(403, 'owner-protected', 'The Owner stays.')
        : { status: 204 },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/users\/([^/]+)\/reactivate$/,
    reply: () => refusal(409, 'extra-place-required', 'Every place is in use.'),
  },
]
