/**
 * Settings › Team members, Invite someone, Roles, Signing in and Plan and usage, in the shapes
 * `src/api/settings/people.ts`, `plan.ts`, `subscription.ts` and `src/lib/identity/signupPlans.ts`
 * read. `/api/v1/users` itself is answered by `paymentsRecurring.mjs` (loaded first).
 */
const TODAY = '2026-10-11'

const SUBSCRIPTION_NOTICES = [
  {
    id: '7f3c1a52-3c1e-4b8e-9d0a-5c1f00000001',
    kind: 'TRIAL_ENDING',
    coveredThrough: '2026-10-14',
    graceDay: null,
    graceUntil: null,
    noticeOn: TODAY,
    headline:
      'Your free trial ends on 14 October 2026. Choose a plan to keep issuing and receiving documents.',
    actionLabel: 'Choose a plan',
    actionPath: '/settings/plan',
    createdAt: `${TODAY}T04:00:00Z`,
    read: false,
  },
]

/**
 * The subscription the shells read. Active by default; `MOCK_SUBSCRIPTION_STATE` picks one of the
 * read-only states below (with the restrictions switch on), for screenshots of the read-only line:
 *
 *   MOCK_SUBSCRIPTION_STATE=suspended node tools/mock-api/server.mjs
 *
 * `restrictionsOff` is a suspended subscription with the switch off: nothing is restricted.
 */
const SUBSCRIPTION_ACTIVE = {
  tracked: true,
  access: 'ACTIVE',
  restrictionsEnforced: false,
  today: TODAY,
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodPrice: '80.000',
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: '2026-10-31',
  renewsOn: '2026-11-01',
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
  enterprise: null,
  restriction: null,
}

const LAPSED = { paidThrough: '2026-09-30', renewsOn: '2026-10-01', graceUntil: '2026-10-07' }
const SUBSCRIPTION_STATES = {
  suspended: { access: 'PAYMENT_REQUIRED', restrictionsEnforced: true, restriction: 'SUBSCRIPTION_SUSPENDED', ...LAPSED },
  trialEnded: {
    access: 'PAYMENT_REQUIRED',
    restrictionsEnforced: true,
    restriction: 'SUBSCRIPTION_SUSPENDED',
    trialStartsOn: '2026-09-24',
    trialEndsOn: '2026-10-07',
    paidThrough: null,
    renewsOn: null,
  },
  cancelled: {
    access: 'CANCELLED',
    restrictionsEnforced: true,
    restriction: 'SUBSCRIPTION_CANCELLED',
    cancelAtPeriodEnd: true,
    accessEndsOn: '2026-09-30',
    ...LAPSED,
  },
  // Fawtir cancelled at once for abuse or fraud (CA-7, CA-9; backend V364/V365): CANCELLED from
  // today, with Fawtir's message for the customer and the bell notice below.
  cancelledByFawtir: {
    access: 'CANCELLED',
    restrictionsEnforced: true,
    restriction: 'SUBSCRIPTION_CANCELLED',
    cancelAtPeriodEnd: true,
    autoRenew: false,
    renewsOn: null,
    accessEndsOn: '2026-10-10',
    cancelledByFawtir: {
      on: TODAY,
      message: 'Your account was used to send invoices for a business that is not yours.',
    },
  },
  notStarted: {
    access: 'PAYMENT_REQUIRED',
    restrictionsEnforced: true,
    restriction: 'SUBSCRIPTION_NOT_STARTED',
    paidThrough: null,
    renewsOn: null,
  },
  enterpriseTerms: {
    tracked: false,
    access: 'NOT_TRACKED',
    restrictionsEnforced: true,
    restriction: 'SUBSCRIPTION_NOT_STARTED',
    planCode: 'ENTERPRISE',
    planName: 'Enterprise',
    billingCycle: null,
    periodPrice: null,
    paidThrough: null,
    renewsOn: null,
    enterprise: { termsSet: false },
  },
  // P2-2 D3: the 1 November renewal was paid early at the Starter price, so keeping Business
  // means paying the difference for that period (`KEEP_PLAN`, planChanges.mjs).
  downgradePaid: { paidThrough: '2026-11-30', renewsOn: '2026-12-01' },
  restrictionsOff: { access: 'PAYMENT_REQUIRED', restrictionsEnforced: false, restriction: null, ...LAPSED },
  // R1: day 11 of the 14-day trial; pair it with `MOCK_PLAN_CHANGE_STATE=trial` (planChanges.mjs).
  trial: {
    access: 'TRIAL',
    trialStartsOn: '2026-10-01',
    trialEndsOn: '2026-10-14',
    trialDay: 11,
    trialDaysLeft: 4,
    paidThrough: null,
    renewsOn: null,
  },
}

const ROLES = [
  {
    id: 'r-admin',
    // The server's code for the company Administrator (DefaultRoleCatalogue), so branch access
    // reads Administrators as seeing every branch.
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Runs the company account.',
    enabled: true,
    systemRole: true,
    permissionCodes: [
      'admin.users.manage',
      'admin.roles.manage',
      'admin.settings.manage',
      'tenant.plan.read',
      'tenant.plan.manage',
      'invoice.read',
      'invoice.write',
      'invoice.submit',
      'customer.read',
      'customer.manage',
    ],
  },
  {
    id: 'r-accountant',
    code: 'ACCOUNTANT',
    name: 'Accountant',
    description: 'Reads the books and pulls reports.',
    enabled: true,
    systemRole: false,
    permissionCodes: ['invoice.read', 'customer.read', 'tenant.plan.read'],
  },
  {
    id: 'r-sales',
    code: 'SALES_MANAGER',
    name: 'Sales manager',
    description: 'Sells, invoices and follows up customers.',
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.read', 'invoice.draft', 'invoice.issue', 'customer.read', 'customer.manage'],
  },
  {
    id: 'r-approver',
    code: 'APPROVER',
    name: 'Approver',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.approve'],
  },
  {
    id: 'r-viewer',
    code: 'VIEWER',
    name: 'Viewer',
    description: null,
    enabled: true,
    systemRole: true,
    permissionCodes: ['invoice.read', 'customer.read'],
  },
]

ROLES.push(
  {
    id: 'r-finance',
    code: 'FINANCE_MANAGER',
    name: 'Finance manager',
    description: 'Approves, cancels and settles; looks after suppliers and bills.',
    enabled: true,
    systemRole: true,
    catalogueKind: 'ROLE',
    permissionCodes: ['invoice.read', 'invoice.approve', 'invoice.cancel', 'bill.settle', 'supplier.read', 'supplier.manage', 'reports.read'],
  },
  {
    id: 'r-collections',
    code: 'collections_k3p9xa',
    name: 'Collections',
    description: 'Follows up what customers owe and records their payments.',
    enabled: true,
    systemRole: false,
    catalogueKind: 'CUSTOM',
    permissionCodes: ['invoice.read', 'customer.read', 'invoice.payment.manage', 'creditnote.create'],
    permissions: [{ code: 'creditnote.create', qualifier: 'OWN', value: null }],
  },
)

/**
 * The grantable catalogue `GET /v1/roles/matrix` returns (`DefaultPermissionCatalogue`, platform
 * codes left out by the server). Administrator-only codes are in it, as on the server: the role
 * maker hides them itself.
 */
const PERMISSION_CATALOGUE = [
  ['admin.users.manage', 'IDENTITY'], ['admin.roles.manage', 'IDENTITY'], ['role.read', 'IDENTITY'],
  ['role.list', 'IDENTITY'], ['admin.settings.manage', 'TENANT'], ['branch.read', 'TENANT'],
  ['branch.manage', 'TENANT'], ['branch.users.manage', 'TENANT'], ['tenant.plan.read', 'TENANT'],
  ['tenant.plan.manage', 'TENANT'], ['customer.read', 'CUSTOMER'], ['customer.manage', 'CUSTOMER'],
  ['customer.archive', 'CUSTOMER'], ['customer.export', 'CUSTOMER'], ['supplier.read', 'CUSTOMER'],
  ['supplier.manage', 'CUSTOMER'], ['product.read', 'INVOICE'], ['product.manage', 'INVOICE'],
  ['invoice.read', 'INVOICE'], ['invoice.draft', 'INVOICE', ['MAX_PERCENT']], ['invoice.submit', 'INVOICE'],
  ['invoice.issue', 'INVOICE'], ['invoice.approve', 'INVOICE'], ['invoice.cancel', 'INVOICE'],
  ['invoice.payment.manage', 'INVOICE'], ['invoice.export', 'INVOICE'],
  ['creditnote.create', 'INVOICE', ['OWN']], ['creditnote.submit', 'INVOICE'], ['debitnote.create', 'INVOICE'],
  ['bill.settle', 'INVOICE'], ['bill.export', 'INVOICE'], ['selfbilling.create', 'INVOICE'],
  ['reports.read', 'REPORT'], ['reports.sales.read', 'REPORT'], ['erp.connection.read', 'INTEGRATION'],
  ['erp.connection.manage', 'INTEGRATION'], ['webhooks.manage', 'INTEGRATION'],
].map(([code, module, qualifiers = []]) => ({ code, module, description: code, qualifiers }))

const RESERVED = new Set(['admin.users.manage', 'admin.roles.manage', 'admin.settings.manage', 'branch.manage', 'tenant.plan.manage',
  'smp.participant.manage', 'mapping.manage', 'mapping.certify', 'webhooks.manage'])
const isReserved = (code) => RESERVED.has(code) || (code.startsWith('erp.') && !['erp.connection.read', 'erp.audit.read'].includes(code))
/** Who holds which role, as the users list (paymentsRecurring.mjs) has it. */
const HELD = new Set(['ADMIN', 'ACCOUNTANT'])

const problem = (status, type, detail) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${type}`, title: 'Refused', status, detail },
})

function cellsOf(role) {
  const limited = Object.fromEntries((role.permissions ?? []).filter((p) => p.qualifier).map((p) => [p.code, p]))
  return Object.fromEntries(
    role.permissionCodes.map((code) => [
      code,
      limited[code]
        ? { state: 'LIMITED', qualifier: limited[code].qualifier, value: limited[code].value ?? null }
        : { state: 'FULL', qualifier: null, value: null },
    ]),
  )
}

/** Applies a create or update body's two grant lists, refusing as the server does. */
function grantsFrom(body) {
  const full = body?.permissionCodes ?? []
  const limited = body?.qualifiedPermissions ?? []
  const codes = [...full, ...limited.map((g) => g.code)]
  const reserved = codes.find(isReserved)
  if (reserved) return problem(403, 'reserved-permission', `${reserved} is only for Administrators.`)
  const known = new Set(PERMISSION_CATALOGUE.map((p) => p.code))
  if (codes.some((code) => !known.has(code))) return problem(400, 'validation-failed', 'Unknown permission code.')
  return {
    permissionCodes: [...new Set(codes)].sort(),
    permissions: limited.map((g) => ({ code: g.code, qualifier: g.qualifier, value: g.value ?? null })),
  }
}

const INVITATIONS = [
  {
    id: 'inv-1',
    email: 'new.clerk@example.om',
    roleCodes: ['ACCOUNTANT'],
    status: 'PENDING',
    expiresAt: '2026-10-18T09:00:00Z',
    sentCount: 1,
    lastSentAt: null,
    createdAt: '2026-10-11T09:00:00Z',
  },
]

const catalogued = (
  code,
  nameEn,
  nameAr,
  monthlyPrice,
  invoicesPerMonth,
  people,
  branches,
  sortOrder,
) => ({
  code,
  nameEn,
  nameAr,
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  priceVersionId: `pv-${code}`,
  monthlyPrice,
  annualPrice: '0.000',
  annualFreeMonths: 2,
  invoicesPerMonth,
  peopleIncluded: people,
  extraPersonPrice: '8.000',
  branchesIncluded: branches,
  extraBranchPrice: null,
  overagePricePerInvoice: null,
  apiAccess: code !== 'STARTER',
  prioritySupport: code === 'BUSINESS_PLUS',
  recommended: code === 'BUSINESS',
  trialDays: 14,
  trialDocuments: null,
  features: [],
  sortOrder,
  // ER-1: the add-on is sold on Business Plus only (Enterprise is quoted). Production sends null
  // for every plan while paid extras is switched off; this is the switched-on shape. The annual
  // price is 12 months, not 10 (ER-4).
  erpAddon:
    code === 'BUSINESS_PLUS'
      ? { currency: 'OMR', monthlyPrice: '20.000', annualPrice: '240.000' }
      : null,
})

const CATALOGUE = [
  catalogued('STARTER', 'Starter', 'المبتدئة', '35.000', 200, 2, 1, 1),
  catalogued('BUSINESS', 'Business', 'الأعمال', '80.000', 1000, 5, 2, 2),
  catalogued('BUSINESS_PLUS', 'Business Plus', 'الأعمال بلس', '150.000', 3000, 10, null, 3),
]

/**
 * A downgrade to Starter waits for the 1 November renewal, so Settings › Plan offers the choice
 * of what switches off (`DowngradeSwitchOffService`). Starter includes 2 users and 1 branch: one
 * of the three users below (`paymentsRecurring.mjs` names them) and one branch must go. The
 * owner and the Head Branch always stay. Withdrawing the downgrade clears it and the choice.
 */
const SCHEDULED_CHANGE = {
  planCode: 'STARTER',
  planName: 'Starter',
  billingCycle: 'MONTHLY',
  periodPrice: '35.000',
  effectiveOn: '2026-11-01',
  kind: 'DOWNGRADE',
}
let scheduledChange = SCHEDULED_CHANGE

/** A plan change scheduled through `/settings/plan/changes` (`planChanges.mjs`) waits here too. */
export function setScheduledChange(change) {
  scheduledChange = change
  switchOffChoice = null
}

const SEATS = [
  { userId: 'u-yusuf', addedAt: '2026-08-02T08:00:00Z', kept: 'OWNER' },
  { userId: 'u-hafidh', addedAt: '2026-08-20T08:00:00Z', kept: null },
  { userId: 'u-aisha', addedAt: '2026-09-14T08:00:00Z', kept: null },
]
const OPEN_BRANCHES = [
  {
    branchId: 'b-main',
    name: 'Al Bahja Coffee (Main)',
    addedAt: '2026-08-02T08:00:00Z',
    kept: 'HEAD_BRANCH',
  },
  {
    branchId: 'b-seeb',
    name: 'Al Bahja Coffee (Seeb)',
    addedAt: '2026-09-01T08:00:00Z',
    kept: null,
  },
]
let switchOffChoice = null

/** As the server: the chosen first, then the most recently added, `excess` of them. */
function goingOff(rows, idOf, chosen, excess) {
  if (excess <= 0) return new Set()
  const eligible = rows.filter((row) => row.kept === null)
  const order = [
    ...chosen.filter((id) => eligible.some((row) => idOf(row) === id)),
    ...[...eligible].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).map(idOf),
  ]
  return new Set([...new Set(order)].slice(0, excess))
}

function switchOffView() {
  const chosenUsers = switchOffChoice?.userIds ?? []
  const chosenBranches = switchOffChoice?.branchIds ?? []
  const peopleIncluded = 2
  const branchesIncluded = 1
  const offUsers = goingOff(SEATS, (row) => row.userId, chosenUsers, SEATS.length - peopleIncluded)
  const offBranches = goingOff(
    OPEN_BRANCHES,
    (row) => row.branchId,
    chosenBranches,
    OPEN_BRANCHES.length - branchesIncluded,
  )
  return {
    planCode: scheduledChange.planCode,
    planVersionId: 'pv-STARTER',
    effectiveOn: scheduledChange.effectiveOn,
    peopleIncluded,
    branchesIncluded,
    activeUsers: SEATS.length,
    openBranches: OPEN_BRANCHES.length,
    choiceRecordedAt: switchOffChoice?.recordedAt ?? null,
    users: SEATS.map((row) => ({
      ...row,
      candidate: row.kept === null,
      chosen: chosenUsers.includes(row.userId),
      switchesOff: offUsers.has(row.userId),
    })),
    branches: OPEN_BRANCHES.map((row) => ({
      ...row,
      candidate: row.kept === null,
      chosen: chosenBranches.includes(row.branchId),
      switchesOff: offBranches.has(row.branchId),
    })),
  }
}

const NO_DOWNGRADE = {
  status: 409,
  body: {
    type: 'https://api.fawtir.om/problems/downgrade-choice-not-allowed',
    title: 'Conflict',
    status: 409,
    detail: 'No downgrade is waiting for the next renewal.',
  },
}

export default [
  { match: '/api/v1/roles', reply: () => ROLES },
  {
    match: '/api/v1/roles/matrix',
    reply: () => ({
      // `reserved` as the server's ReservedPermissions marks it (RL-5).
      permissions: PERMISSION_CATALOGUE.map((permission) => ({ ...permission, reserved: isReserved(permission.code) })),
      roles: ROLES.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        systemRole: role.systemRole,
        enabled: role.enabled,
        cells: cellsOf(role),
      })),
    }),
  },
  {
    method: 'POST',
    match: '/api/v1/roles',
    reply: ({ body }) => {
      if (!body?.name?.trim()) return problem(400, 'validation-failed', 'Name is required')
      if (ROLES.some((role) => role.code === body.code)) return problem(409, 'resource-conflict', 'Role code already exists')
      const grants = grantsFrom(body)
      if (grants.status) return grants
      const role = {
        id: `r-${body.code}`,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        enabled: true,
        systemRole: false,
        catalogueKind: 'CUSTOM',
        ...grants,
      }
      ROLES.push(role)
      return { status: 201, body: role }
    },
  },
  {
    method: 'PATCH',
    match: /^\/api\/v1\/roles\/([^/]+)$/,
    reply: ({ params, body }) => {
      const role = ROLES.find((r) => r.id === params[0])
      if (!role) return problem(404, 'resource-not-found', 'No such role')
      if (role.systemRole) return problem(403, 'insufficient-permission', 'System role cannot be modified')
      const grants = grantsFrom(body)
      if (grants.status) return grants
      Object.assign(role, grants)
      if (body.name != null) role.name = body.name
      if (body.description != null) role.description = body.description || null
      return role
    },
  },
  {
    method: 'DELETE',
    match: /^\/api\/v1\/roles\/([^/]+)$/,
    reply: ({ params }) => {
      const at = ROLES.findIndex((r) => r.id === params[0])
      if (at === -1) return problem(404, 'resource-not-found', 'No such role')
      if (ROLES[at].systemRole) return problem(403, 'insufficient-permission', 'System role cannot be deleted')
      if (HELD.has(ROLES[at].code)) return problem(409, 'resource-conflict', 'Users are still assigned')
      ROLES.splice(at, 1)
      return { status: 204 }
    },
  },
  { match: '/api/v1/users/invitations', reply: () => INVITATIONS },
  { match: '/api/v1/public/plans', reply: () => CATALOGUE },
  // The sign-up read, the public read's alias (catalogue contract §9).
  { match: '/api/v1/auth/signup/plans', reply: () => CATALOGUE },
  {
    match: '/api/v1/settings/plan',
    reply: () => ({
      plan: {
        code: 'BUSINESS',
        name: 'Business',
        invoicesPerMonth: 1000,
        peopleIncluded: 5,
        branchesIncluded: 2,
        monthlyPrice: '80.000',
        overagePricePerInvoice: '0.060',
      },
      usage: {
        period: { start: '2026-10-01', end: '2026-10-31', today: TODAY },
        used: 412,
        resubmissions: 6,
        quota: 1000,
        raisedToday: 31,
      },
      activePeople: 4,
      openInvitations: 1,
      activeBranches: 2,
      // Plan v4 §6 (AllowanceUsage): issued and received apart, per branch. Received documents
      // sit on the row with no branch, so the rows add up to `used`.
      allowance: {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        resetsOn: '2026-11-01',
        planDocuments: 1000,
        extraDocuments: 0,
        totalAllowance: 1000,
        issued: 380,
        resubmissions: 6,
        received: 32,
        receivedHidden: 0,
        used: 412,
        planUsed: 412,
        extraUsed: 0,
        left: 588,
        warningPercent: null,
        issuingAllowed: true,
        extrasExpireOn: '2026-10-31',
        byBranch: [
          { branchId: 'b-main', branchName: 'Al Bahja Coffee (Muscat)', issued: 251, received: 0, total: 251 },
          { branchId: 'b-nizwa', branchName: 'Al Bahja Coffee (Nizwa)', issued: 127, received: 0, total: 127 },
          { branchId: null, branchName: null, issued: 2, received: 32, total: 34 },
        ],
      },
    }),
  },
  // Trial-ending and grace reminders (backend #515, V299), for the bell. Read state lives here so
  // marking one read shows on the next read, as the server does.
  {
    match: '/api/v1/settings/subscription/notices',
    reply: ({ query }) => {
      const unread = query?.get ? query.get('unread') === 'true' : query?.unread === 'true'
      return subscriptionNotices().filter((notice) => !unread || !notice.read)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/settings\/subscription\/notices\/([^/]+)\/acknowledge$/,
    reply: ({ params }) => {
      const notice = subscriptionNotices().find((entry) => entry.id === params[0])
      if (!notice) return { status: 404, body: { status: 404 } }
      notice.read = true
      return { status: 204 }
    },
  },
  {
    match: '/api/v1/settings/subscription/scheduled-change/switch-off',
    reply: () => (scheduledChange ? switchOffView() : NO_DOWNGRADE),
  },
  {
    method: 'PUT',
    match: '/api/v1/settings/subscription/scheduled-change/switch-off',
    reply: ({ body }) => {
      if (!scheduledChange) return NO_DOWNGRADE
      const userIds = [...new Set(body?.userIds ?? [])]
      const branchIds = [...new Set(body?.branchIds ?? [])]
      const users = userIds.every((id) =>
        SEATS.some((row) => row.userId === id && row.kept === null),
      )
      const branches = branchIds.every((id) =>
        OPEN_BRANCHES.some((row) => row.branchId === id && row.kept === null),
      )
      if (!users || !branches) return NO_DOWNGRADE
      switchOffChoice = { userIds, branchIds, recordedAt: `${TODAY}T10:00:00Z` }
      return switchOffView()
    },
  },
  {
    method: 'DELETE',
    match: '/api/v1/settings/subscription/scheduled-change',
    reply: () => {
      scheduledChange = null
      switchOffChoice = null
      return subscription()
    },
  },
  {
    match: '/api/v1/settings/subscription',
    reply: () => subscription(),
  },
]

/** The cancellation's own notice (V365), only in the `cancelledByFawtir` state. */
const CANCELLED_BY_FAWTIR_NOTICE = {
  id: '7f3c1a52-3c1e-4b8e-9d0a-5c1f000000fc',
  kind: 'CANCELLED_BY_FAWTIR',
  coveredThrough: '2026-10-10',
  graceDay: null,
  graceUntil: null,
  daysBefore: null,
  planCode: null,
  noticeOn: TODAY,
  headline: 'Fawtir cancelled your subscription on 11 October 2026. Your account is read-only.',
  actionLabel: 'View your plan',
  actionPath: '/settings/plan',
  createdAt: `${TODAY}T06:00:00Z`,
  read: false,
}

function subscriptionNotices() {
  return process.env.MOCK_SUBSCRIPTION_STATE === 'cancelledByFawtir'
    ? [CANCELLED_BY_FAWTIR_NOTICE, ...SUBSCRIPTION_NOTICES]
    : SUBSCRIPTION_NOTICES
}

function subscription() {
  const status = {
    ...SUBSCRIPTION_ACTIVE,
    ...(SUBSCRIPTION_STATES[process.env.MOCK_SUBSCRIPTION_STATE ?? ''] ?? {}),
  }
  return { ...status, scheduledChange: scheduledView(status) }
}

/**
 * The waiting change with backend #614's `paidFor` and `withdrawal`, worked out as the server
 * does: paid for when its first period is inside `paidThrough`, and then taken back only by
 * keeping the plan (a charged change); otherwise withdrawn for free.
 * `MOCK_SCHEDULED_CHANGE_FIELDS=off` answers as a server before #614 (no kind, paidFor or
 * withdrawal), to check the screen's fallback.
 */
function scheduledView(status) {
  if (!scheduledChange) return null
  const paidFor = status.paidThrough !== null && scheduledChange.effectiveOn <= status.paidThrough
  const full = { ...scheduledChange, paidFor, withdrawal: paidFor ? 'KEEP_PLAN' : 'FREE' }
  if (process.env.MOCK_SCHEDULED_CHANGE_FIELDS !== 'off') return full
  const { kind: _kind, paidFor: _paidFor, withdrawal: _withdrawal, ...before } = full
  return before
}
