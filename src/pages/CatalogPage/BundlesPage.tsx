import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { FilterMenu, Rial, RowsView, SortMenu } from '../../components/ui'
import { omr } from '../../lib/catalog'
import {
  BUNDLES,
  BUNDLE_TABS,
  BUNDLE_SORTS,
  BUNDLE_SUMMARY,
  SHARE_OF_SALES,
  canMake,
  saving,
  countBundleTab,
  matchesBundleTab,
  partOf,
  type Bundle,
  type BundleTab,
} from '../../lib/catalogBundles'
import plusIcon from '../../assets/catalog/plus-white.svg'
import searchIcon from '../../assets/invoices/search.svg'
import kpiBundleIcon from '../../assets/catalog/kind-bundle.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiPercentIcon from '../../assets/catalog/kpi-percent.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'
import kindProductIcon from '../../assets/catalog/kind-product.svg'
import kindBagIcon from '../../assets/catalog/kind-bag.svg'
import kindGrinderIcon from '../../assets/catalog/kind-grinder.svg'
import kindServiceIcon from '../../assets/catalog/kind-service.svg'

/** A glyph per part, so the row of parts reads as a picture of what is inside. */
const partIcon = (id: string) => {
  if (id.includes('grinder')) return kindGrinderIcon
  if (id.includes('bag') || id.includes('blend') || id.includes('yirg') || id.includes('sidamo'))
    return kindBagIcon
  if (id.includes('training')) return kindServiceIcon
  return kindProductIcon
}

/**
 * Catalog › Bundles (Figma 135:48699).
 *
 * "How many you can make" is the column that matters, and it is worked out from the shelf every
 * time the page renders — a bundle whose part ran out says so rather than waiting to be noticed.
 */
export function BundlesPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<BundleTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('bestSelling')

  const summary = BUNDLE_SUMMARY()

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = BUNDLES.filter(
      (bundle) =>
        matchesBundleTab(bundle, tab) &&
        (needle === '' ||
          bundle.name.toLowerCase().includes(needle) ||
          bundle.parts.some((part) => partOf(part.itemId).name.toLowerCase().includes(needle))),
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'saving') return saving(b).amount - saving(a).amount
      return b.sold90 - a.sold90
    })
  }, [tab, query, sort])

  const broken = summary.cantBeMade > 0

  return (
    <CatalogShell
      branch
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { labelKey: 'bundles.title' }]}
      title={t('bundles.title')}
      subtitle={t('bundles.subtitle')}
      actions={
        <Link
          to="/catalog/bundles/new"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-4" />
          {t('bundles.newBundle')}
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiBundleIcon}
          label={t('bundles.kpi.bundles')}
          value={String(summary.count)}
          note={t('bundles.kpi.bundlesNote', { onSale: summary.onSale, off: summary.off })}
        />
        <Kpi
          icon={kpiEarningIcon}
          label={t('bundles.kpi.broughtIn')}
          value={omr(summary.broughtIn)}
          currency
          note={t('bundles.kpi.broughtInNote', { share: SHARE_OF_SALES })}
        />
        <Kpi
          icon={kpiPercentIcon}
          label={t('bundles.kpi.givenAway')}
          value={omr(summary.givenAway)}
          currency
          note={t('bundles.kpi.givenAwayNote')}
        />
        <Kpi
          icon={kpiAttentionIcon}
          highlight={broken}
          tone={broken ? 'pending' : undefined}
          label={t('bundles.kpi.cantBeMade')}
          value={String(summary.cantBeMade)}
          note={broken ? t('bundles.kpi.cantBeMadeNote') : t('bundles.kpi.allFine')}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={BUNDLE_TABS} value={tab} onChange={setTab} count={countBundleTab} />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-[280px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('bundles.search')}
              aria-label={t('bundles.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={BUNDLE_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countBundleTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu
              value={sort}
              onChange={setSort}
              options={BUNDLE_SORTS.map((entry) => ({
                value: entry.id,
                labelKey: entry.labelKey,
              }))}
            />
          </div>
        </div>

        <RowsView>
          <table className="w-full min-w-[1020px] border-collapse">
            <thead>
              <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                <th className="h-[46px] px-4 text-start font-semibold">
                  {t('bundles.col.bundle')}
                </th>
                <th className="h-[46px] px-4 text-start font-semibold">
                  {t('bundles.col.inside')}
                </th>
                <th className="h-[46px] px-4 text-end font-semibold">{t('bundles.col.price')}</th>
                <th className="h-[46px] px-4 text-start font-semibold">
                  {t('bundles.col.canMake')}
                </th>
                <th className="h-[46px] px-4 text-end font-semibold">{t('bundles.col.sold')}</th>
                <th className="h-[46px] px-4" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t('bundles.empty')}
                  </td>
                </tr>
              ) : (
                rows.map((bundle) => <BundleRow key={bundle.id} bundle={bundle} />)
              )}
            </tbody>
          </table>
        </RowsView>

        <p className="px-5 py-4 text-sm font-medium text-text-quaternary">
          {t('bundles.showing', { shown: rows.length, total: BUNDLES.length })}
        </p>
      </section>
    </CatalogShell>
  )
}

function BundleRow({ bundle }: { bundle: Bundle }) {
  const { t } = useTranslation()
  const make = canMake(bundle)
  const save = saving(bundle)
  const off = !bundle.onSale
  const stuck = bundle.onSale && make.count === 0

  return (
    <tr
      className={[
        'border-b border-surface-background last:border-0',
        stuck ? 'border-s-4 border-s-danger-700 bg-[#fdf4f2]' : '',
        off ? 'opacity-60' : '',
      ].join(' ')}
    >
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
            <img src={kpiBundleIcon} alt="" className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <Link
              to={`/catalog/bundles/${bundle.id}`}
              className="text-sm font-semibold text-text-primary transition-colors hover:text-primary-700"
            >
              {bundle.name}
            </Link>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {bundle.offSince
                ? `${t('catalog.offSince', { date: bundle.offSince })} · ${t('bundles.duringRamadan')}`
                : `${bundle.group} › ${bundle.kind} · ${bundle.code}`}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <span className="flex items-center gap-1">
          {bundle.parts.slice(0, 3).map((part) => (
            <span
              key={part.itemId}
              className="flex size-7 items-center justify-center rounded-[4px] bg-primary-50"
            >
              <img src={partIcon(part.itemId)} alt="" className="size-3.5" />
            </span>
          ))}
          {bundle.parts.length > 3 ? (
            <span className="flex h-7 items-center rounded-[4px] bg-surface-background px-1.5 text-[10px] font-semibold text-text-tertiary">
              +{bundle.parts.length - 3}
            </span>
          ) : null}
        </span>
        <p className="mt-1.5 text-xs font-medium text-text-quaternary">
          {t('bundles.parts', { count: bundle.parts.length })}
          {bundle.noteKey ? ` · ${t(bundle.noteKey, bundle.noteValues)}` : ''}
          {bundle.windowKey ? ` · ${t(bundle.windowKey, bundle.windowValues)}` : ''}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="flex items-baseline justify-end gap-1">
          <span className="text-sm font-semibold text-text-primary">
            <Rial />
          </span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            {omr(bundle.price)}
          </span>
        </p>
        <p
          className={[
            'mt-1 text-xs font-medium',
            bundle.noSaving ? 'text-text-quaternary' : 'text-primary-700',
          ].join(' ')}
        >
          {bundle.noSaving
            ? t('bundles.noSaving')
            : t('bundles.saves', { amount: omr(save.amount) })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        {off ? (
          <>
            <p className="text-lg font-semibold text-text-quaternary">—</p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t('bundles.notOnSale')}
            </p>
          </>
        ) : make.count === null ? (
          <>
            <p className="text-lg font-semibold text-text-primary">{t('bundles.unlimited')}</p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t('bundles.nothingCounted')}
            </p>
          </>
        ) : (
          <>
            <p
              className={[
                'text-lg font-semibold tabular-nums',
                make.count === 0 ? 'text-danger-700' : 'text-text-primary',
              ].join(' ')}
            >
              {make.count}
            </p>
            <p
              className={[
                'mt-1 max-w-[180px] text-xs font-medium leading-[1.4]',
                make.count === 0 ? 'text-danger-700' : 'text-pending-700',
              ].join(' ')}
            >
              {make.count === 0
                ? t('bundles.ranOutOn', { name: make.limitedBy, day: 'Monday' })
                : t('bundles.heldBackBy', { name: make.limitedBy })}
            </p>
          </>
        )}
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">{bundle.sold90}</p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {bundle.seasonal
            ? t('bundles.duringRamadan')
            : bundle.sold90 === 0
              ? t('bundles.neverSold', { date: '4 Jun' })
              : t('bundles.last90')}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <Link
          to={`/catalog/bundles/${bundle.id}`}
          className={[
            'inline-flex h-[38px] items-center rounded-sm px-4 text-sm font-semibold transition-colors',
            stuck
              ? 'bg-pending-100 text-pending-700 hover:bg-pending-200/60'
              : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
          ].join(' ')}
        >
          {stuck ? t('bundles.fixTheParts') : off ? t('bundles.bringItBack') : t('bundles.open')}
        </Link>
      </td>
    </tr>
  )
}
