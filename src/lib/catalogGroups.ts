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

/**
 * The rows in their new order after moving one up (-1) or down (+1), each with the sort order it
 * should now carry; only the rows whose sort order changes are returned. The server has no
 * reorder route, so each changed row is saved on its own (INCOME.md P.40).
 */
export function reorderMoves<T extends CatalogGroupDto | CatalogKindDto>(
  rows: T[],
  id: string,
  step: -1 | 1,
): { row: T; sortOrder: number }[] {
  const from = rows.findIndex((row) => row.id === id)
  const to = from + step
  if (from < 0 || to < 0 || to >= rows.length) return []
  const next = [...rows]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
    .map((row, index) => ({ row, sortOrder: index }))
    .filter((entry) => entry.row.sortOrder !== entry.sortOrder)
}
