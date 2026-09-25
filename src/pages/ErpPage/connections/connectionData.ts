import { useCallback, useEffect, useState } from 'react'
import { useApiRead, type ApiRead } from '../../../hooks'
import {
  getErpConnection,
  listErpConnections,
  type ErpConnectionDto,
  type ErpConnectionListDto,
} from '../../../api/erp/connections'

/**
 * Reads for the ERP connection screens, on the app's standard {@link useApiRead} contract.
 *
 * The `key` is the request, so a filter change shows as loading rather than briefly showing the
 * previous rows under the new filter, and a `401` navigates to sign-in rather than offering a
 * retry. `reload` bumps the key's attempt, which is how a screen refreshes after a mutation
 * without unmounting itself.
 */

/**
 * The tenant's connections.
 *
 * `enabled` is false when the reader does not hold `erp.connection.read`, which sends no request
 * at all rather than a guaranteed 403. The permission is still the backend's to enforce; this only
 * avoids asking a question we already know the answer to, on every visit, for every such user.
 */
export function useConnectionList(
  includeArchived: boolean,
  enabled = true,
): { read: ApiRead<ErpConnectionListDto>; reload: () => void } {
  const key = enabled ? `erp-connections?archived=${includeArchived}` : null
  const { read, retry } = useApiRead<ErpConnectionListDto>(key, () =>
    listErpConnections(includeArchived),
  )
  return { read, reload: retry }
}

/**
 * One connection, keeping the last good answer visible while a refresh is in flight.
 *
 * `useApiRead` reports `loading` again on every `retry`, which is right for a filter change but
 * wrong for a post-mutation refresh: a screen that switched back to a spinner would unmount the
 * panel below it and take its contents with it. That is exactly the defect the mapping screens
 * had — run a check, and the reload that followed threw the result away before it could be read.
 *
 * So `connection` is the freshest answer that arrived, not the state of the current request, and
 * `refreshing` says a newer one is on its way. A screen renders from `connection` and stays
 * mounted throughout.
 */
export function useConnectionDetail(connectionId: string | undefined): {
  read: ApiRead<ErpConnectionDto>
  connection: ErpConnectionDto | null
  refreshing: boolean
  reload: () => void
} {
  const key = connectionId === undefined ? null : `erp-connection/${connectionId}`
  const { read, retry } = useApiRead<ErpConnectionDto>(key, () =>
    getErpConnection(connectionId as string),
  )
  const [lastGood, setLastGood] = useState<ErpConnectionDto | null>(null)

  useEffect(() => {
    if (read.status === 'ready') setLastGood(read.data)
  }, [read])

  // A different connection must not show the previous one's data for an instant.
  useEffect(() => {
    setLastGood(null)
  }, [key])

  const connection = read.status === 'ready' ? read.data : lastGood
  return { read, connection, refreshing: read.status === 'loading' && lastGood !== null, reload: retry }
}

/**
 * One in-flight mutation and its outcome.
 *
 * Deliberately not routed through the shared inflight cache: that exists to collapse duplicate
 * READS, and collapsing two credential writes because their paths matched would drop one of them
 * silently. Every mutation here is its own request.
 *
 * `busy` is a string rather than a boolean so a screen with several action buttons can disable and
 * spin exactly the one that was pressed, instead of freezing the whole card.
 */
export type Mutation = {
  busy: string | null
  error: unknown
  /** Set by the caller when a write succeeded, for a screen that shows a confirmation line. */
  done: string | null
  run: <T>(id: string, work: () => Promise<T>) => Promise<T | undefined>
  clear: () => void
}

export function useMutation(): Mutation {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = useCallback(async <T,>(id: string, work: () => Promise<T>) => {
    setBusy(id)
    setError(null)
    setDone(null)
    try {
      const result = await work()
      setDone(id)
      return result
    } catch (failure: unknown) {
      setError(failure)
      return undefined
    } finally {
      // Always cleared, including on failure: a button left spinning after a refusal is a screen
      // the user cannot retry from.
      setBusy(null)
    }
  }, [])

  const clear = useCallback(() => {
    setError(null)
    setDone(null)
  }, [])

  return { busy, error, done, run, clear }
}
