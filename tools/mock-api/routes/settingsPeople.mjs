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
  restrictionsOff: { access: 'PAYMENT_REQUIRED', restrictionsEnforced: false, restriction: null, ...LAPSED },
}

const ROLES = [
  {
    id: 'r-admin',
    code: 'TENANT_ADMIN',
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
]

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
}
let scheduledChange = SCHEDULED_CHANGE

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
  { match: '/api/v1/users/invitations', reply: () => INVITATIONS },
  { match: '/api/v1/public/plans', reply: () => CATALOGUE },
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
    }),
  },
  // Trial-ending and grace reminders (backend #515, V299), for the bell. Read state lives here so
  // marking one read shows on the next read, as the server does.
  {
    match: '/api/v1/settings/subscription/notices',
    reply: ({ query }) => {
      const unread = query?.get ? query.get('unread') === 'true' : query?.unread === 'true'
      return SUBSCRIPTION_NOTICES.filter((notice) => !unread || !notice.read)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/settings\/subscription\/notices\/([^/]+)\/acknowledge$/,
    reply: ({ params }) => {
      const notice = SUBSCRIPTION_NOTICES.find((entry) => entry.id === params[0])
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

function subscription() {
  return {
    ...SUBSCRIPTION_ACTIVE,
    ...(SUBSCRIPTION_STATES[process.env.MOCK_SUBSCRIPTION_STATE ?? ''] ?? {}),
    scheduledChange,
  }
}
