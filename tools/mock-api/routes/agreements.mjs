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
    'admin.users.manage',
    'admin.roles.manage',
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
    'customer.read',
    'customer.manage',
    'supplier.read',
    'product.read',
    'product.manage',
    'branch.read',
    'selfbilling.create',
    'selfbilling.agreement.manage',
    'creditnote.create',
  ],
  scopes: ['platform.tenants.manage', 'platform.operators.manage', 'platform.support'],
  featureFlags: {},
}

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
  { match: '/api/v1/me/entitlements', reply: () => ENTITLEMENTS },
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
