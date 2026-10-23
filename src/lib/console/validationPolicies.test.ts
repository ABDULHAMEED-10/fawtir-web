import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { formatUtcMoment } from './format'
import { describeParticipantFailure, isPolicyNotActive } from './pidSubmission'
import { problemReference } from './problemReference'
import {
  EMPTY_PID_FORM,
  FORWARD_TRANSITIONS,
  POLICY_CONSOLE_PERMISSION,
  POLICY_TRANSITIONS,
  TRAIL_STEPS,
  TRANSITION_REASON_CODES,
  activate,
  approve,
  createDraft,
  currentPolicyPath,
  dataEntries,
  dayToInstant,
  describeDraftFailure,
  describePolicyFailure,
  fixturesFromText,
  fixturesToText,
  instantToDay,
  isBlockerType,
  isVersionId,
  needsMyAction,
  newerVersion,
  pidDataToForm,
  pidFormFromDraft,
  pidFormFromVersion,
  pidFormToData,
  pidFormToDraft,
  pidPolicySummary,
  policyFailure,
  policyRoute,
  policyTrail,
  queueLabel,
  queueLabelKey,
  reject,
  separationNote,
  startReview,
  submit,
  updateDraft,
  validatePidForm,
  versionPath,
  versionsPath,
  withdraw,
  type ActionDecision,
  type AllowedActions,
  type BlockerStatus,
  type BlockerVersionView,
  type DenialReason,
  type ForceState,
  type PidPolicyForm,
} from './validationPolicies'

const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const allow: ActionDecision = { allowed: true, reason: null }
const deny = (reason: DenialReason): ActionDecision => ({ allowed: false, reason })
const actions = (overrides: Partial<AllowedActions> = {}): AllowedActions => ({
  editDraft: deny('INVALID_STATE'),
  submit: deny('INVALID_STATE'),
  review: deny('INVALID_STATE'),
  approve: deny('INVALID_STATE'),
  activate: deny('INVALID_STATE'),
  reject: deny('INVALID_STATE'),
  withdraw: deny('INVALID_STATE'),
  ...overrides,
})

const DATA = {
  participantIdentifierScheme: '0248',
  valueSource: 'TENANT_VATIN',
  vatinRelationship: 'MUST_MATCH',
  normalization: 'TRIM_UPPERCASE',
  validationPattern: '^OM(11|12)\\d{8}$',
  minimumLength: 12,
  maximumLength: 12,
  caseSensitive: false,
  canonicalRepresentation: 'UPPERCASE',
  uniquenessRule: 'GLOBAL',
  positiveFixtures: ['OM1100000001', 'OM1200000009'],
  negativeFixtures: ['om11', ' OM11 '],
}

const version = (overrides: Partial<BlockerVersionView> = {}): BlockerVersionView => ({
  id: VERSION_ID,
  blockerId: 'b-1',
  type: 'TAXPAYER_PID_CONTRACT',
  versionNumber: 3,
  status: 'DRAFT',
  forceState: null,
  data: DATA,
  contentHash: 'a'.repeat(64),
  evidenceReference: 'https://evidence.example.test/pid/3',
  testOnly: false,
  effectiveFrom: '2026-11-01T00:00:00Z',
  effectiveTo: null,
  reasonCode: null,
  createdBy: 'u-author',
  submittedBy: null,
  reviewedBy: null,
  rejectedBy: null,
  approvedBy: null,
  activatedBy: null,
  endedBy: null,
  createdAt: '2026-10-01T08:00:00Z',
  submittedAt: null,
  reviewedAt: null,
  rejectedAt: null,
  approvedAt: null,
  activatedAt: null,
  endedAt: null,
  updatedAt: '2026-10-01T08:00:00Z',
  optimisticLockVersion: 4,
  actors: {
    createdBy: { id: 'u-author', displayName: 'Aisha Author' },
    submittedBy: null,
    reviewedBy: null,
    rejectedBy: null,
    approvedBy: null,
    activatedBy: null,
    endedBy: null,
  },
  allowedActions: actions(),
  ...overrides,
})

const FORM: PidPolicyForm = {
  participantIdentifierScheme: ' 0248 ',
  valueSource: ' TENANT_VATIN ',
  vatinRelationship: 'MUST_MATCH',
  normalization: 'TRIM_UPPERCASE',
  validationPattern: '^OM(11|12)\\d{8}$',
  allowedCharactersPattern: '',
  minimumLength: '12',
  maximumLength: ' 12 ',
  caseSensitive: 'no',
  canonicalRepresentation: 'UPPERCASE',
  uniquenessRule: 'GLOBAL',
  positiveFixtures: 'OM1100000001\r\nOM1200000009\n',
  negativeFixtures: 'om11\n\n OM11 ',
  evidenceReference: ' https://evidence.example.test/pid/3 ',
  effectiveFrom: '2026-11-01',
  effectiveTo: '',
}

const problem = (status: number, code?: string, problemType = 'resource-conflict') =>
  new ApiError({ status, problemType, code, correlationId: 'corr-123' })

describe('paths and guards', () => {
  it('gates the screen on platform.support and builds the contract paths', () => {
    expect(POLICY_CONSOLE_PERMISSION).toBe('platform.support')
    expect(versionsPath('TAXPAYER_PID_CONTRACT')).toBe(
      '/v1/platform/peppol/smp/data-blockers/TAXPAYER_PID_CONTRACT/versions?page=0&size=20',
    )
    expect(versionPath('FAWTARA_POLICY', VERSION_ID)).toBe(
      `/v1/platform/peppol/smp/data-blockers/FAWTARA_POLICY/versions/${VERSION_ID}`,
    )
    expect(currentPolicyPath('TAXPAYER_PID_CONTRACT')).toBe(
      '/v1/platform/peppol/smp/data-blockers/TAXPAYER_PID_CONTRACT/current',
    )
    expect(policyRoute('TAXPAYER_PID_CONTRACT')).toBe('/console/policies/TAXPAYER_PID_CONTRACT')
    expect(policyRoute('TAXPAYER_PID_CONTRACT', VERSION_ID)).toBe(
      `/console/policies/TAXPAYER_PID_CONTRACT?version=${VERSION_ID}`,
    )
  })

  it('recognises only the eight policy types and only a well-formed version id', () => {
    expect(isBlockerType('OMAN_STAGING_ACCEPTANCE')).toBe(true)
    expect(isBlockerType('taxpayer_pid_contract')).toBe(false)
    expect(isBlockerType(undefined)).toBe(false)
    expect(isVersionId(VERSION_ID)).toBe(true)
    expect(isVersionId('3')).toBe(false)
    expect(isVersionId(null)).toBe(false)
  })
})

describe('lifecycle requests', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    document.cookie = 'FAWTIR_CSRF=csrf-token-value; path=/'
    fetchMock = vi.fn(async () => new Response(JSON.stringify(version()), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it('records each step with its fixed reason code', () => {
    expect(TRANSITION_REASON_CODES).toEqual({
      submit: 'POLICY_SUBMITTED',
      review: 'POLICY_REVIEW_STARTED',
      approve: 'POLICY_APPROVED',
      activate: 'POLICY_ACTIVATED',
      reject: 'POLICY_REJECTED',
      withdraw: 'POLICY_SCHEDULE_WITHDRAWN',
    })
  })

  it.each([
    ['submit', submit, 'POLICY_SUBMITTED'],
    ['review', startReview, 'POLICY_REVIEW_STARTED'],
    ['approve', approve, 'POLICY_APPROVED'],
    ['activate', activate, 'POLICY_ACTIVATED'],
    ['reject', reject, 'POLICY_REJECTED'],
    // Withdrawing is the backend's revoke endpoint.
    ['revoke', withdraw, 'POLICY_SCHEDULE_WITHDRAWN'],
  ] as const)(
    'sends %s as one POST carrying only the lock version and the fixed code',
    async (segment, send, code) => {
      // A whole view is handed in, as the screen does; only its id and lock version may travel.
      await send('TAXPAYER_PID_CONTRACT', version())

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        `/api/v1/platform/peppol/smp/data-blockers/TAXPAYER_PID_CONTRACT/versions/${VERSION_ID}/${segment}`,
      )
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        expectedOptimisticLockVersion: 4,
        reasonCode: code,
      })
      expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token-value')
      expect(new Headers(init.headers).has('Idempotency-Key')).toBe(false)
    },
  )

  it('creates a draft with exactly the contract body, and never as test-only', async () => {
    await createDraft('TAXPAYER_PID_CONTRACT', pidFormToDraft(FORM))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/platform/peppol/smp/data-blockers/TAXPAYER_PID_CONTRACT/versions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      data: { ...DATA },
      evidenceReference: 'https://evidence.example.test/pid/3',
      testOnly: false,
      effectiveFrom: '2026-11-01T00:00:00Z',
      effectiveTo: null,
    })
  })

  it('updates a draft with the lock version the server last returned', async () => {
    await updateDraft(
      'TAXPAYER_PID_CONTRACT',
      version({ optimisticLockVersion: 9 }),
      pidFormToDraft(FORM),
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `/api/v1/platform/peppol/smp/data-blockers/TAXPAYER_PID_CONTRACT/versions/${VERSION_ID}`,
    )
    expect(init.method).toBe('PUT')
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual(
      [
        'data',
        'effectiveFrom',
        'effectiveTo',
        'evidenceReference',
        'expectedOptimisticLockVersion',
        'testOnly',
      ].sort(),
    )
    expect(JSON.parse(init.body as string)).toMatchObject({
      expectedOptimisticLockVersion: 9,
      testOnly: false,
    })
  })
})

describe('Participant ID policy form', () => {
  it('builds data with exactly the contract keys, leaving the optional pattern out when empty', () => {
    const data = pidFormToData(FORM)

    expect(data).toEqual(DATA)
    expect(Object.keys(data)).not.toContain('allowedCharactersPattern')
    expect(pidFormToData({ ...FORM, allowedCharactersPattern: '   ' })).not.toHaveProperty(
      'allowedCharactersPattern',
    )
    expect(pidFormToData({ ...FORM, allowedCharactersPattern: '[A-Z0-9]+' })).toMatchObject({
      allowedCharactersPattern: '[A-Z0-9]+',
    })
    expect(pidFormToData({ ...FORM, caseSensitive: 'yes' }).caseSensitive).toBe(true)
  })

  it('keeps a pattern and a fixture exactly as typed, and drops only empty lines', () => {
    expect(pidFormToData({ ...FORM, validationPattern: ' ^A $ ' }).validationPattern).toBe(' ^A $ ')
    expect(fixturesFromText('a\r\n\n b \n')).toEqual(['a', ' b '])
    expect(fixturesToText(['a', ' b '])).toBe('a\n b ')
    expect(fixturesToText(['a', 7, null])).toBe('a')
    expect(fixturesToText('a')).toBe('')
  })

  it('reads stored data back into the form it was built from', () => {
    expect(pidDataToForm(DATA)).toEqual({
      participantIdentifierScheme: '0248',
      valueSource: 'TENANT_VATIN',
      vatinRelationship: 'MUST_MATCH',
      normalization: 'TRIM_UPPERCASE',
      validationPattern: '^OM(11|12)\\d{8}$',
      allowedCharactersPattern: '',
      minimumLength: '12',
      maximumLength: '12',
      caseSensitive: 'no',
      canonicalRepresentation: 'UPPERCASE',
      uniquenessRule: 'GLOBAL',
      positiveFixtures: 'OM1100000001\nOM1200000009',
      negativeFixtures: 'om11\n OM11 ',
    })
    expect(pidFormToData({ ...EMPTY_PID_FORM, ...pidDataToForm(DATA) })).toEqual(DATA)
  })

  it('turns data it cannot read into empty fields, never a guess or an exception', () => {
    const form = pidDataToForm({
      participantIdentifierScheme: 248,
      vatinRelationship: 'SOMETHING_NEW',
      normalization: null,
      caseSensitive: 'false',
      minimumLength: '12',
      positiveFixtures: 'OM11',
      negativeFixtures: [1, 'x'],
    })

    expect(form).toMatchObject({
      participantIdentifierScheme: '248',
      vatinRelationship: '',
      normalization: '',
      caseSensitive: '',
      minimumLength: '12',
      valueSource: '',
      positiveFixtures: '',
      negativeFixtures: 'x',
    })
    // The read-only card still shows what is stored, even where the form has no choice for it.
    expect(pidPolicySummary({ vatinRelationship: 'SOMETHING_NEW' }).vatinRelationship).toBe(
      'SOMETHING_NEW',
    )
    expect(pidPolicySummary({}).caseSensitive).toBeNull()
  })

  it('prefills a draft in full, and a new draft with the contents only', () => {
    const draft = version({ effectiveTo: '2027-01-01T00:00:00Z' })

    expect(pidFormFromDraft(draft)).toMatchObject({
      evidenceReference: 'https://evidence.example.test/pid/3',
      effectiveFrom: '2026-11-01',
      effectiveTo: '2027-01-01',
      uniquenessRule: 'GLOBAL',
    })
    expect(pidFormFromVersion(draft)).toMatchObject({
      evidenceReference: '',
      effectiveFrom: '',
      effectiveTo: '',
      uniquenessRule: 'GLOBAL',
    })
  })

  it('sends a day as midnight UTC of that day', () => {
    expect(dayToInstant('2026-11-01')).toBe('2026-11-01T00:00:00Z')
    expect(dayToInstant('')).toBeNull()
    expect(dayToInstant('01/11/2026')).toBeNull()
    expect(instantToDay('2026-11-01T00:00:00Z')).toBe('2026-11-01')
    expect(instantToDay(null)).toBe('')
    expect(instantToDay('not a date')).toBe('')
    expect(
      pidFormToDraft({ ...FORM, evidenceReference: '  ', effectiveTo: '2026-12-01' }),
    ).toMatchObject({
      evidenceReference: null,
      effectiveTo: '2026-12-01T00:00:00Z',
    })
  })
})

describe('validatePidForm', () => {
  const errorsOf = (overrides: Partial<PidPolicyForm>) => validatePidForm({ ...FORM, ...overrides })
  const clean = (errors: Record<string, string | undefined>) =>
    Object.values(errors).every((error) => !error)

  it('passes a complete form', () => {
    expect(clean(validatePidForm(FORM))).toBe(true)
  })

  it('requires every field the contract requires, with no default standing in', () => {
    const errors = validatePidForm(EMPTY_PID_FORM)

    for (const field of [
      'participantIdentifierScheme',
      'valueSource',
      'vatinRelationship',
      'normalization',
      'validationPattern',
      'minimumLength',
      'maximumLength',
      'caseSensitive',
      'canonicalRepresentation',
      'uniquenessRule',
      'effectiveFrom',
    ] as const) {
      expect(errors[field], field).toBe('validation.required')
    }
    expect(errors.positiveFixtures).toBe('console.policies.validation.fixtures')
    expect(errors.negativeFixtures).toBe('console.policies.validation.fixtures')
    expect(errors.allowedCharactersPattern).toBeUndefined()
    expect(errors.evidenceReference).toBeUndefined()
    expect(errors.effectiveTo).toBeUndefined()
  })

  it('checks the scheme, the lengths, the evidence and the effective window', () => {
    expect(errorsOf({ participantIdentifierScheme: 'a' }).participantIdentifierScheme).toBe(
      'console.policies.validation.scheme',
    )
    expect(errorsOf({ participantIdentifierScheme: 'iso 6523' }).participantIdentifierScheme).toBe(
      'console.policies.validation.scheme',
    )
    expect(errorsOf({ minimumLength: '0' }).minimumLength).toBe(
      'console.policies.validation.length',
    )
    expect(errorsOf({ minimumLength: '1.5' }).minimumLength).toBe(
      'console.policies.validation.length',
    )
    expect(errorsOf({ maximumLength: '301' }).maximumLength).toBe(
      'console.policies.validation.length',
    )
    expect(errorsOf({ minimumLength: '13', maximumLength: '12' }).maximumLength).toBe(
      'console.policies.validation.maximumBelowMinimum',
    )
    expect(clean(errorsOf({ minimumLength: '1', maximumLength: '300' }))).toBe(true)
    expect(errorsOf({ evidenceReference: 'x'.repeat(501) }).evidenceReference).toBe(
      'console.policies.validation.evidence',
    )
    expect(errorsOf({ effectiveTo: '2026-11-01' }).effectiveTo).toBe(
      'console.policies.validation.effectiveTo',
    )
    expect(errorsOf({ effectiveTo: '2026-11-02' }).effectiveTo).toBeUndefined()
  })

  // E7 (22 Oct E2E): the server's URI check (SmpBlockerPolicyEngine.validateEvidenceReference)
  // refused these with a bare 400 the screen could only call "contents not accepted".
  it('refuses an evidence reference the server cannot read as a URI, naming the field', () => {
    for (const refused of [
      'Policy review 22 Oct',
      'SUP-1200\u00a0x',
      'https://tickets.example.om/a b',
      'https://tickets.example.om/<1200>',
      'ref"1200"',
      'a\\b',
      'x{1}',
      'a|b',
      'a^b',
      'a`b',
      'line\tbreak',
    ]) {
      expect(errorsOf({ evidenceReference: refused }).evidenceReference).toBe(
        'console.policies.validation.evidenceFormat',
      )
    }
  })

  it('refuses a user name or password in an evidence link', () => {
    for (const refused of ['https://ops:secret@tickets.example.om/SUP-1200', '//ops@tickets.example.om/x']) {
      expect(errorsOf({ evidenceReference: refused }).evidenceReference).toBe(
        'console.policies.validation.evidenceCredentials',
      )
    }
  })

  it('lets through every evidence reference the server accepts as a URI', () => {
    for (const accepted of [
      '',
      'SUP-1200',
      'OKOK',
      'https://tickets.example.om/SUP-1200',
      'evidence://drive/pid/2026-10-22',
      'urn:fawtir:evidence:42',
      'mailto:ops@fawtir.om',
      'policy/review-2026-10-22?ticket=SUP-1200#notes',
      '  SUP-1200  ',
      'مرجع-1200',
    ]) {
      expect(errorsOf({ evidenceReference: accepted }).evidenceReference).toBeUndefined()
    }
  })

  it('does not judge a pattern by JavaScript’s dialect', () => {
    // Valid in Java, a syntax error in JavaScript: the server is the judge.
    expect(errorsOf({ validationPattern: '^\\p{Alnum}++$' }).validationPattern).toBeUndefined()
  })
})

describe('work queue', () => {
  const at = (
    status: BlockerStatus,
    allowedActions: AllowedActions = actions(),
    forceState: ForceState | null = null,
  ) => ({ status, allowedActions, forceState })

  it.each([
    ['DRAFT', actions({ submit: allow }), 'draft', true],
    ['DRAFT', actions({ submit: deny('MISSING_PERMISSION') }), 'draft', false],
    ['SUBMITTED', actions({ review: allow }), 'submitted', true],
    ['SUBMITTED', actions({ review: deny('MISSING_PERMISSION') }), 'submitted', false],
    ['PENDING_REVIEW', actions({ approve: allow }), 'pendingYourApproval', true],
    [
      'PENDING_REVIEW',
      actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED') }),
      'awaitingIndependentApproval',
      false,
    ],
    ['PENDING_REVIEW', actions({ approve: deny('MISSING_PERMISSION') }), 'pendingReview', false],
    ['APPROVED', actions({ activate: allow }), 'approvedYourActivation', true],
    [
      'APPROVED',
      actions({ activate: deny('APPROVER_CANNOT_ACTIVATE') }),
      'approvedOtherOperator',
      false,
    ],
    [
      'APPROVED',
      actions({ activate: deny('ACTIVATION_PRECONDITION_FAILED') }),
      'approvedBlocked',
      false,
    ],
    [
      'APPROVED',
      actions({ activate: deny('SCHEDULED_REPLACEMENT_PENDING') }),
      'approvedScheduledPending',
      false,
    ],
    ['APPROVED', actions({ activate: deny('MISSING_PERMISSION') }), 'approved', false],
    ['REJECTED', actions(), 'rejected', false],
    ['EXPIRED', actions(), 'expired', false],
    ['REVOKED', actions(), 'revoked', false],
    ['SUPERSEDED', actions(), 'superseded', false],
  ] as const)(
    '%s with %j reads as "%s" (needs my action: %s)',
    (status, allowedActions, label, mine) => {
      expect(queueLabel(at(status, allowedActions))).toBe(label)
      expect(queueLabelKey(at(status, allowedActions))).toBe(`console.policies.queue.${label}`)
      expect(needsMyAction(allowedActions)).toBe(mine)
    },
  )

  it.each([
    ['ACTIVE', 'IN_FORCE', 'inForce'],
    ['NOT_APPLICABLE', 'IN_FORCE', 'inForce'],
    ['SCHEDULED', 'IN_FORCE', 'inForce'],
    ['ACTIVE', 'NOT_YET_EFFECTIVE', 'activeNotYetEffective'],
    ['NOT_APPLICABLE', 'NOT_YET_EFFECTIVE', 'activeNotYetEffective'],
    ['SCHEDULED', 'NOT_YET_EFFECTIVE', 'scheduled'],
    ['ACTIVE', 'ENDED', 'activeWindowEnded'],
    ['SCHEDULED', 'ENDED', 'activeWindowEnded'],
    ['ACTIVE', 'REPLACED', 'replaced'],
    ['NOT_APPLICABLE', 'REPLACED', 'replaced'],
    ['ACTIVE', null, 'activated'],
    ['SCHEDULED', null, 'activated'],
  ] as const)('a live %s version with forceState %s reads as "%s"', (status, forceState, label) => {
    expect(queueLabel(at(status, actions(), forceState))).toBe(label)
    expect(queueLabelKey(at(status, actions(), forceState))).toBe(`console.policies.queue.${label}`)
  })

  it('takes in-force-ness from the server alone, whatever the browser clock says', () => {
    // Dates that would read as in force by the clock, and a clock moved far either way: the label
    // follows forceState only.
    const replaced = {
      ...at('ACTIVE', actions(), 'REPLACED'),
      effectiveFrom: '2020-01-01T00:00:00Z',
      effectiveTo: null,
    }
    const scheduled = {
      ...at('SCHEDULED', actions(), 'NOT_YET_EFFECTIVE'),
      effectiveFrom: '2020-01-01T00:00:00Z',
      effectiveTo: null,
    }
    vi.useFakeTimers()
    try {
      for (const clock of [
        '2026-10-02T19:30:00Z',
        '1999-01-01T00:00:00Z',
        '2999-01-01T00:00:00Z',
      ]) {
        vi.setSystemTime(new Date(clock))
        expect(queueLabel(replaced)).toBe('replaced')
        expect(queueLabel(scheduled)).toBe('scheduled')
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not count editing a draft as a step waiting for the reader', () => {
    expect(needsMyAction(actions({ editDraft: allow }))).toBe(false)
  })

  it('does not count being allowed to reject as a step waiting for the reader', () => {
    expect(needsMyAction(actions({ reject: allow }))).toBe(false)
    // An author who may reject their own version under review but not approve it.
    expect(
      needsMyAction(actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED'), reject: allow })),
    ).toBe(false)
    // Reject beside a step that is waiting does not hide that step either.
    expect(needsMyAction(actions({ approve: allow, reject: allow }))).toBe(true)
    expect(POLICY_TRANSITIONS).toContain('reject')
    expect(FORWARD_TRANSITIONS).toEqual(['submit', 'review', 'approve', 'activate'])
  })

  it('does not count being allowed to withdraw a schedule as a step waiting for the reader', () => {
    expect(needsMyAction(actions({ withdraw: allow }))).toBe(false)
    expect(POLICY_TRANSITIONS).toContain('withdraw')
    expect(
      queueLabel({
        status: 'SCHEDULED',
        forceState: 'NOT_YET_EFFECTIVE',
        allowedActions: actions({ withdraw: allow }),
      }),
    ).toBe('scheduled')
    expect(queueLabel({ status: 'REVOKED', forceState: null, allowedActions: actions() })).toBe(
      'revoked',
    )
  })

  it('reads a version under review the same whether or not the reader may reject it', () => {
    const both = actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED'), reject: allow })
    expect(queueLabel(at('PENDING_REVIEW', both))).toBe('awaitingIndependentApproval')
    expect(separationNote(at('PENDING_REVIEW', both))).toBe('approve')
    expect(queueLabel(at('PENDING_REVIEW', actions({ approve: allow, reject: allow })))).toBe(
      'pendingYourApproval',
    )
  })

  it('explains the separation of duties only where the server gave it as the reason', () => {
    expect(
      separationNote(at('PENDING_REVIEW', actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED') }))),
    ).toBe('approve')
    expect(
      separationNote(at('APPROVED', actions({ activate: deny('APPROVER_CANNOT_ACTIVATE') }))),
    ).toBe('activate')
    expect(
      separationNote(at('PENDING_REVIEW', actions({ approve: deny('MISSING_PERMISSION') }))),
    ).toBeNull()
    expect(separationNote(at('APPROVED', actions({ activate: allow })))).toBeNull()
    // A stale reason on a version that has moved on explains nothing.
    expect(
      separationNote(at('ACTIVE', actions({ approve: deny('SELF_APPROVAL_NOT_ALLOWED') }))),
    ).toBeNull()
  })
})

describe('version helpers', () => {
  it('lists only the steps a version has been through, in order', () => {
    const approved = version({
      status: 'APPROVED',
      submittedAt: '2026-10-02T08:00:00Z',
      reviewedAt: '2026-10-03T08:00:00Z',
      approvedAt: '2026-10-04T08:00:00Z',
      actors: {
        createdBy: { id: 'u-author', displayName: 'Aisha Author' },
        submittedBy: { id: 'u-author', displayName: 'Aisha Author' },
        reviewedBy: { id: 'u-reviewer', displayName: null },
        rejectedBy: null,
        approvedBy: { id: 'u-approver', displayName: 'Bilal Approver' },
        activatedBy: null,
        endedBy: null,
      },
    })

    expect(policyTrail(approved).map((entry) => entry.step)).toEqual([
      'created',
      'submitted',
      'reviewed',
      'approved',
    ])
    expect(policyTrail(approved)[2].actor).toEqual({ id: 'u-reviewer', displayName: null })
  })

  it('names the end of a revoked version as revoked, and of any other as ended', () => {
    const ender = { id: 'u-activator', displayName: 'Hamad Activator' }
    const ended = {
      approvedAt: '2026-10-04T08:00:00Z',
      activatedAt: '2026-10-05T08:00:00Z',
      endedBy: ender.id,
      endedAt: '2026-10-06T08:00:00Z',
      actors: { ...version().actors, endedBy: ender },
    }

    expect(policyTrail(version({ status: 'REVOKED', ...ended })).slice(-1)).toEqual([
      { step: 'revoked', actor: ender, at: '2026-10-06T08:00:00Z' },
    ])
    expect(policyTrail(version({ status: 'SUPERSEDED', ...ended })).slice(-1)).toEqual([
      { step: 'ended', actor: ender, at: '2026-10-06T08:00:00Z' },
    ])
  })

  it('lists a rejection after the review, with the rejecter apart from the reviewer', () => {
    const rejected = version({
      status: 'REJECTED',
      submittedAt: '2026-10-02T08:00:00Z',
      reviewedBy: 'u-reviewer',
      reviewedAt: '2026-10-03T08:00:00Z',
      rejectedBy: 'u-author',
      rejectedAt: '2026-10-04T08:00:00Z',
      actors: {
        createdBy: { id: 'u-author', displayName: 'Aisha Author' },
        submittedBy: { id: 'u-author', displayName: 'Aisha Author' },
        reviewedBy: { id: 'u-reviewer', displayName: 'Rashid Reviewer' },
        rejectedBy: { id: 'u-author', displayName: 'Aisha Author' },
        approvedBy: null,
        activatedBy: null,
        endedBy: null,
      },
    })

    expect(TRAIL_STEPS).toEqual([
      'created',
      'submitted',
      'reviewed',
      'rejected',
      'approved',
      'activated',
      'ended',
      'revoked',
    ])
    expect(policyTrail(rejected).map((entry) => entry.step)).toEqual([
      'created',
      'submitted',
      'reviewed',
      'rejected',
    ])
    expect(policyTrail(rejected)[2]).toEqual({
      step: 'reviewed',
      actor: { id: 'u-reviewer', displayName: 'Rashid Reviewer' },
      at: '2026-10-03T08:00:00Z',
    })
    expect(policyTrail(rejected)[3]).toEqual({
      step: 'rejected',
      actor: { id: 'u-author', displayName: 'Aisha Author' },
      at: '2026-10-04T08:00:00Z',
    })
    // A version that was never rejected has no such entry.
    expect(policyTrail(version()).map((entry) => entry.step)).toEqual(['created'])
  })

  it('prefers a write’s answer only while it is newer than what was read', () => {
    const read = version({ optimisticLockVersion: 4 })
    const answered = version({ optimisticLockVersion: 5, status: 'SUBMITTED' })

    expect(newerVersion(read, answered)).toBe(answered)
    expect(newerVersion(answered, read)).toBe(answered)
    expect(newerVersion(read, version({ optimisticLockVersion: 4, status: 'SUBMITTED' }))).toBe(
      read,
    )
    expect(newerVersion(read, version({ id: 'other', optimisticLockVersion: 9 }))).toBe(read)
    expect(newerVersion(null, answered)).toBe(answered)
    expect(newerVersion(read, null)).toBe(read)
    expect(newerVersion(null, null)).toBeNull()
  })

  it('prints unknown contents as they are stored, structured values as JSON', () => {
    expect(
      dataEntries({
        name: 'OTA',
        retries: 3,
        enabled: false,
        hosts: ['a', 'b'],
        window: { days: 7 },
        note: null,
      }),
    ).toEqual([
      { key: 'name', kind: 'text', text: 'OTA', flag: false },
      { key: 'retries', kind: 'text', text: '3', flag: false },
      { key: 'enabled', kind: 'boolean', text: '', flag: false },
      { key: 'hosts', kind: 'json', text: '["a","b"]', flag: false },
      { key: 'window', kind: 'json', text: '{"days":7}', flag: false },
      { key: 'note', kind: 'empty', text: '', flag: false },
    ])
  })
})

describe('describePolicyFailure', () => {
  it.each([
    [problem(403, undefined, 'insufficient-permission'), 'console.policies.error.forbidden'],
    [problem(404, undefined, 'resource-not-found'), 'console.policies.error.notFound'],
    [problem(409, 'STALE_VERSION'), 'console.policies.error.changed'],
    [problem(409, 'INVALID_STATE'), 'console.policies.error.changed'],
    [problem(409, 'SELF_APPROVAL_NOT_ALLOWED'), 'console.policies.separation.approve'],
    [problem(409, 'APPROVER_CANNOT_ACTIVATE'), 'console.policies.separation.activate'],
    [problem(409, 'CONCURRENT_DRAFT'), 'console.policies.error.concurrentDraft'],
    [
      problem(409, 'SCHEDULED_REPLACEMENT_PENDING'),
      'console.policies.error.scheduledReplacementPending',
    ],
    [problem(409), 'console.policies.error.conflict'],
    [problem(409, 'SOMETHING_NEW'), 'console.policies.error.conflict'],
    [
      problem(400, 'ACTIVATION_PRECONDITION_FAILED', 'validation-failed'),
      'console.policies.error.activationPrecondition',
    ],
    [problem(400, undefined, 'validation-failed'), 'console.policies.error.rejectedContent'],
    [problem(400, undefined, 'malformed-request'), 'console.policies.error.rejectedContent'],
    [problem(500, undefined, 'internal-error'), 'identityErrors.service'],
    [problem(429, undefined, 'rate-limited'), 'identityErrors.rateLimited'],
    [new NetworkError('offline'), 'identityErrors.network'],
    [new NetworkError('timeout'), 'identityErrors.timeout'],
    [new Error('boom'), 'identityErrors.unexpected'],
  ])('maps %o to %s', (error, key) => {
    expect(describePolicyFailure(error).key).toBe(key)
  })

  it('reads the code, never the prose', () => {
    const misleading = new ApiError({
      status: 409,
      problemType: 'resource-conflict',
      code: 'STALE_VERSION',
      problem: { detail: 'SELF_APPROVAL_NOT_ALLOWED: approver cannot activate' },
    })

    expect(describePolicyFailure(misleading).key).toBe('console.policies.error.changed')
    // A code on the wrong status is not that refusal.
    expect(describePolicyFailure(problem(400, 'STALE_VERSION', 'validation-failed')).key).toBe(
      'console.policies.error.rejectedContent',
    )
  })

  it('carries the correlation id, and reloads only when the version moved or is gone', () => {
    expect(policyFailure(problem(409, 'STALE_VERSION'))).toEqual({
      message: { key: 'console.policies.error.changed' },
      reference: 'corr-123',
      reload: true,
    })
    expect(policyFailure(problem(404, undefined, 'resource-not-found')).reload).toBe(true)
    expect(policyFailure(problem(403, undefined, 'insufficient-permission')).reload).toBe(false)
    expect(
      policyFailure(problem(400, 'ACTIVATION_PRECONDITION_FAILED', 'validation-failed')).reload,
    ).toBe(false)
    expect(policyFailure(new NetworkError('offline'))).toMatchObject({
      reference: null,
      reload: false,
    })
    expect(problemReference(new Error('boom'))).toBeNull()
  })

  it('marks the fields a refused draft names, and otherwise reports at form level', () => {
    const named = new ApiError({
      status: 400,
      problemType: 'validation-failed',
      fieldErrors: [
        { field: 'data.validationPattern', message: 'Server prose.' },
        { field: 'effectiveTo', message: 'Server prose.' },
      ],
    })
    expect(describeDraftFailure(named)).toEqual({
      fieldErrors: {
        validationPattern: 'console.policies.validation.server',
        effectiveTo: 'console.policies.validation.server',
      },
      failure: null,
    })

    const unnamed = new ApiError({
      status: 400,
      problemType: 'validation-failed',
      fieldErrors: [{ field: 'data', message: 'Server prose.' }],
    })
    expect(describeDraftFailure(unnamed).fieldErrors).toEqual({})
    expect(describeDraftFailure(unnamed).failure?.message.key).toBe(
      'console.policies.error.rejectedContent',
    )
    expect(describeDraftFailure(problem(409, 'CONCURRENT_DRAFT')).failure).toMatchObject({
      message: { key: 'console.policies.error.concurrentDraft' },
      reload: true,
    })
  })
})

describe('describeParticipantFailure', () => {
  it.each([
    [
      problem(400, 'PID_POLICY_NOT_ACTIVE', 'validation-failed'),
      'console.verification.participant.policyNotActive',
    ],
    [
      problem(400, 'PID_CANDIDATE_REJECTED', 'validation-failed'),
      'console.verification.participant.candidateRejected',
    ],
    [problem(409, 'PID_ALREADY_VERIFIED'), 'console.verification.participant.alreadyVerified'],
    [
      problem(409, 'SELF_VERIFICATION_NOT_ALLOWED'),
      'console.verification.participant.ownSubmission',
    ],
    [problem(409, 'STALE_VERSION'), 'console.verification.participant.conflict'],
    [problem(409, 'INVALID_STATE'), 'console.verification.participant.conflict'],
    [problem(409), 'console.verification.participant.conflict'],
    [
      problem(403, undefined, 'insufficient-permission'),
      'console.verification.participant.forbidden',
    ],
    [problem(404, undefined, 'resource-not-found'), 'console.verification.detail.notFound'],
    [problem(400, undefined, 'validation-failed'), 'identityErrors.validation'],
    [problem(500, undefined, 'internal-error'), 'identityErrors.service'],
  ])('maps %o to %s', (error, key) => {
    expect(describeParticipantFailure(error).key).toBe(key)
  })

  it('tells a missing policy apart by status and code together', () => {
    expect(isPolicyNotActive(problem(400, 'PID_POLICY_NOT_ACTIVE', 'validation-failed'))).toBe(true)
    expect(isPolicyNotActive(problem(409, 'PID_POLICY_NOT_ACTIVE'))).toBe(false)
    expect(isPolicyNotActive(new NetworkError('offline'))).toBe(false)
  })
})

describe('effective dates', () => {
  it('shows the stored 00:00 UTC instant as that UTC day and hour, labelled, whatever the browser zone', () => {
    // A policy day starts at 00:00 UTC (operator guide). Local formatting would print 04:00 in
    // Muscat and the previous day west of UTC.
    expect(formatUtcMoment('2026-10-25T00:00:00Z', 'en')).toBe('25 Oct 2026, 00:00 UTC')
    expect(formatUtcMoment('2026-10-25T00:00:00Z', 'ar')).toContain('UTC')
  })
})
