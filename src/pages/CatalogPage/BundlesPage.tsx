import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { FilterMenu, Pager, Rial, RowsView, SortMenu } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { omr } from '../../lib/catalog'
import { partsRunOut } from '../../lib/catalogInsights'
import {
  BUNDLE_REPORT_PERMISSIONS,
  bundleListPath,
  bundleReportPath,
  getBundleReport,
  listBundles,
  type BundleDto,
  type BundleReportDto,
  type BundleReportRow,
} from '../../api/catalog/bundles'
import { useCanManageProducts } from './ItemFormPage'
import { useKindNames } from './itemRecord'
import plusIcon from '../../assets/catalog/plus-white.svg'
import searchIcon from '../../assets/invoices/search.svg'
import kpiBundleIcon from '../../assets/catalog/kind-bundle.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiPercentIcon from '../../assets/catalog/kpi-percent.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'
import { partIcon } from '../../lib/bundleForm'

const BUNDLE_TABS = [
  { id: 'all', labelKey: 'bundles.tab.all' },
  { id: 'onSale', labelKey: 'bundles.tab.onSale' },
  { id: 'cantBeMade', labelKey: 'bundles.tab.cantBeMade' },
  { id: 'notSelling', labelKey: 'bundles.tab.notSelling' },
  { id: 'switchedOff', labelKey: 'bundles.tab.switchedOff' },
] as const

type BundleTab = (typeof BUNDLE_TABS)[number]['id']

const BUNDLE_SORTS = [
  { value: 'name', labelKey: 'bundles.sort.name' },
  { value: 'bestSelling', labelKey: 'bundles.sort.bestSelling' },
  { value: 'saving', labelKey: 'bundles.sort.saving' },
]

/** On sale: active and, with a working branch, available there. */
const bundleOnSale = (bundle: BundleDto) =>
  bundle.active && bundle.availability?.available !== false

function matchesBundleTab(bundle: BundleDto, tab: BundleTab, sold: (id: string) => number | null) {
  if (tab === 'all') return true
  if (tab === 'onSale') return bundleOnSale(bundle)
  if (tab === 'cantBeMade') return bundleOnSale(bundle) && bundle.availability?.canBeMade === 0
  if (tab === 'notSelling') return bundleOnSale(bundle) && sold(bundle.id) === 0
  return !bundleOnSale(bundle)
}

/**
 * Catalog › Bundles (Figma 135:48699), from `GET /v1/bundles` (every bundle, archived ones in
 * Switched off, with the working branch's prices and how many can be made) and
 * `GET /v1/bundles/report` (sold, brought in and given away in the last 90 days), which needs
 * a sales-reports permission: without it those figures are not asked for and read as a dash.
 * Prices are before VAT. The list is not paged, so search, tabs and order cover every bundle.
 */
export function BundlesPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<BundleTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('bestSelling')
  const canManage = useCanManageProducts() === true
  const { entitlements } = useEntitlements()
  const canReport =
    entitlements !== null &&
    BUNDLE_REPORT_PERMISSIONS.some((code) => hasPermission(entitlements, code))

  const branchRead = useWorkingBranch()
  const branchId = branchRead.branch?.id ?? null
  const waiting = branchRead.read.status === 'loading'
  const listPath = bundleListPath({ branchId, status: 'ALL' })
  const list = useApiRead<BundleDto[]>(waiting ? null : listPath, () => listBundles(listPath))
  const reportPath = bundleReportPath({ branchId })
  const report = useApiRead<BundleReportDto>(waiting || !canReport ? null : reportPath, () =>
    getBundleReport(reportPath),
  )
  const reported = report.read.status === 'ready' ? report.read.data : null
  const rowOf = (id: string): BundleReportRow | null =>
    reported?.bundles.find((row) => row.bundleId === id) ?? null
  const sold = (id: string) => (reported ? (rowOf(id)?.unitsSold ?? 0) : null)

  const bundles = useMemo(() => (list.read.status === 'ready' ? list.read.data : []), [list.read])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = bundles.filter(
      (bundle) =>
        matchesBundleTab(bundle, tab, sold) &&
        (needle === '' ||
          bundle.name.toLowerCase().includes(needle) ||
          bundle.code.toLowerCase().includes(needle) ||
          bundle.parts.some((part) => part.name.toLowerCase().includes(needle))),
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'saving') return b.saving - a.saving
      return (sold(b.id) ?? 0) - (sold(a.id) ?? 0)
    })
    // `sold` reads the report, which `reported` stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundles, tab, query, sort, reported])

  const countTab = (entry: BundleTab) =>
    bundles.filter((bundle) => matchesBundleTab(bundle, entry, sold)).length
  const onSale = bundles.filter(bundleOnSale).length
  const cantBeMade = countTab('cantBeMade')
  const broken = cantBeMade > 0

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { labelKey: 'bundles.title' }]}
      title={t('bundles.title')}
      subtitle={t('bundles.subtitle')}
      actions={
        canManage ? (
          <Link
            to="/catalog/bundles/new"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('bundles.newBundle')}
          </Link>
        ) : undefined
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiBundleIcon}
          label={t('bundles.kpi.bundles')}
          value={String(bundles.length)}
          note={t('bundles.kpi.bundlesNote', { onSale, off: bundles.length - onSale })}
        />
        {/* TODO(backend): INCOME.md BU.1. No total sales to give the bundles' share of them. */}
        <Kpi
          icon={kpiEarningIcon}
          label={t('bundles.kpi.broughtIn')}
          value={reported ? omr(reported.revenue) : '-'}
          currency={reported !== null}
          note={t('bundles.kpi.broughtInNoteNoShare')}
        />
        <Kpi
          icon={kpiPercentIcon}
          label={t('bundles.kpi.givenAway')}
          value={reported ? omr(Math.max(0, reported.discountGiven)) : '-'}
          currency={reported !== null}
          note={t('bundles.kpi.givenAwayNote')}
        />
        <Kpi
          icon={kpiAttentionIcon}
          highlight={broken}
          tone={broken ? 'pending' : undefined}
          label={t('bundles.kpi.cantBeMade')}
          value={String(cantBeMade)}
          note={broken ? t('bundles.kpi.cantBeMadeNote') : t('bundles.kpi.allFine')}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={BUNDLE_TABS} value={tab} onChange={setTab} count={countTab} />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] w-[345px] max-w-full items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 max-md:w-full">
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
              funnel
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={BUNDLE_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu value={sort} onChange={setSort} options={BUNDLE_SORTS} />
          </div>
        </div>

        {list.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : list.read.status !== 'ready' ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : (
          <RowsView>
            <table className="w-full min-w-[1020px] border-collapse">
              <thead>
                <tr className="whitespace-nowrap bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  <th className="h-[46px] w-[290px] min-w-[290px] ps-5 pe-3 text-start font-semibold">
                    {t('bundles.col.bundle')}
                  </th>
                  <th className="h-[46px] w-[180px] px-3 text-start font-semibold">
                    {t('bundles.col.inside')}
                  </th>
                  <th className="h-[46px] px-3 text-end font-semibold">{t('bundles.col.price')}</th>
                  <th className="h-[46px] px-3 text-start font-semibold">
                    {t('bundles.col.canMake')}
                  </th>
                  <th className="h-[46px] px-3 text-end font-semibold">{t('bundles.col.sold')}</th>
                  <th className="h-[46px] ps-3 pe-5" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {bundles.length === 0 ? t('bundles.none') : t('bundles.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((bundle) => (
                    <BundleRow key={bundle.id} bundle={bundle} sold={sold(bundle.id)} />
                  ))
                )}
              </tbody>
            </table>
          </RowsView>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm font-medium text-text-quaternary">
            {t('bundles.showing', { shown: rows.length, total: bundles.length })}
          </p>
          {/* The list is not paged (the API answers every bundle at once), so the pager has a
              single page. */}
          <Pager
            page={1}
            pageCount={1}
            onChange={() => {}}
            disabled
            labels={{
              nav: t('appList.pager.label'),
              previous: t('appList.pager.previous'),
              next: t('appList.pager.next'),
            }}
          />
        </div>
      </section>
    </CatalogShell>
  )
}

function BundleRow({ bundle, sold }: { bundle: BundleDto; sold: number | null }) {
  const { t } = useTranslation()
  const { kindOf } = useKindNames()
  const names = kindOf(bundle.kindId)
  const off = !bundleOnSale(bundle)
  const availability = bundle.availability
  const make = availability?.canBeMade
  const stuck = !off && make === 0
  const unavailable = availability?.unavailableBecause[0]
  const where = names ? `${names.group} › ${names.kind} · ${bundle.code}` : bundle.code
  const free = bundle.parts.filter((part) => part.free).length
  const runOut = partsRunOut(bundle.parts)
  const note = runOut
    ? t('bundles.hasRunOut', { count: runOut })
    : free
      ? t('bundles.thrownInFree', { count: free })
      : ''

  return (
    <tr
      className={[
        'border-b border-surface-background last:border-0',
        stuck ? 'border-s-4 border-s-danger-700 bg-[#fdf4f2]' : '',
        off ? 'opacity-60' : '',
      ].join(' ')}
    >
      <td className="ps-5 pe-3 py-4 align-middle">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50">
            <img src={kpiBundleIcon} alt="" className="size-[18px]" />
          </span>
          <div className="min-w-0 max-w-[236px]">
            <Link
              to={`/catalog/bundles/${encodeURIComponent(bundle.id)}`}
              title={bundle.name}
              className="block truncate text-sm font-semibold text-text-primary transition-colors hover:text-primary-700"
            >
              <bdi>{bundle.name}</bdi>
            </Link>
            <p className="mt-1 truncate text-xs font-medium text-text-quaternary" title={where}>
              {where}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-4 align-middle">
        <span className="flex items-center gap-1">
          {bundle.parts.slice(0, 3).map((part) => (
            <span
              key={`${part.position}-${part.productId}`}
              title={part.name}
              className="flex size-7 items-center justify-center rounded-[4px] border border-primary-100 bg-primary-50"
            >
              <img src={partIcon(part.goodsOrService)} alt="" className="size-3.5" />
            </span>
          ))}
          {bundle.parts.length > 3 ? (
            <span className="flex h-7 items-center rounded-[4px] border border-primary-100 bg-primary-50 px-1.5 text-[10px] font-semibold text-primary-800">
              +{bundle.parts.length - 3}
            </span>
          ) : null}
        </span>
        <p className="mt-1.5 text-xs font-medium text-text-quaternary">
          {t('bundles.parts', { count: bundle.parts.length })}
          {note ? ` · ${note}` : ''}
        </p>
      </td>

      <td className="px-3 py-4 align-middle text-end">
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
            'ms-auto mt-1 max-w-[160px] text-xs font-medium leading-[1.4]',
            bundle.saving === 0
              ? 'text-text-quaternary'
              : bundle.saving < 0
                ? 'text-danger-700'
                : 'text-[#3d5648]',
          ].join(' ')}
        >
          {bundle.saving === 0
            ? t('bundles.savesNothing')
            : bundle.saving < 0
              ? t('bundles.costsMore', { amount: omr(Math.abs(bundle.saving)) })
              : t('bundles.saves', { amount: omr(bundle.saving) })}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-text-quaternary">
          {t('bundle.beforeVat')}
        </p>
      </td>

      <td className="px-3 py-4 align-middle">
        {off ? (
          <>
            <p className="text-lg font-semibold text-text-quaternary">-</p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t('bundles.notOnSale')}
            </p>
          </>
        ) : !availability ? (
          <p className="text-lg font-semibold text-text-quaternary">-</p>
        ) : make === null || make === undefined ? (
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
                make === 0 ? 'text-danger-700' : 'text-text-primary',
              ].join(' ')}
            >
              {make}
            </p>
            <p
              className={[
                'mt-1 max-w-[180px] text-xs font-medium leading-[1.4]',
                make === 0 ? 'text-danger-700' : 'text-pending-700',
              ].join(' ')}
            >
              {/* TODO(backend): INCOME.md BU.2. The day a part ran out is not given, so the
                  line names the part without it. */}
              {unavailable
                ? t(`bundles.unavailable.${unavailable.reason}`, { name: unavailable.name })
                : make === 0 && availability.limitedByName
                  ? t('bundles.ranOutNoDay', { name: availability.limitedByName })
                  : availability.limitedByName
                    ? t('bundles.heldBackBy', { name: availability.limitedByName })
                    : null}
            </p>
          </>
        )}
      </td>

      <td className="px-3 py-4 align-middle text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">
          {sold === null ? '-' : sold.toLocaleString('en-US')}
        </p>
        {/* TODO(backend): INCOME.md BU.1. No seasonal flag ("during Ramadan"). */}
        <p className="ms-auto mt-1 max-w-[130px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {t('bundles.last90')}
        </p>
      </td>

      <td className="ps-3 pe-5 py-4 align-middle text-end">
        <Link
          to={`/catalog/bundles/${encodeURIComponent(bundle.id)}`}
          className={[
            'inline-flex h-[38px] items-center whitespace-nowrap rounded-sm border px-4 text-sm font-semibold transition-colors',
            stuck
              ? 'border-pending-500/50 bg-pending-100 text-pending-700 hover:bg-pending-200/60'
              : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
          ].join(' ')}
        >
          {stuck ? t('bundles.fixTheParts') : off ? t('bundles.bringItBack') : t('bundles.open')}
        </Link>
      </td>
    </tr>
  )
}
