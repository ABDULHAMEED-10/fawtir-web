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

/**
 * Empties the registry. For tests only.
 *
 * The entry is removed in a `finally`, which runs as a microtask, so a test that finishes while a
 * read is still settling leaves its key behind. The next test rendering the same screen then joins
 * the previous test's promise and is answered from the previous test's stubs — a failure that
 * lands on whichever test happens to run second and vanishes when that test runs alone. Clearing
 * between tests removes the class rather than timing around it.
 */
export function resetSharedRequests() {
  pending.clear()
}
