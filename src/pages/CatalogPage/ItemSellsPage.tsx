import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Pill } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { PlainBars, HorizontalBars } from '../../components/reports/charts'
import { SERIES } from '../../components/reports/scale'
import { Rial, RialText, Select } from '../../components/ui'
import { omr } from '../../lib/catalog'
import {
  ITEM,
  SIZES,
  ADD_ONS,
  SOLD_90,
  BY_MONTH,
  BEST_MONTH,
  BY_HOUR,
  PEAK_HOUR,
  BY_SIZE,
  MOST_POPULAR_SIZE,
  ADD_ONS_TAKEN,
  addOnRevenue,
  TOP_ADD_ON,
  ONE_IN,
  YEAR,
  AVERAGE_SALE,
  WHERE_IT_GOES,
  whereItGoesShare,
  SELLING_FACTS,
  CHANGES,
} from '../../lib/catalogItem'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import expandIcon from '../../assets/catalog/expand.svg'
import upIcon from '../../assets/catalog/arrow-up.svg'
import changeUpIcon from '../../assets/catalog/arrow-up.svg'
import changeAddIcon from '../../assets/catalog/plus-brand.svg'
import changeEditIcon from '../../assets/catalog/pencil-ink.svg'
import changeTickIcon from '../../assets/catalog/check-green.svg'

const CHANGE_ICON: Record<string, string> = {
  priceUp: changeUpIcon,
  bulk: changeUpIcon,
  added: changeAddIcon,
  tax: changeEditIcon,
  created: changeTickIcon,
}

/**
 * Catalog › one item › How it sells (Figma 135:46588).
 *
 * Six panels over one item's trade. Every sentence under a chart is worked out from the chart's
 * own numbers, so none of them can drift from what is drawn above it.
 */
export function ItemSellsPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [window, setWindow] = useState('yearly')

  const goes = whereItGoesShare()
  const top = TOP_ADD_ON()

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: ITEM.name }]}
      title={ITEM.name}
      subtitle={t('itemSells.meta', {
        group: ITEM.group,
        kind: ITEM.itemKind,
        code: ITEM.code,
        sizes: SIZES.length,
        addOns: ADD_ONS.length,
      })}
      pills={
        <>
          <Pill tone="success">{t('item.onSale')}</Pill>
          <Pill tone="brand">
            {t('item.soldTimes', { count: SOLD_90.toLocaleString('en-US') })}
          </Pill>
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={downloadIcon} alt="" className="size-[18px]" />
            {t('itemSells.export')}
          </button>
          <span className="w-[150px]">
            <Select
              ariaLabel={t('itemSells.yearly')}
              value={window}
              onChange={setWindow}
              options={[
                { value: 'yearly', label: t('itemSells.yearly') },
                { value: 'quarterly', label: t('itemSells.quarterly') },
                { value: 'monthly', label: t('itemSells.monthly') },
              ]}
            />
          </span>
        </>
      }
      tabs={<ItemTabs id={id ?? ITEM.id} active="sells" />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t('itemSells.kpi.sold')}
          value={YEAR.sold.toLocaleString('en-US')}
          delta={`${YEAR.soldChangePercent}%`}
          note={t('itemSells.kpi.soldNote')}
        />
        <Stat
          label={t('itemSells.kpi.broughtIn')}
          value={omr(YEAR.broughtIn)}
          currency
          delta={`${YEAR.broughtInChangePercent}%`}
          note={t('itemSells.kpi.broughtInNote')}
        />
        <Stat
          label={t('itemSells.kpi.share')}
          value={`${YEAR.shareOfDrinks}%`}
          delta={`${YEAR.shareChangePoints}pt`}
          note={t('itemSells.kpi.shareNote')}
        />
        <Stat
          label={t('itemSells.kpi.average')}
          value={omr(AVERAGE_SALE)}
          currency
          delta={omr(YEAR.averageChange)}
          note={t('itemSells.kpi.averageNote')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t('itemSells.soldEachMonth')}
          note={
            <Trans
              i18nKey="itemSells.bestMonth"
              values={{ month: BEST_MONTH.month, count: BEST_MONTH.sold.toLocaleString('en-US') }}
              components={{ b: <b className="font-semibold text-text-primary" /> }}
            />
          }
        >
          <PlainBars
            values={BY_MONTH.map((row) => row.sold)}
            labels={BY_MONTH.map((row) => row.month)}
            highlight={BY_MONTH.findIndex((row) => row.month === BEST_MONTH.month)}
          />
        </Panel>

        <Panel
          title={t('itemSells.byHourOfDay')}
          note={
            <Trans
              i18nKey="itemSells.peakHour"
              values={{ name: `${ITEM.name}s`, hour: `${PEAK_HOUR.hour}am` }}
              components={{ b: <b className="font-semibold text-text-primary" /> }}
            />
          }
        >
          <PlainBars
            values={BY_HOUR.map((row) => row.sold)}
            labels={BY_HOUR.map((row) => row.hour)}
            highlight={BY_HOUR.findIndex((row) => row.hour === PEAK_HOUR.hour)}
            color={SERIES.greenSoft}
            highlightColor={SERIES.green}
          />
        </Panel>

        <Panel
          title={t('itemSells.bySize')}
          note={
            <Trans
              i18nKey="itemSells.sizeNote"
              values={{ size: MOST_POPULAR_SIZE.name, percent: MOST_POPULAR_SIZE.share }}
              components={{ b: <b className="font-semibold text-text-primary" /> }}
            />
          }
        >
          <HorizontalBars
            rows={BY_SIZE.map((row) => ({
              label: SIZES.find((size) => size.id === row.id)?.name ?? row.id,
              value: row.sold,
              display: row.sold.toLocaleString('en-US'),
            }))}
          />
        </Panel>

        <Panel
          title={t('itemSells.addOnsTaken')}
          note={
            <Trans
              i18nKey="itemSells.addOnNote"
              values={{ n: ONE_IN(), amount: omr(top.revenue), name: top.name.toLowerCase() }}
              components={{ b: <RialText as="b" className="font-semibold text-text-primary" /> }}
            />
          }
        >
          <HorizontalBars
            rows={addOnRevenue().map((row) => ({
              label: row.name,
              value: row.taken,
              display: row.taken.toLocaleString('en-US'),
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
              value={`${WHERE_IT_GOES.overTheCounter.toLocaleString('en-US')} · ${goes.counterPercent}%`}
            />
            <Row
              label={t('itemSells.onAnInvoice')}
              value={`${WHERE_IT_GOES.onAnInvoice} · ${goes.invoicePercent}%`}
            />
            <Row label={t('itemSells.biggestBuyer')} value={SELLING_FACTS.biggestInvoicedBuyer} />
            <Row label={t('itemSells.busiestDay')} value={SELLING_FACTS.busiestDay} />
            <Row label={t('itemSells.quietestDay')} value={SELLING_FACTS.quietestDay} />
            <Row
              label={t('itemSells.neverRefunded')}
              value={t('itemSells.returns', { count: SELLING_FACTS.returns })}
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
              to={`/catalog/${id ?? ITEM.id}/changes`}
              className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {t('itemSells.seeAllChanges')}
            </Link>
          </div>
          <ul className="mt-3">
            {CHANGES.slice(0, 4).map((change, index) => (
              <li
                key={change.id}
                className={[
                  'flex items-start gap-3 py-3',
                  index < 3 ? 'border-b border-surface-background' : '',
                ].join(' ')}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-background">
                  <img src={CHANGE_ICON[change.kind]} alt="" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {change.kind === 'priceUp'
                      ? `${t(change.titleKey, change.titleValues)} ${change.chips[0].label.replace('OMR ', '')} → ${change.chips[1].label.replace('OMR ', '')}`
                      : t(change.titleKey, change.titleValues)}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                    {change.date} · {change.who}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <span className="hidden">{ADD_ONS_TAKEN.length}</span>
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
  delta: string
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
          <img src={upIcon} alt="" className="size-3" />
          {delta}
        </span>
        <span className="text-xs font-medium text-text-quaternary">{note}</span>
      </p>
    </article>
  )
}

function Panel({
  title,
  note,
  children,
}: {
  title: string
  note: React.ReactNode
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col overflow-hidden rounded-md bg-surface-card">
      <div className="flex items-center justify-between gap-3 p-5">
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
      <div className="min-h-[240px] flex-1 px-5">{children}</div>
      <p className="border-t border-surface-background px-5 py-3.5 text-sm font-medium leading-[1.5] text-text-tertiary">
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
