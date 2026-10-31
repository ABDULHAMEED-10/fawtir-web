import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { registerPosTill } from '../../api/pos/pos'
import { usePosTill, type TillState } from '../../lib/posTill'
import { posRefusalKey } from '../../lib/posRefusals'
import { noteTillServer, usePosQueue } from '../../lib/posQueue'
import { PosQueuePanel } from './PosQueuePanel'

type Ready = Extract<TillState, { status: 'ready' }>

/**
 * Every till screen runs on the device's till in the sidebar's branch (P.11). Until it is known
 * the page shows the shared notices; a branch with no till offers to register one to whoever may
 * (`pos.till.manage`), and says who to ask otherwise.
 */
export function PosTillGate({
  children,
  showQueue = false,
}: {
  children: (till: Ready) => ReactNode
  /** Shows the queue's waiting and refused sales above the screen (Till and Today). */
  showQueue?: boolean
}) {
  const state = usePosTill()
  if (state.status === 'loading') return <LoadingNotice />
  if (state.status === 'failed') return <ApiReadFailure error={state.error} retry={state.retry} />
  if (state.status === 'noBranch') return <TillNotice textKey="pos.till.noBranch" />
  if (state.status === 'noTill') return <NoTill state={state} />
  return (
    <>
      <QueueSender till={state.till} />
      {showQueue ? <PosQueuePanel till={state} /> : null}
      {children(state)}
    </>
  )
}

/**
 * Sends the till's offline sales (and their slip photos) on every till screen, as soon as the
 * browser is back online and every minute until they are all filed. Draws nothing.
 */
function QueueSender({ till }: { till: Ready['till'] }) {
  noteTillServer(till)
  usePosQueue(till.id)
  return null
}

function TillNotice({ textKey, action }: { textKey: string; action?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col items-center gap-4 rounded-md bg-surface-card px-6 py-12 text-center">
      <p className="text-sm font-medium text-text-tertiary">{t(textKey)}</p>
      {action}
    </div>
  )
}

function NoTill({ state }: { state: Extract<TillState, { status: 'noTill' }> }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!state.canRegister) return <TillNotice textKey="pos.till.noneAsk" />
  return (
    <TillNotice
      textKey="pos.till.none"
      action={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await registerPosTill(state.branchId)
                state.retry()
              } catch (cause) {
                setError(cause)
              } finally {
                setBusy(false)
              }
            }}
            className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            {t('pos.till.register')}
          </button>
          {error ? (
            <p className="text-xs font-medium text-danger-700">{t(posRefusalKey(error))}</p>
          ) : null}
        </>
      }
    />
  )
}
