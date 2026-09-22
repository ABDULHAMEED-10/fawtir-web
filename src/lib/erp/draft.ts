import type {
  GuidedMappingDto,
  GuidedMappingEntryRequest,
  GuidedMappingInvalidEntryDto,
  GuidedMappingValidationDto,
  MappingSourceSystem,
} from '../../api/erp/mapping'

/**
 * The guided mapping as the Fields editor holds it while the reader works.
 *
 * Exactly the shape the server accepts and nothing more. The design mock's entry also carried
 * `valueMap`, `valueMapDefault` and `onUnmapped`; the compiler takes a source path, an optional
 * JSONata transform and a default, and has no field for any of the three — so they are absent here
 * rather than collected and dropped on the way out, which would lose a reader's work silently.
 * See `VALUE_MAPS` in `UNSUPPORTED_CAPABILITIES`.
 */
export type DraftEntry = GuidedMappingEntryRequest

export type Draft = {
  sourceSystem: MappingSourceSystem
  entries: DraftEntry[]
  /** The version the draft was read at. Sent back as `expectedVersion` so a lost update is a 409. */
  version: number | null
}

/** The editor's starting point: the stored mapping, or an empty draft when there is none. */
export function draftOf(guided: GuidedMappingDto | null): Draft {
  if (!guided) return { sourceSystem: 'ODOO', entries: [], version: null }
  return {
    sourceSystem: guided.sourceSystem,
    entries: guided.mappings.map((entry) => ({
      businessTermId: entry.businessTermId,
      sourcePath: entry.sourcePath,
      transform: entry.transform,
      defaultValue: entry.defaultValue,
      ordinal: entry.ordinal,
    })),
    version: guided.version,
  }
}

/** An entry with nothing in it is not an entry — the row drops out of the draft. */
export function isBlank(entry: DraftEntry): boolean {
  return !entry.sourcePath && !entry.defaultValue && !entry.transform
}

/**
 * Empty strings never reach the server; they mean "not set".
 *
 * The server refuses an entry carrying neither a source path nor a default (`MISSING_SOURCE`, and
 * a CHECK constraint behind it), so sending `""` would turn an untouched row into a refusal.
 */
export function normalise(entry: DraftEntry): DraftEntry {
  const next: DraftEntry = { ...entry }
  if (!next.sourcePath) delete next.sourcePath
  if (!next.defaultValue) delete next.defaultValue
  // Null as well as blank: a stored entry arrives with `transform: null`, and keeping it would
  // send an explicit null where the field means "there is no transform".
  if (!next.transform || !next.transform.trim()) delete next.transform
  return next
}

/** Renumbers ordinals to the drawn order, so a regenerated expression is byte-stable. */
export function withOrdinals(entries: DraftEntry[]): DraftEntry[] {
  return entries.map((entry, index) => ({ ...entry, ordinal: index }))
}

export function errorsFor(
  invalid: GuidedMappingInvalidEntryDto[],
  businessTermId: string,
): GuidedMappingInvalidEntryDto[] {
  return invalid.filter((entry) => entry.businessTermId === businessTermId)
}

/**
 * What came back from a save.
 *
 * Three outcomes, because the server has three. A *refusal* is an HTTP 400 carrying one sentence —
 * the service throws on the first structurally invalid entry, so the refusal does not carry the
 * whole validation document. The full list comes from the validate route, which answers 200 even
 * when the mapping is invalid; that is why the screen keeps the last validation beside this.
 */
export type SaveOutcome =
  | { status: 'refused'; message: string }
  | { status: 'draft'; readiness: GuidedMappingValidationDto }
  | { status: 'activated'; readiness: GuidedMappingValidationDto }

export function isDirty(draft: Draft, baseline: Draft): boolean {
  return (
    draft.sourceSystem !== baseline.sourceSystem ||
    JSON.stringify(draft.entries) !== JSON.stringify(baseline.entries)
  )
}

/**
 * The hand-written expression the reader is part-way through, held for this visit.
 *
 * Parked in memory so leaving Advanced for the field wizard and coming back does not lose an
 * hour's work. Deliberately not in `localStorage`: an expression is the tenant's own logic, and
 * the browser is not where Fawtir keeps tenant material.
 */
let handWrittenDraft = ''

export const handWritten = {
  read(): string {
    return handWrittenDraft
  },
  write(text: string) {
    handWrittenDraft = text
  },
  clear() {
    handWrittenDraft = ''
  },
}
