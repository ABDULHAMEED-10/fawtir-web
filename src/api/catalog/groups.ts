import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * The catalogue's two levels above the item (`/v1/catalog`): a group holds kinds, a kind holds
 * items. Only the item has a price. Names are unique per company (groups) and within their group
 * (kinds), case-insensitive.
 */
export const CATALOG_GROUPS_PATH = '/v1/catalog/groups'

export type CatalogKindDto = {
  id: string
  groupId: string
  name: string
  nameAr: string | null
  sortOrder: number
  version: number
}

export type CatalogGroupDto = {
  id: string
  name: string
  nameAr: string | null
  sortOrder: number
  version: number
  kinds: CatalogKindDto[]
}

export type CatalogGroupsDto = { groups: CatalogGroupDto[] }

export type CatalogNameRequest = { name: string; nameAr?: string | null; sortOrder?: number }

/** `GET /v1/catalog/groups`: every group with its kinds, by sort order then name. */
export function getCatalogGroups(): Promise<CatalogGroupsDto> {
  return apiRequest<CatalogGroupsDto>(CATALOG_GROUPS_PATH)
}

const groupPath = (id: string) => `${CATALOG_GROUPS_PATH}/${encodeURIComponent(id)}`
const kindPath = (id: string) => `/v1/catalog/kinds/${encodeURIComponent(id)}`

export function createCatalogGroup(body: CatalogNameRequest): Promise<CatalogGroupDto> {
  return apiRequest<CatalogGroupDto>(CATALOG_GROUPS_PATH, { method: 'POST', body })
}

export function updateCatalogGroup(
  id: string,
  expectedVersion: number,
  body: CatalogNameRequest,
): Promise<CatalogGroupDto> {
  return apiRequest<CatalogGroupDto>(withQuery(groupPath(id), { expectedVersion }), {
    method: 'PUT',
    body,
  })
}

/** Refused (`CATALOGUE_GROUP_NOT_EMPTY`) while the group still has kinds. */
export function deleteCatalogGroup(id: string, expectedVersion: number): Promise<void> {
  return apiRequest<void>(withQuery(groupPath(id), { expectedVersion }), { method: 'DELETE' })
}

export function createCatalogKind(
  groupId: string,
  body: CatalogNameRequest,
): Promise<CatalogKindDto> {
  return apiRequest<CatalogKindDto>(`${groupPath(groupId)}/kinds`, { method: 'POST', body })
}

/** `groupId` moves the kind to another group. */
export function updateCatalogKind(
  id: string,
  expectedVersion: number,
  body: CatalogNameRequest & { groupId?: string },
): Promise<CatalogKindDto> {
  return apiRequest<CatalogKindDto>(withQuery(kindPath(id), { expectedVersion }), {
    method: 'PUT',
    body,
  })
}

/** Refused (`CATALOGUE_KIND_IN_USE`) while an active product sits in it. */
export function deleteCatalogKind(id: string, expectedVersion: number): Promise<void> {
  return apiRequest<void>(withQuery(kindPath(id), { expectedVersion }), { method: 'DELETE' })
}

/** The name to show: the Arabic one in Arabic when there is one. */
export const catalogNameOf = (entry: { name: string; nameAr: string | null }, language: string) =>
  language.startsWith('ar') && entry.nameAr ? entry.nameAr : entry.name
