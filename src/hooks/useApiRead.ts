import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, apiRequest, sharedRequest } from '../api'
import { forgetEntitlements } from '../lib/identity/entitlements'
import { LOGIN_ROUTE } from '../lib/identity/login'

export type ApiRead<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: unknown }

type Settled<T> = { key: string; attempt: number; read: ApiRead<T> }

/**
 * One read for a customer-app screen, the same contract as the console's `useConsoleRead`.
 *
 * `key` names the request: the API path with its query, or `null` to fetch nothing yet. `load` is
 * what fetches it, and defaults to a GET of `key`; a screen passes its own loader when the
 * response needs mapping into a view model, typically a paged envelope into a `Page`. The effect
 * re-runs only when `key` changes, so `load` can be an inline arrow.
 *
 * A result is kept with the key and attempt it answers, so a new filter shows as loading at once
 * rather than briefly showing the previous rows under the new filter. A `401` means the session
 * has gone, for this screen and every other, so it goes to sign-in instead of offering a retry.
 */
export function useApiRead<T>(
  key: string | null,
  load?: () => Promise<T>,
): { read: ApiRead<T>; retry: () => void } {
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (key === null) return
    let active = true
    const start = loadRef.current ?? (() => apiRequest<T>(key))
    sharedRequest(`${key}#${attempt}`, start).then(
      (data) => {
        if (active) setSettled({ key, attempt, read: { status: 'ready', data } })
      },
      (error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          forgetEntitlements()
          navigate(LOGIN_ROUTE, { replace: true })
          return
        }
        setSettled({ key, attempt, read: { status: 'failed', error } })
      },
    )
    return () => {
      active = false
    }
  }, [key, attempt, navigate])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const current = settled && settled.key === key && settled.attempt === attempt
  return { read: current ? settled.read : { status: 'loading' }, retry }
}
