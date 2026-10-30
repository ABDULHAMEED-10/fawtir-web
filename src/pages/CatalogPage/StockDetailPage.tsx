import { useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Pill, Kpi } from './CatalogShell'
import { Pager, withRial } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import { omr } from '../../lib/catalog'
import { formatDate } from '../../lib/format'
import {
  loadStockItem,
  loadStockMovements,
  stockItemPath,
  stockMovementsPath,
  type StockAdjustmentResponse,
  type StockItemDetailDto,
  type StockMovementDto,
} from '../../api/stock/stock'
import {
  DELIVERY_EVERY_DAYS,
  deliveryLasts,
  deliveryThatHolds,
  isOut,
  isRunningLow,
  margin,
  movementKind,
  movementTime,
  movementLink,
  movementNote,
  movementTitleKey,
  quantityText,
  saferLevel,
  stockItemName,
  stockItemPlace,
  stockUnitName,
  type MovementKind,
} from '../../lib/catalogStock'
import { StockCountModal, StockReorderModal, useStockAccess } from './StockForms'
import kpiWorthIcon from '../../assets/catalog/kpi-worth.svg'
import kpiClockIcon from '../../assets/catalog/clock.svg'
import kpiChartIcon from '../../assets/catalog/kpi-earning.svg'
import kpiOutIcon from '../../assets/catalog/kpi-out.svg'
import calendarIcon from '../../assets/catalog/calendar.svg'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import plusIcon from '../../assets/catalog/plus-white.svg'
import downIcon from '../../assets/catalog/arrow-down.svg'
import upIcon from '../../assets/catalog/arrow-up.svg'
import pencilIcon from '../../assets/catalog/pencil-ink.svg'

const KIND_ICON: Record<MovementKind, string> = {
  sold: downIcon,
  writtenOff: pencilIcon,
  returned: upIcon,
  delivered: upIcon,
  corrected: pencilIcon,
}

const KIND_TINT: Record<MovementKind, string> = {
  sold: 'bg-danger-100',
  writtenOff: 'bg-pending-100',
  returned: 'bg-success-100',
  delivered: 'bg-success-100',
  corrected: 'bg-pending-100',
}

/** Movements to a page of the ledger. */
const MOVEMENTS_PAGE_SIZE = 20

/**
 * One item's shelf (Figma 135:49825), from `GET /v1/stock/items/{productId}` and its movements,
 * in the branch chosen in the sidebar.
 *
 * The reorder advice is the point: the level a person set is compared against what the item
 * actually sells and how long the supplier takes, and the safer number is offered rather than
 * left for them to work out.
 */
export function StockDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const variantId = params.get('variant')
  const access = useStockAccess()
  const branchRead = useWorkingBranch()
  const branchId = branchRead.branch?.id ?? null
  const path = access.canRead && branchId ? stockItemPath(id, branchId, variantId) : null
  const item = useApiRead<StockItemDetailDto>(path, () => loadStockItem(path!))
  const shown = useRef<{ path: string | null; data: StockItemDetailDto } | null>(null)

  const wait = (body: ReactNode) => (
    <CatalogShell crumbs={[{ labelKey: 'stock.title', to: '/stock' }]} title={t('stock.title')}>
      {body}
    </CatalogShell>
  )
  if (!access.ready || branchRead.read.status === 'loading') return wait(<LoadingNotice />)
  if (!access.canRead) return wait(<PermissionDeniedNotice />)
  if (item.read.status === 'failed')
    return wait(<ApiReadFailure error={item.read.error} retry={item.retry} notFoundOn400 />)
  // A reload after a count or a new level keeps the page (and its "saved" line) on screen with
  // the figures it had until the new ones arrive.
  if (item.read.status === 'ready') shown.current = { path, data: item.read.data }
  const data = shown.current?.path === path ? shown.current.data : null
  if (!data || !branchId) return wait(<LoadingNotice />)
  return (
    <StockItem
      key={`${data.productId}:${data.variantId ?? ''}:${branchId}`}
      item={data}
      branchId={branchId}
      canAdjust={access.canAdjust}
      canManage={access.canManage}
      canOrder={access.canOrder}
      reload={item.retry}
    />
  )
}

function StockItem({
  item,
  branchId,
  canAdjust,
  canManage,
  canOrder,
  reload,
}: {
  item: StockItemDetailDto
  branchId: string
  canAdjust: boolean
  canManage: boolean
  /** Order more raises a purchase order: only for `purchase-order.manage` (retest N-3). */
  canOrder: boolean
  reload: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [dialog, setDialog] = useState<'count' | 'reorder' | 'safer' | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const movementsPath = stockMovementsPath({
    productId: item.productId,
    branchId,
    variantId: item.variantId,
    page,
    size: MOVEMENTS_PAGE_SIZE,
  })
  const movements = useApiRead<Page<StockMovementDto>>(movementsPath, () =>
    loadStockMovements(movementsPath),
  )
  const ledger = movements.read.status === 'ready' ? movements.read.data : null

  const name = stockItemName(item, language)
  const place = stockItemPlace(item, language)
  const unit = stockUnitName(t, item.unitCode, language)
  const onHand = item.onHand
  const days = item.daysLeft
  const perDay = Math.round(item.perDay * 10) / 10
  const level = item.reorderLevel
  const safer =
    item.leadDays !== null && item.perDay > 0 ? saferLevel(item.perDay, item.leadDays) : null
  const saferNeeded = safer !== null && (level === null || safer > level)
  const receipt = item.lastReceipt
  const lasted = receipt ? deliveryLasts(receipt.quantity, item.perDay) : null
  const better = deliveryThatHolds(item.perDay, DELIVERY_EVERY_DAYS)
  const orders = item.onOrder ?? []
  const onOrder = orders.reduce((sum, order) => sum + order.quantity, 0)
  const cost = item.lastCost ?? item.averageCost
  const supplierId = item.supplier?.supplierId ?? receipt?.supplierId ?? null
  const supplierName = item.supplier?.name ?? receipt?.supplierName ?? null
  const orderMoreTo = supplierId
    ? `/suppliers/${encodeURIComponent(supplierId)}/purchase-order`
    : '/suppliers'

  /* The plot runs from y 24 (the busiest day) down to the axis at y 250. */
  const daily = item.daily ?? []
  const values = daily.map((day) => day.onHandEnd)
  const max = Math.max(1, level ?? 0, ...values.map((value) => value ?? 0))
  const axisY = 250
  const plotH = 226
  const xAt = (index: number) => 20 + (index / Math.max(1, daily.length - 1)) * 680
  const yAt = (value: number) => axisY - (Math.max(0, value) / max) * plotH
  const drawn = values
    .map((value, index) => (value === null ? null : `${xAt(index)},${yAt(value)}`))
    .filter((point): point is string => point !== null)
  const firstDrawn = values.findIndex((value) => value !== null)
  const lastIndex = daily.length - 1
  const points = drawn.join(' ')
  const area =
    drawn.length > 0 ? `${xAt(firstDrawn)},${axisY} ${points} ${xAt(lastIndex)},${axisY}` : ''
  /** The reorder line is only drawn when the level sits inside the month's range. */
  const reorderInRange = level !== null && level > 0 && level <= max
  const reorderY = level === null ? 0 : yAt(level)
  const deliveryAt = receipt ? daily.findIndex((day) => day.date === receipt.receivedOn) : -1
  const deliveryX = xAt(Math.max(0, deliveryAt))
  const lastValue = lastIndex >= 0 ? values[lastIndex] : null
  const ticks = daily.length
    ? [0, Math.round(lastIndex / 3), Math.round((2 * lastIndex) / 3), lastIndex]
    : []

  const finished = (result?: StockAdjustmentResponse) => {
    setDialog(null)
    setDone(
      result
        ? t(`stock.forms.done.${result.kind}`, { number: result.number })
        : t('stock.reorder.saved'),
    )
    reload()
    movements.retry()
  }

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'stock.title', to: '/stock' }, { label: name }]}
      title={name}
      // The frame's subtitle opens with the item's group and kind: fixed by backend #808 (not
      // deployed yet, INCOME.md row P.19); an older server's item starts at its code.
      subtitle={`${place ? `${place} · ` : ''}${
        supplierName
          ? t('stockItem.live.subtitle', { code: item.code, unit, supplier: supplierName })
          : t('stockItem.live.subtitleNoSupplier', { code: item.code, unit })
      }`}
      pills={
        <>
          {item.state === 'LOW' ? <Pill tone="pending">{t('stockItem.runningLow')}</Pill> : null}
          {isOut(item) ? <Pill tone="danger">{t('stock.kpi.nothingLeft')}</Pill> : null}
          {item.state === 'NOT_COUNTED' ? (
            <Pill tone="neutral">{t('stock.live.notCountedYet')}</Pill>
          ) : null}
          {item.productActive && !item.variantRetired ? (
            <Pill tone="success">{t('stockItem.onSale')}</Pill>
          ) : (
            <Pill tone="neutral">{t('stockItem.live.offSale')}</Pill>
          )}
        </>
      }
      actions={
        <>
          <Link
            to={`/catalog/${encodeURIComponent(item.productId)}`}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('stockItem.openTheItem')}
          </Link>
          {canAdjust ? (
            <button
              type="button"
              onClick={() => setDialog('count')}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('stockItem.correctTheCount')}
            </button>
          ) : null}
          {canOrder ? (
            <Link
              to={orderMoreTo}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('stockItem.orderMore')}
            </Link>
          ) : null}
        </>
      }
    >
      {done ? (
        <p
          role="status"
          className="rounded-md bg-surface-card px-5 py-3 text-sm font-semibold text-[#3d5648]"
        >
          {done}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiWorthIcon}
          highlight={isRunningLow(item) || isOut(item)}
          tone={isRunningLow(item) || isOut(item) ? 'pending' : undefined}
          label={t('stockItem.kpi.onHand')}
          value={onHand === null ? '—' : quantityText(onHand, language)}
          unit={onHand === null ? undefined : unit}
          // TODO(backend): the frame counts how many are promised to a bundle; `dependsOnIt` is
          // always null for now, so the last count is shown instead (INCOME.md, row P.20).
          note={
            item.lastCountedAt
              ? t('stockItem.live.lastCounted', {
                  date: formatDate(item.lastCountedAt.slice(0, 10), language),
                })
              : t('stockItem.live.neverCounted')
          }
        />
        <Kpi
          icon={kpiClockIcon}
          label={t('stockItem.kpi.lasts')}
          value={days === null ? '—' : String(days)}
          unit={days === null ? undefined : t('stockItem.kpi.days')}
          note={t('stockItem.kpi.lastsNote', { rate: perDay })}
        />
        <Kpi
          icon={kpiChartIcon}
          label={t('stockItem.kpi.worth')}
          value={item.worth === null ? '—' : omr(item.worth)}
          currency={item.worth !== null}
          note={
            item.averageCost === null
              ? t('stock.live.noCost')
              : item.sellingPrice === null
                ? t('stockItem.live.worthNoPrice', { cost: omr(item.averageCost) })
                : t('stockItem.live.worthNote', {
                    cost: omr(item.averageCost),
                    sells: omr(item.sellingPrice),
                  })
          }
        />
        <Kpi
          icon={kpiOutIcon}
          tint="bg-danger-100"
          tone={orders.length ? undefined : 'muted'}
          label={t('stockItem.kpi.onOrder')}
          value={orders.length ? quantityText(onOrder, language) : t('stockItem.kpi.nothingYet')}
          unit={orders.length ? unit : undefined}
          note={
            orders.length
              ? orders[0].wantedBy
                ? t('stockItem.live.onOrderWanted', {
                    reference: orders.map((order) => order.number).join(', '),
                    date: formatDate(orders[0].wantedBy, language),
                  })
                : orders.map((order) => order.number).join(', ')
              : t('stockItem.live.nothingOnOrder')
          }
        />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* The month */}
          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-primary-800">
                  {t('stockItem.lastThirtyDays')}
                </span>{' '}
                <span className="text-xs font-medium text-text-quaternary">
                  {t('stockItem.live.onHandDayByDay', { unit })}
                </span>
              </p>
              {/* TODO(backend): the frame's period picker and export have no route yet: the
                  item answers thirty days and the movements have no export (INCOME.md, row P.21). */}
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled
                  aria-label={t('stockItem.lastThirtyDays')}
                  className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white opacity-60"
                >
                  <img src={calendarIcon} alt="" className="size-4" />
                </button>
                <button
                  type="button"
                  disabled
                  aria-label={t('stockItem.export')}
                  className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white opacity-60"
                >
                  <img src={downloadIcon} alt="" className="size-4" />
                </button>
              </span>
            </div>

            <div className="px-5">
              <svg viewBox="0 0 720 290" className="w-full" role="presentation">
                {area ? <polygon points={area} fill="#2c4eb7" fillOpacity="0.06" /> : null}
                <line x1="20" x2="700" y1={axisY} y2={axisY} stroke="#e4e6ea" strokeWidth="1" />
                {reorderInRange ? (
                  <>
                    <line
                      x1="20"
                      x2="700"
                      y1={reorderY}
                      y2={reorderY}
                      stroke="#887147"
                      strokeWidth="1.5"
                      strokeDasharray="6 5"
                    />
                    <text
                      x="700"
                      y={reorderY - 7}
                      textAnchor="end"
                      fontSize="12"
                      fontWeight="600"
                      fill="#887147"
                    >
                      {t('stockItem.orderAt', { count: level ?? 0 })}
                    </text>
                  </>
                ) : null}
                {receipt && deliveryAt >= 0 ? (
                  <>
                    <line
                      x1={deliveryX}
                      x2={deliveryX}
                      y1="10"
                      y2={axisY}
                      stroke="#2c3342"
                      strokeWidth="1.5"
                      strokeDasharray="3 4"
                    />
                    <text x={deliveryX + 8} y="22" fontSize="12" fill="#3d5648" fontWeight="600">
                      {t('stockItem.delivered', { count: receipt.quantity })}
                    </text>
                  </>
                ) : null}
                {points ? (
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#2c4eb7"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                ) : null}
                {lastValue !== null && lastValue !== undefined ? (
                  <circle
                    cx={xAt(lastIndex)}
                    cy={yAt(lastValue)}
                    r="5"
                    fill="#fff"
                    stroke="#887147"
                    strokeWidth="2.5"
                  />
                ) : null}
                {ticks.map((index, position) => (
                  <text
                    key={`${index}-${position}`}
                    x={xAt(index)}
                    y="278"
                    textAnchor={position === 3 ? 'end' : position === 0 ? 'start' : 'middle'}
                    fontSize="13"
                    fill={position === 3 ? '#2c4eb7' : '#737781'}
                    fontWeight={position === 3 ? '600' : '400'}
                  >
                    {shortDay(daily[index].date, language)}
                  </text>
                ))}
              </svg>
            </div>

            <p className="mt-2 border-t border-surface-background px-5 py-3.5 text-sm font-medium leading-[1.6] text-text-tertiary">
              {receipt && lasted !== null ? (
                <Trans
                  i18nKey={
                    receipt.quantity < better
                      ? 'stockItem.live.chartNoteShort'
                      : 'stockItem.live.chartNoteEnough'
                  }
                  values={{
                    count: quantityText(receipt.quantity, language),
                    unit,
                    date: formatDate(receipt.receivedOn, language),
                    days: lasted,
                    better,
                  }}
                  components={{ b: <b className="font-semibold text-text-primary" /> }}
                />
              ) : receipt ? (
                // Received, but nothing sold yet: no rate to say how long it lasts (F-10).
                t('stockItem.live.chartNoteNoRate', {
                  count: quantityText(receipt.quantity, language),
                  unit,
                  date: formatDate(receipt.receivedOn, language),
                })
              ) : (
                t('stockItem.live.chartNoteNone')
              )}
            </p>
          </section>

          {/* The ledger */}
          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p>
                <span className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('stockItem.everyMovement')}
                </span>{' '}
                <span className="text-xs font-medium text-text-quaternary">
                  {t('stockItem.everyMovementNote')}
                </span>
              </p>
              {/* TODO(backend): no export route for the movements yet (INCOME.md, row P.21). */}
              <button
                type="button"
                disabled
                className="text-sm font-semibold text-primary-700 opacity-60"
              >
                {t('stockItem.export')}
              </button>
            </div>

            {movements.read.status === 'failed' ? (
              <div className="p-5 pt-0">
                <ApiReadFailure error={movements.read.error} retry={movements.retry} />
              </div>
            ) : !ledger ? (
              <div className="p-5 pt-0">
                <LoadingNotice />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-y border-surface-background text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                      <th className="h-[38px] px-5 text-start font-semibold">
                        {t('stockItem.col.when')}
                      </th>
                      <th className="h-[38px] px-4 text-start font-semibold">
                        {t('stockItem.col.what')}
                      </th>
                      <th className="h-[38px] px-4 text-end font-semibold">
                        {t('stockItem.col.change')}
                      </th>
                      <th className="h-[38px] px-5 text-end font-semibold">
                        {t('stockItem.col.leftAfter')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-10 text-center text-sm font-medium text-text-quaternary"
                        >
                          {t('stockItem.live.noMovements')}
                        </td>
                      </tr>
                    ) : (
                      ledger.items.map((movement) => (
                        <MovementRow key={movement.id} movement={movement} level={level} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {ledger && pageCountOf(ledger) > 1 ? (
              <div className="flex justify-end px-5 py-4">
                <Pager
                  page={page + 1}
                  pageCount={pageCountOf(ledger)}
                  onChange={(next) => setPage(next - 1)}
                  labels={{
                    nav: t('appList.pager.label'),
                    previous: t('appList.pager.previous'),
                    next: t('appList.pager.next'),
                  }}
                />
              </div>
            ) : null}
          </section>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('stockItem.whenToReorder')}
              </h3>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setDialog('reorder')}
                  className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('stockItem.change')}
                </button>
              ) : null}
            </div>
            <dl className="mt-2">
              <Row
                label={t('stockItem.warnMeAt')}
                value={
                  level === null
                    ? t('stock.live.noLevel')
                    : `${quantityText(level, language)} ${unit}`
                }
              />
              <Row
                label={t('stockItem.usuallyOrder')}
                value={
                  item.usualOrderQuantity === null
                    ? '—'
                    : `${quantityText(item.usualOrderQuantity, language)} ${unit}`
                }
              />
              <Row label={t('stockItem.selling')} value={t('stockItem.aDay', { count: perDay })} />
              <Row
                label={t('stockItem.supplierTakes')}
                value={item.leadDays === null ? '—' : t('stockItem.days', { count: item.leadDays })}
              />
              <Row
                label={t('stockItem.soWarnMeAt')}
                value={
                  safer === null
                    ? '—'
                    : saferNeeded
                      ? t('stockItem.wouldBeSafer', { count: safer })
                      : t('stockItem.alreadySafe')
                }
                tone={saferNeeded ? 'pending' : undefined}
              />
            </dl>
            {saferNeeded && safer !== null && canManage ? (
              <button
                type="button"
                onClick={() => setDialog('safer')}
                className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('stockItem.setTheLevel', { count: safer })}
              </button>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('stockItem.whoSuppliesIt')}
            </h3>
            <dl className="mt-2">
              <Row label={t('stockItem.supplier')} value={supplierName ?? '—'} />
              <Row label={t('stockItem.youPay')} value={cost === null ? '—' : `OMR ${omr(cost)}`} />
              <Row
                label={t('stockItem.youSellAt')}
                value={item.sellingPrice === null ? '—' : `OMR ${omr(item.sellingPrice)}`}
              />
              <Row
                label={t('stockItem.margin')}
                value={
                  cost === null || item.sellingPrice === null
                    ? '—'
                    : `${margin(cost, item.sellingPrice)}%`
                }
              />
              {/* TODO(backend): the supplier's delivery days and the last price change have no
                  field yet (docs/backend-guides/INCOME.md, row P.22). */}
              <Row label={t('stockItem.delivers')} value="—" />
              <Row
                label={t('stockItem.lastPriceChange')}
                value={
                  receipt && receipt.unitCost !== null
                    ? t('stockItem.live.lastPaid', {
                        amount: `OMR ${omr(receipt.unitCost)}`,
                        date: formatDate(receipt.receivedOn, language),
                      })
                    : '—'
                }
              />
            </dl>
            <Link
              to={supplierId ? `/suppliers/${encodeURIComponent(supplierId)}` : '/suppliers'}
              className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('stockItem.openTheSupplier')}
            </Link>
          </section>

          {/* TODO(backend): what depends on the item (bundles, open quotations, recurring orders)
              comes as `dependsOnIt`, which is always null for now (INCOME.md, row P.20). */}
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('stockItem.whatDependsOnIt')}
            </h3>
            <dl className="mt-2">
              <Row label={t('stockItem.openQuotations')} value="—" />
              <Row label={t('stockItem.recurringOrders')} value="—" />
            </dl>
          </section>
        </aside>
      </div>

      {canAdjust ? (
        <StockCountModal
          open={dialog === 'count'}
          onClose={() => setDialog(null)}
          branchId={branchId}
          rows={[item]}
          onDone={finished}
        />
      ) : null}
      {canManage ? (
        <StockReorderModal
          open={dialog === 'reorder' || dialog === 'safer'}
          onClose={() => setDialog(null)}
          branchId={branchId}
          rows={[item]}
          suggested={dialog === 'safer' ? safer : null}
          onDone={() => finished()}
        />
      ) : null}
    </CatalogShell>
  )
}

/** A business date as "24 Jul", for the chart's axis. */
function shortDay(date: string, language: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  return new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-OM-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))))
}

function MovementRow({ movement, level }: { movement: StockMovementDto; level: number | null }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const kind = movementKind(movement)
  const link = movementLink(movement)
  const note = movementNote(t, movement, language)
  const below = level !== null && movement.onHandAfter < level
  const atLimit = level !== null && movement.onHandAfter === level
  const when = new Date(movement.occurredAt)
  const date = Number.isNaN(when.getTime())
    ? movement.occurredAt
    : new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-OM-u-nu-latn' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Muscat',
      }).format(when)
  const time = movementTime(movement)

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-5 py-4 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-primary">{date}</p>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary tabular-nums" dir="ltr">
          {time}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span
            className={[
              'flex size-7 shrink-0 items-center justify-center rounded-md',
              KIND_TINT[kind],
            ].join(' ')}
          >
            <img src={KIND_ICON[kind]} alt="" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t(movementTitleKey(movement))}
            </p>
            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
              {withRial(note)}
              {link ? (
                <>
                  {note ? ' ' : ''}
                  <Link
                    to={link.to}
                    dir="ltr"
                    className="font-semibold text-primary-700 transition-colors hover:underline"
                  >
                    {link.label}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <span
          dir="ltr"
          className={[
            'text-sm font-semibold tabular-nums',
            movement.quantityChange > 0 ? 'text-[#3d5648]' : 'text-danger-700',
          ].join(' ')}
        >
          {movement.quantityChange > 0 ? '+' : '−'}
          {quantityText(Math.abs(movement.quantityChange), language)}
        </span>
      </td>

      <td className="px-5 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums" dir="ltr">
          {quantityText(movement.onHandAfter, language)}
        </p>
        <p
          className={[
            'mt-0.5 text-xs font-medium',
            below || atLimit ? 'text-pending-700' : 'text-text-quaternary',
          ].join(' ')}
        >
          {atLimit
            ? t('stockItem.atTheLimit')
            : below
              ? t('stockItem.belowLevel', { count: level ?? 0 })
              : ''}
        </p>
      </td>
    </tr>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'pending' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 whitespace-nowrap text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'min-w-0 text-end text-sm font-semibold',
          tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {withRial(value)}
      </dd>
    </div>
  )
}
