import { Link, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Pill, Kpi } from './CatalogShell'
import { omr, groupName, kindName } from '../../lib/catalog'
import {
  STOCK_ITEM_ID,
  stockRowOf,
  itemOf,
  rowWorth,
  daysLeft,
  SUPPLIER,
  margin,
  saferLevel,
  deliveryLasts,
  deliveryThatHolds,
  MOVEMENTS,
  THIRTY_DAYS,
  DELIVERY_AT,
  DELIVERY_SIZE,
  DEPENDS_ON_IT,
  type Movement,
} from '../../lib/catalogStock'
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

const KIND_ICON: Record<string, string> = {
  sold: downIcon,
  writtenOff: pencilIcon,
  held: downIcon,
  delivered: upIcon,
  corrected: pencilIcon,
}

const KIND_TINT: Record<string, string> = {
  sold: 'bg-danger-100',
  writtenOff: 'bg-pending-100',
  held: 'bg-danger-100',
  delivered: 'bg-success-100',
  corrected: 'bg-pending-100',
}

/**
 * One item's shelf (Figma 135:49825).
 *
 * The reorder advice is the point: the level a person set is compared against what the item
 * actually sells and how long the supplier takes, and the safer number is offered rather than
 * left for them to work out.
 */
export function StockDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()

  const row = stockRowOf(id ?? STOCK_ITEM_ID)
  const item = itemOf(row.id)
  const days = daysLeft(row)
  const safer = saferLevel(row.perDay, SUPPLIER.leadDays)
  const lastedDays = deliveryLasts(DELIVERY_SIZE, row.perDay)
  const better = deliveryThatHolds(row.perDay, 13)

  const max = Math.max(...THIRTY_DAYS)
  const points = THIRTY_DAYS.map((value, index) => {
    const x = 40 + (index / (THIRTY_DAYS.length - 1)) * 660
    const y = 190 - (value / max) * 160
    return `${x},${y}`
  }).join(' ')
  const reorderY = 190 - (row.reorderAt / max) * 160
  const deliveryX = 40 + (DELIVERY_AT / (THIRTY_DAYS.length - 1)) * 660

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'stock.title', to: '/catalog/stock' },
        { label: item.name },
      ]}
      title={item.name}
      subtitle={t('stockItem.subtitle', {
        group: groupName(item.group),
        kind: kindName(item.group, item.kind),
        code: item.code,
        unit: t(row.unitKey),
        supplier: row.supplier,
      })}
      pills={
        <>
          <Pill tone="pending">{t('stockItem.runningLow')}</Pill>
          <Pill tone="success">{t('stockItem.onSale')}</Pill>
        </>
      }
      actions={
        <>
          <Link
            to={`/catalog/${item.id}`}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('stockItem.openTheItem')}
          </Link>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('stockItem.correctTheCount')}
          </button>
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('stockItem.orderMore')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiWorthIcon}
          highlight
          tone="pending"
          label={t('stockItem.kpi.onHand')}
          value={String(row.onHand)}
          unit={t(row.unitKey)}
          note={t('stockItem.kpi.onHandNote', { count: 1 })}
        />
        <Kpi
          icon={kpiClockIcon}
          label={t('stockItem.kpi.lasts')}
          value={String(days ?? 0)}
          unit={t('stockItem.kpi.days')}
          note={t('stockItem.kpi.lastsNote', { rate: row.perDay })}
        />
        <Kpi
          icon={kpiChartIcon}
          label={t('stockItem.kpi.worth')}
          value={omr(rowWorth(row))}
          unit="OMR"
          note={t('stockItem.kpi.worthNote', {
            cost: omr(SUPPLIER.cost),
            sells: omr(SUPPLIER.sells),
          })}
        />
        <Kpi
          icon={kpiOutIcon}
          tint="bg-danger-100"
          label={t('stockItem.kpi.onOrder')}
          value={t('stockItem.kpi.nothingYet')}
          note={t('stockItem.kpi.onOrderNote', { reference: 'PO-0034' })}
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
                  {t('stockItem.bagsOnHand')}
                </span>
              </p>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('stockItem.lastThirtyDays')}
                  className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
                >
                  <img src={calendarIcon} alt="" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('stockItem.export')}
                  className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
                >
                  <img src={downloadIcon} alt="" className="size-4" />
                </button>
              </span>
            </div>

            <div className="px-5">
              <svg viewBox="0 0 720 230" className="w-full" role="presentation">
                {/* the level a person set */}
                <line
                  x1="40"
                  x2="700"
                  y1={reorderY}
                  y2={reorderY}
                  stroke="#887147"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text x="700" y={reorderY - 6} textAnchor="end" fontSize="11" fill="#887147">
                  {t('stockItem.orderAt', { count: row.reorderAt })}
                </text>

                {/* the day a delivery landed */}
                <line
                  x1={deliveryX}
                  x2={deliveryX}
                  y1="20"
                  y2="190"
                  stroke="#2c3342"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x={deliveryX + 6} y="30" fontSize="11" fill="#3d5648" fontWeight="600">
                  {t('stockItem.delivered', { count: DELIVERY_SIZE })}
                </text>

                <polyline points={points} fill="none" stroke="#2c4eb7" strokeWidth="2" />
                <circle
                  cx={40 + 660}
                  cy={190 - (THIRTY_DAYS[THIRTY_DAYS.length - 1] / max) * 160}
                  r="4"
                  fill="#fff"
                  stroke="#887147"
                  strokeWidth="2"
                />

                {['1 Jul', '10 Jul', '20 Jul', '30 Jul'].map((label, index) => (
                  <text
                    key={label}
                    x={40 + (index / 3) * 660}
                    y="214"
                    textAnchor={index === 3 ? 'end' : index === 0 ? 'start' : 'middle'}
                    fontSize="11"
                    fill={index === 3 ? '#2c4eb7' : '#737781'}
                    fontWeight={index === 3 ? '600' : '400'}
                  >
                    {label}
                  </text>
                ))}
              </svg>
            </div>

            <p className="mt-2 border-t border-surface-background px-5 py-3.5 text-sm font-medium leading-[1.6] text-text-tertiary">
              <Trans
                i18nKey="stockItem.chartNote"
                values={{ count: DELIVERY_SIZE, date: '24 July', days: lastedDays, better }}
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
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
              <button
                type="button"
                className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {t('stockItem.export')}
              </button>
            </div>

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
                  {MOVEMENTS.map((movement) => (
                    <MovementRow key={movement.id} movement={movement} level={row.reorderAt} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('stockItem.whenToReorder')}
              </h3>
              <button
                type="button"
                className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {t('stockItem.change')}
              </button>
            </div>
            <dl className="mt-2">
              <Row label={t('stockItem.warnMeAt')} value={`${row.reorderAt} ${t(row.unitKey)}`} />
              <Row
                label={t('stockItem.usuallyOrder')}
                value={`${SUPPLIER.usuallyOrder} ${t(row.unitKey)}`}
              />
              <Row
                label={t('stockItem.selling')}
                value={t('stockItem.aDay', { count: row.perDay })}
              />
              <Row
                label={t('stockItem.supplierTakes')}
                value={t('stockItem.days', { count: SUPPLIER.leadDays })}
              />
              <Row
                label={t('stockItem.soWarnMeAt')}
                value={
                  safer > row.reorderAt
                    ? t('stockItem.wouldBeSafer', { count: safer })
                    : t('stockItem.alreadySafe')
                }
                tone={safer > row.reorderAt ? 'pending' : undefined}
                last
              />
            </dl>
            {safer > row.reorderAt ? (
              <button
                type="button"
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
              <Row label={t('stockItem.supplier')} value={SUPPLIER.name} />
              <Row label={t('stockItem.youPay')} value={`OMR ${omr(SUPPLIER.cost)}`} />
              <Row label={t('stockItem.youSellAt')} value={`OMR ${omr(SUPPLIER.sells)}`} />
              <Row
                label={t('stockItem.margin')}
                value={`${margin(SUPPLIER.cost, SUPPLIER.sells)}%`}
              />
              <Row label={t('stockItem.delivers')} value={SUPPLIER.delivers} />
              <Row
                label={t('stockItem.lastPriceChange')}
                value={t('stockItem.priceChangeValue', SUPPLIER.lastPriceChange)}
                last
              />
            </dl>
            <Link
              to="/suppliers"
              className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('stockItem.openTheSupplier')}
            </Link>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('stockItem.whatDependsOnIt')}
            </h3>
            <dl className="mt-2">
              <Row
                label={DEPENDS_ON_IT.bundle}
                value={t('stockItem.cappedAt', { count: DEPENDS_ON_IT.cappedAt })}
                tone="pending"
              />
              <Row
                label={t('stockItem.openQuotations')}
                value={
                  DEPENDS_ON_IT.quotations === 0
                    ? t('stockItem.none')
                    : String(DEPENDS_ON_IT.quotations)
                }
              />
              <Row
                label={t('stockItem.recurringOrders')}
                value={
                  DEPENDS_ON_IT.recurring === 0
                    ? t('stockItem.none')
                    : String(DEPENDS_ON_IT.recurring)
                }
                last
              />
            </dl>
          </section>
        </aside>
      </div>
    </CatalogShell>
  )
}

function MovementRow({ movement, level }: { movement: Movement; level: number }) {
  const { t } = useTranslation()
  const below = movement.leftAfter < level
  const atLimit = movement.leftAfter === level

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-5 py-4 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-primary">{movement.date}</p>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary tabular-nums">
          {movement.at}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span
            className={[
              'flex size-7 shrink-0 items-center justify-center rounded-md',
              KIND_TINT[movement.kind],
            ].join(' ')}
          >
            <img src={KIND_ICON[movement.kind]} alt="" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{t(movement.titleKey)}</p>
            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
              {t(movement.noteKey, movement.noteValues)}
              {movement.link ? (
                <>
                  {' '}
                  <Link
                    to={movement.link.to}
                    className="font-semibold text-primary-700 transition-colors hover:underline"
                  >
                    {movement.link.label}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <span
          className={[
            'text-sm font-semibold tabular-nums',
            movement.change > 0 ? 'text-[#3d5648]' : 'text-danger-700',
          ].join(' ')}
        >
          {movement.change > 0 ? '+' : ''}
          {movement.change}
        </span>
      </td>

      <td className="px-5 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">{movement.leftAfter}</p>
        <p
          className={[
            'mt-0.5 text-xs font-medium',
            below || atLimit ? 'text-pending-700' : 'text-text-quaternary',
          ].join(' ')}
        >
          {atLimit
            ? t('stockItem.atTheLimit')
            : below
              ? t('stockItem.belowLevel', { count: level })
              : ''}
        </p>
      </td>
    </tr>
  )
}

function Row({
  label,
  value,
  tone,
  last,
}: {
  label: string
  value: string
  tone?: 'pending'
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'shrink-0 text-sm font-semibold',
          tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
