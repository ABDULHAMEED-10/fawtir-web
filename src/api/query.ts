export type QueryValue = string | number | boolean | null | undefined

/**
 * A path with its query string. Absent, `null` and empty values are left out rather than sent as
 * `?q=`, because several endpoints treat "present but blank" differently from "not given".
 */
export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.append(key, String(value))
  }
  const text = query.toString()
  return text ? `${path}?${text}` : path
}
