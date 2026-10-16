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
    match: '/api/v1/settings/subscription',
    reply: () => ({
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
    }),
  },
]
