import { ApiError } from '../../api'
import type {
  TemplateGroupDto,
  TemplateItemDto,
  TemplateKindDto,
  TemplateName,
} from '../../api/catalog/templates'
import {
  BUSINESS_TYPE_RETIRED,
  CATALOGUE_CODE_TAKEN,
  NO_ACTIVE_SUB_TYPE,
  TEMPLATE_DRAFT_CONFLICT,
  TEMPLATE_INVALID,
  TEMPLATE_NO_DRAFT,
  type ConsoleBusinessTypeDto,
  type TemplateRowError,
} from '../../api/platform/businessTypes'

/**
 * Console › Settings › Business types and the template editor (Catalogue guide 1A): the words and
 * the tree arithmetic, kept out of the screens.
 */

/** Console › Settings › Business types, and one sub type's template editor. */
export const BUSINESS_TYPES_PATH = '/console/settings/business-types'
export const templateEditorPath = (code: string) =>
  `${BUSINESS_TYPES_PATH}/${encodeURIComponent(code)}/template`

/* ------------------------------------------------------------------ names */

/** The console shows the stored Arabic name, or says there is none yet. */
export const hasArabic = (named: { nameAr: string | null }) => Boolean(named.nameAr?.trim())

/** A code as the console accepts it: permanent, ASCII, upper snake case, 2 to 40 characters. */
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/

/** What a name typed for a new code suggests as its code: "Coffee shop" → COFFEE_SHOP. */
export function codeFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, 40)
}

/** The icon names the sign-up screen can draw; any other name draws the general icon. */
export const BUSINESS_TYPE_ICONS = [
  'utensils',
  'store',
  'sparkles',
  'briefcase',
  'stethoscope',
  'hotel',
  'graduation-cap',
  'car',
] as const

/** The types in display order, each with its sub types in display order. */
export function inDisplayOrder(types: ConsoleBusinessTypeDto[]): ConsoleBusinessTypeDto[] {
  return [...types]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((type) => ({
      ...type,
      subTypes: [...type.subTypes].sort((a, b) => a.displayOrder - b.displayOrder),
    }))
}

/** The codes with one moved a place up (-1) or down (+1), for the order endpoints. */
export function moved(codes: readonly string[], code: string, by: -1 | 1): string[] | null {
  const from = codes.indexOf(code)
  const to = from + by
  if (from < 0 || to < 0 || to >= codes.length) return null
  const next = [...codes]
  next.splice(from, 1)
  next.splice(to, 0, code)
  return next
}

/* --------------------------------------------------------------- refusals */

/** One sentence per refusal the console answers; the server's English is never shown. */
export function refusalKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType === CATALOGUE_CODE_TAKEN) return 'console.businessTypes.error.codeTaken'
    if (error.problemType === NO_ACTIVE_SUB_TYPE)
      return 'console.businessTypes.error.noActiveSubType'
    if (error.problemType === BUSINESS_TYPE_RETIRED)
      return 'console.businessTypes.error.typeRetired'
    if (error.problemType === TEMPLATE_DRAFT_CONFLICT)
      return 'console.businessTypes.error.draftConflict'
    if (error.problemType === TEMPLATE_NO_DRAFT) return 'console.businessTypes.error.noDraft'
    if (error.problemType === TEMPLATE_INVALID) return 'console.businessTypes.error.templateInvalid'
    if (error.status === 403) return 'console.businessTypes.error.forbidden'
    if (error.status === 404) return 'console.businessTypes.error.notFound'
    if (error.status === 400) return 'console.businessTypes.error.invalid'
    if (error.status === 413) return 'console.businessTypes.error.tooLarge'
  }
  return 'console.businessTypes.error.failed'
}

/** The row errors of a `catalogue-template-invalid` refusal, at most 200 as the server sends. */
export function templateRowErrors(error: unknown): TemplateRowError[] {
  if (!(error instanceof ApiError) || error.problemType !== TEMPLATE_INVALID) return []
  const raw = error.problem.errors
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      row: typeof entry.row === 'number' ? entry.row : null,
      path: typeof entry.path === 'string' ? entry.path : null,
      field: typeof entry.field === 'string' ? entry.field : null,
      message: typeof entry.message === 'string' ? entry.message : '',
    }))
}

/** The field names the server reports, as the console labels them (`templateEditor.field.*`). */
const FIELD_WORDS: Record<string, string> = {
  name: 'name',
  nameAr: 'nameAr',
  group: 'group',
  group_ar: 'nameAr',
  kind: 'kind',
  kind_ar: 'nameAr',
  item: 'name',
  item_ar: 'nameAr',
  goodsOrService: 'goodsOrService',
  goods_or_service: 'goodsOrService',
  defaultUnitCode: 'unit',
  unit: 'unit',
  defaultTaxCategory: 'vatCategory',
  vat_category: 'vatCategory',
  defaultTaxReasonCode: 'vatReason',
  vat_reason_code: 'vatReason',
  defaultTaxReasonText: 'vatReasonText',
  vat_reason_text: 'vatReasonText',
  hsCode: 'hsCode',
  hs_code: 'hsCode',
  serviceTypeCode: 'serviceType',
  service_type_code: 'serviceType',
  barcode: 'barcode',
  sizes: 'sizes',
  options: 'options',
  addOns: 'addOns',
  add_ons: 'addOns',
}

export function fieldWordKey(field: string | null): string | null {
  const word = field ? FIELD_WORDS[field] : undefined
  return word ? `console.templateEditor.field.${word}` : null
}

/** Where a draft-save error points: `groups[0].kinds[1].items[3].hsCode` → its node. */
export type NodeRef = { g: number; k?: number; i?: number }

export function nodeOfPath(path: string | null): NodeRef | null {
  if (!path) return null
  const match = /^groups\[(\d+)\](?:\.kinds\[(\d+)\](?:\.items\[(\d+)\])?)?/.exec(path)
  if (!match) return null
  return {
    g: Number(match[1]),
    k: match[2] === undefined ? undefined : Number(match[2]),
    i: match[3] === undefined ? undefined : Number(match[3]),
  }
}

export const sameNode = (a: NodeRef | null, b: NodeRef | null) =>
  a !== null && b !== null && a.g === b.g && a.k === b.k && a.i === b.i

/* ------------------------------------------------------------------- tree */

export const itemCount = (groups: readonly TemplateGroupDto[]) =>
  groups.reduce((sum, group) => sum + group.kinds.reduce((n, kind) => n + kind.items.length, 0), 0)

export function newItem(name: string): TemplateItemDto {
  return {
    name,
    nameAr: null,
    classification: { goodsOrService: 'G', hsCode: '000000000000', serviceTypeCode: null },
    defaultUnitCode: 'C62',
    defaultTaxCategory: 'S',
    defaultTaxReasonCode: null,
    defaultTaxReasonText: null,
    barcode: null,
    variants: null,
    addOns: [],
  }
}

export const newKind = (name: string): TemplateKindDto => ({ name, nameAr: null, items: [] })
export const newGroup = (name: string): TemplateGroupDto => ({ name, nameAr: null, kinds: [] })

const moveIn = <T>(list: readonly T[], index: number, by: -1 | 1): T[] => {
  const to = index + by
  if (to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const [entry] = next.splice(index, 1)
  next.splice(to, 0, entry)
  return next
}

/** The node's own list, replaced through `edit`, everything else untouched. */
function editList(
  groups: TemplateGroupDto[],
  at: NodeRef,
  edit: <T>(list: T[], index: number) => T[],
): TemplateGroupDto[] {
  if (at.k === undefined) return edit(groups, at.g)
  return groups.map((group, g) => {
    if (g !== at.g) return group
    if (at.i === undefined) return { ...group, kinds: edit(group.kinds, at.k as number) }
    return {
      ...group,
      kinds: group.kinds.map((kind, k) =>
        k === at.k ? { ...kind, items: edit(kind.items, at.i as number) } : kind,
      ),
    }
  })
}

export const moveNode = (groups: TemplateGroupDto[], at: NodeRef, by: -1 | 1) =>
  editList(groups, at, (list, index) => moveIn(list, index, by))

export const removeNode = (groups: TemplateGroupDto[], at: NodeRef) =>
  editList(groups, at, (list, index) => list.filter((_, i) => i !== index))

export function updateNode(
  groups: TemplateGroupDto[],
  at: NodeRef,
  patch: Partial<TemplateItemDto> & Partial<TemplateName>,
): TemplateGroupDto[] {
  return editList(groups, at, (list, index) =>
    list.map((entry, i) => (i === index ? ({ ...entry, ...patch } as typeof entry) : entry)),
  )
}

export function addKind(groups: TemplateGroupDto[], g: number, kind: TemplateKindDto) {
  return groups.map((group, index) =>
    index === g ? { ...group, kinds: [...group.kinds, kind] } : group,
  )
}

export function addItem(groups: TemplateGroupDto[], g: number, k: number, item: TemplateItemDto) {
  return groups.map((group, gi) =>
    gi !== g
      ? group
      : {
          ...group,
          kinds: group.kinds.map((kind, ki) =>
            ki === k ? { ...kind, items: [...kind.items, item] } : kind,
          ),
        },
  )
}

export function nodeAt(
  groups: readonly TemplateGroupDto[],
  at: NodeRef | null,
): TemplateGroupDto | TemplateKindDto | TemplateItemDto | undefined {
  if (!at) return undefined
  const group = groups[at.g]
  if (!group || at.k === undefined) return group
  const kind = group.kinds[at.k]
  if (!kind || at.i === undefined) return kind
  return kind.items[at.i]
}

/* ------------------------------------------------------- sizes and add-ons */

/**
 * Sizes, options and add-ons are typed as one line of names, as the spreadsheet carries them:
 * separated by commas (or `|`), each with its Arabic name after `=` (`Small=صغير, Large`).
 */
export function formatNames(names: readonly TemplateName[]): string {
  return names
    .map((entry) => (entry.nameAr ? `${entry.name}=${entry.nameAr}` : entry.name))
    .join(', ')
}

export function parseNames(text: string): TemplateName[] {
  return text
    .split(/[,|،]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...rest] = part.split('=')
      const nameAr = rest.join('=').trim()
      return { name: name.trim(), nameAr: nameAr || null }
    })
    .filter((entry) => entry.name)
}

/* ------------------------------------------------------------- item fields */

/** CL-04-OM categories an item may start on (AE and G are refused as a default). */
export const TEMPLATE_TAX_CATEGORIES = ['S', 'Z', 'E', 'O'] as const

/** UN/ECE Rec 20 units a template item may carry, by kind (contract section 4). */
export const TEMPLATE_GOODS_UNITS = [
  'C62',
  'EA',
  'KGM',
  'GRM',
  'LTR',
  'MLT',
  'MTR',
  'MTK',
  'SET',
  'PR',
  'BX',
  'PK',
  'BG',
  'SA',
  'ZZ',
] as const
export const TEMPLATE_SERVICE_UNITS = [
  'C62',
  'LS',
  'HUR',
  'DAY',
  'WEE',
  'MON',
  'ANN',
  'MTK',
  'ZZ',
] as const

/** Export reasons (VATZR-OM-09 to 12) are refused as an item default (Z.7). */
export const EXPORT_ZERO_REASONS = new Set([
  'VATZR-OM-09',
  'VATZR-OM-10',
  'VATZR-OM-11',
  'VATZR-OM-12',
])

/**
 * What changing the goods/service switch or the VAT category leaves behind: a goods item keeps
 * an HS code and no service type, a service the reverse; S and O take no reason code, and S no
 * text (IBR-070-OM).
 */
export function itemAfter(item: TemplateItemDto, patch: Partial<TemplateItemDto>): TemplateItemDto {
  const next = { ...item, ...patch }
  const goods = next.classification.goodsOrService === 'G'
  const units: readonly string[] = goods ? TEMPLATE_GOODS_UNITS : TEMPLATE_SERVICE_UNITS
  const category = next.defaultTaxCategory
  return {
    ...next,
    classification: {
      goodsOrService: next.classification.goodsOrService,
      hsCode: goods ? (next.classification.hsCode ?? '000000000000') : null,
      serviceTypeCode: goods ? null : next.classification.serviceTypeCode,
    },
    defaultUnitCode: units.includes(next.defaultUnitCode) ? next.defaultUnitCode : 'C62',
    defaultTaxReasonCode: category === 'Z' || category === 'E' ? next.defaultTaxReasonCode : null,
    defaultTaxReasonText: category === 'S' ? null : next.defaultTaxReasonText,
  }
}
