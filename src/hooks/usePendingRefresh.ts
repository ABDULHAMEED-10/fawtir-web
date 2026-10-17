import { useEffect, useRef } from 'react'

/**
 * Gaps between re-reads. An AS4 receipt or an MLS usually lands within seconds of a send, so the
 * first gaps are short; an answer that has not come by then can take minutes, so they lengthen
 * rather than keep a tab hammering the server for a reply that is not coming soon.
 */
export const PENDING_REFRESH_DELAYS_MS = [3000, 5000, 8000, 13000, 20000, 30000, 45000, 60000]

/**
 * Re-reads per pending spell: about ten minutes on the gaps above. A Peppol answer may never come
 * (silence is never recorded as AB, ADR-007), so an open tab must stop asking and leave the reader
 * to reload.
 */
export const PENDING_REFRESH_LIMIT = 15

/**
 * Re-reads a screen's data while the server still owes it an outcome, with the back-off and cap
 * above. One request at a time: the next gap starts only once the previous read has settled, so a
 * slow server never sees two reads in flight. A hidden tab is not read; when it is shown again it
 * reads at once, since the back-off ran while nobody was looking.
 *
 * `key` names what is being watched (a document id, a list path): a new key, or `pending` turning
 * true again, starts a new spell with a fresh budget. `refresh` is handed `live`, which turns false
 * once this spell is over, so an answer that lands after the reader moved on is dropped instead of
 * painting the previous document over the new one.
 */
export function usePendingRefresh(
  key: string | null,
  pending: boolean,
  refresh: (live: () => boolean) => Promise<unknown>,
): void {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (key === null || !pending) return
    let over = false
    let inFlight = false
    let made = 0
    let timer: number | undefined
    const live = () => !over
    const hidden = () => document.visibilityState === 'hidden'

    const schedule = () => {
      if (over || made >= PENDING_REFRESH_LIMIT || hidden()) return
      const delay = PENDING_REFRESH_DELAYS_MS[Math.min(made, PENDING_REFRESH_DELAYS_MS.length - 1)]
      timer = window.setTimeout(read, delay)
    }

    function read() {
      timer = undefined
      if (over || inFlight || made >= PENDING_REFRESH_LIMIT || hidden()) return
      inFlight = true
      made += 1
      // A failed read is not worth a notice: the next one asks again, within the same cap.
      refreshRef
        .current(live)
        .catch(() => undefined)
        .finally(() => {
          inFlight = false
          schedule()
        })
    }

    const onVisibility = () => {
      if (hidden()) {
        window.clearTimeout(timer)
        timer = undefined
        return
      }
      if (timer === undefined && !inFlight) read()
    }

    document.addEventListener('visibilitychange', onVisibility)
    schedule()
    return () => {
      over = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key, pending])
}
