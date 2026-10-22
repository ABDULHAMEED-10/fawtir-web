/**
 * Console › Companies without an Owner, a company's Owner handover, and the branch access check,
 * in the shapes `src/lib/console/companyOwners.ts` and `src/lib/console/branchAccessReadiness.ts`
 * read (`PlatformCompanyOwnerController`, `PlatformOwnerHandoverController`,
 * `PlatformBranchAccessReadinessController`).
 *
 * Two companies without an Owner, and a handover waiting for a second operator on any company
 * opened from Tenants. Picking and confirming only change these fixtures; the server's own rules
 * are not re-checked here. Enough for screenshots and the responsive harness.
 */
const BASE = '/api/v1/platform/companies'

const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()
const ahead = (days) => new Date(Date.now() + days * DAY).toISOString()

let withoutOwner = [
  {
    tenantId: 't-sur-fisheries',
    tenantCode: 'SUR-FISH',
    companyName: 'Sur Fisheries LLC',
    createdAt: ago(400),
    origin: 'CONSOLE',
    classification: 'NO_ORIGIN_USER',
    activeAdministrators: 2,
    enabledUsers: 5,
  },
  {
    tenantId: 't-ibri-motors',
    tenantCode: 'IBRI-MOT',
    companyName: 'Ibri Motors Trading',
    createdAt: ago(210),
    origin: 'SELF_SERVICE',
    classification: 'ORIGIN_SWITCHED_OFF',
    activeAdministrators: 1,
    enabledUsers: 3,
  },
]

const people = (ownerId) => [
  {
    userId: 'u-aisha',
    name: 'Aisha Al Balushi',
    username: 'aisha',
    isOrigin: ownerId === 'u-aisha',
    isOwner: ownerId === 'u-aisha',
    lastLoginAt: ago(1),
  },
  {
    userId: 'u-khalid',
    name: 'Khalid Al Harthy',
    username: 'khalid',
    isOrigin: false,
    isOwner: ownerId === 'u-khalid',
    lastLoginAt: ago(6),
  },
]

const owners = {}
const handovers = {}

function handoversOf(tenantId) {
  if (!handovers[tenantId]) {
    handovers[tenantId] = [
      {
        id: `h-${tenantId}`,
        tenantId,
        fromUserId: 'u-aisha',
        toUserId: 'u-khalid',
        reason: 'The Owner sold the business and cannot be reached',
        evidenceRef: 'Ticket 4821, sale agreement',
        evidenceObjectKey: null,
        status: 'REQUESTED',
        requestedBy: 'u-other-operator',
        requestedAt: ago(0.5),
        expiresAt: ahead(2.5),
        decidedBy: null,
        decidedAt: null,
      },
    ]
  }
  return handovers[tenantId]
}

const ownerOf = (tenantId) =>
  withoutOwner.some((c) => c.tenantId === tenantId) ? null : (owners[tenantId] ?? 'u-aisha')

export default [
  {
    match: `${BASE}/without-owner`,
    reply: () => ({ items: withoutOwner, nextCursor: null }),
  },
  {
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/owner-candidates$/,
    reply: ({ params }) => people(ownerOf(params[0])),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/owner$/,
    reply: ({ params, body }) => {
      withoutOwner = withoutOwner.filter((c) => c.tenantId !== params[0])
      owners[params[0]] = body?.userId
      return { ownerUserId: body?.userId }
    },
  },
  {
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/owner-handover$/,
    reply: ({ params }) => handoversOf(params[0]),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/owner-handover$/,
    reply: ({ params, body }) => {
      const request = {
        id: `h-${Date.now()}`,
        tenantId: params[0],
        fromUserId: ownerOf(params[0]),
        toUserId: body?.toUserId,
        reason: body?.reason,
        evidenceRef: body?.evidenceRef,
        evidenceObjectKey: null,
        status: 'REQUESTED',
        requestedBy: 'u-1',
        requestedAt: new Date().toISOString(),
        expiresAt: ahead(3),
        decidedBy: null,
        decidedAt: null,
      }
      handoversOf(params[0]).unshift(request)
      return { status: 201, body: request }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/([^/]+)\/owner-handover\/([^/]+)\/(confirm|cancel)$/,
    reply: ({ params }) => {
      const request = handoversOf(params[0]).find((r) => r.id === params[1])
      if (!request) return { status: 404 }
      request.status = params[2] === 'confirm' ? 'CONFIRMED' : 'CANCELLED'
      request.decidedBy = 'u-1'
      request.decidedAt = new Date().toISOString()
      if (request.status === 'CONFIRMED') owners[params[0]] = request.toUserId
      return request
    },
  },
  {
    match: '/api/v1/platform/branch-access/readiness',
    reply: () => ({
      enforced: false,
      customRolesWithReservedCodes: [
        {
          tenantId: 't-muscat-print',
          tenantCode: 'MCT-PRINT',
          companyName: 'Muscat Print House LLC',
          roleId: 'r-plan-desk',
          roleCode: 'PLAN_DESK',
          roleName: 'Plan desk',
          reservedCodes: ['admin.users.manage', 'tenant.plan.manage'],
          holders: 2,
        },
      ],
      invitationsNamingSeveralRoles: [
        {
          tenantId: 't-sohar-steel',
          tenantCode: 'SOH-STEEL',
          companyName: 'Sohar Steel Trading',
          invitationId: 'i-1',
          expiresAt: ahead(4),
          jobRoles: ['ACCOUNTANT', 'SALES_MANAGER'],
          otherRoles: ['APPROVER'],
        },
      ],
      peopleWithoutBranch: [
        {
          tenantId: 't-muscat-print',
          tenantCode: 'MCT-PRINT',
          companyName: 'Muscat Print House LLC',
          people: 3,
        },
      ],
      peopleWithSeveralRoles: [
        {
          tenantId: 't-sohar-steel',
          tenantCode: 'SOH-STEEL',
          companyName: 'Sohar Steel Trading',
          people: 1,
        },
      ],
    }),
  },
]
