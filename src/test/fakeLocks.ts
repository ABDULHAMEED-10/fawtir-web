/**
 * jsdom has no `navigator.locks`. POS-TABLOCK refuses offline sales without it (fail closed), so
 * every suite gets this stand-in from setup.ts: the exclusive, same-name semantics the till lock
 * relies on, for `ifAvailable` requests (the only kind it makes). A test of the lock itself installs
 * its own to play the other tab, or removes it.
 */
export type FakeLocks = LockManager & { held: Set<string> }
type Granted = (lock: Lock | null) => unknown

export function fakeLocks(): FakeLocks {
  const held = new Set<string>()
  const request = async (
    name: string,
    optionsOrCallback: LockOptions | Granted,
    maybeCallback?: Granted,
  ): Promise<unknown> => {
    const options: LockOptions = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
    if (!callback) throw new TypeError('no callback')
    if (held.has(name)) {
      if (options.ifAvailable) return callback(null)
      throw new Error('fakeLocks supports only ifAvailable requests on a held lock')
    }
    held.add(name)
    try {
      return await callback({ name, mode: options.mode ?? 'exclusive' } as Lock)
    } finally {
      held.delete(name)
    }
  }
  const query = async () => ({
    held: [...held].map((name) => ({ name, mode: 'exclusive' as LockMode, clientId: 'test' })),
    pending: [],
  })
  return { request, query, held } as unknown as FakeLocks
}

export function installLocks(locks: LockManager | undefined) {
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: locks })
}
