/**
 * Self-billing fixtures: the agreements list (`/v1/self-billing-agreements`) and the self-billed
 * draft create route, in the shapes `src/api/selfBilling/agreements.ts` and
 * `src/api/invoices/drafts.ts` expect.
 *
 * Sorted before `drafts.mjs`, so the session answered here (the draft session plus the
 * self-billing rights) is the one the shell sees; every other route in `drafts.mjs` keeps working
 * for the same customers (`c-mgh`, `c-nizwa`, …) and branches.
 */

const ENTITLEMENTS = {
  userId: 'u-nasser',
  username: 'nasser.alhabsi',
  tenantId: 't-albahja',
  tenantName: 'Al Bahja Coffee',
  roles: [{ id: 'r-owner', code: 'OWNER', name: 'Owner', systemRole: true }],
  permissions: [
    'platform.tenants.manage',
    'platform.operators.manage',
    'platform.support',
    'platform.smp.operations.review',
    'platform.smp.operations.manage',
    // The console tenant page's subscription cards and the contact details page (companyContact.mjs).
    'platform.billing.read',
    'platform.billing.manage',
    'platform.plans.read',
    // Console › Settings › Business types and the template editor (consoleBusinessTypes.mjs).
    'platform.catalogue.manage',
    'admin.users.manage',
    'admin.roles.manage',
    'admin.settings.manage',
    'role.read',
    'role.list',
    'invoice.read',
    'invoice.write',
    'invoice.approve',
    'invoice.draft',
    'invoice.issue',
    'invoice.export',
    'invoice.cancel',
    'invoice.internal-note.read',
    // The owner records bills: Upload a bill and Scan receipts (bills.mjs) need it.
    'invoice.payment.manage',
    'customer.read',
    'customer.manage',
    'supplier.read',
    'product.read',
    'product.manage',
    'branch.read',
    'selfbilling.create',
    'selfbilling.agreement.manage',
    'creditnote.create',
    // Reading and paying the subscription, only for a run that picks a read-only state
    // (`MOCK_SUBSCRIPTION_STATE`, settingsPeople.mjs): otherwise the bell's reminders would join
    // every other screenshot.
    ...(process.env.MOCK_SUBSCRIPTION_STATE ? ['tenant.plan.read', 'tenant.plan.manage'] : []),
    // The console's billing cards on the tenant page (consolePayLinks.mjs), for a run that asks.
    ...(process.env.MOCK_CONSOLE_BILLING
      ? ['platform.billing.read', 'platform.billing.manage', 'platform.plans.read']
      : []),
  ],
  scopes: ['platform.tenants.manage', 'platform.operators.manage', 'platform.support'],
  featureFlags: {},
  // Branch access (BA-1, OW-1): this session is the company's Owner and sees every branch, which
  // is also what the server says to everyone while branch access is off (the default here).
  isOwner: true,
  allBranches: true,
  branchIds: [],
  branchAdministrator: false,
  manageableBranchIds: [],
  branchAccessEnforced: ['on', 'owner'].includes(process.env.MOCK_BRANCH_ACCESS),
}

/**
 * `MOCK_BRANCH_ACCESS=on`: branch access switched on (`branchAccessEnforced` true), seen as a
 * branch administrator (Hafidh, of Nizwa): `allBranches` false and `branchAdministrator` true, with
 * `branch.users.manage` instead of the Administrator's `admin.users.manage` (LG-3).
 * `MOCK_BRANCH_ACCESS=owner`: switched on, seen as the Owner, who still sees every branch.
 * Unset: switched off, `branchAccessEnforced` false.
 */
const BRANCH_ADMINISTRATOR = {
  ...ENTITLEMENTS,
  userId: 'u-hafidh',
  username: 'hafidh',
  roles: [{ id: 'r-accountant', code: 'ACCOUNTANT', name: 'Accountant', systemRole: true }],
  permissions: [
    ...ENTITLEMENTS.permissions.filter(
      (code) => !code.startsWith('platform.') && !code.startsWith('admin.'),
    ),
    'branch.users.manage',
  ],
  scopes: [],
  isOwner: false,
  allBranches: false,
  branchIds: ['b-nizwa'],
  branchAdministrator: true,
  manageableBranchIds: ['b-nizwa'],
}

const SESSION = process.env.MOCK_BRANCH_ACCESS === 'on' ? BRANCH_ADMINISTRATOR : ENTITLEMENTS

const agreement = (id, customerId, reference, from, to, extra = {}) => ({
  id,
  customerId,
  agreementReference: reference,
  status: 'ACTIVE',
  sellerIdentityAssurance: 'COUNTERPARTY_VERIFIED',
  verifiedParticipant: null,
  verifiedAt: '2026-08-30T08:00:00Z',
  effectiveFrom: from,
  effectiveTo: to,
  withdrawnAt: null,
  withdrawalReason: null,
  version: 0,
  ...extra,
})

const AGREEMENTS = [
  agreement('sba-4', 'c-mgh', 'SBA-2026-004', '2026-01-01', '2026-12-31', {
    verifiedParticipant: '0248:OM1100447102',
  }),
  agreement('sba-3', 'c-nizwa', 'SBA-2026-003', '2025-11-01', '2026-10-04', {
    verifiedParticipant: '0248:OM1100338914',
  }),
  agreement('sba-2', 'c-salalah', 'SBA-2026-002', '2025-09-01', '2026-09-12', {
    verifiedParticipant: '0248:OM1100562773',
  }),
  agreement('sba-5', 'c-sohar', 'SBA-2026-005', '2026-09-20', null, {
    status: 'PENDING_ACTIVATION',
    sellerIdentityAssurance: 'UNVERIFIED',
    verifiedAt: null,
  }),
  agreement('sba-6', 'c-qurum', 'SBA-2026-006', '2026-09-01', null, {
    sellerIdentityAssurance: 'UNVERIFIED',
    verifiedAt: null,
  }),
  agreement('sba-1', 'c-bahla', 'SBA-2025-001', '2025-03-01', '2026-03-01', {
    status: 'WITHDRAWN',
    withdrawnAt: '2026-02-10T09:00:00Z',
    withdrawalReason: 'Supplier moved to invoicing us directly',
  }),
]

let nextDraft = 1
const SELF_BILLED = new Map()

const toResponse = (id, version, draft) => ({
  id,
  version,
  authoringState: 'DRAFT',
  customerId: draft.customerId,
  branchId: draft.branchId,
  currency: draft.currency,
  invoiceNumber: null,
  type: 'SELF_BILLED_INVOICE',
  details: draft.details,
  headerDiscount: draft.headerDiscount,
  lines: draft.lines.map((line) => ({
    lineNumber: line.lineNumber,
    productId: line.productId,
    productCode: line.productCode,
    description: line.description,
    unitCode: line.unitCode,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountType: line.discount.type,
    discountValue: line.discount.value,
    taxCategoryCode: line.taxCategory.code,
    en16931Category: line.taxCategory.en16931Category,
    taxRate: line.taxCategory.rate,
    exemptionReason: line.taxCategory.exemptionReason,
  })),
})

export default [
  { match: '/api/v1/me/entitlements', reply: () => SESSION },
  { match: '/api/v1/self-billing-agreements', reply: () => AGREEMENTS },
  {
    match: /^\/api\/v1\/self-billing-agreements\/([^/]+)$/,
    reply: ({ params }) => AGREEMENTS.find((row) => row.id === params[0]) ?? { status: 404 },
  },
  {
    method: 'POST',
    match: '/api/v1/self-billed-invoice-drafts',
    reply: ({ body }) => {
      const id = `sb-${nextDraft++}`
      SELF_BILLED.set(id, { version: 0, draft: body })
      return { status: 201, body: toResponse(id, 0, body) }
    },
  },
  {
    match: /^\/api\/v1\/invoice-drafts\/(sb-[^/]+)$/,
    reply: ({ params }) => {
      const found = SELF_BILLED.get(params[0])
      return found ? toResponse(params[0], found.version, found.draft) : { status: 404 }
    },
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/invoice-drafts\/(sb-[^/]+)$/,
    reply: ({ params, body }) => {
      const found = SELF_BILLED.get(params[0])
      if (!found) return { status: 404 }
      found.version += 1
      found.draft = body.draft
      return toResponse(params[0], found.version, found.draft)
    },
  },
]
