/**
 * Screenshot and development tooling only. This file is never loaded by the application build:
 * nothing under `src/` imports it, `tsc -b` and `vite build` do not include `tools/`, and the only
 * thing that reads it is `tools/mock-api/server.mjs`, a Node process a developer starts by hand.
 *
 * Validation policies (the console's `/console/policies` screens). Shapes follow
 * `src/lib/console/validationPolicies.ts`. Three of the eight types, chosen so the screens show
 * each state that changes what they draw: a Participant ID policy with a version in force and a
 * newer one waiting for this operator's approval, a policy this operator approved and so may not
 * activate, and a policy with no version at all.
 *
 * The lifecycle endpoints are not mocked: a click on a step answers 404, which the screen reports
 * as it would any refusal. These fixtures exist for screenshots and the responsive harness only.
 *
 * The company's Participant ID standing (Settings > Peppol and tax) is served too, verified under
 * the version in force, because that read is the only call the settings screen makes. Its
 * re-verification request is not mocked, for the same reason as the lifecycle steps.
 */
const BASE = '/api/v1/platform/peppol/smp/data-blockers'

const allow = { allowed: true, reason: null }
const deny = (reason) => ({ allowed: false, reason })
const actions = (overrides = {}) => ({
  editDraft: deny('INVALID_STATE'),
  submit: deny('INVALID_STATE'),
  review: deny('INVALID_STATE'),
  approve: deny('INVALID_STATE'),
  activate: deny('INVALID_STATE'),
  reject: deny('INVALID_STATE'),
  withdraw: deny('INVALID_STATE'),
  ...overrides,
})

const SALIM = { id: '5f0c2b1e-7a44-4c1d-9b55-0d0f6a1c2e31', displayName: 'Salim Al Riyami' }
const MARYAM = { id: '8a91d3f2-0b6e-4f27-a3c8-4f1e9b7d6a02', displayName: 'Maryam Al Balushi' }
const UNNAMED = { id: 'c3d4e5f6-1a2b-4c3d-8e9f-0a1b2c3d4e5f', displayName: null }
// The mock session's own user (`server.mjs`), so its steps read "(you)".
const NASSER = { id: 'u-nasser', displayName: 'Nasser Al Habsi' }

const PID_DATA = {
  participantIdentifierScheme: '0248',
  valueSource: 'TENANT_VAT_NUMBER',
  vatinRelationship: 'MUST_MATCH',
  normalization: 'TRIM_UPPERCASE',
  validationPattern: '^OM(11|12)[0-9]{8}$',
  allowedCharactersPattern: '^[A-Z0-9]+$',
  minimumLength: 12,
  maximumLength: 12,
  caseSensitive: false,
  canonicalRepresentation: 'UPPERCASE_NO_SEPARATORS',
  uniquenessRule: 'UNIQUE_ACROSS_ALL_TENANTS',
  positiveFixtures: ['OM1100112233', 'OM1200445566'],
  negativeFixtures: ['OM1300112233', 'om11-0011-2233', '0248:OM1100112233'],
}

function version(type, number, status, extra = {}) {
  const actors = {
    createdBy: SALIM,
    submittedBy: null,
    reviewedBy: null,
    rejectedBy: null,
    approvedBy: null,
    activatedBy: null,
    endedBy: null,
    ...extra.actors,
  }
  return {
    id: `00000000-0000-4000-8000-0000000000${String(number).padStart(2, '0')}`,
    blockerId: `blocker-${type}`,
    type,
    versionNumber: number,
    status,
    // The server's judgement of in-force-ness; null for every status that is not live.
    forceState: null,
    data: PID_DATA,
    contentHash: '9f2c4e6a8b0d1f3a5c7e9b1d3f5a7c9e0b2d4f6a8c0e1b3d5f7a9c1e3b5d7f90',
    evidenceReference: 'https://evidence.fawtir.example/policies/pid/2026-09',
    testOnly: false,
    effectiveFrom: '2026-10-01T00:00:00Z',
    effectiveTo: null,
    reasonCode: null,
    createdAt: '2026-09-20T07:10:00Z',
    submittedAt: null,
    reviewedAt: null,
    rejectedAt: null,
    approvedAt: null,
    activatedAt: null,
    endedAt: null,
    updatedAt: '2026-09-20T07:10:00Z',
    optimisticLockVersion: 0,
    allowedActions: actions(),
    ...extra,
    actors,
    createdBy: actors.createdBy.id,
    submittedBy: actors.submittedBy?.id ?? null,
    reviewedBy: actors.reviewedBy?.id ?? null,
    rejectedBy: actors.rejectedBy?.id ?? null,
    approvedBy: actors.approvedBy?.id ?? null,
    activatedBy: actors.activatedBy?.id ?? null,
    endedBy: actors.endedBy?.id ?? null,
  }
}

const VERSIONS = {
  TAXPAYER_PID_CONTRACT: [
    version('TAXPAYER_PID_CONTRACT', 3, 'PENDING_REVIEW', {
      reasonCode: 'POLICY_REVIEW_STARTED',
      submittedAt: '2026-09-28T08:00:00Z',
      reviewedAt: '2026-09-29T09:30:00Z',
      updatedAt: '2026-09-29T09:30:00Z',
      effectiveFrom: '2026-11-01T00:00:00Z',
      optimisticLockVersion: 3,
      actors: { submittedBy: SALIM, reviewedBy: UNNAMED },
      // Under review and this operator holds the reviewer permission, so the server would offer
      // both decisions; rejecting has no separation of duties.
      allowedActions: actions({ approve: allow, reject: allow }),
    }),
    version('TAXPAYER_PID_CONTRACT', 2, 'ACTIVE', {
      forceState: 'IN_FORCE',
      reasonCode: 'POLICY_ACTIVATED',
      submittedAt: '2026-09-21T08:00:00Z',
      reviewedAt: '2026-09-22T08:00:00Z',
      approvedAt: '2026-09-23T08:00:00Z',
      activatedAt: '2026-09-24T08:00:00Z',
      updatedAt: '2026-09-24T08:00:00Z',
      optimisticLockVersion: 5,
      actors: { submittedBy: SALIM, reviewedBy: MARYAM, approvedBy: MARYAM, activatedBy: NASSER },
    }),
    version('TAXPAYER_PID_CONTRACT', 1, 'SUPERSEDED', {
      reasonCode: 'POLICY_ACTIVATED',
      endedAt: '2026-09-24T08:00:00Z',
      updatedAt: '2026-09-24T08:00:00Z',
      effectiveTo: '2026-09-24T00:00:00Z',
      optimisticLockVersion: 6,
      actors: { endedBy: NASSER },
    }),
  ],
  FAWTARA_POLICY: [
    version('FAWTARA_POLICY', 1, 'APPROVED', {
      data: {
        environment: 'staging',
        retryLimit: 3,
        signingRequired: true,
        endpoints: ['submit', 'status'],
      },
      reasonCode: 'POLICY_APPROVED',
      approvedAt: '2026-09-30T08:00:00Z',
      updatedAt: '2026-09-30T08:00:00Z',
      optimisticLockVersion: 4,
      actors: { submittedBy: SALIM, reviewedBy: MARYAM, approvedBy: NASSER },
      allowedActions: actions({ activate: deny('APPROVER_CANNOT_ACTIVATE') }),
    }),
  ],
  BUSINESS_CARD_POLICY: [],
}

const summary = (view) =>
  view
    ? {
        id: view.id,
        versionNumber: view.versionNumber,
        status: view.status,
        forceState: view.forceState,
        testOnly: view.testOnly,
        effectiveFrom: view.effectiveFrom,
        effectiveTo: view.effectiveTo,
        updatedAt: view.updatedAt,
        optimisticLockVersion: view.optimisticLockVersion,
        allowedActions: view.allowedActions,
      }
    : null

const OVERVIEW = Object.entries(VERSIONS).map(([type, versions]) => ({
  type,
  canCreateDraft: type === 'TAXPAYER_PID_CONTRACT',
  latest: summary(versions[0]),
  active: summary(versions.find((entry) => entry.forceState === 'IN_FORCE')),
}))

const IN_FORCE_PID = VERSIONS.TAXPAYER_PID_CONTRACT.find((entry) => entry.forceState === 'IN_FORCE')

// Shape of `ParticipantIdStanding` in `src/api/peppol/participantStanding.ts`.
const STANDING = {
  state: 'VERIFIED',
  currentPolicySatisfied: true,
  reverificationRequired: false,
  reverificationAvailable: false,
  policyInForce: { id: IN_FORCE_PID.id, versionNumber: IN_FORCE_PID.versionNumber },
  verification: {
    submissionId: '2d6f1a3b-9c4e-4f7a-8b21-5e0c9d7a1f64',
    submissionVersion: 1,
    participantScheme: '0248',
    participantValue: 'OM1100000001',
    policyVersionId: IN_FORCE_PID.id,
    policyVersionNumber: IN_FORCE_PID.versionNumber,
    verifiedAt: '2026-09-21T08:30:00Z',
  },
}

export default [
  { match: BASE, reply: () => OVERVIEW },
  { match: '/api/v1/peppol/smp/data-submissions/standing', reply: () => STANDING },
  {
    match: /^\/api\/v1\/platform\/peppol\/smp\/data-blockers\/([A-Z_]+)\/versions$/,
    reply: ({ params }) => (VERSIONS[params[0]] ? VERSIONS[params[0]] : { status: 403 }),
  },
  {
    match: /^\/api\/v1\/platform\/peppol\/smp\/data-blockers\/([A-Z_]+)\/versions\/([^/]+)$/,
    reply: ({ params }) => {
      const found = (VERSIONS[params[0]] ?? []).find((entry) => entry.id === params[1])
      return found ?? { status: 404 }
    },
  },
  {
    match: /^\/api\/v1\/platform\/peppol\/smp\/data-blockers\/([A-Z_]+)\/current$/,
    reply: ({ params }) => {
      const found = (VERSIONS[params[0]] ?? []).find((entry) => entry.forceState === 'IN_FORCE')
      return found ?? { status: 404 }
    },
  },
]
