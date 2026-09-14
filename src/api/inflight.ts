const pending = new Map<string, Promise<unknown>>()

/**
 * Returns the request already in flight under `key`, or starts one.
 *
 * For reads a screen fires from an effect: StrictMode runs every effect twice in development, and
 * aborting the first run would still have sent it, so the second run joins the first instead. The
 * entry leaves the map as soon as the request settles — this is de-duplication of concurrent
 * identical reads, not a cache, so a later visit always asks again.
 */
export function sharedRequest<T>(key: string, start: () => Promise<T>): Promise<T> {
  const existing = pending.get(key)
  if (existing) return existing as Promise<T>
  const request = start().finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}
