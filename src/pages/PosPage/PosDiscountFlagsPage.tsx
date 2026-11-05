import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  DISCOUNT_FLAG_NOTE_MAX,
  acknowledgeDiscountFlag,
  discountFlagsPath,
  type DiscountFlag,
} from '../../api/pos/offlineBinding'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { AppShell } from '../../layouts/AppShell'
import { offlineHoldTime as when } from '../../lib/posOfflineHolds'
import { posRefusalKey } from '../../lib/posRefusals'
import type { TillState } from '../../lib/posTill'
import { PosTillGate } from './PosTillGate'

type Ready = Extract<TillState, { status: 'ready' }>

/**
 * Sales kept above the cashier's discount limit, and a manager's acknowledgement of each (RC5 A2;
 * backend 598fd6715). Gated as the offline holds are: the list and the acknowledgement both need
 * `pos.close` for every cashier, and the server refuses OWN with POS_ATTRIBUTION_REVIEWER_ONLY.
 */
export function PosDiscountFlagsPage() {
  return (
    <AppShell>
      <PosTillGate>{(till) => <Flags till={till} />}</PosTillGate>
    </AppShell>
  )
}

const card = 'rounded-md bg-surface-card p-6'
const button =
  'inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'

// The server's ceiling (92 days): the widest window, so a flag not yet acknowledged stays in sight
// as long as the route lets it be asked for.
const WINDOW_MS = 92 * 24 * 3_600_000

/**
 * The refusals after which sending again cannot succeed for this row, so the form gives way to the
 * sentence. Anything else (offline, a 5xx) leaves the form to try again.
 */
const FINAL = new Set([
  'POS_DISCOUNT_FLAG_HUMAN_ONLY',
  'POS_DISCOUNT_FLAG_NOT_FOUND',
  'POS_DISCOUNT_FLAG_SELF',
  'POS_DISCOUNT_FLAG_ALREADY_ACKNOWLEDGED',
  'POS_ATTRIBUTION_REVIEWER_ONLY',
])

function Flags({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const [range] = useState(() => {
    const to = new Date()
    return { from: new Date(to.getTime() - WINDOW_MS).toISOString(), to: to.toISOString() }
  })
  const list = useApiRead<DiscountFlag[]>(
    till.can.close ? discountFlagsPath(till.branchId, range.from, range.to) : null,
  )
  if (!till.can.close) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <p className={card}>{t('pos.discountFlags.notAllowed')}</p>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
        {t('pos.discountFlags.title')}
      </h1>
      <p className="text-sm text-text-tertiary">{t('pos.discountFlags.intro')}</p>
      {list.read.status === 'loading' ? <LoadingNotice /> : null}
      {list.read.status === 'failed' ? (
        // The entitlements carry no qualifier, so pos.close OWN is told apart only by this refusal;
        // it is worded rather than shown as a failure to retry (as the legacy report does).
        list.read.error instanceof ApiError &&
        list.read.error.code === 'POS_ATTRIBUTION_REVIEWER_ONLY' ? (
          <p className={card}>{t('pos.refusal.POS_ATTRIBUTION_REVIEWER_ONLY')}</p>
        ) : (
          <ApiReadFailure error={list.read.error} retry={list.retry} />
        )
      ) : null}
      {list.read.status === 'ready' ? (
        list.read.data.length === 0 ? (
          <p className={card}>{t('pos.discountFlags.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.read.data.map((flag) => (
              <li key={flag.saleId} className={card}>
                <FlagRow flag={flag} userId={till.userId} onAcknowledged={list.retry} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}

function FlagRow({
  flag,
  userId,
  onAcknowledged,
}: {
  flag: DiscountFlag
  userId: string | null
  onAcknowledged: () => void
}) {
  const { t } = useTranslation()
  const discount = String(flag.discountPercentMax)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span dir="ltr" className="text-sm font-semibold text-primary-700">
          {flag.invoiceNumber}
        </span>
        <span className="text-sm text-text-tertiary">{when(flag.soldAt)}</span>
        <span className="text-sm text-text-secondary">
          {flag.cashierName
            ? t('pos.discountFlags.cashier', { name: flag.cashierName })
            : t('pos.discountFlags.cashierUnnamed', { id: flag.cashierUserId.slice(0, 8) })}
        </span>
        <span className="rounded-sm bg-pending-100 px-2 py-0.5 text-xs font-semibold text-pending-700">
          {flag.limitPercent != null
            ? t('pos.discountFlags.discount', { discount, limit: String(flag.limitPercent) })
            : t('pos.discountFlags.discountNoLimit', { discount })}
        </span>
        <span dir="ltr" className="text-sm font-medium text-text-primary">
          {flag.total.toFixed(3)}
        </span>
      </div>
      {flag.judgedAt === 'RESOLUTION' ? (
        <p className="text-sm text-text-tertiary">{t('pos.discountFlags.afterReview')}</p>
      ) : null}
      {flag.acknowledgedBy !== null ? (
        <p className="text-sm text-text-secondary">
          {flag.acknowledgedBy === userId
            ? t('pos.discountFlags.acknowledgedByYou', { at: when(flag.acknowledgedAt) })
            : t('pos.discountFlags.acknowledgedByOther', {
                id: flag.acknowledgedBy.slice(0, 8),
                at: when(flag.acknowledgedAt),
              })}
        </p>
      ) : userId !== null && flag.cashierUserId === userId ? (
        // Four-eyes: the server refuses it anyway (409 POS_DISCOUNT_FLAG_SELF, and a database
        // CHECK); this only spares the cashier a form that cannot succeed.
        <p className="text-sm text-text-tertiary">{t('pos.refusal.POS_DISCOUNT_FLAG_SELF')}</p>
      ) : (
        <Acknowledge saleId={flag.saleId} onAcknowledged={onAcknowledged} />
      )}
    </div>
  )
}

function Acknowledge({ saleId, onAcknowledged }: { saleId: string; onAcknowledged: () => void }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const final = error instanceof ApiError && error.code !== null && FINAL.has(error.code)
  return (
    <form
      className="flex flex-col gap-3 border-t border-border-subtle pt-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy || final) return
        setBusy(true)
        setError(null)
        try {
          // A replay (`replayed: true`) is this manager's own recorded acknowledgement: success.
          await acknowledgeDiscountFlag(saleId, note)
          onAcknowledged()
        } catch (cause) {
          setError(cause)
        } finally {
          setBusy(false)
        }
      }}
    >
      {final ? null : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t('pos.discountFlags.note')}
            <textarea
              maxLength={DISCOUNT_FLAG_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-20 rounded-sm border border-border-subtle p-2"
            />
          </label>
          <p className="text-sm text-text-tertiary">{t('pos.discountFlags.final')}</p>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-error-600">
          {t(posRefusalKey(error))}
        </p>
      ) : null}
      {final ? null : (
        <button type="submit" disabled={busy} className={button}>
          {t('pos.discountFlags.submit')}
        </button>
      )}
    </form>
  )
}
