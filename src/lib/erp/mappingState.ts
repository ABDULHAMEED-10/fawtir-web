import {
  MAPPING_CERTIFICATION_ROUTES,
  loadCertificationHistory,
  loadCertificationStatus,
  loadGuidedMapping,
  loadMappingProfiles,
  loadMappingTargets,
  type GuidedMappingDto,
  type GuidedMappingValidationDto,
  type MappingCertificationHistoryDto,
  type MappingCertificationRoute,
  type MappingCertificationStatusDto,
  type MappingDocumentKind,
  type MappingFormat,
  type MappingProfileDto,
  type MappingSourceSystem,
  type MappingTargetDto,
} from '../../api/erp/mapping'
import { ApiError } from '../../api'

/**
 * The real ERP mapping state, read from the backend.
 *
 * Replaces the runtime role of `lib/erpMapping.ts`, which stood in for this module while the
 * screens were built. That file keeps its pure helpers and its store, because the ERP *connector*
 * screens and the platform console's template editor still run on it and are out of this phase's
 * scope — but no mapping screen reads it for runtime data any more.
 *
 * **Nothing here transforms a tenant payload.** Validation, compilation, dry-run and certification
 * all happen in the engine that will run in production; this module only reads the answers. The one
 * thing it does compute is the presentation roll-up — a status pill and four route pills — from
 * facts the server stated.
 */

/* --------------------------------------------------------------- capabilities */

/**
 * A concept the screens were designed around that the backend does not implement.
 *
 * Kept as an explicit list rather than left implicit, so a screen can disable a control and say
 * why instead of quietly offering something that will not work. Every entry here was verified
 * absent from the backend, not assumed:
 *
 * - `REVISIONS` — the guided mapping is one mutable row per (tenant, format) with an optimistic
 *   lock. There is no revision table and no restore endpoint. The *profile* has real history
 *   (every save supersedes rather than overwrites), and that is what History shows.
 * - `SAMPLES` — no sample payload is stored anywhere. A sample can still be used for a dry run or
 *   a certification run within the session; it just does not survive a reload.
 * - `ACTIVITY_LOG` — mapping administration is audited server-side, but no tenant-facing read
 *   endpoint exposes it, so there is nothing to render.
 * - `VALUE_MAPS` — `valueMap`, `valueMapDefault` and `onUnmapped` exist only in the design mock.
 *   The compiler takes a source path, an optional JSONata transform and a default, and nothing
 *   else. A code-to-code table has to be written as a transform today.
 * - `ERP_VERSION` — the backend records a source *system* (`ODOO`), never a version (`17`).
 * - `PROFILE_ORIGIN` — the profile row does not record whether it was compiled from a guided
 *   mapping or pasted by hand, so {@link mappingRouteOf} is a heuristic and says so.
 */
export type ErpMappingCapability =
  | 'REVISIONS'
  | 'SAMPLES'
  | 'ACTIVITY_LOG'
  | 'VALUE_MAPS'
  | 'ERP_VERSION'
  | 'PROFILE_ORIGIN'

export const UNSUPPORTED_CAPABILITIES: readonly ErpMappingCapability[] = [
  'REVISIONS',
  'SAMPLES',
  'ACTIVITY_LOG',
  'VALUE_MAPS',
  'ERP_VERSION',
  'PROFILE_ORIGIN',
]

export function isSupported(capability: ErpMappingCapability): boolean {
  return !UNSUPPORTED_CAPABILITIES.includes(capability)
}

/* ------------------------------------------------------------------ view model */

export type ErpOverviewStatus =
  | 'NOT_SET_UP'
  | 'DRAFT'
  | 'READY_UNCERTIFIED'
  | 'PARTIALLY_CERTIFIED'
  | 'CERTIFIED'
  | 'STALE'

export type ErpMappingRoute = 'GUIDED' | 'HAND_WRITTEN' | 'NONE'

export type ErpRouteState = 'CERTIFIED' | 'FAILED' | 'NOT_CERTIFIED' | 'STALE'

export type ErpRouteStatus = {
  state: ErpRouteState
  /** What the server says about the active expression for this route. */
  status: MappingCertificationStatusDto
  /** The most recent recorded attempt on this route, whatever its verdict. */
  last: MappingCertificationHistoryDto | null
  /** The passing attempt that admits the active expression, when there is one. */
  pass: MappingCertificationHistoryDto | null
}

export type ErpMappingView = {
  format: MappingFormat
  /** Null when the tenant has never started a guided mapping (the server answered 404). */
  guided: GuidedMappingDto | null
  /** Server-stated readiness for the stored guided mapping. Null when there is no guided mapping. */
  readiness: GuidedMappingValidationDto | null
  /** Active and superseded, newest first. This is the real mapping history. */
  profiles: MappingProfileDto[]
  activeProfile: MappingProfileDto | null
  certification: Record<MappingCertificationRoute, ErpRouteStatus>
  history: MappingCertificationHistoryDto[]
  targets: MappingTargetDto[]
  status: ErpOverviewStatus
  route: ErpMappingRoute
}

/* ----------------------------------------------------------------- constants */

/** Which PINT-OM form each production route emits. A debit note rides the standard invoice root. */
export const DOCUMENT_KIND_BY_ROUTE: Record<MappingCertificationRoute, MappingDocumentKind> = {
  INVOICE: 'STANDARD_INVOICE',
  CREDIT_NOTE: 'CREDIT_NOTE',
  DEBIT_NOTE: 'STANDARD_INVOICE',
  SELF_BILLING: 'SELF_BILLING_INVOICE',
}

/**
 * The BTOM-001 bitmap each route is certified under by default.
 *
 * Written in the SA's `1`/`X` alphabet, not the spec's `1`/`0`. Both are accepted where a *scope*
 * is derived, but the certification run body is validated against `^[X1]{20}$` and would refuse a
 * `0`, so one alphabet is used throughout to keep a status query and the run that answers it in
 * agreement. Position 3 is self-billed.
 */
export const DEFAULT_TRANSACTION_TYPE: Record<MappingCertificationRoute, string> = {
  INVOICE: '1XXXXXXXXXXXXXXXXXXX',
  CREDIT_NOTE: '1XXXXXXXXXXXXXXXXXXX',
  DEBIT_NOTE: '1XXXXXXXXXXXXXXXXXXX',
  SELF_BILLING: 'XX1XXXXXXXXXXXXXXXXX',
}

/**
 * The fifteen obligation-bearing BTOM-001 positions. Positions 16–20 are reserved placeholders no
 * rule references, so they stay unset and the scope the gate keys on masks them anyway.
 */
export const TRANSACTION_BITS = [
  'fullTax',
  'simplified',
  'selfBilled',
  'thirdParty',
  'summary',
  'continuous',
  'export',
  'deemed',
  'importOfServices',
  'profitMargin',
  'profitMarginSelf',
  'eCommerce',
  'importOfGoods',
  'specialZone',
  'prepayment',
] as const

/**
 * The bitmap, in the `1`/`X` alphabet.
 *
 * `X` for an unset position, not `0`: the certification run body is validated against
 * `^[X1]{20}$` and a `0` is refused outright. The design mock composed `0`s, which would have
 * failed every run. Both alphabets are accepted where a *scope* is derived, so the status query is
 * unaffected — but one alphabet throughout keeps a status check and the run that answers it in
 * agreement.
 */
export const composeTransactionType = (bits: readonly boolean[]) =>
  `${bits.map((on) => (on ? '1' : 'X')).join('')}XXXXX`
/** The positions a bitmap sets, in {@link TRANSACTION_BITS} order. */
export const decomposeTransactionType = (type: string) =>
  TRANSACTION_BITS.map((_, index) => type.charAt(index) === '1')

/* -------------------------------------------------------------------- loading */

/** A 404 is "not started", which is a state, not a failure. Anything else is a real error. */
async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** The cache key for one format's whole view — what `useApiRead` keys its read on. */
export function erpMappingKey(format: MappingFormat): string {
  return `erp-mapping:${format}`
}

/**
 * Loads everything the mapping screens need for one format, in parallel.
 *
 * Eight reads rather than one aggregate endpoint, because that is the API that exists; they are
 * issued together and de-duplicated by the shared in-flight registry, so a screen mounting twice
 * in a render pass makes one set of requests.
 */
export async function loadErpMapping(format: MappingFormat): Promise<ErpMappingView> {
  const [guided, profiles, history, targets, ...statuses] = await Promise.all([
    optional(() => loadGuidedMapping(format)),
    loadMappingProfiles(),
    loadCertificationHistory(format),
    loadMappingTargets(),
    ...MAPPING_CERTIFICATION_ROUTES.map((route) =>
      loadCertificationStatus(format, {
        documentKind: DOCUMENT_KIND_BY_ROUTE[route],
        route,
        transactionType: DEFAULT_TRANSACTION_TYPE[route],
      }),
    ),
  ])

  const forFormat = profiles
    .filter((profile) => profile.format === format)
    .sort((a, b) => b.version - a.version)
  const activeProfile = forFormat.find((profile) => profile.active) ?? null

  const certification = {} as Record<MappingCertificationRoute, ErpRouteStatus>
  MAPPING_CERTIFICATION_ROUTES.forEach((route, index) => {
    certification[route] = routeStatusOf(route, statuses[index], history, activeProfile)
  })

  return {
    format,
    guided,
    readiness: guided?.readiness ?? null,
    profiles: forFormat,
    activeProfile,
    certification,
    history,
    targets,
    status: overviewStatusOf(guided, activeProfile, certification),
    route: mappingRouteOf(guided, activeProfile),
  }
}

/* ---------------------------------------------------------------- hub card */

/**
 * What the Settings hub's ERP mapping card needs.
 *
 * Two requests, not the eight {@link loadErpMapping} makes. The card is on a page every tenant
 * visits, including the ones that will never use ERP, so it reads the guided mapping and the
 * primary route's certification status and nothing else.
 *
 * The consequence is stated rather than hidden: this cannot distinguish a partially certified
 * tenant from a fully certified one, because that needs all four routes. It reports
 * `CERTIFIED` when the invoice route is certified, which is the question the card is really
 * asking — "can this tenant send?" — and the full picture is one click away.
 */
export type ErpMappingCard = {
  hasGuided: boolean
  sourceSystem: MappingSourceSystem | null
  status: ErpOverviewStatus
  mapped: number
  required: number
}

export const ERP_MAPPING_CARD_KEY = 'erp-mapping-card'

export async function loadErpMappingCard(format: MappingFormat): Promise<ErpMappingCard> {
  const [guided, invoiceStatus] = await Promise.all([
    optional(() => loadGuidedMapping(format)),
    loadCertificationStatus(format, {
      documentKind: 'STANDARD_INVOICE',
      route: 'INVOICE',
      transactionType: DEFAULT_TRANSACTION_TYPE.INVOICE,
    }),
  ])

  const progress = readinessProgress(guided?.readiness ?? null)
  let status: ErpOverviewStatus
  if (!guided && !invoiceStatus.active_content_hash) status = 'NOT_SET_UP'
  else if (!invoiceStatus.active_content_hash) status = 'DRAFT'
  else if (invoiceStatus.certified) status = 'CERTIFIED'
  else status = 'READY_UNCERTIFIED'

  return {
    hasGuided: guided !== null,
    sourceSystem: guided?.sourceSystem ?? null,
    status,
    mapped: progress.mapped,
    required: progress.required,
  }
}

/* ------------------------------------------------------------------ roll-ups */

/**
 * One route's pill.
 *
 * `CERTIFIED` comes straight from the server — it is the same question the submission gate asks,
 * and nothing here second-guesses it. The other three distinguish *why* it is not certified, which
 * the status alone cannot say: a failed attempt against the expression that is live now is a
 * different message to the tenant than a pass that a later edit retired.
 */
function routeStatusOf(
  route: MappingCertificationRoute,
  status: MappingCertificationStatusDto,
  history: MappingCertificationHistoryDto[],
  activeProfile: MappingProfileDto | null,
): ErpRouteStatus {
  const mine = history.filter((entry) => entry.route === route)
  const last = mine[0] ?? null
  const activeHash = activeProfile?.contentHash ?? null
  const againstActive = activeHash
    ? mine.filter((entry) => entry.content_hash === activeHash)
    : []
  const pass = againstActive.find((entry) => entry.verdict === 'PASSED') ?? null
  const retiredPass = mine.some(
    (entry) => entry.verdict === 'PASSED' && entry.content_hash !== activeHash,
  )

  let state: ErpRouteState
  if (status.certified) state = 'CERTIFIED'
  else if (againstActive.length > 0) state = 'FAILED'
  else if (retiredPass) state = 'STALE'
  else state = 'NOT_CERTIFIED'

  return { state, status, last, pass }
}

function overviewStatusOf(
  guided: GuidedMappingDto | null,
  activeProfile: MappingProfileDto | null,
  certification: Record<MappingCertificationRoute, ErpRouteStatus>,
): ErpOverviewStatus {
  if (!activeProfile && !guided) return 'NOT_SET_UP'
  // A guided mapping with nothing compiled yet is a draft, whatever else is true.
  if (!activeProfile) return 'DRAFT'

  const states = MAPPING_CERTIFICATION_ROUTES.map((route) => certification[route].state)
  if (states.includes('CERTIFIED')) {
    const attempted = states.filter((state) => state !== 'NOT_CERTIFIED' && state !== 'STALE')
    return attempted.every((state) => state === 'CERTIFIED') && !states.includes('FAILED')
      ? 'CERTIFIED'
      : 'PARTIALLY_CERTIFIED'
  }
  if (states.includes('STALE')) return 'STALE'
  return 'READY_UNCERTIFIED'
}

/**
 * Which authoring route produced the live expression — a **heuristic**, and the only value in this
 * module that is not a server fact.
 *
 * The profile row records no origin, so this compares the profile's `erpKey` against the guided
 * mapping's source system, which is what the guided save writes there. It is right in the ordinary
 * case and wrong if a tenant hand-writes a profile and happens to label it with a source-system
 * name. The honest fix is an origin column on the profile — see `PROFILE_ORIGIN` in
 * {@link UNSUPPORTED_CAPABILITIES}.
 *
 * Deliberately *not* fixed by recompiling the guided mapping in the browser and comparing hashes,
 * which is what the design mock did: that needs a second compiler implementation in TypeScript,
 * and two compilers silently disagreeing is a worse defect than an imprecise label.
 */
export function mappingRouteOf(
  guided: GuidedMappingDto | null,
  activeProfile: MappingProfileDto | null,
): ErpMappingRoute {
  if (!activeProfile) return 'NONE'
  if (guided && activeProfile.erpKey === guided.sourceSystem) return 'GUIDED'
  return 'HAND_WRITTEN'
}

/* -------------------------------------------------------------------- helpers */

export function shortHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 8) : '—'
}

/** Mapped required targets over required targets — the figure the Fields checklist counts down. */
export function readinessProgress(readiness: GuidedMappingValidationDto | null): {
  mapped: number
  required: number
  missing: number
  invalid: number
} {
  if (!readiness) return { mapped: 0, required: 0, missing: 0, invalid: 0 }
  return {
    mapped: readiness.mappedRequiredTargets.length,
    required: readiness.requiredTenantMappedTargets.length,
    missing: readiness.missingRequiredTargets.length,
    invalid: readiness.invalidMappings.length,
  }
}

/**
 * Whether the draft as it stands may be saved.
 *
 * `valid` and `readyForActivation` answer different questions and a screen must not conflate them:
 * an incomplete draft is a normal thing to save, and refusing to save one would strand a tenant
 * who is seventy fields into a mapping. Only a structurally invalid entry blocks a save.
 */
export function canSaveDraft(readiness: GuidedMappingValidationDto | null): boolean {
  return readiness === null || readiness.valid
}

/**
 * The readiness of a mapping that does not exist yet.
 *
 * Every list empty and both flags false, so a screen for a tenant who has not started renders the
 * same way it renders a real answer instead of branching on null everywhere. `valid: false` is
 * deliberate: there is nothing to save, and a true here would let the Save button claim otherwise.
 */
export const NO_READINESS: GuidedMappingValidationDto = {
  valid: false,
  readyForActivation: false,
  requiredTenantMappedTargets: [],
  mappedRequiredTargets: [],
  missingRequiredTargets: [],
  optionalMappedTargets: [],
  invalidMappings: [],
  warnings: [],
  coverageLimits: [],
  conditionalGaps: [],
}

/** Whether the draft is complete enough that saving it will compile and activate a profile. */
export function willActivateOnSave(readiness: GuidedMappingValidationDto | null): boolean {
  return readiness !== null && readiness.valid && readiness.readyForActivation
}
