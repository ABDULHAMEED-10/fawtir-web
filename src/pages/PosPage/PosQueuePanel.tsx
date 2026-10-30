import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Rial } from '../../components/ui'
import { omr, tillTime, toBaisa } from '../../lib/pos'
import {
  dismissQueuedSale,
  retryQueuedSale,
  useQueuedSales,
  type QueuedSale,
} from '../../lib/posQueue'
import { queueRefusalKey } from '../../lib/posRefusals'
import type { TillState } from '../../lib/posTill'

type Ready = Extract<TillState, { status: 'ready' }>

/**
 * A sale made offline has a number on a receipt the customer holds, so one the server has not taken
 * is never left silent (E2E 30 Oct 2026, H-1). Refused sales are listed with the reason, the next
 * step and a way to try again with the same key; a sale that can never be filed as it stands stays
 * here until a manager (`pos.refund`) has dealt with it and takes it off. Sales only waiting for the
 * connection are one quiet line.
 */
export function PosQueuePanel({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const entries = useQueuedSales(till.till.id)
  if (entries.length === 0) return null
  const problems = entries.filter((entry) => entry.refusal)
  const waiting = entries.length - problems.length

  return (
    <div className="mx-auto mb-4 flex w-full max-w-[1144px] flex-col gap-3">
      {problems.length > 0 ? (
        <section
          role="alert"
          className="rounded-md border border-danger-700 bg-danger-100 px-5 py-4 text-danger-700"
        >
          <h2 className="text-sm font-semibold">
            {t('pos.queue.problemTitle', { count: problems.length })}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {problems.map((entry) => (
              <Problem
                key={entry.key}
                entry={entry}
                tillId={till.till.id}
                canDismiss={till.can.refund}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {waiting > 0 ? (
        <p className="rounded-md bg-surface-card px-5 py-3 text-xs font-medium text-text-tertiary">
          {t('pos.queue.waiting', { count: waiting })}
        </p>
      ) : null}
    </div>
  )
}

function Problem({
  entry,
  tillId,
  canDismiss,
}: {
  entry: QueuedSale
  tillId: string
  canDismiss: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const amount = entry.body.payments.reduce((sum, payment) => sum + toBaisa(payment.amount), 0)

  const retry = async () => {
    setBusy(true)
    try {
      await retryQueuedSale(tillId, entry.key)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-sm bg-surface-card px-4 py-3 text-text-primary">
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
        <span dir="ltr">{entry.number}</span>
        <span className="inline-flex items-center gap-1 font-medium text-text-tertiary">
          <Rial />
          {omr(amount)}
        </span>
        <span className="font-medium text-text-tertiary">
          {tillTime(entry.body.soldAt, locale)}
        </span>
      </p>
      <p className="mt-1 text-sm font-medium text-danger-700">
        {t(queueRefusalKey(entry.refusal, entry.refusalType ?? null), entry.refusalValues ?? {})}
      </p>
      <p className="mt-1 text-xs font-medium text-text-tertiary">
        {entry.final ? t('pos.queue.finalHint') : t('pos.queue.heldHint')}
      </p>
      {confirming ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-text-primary">
            {t('pos.queue.dismissWarning', { invoice: entry.number })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void dismissQueuedSale(entry.key)}
              className="inline-flex h-9 items-center rounded-sm bg-danger-700 px-4 text-xs font-semibold text-white"
            >
              {t('pos.queue.dismissConfirm')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex h-9 items-center rounded-sm border border-border-subtle px-4 text-xs font-semibold text-text-primary"
            >
              {t('pos.queue.dismissKeep')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void retry()}
            className="inline-flex h-9 items-center rounded-sm bg-primary-700 px-4 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          >
            {t('pos.queue.retry')}
          </button>
          {entry.final && canDismiss ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-9 items-center rounded-sm border border-border-subtle px-4 text-xs font-semibold text-text-primary"
            >
              {t('pos.queue.dismiss')}
            </button>
          ) : null}
          {entry.final && !canDismiss ? (
            <span className="text-xs font-medium text-text-tertiary">
              {t('pos.queue.askManager')}
            </span>
          ) : null}
        </div>
      )}
    </li>
  )
}
