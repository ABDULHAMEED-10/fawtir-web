import { useLayoutEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { registerPosTill } from '../../api/pos/pos'
import { usePosTill, type TillState } from '../../lib/posTill'
import { refusalSentence } from '../../lib/posRefusals'
import { noteTillServer, usePosQueue } from '../../lib/posQueue'
import { restoreUncertainSale, useOtherTillHolds } from '../../lib/posSale'
import { useOfflineSigningKey } from '../../lib/posSigning/useOfflineSigningKey'
import { PosQueuePanel } from './PosQueuePanel'
import { PosStorageNotice } from './PosStorageNotice'
import { PosTabLockNotice } from './PosTabLockNotice'

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
      <HeldSaleRestorer
        tenantId={state.tenantId ?? null}
        tillId={state.till.id}
        tillLabel={state.till.name || state.till.code}
      />
      <OtherTillHolds tenantId={state.tenantId ?? null} tillId={state.till.id} />
      <QueueSender till={state.till} userId={state.userId} />
      <OfflineSigningKey state={state} />
      <PosTabLockNotice tillId={state.till.id} />
      <PosStorageNotice tillId={state.till.id} />
      {showQueue ? <PosQueuePanel till={state} /> : null}
      {children(state)}
    </>
  )
}

/**
 * Brings back this till's sale held with an unknown outcome (E01R-1) before the screen paints, and
 * puts another till's aside (RBW2-4), so the till offers only the same sale again. Draws nothing.
 */
function HeldSaleRestorer({
  tenantId,
  tillId,
  tillLabel,
}: {
  tenantId: string | null
  tillId: string
  tillLabel: string
}) {
  useLayoutEffect(() => restoreUncertainSale(tenantId, tillId, tillLabel), [tenantId, tillId, tillLabel])
  return null
}

/**
 * Another till's held sale is never shown or sent here (RBW2-4), but whoever stands at this till
 * is told, so nothing is rung on that till again before Today is checked there.
 */
function OtherTillHolds({ tenantId, tillId }: { tenantId: string | null; tillId: string }) {
  const { t } = useTranslation()
  const others = useOtherTillHolds(tenantId, tillId)
  if (others.length === 0) return null
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[1144px] flex-col gap-1">
      {others.map((label) => (
        <p
          key={label}
          role="status"
          className="rounded-sm bg-warning-100 px-4 py-3 text-sm font-semibold text-text-primary"
        >
          {t('pos.pay.uncertain.otherTill', { till: label })}
        </p>
      ))}
    </div>
  )
}

/**
 * Sends the offline sales the signed-in person made on this till (and their slip photos) on every
 * till screen, as soon as the browser is back online and every minute until they are filed. Draws
 * nothing. A sale someone else made waits for an explicit Send for (owner round 5, P3b).
 */
function QueueSender({ till, userId }: { till: Ready['till']; userId: string | null }) {
  noteTillServer(till)
  usePosQueue(till.id, userId)
  return null
}

/**
 * Keeps the cashier's offline signing key registered. Says something only when the cashier can fix
 * what stops it: the device clock. Every other state is silent, because a till that cannot sign
 * still sells, and its queued sales are held for a manager instead.
 */
function OfflineSigningKey({ state }: { state: Ready }) {
  const { t } = useTranslation()
  const key = useOfflineSigningKey(state.till, state.userId, state.mine)
  if (key !== 'clockSkew') return null
  return (
    <p role="status" className="mx-auto mb-3 w-full max-w-[1144px] rounded-md bg-surface-card px-4 py-3 text-sm text-text-secondary">
      {t('pos.offline.clockSkew')}
    </p>
  )
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
            <p className="text-xs font-medium text-danger-700">{refusalSentence(t, error)}</p>
          ) : null}
        </>
      }
    />
  )
}
