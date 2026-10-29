import { ApiError } from '../api/errors'
import type { CatalogGroupDto, CatalogKindDto } from '../api/catalog/groups'

/**
 * The refusals `/v1/catalog/groups` and `/v1/catalog/kinds` answer by code
 * (`CatalogueGroupService`), worded for the groups screen and the item form's "Add a group".
 * `field` is set when the refusal is about the name typed, so the dialog can show it under the
 * name rather than above the form.
 */
const REFUSALS: Record<string, { key: string; field?: 'name' }> = {
  CATALOGUE_NAME_REQUIRED: { key: 'catalogGroups.refusal.nameRequired', field: 'name' },
  CATALOGUE_GROUP_NAME_DUPLICATE: { key: 'catalogGroups.refusal.groupNameTaken', field: 'name' },
  CATALOGUE_KIND_NAME_DUPLICATE: { key: 'catalogGroups.refusal.kindNameTaken', field: 'name' },
  CATALOGUE_GROUP_VERSION_CONFLICT: { key: 'catalogGroups.refusal.changedMeanwhile' },
  CATALOGUE_GROUP_NOT_EMPTY: { key: 'catalogGroups.refusal.groupNotEmpty' },
  CATALOGUE_KIND_IN_USE: { key: 'catalogGroups.refusal.kindInUse' },
  CATALOGUE_GROUP_NOT_FOUND: { key: 'catalogGroups.refusal.groupGone' },
  CATALOGUE_KIND_NOT_FOUND: { key: 'catalogGroups.refusal.kindGone' },
  CATALOGUE_ORDER_INVALID: { key: 'catalogGroups.refusal.orderInvalid' },
}

/**
 * A server without the order routes (backend #812) answers them 404 or 405, or 400 for
 * `/groups/order` read as `/groups/{groupId}` with "order" as the id; none carries a catalogue
 * code. A catalogue refusal (`CATALOGUE_ORDER_INVALID`, `..._NOT_FOUND`) is a real answer.
 */
export function orderRouteMissing(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    [400, 404, 405].includes(error.status) &&
    !(error.code ?? '').startsWith('CATALOGUE_')
  )
}

/** The sentence for a groups refusal, or null when the code is not one of these. */
export function catalogGroupRefusal(error: unknown): { key: string; field?: 'name' } | null {
  if (!(error instanceof ApiError) || !error.code) return null
  return REFUSALS[error.code] ?? null
}

/** Names are unique case-insensitively, as the server compares them. */
export const sameCatalogName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/** The sort order a new entry takes so it lands at the end of its list. */
export const nextSortOrder = (rows: { sortOrder: number }[]) =>
  rows.reduce((top, row) => Math.max(top, row.sortOrder + 1), 0)

/** Every row in its new order after moving one up (-1) or down (+1); null past either end. */
export function reorderedRows<T extends { id: string }>(rows: T[], id: string, step: -1 | 1) {
  const from = rows.findIndex((row) => row.id === id)
  const to = from + step
  if (from < 0 || to < 0 || to >= rows.length) return null
  const next = [...rows]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * The rows whose sort order changes after a move, each with the one it should now carry: the
 * fallback for a server without the order routes, which saves each row on its own (INCOME.md
 * P.40).
 */
export function reorderMoves<T extends CatalogGroupDto | CatalogKindDto>(
  rows: T[],
  id: string,
  step: -1 | 1,
): { row: T; sortOrder: number }[] {
  const next = reorderedRows(rows, id, step)
  if (!next) return []
  return next
    .map((row, index) => ({ row, sortOrder: index }))
    .filter((entry) => entry.row.sortOrder !== entry.sortOrder)
}
