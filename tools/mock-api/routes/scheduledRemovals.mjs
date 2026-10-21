/**
 * Switching people and branches off (Business Rules US-2, US-3, BR-2, BR-4), in the shapes
 * `src/api/settings/removals.ts` reads: the removals waiting for the renewal, scheduling and
 * withdrawing them, switching a person off now and back on, and the branches overview the
 * Branches page draws them on. Hafidh (`branchAccess.mjs`) leaves at the renewal and Sohar closes
 * then; Salma is switched off. Answers `/api/v1/users?status=DEACTIVATED` through
 * `branchAccess.mjs`, which owns `/api/v1/users`.
 */
const RENEWS_ON = '2026-11-05'

const removal = (id, kind, subjectId) => ({
  id,
  kind,
  subjectId,
  effectiveOn: RENEWS_ON,
  status: 'SCHEDULED',
  scheduledBy: 'u-nasser',
  scheduledAt: '2026-10-21T08:00:00Z',
})

let WAITING = [removal('r-hafidh', 'USER', 'u-hafidh'), removal('r-sohar', 'BRANCH', 'b-sohar')]

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
    match: '/api/v1/settings/scheduled-removals',
    reply: () => ({ open: true, renewsOn: RENEWS_ON, removals: WAITING }),
  },
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
    method: 'POST',
    match: /^\/api\/v1\/users\/([^/]+)\/scheduled-removal$/,
    reply: ({ params }) => {
      if (params[0] === 'u-nasser') return refusal(403, 'owner-protected', 'The Owner stays.')
      const existing = WAITING.find((r) => r.subjectId === params[0])
      if (existing) return existing
      const added = removal(`r-${params[0]}`, 'USER', params[0])
      WAITING = [...WAITING, added]
      return added
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/(users|branches)\/([^/]+)\/scheduled-(removal|closure)$/,
    reply: ({ params }) => {
      if (!WAITING.some((r) => r.subjectId === params[1]))
        return refusal(409, 'scheduled-removal-state-conflict', 'Nothing waiting.')
      WAITING = WAITING.filter((r) => r.subjectId !== params[1])
      return { status: 204 }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/branches\/([^/]+)\/scheduled-closure$/,
    reply: ({ params }) => {
      if (params[0] === 'b-main')
        return refusal(409, 'head-branch-always-on', 'The Head Branch stays open.')
      const existing = WAITING.find((r) => r.subjectId === params[0])
      if (existing) return existing
      const added = removal(`r-${params[0]}`, 'BRANCH', params[0])
      WAITING = [...WAITING, added]
      return added
    },
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
