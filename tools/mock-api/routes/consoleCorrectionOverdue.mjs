/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * `MOCK_CORRECTION_OVERDUE=1` fills the verification queue with one company sent back for a
 * correction that is now overdue and one still inside its 30 days, and answers the overdue one's
 * detail, history and signup payment (decision D11), and the on-time one's detail, which can be
 * closed before day 30 too (backend #657). Off by default, so the queue other screens expect
 * stays empty.
 */
const OVERDUE = '5b8e2f10-6c3d-4a7e-9f21-0d4c8b7a6e31'
const ON_TIME = '9c1d7e42-3a5b-4f68-8e90-1b2c3d4e5f60'
const BASE = '/api/v1/platform/companies'

const row = (tenantId, name, code, until, overdue) => ({
  tenantId,
  tenantCode: code,
  tenantName: name,
  legalName: `${name} LLC`,
  country: 'OM',
  verificationStatus: 'REJECTED',
  tenantStatus: 'PENDING',
  profileRevision: 2,
  submittedAt: '2026-09-10T05:10:00Z',
  decidedAt: '2026-09-11T06:00:00Z',
  correctableUntil: until,
  correctionOverdue: overdue,
})

const ROWS = [
  row(OVERDUE, 'Al Noor Bakery', 'FT3GDWM54D', '2026-10-10', true),
  row(ON_TIME, 'Sohar Traders', 'FT7KQ2LM9P', '2026-11-14', false),
]

const page = (items) => ({
  items,
  page: 0,
  size: 25,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
})

const DETAIL = {
  ...ROWS[0],
  taxNumber: 'OM1100000001',
  commercialRegistrationNumber: '1234567',
  registeredAddress: 'Building 4, Way 2301, Sohar',
  timezone: 'Asia/Muscat',
  verificationMethod: null,
  rejectionReason: 'REGISTERED_ADDRESS_EVIDENCE_MISSING',
  identityStatus: 'READY',
  expectedRevision: 2,
  submittedBy: 'u-registrant',
  decidedBy: 'u-other',
  attestationReference: null,
  evidenceReference: null,
  evidenceRecorded: false,
  signupAdministrator: { userId: 'u-registrant', signInEnabled: false, emailVerified: true },
  approvalPrerequisitesMissing: null,
  createdAt: '2026-09-10T04:00:00Z',
  updatedAt: '2026-09-11T06:00:00Z',
}

const ON_TIME_DETAIL = {
  ...DETAIL,
  ...ROWS[1],
}

const enabled = process.env.MOCK_CORRECTION_OVERDUE === '1'

export default enabled
  ? [
      {
        match: BASE,
        reply: ({ query }) =>
          page(
            query.get('correctionOverdue') === 'true'
              ? ROWS.filter((r) => r.correctionOverdue)
              : ROWS,
          ),
      },
      { match: `${BASE}/${OVERDUE}`, reply: () => DETAIL },
      { match: `${BASE}/${ON_TIME}`, reply: () => ON_TIME_DETAIL },
      {
        match: `${BASE}/${OVERDUE}/verification-history`,
        reply: () => [
          {
            event: 'PROFILE_SUBMITTED',
            profileRevision: 2,
            verificationStatus: 'PENDING_VERIFICATION',
            verificationMethod: null,
            rejectionReason: null,
            attestationReference: null,
            evidenceReference: null,
            performedBy: 'u-registrant',
            occurredAt: '2026-09-10T05:10:00Z',
          },
          {
            event: 'PROFILE_REJECTED',
            profileRevision: 2,
            verificationStatus: 'REJECTED',
            verificationMethod: null,
            rejectionReason: 'REGISTERED_ADDRESS_EVIDENCE_MISSING',
            attestationReference: null,
            evidenceReference: null,
            performedBy: 'u-other',
            occurredAt: '2026-09-11T06:00:00Z',
          },
        ],
      },
      {
        match: `${BASE}/${OVERDUE}/signup-payment`,
        reply: () => ({
          payment: {
            id: 'pay-1',
            method: 'BANK_TRANSFER',
            status: 'FUNDS_VERIFIED',
            amount: '36.750',
            reference: 'TRF-0001',
            customerNote: null,
            submittedAt: '2026-09-10T05:00:00Z',
            proofContentType: 'application/pdf',
          },
          refundCase: null,
        }),
      },
      {
        match: /^\/api\/v1\/platform\/peppol\/smp\/tenants\/[^/]+\/data-submissions\/current$/,
        reply: () => null,
      },
    ]
  : []
