import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks/useApiRead'
import { erpMappingKey, loadErpMapping, type ErpMappingView } from '../../lib/erp/mappingState'
import type { MappingFormat } from '../../api/erp/mapping'

/**
 * Loads the real mapping state once for whichever mapping screen the reader opened, and does not
 * render that screen until it is there.
 *
 * **Why a gate rather than a hook per screen.** Every mapping screen derives its whole view from
 * one state object, synchronously, and there are seven of them plus the shell's own status pill and
 * subnav badges. Giving each its own read would mean nine independent loading states on one page
 * and nine chances to show a figure computed from a half-loaded state. Loading once above them all
 * keeps the screens as simple as they were against the design mock, and keeps the loading, failed
 * and permission-denied cases in exactly one place.
 *
 * The eight underlying requests are issued together by {@link loadErpMapping} and de-duplicated by
 * the shared in-flight registry, so this does not multiply calls.
 */

/**
 * The format the guided screens operate on.
 *
 * **JSON, and not a choice the reader gets to make.** `GuidedMappingCompiler` emits JSONata
 * unconditionally — it takes no format parameter — while the save path validates the compiled
 * expression against the engine the path's format selects. A complete guided mapping saved under
 * `XML` would therefore hand JSONata to the XSLT compiler and be refused at activation, after the
 * draft had already been accepted. So guided authoring is JSON-only in effect, and pretending
 * otherwise would offer a wizard that works until the moment it matters.
 *
 * XML mapping is the expert route: a hand-written XSLT 3.0 stylesheet through
 * `PUT /mapping-profiles/XML`. The Advanced screen is where that belongs.
 */
export const GUIDED_MAPPING_FORMAT: MappingFormat = 'JSON'

type ErpMappingContextValue = {
  view: ErpMappingView
  /** Re-reads everything. Call after any mutation, so no screen renders a stale roll-up. */
  reload: () => void
}

const ErpMappingContext = createContext<ErpMappingContextValue | null>(null)

/**
 * The loaded mapping state.
 *
 * Throws outside {@link ErpMappingGate} rather than returning a default: a screen rendering
 * zeroes because it was mounted outside the gate would look like a tenant with no mapping, which
 * is a real state and would be indistinguishable from the bug.
 */
export function useErpMapping(): ErpMappingView {
  const value = useContext(ErpMappingContext)
  if (!value) throw new Error('useErpMapping must be used inside ErpMappingGate')
  return value.view
}

export function useErpMappingReload(): () => void {
  const value = useContext(ErpMappingContext)
  if (!value) throw new Error('useErpMappingReload must be used inside ErpMappingGate')
  return value.reload
}

/**
 * Chrome for the states where there is no mapping state yet, so the frame does not flash.
 *
 * Titled with the overview's heading rather than a heading of its own: the reader is on a mapping
 * screen either way, and a second title would be one more string to keep in step for a state that
 * lasts a few hundred milliseconds.
 */
function GateNotice({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={t('erp.overview.title')}
        subtitle={t('erp.overview.subtitle')}
      />
      <div className="px-1 py-6">{children}</div>
    </SettingsShell>
  )
}

export function ErpMappingGate({ children }: { children: ReactNode }) {
  const format = GUIDED_MAPPING_FORMAT
  const { read, retry } = useApiRead<ErpMappingView>(erpMappingKey(format), () =>
    loadErpMapping(format),
  )
  const reload = useCallback(() => retry(), [retry])

  /**
   * The last view that loaded, kept across a re-read.
   *
   * `useApiRead` reports `loading` again the moment the attempt counter changes, which is right
   * for a first load and wrong for a refresh: every mutation on these screens calls `reload` to
   * bring the roll-up up to date, and without this the screen would drop back to the loading
   * notice, unmounting whatever the reader was looking at. A certification report is the clearest
   * case — it is rendered inside a modal, and the modal is a child of the screen, so refreshing
   * after the run threw away the report the run produced.
   *
   * So a refresh keeps showing the previous answer until the new one arrives. The figures are at
   * most one round-trip stale; they were going to change anyway, which is why it was reloading.
   */
  const lastReady = useRef<ErpMappingView | null>(null)
  if (read.status === 'ready') lastReady.current = read.data

  const current = read.status === 'ready' ? read.data : lastReady.current

  const value = useMemo(
    () => (current ? { view: current, reload } : null),
    [current, reload],
  )

  if (read.status === 'loading' && !lastReady.current) {
    return (
      <GateNotice>
        <LoadingNotice />
      </GateNotice>
    )
  }

  // A 403 renders as "no access" and a 404 as not found, both from the shared notice — never as an
  // empty mapping, which is a real state a tenant can legitimately be in and must not be confused
  // with a refusal. A 401 never arrives here: useApiRead sends the reader to sign in.
  //
  // Only when there is nothing to show. A *refresh* that fails leaves the previous answer on
  // screen rather than replacing the reader's work with an error page; the action that triggered
  // the refresh reports its own failure, and it has the specific message worth reading.
  if (read.status === 'failed' && !lastReady.current) {
    return (
      <GateNotice>
        <ApiReadFailure error={read.error} retry={retry} />
      </GateNotice>
    )
  }

  return <ErpMappingContext.Provider value={value}>{children}</ErpMappingContext.Provider>
}
