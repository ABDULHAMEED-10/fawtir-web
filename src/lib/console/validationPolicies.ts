import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import { PLATFORM_SMP_PATH } from './pidSubmission'
import { problemReference } from './problemReference'

/**
 * The platform's validation policies: the versioned "data blockers" of
 * `SmpDataBlockerAdministrationController`. Each type has at most one version in force, and a new
 * one reaches that state only through draft, submission, review, approval and activation, with the
 * approver and the activator each required to be someone who did not take the earlier steps.
 *
 * The page gate is this one permission. Whether the reader may read a given type, and which step
 * they may take on a given version, is decided by the server alone and arrives as
 * `allowedActions`; nothing here recomputes it from user ids or roles.
 */
export const POLICY_CONSOLE_PERMISSION = 'platform.support'
export const POLICIES_ROUTE = '/console/policies'
export const BLOCKERS_PATH = `${PLATFORM_SMP_PATH}/data-blockers`

/** The backend accepts 1..100 and returns no total, so this screen reads one page of the newest. */
export const VERSION_PAGE_SIZE = 20

export const BLOCKER_TYPES = [
  'TAXPAYER_PID_CONTRACT',
  'FAWTARA_POLICY',
  'BUSINESS_CARD_POLICY',
  'MTLS_PKI_READINESS',
  'AP_PROFILE_PROVISIONING',
  'LEGAL_OSS_APPROVAL',
  'EVENT_CONSUMER_ACCEPTANCE',
  'OMAN_STAGING_ACCEPTANCE',
] as const
export type BlockerType = (typeof BLOCKER_TYPES)[number]

/** The only type with an authoring form; the other seven are read and moved through their steps. */
export const PID_POLICY_TYPE: BlockerType = 'TAXPAYER_PID_CONTRACT'

/** A route segment the backend would refuse as malformed is answered locally as not found. */
export function isBlockerType(value: unknown): value is BlockerType {
  return typeof value === 'string' && (BLOCKER_TYPES as readonly string[]).includes(value)
}

export type BlockerStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUPERSEDED'
  | 'NOT_APPLICABLE'

export type DenialReason =
  | 'MISSING_PERMISSION'
  | 'INVALID_STATE'
  | 'SELF_APPROVAL_NOT_ALLOWED'
  | 'APPROVER_CANNOT_ACTIVATE'
  | 'ACTIVATION_PRECONDITION_FAILED'
  | 'SCHEDULED_REPLACEMENT_PENDING'

/**
 * Whether a live version (ACTIVE, SCHEDULED or NOT_APPLICABLE) is the one in force, judged by the
 * server against its own clock. The status alone cannot say: statuses catch up only at the next
 * lifecycle write, so once a scheduled version starts it may be the one in force while the version
 * it replaces still reads ACTIVE. Null for every status that is not live.
 */
export type ForceState = 'IN_FORCE' | 'NOT_YET_EFFECTIVE' | 'ENDED' | 'REPLACED'

/** `reason` is null when the action is allowed. */
export type ActionDecision = { allowed: boolean; reason: DenialReason | null }

export type AllowedActions = {
  editDraft: ActionDecision
  submit: ActionDecision
  review: ActionDecision
  approve: ActionDecision
  activate: ActionDecision
  reject: ActionDecision
}

/** `displayName` is null when the server cannot resolve the id to a person. */
export type Actor = { id: string; displayName: string | null }

export type BlockerVersionView = {
  id: string
  blockerId: string
  type: BlockerType
  versionNumber: number
  status: BlockerStatus
  forceState: ForceState | null
  data: Record<string, unknown>
  contentHash: string
  evidenceReference: string | null
  testOnly: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  /** The reason of the last transition. */
  reasonCode: string | null
  createdBy: string
  submittedBy: string | null
  reviewedBy: string | null
  /** Recorded apart from the reviewer: a rejection leaves `reviewedBy` and `reviewedAt` as they were. */
  rejectedBy: string | null
  approvedBy: string | null
  activatedBy: string | null
  endedBy: string | null
  createdAt: string
  submittedAt: string | null
  reviewedAt: string | null
  rejectedAt: string | null
  approvedAt: string | null
  activatedAt: string | null
  endedAt: string | null
  updatedAt: string
  optimisticLockVersion: number
  actors: {
    createdBy: Actor
    submittedBy: Actor | null
    reviewedBy: Actor | null
    rejectedBy: Actor | null
    approvedBy: Actor | null
    activatedBy: Actor | null
    endedBy: Actor | null
  }
  allowedActions: AllowedActions
}

export type BlockerVersionSummary = {
  id: string
  versionNumber: number
  status: BlockerStatus
  forceState: ForceState | null
  testOnly: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  updatedAt: string
  optimisticLockVersion: number
  allowedActions: AllowedActions
}

export type BlockerOverviewEntry = {
  type: BlockerType
  canCreateDraft: boolean
  /** The highest version number, in any status. */
  latest: BlockerVersionSummary | null
  /** The version in force as the server judges it now; may be a SCHEDULED version that took effect. */
  active: BlockerVersionSummary | null
}

/* ------------------------------------------------------------------- paths */

export function versionsPath(type: BlockerType): string {
  return `${BLOCKERS_PATH}/${type}/versions?page=0&size=${VERSION_PAGE_SIZE}`
}

export function versionPath(type: BlockerType, versionId: string): string {
  return `${BLOCKERS_PATH}/${type}/versions/${encodeURIComponent(versionId)}`
}

/** Answers `404` when nothing is in force, which a caller reads as a state, not a fault. */
export function currentPolicyPath(type: BlockerType): string {
  return `${BLOCKERS_PATH}/${type}/current`
}

export function policyRoute(type: BlockerType, versionId?: string): string {
  const base = `${POLICIES_ROUTE}/${type}`
  return versionId ? `${base}?version=${encodeURIComponent(versionId)}` : base
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A `?version=` the backend would refuse as malformed is never sent. */
export function isVersionId(value: string | null): value is string {
  return value !== null && UUID.test(value)
}

/* ---------------------------------------------------------------- lifecycle */

/** The steps this console offers. Deactivate and revoke exist server-side and are not exposed. */
export const POLICY_TRANSITIONS = ['submit', 'review', 'approve', 'activate', 'reject'] as const
export type PolicyTransition = (typeof POLICY_TRANSITIONS)[number]

/**
 * The steps that carry a version towards being in force. `reject` is kept out on purpose: it ends
 * a version instead of advancing it, and it has no separation of duties, so every reviewer may
 * take it on every version under review. Counting it as a step would put each of those versions
 * in every reviewer's "needs my action" queue.
 */
export const FORWARD_TRANSITIONS = [
  'submit',
  'review',
  'approve',
  'activate',
] as const satisfies readonly PolicyTransition[]

/**
 * The reason each step is recorded with. Fixed machine codes, never typed by a person: the audit
 * trail must say the same thing for the same step whoever took it.
 */
export const TRANSITION_REASON_CODES: Record<PolicyTransition, string> = {
  submit: 'POLICY_SUBMITTED',
  review: 'POLICY_REVIEW_STARTED',
  approve: 'POLICY_APPROVED',
  activate: 'POLICY_ACTIVATED',
  reject: 'POLICY_REJECTED',
}

type VersionRef = Pick<BlockerVersionView, 'id' | 'optimisticLockVersion'>

/**
 * Takes one step. The lock version is the one on the object the server last returned, so a version
 * someone else moved meanwhile is refused (`409 STALE_VERSION`) instead of stepped unseen. The
 * body is built field by field because the backend rejects unknown properties.
 */
export function transitionVersion(
  transition: PolicyTransition,
  type: BlockerType,
  version: VersionRef,
): Promise<BlockerVersionView> {
  return apiRequest<BlockerVersionView>(`${versionPath(type, version.id)}/${transition}`, {
    method: 'POST',
    body: {
      expectedOptimisticLockVersion: version.optimisticLockVersion,
      reasonCode: TRANSITION_REASON_CODES[transition],
    },
    credentials: 'same-origin',
  })
}

export const submit = (type: BlockerType, version: VersionRef) =>
  transitionVersion('submit', type, version)
export const startReview = (type: BlockerType, version: VersionRef) =>
  transitionVersion('review', type, version)
export const approve = (type: BlockerType, version: VersionRef) =>
  transitionVersion('approve', type, version)
export const activate = (type: BlockerType, version: VersionRef) =>
  transitionVersion('activate', type, version)
export const reject = (type: BlockerType, version: VersionRef) =>
  transitionVersion('reject', type, version)

/** What a draft carries besides its lock version. */
export type DraftContent = {
  data: Record<string, unknown>
  evidenceReference: string | null
  /** ISO-8601 instants. */
  effectiveFrom: string | null
  effectiveTo: string | null
}

// `testOnly` is always false from this console: a test-only version cannot be activated outside a
// test mode, and nothing here should be able to author one by accident.
const draftBody = (draft: DraftContent) => ({
  data: draft.data,
  evidenceReference: draft.evidenceReference,
  testOnly: false,
  effectiveFrom: draft.effectiveFrom,
  effectiveTo: draft.effectiveTo,
})

export function createDraft(type: BlockerType, draft: DraftContent): Promise<BlockerVersionView> {
  return apiRequest<BlockerVersionView>(`${BLOCKERS_PATH}/${type}/versions`, {
    method: 'POST',
    body: draftBody(draft),
    credentials: 'same-origin',
  })
}

export function updateDraft(
  type: BlockerType,
  version: VersionRef,
  draft: DraftContent,
): Promise<BlockerVersionView> {
  return apiRequest<BlockerVersionView>(versionPath(type, version.id), {
    method: 'PUT',
    body: { expectedOptimisticLockVersion: version.optimisticLockVersion, ...draftBody(draft) },
    credentials: 'same-origin',
  })
}

/* --------------------------------------------------------------- work queue */

/**
 * Whether the server will let this reader take the next step on a version. Being allowed to
 * reject is not that, for the same reason being allowed to edit a draft is not: it is a decision
 * the reader may take, not a step the version is waiting on them for.
 */
export function needsMyAction(actions: AllowedActions): boolean {
  return FORWARD_TRANSITIONS.some((transition) => actions[transition].allowed)
}

export type QueueLabel =
  | 'draft'
  | 'submitted'
  | 'pendingYourApproval'
  | 'awaitingIndependentApproval'
  | 'pendingReview'
  | 'approvedYourActivation'
  | 'approvedOtherOperator'
  | 'approvedBlocked'
  | 'approved'
  | 'approvedScheduledPending'
  | 'inForce'
  | 'scheduled'
  | 'activeNotYetEffective'
  | 'activeWindowEnded'
  | 'replaced'
  | 'activated'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'superseded'

/**
 * Where a version stands in the work queue, read from its status and the server's own decision
 * about the reader. The separation of duties is the server's rule; this only names its outcome, so
 * a change to who may approve or activate needs no change here.
 */
type QueueSubject = Pick<BlockerVersionSummary, 'status' | 'allowedActions' | 'forceState'>

/**
 * In force is the server's judgement, never the browser's: a wrong local clock, or a status the
 * server has not caught up yet, would otherwise say "In force" for a version Participant ID
 * approval still refuses, or hide that a scheduled version has replaced this one.
 */
function liveLabel(version: QueueSubject): QueueLabel {
  switch (version.forceState) {
    case 'IN_FORCE':
      return 'inForce'
    case 'NOT_YET_EFFECTIVE':
      return version.status === 'SCHEDULED' ? 'scheduled' : 'activeNotYetEffective'
    case 'ENDED':
      return 'activeWindowEnded'
    case 'REPLACED':
      return 'replaced'
    case null:
      // A live version without the server's answer is never claimed to be in force.
      return 'activated'
  }
}

export function queueLabel(version: QueueSubject): QueueLabel {
  const { approve: approval, activate: activation } = version.allowedActions
  switch (version.status) {
    case 'DRAFT':
      return 'draft'
    case 'SUBMITTED':
      return 'submitted'
    case 'PENDING_REVIEW':
      if (approval.allowed) return 'pendingYourApproval'
      return approval.reason === 'SELF_APPROVAL_NOT_ALLOWED'
        ? 'awaitingIndependentApproval'
        : 'pendingReview'
    case 'APPROVED':
      if (activation.allowed) return 'approvedYourActivation'
      if (activation.reason === 'APPROVER_CANNOT_ACTIVATE') return 'approvedOtherOperator'
      if (activation.reason === 'SCHEDULED_REPLACEMENT_PENDING') return 'approvedScheduledPending'
      return activation.reason === 'ACTIVATION_PRECONDITION_FAILED' ? 'approvedBlocked' : 'approved'
    case 'ACTIVE':
    case 'SCHEDULED':
    case 'NOT_APPLICABLE':
      return liveLabel(version)
    case 'REJECTED':
      return 'rejected'
    case 'EXPIRED':
      return 'expired'
    case 'REVOKED':
      return 'revoked'
    case 'SUPERSEDED':
      return 'superseded'
  }
}

export function queueLabelKey(version: QueueSubject): string {
  return `console.policies.queue.${queueLabel(version)}`
}

/**
 * Why the reader is not offered the next step although the version is waiting for it, when the
 * reason is the separation of duties. Null for every other case, including a missing permission,
 * which needs no explanation beyond the absent button.
 */
export function separationNote(
  version: Pick<BlockerVersionSummary, 'status' | 'allowedActions'>,
): 'approve' | 'activate' | null {
  const { approve: approval, activate: activation } = version.allowedActions
  if (version.status === 'PENDING_REVIEW' && approval.reason === 'SELF_APPROVAL_NOT_ALLOWED')
    return 'approve'
  if (version.status === 'APPROVED' && activation.reason === 'APPROVER_CANNOT_ACTIVATE')
    return 'activate'
  return null
}

/* -------------------------------------------------------------- people trail */

export const TRAIL_STEPS = [
  'created',
  'submitted',
  'reviewed',
  'rejected',
  'approved',
  'activated',
  'ended',
] as const
export type TrailStep = (typeof TRAIL_STEPS)[number]
export type TrailEntry = { step: TrailStep; actor: Actor | null; at: string }

/** The steps a version has actually been through, in order; a step not yet taken has no entry. */
export function policyTrail(version: BlockerVersionView): TrailEntry[] {
  const { actors } = version
  const steps: [TrailStep, Actor | null, string | null][] = [
    ['created', actors.createdBy, version.createdAt],
    ['submitted', actors.submittedBy, version.submittedAt],
    ['reviewed', actors.reviewedBy, version.reviewedAt],
    // After the review and before the approval: a version is rejected while under review, and a
    // rejected one is never approved, so the two entries cannot both appear.
    ['rejected', actors.rejectedBy, version.rejectedAt],
    ['approved', actors.approvedBy, version.approvedAt],
    ['activated', actors.activatedBy, version.activatedAt],
    ['ended', actors.endedBy, version.endedAt],
  ]
  return steps.flatMap(([step, actor, at]) => (at === null ? [] : [{ step, actor, at }]))
}

/** Enough of an id to tell two unnamed operators apart without printing the whole of it. */
export function shortActorId(id: string): string {
  return id.slice(0, 8)
}

/**
 * The version to show when a read and a write's answer both describe it: whichever the server
 * produced later. The list wins a tie, so a re-read is never masked by an older answer.
 */
export function newerVersion(
  read: BlockerVersionView | null,
  answered: BlockerVersionView | null,
): BlockerVersionView | null {
  if (read === null || answered === null) return read ?? answered
  if (read.id !== answered.id) return read
  return answered.optimisticLockVersion > read.optimisticLockVersion ? answered : read
}

/* ------------------------------------------------------------ neutral contents */

export type DataEntry = {
  key: string
  kind: 'text' | 'boolean' | 'json' | 'empty'
  text: string
  flag: boolean
}

/**
 * A policy's `data` as label/value lines, for the types this console has no form for. Nothing is
 * interpreted: a string or number is printed as it is, and anything structured is shown as the
 * JSON it arrived as, so the screen cannot misdescribe a field it does not understand.
 */
export function dataEntries(data: Record<string, unknown>): DataEntry[] {
  return Object.entries(data).map(([key, value]): DataEntry => {
    if (value === null || value === undefined) return { key, kind: 'empty', text: '', flag: false }
    if (typeof value === 'boolean') return { key, kind: 'boolean', text: '', flag: value }
    if (typeof value === 'string' || typeof value === 'number') {
      return { key, kind: 'text', text: String(value), flag: false }
    }
    return { key, kind: 'json', text: JSON.stringify(value), flag: false }
  })
}

/* ------------------------------------------------- Participant ID policy form */

export const VATIN_RELATIONSHIPS = ['MUST_MATCH', 'INDEPENDENT', 'MUST_NOT_DERIVE'] as const
export type VatinRelationship = (typeof VATIN_RELATIONSHIPS)[number]

export const NORMALIZATIONS = ['NONE', 'TRIM', 'TRIM_UPPERCASE', 'TRIM_LOWERCASE'] as const
export type Normalization = (typeof NORMALIZATIONS)[number]

/** A required yes/no that starts unanswered, so a policy never records a choice nobody made. */
export type YesNo = '' | 'yes' | 'no'

/** The editor's fields as typed: numbers and dates stay strings until they are validated. */
export type PidPolicyForm = {
  participantIdentifierScheme: string
  valueSource: string
  vatinRelationship: VatinRelationship | ''
  normalization: Normalization | ''
  validationPattern: string
  allowedCharactersPattern: string
  minimumLength: string
  maximumLength: string
  caseSensitive: YesNo
  canonicalRepresentation: string
  uniquenessRule: string
  /** One value per line. */
  positiveFixtures: string
  negativeFixtures: string
  evidenceReference: string
  /** `yyyy-mm-dd`, as the `DateField` writes it. */
  effectiveFrom: string
  effectiveTo: string
}

export type PidPolicyField = keyof PidPolicyForm
export type PidPolicyErrors = Partial<Record<PidPolicyField, string>>

/** The order the editor draws its fields in, which is the order focus looks for the first error. */
export const PID_FIELD_ORDER: readonly PidPolicyField[] = [
  'participantIdentifierScheme',
  'valueSource',
  'validationPattern',
  'allowedCharactersPattern',
  'minimumLength',
  'maximumLength',
  'normalization',
  'caseSensitive',
  'vatinRelationship',
  'canonicalRepresentation',
  'uniquenessRule',
  'positiveFixtures',
  'negativeFixtures',
  'evidenceReference',
  'effectiveFrom',
  'effectiveTo',
]

export const EMPTY_PID_FORM: PidPolicyForm = {
  participantIdentifierScheme: '',
  valueSource: '',
  vatinRelationship: '',
  normalization: '',
  validationPattern: '',
  allowedCharactersPattern: '',
  minimumLength: '',
  maximumLength: '',
  caseSensitive: '',
  canonicalRepresentation: '',
  uniquenessRule: '',
  positiveFixtures: '',
  negativeFixtures: '',
  evidenceReference: '',
  effectiveFrom: '',
  effectiveTo: '',
}

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : ''

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | '' =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : ''

/** A fixture list as the textarea shows it; anything that is not a string is left out. */
export function fixturesToText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.filter((entry): entry is string => typeof entry === 'string').join('\n')
}

/**
 * The textarea's lines as a fixture list. Only empty lines are dropped: a fixture is kept exactly
 * as typed, spaces included, because a padded value is a legitimate case for a policy that trims.
 */
export function fixturesFromText(value: string): string[] {
  return value.split(/\r?\n/).filter((line) => line !== '')
}

/**
 * The form's day as the instant the backend stores: midnight UTC of that day, so the same policy
 * takes effect at the same moment whichever time zone its author sat in.
 */
export function dayToInstant(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00Z` : null
}

/** The UTC day of a stored instant, the inverse of {@link dayToInstant}. */
export function instantToDay(instant: string | null): string {
  if (!instant) return ''
  const date = new Date(instant)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/**
 * The policy contents as form values. Tolerant on purpose: `data` is free-form JSON on the server,
 * so a key that is missing or of another type becomes an empty field for the author to fill,
 * never an exception and never a guessed value.
 */
export function pidDataToForm(
  data: Record<string, unknown>,
): Pick<
  PidPolicyForm,
  Exclude<PidPolicyField, 'evidenceReference' | 'effectiveFrom' | 'effectiveTo'>
> {
  return {
    participantIdentifierScheme: text(data.participantIdentifierScheme),
    valueSource: text(data.valueSource),
    vatinRelationship: oneOf(data.vatinRelationship, VATIN_RELATIONSHIPS),
    normalization: oneOf(data.normalization, NORMALIZATIONS),
    validationPattern: text(data.validationPattern),
    allowedCharactersPattern: text(data.allowedCharactersPattern),
    minimumLength: text(data.minimumLength),
    maximumLength: text(data.maximumLength),
    caseSensitive:
      typeof data.caseSensitive === 'boolean' ? (data.caseSensitive ? 'yes' : 'no') : '',
    canonicalRepresentation: text(data.canonicalRepresentation),
    uniquenessRule: text(data.uniquenessRule),
    positiveFixtures: fixturesToText(data.positiveFixtures),
    negativeFixtures: fixturesToText(data.negativeFixtures),
  }
}

/** The policy contents as the read-only card prints them: the stored values, uninterpreted. */
export type PidPolicySummary = {
  participantIdentifierScheme: string
  validationPattern: string
  allowedCharactersPattern: string
  minimumLength: string
  maximumLength: string
  normalization: string
  vatinRelationship: string
  caseSensitive: boolean | null
  valueSource: string
  canonicalRepresentation: string
  uniquenessRule: string
  positiveFixtures: string[]
  negativeFixtures: string[]
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/**
 * Unlike {@link pidDataToForm}, an option the form does not know is kept as it is stored: a
 * reviewer must see what the version really holds, not a blank where the form has no choice for it.
 */
export function pidPolicySummary(data: Record<string, unknown>): PidPolicySummary {
  return {
    participantIdentifierScheme: text(data.participantIdentifierScheme),
    validationPattern: text(data.validationPattern),
    allowedCharactersPattern: text(data.allowedCharactersPattern),
    minimumLength: text(data.minimumLength),
    maximumLength: text(data.maximumLength),
    normalization: text(data.normalization),
    vatinRelationship: text(data.vatinRelationship),
    caseSensitive: typeof data.caseSensitive === 'boolean' ? data.caseSensitive : null,
    valueSource: text(data.valueSource),
    canonicalRepresentation: text(data.canonicalRepresentation),
    uniquenessRule: text(data.uniquenessRule),
    positiveFixtures: strings(data.positiveFixtures),
    negativeFixtures: strings(data.negativeFixtures),
  }
}

export function isNormalization(value: string): value is Normalization {
  return (NORMALIZATIONS as readonly string[]).includes(value)
}

export function isVatinRelationship(value: string): value is VatinRelationship {
  return (VATIN_RELATIONSHIPS as readonly string[]).includes(value)
}

/** Editing a draft: everything it holds, as the form shows it. */
export function pidFormFromDraft(version: BlockerVersionView): PidPolicyForm {
  return {
    ...pidDataToForm(version.data),
    evidenceReference: version.evidenceReference ?? '',
    effectiveFrom: instantToDay(version.effectiveFrom),
    effectiveTo: instantToDay(version.effectiveTo),
  }
}

/**
 * Starting a new draft from an existing version: its contents only. The evidence and the effective
 * dates belong to the version they were recorded for, so the new draft's author states them afresh.
 */
export function pidFormFromVersion(version: BlockerVersionView): PidPolicyForm {
  return { ...EMPTY_PID_FORM, ...pidDataToForm(version.data) }
}

// The backend's own bounds for `data` (contract, "TAXPAYER_PID_CONTRACT data keys").
const SCHEME = /^[A-Za-z0-9_.:-]{2,100}$/
const WHOLE = /^\d{1,4}$/
const LENGTH_MAX = 300
const EVIDENCE_MAX = 500

const requiredText = (value: string) => (value.trim() ? undefined : 'validation.required')

function length(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return 'validation.required'
  if (!WHOLE.test(trimmed)) return 'console.policies.validation.length'
  const parsed = Number(trimmed)
  return parsed >= 1 && parsed <= LENGTH_MAX ? undefined : 'console.policies.validation.length'
}

/**
 * The rules that can be checked here for certain, so a save that must fail is caught before it is
 * sent. The two patterns are deliberately not compiled: the backend reads them as Java regular
 * expressions, and JavaScript's dialect would refuse some that are valid there. Whether a pattern
 * is well formed, and whether the fixtures agree with it, is left to the backend's answer.
 */
export function validatePidForm(values: PidPolicyForm): PidPolicyErrors {
  const scheme = values.participantIdentifierScheme.trim()
  const minimum = length(values.minimumLength)
  let maximum = length(values.maximumLength)
  if (
    !minimum &&
    !maximum &&
    Number(values.maximumLength.trim()) < Number(values.minimumLength.trim())
  ) {
    maximum = 'console.policies.validation.maximumBelowMinimum'
  }
  return {
    participantIdentifierScheme: !scheme
      ? 'validation.required'
      : SCHEME.test(scheme)
        ? undefined
        : 'console.policies.validation.scheme',
    valueSource: requiredText(values.valueSource),
    validationPattern: requiredText(values.validationPattern),
    minimumLength: minimum,
    maximumLength: maximum,
    normalization: values.normalization ? undefined : 'validation.required',
    caseSensitive: values.caseSensitive ? undefined : 'validation.required',
    vatinRelationship: values.vatinRelationship ? undefined : 'validation.required',
    canonicalRepresentation: requiredText(values.canonicalRepresentation),
    uniquenessRule: requiredText(values.uniquenessRule),
    positiveFixtures: fixturesFromText(values.positiveFixtures).length
      ? undefined
      : 'console.policies.validation.fixtures',
    negativeFixtures: fixturesFromText(values.negativeFixtures).length
      ? undefined
      : 'console.policies.validation.fixtures',
    evidenceReference:
      values.evidenceReference.trim().length > EVIDENCE_MAX
        ? 'console.policies.validation.evidence'
        : undefined,
    effectiveFrom: dayToInstant(values.effectiveFrom) ? undefined : 'validation.required',
    effectiveTo:
      values.effectiveTo && values.effectiveFrom && values.effectiveTo <= values.effectiveFrom
        ? 'console.policies.validation.effectiveTo'
        : undefined,
  }
}

/**
 * The policy contents with exactly the contract's keys. The optional pattern is left out when
 * empty rather than sent as `""`, which the backend would try to read as a regular expression.
 * Only meaningful once {@link validatePidForm} passes.
 */
export function pidFormToData(values: PidPolicyForm): Record<string, unknown> {
  const allowedCharacters = values.allowedCharactersPattern.trim()
    ? values.allowedCharactersPattern
    : null
  return {
    participantIdentifierScheme: values.participantIdentifierScheme.trim(),
    valueSource: values.valueSource.trim(),
    vatinRelationship: values.vatinRelationship,
    normalization: values.normalization,
    validationPattern: values.validationPattern,
    ...(allowedCharacters === null ? {} : { allowedCharactersPattern: allowedCharacters }),
    minimumLength: Number(values.minimumLength.trim()),
    maximumLength: Number(values.maximumLength.trim()),
    caseSensitive: values.caseSensitive === 'yes',
    canonicalRepresentation: values.canonicalRepresentation.trim(),
    uniquenessRule: values.uniquenessRule.trim(),
    positiveFixtures: fixturesFromText(values.positiveFixtures),
    negativeFixtures: fixturesFromText(values.negativeFixtures),
  }
}

export function pidFormToDraft(values: PidPolicyForm): DraftContent {
  return {
    data: pidFormToData(values),
    evidenceReference: values.evidenceReference.trim() || null,
    effectiveFrom: dayToInstant(values.effectiveFrom),
    effectiveTo: dayToInstant(values.effectiveTo),
  }
}

/* ------------------------------------------------------------------ failures */

/**
 * What a refused read or write means, by status and the module's refusal `code` alone. The
 * problem's `detail` is English prose for the logs: it is never matched against and never shown.
 * (A `401` does not reach here: the caller forgets the session and leaves for Login.)
 */
export function describePolicyFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 403) return { key: 'console.policies.error.forbidden' }
    if (error.status === 404) return { key: 'console.policies.error.notFound' }
    if (error.status === 409) {
      switch (error.code) {
        case 'STALE_VERSION':
        case 'INVALID_STATE':
          return { key: 'console.policies.error.changed' }
        case 'SELF_APPROVAL_NOT_ALLOWED':
          return { key: 'console.policies.separation.approve' }
        case 'APPROVER_CANNOT_ACTIVATE':
          return { key: 'console.policies.separation.activate' }
        case 'CONCURRENT_DRAFT':
          return { key: 'console.policies.error.concurrentDraft' }
        case 'SCHEDULED_REPLACEMENT_PENDING':
          return { key: 'console.policies.error.scheduledReplacementPending' }
        default:
          return { key: 'console.policies.error.conflict' }
      }
    }
    if (error.status === 400) {
      if (error.code === 'ACTIVATION_PRECONDITION_FAILED') {
        return { key: 'console.policies.error.activationPrecondition' }
      }
      return { key: 'console.policies.error.rejectedContent' }
    }
  }
  return commonFailureMessage(error)
}

export type PolicyFailure = {
  message: FormMessage
  /** The correlation id, for the operator to quote to support. */
  reference: string | null
  /**
   * The screen is out of date and must be read again: the version moved, or is gone. Nothing is
   * ever sent again on the reader's behalf; they decide what to do with what the re-read shows.
   */
  reload: boolean
}

export function policyFailure(error: unknown): PolicyFailure {
  return {
    message: describePolicyFailure(error),
    reference: problemReference(error),
    reload: error instanceof ApiError && (error.status === 409 || error.status === 404),
  }
}

/**
 * Request fields a `400` may name, mapped to the editor's fields. The backend's field naming for
 * `data` is not part of the contract, so both the bare key and the `data.`-prefixed path are
 * recognised; a name that matches neither is reported at form level rather than guessed at.
 */
const DATA_FIELDS: readonly PidPolicyField[] = [
  'participantIdentifierScheme',
  'valueSource',
  'vatinRelationship',
  'normalization',
  'validationPattern',
  'allowedCharactersPattern',
  'minimumLength',
  'maximumLength',
  'caseSensitive',
  'canonicalRepresentation',
  'uniquenessRule',
  'positiveFixtures',
  'negativeFixtures',
]
const SERVER_FIELDS: ReadonlyMap<string, PidPolicyField> = new Map<string, PidPolicyField>([
  ...DATA_FIELDS.flatMap((field): [string, PidPolicyField][] => [
    [field, field],
    [`data.${field}`, field],
  ]),
  ['evidenceReference', 'evidenceReference'],
  ['effectiveFrom', 'effectiveFrom'],
  ['effectiveTo', 'effectiveTo'],
])

/** What a refused draft save means: the fields the server named, and otherwise one form-level message. */
export function describeDraftFailure(error: unknown): {
  fieldErrors: PidPolicyErrors
  failure: PolicyFailure | null
} {
  if (error instanceof ApiError && error.status === 400) {
    const fieldErrors: PidPolicyErrors = {}
    for (const { field } of error.fieldErrors) {
      const target = SERVER_FIELDS.get(field)
      if (target) fieldErrors[target] = 'console.policies.validation.server'
    }
    if (Object.keys(fieldErrors).length) return { fieldErrors, failure: null }
  }
  return { fieldErrors: {}, failure: policyFailure(error) }
}
