import { ApiError } from '../api'
import type {
  MenuScanConfirmGroup,
  MenuScanConfirmRequest,
  MenuScanGroupDto,
  MenuScanRowDto,
  MenuScanRowRefusal,
} from '../api/catalog/menuScans'

/**
 * Catalog › Upload a menu, on the menu-scan API (backend PR #787): the draft the reader answered,
 * as the page edits it, and the confirm body built from the rows the company kept.
 */

export const UPLOAD_STEPS = ['uploaded', 'read', 'check', 'add'] as const

export type ReviewRow = MenuScanRowDto & { ticked: boolean }

export type ReviewGroup = Omit<MenuScanGroupDto, 'rows'> & {
  rows: ReviewRow[]
  /**
   * Where the heading goes: `suggested` (the group the server named in `becomes`, reused when the
   * company has one of that name) or `kind:<id>`, an existing kind picked by the company.
   */
  target: string
}

export const SUGGESTED = 'suggested'

export function reviewGroups(groups: MenuScanGroupDto[]): ReviewGroup[] {
  return groups.map((group) => ({
    ...group,
    target: SUGGESTED,
    rows: group.rows.map((row) => ({ ...row, ticked: row.ticked })),
  }))
}

/** A blank line the company adds under a heading ("Add something the menu missed"). */
export function blankRow(group: ReviewGroup, sequence: number): ReviewRow {
  const template = group.rows[0]
  return {
    id: `${group.id}-added-${sequence}`,
    name: '',
    nameAr: null,
    description: null,
    price: null,
    priceAsPrinted: null,
    currency: 'OMR',
    sizes: [],
    confidence: 1,
    state: 'clear',
    ticked: true,
    concerns: [],
    soldAs: template?.soldAs ?? 'C62',
    taxCategory: template?.taxCategory ?? 'S',
    taxPercent: template?.taxPercent ?? 5,
    goodsOrService: template?.goodsOrService ?? 'G',
    itemKind: template?.itemKind ?? 'HAND_OVER',
    hsCode: template?.hsCode ?? null,
  }
}

/** The i18n key wording a concern code; the server's English `message` is never shown. */
export function concernKey(code: string): string {
  switch (code) {
    case 'PRICE_MISSING':
      return 'uploadMenu.concern.priceMissing'
    case 'PRICE_UNREADABLE':
      return 'uploadMenu.concern.priceUnreadable'
    case 'SIZE_PRICE_UNREADABLE':
      return 'uploadMenu.concern.sizePriceUnreadable'
    case 'CURRENCY_NOT_OMR':
      return 'uploadMenu.concern.currencyNotOmr'
    case 'LOW_CONFIDENCE':
      return 'uploadMenu.concern.lowConfidence'
    case 'READER_NOTE':
      return 'uploadMenu.concern.readerNote'
    default:
      return 'uploadMenu.concern.other'
  }
}

export function concernValues(row: MenuScanRowDto): Record<string, string> {
  return { printed: row.priceAsPrinted ?? '', currency: row.currency ?? '' }
}

/** Where each request entry came from, so a refused row is marked on the line it names. */
export type ConfirmPlan = {
  body: MenuScanConfirmRequest
  /** `groupIds[g]` is the review group of request group `g`. */
  groupIds: string[]
  /** `rowIds[g][i]` is the review row of request item `i` in group `g`. */
  rowIds: string[][]
}

const blankToNull = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The confirm body: only the ticked rows (the server takes the rows the company kept, no
 * `ticked` flag), groups with none left out. Zero per cent goes as zero-rated (`Z`); the server's
 * product rules decide whether it needs a reason and refuse the row if so.
 */
export function confirmPlan(groups: ReviewGroup[]): ConfirmPlan {
  const body: MenuScanConfirmRequest = { groups: [] }
  const groupIds: string[] = []
  const rowIds: string[][] = []
  for (const group of groups) {
    const kept = group.rows.filter((row) => row.ticked)
    if (kept.length === 0) continue
    const entry: MenuScanConfirmGroup = group.target.startsWith('kind:')
      ? { kindId: group.target.slice('kind:'.length), items: [] }
      : { name: group.becomes, nameAr: blankToNull(group.headingAr), items: [] }
    for (const row of kept) {
      const sizes = row.sizes
        .filter((size) => size.price !== null)
        .map((size) => ({ name: size.name, price: size.price as number }))
      const rate = row.taxPercent
      entry.items.push({
        name: row.name.trim(),
        nameAr: blankToNull(row.nameAr),
        description: blankToNull(row.description),
        price: row.price,
        unitCode: row.soldAs,
        itemKind: row.itemKind,
        taxCategory: rate === 0 ? (row.taxCategory === 'S' ? 'Z' : row.taxCategory) : 'S',
        taxRate: rate,
        hsCode: row.goodsOrService === 'G' ? row.hsCode : null,
        ...(sizes.length > 0 ? { sizes } : {}),
      })
    }
    body.groups.push(entry)
    groupIds.push(group.id)
    rowIds.push(kept.map((row) => row.id))
  }
  return { body, groupIds, rowIds }
}

export type RowProblem = { field: string | null; code: string }

/** `MENU_SCAN_ROWS_REFUSED` placed on its lines: by row id, and by group id for a group refusal. */
export function placeRefusals(
  plan: ConfirmPlan,
  refusals: MenuScanRowRefusal[],
): { rows: Record<string, RowProblem[]>; groups: Record<string, RowProblem[]> } {
  const rows: Record<string, RowProblem[]> = {}
  const groups: Record<string, RowProblem[]> = {}
  for (const refusal of refusals) {
    const groupId = plan.groupIds[refusal.group]
    if (groupId === undefined) continue
    const problem = { field: refusal.field ?? null, code: refusal.code }
    if (refusal.item === null || refusal.item === undefined) {
      ;(groups[groupId] ??= []).push(problem)
      continue
    }
    const rowId = plan.rowIds[refusal.group]?.[refusal.item]
    if (rowId === undefined) (groups[groupId] ??= []).push(problem)
    else (rows[rowId] ??= []).push(problem)
  }
  return { rows, groups }
}

export function refusedRows(error: unknown): MenuScanRowRefusal[] | null {
  if (!(error instanceof ApiError) || error.code !== 'MENU_SCAN_ROWS_REFUSED') return null
  const rows = error.problem.rows
  return Array.isArray(rows) ? (rows as MenuScanRowRefusal[]) : []
}

/** The words for a refused row: by code where it is known, otherwise by the field it names. */
export function rowProblemKey(problem: RowProblem): string {
  if (problem.code === 'MENU_SCAN_PRICE_REQUIRED') return 'uploadMenu.rowError.priceRequired'
  if (problem.code === 'PRODUCT_CODE_DUPLICATE') return 'uploadMenu.rowError.codeDuplicate'
  switch (problem.field) {
    case 'name':
      return 'uploadMenu.rowError.name'
    case 'price':
      return 'uploadMenu.rowError.price'
    case 'sizes':
      return 'uploadMenu.rowError.sizes'
    case 'unitCode':
      return 'uploadMenu.rowError.unit'
    case 'taxReasonCode':
      return 'uploadMenu.rowError.taxReason'
    case 'taxCategory':
    case 'taxRate':
      return 'uploadMenu.rowError.tax'
    case 'kindId':
      return 'uploadMenu.rowError.group'
    default:
      return 'uploadMenu.rowError.other'
  }
}

export const isDailyLimit = (error: unknown) =>
  error instanceof ApiError && error.code === 'MENU_SCAN_DAILY_LIMIT'

export const isKeyReused = (error: unknown) =>
  error instanceof ApiError && error.code === 'MENU_SCAN_KEY_REUSED'

export const isScanInvalid = (error: unknown) =>
  error instanceof ApiError && error.code === 'MENU_SCAN_INVALID'
