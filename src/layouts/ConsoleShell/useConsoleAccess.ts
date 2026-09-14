import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api'
import {
  forgetEntitlements,
  loadEntitlements,
  peekEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'

export type ConsoleAccess =
  | { state: 'checking' }
  | { state: 'ready'; entitlements: Entitlements }
  | { state: 'signedOut' }
  | { state: 'failed'; error: unknown }

/**
 * Who is using the console, asked once per session (see `loadEntitlements`). A `401` means there
 * is no session to ask about, so the answer is "sign in", not an error to retry.
 */
export function useConsoleAccess(): { access: ConsoleAccess; retry: () => void } {
  const [known] = useState(peekEntitlements)
  const [access, setAccess] = useState<ConsoleAccess>(() =>
    known ? { state: 'ready', entitlements: known } : { state: 'checking' },
  )
  const [attempt, setAttempt] = useState(0)
  // A page change inside the console mounts a fresh shell with the answer already in memory.
  const alreadyKnown = attempt === 0 && known !== null

  useEffect(() => {
    if (alreadyKnown) return
    let active = true
    loadEntitlements().then(
      (entitlements) => {
        if (active) setAccess({ state: 'ready', entitlements })
      },
      (error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          forgetEntitlements()
          setAccess({ state: 'signedOut' })
          return
        }
        setAccess({ state: 'failed', error })
      },
    )
    return () => {
      active = false
    }
  }, [alreadyKnown, attempt])

  const retry = useCallback(() => {
    setAccess({ state: 'checking' })
    setAttempt((n) => n + 1)
  }, [])

  return { access, retry }
}
