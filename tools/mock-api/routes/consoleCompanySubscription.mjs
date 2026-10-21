/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * One real company on the console's tenant page (`/console/tenants/<uuid>`): its overview, and the
 * subscription (with a cancel-at-once proposal waiting for a second operator), documents and
 * received-document counting cards. Shapes follow
 * `src/lib/console/tenantOverview.ts` and `src/lib/console/companySubscription.ts`. The company is
 * on Enterprise-like terms so the counting card shows too. The writes answer the read back so the
 * dialogs can be clicked through; nothing is kept between requests.
 */
const ID = '7a1c0b52-4f0e-4b8e-9d3a-2f6c1e0a9b11'
const BASE = `/api/v1/platform/companies/${ID}`

const OVERVIEW = {
  identity: {
    tenantId: ID,
    tenantCode: 'FT7A1C0B52',
    tenantName: 'Sur Marine Supplies',
    tenantStatus: 'ACTIVE',
    identityStatus: 'READY',
  },
  company: {
    legalName: 'Sur Marine Supplies LLC',
    legalNameAr: 'صور للتوريدات البحرية ش م م',
    tradingName: 'Sur Marine',
    commercialRegistrationNumber: '1298344',
    taxNumber: 'OM1100274512',
    country: 'OM',
    registeredAddressLine1: 'Way 1204, Al Ayjah',
    registeredAddressLine2: null,
    registeredAddressLine3: null,
    registeredCity: 'Sur',
    registeredPostalCode: '411',
    registeredCountrySubdivision: null,
    registeredPoBox: null,
    timezone: 'Asia/Muscat',
    contactPersonName: 'Aisha Al Araimi',
    contactPhone: '+96899112233',
    contactEmail: 'accounts@surmarine.test',
  },
  verification: {
    status: 'VERIFIED',
    method: 'MANUAL_ATTESTATION',
    rejectionReason: null,
    attestationReference: 'MOCI-2026-1298344',
    evidenceRecorded: true,
    profileRevision: 3,
    submittedAt: '2026-09-02T06:10:00Z',
    submittedBy: 'u-registrant',
    decidedAt: '2026-09-03T09:00:00Z',
    decidedBy: 'u-other',
  },
  subscription: {
    planCode: 'BUSINESS',
    planName: 'Business',
    monthlyPrice: '80.000',
    invoicesPerMonth: 1000,
    overageEnabled: false,
    implicitDefault: false,
    startedOn: '2026-09-10',
    changedAt: '2026-09-10T00:00:00Z',
  },
  operational: { ready: true, reasonCode: null },
}

const SUBSCRIPTION = {
  status: {
    tracked: true,
    access: 'ACTIVE',
    restrictionsEnforced: false,
    today: '2026-10-16',
    planCode: 'BUSINESS',
    planName: 'Business',
    billingCycle: 'MONTHLY',
    periodPrice: '80.000',
    trialStartsOn: '2026-09-10',
    trialEndsOn: '2026-09-23',
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: '2026-11-09',
    renewsOn: '2026-11-10',
    graceDays: 7,
    graceUntil: null,
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: null,
  },
  events: [
    {
      id: 'e-3',
      tenantId: ID,
      kind: 'PAID_PERIOD_EXTENDED',
      details: {},
      reason: null,
      actorId: null,
      occurredAt: '2026-10-09T05:00:00Z',
    },
    {
      id: 'e-2',
      tenantId: ID,
      kind: 'TRIAL_EXTENDED',
      details: {},
      reason: 'Onboarding call moved',
      actorId: 'b7f3e1c2-0d4a-4c55-8e21-6a9f0c3d2e10',
      occurredAt: '2026-09-20T07:30:00Z',
    },
    {
      id: 'e-1',
      tenantId: ID,
      kind: 'TRIAL_STARTED',
      details: {},
      reason: null,
      actorId: null,
      occurredAt: '2026-09-10T04:00:00Z',
    },
  ],
  // Proposed by another operator, so the tenant page shows Confirm and Withdraw (CA-9).
  fawtirCancellation: {
    id: '5d2e9a10-7c3b-4f61-9a0e-1b2c3d4e5f60',
    tenantId: ID,
    tenantName: null,
    status: 'PROPOSED',
    category: 'FRAUD',
    internalReason: 'Card chargebacks traced to invoices issued from this account',
    customerMessage: 'Your account was used to issue invoices for goods that were never supplied.',
    proposedBy: 'b7f3e1c2-0d4a-4c55-8e21-6a9f0c3d2e10',
    proposedByName: 'Nasser Al Hinai',
    proposedAt: '2026-10-16T09:15:00Z',
    confirmedBy: null,
    confirmedByName: null,
    confirmedAt: null,
    effectiveOn: null,
    withdrawnBy: null,
    withdrawnByName: null,
    withdrawnAt: null,
    withdrawalReason: null,
    outcome: { voidedBills: [], refundCases: [] },
  },
  fawtirCancellationEnabled: true,
}

const CANCELLATIONS = `${BASE}/subscription/fawtir-cancellations`
const PROPOSAL = new RegExp(`^${CANCELLATIONS}/([^/]+)/(confirmation|withdrawal)$`)

const EXTRA = {
  tenantId: ID,
  allowance: {
    periodStart: '2026-10-10',
    periodEnd: '2026-11-09',
    resetsOn: '2026-11-10',
    planDocuments: 1000,
    extraDocuments: 150,
    totalAllowance: 1150,
    issued: 612,
    resubmissions: 3,
    received: 88,
    receivedHidden: 0,
    used: 700,
    planUsed: 700,
    extraUsed: 0,
    left: 450,
    warningPercent: null,
    issuingAllowed: true,
    extrasExpireOn: '2026-11-09',
  },
  credits: [
    {
      id: 'c-2',
      source: 'GRANT',
      status: 'ACTIVE',
      documents: 100,
      netAmount: null,
      startsOn: '2026-10-14',
      expiresOn: '2026-11-09',
      reason: 'Platform outage on 13 Oct',
      createdBy: 'b7f3e1c2-0d4a-4c55-8e21-6a9f0c3d2e10',
      createdAt: '2026-10-14T08:00:00Z',
    },
    {
      id: 'c-1',
      source: 'PURCHASE',
      status: 'ACTIVE',
      documents: 50,
      netAmount: '5.000',
      startsOn: '2026-10-12',
      expiresOn: '2026-11-09',
      reason: null,
      createdBy: 'u-customer',
      createdAt: '2026-10-12T06:00:00Z',
    },
  ],
  givenBack: [],
}

/** The give-back picker: issued documents, one already given back (cannot be ticked). */
const ISSUED = [
  {
    id: 'd-3',
    number: 'INV-2026-0412',
    type: 'INVOICE',
    issuedOn: '2026-10-14',
    status: 'ISSUED',
    alreadyGivenBack: false,
  },
  {
    id: 'd-2',
    number: 'INV-2026-0411',
    type: 'INVOICE',
    issuedOn: '2026-10-13',
    status: 'ISSUED',
    alreadyGivenBack: false,
  },
  {
    id: 'd-1',
    number: 'CN-2026-0031',
    type: 'CREDIT_NOTE',
    issuedOn: '2026-10-12',
    status: 'ISSUED',
    alreadyGivenBack: true,
  },
]

const COUNTING = {
  tenantId: ID,
  enterprise: true,
  planCode: 'BUSINESS',
  version: 1,
  monthStartedOn: '2026-10-10',
  countsReceivedNow: true,
  nextSubscriptionOn: '2026-11-10',
  countsReceivedFromNext: false,
  history: [
    {
      id: 'o-1',
      tenantId: ID,
      version: 1,
      countsReceived: false,
      effectiveFrom: '2026-11-10',
      reason: 'Agreed in the contract',
      createdBy: 'b7f3e1c2-0d4a-4c55-8e21-6a9f0c3d2e10',
      createdAt: '2026-10-15T10:00:00Z',
    },
  ],
}

export default [
  { match: `${BASE}/overview`, reply: () => OVERVIEW },
  { match: `${BASE}/subscription`, reply: () => SUBSCRIPTION },
  { method: 'POST', match: `${BASE}/subscription/trial-exception`, reply: () => SUBSCRIPTION },
  { method: 'POST', match: CANCELLATIONS, reply: () => SUBSCRIPTION.fawtirCancellation },
  {
    method: 'POST',
    match: PROPOSAL,
    reply: ({ params }) =>
      params[1] === 'confirmation'
        ? { ...SUBSCRIPTION.fawtirCancellation, status: 'CONFIRMED', effectiveOn: '2026-10-16' }
        : { ...SUBSCRIPTION.fawtirCancellation, status: 'WITHDRAWN' },
  },
  { method: 'PUT', match: `${BASE}/plan`, reply: () => OVERVIEW.subscription },
  { match: `${BASE}/extra-documents`, reply: () => EXTRA },
  { method: 'POST', match: `${BASE}/extra-documents/grants`, reply: () => EXTRA },
  {
    match: `${BASE}/issued-documents`,
    reply: ({ query }) => {
      const part = (query.get('number') ?? '').toLowerCase()
      return ISSUED.filter((row) => row.number.toLowerCase().includes(part))
    },
  },
  {
    method: 'POST',
    match: `${BASE}/extra-documents/give-backs`,
    reply: ({ body }) => {
      const ids = body?.documentIds ?? []
      const credit = {
        id: 'c-3',
        source: 'GIVE_BACK',
        status: 'ACTIVE',
        documents: ids.length,
        netAmount: null,
        startsOn: '2026-10-21',
        expiresOn: '2026-11-09',
        reason: body?.reason ?? null,
        createdBy: 'b7f3e1c2-0d4a-4c55-8e21-6a9f0c3d2e10',
        createdAt: '2026-10-21T09:00:00Z',
      }
      return {
        ...EXTRA,
        allowance: {
          ...EXTRA.allowance,
          extraDocuments: EXTRA.allowance.extraDocuments + ids.length,
          totalAllowance: EXTRA.allowance.totalAllowance + ids.length,
          left: EXTRA.allowance.left + ids.length,
        },
        credits: [credit, ...EXTRA.credits],
        givenBack: ids.map((documentId) => {
          const doc = ISSUED.find((row) => row.id === documentId)
          return {
            creditId: 'c-3',
            documentId,
            createdAt: credit.createdAt,
            documentNumber: doc?.number ?? null,
            issuedOn: doc?.issuedOn ?? null,
          }
        }),
      }
    },
  },
  { match: `${BASE}/received-document-counting`, reply: () => COUNTING },
  { method: 'PUT', match: `${BASE}/received-document-counting`, reply: () => COUNTING },
]
