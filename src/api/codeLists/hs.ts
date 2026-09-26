import { apiRequest } from '../client'

/**
 * The published Oman HS list (IBT-158): 14,313 twelve-digit codes, both parts of the PINT-OM list,
 * searched on the server by name (`GET /v1/code-lists/hs?q=&limit=`). The name of an entry is its
 * whole heading path, `Chapter > Heading > ... > Item`. `total` is how many entries matched;
 * `items` holds at most `limit`.
 */
export const HS_SEARCH_PATH = '/v1/code-lists/hs'

export type HsEntryDto = { code: string; name: string }
export type HsSearchDto = { items: HsEntryDto[]; total: number }

export function searchHs(query: string, limit = 20, signal?: AbortSignal): Promise<HsSearchDto> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return apiRequest<HsSearchDto>(`${HS_SEARCH_PATH}?${params.toString()}`, { signal })
}
