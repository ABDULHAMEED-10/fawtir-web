/**
 * Settings › Plan and usage › Extra users, branches and add-on, the bill an order issues, and the
 * console's read-only card, in the shapes `src/api/settings/paidExtras.ts` and
 * `src/lib/console/companySubscription.ts` read (backend V340). The state is kept here so an
 * order shows as the bill to pay on the next read, as the server does; `extraDocuments.mjs` lists
 * that bill on Bills and payment through {@link paidExtrasBillRows}.
 *
 * Business by default (no add-on, ER-1). `MOCK_PAID_EXTRAS_PLAN=BUSINESS_PLUS` offers the add-on
 * at 20.000 a month; `MOCK_PAID_EXTRAS_STATE=order` starts with an unpaid order, `=addon` with the
 * add-on on, `=ending` with it stopping, `=trial` in the trial, `=closed` before Fawtir opens it.
 */
const TODAY = '2026-10-11'
const PERIOD = { start: '2026-10-01', end: '2026-10-31', days: 31 }
const REMAINING = 21
const VAT_RATE = '0.05000'
const MAX_USERS = 50
const MAX_BRANCHES = 20
const PLUS = process.env.MOCK_PAID_EXTRAS_PLAN === 'BUSINESS_PLUS'
const MODE = process.env.MOCK_PAID_EXTRAS_STATE ?? ''
const PLAN = PLUS
  ? {
      code: 'BUSINESS_PLUS',
      name: 'Business Plus',
      users: 10,
      branches: 5,
      user: '2.500',
      branch: '5.000',
    }
  : { code: 'BUSINESS', name: 'Business', users: 5, branches: 2, user: '2.500', branch: '5.000' }
const ADDON_PRICE = PLUS ? '20.000' : null
const COMPANY = '7a1c0b52-4f0e-4b8e-9d3a-2f6c1e0a9b11'

const baisa = (text) => Math.round(Number(text) * 1000)
const omr = (value) => (value / 1000).toFixed(3)

const state = {
  order: null,
  payment: null,
  addon: MODE === 'addon' ? 'ACTIVE' : MODE === 'ending' ? 'ENDING' : null,
  places: [
    place('pl-backfill', 'USER', 1, 'BACKFILL', 'ACTIVE', null, '2026-10-01T00:00:00Z'),
    ...(MODE === 'addon' || MODE === 'ending'
      ? [
          place(
            'pl-addon',
            'ERP_ADDON',
            1,
            'PURCHASE',
            'ACTIVE',
            ADDON_PRICE,
            '2026-10-02T09:00:00Z',
          ),
        ]
      : []),
  ],
}

function place(id, kind, quantity, source, status, net, createdAt, billId = null) {
  return {
    id,
    kind,
    quantity,
    source,
    status,
    unitPeriodPrice: kind === 'USER' ? PLAN.user : kind === 'BRANCH' ? PLAN.branch : ADDON_PRICE,
    netAmount: net,
    planCode: PLAN.code,
    billingCycle: 'MONTHLY',
    coversFrom: source === 'BACKFILL' ? PERIOD.start : TODAY,
    coversTo: PERIOD.end,
    billId,
    reason: source === 'BACKFILL' ? 'In use before paid extras opened' : null,
    createdAt,
    activatedAt: status === 'ACTIVE' ? createdAt : null,
    cancelledAt: null,
  }
}

function line(kind, quantity, unit) {
  return {
    kind,
    quantity,
    from: TODAY,
    to: PERIOD.end,
    days: REMAINING,
    periodDays: PERIOD.days,
    unitPeriodPrice: unit,
    net: omr(Math.round((baisa(unit) * quantity * REMAINING) / PERIOD.days)),
    planCode: PLAN.code,
    planVersionId: '00000000-0000-4000-8000-00000000b001',
    billingCycle: 'MONTHLY',
  }
}

function priced(users, branches, erpAddon) {
  const lines = [
    ...(users > 0 ? [line('USER', users, PLAN.user)] : []),
    ...(branches > 0 ? [line('BRANCH', branches, PLAN.branch)] : []),
    ...(erpAddon ? [line('ERP_ADDON', 1, ADDON_PRICE)] : []),
  ]
  const subtotal = lines.reduce((sum, entry) => sum + baisa(entry.net), 0)
  const vat = Math.round(subtotal * Number(VAT_RATE))
  return {
    users,
    branches,
    erpAddon,
    lines,
    subtotal: omr(subtotal),
    vatRate: VAT_RATE,
    vatAmount: omr(vat),
    total: omr(subtotal + vat),
    currency: 'OMR',
    renewalOn: '2026-11-01',
    placesEnd: null,
    maxUsersPerOrder: MAX_USERS,
    maxBranchesPerOrder: MAX_BRANCHES,
  }
}

function placeOrder(users, branches, erpAddon) {
  const quote = priced(users, branches, erpAddon)
  const id = `b-paid-extras-${users}-${branches}-${erpAddon ? 1 : 0}`
  const bill = {
    id,
    number: 'FWT-SUB-2026-000057',
    planCode: PLAN.code,
    planName: PLAN.name,
    billingCycle: 'MONTHLY',
    periodStartsOn: TODAY,
    periodEndsOn: PERIOD.end,
    subtotal: quote.subtotal,
    vatRate: VAT_RATE,
    vatAmount: quote.vatAmount,
    total: quote.total,
    currency: 'OMR',
    taxDocumentStatus: 'NOT_A_TAX_INVOICE',
    status: 'OPEN',
    dueOn: TODAY,
    issuedAt: `${TODAY}T08:00:00Z`,
    paidAt: null,
    appliedPaidThrough: null,
    voidReason: null,
    version: 0,
    kind: 'PAID_EXTRAS',
    seller: {
      legalNameEn: 'Thumb International SPC',
      legalNameAr: 'الإبهام العالمية ش ش و',
      crNumber: '1383315',
      taxIdentificationNumber: '1875504',
      vatNumber: null,
      addressEn: 'Al Khuwair, Bousher, Muscat',
      addressAr: null,
    },
  }
  const places = quote.lines.map((entry, index) =>
    place(
      `pl-order-${index}`,
      entry.kind,
      entry.quantity,
      'PURCHASE',
      'PENDING',
      entry.net,
      `${TODAY}T08:00:00Z`,
      id,
    ),
  )
  // Other numbers replace the unpaid order, as the server voids it and issues a new bill.
  state.places = state.places.filter((entry) => entry.status !== 'PENDING')
  state.places.unshift(...places)
  state.order = { places, bill }
  state.payment = null
  if (erpAddon) state.addon = 'PENDING_PAYMENT'
  else if (state.addon === 'PENDING_PAYMENT') state.addon = null
  return state.order
}

if (MODE === 'order') placeOrder(1, 1, PLUS)

function kind(included, inUse, paid, unit) {
  return {
    included,
    inUse,
    paidPlacesNow: paid,
    capacity: included + paid,
    unitMonthlyPrice: unit,
    offered: true,
  }
}

function overview() {
  const paidUsers = state.places
    .filter((entry) => entry.kind === 'USER' && entry.status === 'ACTIVE')
    .reduce((sum, entry) => sum + entry.quantity, 0)
  return {
    open: MODE !== 'closed',
    users: kind(PLAN.users, PLAN.users, paidUsers, PLAN.user),
    branches: kind(PLAN.branches, PLAN.branches, 0, PLAN.branch),
    erpAddon: {
      offered: PLUS,
      monthlyPrice: ADDON_PRICE,
      status: state.addon,
      endsOn: state.addon === 'ENDING' ? PERIOD.end : null,
    },
    maxUsersPerOrder: MAX_USERS,
    maxBranchesPerOrder: MAX_BRANCHES,
    outstanding: state.order,
    places: state.places,
  }
}

const problem = (status, slug, detail, extra = {}) => ({
  status,
  body: { type: `https://api.fawtir.om/problems/${slug}`, title: slug, status, detail, ...extra },
})

function refusal(users, branches, erpAddon) {
  if (MODE === 'closed')
    return problem(409, 'paid-extras-not-open', 'Paid extras are not open yet.')
  if (MODE === 'trial') return problem(409, 'paid-extras-not-in-trial', 'Not during the trial.')
  if (users > MAX_USERS || branches > MAX_BRANCHES) {
    return problem(409, 'paid-extras-order-limit', 'Above the per-order maximum.', {
      maxUsers: MAX_USERS,
      maxBranches: MAX_BRANCHES,
    })
  }
  if (erpAddon && !PLUS) return problem(409, 'paid-extras-not-offered', 'The plan has no add-on.')
  if (users + branches === 0 && !erpAddon)
    return problem(400, 'validation-failed', 'Nothing ordered.')
  return null
}

/** The open paid-extras bill as Bills and payment lists it (read by `extraDocuments.mjs`). */
export function paidExtrasBillRows() {
  if (!state.order) return []
  return [
    {
      bill: { ...state.order.bill, status: state.payment ? 'PENDING_VERIFICATION' : 'OPEN' },
      payments: state.payment ? [state.payment] : [],
      card: state.payment ? null : { available: true, purpose: 'PAID_EXTRAS', reason: null },
    },
  ]
}

/** A bank transfer or cash request for the open paid-extras bill; null when it is not that bill. */
export function payPaidExtrasBill(billId, method) {
  if (!state.order || state.order.bill.id !== billId) return null
  state.payment = {
    id: `p-extras-${method.toLowerCase()}`,
    billId,
    method,
    status: 'SUBMITTED',
    amount: state.order.bill.total,
    submittedAt: `${TODAY}T08:05:00Z`,
    reference: method === 'BANK_TRANSFER' ? 'TRF-778813' : null,
    customerNote: null,
    proofContentType: method === 'BANK_TRANSFER' ? 'application/pdf' : null,
    receiptNumber: null,
    receivedAmount: null,
    receivedAt: null,
    rejectionReason: null,
    version: 0,
  }
  return state.payment
}

const flag = (value) => value === true || value === 'true'

export default [
  { match: '/api/v1/settings/plan/extras', reply: () => overview() },
  {
    match: '/api/v1/settings/plan/extras/quote',
    reply: ({ query }) => {
      const users = Number(query.get('users') ?? 0)
      const branches = Number(query.get('branches') ?? 0)
      const erpAddon = flag(query.get('erpAddon'))
      return refusal(users, branches, erpAddon) ?? priced(users, branches, erpAddon)
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/plan/extras/orders',
    reply: ({ body }) => {
      const users = Number(body?.users ?? 0)
      const branches = Number(body?.branches ?? 0)
      const erpAddon = flag(body?.erpAddon)
      const refused = refusal(users, branches, erpAddon)
      if (refused) return refused
      if (state.payment)
        return problem(409, 'payment-state-conflict', 'A payment is being checked.')
      if (priced(users, branches, erpAddon).total !== body?.expectedTotal) {
        return problem(409, 'extras-price-changed', 'The total changed.')
      }
      const same =
        state.order &&
        state.order.bill.id === `b-paid-extras-${users}-${branches}-${erpAddon ? 1 : 0}`
      return {
        status: same ? 200 : 201,
        body: same ? state.order : placeOrder(users, branches, erpAddon),
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/settings/plan/extras/erp-addon/cancellation',
    reply: () => {
      if (state.addon !== 'ACTIVE') return problem(409, 'erp-addon-not-active', 'Not on.')
      state.addon = 'ENDING'
      return overview().erpAddon
    },
  },
  {
    method: 'DELETE',
    match: '/api/v1/settings/plan/extras/erp-addon/cancellation',
    reply: () => {
      if (state.addon !== 'ENDING') return problem(409, 'erp-addon-not-ending', 'Not stopping.')
      state.addon = 'ACTIVE'
      return overview().erpAddon
    },
  },
  {
    match: `/api/v1/platform/companies/${COMPANY}/paid-extras`,
    reply: () => ({
      tenantId: COMPANY,
      extras: overview(),
      erpAddon: state.addon
        ? {
            tenantId: COMPANY,
            status: state.addon,
            startedOn: state.addon === 'PENDING_PAYMENT' ? null : '2026-10-02',
            endsOn: state.addon === 'ENDING' ? PERIOD.end : null,
            endReason: state.addon === 'ENDING' ? 'CUSTOMER' : null,
            grantedEntitlement: state.addon === 'ACTIVE' || state.addon === 'ENDING',
            changedBy: 'u-owner',
            changedAt: '2026-10-02T09:00:00Z',
            version: 1,
          }
        : null,
    }),
  },
]
