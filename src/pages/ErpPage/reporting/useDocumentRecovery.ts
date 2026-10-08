import { useCallback, useRef, useState } from 'react'
import { recoverSourceDocument } from '../../../api/erp/reporting'
import {
  noticeOfFailure,
  noticeOfResult,
  refreshAfter,
  type RecoveryNotice,
} from '../../../lib/erp/recovery'

/**
 * A recovery request and its answer, held above the document's sections.
 *
 * The answer outlives the re-read that follows it: the detail shows a loading state while it
 * reads the document again, which unmounts the sections and the button, so a notice kept inside
 * them would vanish with the very refresh that confirms it. `onSettled` is that re-read.
 */
export function useDocumentRecovery(recordId: string, onSettled: () => void) {
  const [notice, setNotice] = useState<{ recordId: string; notice: RecoveryNotice } | null>(null)
  const [busy, setBusy] = useState(false)
  // State alone lets a double click through: both clicks run before the disabled render.
  const inFlight = useRef(false)

  const recover = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    let next: RecoveryNotice
    try {
      next = noticeOfResult(await recoverSourceDocument(recordId))
    } catch (error) {
      next = noticeOfFailure(error)
    }
    inFlight.current = false
    setBusy(false)
    setNotice({ recordId, notice: next })
    if (refreshAfter(next)) onSettled()
  }, [recordId, onSettled])

  return {
    notice: notice?.recordId === recordId ? notice.notice : null,
    busy,
    recover,
  }
}
