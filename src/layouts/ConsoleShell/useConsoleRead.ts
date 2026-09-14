import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, apiRequest, sharedRequest } from '../../api'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { LOGIN_ROUTE } from '../../lib/identity/login'

export type ConsoleRead<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: unknown }

type Settled<T> = { path: string; attempt: number; read: ConsoleRead<T> }

/**
 * One console read, by the API path it fetches (`null` to fetch nothing).
 *
 * The result is kept with the path and attempt it answers, so a new path reads as loading at once
 * instead of briefly showing the previous page's rows. A `401` means the session is gone — for
 * this screen and every other — so it leaves for Login rather than offering a retry.
 */
export function useConsoleRead<T>(path: string | null): { read: ConsoleRead<T>; retry: () => void } {
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    if (path === null) return
    let active = true
    sharedRequest(path, () => apiRequest<T>(path)).then(
      (data) => {
        if (active) setSettled({ path, attempt, read: { status: 'ready', data } })
      },
      (error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          forgetEntitlements()
          navigate(LOGIN_ROUTE, { replace: true })
          return
        }
        setSettled({ path, attempt, read: { status: 'failed', error } })
      },
    )
    return () => {
      active = false
    }
  }, [path, attempt, navigate])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const current = settled && settled.path === path && settled.attempt === attempt
  return { read: current ? settled.read : { status: 'loading' }, retry }
}
