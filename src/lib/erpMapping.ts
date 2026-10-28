import { useSyncExternalStore } from 'react'
import {
  COVERAGE_LIMITS,
  MAPPABLE_TARGETS,
  REQUIRED_TARGETS,
  SOURCE_PATH,
  SOURCE_PATH_MAX,
  TARGET_BY_ID,
  TRANSFORM_PRESETS,
  type CoverageLimit,
  type Target,
  type TransformPresetId,
} from './erpCatalogue'
import { EXEMPTION_LISTS, codeIn } from './erpCodeLists'
import { COMPANY, TODAY } from './settings'

/**
 * A tenant's ERP mapping, as Settings › Integration › ERP mapping sees it (docs/erp-and-console-
 * plan.md §2 and Appendix A; ERP_MAPPING_SPEC-2026-09-11).
 *
 * The backend owns the real thing — the guided mapping, its compiled JSONata profile, the
 * certification evidence keyed by that profile's hash. This module stands in for it with the same
 * shapes and the same rules, so the screens are drawn against what will actually run: the
 * validator's error codes, the dry-run's canonical paths, the certification's findings.
 *
 * Al Bahja's story: Odoo 17, a guided mapping that is complete and compiled, the Invoice route
 * certified, a Debit note attempt that failed on the preceding-invoice terms, Credit note and
 * Self-billing never tried. The clock is Settings' — Saturday 26 September 2026.
 */

export type SourceSystem = 'ORACLE' | 'SAP' | 'MICROSOFT_DYNAMICS' | 'ODOO' | 'ERPNEXT' | 'CUSTOM'
export const SOURCE_SYSTEMS: SourceSystem[] = [
  'ODOO',
  'ERPNEXT',
  'SAP',
  'ORACLE',
  'MICROSOFT_DYNAMICS',
  'CUSTOM',
]

export type OnUnmapped = 'FAIL' | 'USE_DEFAULT' | 'PASS_THROUGH'

export type Entry = {
  businessTermId: string
  sourcePath?: string
  defaultValue?: string
  /** JSONata on `$src`; the wizard's presets are these fragments. */
  transform?: string
  valueMap?: Record<string, string>
  valueMapDefault?: string
  onUnmapped: OnUnmapped
  ordinal: number
}

export type Sample = {
  id: string
  label: string
  payload: unknown
  byteSize: number
  sha256: string
  createdBy: string
  createdAt: Date
}

export type Revision = {
  id: string
  revisionNo: number
  origin: 'EDIT' | 'IMPORT' | 'RESTORE'
  entries: Entry[]
  entryCount: number
  compiledContentHash?: string
  readyForActivation: boolean
  savedBy: string
  savedAt: Date
  restoredFromRevisionNo?: number
}

export type Profile = {
  id: string
  contentHash: string
  erpKey: string
  version: number
  active: boolean
  origin: 'GUIDED' | 'HAND_WRITTEN'
  content: string
  createdAt: Date
}

export type CertRoute = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SELF_BILLING'
export const CERT_ROUTES: CertRoute[] = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING']
export const DOCUMENT_KIND: Record<CertRoute, string> = {
  INVOICE: 'STANDARD_INVOICE',
  CREDIT_NOTE: 'CREDIT_NOTE',
  DEBIT_NOTE: 'STANDARD_INVOICE',
  SELF_BILLING: 'SELF_BILLING_INVOICE',
}
/** BTOM-001, the 20-bit transaction type, defaulted by route (spec §9). */
export const DEFAULT_TRANSACTION_TYPE: Record<CertRoute, string> = {
  INVOICE: '10000000000000000000',
  CREDIT_NOTE: '10000000000000000000',
  DEBIT_NOTE: '10000000000000000000',
  SELF_BILLING: '00100000000000000000',
}
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

export type Finding = {
  ruleId: string
  messageKey: string
  values?: Record<string, string | number>
  field?: string
}

export type Attempt = {
  id: string
  route: CertRoute
  contentHash: string
  passed: boolean
  at: Date
  by: string
  sampleId: string
  transactionType: string
  findings: Finding[]
}

export type ErrorCode =
  | 'UNKNOWN_BUSINESS_TERM'
  | 'TARGET_NOT_MAPPABLE'
  | 'UNSUPPORTED_TARGET'
  | 'MISSING_SOURCE'
  | 'MALFORMED_SOURCE_PATH'
  | 'MALFORMED_TRANSFORM'
  | 'DUPLICATE_SINGLETON_TARGET'
  | 'REPEATED_TARGET_NOT_SUPPORTED'
  | 'CONFLICTING_TARGET_PATH'
  | 'INVALID_CODE_VALUE'
  | 'VALUE_MAP_TOO_LARGE'
  | 'MALFORMED_VALUE_MAP'
  | 'VALUE_MAP_NOT_ALLOWED'
  | 'VALUE_MAP_DEFAULT_REQUIRED'

export type InvalidMapping = {
  businessTermId: string
  sourcePath?: string
  errorCode: ErrorCode
  values?: Record<string, string | number>
}

export type Readiness = {
  valid: boolean
  readyForActivation: boolean
  requiredTargets: string[]
  mappedRequired: string[]
  missingRequiredTargets: string[]
  optionalMapped: number
  invalidMappings: InvalidMapping[]
  warnings: { key: string; values?: Record<string, string | number> }[]
  coverageLimits: CoverageLimit[]
}

export type AuditEvent = {
  id: string
  at: Date
  by: string
  actionKey: string
  values?: Record<string, string | number>
}

export type MappingState = {
  sourceSystem: SourceSystem
  entries: Entry[]
  /** Optimistic-lock version of the guided mapping. */
  version: number
  /** Null once "start over" has cleared everything — the empty state. */
  guided: boolean
  samples: Sample[]
  revisions: Revision[]
  profiles: Profile[]
  attempts: Attempt[]
  events: AuditEvent[]
  /** The hand-written editor's unsaved text survives leaving the screen. */
  handWrittenDraft: string
}

export const NOW = TODAY
export const OPERATOR = COMPANY.owner.name
const DAY = 24 * 60 * 60 * 1000
const at = (daysAgo: number, hour = 10, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}

/* -------------------------------------------------------------- hashing */

/** A stable 64-hex digest of a string; stands in for SHA-256 with the same shape. */
export function contentHash(text: string): string {
  let out = ''
  for (let seed = 0; seed < 8; seed += 1) {
    let h = 0x811c9dc5 ^ (seed * 0x9e3779b1)
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    out += h.toString(16).padStart(8, '0')
  }
  return out
}

export const shortHash = (hash: string) => hash.slice(0, 8)

/* ------------------------------------------------------------ the samples */

/** The shape Fawtir's Odoo adapter emits (ERP_CONNECTOR_SPEC §4.1) — what the tenant maps from. */
const ODOO_INVOICE = {
  schema: 'fawtir.erp-invoice/odoo/1',
  erp: {
    id: 4821,
    name: 'INV/2026/0117',
    move_type: 'out_invoice',
    invoice_date: '2026-09-03',
    invoice_date_due: '2026-10-03',
    currency: 'OMR',
    partner: {
      name: 'Muscat Grand Hotel LLC',
      vat: 'om1100447102',
      street: 'Shatti Al Qurum',
      street2: 'Way 3025',
      city: 'Muscat',
      zip: '134',
      country_code: 'OM',
      phone: '+968 2460 0100',
    },
    lines: [
      {
        id: 9001,
        name: 'Catering, coffee service, September',
        quantity: 40,
        uom: 'Hours',
        price_unit: 6.25,
        discount: 0,
        tax_code: 'VAT5',
        tax_rate: 5,
        subtotal: 250,
        tax_amount: 12.5,
        total: 262.5,
        product: { default_code: 'SRV-01', kind: 'service', hs_code: null },
      },
      {
        id: 9002,
        name: 'Barista, extra shift',
        quantity: 2,
        uom: 'Units',
        price_unit: 18,
        discount: 0,
        tax_code: 'VAT5',
        tax_rate: 5,
        subtotal: 36,
        tax_amount: 1.8,
        total: 37.8,
        product: { default_code: 'SRV-04', kind: 'service', hs_code: null },
      },
    ],
    amount_untaxed: 286,
    amount_tax: 14.3,
    amount_total: 300.3,
    amount_residual: 300.3,
    payment_term: 'Net 30',
    ref: 'PO-88213',
    reversed_entry: null,
    write_date: '2026-09-03T07:41:12Z',
  },
  meta: { collectedAt: '2026-09-03T08:00:04Z' },
}

const ODOO_CREDIT_NOTE = {
  schema: 'fawtir.erp-invoice/odoo/1',
  erp: {
    id: 4870,
    name: 'RINV/2026/0031',
    move_type: 'out_refund',
    invoice_date: '2026-09-18',
    invoice_date_due: '2026-09-18',
    currency: 'OMR',
    partner: {
      name: 'Al Noor Trading LLC',
      vat: 'OM1100447102',
      street: 'Al Khuwair',
      street2: 'Way 4471',
      city: 'Muscat',
      zip: '133',
      country_code: 'OM',
      phone: '+968 9912 3344',
    },
    lines: [
      {
        id: 9120,
        name: 'Yirgacheffe, 1 kg bag (returned)',
        quantity: 4,
        uom: 'kg',
        price_unit: 11.4,
        discount: 0,
        tax_code: 'VAT5',
        tax_rate: 5,
        subtotal: 45.6,
        tax_amount: 2.28,
        total: 47.88,
        product: { default_code: 'CAT-0111', kind: 'product', hs_code: null },
      },
    ],
    amount_untaxed: 45.6,
    amount_tax: 2.28,
    amount_total: 47.88,
    amount_residual: 0,
    payment_term: 'Immediate',
    ref: 'RMA-0142',
    reversed_entry: {
      name: 'INV/2026/0102',
      invoice_date: '2026-08-21',
      uuid: '8f3c44a1-9d02-5e77-9be0-7c1a2d3e4f50',
      reason: 'return',
    },
    write_date: '2026-09-18T11:02:40Z',
  },
  meta: { collectedAt: '2026-09-18T11:30:00Z' },
}

const sample = (
  id: string,
  label: string,
  payload: unknown,
  daysAgo: number,
  by = OPERATOR,
): Sample => {
  const text = JSON.stringify(payload)
  return {
    id,
    label,
    payload,
    byteSize: text.length,
    sha256: contentHash(text),
    createdBy: by,
    createdAt: at(daysAgo, 9, 20),
  }
}

/* ------------------------------------------------------------ the entries */

const e = (
  businessTermId: string,
  sourcePath?: string,
  extra: Partial<Entry> = {},
): Omit<Entry, 'ordinal'> => ({
  businessTermId,
  sourcePath,
  onUnmapped: 'FAIL',
  ...extra,
})

/** The Odoo starter template, completed by Al Bahja: constants for what Odoo does not hold. */
const ODOO_ENTRIES: Omit<Entry, 'ordinal'>[] = [
  e('IBT-001', 'erp.name'),
  e('IBT-002', 'erp.invoice_date'),
  e('IBT-003', 'erp.move_type', { valueMap: { out_invoice: '380', out_refund: '381' } }),
  e('IBT-005', 'erp.currency'),
  e('IBT-009', 'erp.invoice_date_due'),
  e('IBT-013', 'erp.ref'),
  e('IBT-025', 'erp.reversed_entry.name'),
  e('IBT-026', 'erp.reversed_entry.invoice_date'),
  e('BTOM-031', 'erp.reversed_entry.uuid'),
  e('BTOM-032', 'erp.reversed_entry.reason', {
    valueMap: { return: 'QTY', price: 'VAL', cancel: 'CAN' },
    valueMapDefault: 'OTH',
    onUnmapped: 'USE_DEFAULT',
  }),
  e('IBT-027', undefined, { defaultValue: COMPANY.legalName }),
  e('IBT-028', undefined, { defaultValue: COMPANY.tradingAs }),
  e('IBT-030', undefined, { defaultValue: COMPANY.commercialRegistration }),
  e('IBT-031', undefined, { defaultValue: COMPANY.vatNumber }),
  e('IBT-035', undefined, { defaultValue: COMPANY.street }),
  e('IBT-036', undefined, { defaultValue: 'Al Aqr' }),
  e('IBT-162', undefined, { defaultValue: 'Ad Dakhiliyah' }),
  e('IBT-037', undefined, { defaultValue: COMPANY.town }),
  e('IBT-038', undefined, { defaultValue: COMPANY.postalCode }),
  e('IBT-040', undefined, { defaultValue: 'OM' }),
  e('IBT-042', undefined, { defaultValue: COMPANY.phone }),
  e('IBT-049', 'erp.partner.vat', { transform: '$uppercase($trim($src))' }),
  e('IBT-049-1', undefined, { defaultValue: '0248' }),
  e('IBT-044', 'erp.partner.name'),
  e('IBT-048', 'erp.partner.vat', { transform: '$uppercase($trim($src))' }),
  e('IBT-050', 'erp.partner.street'),
  e('IBT-051', 'erp.partner.street2'),
  e('IBT-052', 'erp.partner.city'),
  e('IBT-053', 'erp.partner.zip'),
  e('IBT-055', 'erp.partner.country_code'),
  e('IBT-118', undefined, { defaultValue: 'S' }),
  e('IBT-119', undefined, { defaultValue: '5' }),
  e('IBT-126', 'erp.lines[].id'),
  e('IBT-129', 'erp.lines[].quantity', { transform: '$abs($number($src))' }),
  e('IBT-130', 'erp.lines[].uom', {
    valueMap: { Units: 'C62', Hours: 'HUR', kg: 'KGM', Bag: 'XBG', Box: 'XBX' },
    valueMapDefault: 'C62',
    onUnmapped: 'USE_DEFAULT',
  }),
  e('IBT-131', 'erp.lines[].subtotal'),
  e('IBT-146', 'erp.lines[].price_unit'),
  e('IBT-151', 'erp.lines[].tax_code', {
    valueMap: { VAT5: 'S', EXEMPT: 'E', ZERO: 'Z', OOS: 'O' },
  }),
  e('IBT-152', 'erp.lines[].tax_rate'),
  e('IBT-153', 'erp.lines[].name'),
  e('IBT-155', 'erp.lines[].product.default_code'),
  e('BTOM-019', 'erp.lines[].product.kind', {
    valueMap: { product: 'G', service: 'S', consu: 'G' },
  }),
  e('BTOM-033', undefined, { defaultValue: '561010' }),
  e('BTOM-016', 'erp.lines[].tax_amount'),
  e('BTOM-017', 'erp.lines[].total'),
  e('IBT-081', undefined, { defaultValue: '30' }),
  e('IBT-020', 'erp.payment_term'),
  e('IBT-106', 'erp.amount_untaxed'),
  e('IBT-109', 'erp.amount_untaxed'),
  e('IBT-110', 'erp.amount_tax'),
  e('IBT-112', 'erp.amount_total'),
  e('IBT-115', 'erp.amount_residual'),
]

export const withOrdinals = (entries: Omit<Entry, 'ordinal'>[]): Entry[] =>
  entries.map((entry, ordinal) => ({ ...entry, ordinal }))

/* ------------------------------------------------------------ validation */

const balanced = (text: string) => {
  let depth = 0
  for (const ch of text) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

/** The backend's structural validator, rule for rule (spec §8.3, Appendix A.2). */
export function validate(entries: Entry[]): Readiness {
  const invalid: InvalidMapping[] = []
  const warnings: Readiness['warnings'] = []
  const seen = new Map<string, number>()

  for (const entry of entries) {
    const target = TARGET_BY_ID[entry.businessTermId]
    const bad = (errorCode: ErrorCode, values?: Record<string, string | number>) =>
      invalid.push({
        businessTermId: entry.businessTermId,
        sourcePath: entry.sourcePath,
        errorCode,
        values,
      })

    if (!target) {
      bad('UNKNOWN_BUSINESS_TERM')
      continue
    }
    if (target.origin !== 'TENANT_MAPPED') bad('TARGET_NOT_MAPPABLE')
    if (!entry.sourcePath && !entry.defaultValue) bad('MISSING_SOURCE')
    if (
      entry.sourcePath &&
      (!SOURCE_PATH.test(entry.sourcePath) || entry.sourcePath.length > SOURCE_PATH_MAX)
    )
      bad('MALFORMED_SOURCE_PATH')
    if (entry.transform !== undefined && (!entry.transform.trim() || !balanced(entry.transform)))
      bad('MALFORMED_TRANSFORM')

    const count = (seen.get(entry.businessTermId) ?? 0) + 1
    seen.set(entry.businessTermId, count)
    if (count === 2)
      bad(target.repeatable ? 'REPEATED_TARGET_NOT_SUPPORTED' : 'DUPLICATE_SINGLETON_TARGET')

    if (entry.valueMap) {
      const pairs = Object.entries(entry.valueMap)
      if (!target.codeList && !target.lookup) bad('VALUE_MAP_NOT_ALLOWED')
      if (pairs.length > 200 || pairs.some(([k, v]) => k.length > 128 || v.length > 128))
        bad('VALUE_MAP_TOO_LARGE')
      if (pairs.some(([k]) => !k.trim())) bad('MALFORMED_VALUE_MAP')
      if (entry.onUnmapped === 'USE_DEFAULT' && !entry.valueMapDefault)
        bad('VALUE_MAP_DEFAULT_REQUIRED')
      const values = [
        ...pairs.map(([, v]) => v),
        ...(entry.valueMapDefault ? [entry.valueMapDefault] : []),
      ]
      for (const value of values) {
        if (!codeAllowed(target, value))
          bad('INVALID_CODE_VALUE', { value, list: target.codeList ?? target.lookup ?? '' })
      }
      if (entry.transform)
        warnings.push({
          key: 'erp.warning.transformAfterMap',
          values: { term: entry.businessTermId },
        })
    }
  }

  const mapped = new Set(
    entries.filter((x) => x.sourcePath || x.defaultValue).map((x) => x.businessTermId),
  )
  const requiredTargets = REQUIRED_TARGETS.map((target) => target.id)
  const mappedRequired = requiredTargets.filter((id) => mapped.has(id))
  const missingRequiredTargets = requiredTargets.filter((id) => !mapped.has(id))
  const optionalMapped = [...mapped].filter((id) => !requiredTargets.includes(id)).length
  const valid = invalid.length === 0
  return {
    valid,
    readyForActivation: valid && missingRequiredTargets.length === 0,
    requiredTargets,
    mappedRequired,
    missingRequiredTargets,
    optionalMapped,
    invalidMappings: invalid,
    warnings,
    coverageLimits: COVERAGE_LIMITS,
  }
}

function codeAllowed(target: Target, value: string) {
  if (target.lookup === 'HS') return /^\d{12}$/.test(value)
  if (target.lookup === 'ISIC') return /^\d{6}$/.test(value)
  if (target.id === 'IBT-121') return EXEMPTION_LISTS.some((list) => codeIn(list, value))
  return target.codeList ? codeIn(target.codeList, value) : false
}

/* ---------------------------------------------------------- reading paths */

export type SampleKey = {
  path: string
  example: string
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'
}

/** Every path the picker can offer, flattened from a sample; `[]` marks a repeated element. */
export function flattenKeys(payload: unknown, prefix = ''): SampleKey[] {
  if (payload === null || typeof payload !== 'object') return []
  const out: SampleKey[] = []
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(value)) {
      out.push({ path: `${path}[]`, example: `${value.length} items`, type: 'array' })
      out.push(...flattenKeys(value[0], `${path}[]`))
    } else if (value !== null && typeof value === 'object') {
      out.push(...flattenKeys(value, path))
    } else {
      out.push({
        path,
        example: value === null ? 'null' : String(value),
        type: value === null ? 'null' : (typeof value as SampleKey['type']),
      })
    }
  }
  return out
}

/** The value at a dotted path; a `[]` takes the whole array (the caller picks the element). */
function read(payload: unknown, path: string, index?: number): unknown {
  let current: unknown = payload
  for (const step of path.split('.')) {
    if (current === null || current === undefined) return undefined
    const repeated = step.endsWith('[]')
    const key = repeated ? step.slice(0, -2) : step
    current = (current as Record<string, unknown>)[key]
    if (repeated) {
      if (!Array.isArray(current)) return undefined
      current = index === undefined ? current[0] : current[index]
    }
  }
  return current
}

const PRESET_BY_FRAGMENT = new Map<string, TransformPresetId>(
  TRANSFORM_PRESETS.map((preset) => [preset.fragment, preset.id]),
)

/** The presets, run in JavaScript; any other JSONata is left to the backend and passed through. */
function runTransform(
  fragment: string,
  src: unknown,
): { value: unknown; unknownTransform?: boolean } {
  const preset = PRESET_BY_FRAGMENT.get(fragment.trim())
  const text = src === undefined || src === null ? '' : String(src)
  switch (preset) {
    case 'dateDmy': {
      const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      return { value: m ? `${m[3]}-${m[2]}-${m[1]}` : src }
    }
    case 'dateEpoch': {
      const d = new Date(Number(text))
      return { value: Number.isNaN(d.getTime()) ? src : d.toISOString().slice(0, 10) }
    }
    case 'trimUpper':
      return { value: text.trim().toUpperCase() }
    case 'digitsOnly':
      return { value: text.replace(/\D/g, '') }
    case 'round3':
      return { value: Math.round(Number(text) * 1000) / 1000 }
    case 'round2':
      return { value: Math.round(Number(text) * 100) / 100 }
    case 'abs':
      return { value: Math.abs(Number(text)) }
    case 'percentFromFraction':
      return { value: Math.round(Number(text) * 100 * 100) / 100 }
    default:
      return { value: src, unknownTransform: true }
  }
}

export type DryRunError = {
  field: string
  businessTermId?: string
  messageKey: string
  values?: Record<string, string | number>
}

export type DryRunResult = {
  canonical: Record<string, unknown> | null
  errors: DryRunError[]
  notes: DryRunError[]
}

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const steps = path.split('.')
  let current = root
  steps.forEach((step, i) => {
    if (i === steps.length - 1) {
      current[step] = value
      return
    }
    if (typeof current[step] !== 'object' || current[step] === null) current[step] = {}
    current = current[step] as Record<string, unknown>
  })
}

/** Evaluation order per entry (spec §8.1): raw → value map → transform → default. */
function evaluate(
  entry: Entry,
  target: Target,
  payload: unknown,
  index: number | undefined,
  errors: DryRunError[],
  notes: DryRunError[],
) {
  const field = target.canonicalPath.replace('[]', index === undefined ? '' : `[${index}]`)
  const raw = entry.sourcePath ? read(payload, entry.sourcePath, index) : undefined
  let value: unknown = raw
  if (entry.valueMap && raw !== undefined && raw !== null) {
    const key = String(raw)
    if (key in entry.valueMap) value = entry.valueMap[key]
    else if (entry.onUnmapped === 'USE_DEFAULT') value = entry.valueMapDefault
    else if (entry.onUnmapped === 'PASS_THROUGH') value = raw
    else {
      errors.push({
        field,
        businessTermId: target.id,
        messageKey: 'erp.dryRun.valueUnmapped',
        values: { value: key, term: target.id },
      })
      return undefined
    }
  }
  if (entry.transform && value !== undefined && value !== null) {
    const ran = runTransform(entry.transform, value)
    value = ran.value
    if (ran.unknownTransform)
      notes.push({
        field,
        businessTermId: target.id,
        messageKey: 'erp.dryRun.transformDeferred',
        values: { term: target.id },
      })
  }
  if (value === undefined || value === null || value === '') value = entry.defaultValue
  return value
}

/** Runs the mapping over a sample the way the production transformer would, and says what broke. */
export function dryRun(entries: Entry[], payload: unknown): DryRunResult {
  const readiness = validate(entries)
  if (!readiness.valid) {
    return {
      canonical: null,
      errors: readiness.invalidMappings.map((m) => ({
        field: TARGET_BY_ID[m.businessTermId]?.canonicalPath ?? m.businessTermId,
        businessTermId: m.businessTermId,
        messageKey: `erp.error.${m.errorCode}`,
        values: m.values,
      })),
      notes: [],
    }
  }
  const errors: DryRunError[] = []
  const notes: DryRunError[] = []
  const canonical: Record<string, unknown> = {}
  const lineRoot = entries.map((x) => x.sourcePath?.match(/^(.*?\[\])/)?.[1]).find(Boolean)
  const lineCount = lineRoot
    ? ((read(payload, lineRoot.slice(0, -2)) as unknown[] | undefined)?.length ?? 0)
    : 0

  for (const entry of entries) {
    const target = TARGET_BY_ID[entry.businessTermId]
    if (!target) continue
    if (target.canonicalPath.includes('[]')) {
      const lines: unknown[] = []
      for (let i = 0; i < Math.max(lineCount, entry.sourcePath ? 0 : 1); i += 1) {
        const value = evaluate(entry, target, payload, i, errors, notes)
        lines[i] = value
      }
      const [root, leaf] = target.canonicalPath.split('[].')
      const list = ((canonical[root] as unknown[] | undefined) ??
        Array.from({ length: Math.max(lineCount, 1) }, () => ({}))) as Record<string, unknown>[]
      lines.forEach((value, i) => {
        list[i] = list[i] ?? {}
        if (value !== undefined) setPath(list[i], leaf, value)
      })
      canonical[root] = list
    } else {
      const value = evaluate(entry, target, payload, undefined, errors, notes)
      if (value !== undefined) setPath(canonical, target.canonicalPath, value)
    }
  }

  /* What the canonical model itself refuses. */
  for (const target of REQUIRED_TARGETS) {
    if (target.canonicalPath.includes('[]')) continue
    if (read(canonical, target.canonicalPath) === undefined)
      errors.push({
        field: target.canonicalPath,
        businessTermId: target.id,
        messageKey: 'erp.dryRun.missing',
        values: { term: target.id },
      })
  }
  const vatin = read(canonical, 'supplier.party.vatin')
  if (typeof vatin === 'string' && !/^OM\d{10}$/.test(vatin))
    errors.push({
      field: 'supplier.party.vatin',
      businessTermId: 'IBT-031',
      messageKey: 'erp.dryRun.vatinShape',
      values: { value: vatin },
    })
  const buyerVatin = read(canonical, 'customer.party.vatin')
  if (typeof buyerVatin === 'string' && !/^OM\d{10}$/.test(buyerVatin))
    errors.push({
      field: 'customer.party.vatin',
      businessTermId: 'IBT-048',
      messageKey: 'erp.dryRun.vatinShape',
      values: { value: buyerVatin },
    })
  const issueDate = read(canonical, 'document.issueDate')
  if (typeof issueDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(issueDate))
    errors.push({
      field: 'document.issueDate',
      businessTermId: 'IBT-002',
      messageKey: 'erp.dryRun.dateShape',
      values: { value: issueDate },
    })
  const lines = (canonical.lines as Record<string, unknown>[] | undefined) ?? []
  lines.forEach((line, i) => {
    const category = read(line, 'tax.category')
    const rate = read(line, 'tax.rate')
    if (
      (category === 'E' || category === 'O') &&
      rate !== undefined &&
      rate !== null &&
      rate !== ''
    )
      errors.push({
        field: `lines[${i}].tax.rate`,
        businessTermId: 'IBT-152',
        messageKey: 'erp.dryRun.rateOnExempt',
        values: { category: String(category) },
      })
    if (category === 'S' && Number(rate) !== 5)
      errors.push({
        field: `lines[${i}].tax.rate`,
        businessTermId: 'IBT-152',
        messageKey: 'erp.dryRun.standardRate',
        values: { rate: String(rate) },
      })
  })

  return { canonical, errors, notes }
}

/* ------------------------------------------------------------ compiling */

const literal = (text: string) => JSON.stringify(text)

function leafExpression(entry: Entry, target: Target, relativeTo?: string) {
  const path = entry.sourcePath
    ? relativeTo && entry.sourcePath.startsWith(relativeTo)
      ? entry.sourcePath.slice(relativeTo.length)
      : entry.sourcePath.replace(/\[\]/g, '')
    : undefined
  let expr = path ?? 'undefined'
  if (entry.valueMap && path) {
    const map = `{${Object.entries(entry.valueMap)
      .map(([k, v]) => `${literal(k)}: ${literal(v)}`)
      .join(', ')}}`
    const miss =
      entry.onUnmapped === 'USE_DEFAULT'
        ? literal(entry.valueMapDefault ?? '')
        : entry.onUnmapped === 'PASS_THROUGH'
          ? '$raw'
          : `$error("INVALID_CODE_VALUE:${target.id}:" & $raw)`
    expr = `($raw := $string(${path}); $hit := $lookup(${map}, $raw); $exists($hit) ? $hit : ${miss})`
  }
  if (entry.transform && path) expr = `($src := ${expr}; ${entry.transform})`
  if (entry.defaultValue)
    expr = path
      ? `(${expr}) ? (${expr}) : ${literal(entry.defaultValue)}`
      : literal(entry.defaultValue)
  return expr
}

/** Deterministic JSONata from the entries — same entries, same text, same hash. */
export function compile(entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => a.ordinal - b.ordinal)
  const tree: Record<string, unknown> = {}
  const lineRoot = sorted.map((x) => x.sourcePath?.match(/^(.*?\[\])/)?.[1]).find(Boolean)
  for (const entry of sorted) {
    const target = TARGET_BY_ID[entry.businessTermId]
    if (!target) continue
    if (target.canonicalPath.includes('[]')) {
      const [root, leaf] = target.canonicalPath.split('[].')
      const list = (tree[root] as Record<string, unknown>) ?? {}
      setPath(list, leaf, leafExpression(entry, target, lineRoot ? `${lineRoot}.` : undefined))
      tree[root] = list
    } else {
      setPath(tree, target.canonicalPath, leafExpression(entry, target))
    }
  }
  const render = (node: unknown, depth: number, key?: string): string => {
    if (typeof node === 'string') return node
    const pad = '  '.repeat(depth + 1)
    const body = Object.entries(node as Record<string, unknown>)
      .map(([k, v]) => `${pad}${literal(k)}: ${render(v, depth + 1, k)}`)
      .join(',\n')
    const open =
      key === 'lines' && lineRoot ? `${lineRoot.slice(0, -2).replace(/\[\]/g, '')}.{\n` : '{\n'
    return `${open}${body}\n${'  '.repeat(depth)}}`
  }
  return `/* compiled by Fawtir from guided mapping */\n${render(tree, 0)}`
}

/* ------------------------------------------------------- certification */

const RULE = (
  ruleId: string,
  messageKey: string,
  field?: string,
  values?: Record<string, string | number>,
): Finding => ({ ruleId, messageKey, field, values })

/** The full pipeline, as far as the mock can go: the dry-run's errors plus the route's own rules. */
export function certifyWith(entries: Entry[], payload: unknown, route: CertRoute): Finding[] {
  const run = dryRun(entries, payload)
  const findings: Finding[] = run.errors.map((error) =>
    RULE('canonical', error.messageKey, error.field, error.values),
  )
  const c = run.canonical ?? {}
  const g = (path: string) => read(c, path)
  const missing = (path: string) => g(path) === undefined || g(path) === '' || g(path) === null

  if (
    ['line1', 'line2', 'line3', 'city', 'postalZone'].some((k) =>
      missing(`supplier.party.postalAddress.${k}`),
    )
  )
    findings.push(RULE('IBR-010-OM', 'erp.finding.sellerAddress', 'supplier.party.postalAddress'))
  if (missing('supplier.party.contact.telephone'))
    findings.push(RULE('IBR-011-OM', 'erp.finding.sellerPhone', 'supplier.party.contact.telephone'))
  const type = String(g('document.typeCode') ?? '')
  if (route === 'CREDIT_NOTE' && type !== '381')
    findings.push(RULE('ibr-cl-01', 'erp.finding.creditType', 'document.typeCode', { type }))
  if (route === 'DEBIT_NOTE' && type !== '383')
    findings.push(RULE('ibr-cl-01', 'erp.finding.debitType', 'document.typeCode', { type }))
  if (route === 'SELF_BILLING' && !['389', '261'].includes(type))
    findings.push(RULE('ibr-cl-01', 'erp.finding.selfBillingType', 'document.typeCode', { type }))
  if (['381', '383', '261'].includes(type) || route === 'CREDIT_NOTE' || route === 'DEBIT_NOTE') {
    if (
      missing('document.preceding.number') ||
      missing('document.preceding.issueDate') ||
      missing('document.preceding.uuid')
    )
      findings.push(RULE('IBR-032-OM', 'erp.finding.precedingInvoice', 'document.preceding'))
    if (missing('document.noteReason'))
      findings.push(RULE('IBR-023-OM', 'erp.finding.noteReason', 'document.noteReason'))
  }
  const lines = (c.lines as Record<string, unknown>[] | undefined) ?? []
  lines.forEach((line, i) => {
    if (read(line, 'item.goodsOrServices') === 'G' && missing(`lines[${i}].item.classification`))
      findings.push(RULE('IBR-079-OM', 'erp.finding.hsCode', `lines[${i}].item`, { line: i + 1 }))
    const qty = Number(read(line, 'quantity'))
    const price = Number(read(line, 'price.amount'))
    const net = Number(read(line, 'netAmount'))
    if ([qty, price, net].every((n) => !Number.isNaN(n)) && Math.abs(qty * price - net) > 0.01)
      findings.push(
        RULE('IBR-071-OM', 'erp.finding.lineNet', `lines[${i}].netAmount`, {
          line: i + 1,
          expected: (qty * price).toFixed(3),
          actual: net.toFixed(3),
        }),
      )
  })
  const excl = Number(g('totals.taxExclusive'))
  const tax = Number(g('totals.tax'))
  const incl = Number(g('totals.taxInclusive'))
  if ([excl, tax, incl].every((n) => !Number.isNaN(n)) && Math.abs(excl + tax - incl) > 0.01)
    findings.push(
      RULE('ibr-co-15', 'erp.finding.totals', 'totals.taxInclusive', {
        expected: (excl + tax).toFixed(3),
        actual: incl.toFixed(3),
      }),
    )

  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.ruleId}|${f.field}|${f.messageKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/* ------------------------------------------------------------- the story */

const ENTRIES = withOrdinals(ODOO_ENTRIES)
/** The Odoo story mapping, complete — the console's templates start from it. */
export const STORY_ENTRIES: Entry[] = ENTRIES
const COMPILED = compile(ENTRIES)
const ACTIVE_HASH = contentHash(COMPILED)

/** An earlier, incomplete revision: before the seller's third address line and phone were added. */
const EARLIER_ENTRIES = withOrdinals(
  ODOO_ENTRIES.filter((x) => !['IBT-162', 'IBT-042'].includes(x.businessTermId)),
)
const EARLIER_HASH = contentHash(
  compile(withOrdinals(ODOO_ENTRIES.filter((x) => x.businessTermId !== 'IBT-042'))),
)

let idSeq = 0
const nextId = (prefix: string) => `${prefix}-${++idSeq}`

function initialState(): MappingState {
  const samples = [
    sample('s-invoice', 'Odoo: catering invoice INV/2026/0117', ODOO_INVOICE, 23),
    sample(
      's-credit',
      'Odoo: credit note RINV/2026/0031',
      ODOO_CREDIT_NOTE,
      8,
      'Rashid Al Wahaibi',
    ),
  ]
  const revisions: Revision[] = [
    {
      id: 'r-10',
      revisionNo: 10,
      origin: 'EDIT',
      entries: EARLIER_ENTRIES,
      entryCount: EARLIER_ENTRIES.length,
      readyForActivation: false,
      savedBy: OPERATOR,
      savedAt: at(22, 14, 5),
    },
    {
      id: 'r-11',
      revisionNo: 11,
      origin: 'EDIT',
      entries: withOrdinals(ODOO_ENTRIES.filter((x) => x.businessTermId !== 'IBT-042')),
      entryCount: ODOO_ENTRIES.length - 1,
      readyForActivation: false,
      savedBy: OPERATOR,
      savedAt: at(20, 9, 48),
    },
    {
      id: 'r-12',
      revisionNo: 12,
      origin: 'EDIT',
      entries: ENTRIES,
      entryCount: ENTRIES.length,
      compiledContentHash: ACTIVE_HASH,
      readyForActivation: true,
      savedBy: OPERATOR,
      savedAt: at(16, 8, 12),
    },
  ]
  const profiles: Profile[] = [
    {
      id: 'p-1',
      contentHash: contentHash('v1'),
      erpKey: 'odoo-17',
      version: 1,
      active: false,
      origin: 'HAND_WRITTEN',
      content: '/* first attempt, by hand */\n{ "document": { "number": erp.name } }',
      createdAt: at(41, 11, 0),
    },
    {
      id: 'p-3',
      contentHash: EARLIER_HASH,
      erpKey: 'ODOO',
      version: 3,
      active: false,
      origin: 'GUIDED',
      content: compile(withOrdinals(ODOO_ENTRIES.filter((x) => x.businessTermId !== 'IBT-042'))),
      createdAt: at(20, 9, 48),
    },
    {
      id: 'p-4',
      contentHash: ACTIVE_HASH,
      erpKey: 'ODOO',
      version: 4,
      active: true,
      origin: 'GUIDED',
      content: COMPILED,
      createdAt: at(16, 8, 12),
    },
  ]
  const attempts: Attempt[] = [
    {
      id: 'a-1',
      route: 'INVOICE',
      contentHash: EARLIER_HASH,
      passed: false,
      at: at(18, 15, 30),
      by: OPERATOR,
      sampleId: 's-invoice',
      transactionType: DEFAULT_TRANSACTION_TYPE.INVOICE,
      findings: [RULE('IBR-011-OM', 'erp.finding.sellerPhone', 'supplier.party.contact.telephone')],
    },
    {
      id: 'a-2',
      route: 'INVOICE',
      contentHash: ACTIVE_HASH,
      passed: true,
      at: at(16, 9, 1),
      by: OPERATOR,
      sampleId: 's-invoice',
      transactionType: DEFAULT_TRANSACTION_TYPE.INVOICE,
      findings: [],
    },
    {
      id: 'a-3',
      route: 'DEBIT_NOTE',
      contentHash: ACTIVE_HASH,
      passed: false,
      at: at(16, 9, 7),
      by: OPERATOR,
      sampleId: 's-invoice',
      transactionType: DEFAULT_TRANSACTION_TYPE.DEBIT_NOTE,
      findings: certifyWith(ENTRIES, ODOO_INVOICE, 'DEBIT_NOTE'),
    },
  ]
  const seed = (
    id: string,
    when: Date,
    by: string,
    actionKey: string,
    values?: Record<string, string | number>,
  ): AuditEvent => ({ id, at: when, by, actionKey, values })
  const events: AuditEvent[] = [
    seed('ev-1', at(16, 9, 7), OPERATOR, 'certificationFailed', {
      route: 'DEBIT_NOTE',
      findings: attempts[2].findings.length,
    }),
    seed('ev-2', at(16, 9, 1), OPERATOR, 'certificationPassed', { route: 'INVOICE' }),
    seed('ev-3', at(16, 8, 12), OPERATOR, 'profileActivated', {
      version: 4,
      hash: shortHash(ACTIVE_HASH),
    }),
    seed('ev-4', at(16, 8, 12), OPERATOR, 'guidedSaved', { revision: 12, entries: ENTRIES.length }),
    seed('ev-5', at(18, 15, 30), OPERATOR, 'certificationFailed', {
      route: 'INVOICE',
      findings: 1,
    }),
    seed('ev-6', at(20, 9, 48), OPERATOR, 'guidedSaved', {
      revision: 11,
      entries: ENTRIES.length - 1,
    }),
    seed('ev-7', at(8, 9, 20), 'Rashid Al Wahaibi', 'sampleUploaded', { label: samples[1].label }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())
  return {
    sourceSystem: 'ODOO',
    entries: ENTRIES,
    version: 12,
    guided: true,
    samples,
    revisions,
    profiles,
    attempts,
    events,
    handWrittenDraft: '',
  }
}

/* --------------------------------------------------------------- store */

let state: MappingState = initialState()
const listeners = new Set<() => void>()
function set(next: MappingState) {
  state = next
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const event = (
  actionKey: string,
  values?: Record<string, string | number>,
  by = OPERATOR,
): AuditEvent => ({ id: nextId('ev'), at: new Date(), by, actionKey, values })

export type SaveResult = {
  readiness: Readiness
  status: 'refused' | 'draft' | 'activated'
  version: number
}

export const mappingStore = {
  /** Structurally invalid → refused; incomplete → draft; complete → compiled and activated. */
  saveGuided(
    entries: Entry[],
    sourceSystem: SourceSystem,
    expectedVersion: number,
  ): SaveResult | 'stale' {
    if (expectedVersion !== state.version) return 'stale'
    const readiness = validate(entries)
    if (!readiness.valid) return { readiness, status: 'refused', version: state.version }
    const compiled = readiness.readyForActivation ? compile(entries) : undefined
    const hash = compiled ? contentHash(compiled) : undefined
    const revision: Revision = {
      id: nextId('r'),
      revisionNo: (state.revisions[state.revisions.length - 1]?.revisionNo ?? 0) + 1,
      origin: 'EDIT',
      entries,
      entryCount: entries.length,
      compiledContentHash: hash,
      readyForActivation: readiness.readyForActivation,
      savedBy: OPERATOR,
      savedAt: new Date(),
    }
    let profiles = state.profiles
    const events = [
      event('guidedSaved', { revision: revision.revisionNo, entries: entries.length }),
    ]
    if (compiled && hash && !profiles.some((p) => p.active && p.contentHash === hash)) {
      const version = Math.max(0, ...profiles.map((p) => p.version)) + 1
      profiles = [
        ...profiles.map((p) => ({ ...p, active: false })),
        {
          id: nextId('p'),
          contentHash: hash,
          erpKey: sourceSystem,
          version,
          active: true,
          origin: 'GUIDED',
          content: compiled,
          createdAt: new Date(),
        },
      ]
      events.unshift(event('profileActivated', { version, hash: shortHash(hash) }))
    }
    set({
      ...state,
      entries,
      sourceSystem,
      guided: true,
      version: state.version + 1,
      revisions: [...state.revisions, revision],
      profiles,
      events: [...events, ...state.events],
    })
    return {
      readiness,
      status: readiness.readyForActivation ? 'activated' : 'draft',
      version: state.version,
    }
  },

  restoreRevision(id: string, expectedVersion: number): SaveResult | 'stale' | 'notFound' {
    const revision = state.revisions.find((r) => r.id === id)
    if (!revision) return 'notFound'
    const result = mappingStore.saveGuided(revision.entries, state.sourceSystem, expectedVersion)
    if (result === 'stale') return result
    const saved = state.revisions[state.revisions.length - 1]
    set({
      ...state,
      revisions: state.revisions.map((r) =>
        r.id === saved.id
          ? { ...r, origin: 'RESTORE', restoredFromRevisionNo: revision.revisionNo }
          : r,
      ),
      events: [
        event('guidedRestored', { from: revision.revisionNo, to: saved.revisionNo }),
        ...state.events.slice(result.status === 'activated' ? 2 : 1),
      ],
    })
    return result
  },

  importGuided(
    file: { schema?: string; sourceSystem?: SourceSystem; entries?: Entry[] },
    expectedVersion: number,
  ): SaveResult | 'stale' | 'malformed' | { unknownTerms: string[] } {
    if (file.schema !== 'fawtir.guided-mapping/1' || !Array.isArray(file.entries))
      return 'malformed'
    const unknown = file.entries.map((x) => x.businessTermId).filter((id) => !TARGET_BY_ID[id])
    if (unknown.length) return { unknownTerms: [...new Set(unknown)] }
    const result = mappingStore.saveGuided(
      withOrdinals(file.entries),
      file.sourceSystem ?? state.sourceSystem,
      expectedVersion,
    )
    if (result === 'stale') return result
    const saved = state.revisions[state.revisions.length - 1]
    set({
      ...state,
      revisions: state.revisions.map((r) => (r.id === saved.id ? { ...r, origin: 'IMPORT' } : r)),
      events: [
        event('guidedImported', { entries: file.entries.length }),
        ...state.events.slice(result.status === 'activated' ? 2 : 1),
      ],
    })
    return result
  },

  exportGuided() {
    return {
      schema: 'fawtir.guided-mapping/1',
      exportedAt: new Date().toISOString(),
      format: 'JSON',
      sourceSystem: state.sourceSystem,
      catalogue: {
        targets: MAPPABLE_TARGETS.length,
        rulesArtefact: 'phive-rules-peppol-pint 4.5.3 / PINT-OM 1.0.1',
      },
      entries: state.entries,
    }
  },

  archiveGuided() {
    set({
      ...state,
      guided: false,
      entries: [],
      version: state.version + 1,
      events: [event('guidedArchived'), ...state.events],
    })
  },

  uploadSample(label: string, payload: unknown): 'labelExists' | 'limit' | Sample {
    if (state.samples.some((s) => s.label === label)) return 'labelExists'
    if (state.samples.length >= 10) return 'limit'
    const created = sample(nextId('s'), label, payload, 0)
    created.createdAt = new Date()
    set({
      ...state,
      samples: [created, ...state.samples],
      events: [event('sampleUploaded', { label }), ...state.events],
    })
    return created
  },

  deleteSample(id: string) {
    const gone = state.samples.find((s) => s.id === id)
    set({
      ...state,
      samples: state.samples.filter((s) => s.id !== id),
      events: gone
        ? [event('sampleDeleted', { label: gone.label }), ...state.events]
        : state.events,
    })
  },

  setHandWrittenDraft(text: string) {
    state = { ...state, handWrittenDraft: text }
  },

  saveHandWritten(content: string, erpKey: string): 'invalid' | Profile {
    if (!content.trim() || !balanced(content)) return 'invalid'
    const hash = contentHash(content)
    const version = Math.max(0, ...state.profiles.map((p) => p.version)) + 1
    const profile: Profile = {
      id: nextId('p'),
      contentHash: hash,
      erpKey,
      version,
      active: true,
      origin: 'HAND_WRITTEN',
      content,
      createdAt: new Date(),
    }
    set({
      ...state,
      profiles: [...state.profiles.map((p) => ({ ...p, active: false })), profile],
      handWrittenDraft: '',
      events: [event('profileActivated', { version, hash: shortHash(hash) }), ...state.events],
    })
    return profile
  },

  deactivateProfile() {
    const active = state.profiles.find((p) => p.active)
    set({
      ...state,
      profiles: state.profiles.map((p) => ({ ...p, active: false })),
      events: active
        ? [event('profileDeactivated', { version: active.version }), ...state.events]
        : state.events,
    })
  },

  runCertification(
    route: CertRoute,
    sampleId: string,
    transactionType: string,
  ): Attempt | 'noProfile' | 'noSample' {
    const active = state.profiles.find((p) => p.active)
    const chosen = state.samples.find((s) => s.id === sampleId)
    if (!active) return 'noProfile'
    if (!chosen) return 'noSample'
    const findings =
      active.origin === 'GUIDED' ? certifyWith(state.entries, chosen.payload, route) : []
    const attempt: Attempt = {
      id: nextId('a'),
      route,
      contentHash: active.contentHash,
      passed: findings.length === 0,
      at: new Date(),
      by: OPERATOR,
      sampleId,
      transactionType,
      findings,
    }
    set({
      ...state,
      attempts: [...state.attempts, attempt],
      events: [
        event(attempt.passed ? 'certificationPassed' : 'certificationFailed', {
          route,
          findings: findings.length,
        }),
        ...state.events,
      ],
    })
    return attempt
  },

  /** The empty state, for a tenant that has not started. */
  startOver() {
    set({
      ...initialState(),
      entries: [],
      guided: false,
      revisions: [],
      profiles: [],
      attempts: [],
      samples: [],
      events: [],
      version: 0,
    })
  },

  restoreStory() {
    set(initialState())
  },
}

export function useErpMapping() {
  return useSyncExternalStore(subscribe, () => state)
}

/* ------------------------------------------------------------- readers */

export type OverviewStatus =
  'NOT_SET_UP' | 'DRAFT' | 'READY_UNCERTIFIED' | 'PARTIALLY_CERTIFIED' | 'CERTIFIED' | 'STALE'
export type MappingRoute = 'GUIDED' | 'HAND_WRITTEN' | 'NONE'
export type RouteState = 'CERTIFIED' | 'FAILED' | 'NOT_CERTIFIED' | 'STALE'

export function activeProfile(s: MappingState) {
  return s.profiles.find((p) => p.active)
}

export function mappingRoute(s: MappingState): MappingRoute {
  const active = activeProfile(s)
  if (!active) return 'NONE'
  if (s.guided && s.entries.length && contentHash(compile(s.entries)) === active.contentHash)
    return 'GUIDED'
  return 'HAND_WRITTEN'
}

export function routeStates(
  s: MappingState,
): Record<CertRoute, { state: RouteState; last?: Attempt; pass?: Attempt }> {
  const active = activeProfile(s)
  const out = {} as Record<CertRoute, { state: RouteState; last?: Attempt; pass?: Attempt }>
  for (const route of CERT_ROUTES) {
    const mine = s.attempts.filter((a) => a.route === route)
    const last = mine[mine.length - 1]
    const forActive = active ? mine.filter((a) => a.contentHash === active.contentHash) : []
    const pass = forActive.find((a) => a.passed)
    const stalePass = mine.find(
      (a) => a.passed && (!active || a.contentHash !== active.contentHash),
    )
    out[route] = {
      state: pass
        ? 'CERTIFIED'
        : forActive.length
          ? 'FAILED'
          : stalePass
            ? 'STALE'
            : 'NOT_CERTIFIED',
      last,
      pass,
    }
  }
  return out
}

export function overviewStatus(s: MappingState): OverviewStatus {
  const active = activeProfile(s)
  const routes = routeStates(s)
  const states = CERT_ROUTES.map((r) => routes[r].state)
  if (!active && !s.guided) return 'NOT_SET_UP'
  if (!active) return 'DRAFT'
  if (states.includes('CERTIFIED')) {
    const tried = states.filter((x) => x !== 'NOT_CERTIFIED' && x !== 'STALE')
    return tried.every((x) => x === 'CERTIFIED') && !states.includes('FAILED')
      ? 'CERTIFIED'
      : 'PARTIALLY_CERTIFIED'
  }
  if (states.includes('STALE')) return 'STALE'
  return 'READY_UNCERTIFIED'
}

export const readiness = (s: MappingState) => validate(s.entries)

export function sampleById(s: MappingState, id: string) {
  return s.samples.find((x) => x.id === id)
}

/** The codes a sample carries at a source path, for the value-map editor's left column. */
export function codesSeen(samples: Sample[], sourcePath: string): string[] {
  const seen = new Set<string>()
  for (const s of samples) {
    const root = sourcePath.match(/^(.*?\[\])/)?.[1]
    const count = root
      ? ((read(s.payload, root.slice(0, -2)) as unknown[] | undefined)?.length ?? 0)
      : 1
    for (let i = 0; i < count; i += 1) {
      const value = read(s.payload, sourcePath, root ? i : undefined)
      if (value !== undefined && value !== null && value !== '') seen.add(String(value))
    }
  }
  return [...seen]
}

export { read as readSourcePath }
