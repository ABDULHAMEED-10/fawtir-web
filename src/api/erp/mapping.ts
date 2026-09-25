import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * ERP → PINT-OM mapping (`MappingProfileController`, `MappingTargetController`,
 * `MappingCertificationController`; SRS FR-004 and FR-005).
 *
 * Every endpoint here requires `admin.settings.manage`. There is no separate read permission:
 * the catalogue is public specification content and every caller entitled to see it is already
 * entitled to edit the mapping.
 *
 * **Two levels of "valid", and they are not the same question.** `valid` says nothing is wrong
 * with what the mapping already contains, so it is safe to persist as a draft. `readyForActivation`
 * additionally says nothing required is missing, so it can be compiled and published. A tenant maps
 * seventy-odd fields over more than one sitting, so a half-finished draft is a normal thing to save
 * and an abnormal thing to activate. Screens must keep the two apart — see `erpMappingReadiness`.
 *
 * **Response casing is mixed, and that is the server's contract, not an oversight.** The targets,
 * profile and guided-mapping shapes are camelCase; the dry-run and certification shapes are
 * snake_case per the SRS Ch 11 API contract. The types below mirror each one exactly, so nothing
 * here renames a field on the way through.
 */

const BASE = '/v1/peppol/mapping-profiles'
const TARGETS = '/v1/peppol/mapping-targets'

/** `InvoiceInputFormat`. Only JSON and XML have a transformer; CSV and EDIFACT are post-launch. */
export type MappingFormat = 'JSON' | 'XML' | 'CSV' | 'EDIFACT'

/** The formats a screen may offer today — one transformer bean exists per entry. */
export const SUPPORTED_MAPPING_FORMATS: MappingFormat[] = ['JSON', 'XML']

/** `GuidedMapping.SourceSystem`. The server refuses anything outside this set. */
export type MappingSourceSystem =
  | 'ORACLE'
  | 'SAP'
  | 'MICROSOFT_DYNAMICS'
  | 'ODOO'
  | 'ERPNEXT'
  | 'CUSTOM'

export const MAPPING_SOURCE_SYSTEMS: MappingSourceSystem[] = [
  'ODOO',
  'ERPNEXT',
  'SAP',
  'ORACLE',
  'MICROSOFT_DYNAMICS',
  'CUSTOM',
]

/* ------------------------------------------------------------------ targets */

/**
 * `GuidedMappingTargetCatalogue.Target`.
 *
 * `mappable` is carried by the server rather than derived from `origin`, and screens must use it
 * as given: a wizard that inferred eligibility would eventually get one branch wrong, and the
 * failure is silent — the tenant maps a field, the mapper never reads it, and the value simply
 * does not appear on the invoice.
 */
export type MappingTargetDto = {
  businessTermId: string
  name: string
  section: string
  requirement: 'MANDATORY' | 'CONDITIONAL' | 'OPTIONAL'
  cardinality: string
  ublPath: string | null
  /** Null unless `origin` is `TENANT_MAPPED`. Display only; never sent back. */
  canonicalPath: string | null
  origin: 'TENANT_MAPPED' | 'PLATFORM_SUPPLIED' | 'DERIVED'
  mappable: boolean
  repeatable: boolean
  discriminator: string | null
}

export type MappingTargetFilter = {
  mappableOnly?: boolean
  requiredOnly?: boolean
  section?: string
  origin?: MappingTargetDto['origin']
}

export function mappingTargetsPath(filter: MappingTargetFilter = {}): string {
  return withQuery(TARGETS, {
    mappableOnly: filter.mappableOnly,
    requiredOnly: filter.requiredOnly,
    section: filter.section,
    origin: filter.origin,
  })
}

/**
 * The whole catalogue, including the terms a tenant cannot map.
 *
 * Returning only the mappable subset would make the field list silently shorter than the SRS, so
 * `PLATFORM_SUPPLIED` and `DERIVED` terms arrive too and should be shown read-only as
 * "Fawtir supplies this" rather than omitted, which reads as a gap.
 */
export function loadMappingTargets(filter: MappingTargetFilter = {}): Promise<MappingTargetDto[]> {
  return apiRequest<MappingTargetDto[]>(mappingTargetsPath(filter))
}

/* ----------------------------------------------------------------- profiles */

/**
 * `MappingProfileResponse` — the executable artefact.
 *
 * A profile row is never rewritten: a save deactivates the previous row and inserts a new one, so
 * the expression a past invoice was generated under stays readable. `contentHash` is therefore the
 * durable identity, and it is what certification is keyed on.
 */
export type MappingProfileDto = {
  id: string
  format: MappingFormat
  /** The JSONata expression (JSON) or XSLT 3.0 stylesheet (XML). */
  content: string
  /** SHA-256 of `content`, lowercase hex. Stamped onto every invoice this mapping generates. */
  contentHash: string
  /** Which ERP this mapping targets, or null when not recorded. */
  erpKey: string | null
  active: boolean
  /** Optimistic-lock version of the row. Not a semantic version of the mapping. */
  version: number
  createdAt: string
  updatedAt: string
}

export const MAPPING_PROFILES_PATH = BASE

export function mappingProfilePath(format: MappingFormat): string {
  return `${BASE}/${format}`
}

/** Every profile for the tenant, active and superseded, so a screen can show history. */
export function loadMappingProfiles(): Promise<MappingProfileDto[]> {
  return apiRequest<MappingProfileDto[]>(BASE)
}

/** The active profile for one format. 404 when none is registered or the last was deactivated. */
export function loadMappingProfile(format: MappingFormat): Promise<MappingProfileDto> {
  return apiRequest<MappingProfileDto>(mappingProfilePath(format))
}

export type MappingProfileRequest = {
  content: string
  /** Omitted rather than null to keep whatever the superseded profile recorded. */
  erpKey?: string
}

/**
 * The expert route: stores a hand-written expression.
 *
 * The server compiles it before storing, so a malformed expression is a 400 here rather than a
 * failure on a real tax document. Saving supersedes the active profile, which retires any
 * certification keyed on the old hash — the mapping must be certified again before it may send.
 */
export function saveMappingProfile(
  format: MappingFormat,
  body: MappingProfileRequest,
): Promise<MappingProfileDto> {
  return apiRequest<MappingProfileDto>(mappingProfilePath(format), { method: 'PUT', body })
}

/** Soft-deactivates the active profile. The row is retained so audit lineage stays queryable. */
export function deactivateMappingProfile(format: MappingFormat): Promise<void> {
  return apiRequest<void>(mappingProfilePath(format), { method: 'DELETE' })
}

/* ----------------------------------------------------------- guided mapping */

/** One source-to-target assignment as the server stores it. */
export type GuidedMappingEntryDto = {
  businessTermId: string
  sourcePath: string | null
  /** JSONata fragment with the source value bound to `$src`, or null to take the value as-is. */
  transform: string | null
  defaultValue: string | null
  ordinal: number
  /** Resolved server-side. Display only — it is deliberately not accepted on the way in. */
  canonicalPath: string | null
}

/** One entry on the way in. `canonicalPath` is absent by design: the server resolves the target. */
export type GuidedMappingEntryRequest = {
  businessTermId: string
  sourcePath?: string | null
  transform?: string | null
  defaultValue?: string | null
  ordinal: number
}

/** Why one entry was refused. Stable codes; the UI keys its copy off these, never off `message`. */
export type GuidedMappingErrorCode =
  | 'UNKNOWN_BUSINESS_TERM'
  | 'TARGET_NOT_MAPPABLE'
  | 'DUPLICATE_SINGLETON_TARGET'
  | 'DUPLICATE_REPEATED_TARGET'
  | 'SOURCE_REPEATS_DEEPER_THAN_TARGET'
  | 'REPETITION_ROOT_MISMATCH'
  | 'UNSUPPORTED_TARGET'
  | 'CONFLICTING_TARGET_PATH'
  | 'MALFORMED_SOURCE_PATH'
  | 'MALFORMED_TRANSFORM'
  | 'MISSING_SOURCE'

export type GuidedMappingInvalidEntryDto = {
  businessTermId: string | null
  sourcePath: string | null
  errorCode: GuidedMappingErrorCode
  message: string
}

/**
 * An invoice kind guided mapping cannot express at all, whatever the tenant maps.
 *
 * Present on every answer, ready or not, because the case it exists for is precisely a *ready* one:
 * every mandatory term mapped and still unable to produce a goods, foreign-currency or
 * period invoice. A screen rendering `readyForActivation` without these shows a green light that
 * is true about the mandatory fields and misleading about what the tenant can actually ship.
 */
export type MappingCoverageLimitDto = {
  id: string
  summary: string
  businessTermIds: string[]
  guidance: string
}

/** A ruleset-mandated per-item term left unmapped. Informative, not a refusal. */
export type MappingConditionalGapDto = {
  businessTermId: string
  rule: string
  message: string
}

/** `GuidedMappingValidationResponse` — the whole answer, never a bare boolean. */
export type GuidedMappingValidationDto = {
  /** Nothing is wrong with what is there, so this may be persisted as a draft. */
  valid: boolean
  /** Additionally nothing required is missing, so this may be compiled and published. */
  readyForActivation: boolean
  requiredTenantMappedTargets: string[]
  mappedRequiredTargets: string[]
  missingRequiredTargets: string[]
  optionalMappedTargets: string[]
  invalidMappings: GuidedMappingInvalidEntryDto[]
  warnings: string[]
  coverageLimits: MappingCoverageLimitDto[]
  conditionalGaps: MappingConditionalGapDto[]
}

export type GuidedMappingDto = {
  format: MappingFormat
  sourceSystem: MappingSourceSystem
  /** Echo this as `expectedVersion` on the next save. The whole of the concurrency contract. */
  version: number
  mappings: GuidedMappingEntryDto[]
  /** Travels with the mapping so a reloaded draft shows the same progress the server would report. */
  readiness: GuidedMappingValidationDto
}

export type GuidedMappingRequest = {
  sourceSystem: MappingSourceSystem
  /**
   * The version last read, or null when creating. Omitting it on an existing mapping is refused
   * rather than treated as an overwrite: a wizard with two tabs open is ordinary, and a lost
   * mapping cannot be recovered from the compiled profile alone.
   */
  expectedVersion: number | null
  mappings: GuidedMappingEntryRequest[]
}

export function guidedMappingPath(format: MappingFormat): string {
  return `${BASE}/${format}/guided`
}

/** 404 when the tenant has not started a guided mapping for this format. */
export function loadGuidedMapping(format: MappingFormat): Promise<GuidedMappingDto> {
  return apiRequest<GuidedMappingDto>(guidedMappingPath(format))
}

/**
 * Saves the draft, and compiles it into the executable profile once it is complete.
 *
 * Returns the validation result rather than the stored mapping: after a save the only thing the
 * wizard needs is what is still outstanding, and echoing back what was just sent invites a client
 * to trust its own copy.
 *
 * A structurally invalid entry is refused with a 400 — an unknown term, a non-mappable target, a
 * duplicate singleton, a source path that is really expression syntax, a transform the engine
 * cannot parse. An *incomplete* draft is saved, not refused. A stale `expectedVersion` is a 409.
 */
export function saveGuidedMapping(
  format: MappingFormat,
  body: GuidedMappingRequest,
): Promise<GuidedMappingValidationDto> {
  return apiRequest<GuidedMappingValidationDto>(guidedMappingPath(format), { method: 'PUT', body })
}

/** Checks a mapping without storing it, so a wizard can validate as the user works. */
export function validateGuidedMapping(
  format: MappingFormat,
  body: GuidedMappingRequest,
  options: { signal?: AbortSignal } = {},
): Promise<GuidedMappingValidationDto> {
  return apiRequest<GuidedMappingValidationDto>(`${guidedMappingPath(format)}/validate`, {
    method: 'POST',
    body,
    signal: options.signal,
  })
}

/** Archives the guided mapping, freeing its (tenant, format) slot. The profile is untouched. */
export function archiveGuidedMapping(format: MappingFormat): Promise<void> {
  return apiRequest<void>(guidedMappingPath(format), { method: 'DELETE' })
}

/* ----------------------------------------------------------------- dry run */

export type MappingDryRunRequest = {
  /** The tenant-native sample payload, carried verbatim — the same shape a real submission sends. */
  document: unknown
  /** An unsaved expression to test. Omit to run the tenant's stored active profile. */
  content?: string
}

/**
 * `MappingProfileDryRunResponse`. Snake_case on the wire.
 *
 * `canonicalInvoice` is the Canonical Invoice Model the expression produced, and it is the
 * authority: a screen may format, group, collapse or highlight it, but must not recompute any of
 * it. Reimplementing the mapping in the browser would give a preview that disagrees with what the
 * engine will actually emit, which is worse than no preview.
 */
export type MappingDryRunDto = {
  canonical_invoice: unknown
  content_hash: string
  /** `STORED` ran the live profile; `SUPPLIED` ran an expression that was never persisted. */
  mapping_source: 'STORED' | 'SUPPLIED'
}

/**
 * Runs a sample payload through the mapping engine and returns the canonical result.
 *
 * **Side-effect free.** No invoice is created or issued, no ledger row is written, no invoice
 * number is consumed, nothing is dispatched over AS4, no certification state changes, and a
 * supplied expression is never persisted and never displaces the live profile. That is what makes
 * it safe to run repeatedly while iterating.
 *
 * A clean result proves the mapping yields a valid canonical invoice. It does **not** prove the
 * document would pass the five-layer validation — this stops before generation. Certification is
 * the only thing that answers that.
 */
export function dryRunMappingProfile(
  format: MappingFormat,
  body: MappingDryRunRequest,
): Promise<MappingDryRunDto> {
  return apiRequest<MappingDryRunDto>(`${mappingProfilePath(format)}/dry-run`, {
    method: 'POST',
    body,
  })
}

/** As {@link dryRunMappingProfile}, but compiles the saved guided mapping first. 409 if incomplete. */
export function dryRunGuidedMapping(
  format: MappingFormat,
  body: MappingDryRunRequest,
): Promise<MappingDryRunDto> {
  return apiRequest<MappingDryRunDto>(`${guidedMappingPath(format)}/dry-run`, {
    method: 'POST',
    body,
  })
}

/* ---------------------------------------------------------- certification */

/** `PintOmDocumentKind`. */
export type MappingDocumentKind =
  | 'STANDARD_INVOICE'
  | 'CREDIT_NOTE'
  | 'SELF_BILLING_INVOICE'
  | 'SELF_BILLING_CREDIT_NOTE'

/** `SubmissionRoute` — which production endpoint a certification run rehearses. */
export type MappingCertificationRoute = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SELF_BILLING'

export const MAPPING_CERTIFICATION_ROUTES: MappingCertificationRoute[] = [
  'INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'SELF_BILLING',
]

/** One validation finding, as the report lists them. */
export type MappingFindingDto = {
  severity: string | null
  layer: string | null
  rule_id: string | null
  /** The business term the rule names, when it names one. */
  field_id: string | null
  xpath: string | null
  message: string | null
}

/**
 * `TestInvoiceReportResponse` — the pass/fail report FR-005 requires the tenant be shown.
 *
 * Read `passed` directly. It is published as its own field precisely so a client never has to
 * derive "may I go live?" from the `stage` vocabulary, because getting that wrong in the
 * permissive direction means telling a tenant to ship invoices the gate will refuse.
 */
export type MappingTestInvoiceReportDto = {
  passed: boolean
  stage: 'PASSED' | 'TRANSFORMATION' | 'REQUEST' | 'VALIDATION' | 'BLOCKED'
  failed_at: string | null
  error_count: number
  warning_count: number
  errors: MappingFindingDto[]
  /** Carried on a pass too: warnings do not block, but a tenant about to go live should see them. */
  warnings: MappingFindingDto[]
  message: string | null
  content_hash: string | null
  profile_id: string | null
}

/**
 * `CertificationStatusResponse` — whether the tenant's *current* mapping may send production
 * traffic of one document kind, on one route, for one transaction scope.
 *
 * The interesting failure is the mismatch: a tenant who certified and then edited sees a
 * `certified_content_hash` that no longer equals `active_content_hash`, which is exactly why
 * submission started being refused. Render both; never infer certification from anything else.
 */
export type MappingCertificationStatusDto = {
  certified: boolean
  format: MappingFormat
  document_kind: MappingDocumentKind
  route: MappingCertificationRoute
  transaction_scope: string
  active_content_hash: string | null
  certified_content_hash: string | null
  certified_at: string | null
  profile_id: string | null
  /** Why not certified, when it is not. Prose — display it, never branch on it. */
  reason: string | null
}

/** One recorded attempt. Failures are retained deliberately, so history is the dossier. */
export type MappingCertificationHistoryDto = {
  id: string
  verdict: 'PASSED' | 'FAILED'
  stage: string
  failed_at: string | null
  error_count: number
  warning_count: number
  summary: string | null
  content_hash: string
  profile_id: string | null
  document_kind: MappingDocumentKind
  route: MappingCertificationRoute
  transaction_type: string
  transaction_scope: string
  certified_at: string
}

export type MappingCertificationQuery = {
  documentKind?: MappingDocumentKind
  route?: MappingCertificationRoute
  /** BTOM-001 bitmap, `^[X1]{20}$`. Defaults server-side to the plain full-tax bitmap. */
  transactionType?: string
}

export function certificationStatusPath(
  format: MappingFormat,
  query: MappingCertificationQuery = {},
): string {
  return withQuery(`${mappingProfilePath(format)}/certification`, {
    document_kind: query.documentKind,
    route: query.route,
    transaction_type: query.transactionType,
  })
}

export function loadCertificationStatus(
  format: MappingFormat,
  query: MappingCertificationQuery = {},
): Promise<MappingCertificationStatusDto> {
  return apiRequest<MappingCertificationStatusDto>(certificationStatusPath(format, query))
}

export function certificationHistoryPath(format: MappingFormat, limit = 50): string {
  return withQuery(`${mappingProfilePath(format)}/certification/history`, { limit })
}

/** Bounded: failed attempts accumulate by design, so an onboarding tenant builds a long tail. */
export function loadCertificationHistory(
  format: MappingFormat,
  limit = 50,
): Promise<MappingCertificationHistoryDto[]> {
  return apiRequest<MappingCertificationHistoryDto[]>(certificationHistoryPath(format, limit))
}

/**
 * The body a certification run takes — the same envelope `POST /v1/invoices` takes, because the
 * run rehearses that exact request. The supplement carries the PINT-OM fields no mapping can
 * produce.
 */
export type MappingCertificationRunRequest = {
  format?: MappingFormat
  document: unknown
  document_kind?: MappingDocumentKind
  supplement: {
    issue_time: string
    /** BTOM-001, `^[X1]{20}$`. */
    transaction_type: string
    preceding_invoice_number?: string | null
    preceding_invoice_date?: string | null
    preceding_invoice_uuid?: string | null
    credit_note_reason_code?: string | null
    profit_margin?: boolean
  }
}

/**
 * Runs a test invoice against the tenant's mapping and returns the report.
 *
 * **Produces no invoice**: nothing is dispatched, no ledger row is written and no invoice number
 * is consumed, which is what makes it safe to run repeatedly during onboarding.
 *
 * A *failing* test is a 200 carrying the report, not an error. It is the expected outcome while a
 * tenant iterates, and treating it as a failure would bury the findings they are here for. Only a
 * malformed request is a 4xx.
 */
export function runMappingCertification(
  format: MappingFormat,
  route: MappingCertificationRoute,
  body: MappingCertificationRunRequest,
): Promise<MappingTestInvoiceReportDto> {
  return apiRequest<MappingTestInvoiceReportDto>(
    withQuery(`${mappingProfilePath(format)}/certification`, { route }),
    { method: 'POST', body },
  )
}
