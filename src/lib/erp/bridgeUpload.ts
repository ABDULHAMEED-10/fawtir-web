import { ApiError, NetworkError } from '../../api'
import type { BridgeFormat, BridgeUploadRequest } from '../../api/erp/bridge'

/**
 * The gateway refuses a submission body over 4 MiB before it reaches the service. The check here
 * is on the serialised request, not the file: an XML file is escaped into a JSON string on the way,
 * so the body can be larger than the file it came from.
 */
export const BRIDGE_MAX_BODY_BYTES = 4 * 1024 * 1024

/** What the file picker offers for each format. The server decides; this only narrows the picker. */
export const BRIDGE_ACCEPT: Record<BridgeFormat, string> = {
  JSON: '.json,application/json',
  XML: '.xml,application/xml,text/xml',
}

export const BRIDGE_ID_MAX = 200
export const BRIDGE_VERSION_MAX = 80

export type BridgeDocumentProblem = 'empty' | 'notJson' | 'notObject' | 'notXml'

/**
 * Reads the chosen file into the shape the request carries for its format.
 *
 * Read in the browser only because the route takes the document inside a JSON body and has no
 * file part. Nothing here is stored: the content lives in component state until the upload or the
 * page is left.
 */
/** A leading byte-order mark, written by code so no editor or formatter can turn it invisible. */
const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`)

export async function readBridgeDocument(
  file: File,
  format: BridgeFormat,
): Promise<
  | { ok: true; document: Record<string, unknown> | string }
  | { ok: false; problem: BridgeDocumentProblem }
> {
  const text = await file.text()
  if (text.trim() === '') return { ok: false, problem: 'empty' }
  if (format === 'XML') {
    // A byte-order mark is not markup; anything else before the first tag is.
    return text.replace(BYTE_ORDER_MARK, '').trimStart().startsWith('<')
      ? { ok: true, document: text }
      : { ok: false, problem: 'notXml' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, problem: 'notJson' }
  }
  // The server reads a JSON document as an object. An array or a bare value would be refused
  // there; saying so here costs nothing and saves the round trip.
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ok: true, document: parsed as Record<string, unknown> }
    : { ok: false, problem: 'notObject' }
}

export function bridgeBodyBytes(request: BridgeUploadRequest): number {
  return new TextEncoder().encode(JSON.stringify(request)).length
}

/** `HH:mm`, the form the issue-time field holds. */
export function isIssueTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/* ------------------------------------------------------------------ refusals */

/** The validation layers, as the submission route names them. */
export const VALIDATION_LAYERS = [
  'L1_XSD',
  'L2_ARITHMETIC',
  'L3_CODE_LISTS',
  'L4_EN16931_BIS',
  'L5_PINT_OM',
] as const
export type ValidationLayerName = (typeof VALIDATION_LAYERS)[number]

/**
 * One refusal from the validator, as this screen shows it: which layer, which rule, which field.
 *
 * Never the validator's message or location. A schema parser quotes the value it rejected and a
 * Schematron assertion may embed document content; the rule and the field say which check failed
 * without repeating any of the document back.
 */
export type BridgeFinding = {
  layer: ValidationLayerName | null
  rule: string | null
  field: string | null
}

/** Findings shown at most; the rest are summarised as a count. */
export const BRIDGE_MAX_FINDINGS = 50

const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const BUSINESS_TERM = /^(IBT|IBG|BT|BG|BTOM|BGOM)-[0-9]{1,4}(-[0-9]{1,4})?$/

export type BridgeRefusal =
  | { kind: 'validation'; findings: BridgeFinding[]; more: number }
  | {
      kind:
        | 'mapping'
        | 'notSupported'
        | 'identityConflict'
        | 'inProgress'
        | 'alreadyRefused'
        | 'duplicateInvoice'
        | 'idempotency'
        | 'notOperational'
        | 'emissionBlocked'
        | 'tooLarge'
        | 'notJsonBody'
        | 'unreachable'
    }
  | { kind: 'other' }

/**
 * What a failed upload means, in the vocabulary the screen has words for.
 *
 * Decided on the status and the refusal code the route sends, never on message text: the
 * route's messages are English prose for developers, and branching on them would break the first
 * time one is reworded. Anything not recognised is `other`, which the screen renders with the
 * shared failure text and the support reference.
 */
export function classifyBridgeFailure(error: unknown): BridgeRefusal {
  if (error instanceof NetworkError) return { kind: 'unreachable' }
  if (!(error instanceof ApiError)) return { kind: 'other' }
  switch (error.code) {
    case 'VALIDATION_FAILED':
      return validationRefusal(error.problem)
    case 'MAPPING_FAILED':
      return { kind: 'mapping' }
    case 'SUBMISSION_NOT_SUPPORTED':
      return { kind: 'notSupported' }
    case 'SOURCE_IDENTITY_CONFLICT':
      return { kind: 'identityConflict' }
    case 'SOURCE_DOCUMENT_IN_PROGRESS':
      return { kind: 'inProgress' }
    case 'SOURCE_DOCUMENT_ALREADY_REFUSED':
      return { kind: 'alreadyRefused' }
    case 'DUPLICATE_INVOICE':
      return { kind: 'duplicateInvoice' }
    case 'DUPLICATE_IDEMPOTENCY':
      return { kind: 'idempotency' }
    case 'TENANT_NOT_OPERATIONAL':
      return { kind: 'notOperational' }
    case 'EMISSION_BLOCKED':
      return { kind: 'emissionBlocked' }
  }
  if (error.status === 413) return { kind: 'tooLarge' }
  if (error.status === 415) return { kind: 'notJsonBody' }
  return { kind: 'other' }
}

function validationRefusal(problem: Readonly<Record<string, unknown>>): BridgeRefusal {
  const findings: BridgeFinding[] = []
  let total = 0
  const layers = Array.isArray(problem.layer_results) ? problem.layer_results : []
  for (const layer of layers) {
    if (layer === null || typeof layer !== 'object') continue
    const entry = layer as Record<string, unknown>
    const name = VALIDATION_LAYERS.find((known) => known === entry.layer_name) ?? null
    const issues = Array.isArray(entry.issues) ? entry.issues : []
    for (const issue of issues) {
      if (issue === null || typeof issue !== 'object') continue
      const fields = issue as Record<string, unknown>
      if (fields.severity !== 'ERROR') continue
      total += 1
      if (findings.length < BRIDGE_MAX_FINDINGS) {
        findings.push({
          layer: name,
          rule: identifier(fields.rule, RULE_ID),
          field: identifier(fields.field_id, BUSINESS_TERM),
        })
      }
    }
  }
  return { kind: 'validation', findings, more: total - findings.length }
}

/** The value when it has the shape of an identifier, and nothing otherwise. */
function identifier(value: unknown, shape: RegExp): string | null {
  return typeof value === 'string' && shape.test(value.trim()) ? value.trim() : null
}
