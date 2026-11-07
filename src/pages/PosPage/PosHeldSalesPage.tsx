import { useTranslation } from 'react-i18next'
import { heldSalesPath, type PosHeldSale, type PosHeldSales } from '../../api/pos/pos'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { AppShell } from '../../layouts/AppShell'
import { hasPermission } from '../../lib/identity/entitlements'
import { offlineHoldTime as when } from '../../lib/posOfflineHolds'

const card = 'rounded-md bg-surface-card p-6'

/** The hold reasons the contract names (openapi e371713bf); any other is worded generally. */
const REASONS: Record<string, string> = {
  POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED: 'pos.heldSales.reason.goodsOrService',
  POS_QUEUED_SALE_HS_CODE_REQUIRED: 'pos.heldSales.reason.hsCode',
}

/**
 * Queued sales the server held for validation, and the numbers a till's queue is stuck behind
 * (HS-STALL-VIS, backend e371713bf). Review HSV-2: a row with no reason was never held, only waited
 * for, so it says the server has no record of that sale. Hold times and block times are two
 * different events and are never shown as one time.
 */
export function PosHeldSalesPage() {
  return (
    <AppShell>
      <HeldSales />
    </AppShell>
  )
}

function HeldSales() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  const allowed = !!entitlements && hasPermission(entitlements, 'pos.read')
  const list = useApiRead<PosHeldSales>(allowed ? heldSalesPath() : null)

  if (!ready) return <LoadingNotice />
  if (!allowed) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <p className={card}>{t('pos.heldSales.notAllowed')}</p>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('pos.heldSales.title')}</h1>
      <p className="text-sm text-text-tertiary">{t('pos.heldSales.intro')}</p>
      {list.read.status === 'loading' ? <LoadingNotice /> : null}
      {list.read.status === 'failed' ? <ApiReadFailure error={list.read.error} retry={list.retry} /> : null}
      {list.read.status === 'ready' ? (
        <>
          {list.read.data.truncated ? (
            <p role="status" className="rounded-sm bg-pending-100 px-3 py-3 text-sm font-medium text-pending-700">
              {t('pos.heldSales.truncated')}
            </p>
          ) : null}
          {list.read.data.items.length === 0 ? (
            <p className={card}>{t('pos.heldSales.none')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.read.data.items.map((item, index) => (
                // A null number would key every such item on a till alike (review QW5R-6); the
                // position tells them apart, and the list is read whole, never patched in place.
                <li key={`${item.tillId}-${item.kind ?? 'HELD'}-${item.heldNumber ?? `#${index}`}`} className={card}>
                  <HeldRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}

function RowTitle({ item }: { item: PosHeldSale }) {
  const { t } = useTranslation()
  return item.heldNumber === null
    ? t('pos.heldSales.rowNoNumber', { till: item.tillNumber })
    : t('pos.heldSales.row', { till: item.tillNumber, number: item.heldNumber })
}

function HeldRow({ item }: { item: PosHeldSale }) {
  const kind = item.kind ?? 'HELD'
  if (kind === 'HELD') return <HoldRow item={item} />
  if (kind === 'REFUSED') return <RefusedRow item={item} />
  return <ReviewRow item={item} withheld={kind === 'WITHHELD'} />
}

/**
 * A queued sale the server refused at issue (QB1R-5, coordinator ruling on QB8R-6): the till's later
 * numbers are blocked behind it, but it is not a hold, so it is never shown as overdue. Its refusal
 * code is not worded here; it is not one of the hold reasons above.
 */
function RefusedRow({ item }: { item: PosHeldSale }) {
  const { t } = useTranslation()
  const at = (instant: string | null | undefined) => when(instant ?? null) || t('pos.heldSales.timeUnknown')
  const again = item.reRefusedCount ?? 0
  return (
    <div className="flex flex-col gap-2 text-sm text-text-secondary">
      <p className="text-base font-semibold text-text-primary">
        <RowTitle item={item} />
      </p>
      <p className="font-medium text-text-primary">{t('pos.heldSales.refused', { number: item.heldNumber })}</p>
      {item.firstRefusedAt || item.lastRefusedAt ? (
        <p>
          {t('pos.heldSales.refusedTimes', { first: at(item.firstRefusedAt), last: at(item.lastRefusedAt) })}
          {again > 0 ? ` ${t('pos.heldSales.reRefused', { times: again })}` : ''}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Not a hold: nothing at the till resolves it, so it is never shown as overdue, whatever the flag
 * says. WITHHELD is a filed sale whose receipt was not printed (QW4R-3, QB8R-6); a kind this build
 * does not know is only said to be listed for review, with no reason, hold or block wording that
 * might not apply to it.
 */
function ReviewRow({ item, withheld }: { item: PosHeldSale; withheld: boolean }) {
  const { t } = useTranslation()
  const at = (instant: string | null) => when(instant) || t('pos.heldSales.timeUnknown')
  return (
    <div className="flex flex-col gap-2 text-sm text-text-secondary">
      <p className="text-base font-semibold text-text-primary">
        <RowTitle item={item} />
      </p>
      <p className="font-medium text-text-primary">
        {t(withheld ? 'pos.heldSales.withheld' : 'pos.heldSales.otherKind')}
      </p>
      {withheld && (item.firstHeldAt || item.lastHeldAt) ? (
        <p>{t('pos.heldSales.withheldTimes', { first: at(item.firstHeldAt), last: at(item.lastHeldAt) })}</p>
      ) : null}
    </div>
  )
}

function HoldRow({ item }: { item: PosHeldSale }) {
  const { t } = useTranslation()
  const blockedOnly = item.reason === null
  // Either end of a hold or block span may be null (H4R-7); a missing end says so rather than
  // printing nothing, and is never filled from the other end or from the other span.
  const at = (instant: string | null) => when(instant) || t('pos.heldSales.timeUnknown')
  return (
    <div className="flex flex-col gap-2 text-sm text-text-secondary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-text-primary">
          <RowTitle item={item} />
        </p>
        {item.overdue ? (
          <span className="rounded-sm bg-danger-100 px-2 py-1 text-xs font-semibold text-danger-700">
            {t('pos.heldSales.overdue')}
          </span>
        ) : null}
      </div>
      {blockedOnly ? (
        <p className="font-medium text-text-primary">
          {t('pos.heldSales.waitingFor', { number: item.expectedNumber ?? item.heldNumber })}
        </p>
      ) : (
        <p className="font-medium text-text-primary">
          {t(REASONS[item.reason as string] ?? 'pos.heldSales.reason.other')}
          {item.lines.length > 0 ? ` ${t('pos.heldSales.lines', { lines: item.lines.join(', ') })}` : ''}
        </p>
      )}
      {item.firstHeldAt || item.lastHeldAt ? (
        <p>
          {t('pos.heldSales.heldTimes', { first: at(item.firstHeldAt), last: at(item.lastHeldAt) })}
          {item.reHeldCount > 0 ? ` ${t('pos.heldSales.reHeld', { times: item.reHeldCount })}` : ''}
        </p>
      ) : null}
      {item.firstBlockedAt || item.lastBlockedAt ? (
        <p>
          {t('pos.heldSales.blockedTimes', {
            first: at(item.firstBlockedAt),
            last: at(item.lastBlockedAt),
          })}
          {!blockedOnly && item.expectedNumber
            ? ` ${t('pos.heldSales.queueWaits', { number: item.expectedNumber })}`
            : ''}
        </p>
      ) : null}
    </div>
  )
}
