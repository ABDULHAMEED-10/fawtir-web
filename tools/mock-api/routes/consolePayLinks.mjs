/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * The console's "Bills and payment links" card on the tenant page. Shapes follow
 * `src/lib/console/payLinks.ts`. Run the mock with `MOCK_CONSOLE_BILLING=1` so the session holds
 * `platform.billing.*` (agreements.mjs).
 *
 * - Sur Marine (`/console/tenants/7a1c0b52-…`, consoleCompanySubscription.mjs) is billed: one
 *   unpaid bill with two payment links, and a paid one.
 * - Wadi Builders (`/console/tenants/c3d8e5f1-…`) was created by Fawtir and is not billed yet:
 *   Start billing opens its lifecycle and answers with the first bill.
 *
 * Writes answer as the server would; nothing is kept between requests.
 */
const BILLED = '7a1c0b52-4f0e-4b8e-9d3a-2f6c1e0a9b11'
const UNBILLED = 'c3d8e5f1-2a4b-4c6d-8e0f-1a2b3c4d5e6f'
const company = (id) => `/api/v1/platform/companies/${id}`
const OPEN_BILL = 'b7e1a3c5-0000-4000-8000-000000000042'

const bill = (over = {}) => ({
  id: OPEN_BILL,
  tenantId: BILLED,
  number: 'FSB-2026-0042',
  planCode: 'BUSINESS',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodStartsOn: '2026-11-10',
  periodEndsOn: '2026-12-09',
  subtotal: '80.000',
  vatRate: '0.00000',
  vatAmount: '0.000',
  total: '80.000',
  currency: 'OMR',
  status: 'OPEN',
  dueOn: '2026-11-10',
  issuedAt: '2026-10-17T05:00:00Z',
  version: 0,
  ...over,
})

const BILLS = {
  items: [
    { bill: bill(), kind: 'SUBSCRIPTION', lines: [] },
    {
      bill: bill({
        id: 'b7e1a3c5-0000-4000-8000-000000000031',
        number: 'FSB-2026-0031',
        periodStartsOn: '2026-10-10',
        periodEndsOn: '2026-11-09',
        status: 'PAID',
        dueOn: '2026-10-10',
        issuedAt: '2026-10-03T05:00:00Z',
      }),
      kind: 'SUBSCRIPTION',
      lines: [],
    },
  ],
  nextCursor: null,
}

const LINKS = [
  {
    id: 'pl-2',
    billId: OPEN_BILL,
    status: 'ACTIVE',
    channel: 'EMAIL',
    language: 'en',
    tokenHint: 'q7Zk',
    recipient: 'a***@surmarine.test',
    createdBy: 'u-nasser',
    createdAt: '2026-10-17T06:10:00Z',
    sentAt: '2026-10-17T06:10:04Z',
    firstOpenedAt: '2026-10-17T07:42:00Z',
    openCount: 3,
    expiresAt: '2026-10-24T06:10:00Z',
    closedAt: null,
    closeReason: null,
    version: 1,
  },
  {
    id: 'pl-1',
    billId: OPEN_BILL,
    status: 'SUPERSEDED',
    channel: 'WHATSAPP',
    language: 'ar',
    tokenHint: 'Lm2c',
    recipient: '+968 ****2233',
    createdBy: 'u-nasser',
    createdAt: '2026-10-16T09:00:00Z',
    sentAt: null,
    firstOpenedAt: null,
    openCount: 0,
    expiresAt: '2026-10-23T09:00:00Z',
    closedAt: '2026-10-17T06:10:00Z',
    closeReason: 'NEW_LINK',
    version: 2,
  },
]

// `MOCK_PAY_QUICKLINK=1`: new links are Paymob's own payment links (QuickLink).
const QUICKLINK = process.env.MOCK_PAY_QUICKLINK === '1'
const PAY_URL = QUICKLINK
  ? 'https://oman.paymob.com/standalone/?ref=mockQuickLinkForScreenshotsOnly'
  : 'https://app.fawtir.om/pay#n3wT0kenForScreenshotsOnly000000000000000'

// Read only since D9: a link is valid 7 days, fixed, and there is no PUT.
const PAY_LINK_SETTINGS = {
  enabled: true,
  cardEnabled: true,
  validityDays: 7,
  maxValidityDays: 7,
  settingsVersion: 3,
  paymobQuickLink: QUICKLINK,
}

const UNBILLED_OVERVIEW = {
  identity: {
    tenantId: UNBILLED,
    tenantCode: 'FTC3D8E5F1',
    tenantName: 'Wadi Builders',
    tenantStatus: 'ACTIVE',
    identityStatus: 'READY',
  },
  company: {
    legalName: 'Wadi Builders SPC',
    legalNameAr: 'وادي للمقاولات ش ش و',
    tradingName: null,
    commercialRegistrationNumber: '1311442',
    taxNumber: null,
    country: 'OM',
    registeredAddressLine1: 'Way 3011, Al Khuwair',
    registeredAddressLine2: null,
    registeredAddressLine3: null,
    registeredCity: 'Muscat',
    registeredPostalCode: '133',
    registeredCountrySubdivision: null,
    registeredPoBox: null,
    timezone: 'Asia/Muscat',
    contactPersonName: 'Salim Al Rawahi',
    contactPhone: '+96892001122',
    contactEmail: 'finance@wadibuilders.test',
  },
  verification: {
    status: 'VERIFIED',
    method: 'MANUAL_ATTESTATION',
    rejectionReason: null,
    attestationReference: 'MOCI-2026-1311442',
    evidenceRecorded: true,
    profileRevision: 1,
    submittedAt: '2026-10-14T06:00:00Z',
    submittedBy: 'u-nasser',
    decidedAt: '2026-10-15T08:00:00Z',
    decidedBy: 'u-other',
  },
  subscription: {
    planCode: 'STARTER',
    planName: 'Starter',
    monthlyPrice: '35.000',
    invoicesPerMonth: 200,
    overageEnabled: false,
    implicitDefault: true,
    startedOn: null,
    changedAt: null,
  },
  operational: { ready: true, reasonCode: null },
}

const status = (tracked) => ({
  tracked,
  access: tracked ? 'PAYMENT_REQUIRED' : 'NOT_TRACKED',
  restrictionsEnforced: false,
  today: '2026-10-17',
  planCode: tracked ? 'BUSINESS' : 'STARTER',
  planName: tracked ? 'Business' : 'Starter',
  billingCycle: tracked ? 'MONTHLY' : null,
  periodPrice: tracked ? '80.000' : null,
  trialStartsOn: null,
  trialEndsOn: null,
  trialDay: null,
  trialDaysLeft: null,
  paidThrough: null,
  renewsOn: null,
  graceDays: 7,
  graceUntil: null,
  autoRenew: false,
  autoRenewAvailable: false,
  autoRenewChangedAt: null,
  cancelAtPeriodEnd: false,
  accessEndsOn: null,
  scheduledChange: null,
})

// `CreatedPayLink`: the link, and the address and share text shown this once.
const created = (body) => ({
  status: 200,
  body: {
    link: {
      ...LINKS[0],
      id: 'pl-3',
      channel: body?.channel ?? 'COPIED',
      language: body?.language ?? 'en',
      tokenHint: '0000',
      sentAt: body?.channel === 'EMAIL' ? '2026-10-17T09:00:02Z' : null,
      firstOpenedAt: null,
      openCount: 0,
      createdAt: '2026-10-17T09:00:00Z',
      expiresAt: '2026-10-24T09:00:00Z',
      version: 0,
    },
    payLinkUrl: PAY_URL,
    tokenShownOnce: false,
    paymobQuickLink: QUICKLINK,
    emailSent: body?.channel === 'EMAIL' ? true : null,
    shareText:
      body?.language === 'ar'
        ? `مرحبًا، هذا رابط دفع فاتورة فوتر FSB-2026-0042 بمبلغ OMR 80.000، يعمل حتى 24 أكتوبر 2026: ${PAY_URL}`
        : `Hello, here is the link to pay Fawtir bill FSB-2026-0042 for OMR 80.000. It works until 24 Oct 2026: ${PAY_URL}`,
  },
})

export default [
  { match: `${company(BILLED)}/bills`, reply: () => BILLS },
  {
    method: 'POST',
    match: `${company(BILLED)}/bills`,
    reply: () => ({ status: 409, body: problem('bill-not-payable') }),
  },
  { match: `/api/v1/platform/billing/bills/${OPEN_BILL}/pay-links`, reply: () => LINKS },
  { match: /^\/api\/v1\/platform\/billing\/bills\/[^/]+\/pay-links$/, reply: () => [] },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/billing\/bills\/[^/]+\/pay-links$/,
    reply: ({ body }) => created(body),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/billing\/pay-links\/([^/]+)\/revocation$/,
    reply: ({ params }) => ({
      ...(LINKS.find((link) => link.id === params[0]) ?? LINKS[0]),
      status: 'REVOKED',
      closedAt: '2026-10-17T09:00:00Z',
      closeReason: 'Sent to the wrong person',
    }),
  },
  // `PayLinkSettings`: present only on a server with N8; `enabled` is the switch.
  { match: '/api/v1/platform/billing/pay-link-settings', reply: () => PAY_LINK_SETTINGS },

  { match: `${company(UNBILLED)}/overview`, reply: () => UNBILLED_OVERVIEW },
  {
    match: `${company(UNBILLED)}/subscription`,
    reply: () => ({ status: status(false), events: [] }),
  },
  { match: `${company(UNBILLED)}/bills`, reply: () => ({ items: [], nextCursor: null }) },
  {
    match: `${company(UNBILLED)}/enterprise-terms`,
    reply: () => ({
      tenantId: UNBILLED,
      state: 'TERMS_NOT_SET',
      version: 0,
      plan: null,
      nextBill: null,
    }),
  },
  {
    method: 'POST',
    match: `${company(UNBILLED)}/subscription/start`,
    reply: () => ({
      plan: { planCode: 'STARTER', planName: 'Starter', billingCycle: 'MONTHLY' },
      subscription: status(true),
      bill: bill({
        tenantId: UNBILLED,
        number: 'FSB-2026-0050',
        periodStartsOn: null,
        periodEndsOn: null,
        dueOn: '2026-10-24',
      }),
    }),
  },
  {
    match: `${company(UNBILLED)}/extra-documents`,
    reply: () => ({ status: 409, body: problem('subscription-not-tracked') }),
  },
  {
    match: `${company(UNBILLED)}/received-document-counting`,
    reply: () => ({
      tenantId: UNBILLED,
      enterprise: false,
      planCode: 'STARTER',
      version: 0,
      monthStartedOn: '2026-10-01',
      countsReceivedNow: true,
      nextSubscriptionOn: '2026-11-01',
      countsReceivedFromNext: true,
      history: [],
    }),
  },
]

function problem(type) {
  return {
    type: `https://api.fawtir.om/problems/${type}`,
    title: type,
    status: 409,
    detail: 'Mock refusal.',
  }
}
