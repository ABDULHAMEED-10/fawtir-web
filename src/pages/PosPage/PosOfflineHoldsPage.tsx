import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  legacySalesPath,
  offlineHoldCandidatesPath,
  offlineHoldPath,
  offlineHoldsPath,
  resolveOfflineHold,
  revokeOfflineSigningKey,
  tillOfflineKeysPath,
  type ActiveOfflineKey,
  type HoldStatus,
  type LegacyOfflineSale,
  type OfflineHoldCandidate,
  type OfflineHeldFor,
  type OfflineHoldDetail,
  type OfflineHoldSummary,
  type OfflineKeyRevoked,
} from '../../api/pos/offlineBinding'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { AppShell } from '../../layouts/AppShell'
import { refusalSentence } from '../../lib/posRefusals'
import {
  heldForMessage,
  heldForText,
  maskedPayload,
  offlineHoldTime as when,
} from '../../lib/posOfflineHolds'
import type { TillState } from '../../lib/posTill'
import { PosTillGate } from './PosTillGate'

type Ready = Extract<TillState, { status: 'ready' }>

/**
 * Queued sales whose seller the server could not prove, and the manager's decision on each
 * (WEB-8; BINDING-DESIGN §8.4), with the LEGACY report (§10.1) and revoking a lost device's key
 * (WEB-11). The server decides who sees what: a Cashier with `pos.close` OWN gets their own holds
 * with every evidence member null (L-5), and this page shows what it is given.
 */
export function PosOfflineHoldsPage() {
  return (
    <AppShell>
      <PosTillGate>{(till) => <Holds till={till} />}</PosTillGate>
    </AppShell>
  )
}

const card = 'rounded-md bg-surface-card p-6'
const button =
  'inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'


function Holds({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<HoldStatus>('OPEN')
  const [open, setOpen] = useState<string | null>(null)
  const list = useApiRead<OfflineHoldSummary[]>(
    till.can.close ? offlineHoldsPath(till.branchId, status) : null,
  )
  if (!till.can.close) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <p className={card}>{t('pos.offline.holds.notAllowed')}</p>
        {till.can.sell || till.can.manage ? <TillKeys till={till} /> : null}
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
        {t('pos.offline.holds.title')}
      </h1>
      <p className="text-sm text-text-tertiary">{t('pos.offline.holds.intro')}</p>
      <div className="flex gap-2" role="tablist">
        {(['OPEN', 'RESOLVED'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={status === tab}
            onClick={() => {
              setStatus(tab)
              setOpen(null)
            }}
            className={button}
          >
            {t(`pos.offline.holds.tab.${tab}`)}
          </button>
        ))}
      </div>
      {list.read.status === 'loading' ? <LoadingNotice /> : null}
      {list.read.status === 'failed' ? (
        <ApiReadFailure error={list.read.error} retry={list.retry} />
      ) : null}
      {list.read.status === 'ready' ? (
        list.read.data.length === 0 ? (
          <p className={card}>{t('pos.offline.holds.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.read.data.map((hold) => (
              <li key={hold.holdId} className={card}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-start"
                  aria-expanded={open === hold.holdId}
                  onClick={() => setOpen(open === hold.holdId ? null : hold.holdId)}
                >
                  <span dir="ltr" className="text-sm font-semibold text-primary-700">
                    {hold.invoiceNumber}
                  </span>
                  <span className="text-sm text-text-tertiary">{when(hold.soldAt)}</span>
                  {hold.filedByName ? (
                    <span className="text-sm text-text-secondary">
                      {t('pos.offline.filedBy', { name: hold.filedByName })}
                    </span>
                  ) : null}
                  {hold.reason ? (
                    <span className="text-sm text-text-secondary">
                      {t(`pos.offline.reason.${hold.reason}`, {
                        defaultValue: t('pos.offline.reason.other'),
                      })}
                    </span>
                  ) : null}
                  {hold.manualDiscount ? (
                    <span className="rounded-sm bg-pending-100 px-2 py-0.5 text-xs font-semibold text-pending-700">
                      {t('pos.offline.holds.manualDiscount')}
                    </span>
                  ) : null}
                  {hold.serverTotal != null ? (
                    <span dir="ltr" className="text-sm font-medium text-text-primary">
                      {hold.serverTotal.toFixed(3)}
                    </span>
                  ) : null}
                </button>
                {open === hold.holdId ? (
                  <HoldDetail
                    holdId={hold.holdId}
                    limited={hold.filedByUserId === null}
                    canManage={till.can.manage}
                    userId={till.userId}
                    onResolved={list.retry}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {till.can.sell || till.can.manage ? <TillKeys till={till} /> : null}
      {/* The entitlements carry no qualifier, so the list is the only sign of pos.close OWN: rows
          that come back without evidence. Then the report, which needs pos.close for every
          cashier, is not offered (WSR-11). */}
      {list.read.status === 'ready' &&
      list.read.data.length > 0 &&
      list.read.data.every((hold) => hold.filedByUserId === null) ? null : (
        <LegacyReport branchId={till.branchId} />
      )}
    </div>
  )
}

function HoldDetail({
  holdId,
  limited,
  canManage,
  userId,
  onResolved,
}: {
  holdId: string
  limited: boolean
  canManage: boolean
  userId: string | null
  onResolved: () => void
}) {
  const { t } = useTranslation()
  // A Cashier's own holds come without evidence, and the detail needs pos.close for every cashier
  // (POS_ATTRIBUTION_REVIEWER_ONLY): not asked for, rather than asked for and refused (WSR-11).
  const detail = useApiRead<OfflineHoldDetail>(limited ? null : offlineHoldPath(holdId))
  if (limited) return <p className="mt-3 text-sm text-text-tertiary">{t('pos.offline.holds.limited')}</p>
  if (detail.read.status === 'loading') return <LoadingNotice />
  if (detail.read.status === 'failed') {
    return <ApiReadFailure error={detail.read.error} retry={detail.retry} />
  }
  const hold = detail.read.data
  const rows: [string, string][] = [
    [t('pos.offline.detail.outcome'), hold.outcome],
    [t('pos.offline.detail.revocation'), hold.revocationSource ?? ''],
    [t('pos.offline.detail.keyId'), hold.presentedKeyId ?? ''],
    [t('pos.offline.detail.deviceId'), hold.presentedDeviceId ?? ''],
    [t('pos.offline.detail.keyWindow'), `${when(hold.keyRegisteredAt)} – ${when(hold.keyValidUntil)}`],
    [t('pos.offline.detail.printedTotal'), hold.printedTotal?.toFixed(3) ?? ''],
    [t('pos.offline.detail.serverTotal'), hold.serverTotal?.toFixed(3) ?? ''],
    [t('pos.offline.detail.discountMax'), hold.discountPercentMax?.toString() ?? ''],
    [t('pos.offline.detail.signatureSha256'), hold.signatureSha256 ?? ''],
  ]
  return (
    <div className="mt-4 flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-[220px_1fr]">
        {rows
          .filter(([, value]) => value && value !== ' – ')
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-tertiary">{label}</dt>
              <dd dir="ltr" className="break-all text-text-primary">
                {value}
              </dd>
            </div>
          ))}
      </dl>
      {hold.heldFor ? <HeldFor heldFor={hold.heldFor} /> : null}
      {hold.payloadWithheld === 'CARD_NUMBER' ? (
        <p className="text-sm text-text-secondary">
          {t('pos.offline.detail.withheld')}{' '}
          <span dir="ltr" className="break-all">
            {hold.payloadSha256}
          </span>
        </p>
      ) : hold.payload ? (
        <pre dir="ltr" className="max-h-80 overflow-auto rounded-sm bg-surface-background p-3 text-xs">
          {JSON.stringify(maskedPayload(hold.payload), null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-tertiary">{t('pos.offline.detail.noPayload')}</p>
      )}
      {canManage && hold.presentedKeyId ? <RevokeKey keyId={hold.presentedKeyId} /> : null}
      {/* Four-eyes (WSR-10): the sender never decides their own sale. The server refuses it anyway
          (409 POS_ATTRIBUTION_SELF); this only spares the reviewer a form that cannot succeed. */}
      {hold.summary.status === 'OPEN' && userId !== null && hold.summary.filedByUserId === userId ? (
        <p className="text-sm text-text-tertiary">{t('pos.refusal.POS_ATTRIBUTION_SELF')}</p>
      ) : hold.summary.status === 'OPEN' ? (
        <Resolve holdId={holdId} userId={userId} onResolved={onResolved} />
      ) : null}
    </div>
  )
}

/**
 * What the server recorded when it held the sale (PRV43-OFF2 N-1), so the reviewer decides with the
 * server's reasons in front of them and not a guess at them. Codes and prices are shown as recorded.
 */
function HeldFor({ heldFor }: { heldFor: OfflineHeldFor }) {
  const { t } = useTranslation()
  const { causes, lines } = heldForText(heldFor)
  return (
    <section className="flex flex-col gap-1.5 text-sm">
      <h3 className="font-semibold text-text-primary">{t('pos.offline.detail.heldFor.title')}</h3>
      <ul className="list-disc ps-5 text-text-secondary">
        {causes.map((cause, at) => (
          <li key={`cause-${at}`}>{heldForMessage(t, cause)}</li>
        ))}
        {lines.map((line, at) => (
          <li key={`line-${at}`}>{heldForMessage(t, line)}</li>
        ))}
      </ul>
    </section>
  )
}

function Resolve({
  holdId,
  userId,
  onResolved,
}: {
  holdId: string
  userId: string | null
  onResolved: () => void
}) {
  const { t } = useTranslation()
  const candidates = useApiRead<OfflineHoldCandidate[]>(offlineHoldCandidatesPath(holdId))
  const [choice, setChoice] = useState<string>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const ready = choice !== '' && reason.trim().length > 0 && reason.trim().length <= 1000
  return (
    <form
      className="flex flex-col gap-3 border-t border-border-subtle pt-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!ready) return
        setBusy(true)
        setError(null)
        try {
          await resolveOfflineHold(
            holdId,
            choice === 'KEEP'
              ? { decision: 'KEEP_UNATTRIBUTED', reason: reason.trim() }
              : { decision: 'ATTRIBUTE', shiftId: choice, reason: reason.trim() },
          )
          onResolved()
        } catch (cause) {
          setError(cause)
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="text-sm font-semibold text-text-primary">{t('pos.offline.resolve.title')}</p>
      {candidates.read.status === 'failed' ? (
        <ApiReadFailure error={candidates.read.error} retry={candidates.retry} />
      ) : null}
      <fieldset className="flex flex-col gap-2 text-sm">
        {candidates.read.status === 'ready'
          ? candidates.read.data.map((candidate) => (
              <label key={candidate.shiftId} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`resolve-${holdId}`}
                  value={candidate.shiftId}
                  checked={choice === candidate.shiftId}
                  // A reviewer cannot attribute a sale to their own shift (POS_ATTRIBUTION_SELF).
                  disabled={userId !== null && candidate.cashierUserId === userId}
                  onChange={() => setChoice(candidate.shiftId)}
                />
                {t('pos.offline.resolve.attribute', {
                  name: candidate.cashierName ?? '',
                  from: when(candidate.openedAt),
                })}
              </label>
            ))
          : null}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`resolve-${holdId}`}
            value="KEEP"
            checked={choice === 'KEEP'}
            onChange={() => setChoice('KEEP')}
          />
          {t('pos.offline.resolve.keep')}
        </label>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {t('pos.offline.resolve.reason')}
        <textarea
          required
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-20 rounded-sm border border-border-subtle p-2"
        />
      </label>
      <p className="text-sm text-text-tertiary">{t('pos.offline.resolve.final')}</p>
      {error ? (
        <p role="alert" className="text-sm text-error-600">
          {refusalSentence(t, error)}
        </p>
      ) : null}
      <button type="submit" disabled={!ready || busy} className={button}>
        {t('pos.offline.resolve.submit')}
      </button>
    </form>
  )
}

function RevokeKey({ keyId }: { keyId: string }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<OfflineKeyRevoked | 'already' | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (done === 'already') return <p className="text-sm">{t('pos.offline.revoke.already')}</p>
  if (done) {
    return (
      <p className="text-sm">{t('pos.offline.revoke.done', { count: done.filedSalesCount })}</p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-tertiary">{t('pos.offline.revoke.explain')}</p>
      <button
        type="button"
        disabled={busy}
        className={button}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            setDone(await revokeOfflineSigningKey(keyId))
          } catch (cause) {
            if (cause instanceof ApiError && cause.code === 'POS_OFFLINE_KEY_ALREADY_REVOKED') {
              setDone('already')
            } else {
              setError(cause)
            }
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('pos.offline.revoke.action')}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-error-600">
          {refusalSentence(t, error)}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The till's active device keys, each revocable (WEB-11): a lost or stolen device can be cut off
 * even before any of its sales is held. The server lists every key to a manager of the till and only
 * their own to anyone else, and refuses a revoke the caller may not make, so the page shows the list
 * it is given. It carries no names, so a key is named as the reader's own or by its cashier's id.
 */
function TillKeys({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const keys = useApiRead<ActiveOfflineKey[]>(tillOfflineKeysPath(till.till.id))
  return (
    <section className={card}>
      <h2 className="text-lg font-medium text-text-primary">{t('pos.offline.keys.title')}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t('pos.offline.keys.intro')}</p>
      {keys.read.status === 'loading' ? <LoadingNotice /> : null}
      {keys.read.status === 'failed' ? (
        <ApiReadFailure error={keys.read.error} retry={keys.retry} />
      ) : null}
      {keys.read.status === 'ready' ? (
        keys.read.data.length === 0 ? (
          <p className="mt-3 text-sm">{t('pos.offline.keys.none')}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {keys.read.data.map((key) => (
              <li key={key.keyId} className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                <p className="text-sm text-text-primary">
                  {key.cashierUserId === till.userId
                    ? t('pos.offline.keys.yours')
                    : t('pos.offline.keys.cashier', { id: key.cashierUserId.slice(0, 8) })}
                </p>
                <p className="text-sm text-text-tertiary">
                  {t('pos.offline.keys.valid', {
                    from: when(key.registeredAt),
                    until: when(key.validUntil),
                  })}
                </p>
                <RevokeKey keyId={key.keyId} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

function LegacyReport({ branchId }: { branchId: string }) {
  const { t } = useTranslation()
  const [range] = useState(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 3_600_000)
    return { from: from.toISOString(), to: to.toISOString() }
  })
  const [shown, setShown] = useState(false)
  const report = useApiRead<LegacyOfflineSale[]>(
    shown ? legacySalesPath(branchId, range.from, range.to) : null,
  )
  return (
    <section className={card}>
      <h2 className="text-lg font-medium text-text-primary">{t('pos.offline.legacyReport.title')}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t('pos.offline.legacyReport.intro')}</p>
      {!shown ? (
        <button type="button" className={`${button} mt-3`} onClick={() => setShown(true)}>
          {t('pos.offline.legacyReport.show')}
        </button>
      ) : report.read.status === 'loading' ? (
        <LoadingNotice />
      ) : report.read.status === 'failed' ? (
        // An OWN-only caller with no holds to show cannot be told apart beforehand; the server's
        // refusal is worded instead of shown as a failure.
        report.read.error instanceof ApiError &&
        report.read.error.code === 'POS_ATTRIBUTION_REVIEWER_ONLY' ? (
          <p className="mt-3 text-sm">{t('pos.refusal.POS_ATTRIBUTION_REVIEWER_ONLY')}</p>
        ) : (
          <ApiReadFailure error={report.read.error} retry={report.retry} />
        )
      ) : report.read.data.length === 0 ? (
        <p className="mt-3 text-sm">{t('pos.offline.legacyReport.none')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {report.read.data.map((sale) => (
            <li key={sale.saleId} className="flex flex-wrap gap-3">
              <span dir="ltr">{sale.invoiceNumber}</span>
              <span>{when(sale.soldAt)}</span>
              <span>{t('pos.offline.legacy', { name: sale.filedByName ?? '' })}</span>
              <span dir="ltr">{sale.total.toFixed(3)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
