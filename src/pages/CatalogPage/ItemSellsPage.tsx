import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { ItemPills, ItemReadState, useItemRecord } from './itemRecord'
import { ChangeChips, useHistoryWords } from './itemHistory'
import { PlainBars, HorizontalBars } from '../../components/reports/charts'
import { SERIES } from '../../components/reports/scale'
import { Popover, Rial } from '../../components/ui'
import { RialFigure } from './RialFigure'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { omr } from '../../lib/catalog'
import {
  getProductHistory,
  getProductSales,
  productHistoryPath,
  productSalesPath,
  type ProductHistoryEntry,
  type ProductHistoryPageDto,
  type ProductSalesDto,
} from '../../api/catalog/insights'
import {
  SALES_WINDOWS,
  addOnFacts,
  bestBar,
  dateLocale,
  broughtIn,
  mostPopularVariant,
  percentOf,
  rollSeries,
  salesPeriod,
  weekdays,
  type SalesWindow,
} from '../../lib/catalogInsights'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import expandIcon from '../../assets/catalog/expand.svg'
import chevronWhiteIcon from '../../assets/create-invoice/chevron.svg'
import upIcon from '../../assets/catalog/arrow-up.svg'
import changeUpIcon from '../../assets/catalog/arrow-up.svg'
import changeAddIcon from '../../assets/catalog/plus-brand.svg'
import changeEditIcon from '../../assets/catalog/pencil-ink.svg'
import changeTickIcon from '../../assets/catalog/check-green.svg'

/** The hours the By hour of day card draws while the API has no hourly figures. */
const TRADING_HOURS = ['7', '8', '9', '10', '11', '12', '1', '2']

/** An icon for a history entry, by what it touched first. */
function changeIcon(entry: Pick<ProductHistoryEntry, 'categories'>) {
  const first = entry.categories[0]
  if (first === 'CREATED') return changeTickIcon
  if (first === 'PRICE') return changeUpIcon
  if (first === 'SIZES' || first === 'BRANCHES') return changeAddIcon
  return changeEditIcon
}

/**
 * Catalog › one item › How it sells (Figma 135:46588), from `GET /v1/products/{id}/sales`.
 *
 * The period picker reads the window day by day (the API allows a year by DAY) and the page rolls
 * the days into months, weeks or days, and into weekdays for the busiest and quietest day. Every
 * sentence under a chart is worked out from the figures drawn above it. Figures are before VAT
 * and net of credit notes; a till sale counts as an invoice.
 */
export function ItemSellsPage() {
  const { id = '' } = useParams()
  const record = useItemRecord(id)
  return (
    <ItemReadState read={record.read}>
      <ItemSells id={id} record={record} />
    </ItemReadState>
  )
}

function ItemSells({ id, record }: { id: string; record: ReturnType<typeof useItemRecord> }) {
  const { t, i18n } = useTranslation()
  const product = record.product!
  const [window, setWindow] = useState<SalesWindow>('yearly')
  const words = useHistoryWords()

  // The sidebar's working branch (P.9), as every catalogue screen; read once the branches answer.
  const branchRead = useWorkingBranch()
  const branchId = branchRead.branch?.id ?? null
  const period = useMemo(() => salesPeriod(window), [window])
  const salesPath = productSalesPath(id, { ...period, interval: 'DAY', branchId })
  const sales = useApiRead<ProductSalesDto>(
    branchRead.read.status === 'loading' ? null : salesPath,
    () => getProductSales(salesPath),
  )
  const historyPath = productHistoryPath(id, { size: 4 })
  const history = useApiRead<ProductHistoryPageDto>(historyPath, () =>
    getProductHistory(historyPath),
  )
  const data = sales.read.status === 'ready' ? sales.read.data : null

  const bucket = SALES_WINDOWS[window].bucket
  const bars = useMemo(() => (data ? rollSeries(data.series, bucket) : []), [data, bucket])
  const best = bestBar(bars)
  const barLabel = (start: string) => {
    const date = new Date(`${start}T00:00:00`)
    return bucket === 'month'
      ? date.toLocaleDateString(dateLocale(i18n.language), { month: 'short' })
      : bucket === 'week'
        ? date.toLocaleDateString(dateLocale(i18n.language), { day: 'numeric', month: 'short' })
        : date.toLocaleDateString(dateLocale(i18n.language), { day: 'numeric' })
  }
  /** The best bar, named in full for a day (the bar itself shows only the day's number). */
  const bestLabel = (start: string) =>
    bucket === 'day'
      ? new Date(`${start}T00:00:00`).toLocaleDateString(dateLocale(i18n.language), {
          day: 'numeric',
          month: 'short',
        })
      : barLabel(start)
  const weekdayName = (day: number) =>
    // 2023-01-01 was a Sunday, so day 0 is Sunday as Date.getDay() counts.
    new Date(2023, 0, 1 + day).toLocaleDateString(dateLocale(i18n.language), { weekday: 'long' })
  const days = data ? weekdays(data.series) : null
  const popular = data ? mostPopularVariant(data) : null
  const addOns = data ? addOnFacts(data) : null
  const units = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 })
  const channelTotal = data ? data.till.units + data.invoice.units : 0
  const entries = history.read.status === 'ready' ? history.read.data.content : []

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: product.name }]}
      title={product.name}
      subtitle={t('itemSells.meta', {
        group: record.group || '-',
        kind: record.kind || '-',
        code: product.code,
        sizes: product.sizes?.length ?? 0,
        addOns: product.addOns?.length ?? 0,
      })}
      pills={<ItemPills product={product} sold={data ? data.total.units : null} />}
      actions={
        <>
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={downloadIcon} alt="" className="size-[18px]" />
            {t('itemSells.export')}
          </button>
          <PeriodPicker
            value={window}
            onChange={(next) => setWindow(next as SalesWindow)}
            options={[
              { value: 'yearly', label: t('itemSells.yearly') },
              { value: 'quarterly', label: t('itemSells.quarterly') },
              { value: 'monthly', label: t('itemSells.monthly') },
            ]}
          />
        </>
      }
      tabs={<ItemTabs id={id} active="sells" />}
    >
      {sales.read.status === 'failed' ? (
        <ApiReadFailure error={sales.read.error} retry={sales.retry} />
      ) : !data ? (
        <LoadingNotice />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* TODO(backend): INCOME.md IP.3. No year-on-year figures, so the change chips
                stay drawn without a figure. */}
            <Stat
              label={t('itemSells.kpi.sold')}
              value={units(data.total.units)}
              delta={null}
              note={t('itemSells.kpi.soldNote')}
            />
            <Stat
              label={t('itemSells.kpi.broughtIn')}
              value={omr(broughtIn(data))}
              currency
              delta={null}
              note={t('itemSells.kpi.broughtInNote')}
            />
            {/* TODO(backend): INCOME.md IP.4. No sales of the item's group to share against. */}
            <Stat
              label={
                record.group
                  ? t('itemSells.kpi.shareOfGroup', { group: record.group })
                  : t('itemSells.kpi.shareNoGroup')
              }
              value="-"
              delta={null}
              note={t('itemSells.notYet')}
            />
            <Stat
              label={t('itemSells.kpi.average')}
              value={omr(data.averagePrice ?? 0)}
              currency
              delta={null}
              note={t('itemSells.kpi.averageNote')}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={t(`itemSells.soldEach.${bucket}`)}
              note={
                best ? (
                  <Trans
                    i18nKey={`itemSells.best.${bucket}`}
                    values={{ when: bestLabel(best.start), count: units(best.units) }}
                    components={{ b: <b className="font-semibold text-text-primary" /> }}
                  />
                ) : (
                  t('itemSells.nothingSold')
                )
              }
            >
              <PlainBars
                values={bars.map((bar) => bar.units)}
                labels={bars.map((bar) => barLabel(bar.start))}
                highlight={best ? bars.indexOf(best) : undefined}
              />
            </Panel>

            {/* TODO(backend): INCOME.md IP.1. The API has no sales by hour of day, so the card
                is drawn with empty bars and no peak hour. */}
            <Panel title={t('itemSells.byHourOfDay')} note={t('itemSells.notYet')}>
              <PlainBars
                values={TRADING_HOURS.map(() => null)}
                labels={TRADING_HOURS}
                color={SERIES.greenSoft}
                highlightColor={SERIES.green}
              />
            </Panel>

            <Panel
              title={t('itemSells.bySize')}
              spread
              note={
                popular ? (
                  <Trans
                    i18nKey="itemSells.sizeNote"
                    values={{
                      size: popular.name ?? t('itemSells.asItself'),
                      percent: popular.share,
                    }}
                    components={{ b: <b className="font-semibold text-text-primary" /> }}
                  />
                ) : (
                  t('itemSells.nothingSold')
                )
              }
            >
              <HorizontalBars
                rows={data.variants.map((row) => ({
                  label: row.name ?? t('itemSells.asItself'),
                  value: row.units,
                  display: units(row.units),
                }))}
              />
            </Panel>

            <Panel
              title={t('itemSells.addOnsTaken')}
              spread
              note={
                addOns ? (
                  <Trans
                    i18nKey={addOns.oneIn ? 'itemSells.addOnNote' : 'itemSells.addOnNoteNoShare'}
                    values={{
                      n: addOns.oneIn,
                      taken: (addOns.taken.name ?? '').toLowerCase(),
                      amount: omr(addOns.earner.revenue),
                      name: (addOns.earner.name ?? '').toLowerCase(),
                    }}
                    components={{
                      b: <b className="font-semibold text-text-primary" />,
                      amount: <RialFigure />,
                    }}
                  />
                ) : (
                  t('itemSells.noAddOns')
                )
              }
            >
              <HorizontalBars
                rows={data.addOns.map((row) => ({
                  label: row.name ?? '-',
                  value: row.quantity,
                  display: units(row.quantity),
                }))}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('itemSells.whereItGoes')}
              </h2>
              <dl className="mt-3">
                <Row
                  label={t('itemSells.overTheCounter')}
                  value={`${units(data.till.units)} · ${percentOf(data.till.units, channelTotal)}%`}
                />
                <Row
                  label={t('itemSells.onAnInvoice')}
                  value={`${units(data.invoice.units)} · ${percentOf(data.invoice.units, channelTotal)}%`}
                />
                {/* TODO(backend): INCOME.md IP.2. No biggest invoiced buyer on the sales read. */}
                <Row label={t('itemSells.biggestBuyer')} value="-" />
                <Row
                  label={t('itemSells.busiestDay')}
                  value={days ? weekdayName(days.busiest) : '-'}
                />
                <Row
                  label={t('itemSells.quietestDay')}
                  value={days ? weekdayName(days.quietest) : '-'}
                />
                <Row
                  label={
                    data.returnedUnits > 0 ? t('itemSells.givenBack') : t('itemSells.neverRefunded')
                  }
                  value={t('itemSells.returns', { count: units(data.returnedUnits) })}
                  last
                />
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('itemSells.whatsChanged')}
                </h2>
                <Link
                  to={`/catalog/${encodeURIComponent(id)}/changes`}
                  className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('itemSells.seeAllChanges')}
                </Link>
              </div>
              {entries.length === 0 ? (
                <p className="mt-3 text-sm font-medium text-text-quaternary">
                  {history.read.status === 'loading'
                    ? t('itemSells.loadingChanges')
                    : t('itemChanges.none')}
                </p>
              ) : (
                <ul className="mt-3">
                  {entries.slice(0, 4).map((entry, index, list) => {
                    const when = words.when(entry.occurredAt)
                    return (
                      <li
                        key={entry.id}
                        className={[
                          'flex items-start gap-3 py-3',
                          index < list.length - 1 ? 'border-b border-surface-background' : '',
                        ].join(' ')}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-background">
                          <img src={changeIcon(entry)} alt="" className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-text-primary">
                            {words.action(entry)}
                          </span>
                          {entry.changes[0] && entry.action !== 'ProductCreated' ? (
                            <span className="mt-1.5 block">
                              <ChangeChips change={entry.changes[0]} />
                            </span>
                          ) : null}
                          <span className="mt-1 block text-xs font-medium text-text-quaternary">
                            {when.date}
                            {entry.actorName ? (
                              <>
                                {' · '}
                                <bdi>{entry.actorName}</bdi>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </CatalogShell>
  )
}

function Stat({
  label,
  value,
  currency,
  delta,
  note,
}: {
  label: string
  value: string
  /** An amount of money — the rial sign stands before it, in the figure's size and colour. */
  currency?: boolean
  /** Null while the API has no comparison to give (INCOME.md IP.3): the chip shows a dash. */
  delta: string | null
  note: string
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-sm font-medium leading-[1.2] text-text-secondary">{label}</h3>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
          {currency ? (
            <>
              <Rial />
              {'\u00A0'}
            </>
          ) : null}
          {value}
        </span>
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-[22px] items-center gap-1 rounded-[3px] bg-success-100 px-1.5 text-[11px] font-semibold text-[#3d5648]">
          {delta ? <img src={upIcon} alt="" className="size-3" /> : null}
          {delta ?? '-'}
        </span>
        <span className="text-xs font-medium text-text-quaternary">{note}</span>
      </p>
    </article>
  )
}

function Panel({
  title,
  note,
  spread,
  children,
}: {
  title: string
  note: React.ReactNode
  /** Rows spread evenly down the card's height, as the frame's By size and Add-ons cards. */
  spread?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col overflow-hidden rounded-md bg-surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.6px] text-primary-800">
          {title}
        </h2>
        <button
          type="button"
          aria-label={t('itemSells.expand')}
          className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
        >
          <img src={expandIcon} alt="" className="size-4" />
        </button>
      </div>
      <div
        className={[
          'min-h-[240px] flex-1 px-5 py-4',
          // The shared bar list keeps its own gap; spread lets its rows share the card's height.
          spread ? 'flex [&>ul]:justify-evenly' : '',
        ].join(' ')}
      >
        {children}
      </div>
      <p className="border-t border-border-subtle bg-surface-tab-bar px-5 py-3.5 text-sm font-medium leading-[1.5] text-text-tertiary">
        {note}
      </p>
    </section>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * The period of the figures, drawn as the frame's solid blue button with a menu. Local because
 * the shared `Select` has no primary-button look.
 */
function PeriodPicker({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const current = options.find((option) => option.value === value)
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
      >
        {current?.label}
        <img
          src={chevronWhiteIcon}
          alt=""
          aria-hidden="true"
          className={[
            'size-5 brightness-0 invert transition-transform',
            open ? '-rotate-90' : 'rotate-90',
          ].join(' ')}
        />
      </button>
      <Popover
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        width={160}
        align="end"
      >
        <ul role="listbox" className="py-1">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={[
                  'flex w-full px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-25',
                  option.value === value
                    ? 'bg-primary-25 font-semibold text-primary-800'
                    : 'font-medium text-text-secondary',
                ].join(' ')}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}
