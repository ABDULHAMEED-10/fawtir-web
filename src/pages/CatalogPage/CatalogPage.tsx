import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { useApiRead } from '../../hooks'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { FilterMenu, Pager, Rial, SortMenu } from '../../components/ui'
import {
  productListPath,
  reactivateProduct,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { productRefusal } from '../../lib/productForm'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import {
  getZeroRatingAttention,
  zeroRatingAttentionPath,
  type ZeroRatingAttentionPage,
} from '../../api/catalog/zeroRating'
import { formatDisplayDate } from '../../lib/dates'
import { describeApiFailure } from '../../lib/apiFailure'
import { pageCountOf, type Page } from '../../api'
import { Link } from 'react-router-dom'
import { CatalogEmptyState } from './CatalogEmptyState'
import { useCanManageProducts } from './ItemFormPage'
import { demoModulesEnabled } from '../../lib/demoModules'
import { OMAN_VAT_CATEGORIES } from '../../lib/invoiceDraft'
import {
  BRANCH_ONLY_TABS,
  CATALOG_SORTS,
  CATALOG_TABS,
  SERVER_TABS,
  SERVER_SORT,
  catalogRows,
  catalogSortOf,
  catalogTabOf,
  kindOf,
  matchesCatalogTab,
  needsAttention,
  onSaleHere,
  type CatalogSort,
  type CatalogTab,
} from './catalogList'
import plusIcon from '../../assets/catalog/plus-white.svg'
import uploadIcon from '../../assets/catalog/upload-ink.svg'
import sparkleIcon from '../../assets/catalog/sparkle-brand.svg'
import {
  catalogTemplatePath,
  readCatalogTemplate,
  type CatalogTemplateDto,
} from '../../api/catalog/templates'
import searchIcon from '../../assets/invoices/search.svg'
import productIcon from '../../assets/catalog/kind-product.svg'
import serviceIcon from '../../assets/catalog/kind-service.svg'
import kpiItemsIcon from '../../assets/catalog/kpi-items.svg'
import kpiGroupsIcon from '../../assets/catalog/kpi-groups.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'

/** The zero-rating flags read for Wanting attention; the re-check flags few items. */
const ATTENTION_PAGE_SIZE = 200
/** Rows to a page, as the frame's pager pages them; the server pages, this screen asks. */
const CATALOG_PAGE_SIZE = 20
/** How long typing pauses before the search goes to the server. */
const SEARCH_DELAY_MS = 250

/**
 * Catalog: the company's own products from `GET /v1/products`, the same records an invoice line
 * is raised from.
 *
 * Styled as the Catalog frame (Figma "Catalog -> Main Screen"): figure cards, the tab strip, a
 * search with Filters and Sort, the dark table head, item rows with their kind, price and VAT in
 * words, and the page numbers the server's paging answers. Every figure is worked out
 * from the products the server returned; the frame's stock and sales columns have no field on
 * the product yet (docs/backend-guides/INCOME.md, rows P.9 and P.10), so they are not drawn
 * rather than invented. The search matches code, name, Arabic name, barcode and variant codes on
 * the server; the sort is the server's (`sort`, `direction`); the Archived tab reads
 * `status=ARCHIVED` and offers Put back on sale (P.14, P.15).
 */
/** The tabs whose number is the server's; the others count the page of products in view. */
const FROM_SERVER: ReadonlySet<CatalogTab> = new Set([
  'all',
  'onSale',
  'neverSold',
  'switchedOff',
  'archived',
])

export function CatalogPage() {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  // The search and its page move together: a new search starts again from its first page.
  const [{ search, page }, setPaging] = useState({ search: '', page: 0 })
  const setPage = (next: number) => setPaging((current) => ({ ...current, page: next }))
  // A link can open a tab and an order (`?tab=attention&sort=priceLow`, from Build from a template).
  const [params] = useSearchParams()
  const [tab, setTabState] = useState<CatalogTab>(() => catalogTabOf(params.get('tab')))
  const archivedTab = tab === 'archived'
  // Moving in or out of Archived, or a tab the server filters, reads another list, so it starts
  // from its first page.
  const setTab = (next: CatalogTab) => {
    if ((next === 'archived') !== archivedTab || SERVER_TABS[next] || SERVER_TABS[tab]) setPage(0)
    setTabState(next)
  }
  const [sort, setSort] = useState<CatalogSort>(() => catalogSortOf(params.get('sort')))
  const [actionProblem, setActionProblem] = useState<string | null>(null)
  // New item writes to /v1/products, so it follows product.manage rather than the prototype switch.
  const canManage = useCanManageProducts() === true
  // The company's template stays reachable once the catalogue has items, to add what it still
  // lacks or start again from it. A 404 (no template for the business type) offers nothing.
  const { read: templateRead } = useApiRead<CatalogTemplateDto>(
    canManage ? catalogTemplatePath() : null,
    () => readCatalogTemplate(),
  )
  const hasTemplate = templateRead.status === 'ready'
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = query.trim()
      setPaging((current) => (current.search === next ? current : { search: next, page: 0 }))
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [query])

  const order = SERVER_SORT[sort]
  // The sidebar's working branch (P.9): the items on sale there, at its price. Read once the
  // branches have answered, so the list is not asked twice; without branches, the whole company.
  const branchRead = useWorkingBranch()
  const branchId = branchRead.branch?.id ?? null
  // On sale, Never sold and Switched off are the server's filters (guide §6), with a branch only.
  const serverFilter = branchId && !archivedTab ? SERVER_TABS[tab] : undefined
  const path = productListPath({
    q: search,
    branchId,
    // The management list also shows what is switched off or not sold in the branch, greyed,
    // so a manager can open it and switch it back on. The till and the item pickers do not ask.
    includeUnavailable: true,
    size: CATALOG_PAGE_SIZE,
    page: archivedTab || serverFilter ? 0 : page,
    ...order,
  })
  const active = useApiRead<Page<ProductDto>>(
    branchRead.read.status === 'loading' ? null : path,
    () => searchProducts(path),
  )
  const filteredPath = serverFilter
    ? productListPath({
        q: search,
        branchId,
        includeUnavailable: true,
        ...serverFilter,
        size: CATALOG_PAGE_SIZE,
        page,
        ...order,
      })
    : null
  const filtered = useApiRead<Page<ProductDto>>(filteredPath, () => searchProducts(filteredPath!))
  // The On sale and Never sold counts: one row each, `totalElements` counts them all.
  const onSaleCountPath = branchId
    ? productListPath({ q: search, branchId, availability: 'ON_SALE', size: 1 })
    : null
  const onSaleCount = useApiRead<Page<ProductDto>>(onSaleCountPath, () =>
    searchProducts(onSaleCountPath!),
  )
  const switchedOffCountPath = branchId
    ? productListPath({ q: search, branchId, availability: 'SWITCHED_OFF', size: 1 })
    : null
  const switchedOffCount = useApiRead<Page<ProductDto>>(switchedOffCountPath, () =>
    searchProducts(switchedOffCountPath!),
  )
  const neverSoldCountPath = branchId
    ? productListPath({
        q: search,
        branchId,
        ...SERVER_TABS.neverSold,
        size: 1,
      })
    : null
  const neverSoldCount = useApiRead<Page<ProductDto>>(neverSoldCountPath, () =>
    searchProducts(neverSoldCountPath!),
  )
  const serverCount = (read: typeof onSaleCount) =>
    read.read.status === 'ready' ? (read.read.data.total ?? read.read.data.items.length) : 0
  const archivedPath = productListPath({
    q: search,
    status: 'ARCHIVED',
    size: CATALOG_PAGE_SIZE,
    page,
    ...order,
  })
  const archived = useApiRead<Page<ProductDto>>(archivedTab ? archivedPath : null, () =>
    searchProducts(archivedPath),
  )
  // The Archived tab's count: one row is enough, `totalElements` counts them all.
  const archivedCountPath = productListPath({ q: search, status: 'ARCHIVED', size: 1 })
  const archivedCount = useApiRead<Page<ProductDto>>(archivedCountPath, () =>
    searchProducts(archivedCountPath),
  )
  const archivedTotal =
    archivedCount.read.status === 'ready'
      ? (archivedCount.read.data.total ?? archivedCount.read.data.items.length)
      : 0
  const products = archivedTab ? archived : serverFilter ? filtered : active
  const loaded = products.read.status === 'ready' ? products.read.data : null
  const activeItems = useMemo(
    () => (active.read.status === 'ready' ? active.read.data.items : []),
    [active.read],
  )
  const items = useMemo(() => loaded?.items ?? [], [loaded])
  const total = loaded ? (loaded.total ?? items.length) : null
  const pageCount = loaded ? pageCountOf(loaded) : 1
  const paged = pageCount > 1
  // Tabs and sorting work over the page the server sent: the product list has no server-side
  // filter for kind or VAT category, and no sort parameter this screen relies on.
  // The zero-rating re-check's flags (Z.15), merged into Wanting attention. A failed read leaves
  // the tab as it was: the flags are an addition, not what the tab depends on.
  const attentionPath = zeroRatingAttentionPath(ATTENTION_PAGE_SIZE)
  const flaggedRead = useApiRead<ZeroRatingAttentionPage>(attentionPath, () =>
    getZeroRatingAttention(attentionPath),
  )
  const flaggedRows = useMemo(
    () => (flaggedRead.read.status === 'ready' ? (flaggedRead.read.data.items ?? []) : []),
    [flaggedRead.read],
  )
  const flagged = useMemo(() => new Set(flaggedRows.map((row) => row.productId)), [flaggedRows])
  const flagOf = (id: string) => flaggedRows.find((row) => row.productId === id) ?? null
  /** The date a flag was judged on: the re-check list's, else when the product was flagged. */
  const flagDate = (product: ProductDto): string =>
    flagOf(product.id)?.judgedOn ?? product.zeroRatingAttention?.flaggedAt.slice(0, 10) ?? ''
  /** Flagged items that are not on the page in view, listed under the Wanting attention tab. */
  const flaggedElsewhere = flaggedRows.filter(
    (row) => !activeItems.some((product) => product.id === row.productId),
  )
  const rows = useMemo(
    () => catalogRows(items, tab, sort, i18n.language, flagged),
    [items, tab, sort, i18n.language, flagged],
  )
  // The cards count only what is on sale in the working branch, from the unfiltered list, so they
  // stay the same whichever tab is open.
  const activeLoaded = active.read.status === 'ready' ? active.read.data : null
  const activeTotal = activeLoaded ? (activeLoaded.total ?? activeItems.length) : null
  const kpiPaged = activeLoaded ? pageCountOf(activeLoaded) > 1 : false
  const onSale = activeItems.filter(onSaleHere)
  const switchedOff = activeItems.length - onSale.length
  // What is on sale here, over every page: the server's count with a working branch. Without one,
  // or until it answers, the list's total less the greyed rows on the page in view.
  const onSaleTotal =
    onSaleCount.read.status === 'ready'
      ? serverCount(onSaleCount)
      : Math.max(0, (activeTotal ?? 0) - switchedOff)
  // Everything, On sale, Never sold, Switched off and Archived are counted by the server, each
  // read once however often the tab changes. Goods, Services and the like have no server filter,
  // so they count the page of products, only what is on sale there.
  const tabCount = (id: CatalogTab) =>
    id === 'archived'
      ? archivedTotal
      : id === 'all'
        ? onSaleTotal
        : id === 'onSale'
          ? serverCount(onSaleCount)
          : id === 'neverSold'
            ? serverCount(neverSoldCount)
            : id === 'switchedOff' && switchedOffCount.read.status === 'ready'
              ? serverCount(switchedOffCount)
              : activeItems.filter((product) => matchesCatalogTab(product, id, flagged)).length +
                (id === 'attention' ? flaggedElsewhere.length : 0)
  // What the page alone counts is only a floor once there are more pages: "19+", not "19".
  const tabBadge = (id: CatalogTab) =>
    kpiPaged && !FROM_SERVER.has(id) ? `${tabCount(id)}+` : tabCount(id)
  const services = onSale.filter((product) => kindOf(product) === 'service').length
  const attention =
    onSale.filter((product) => needsAttention(product, flagged)).length +
    (archivedTab ? 0 : flaggedElsewhere.length)
  const notStandard = onSale.filter((product) => product.defaultTaxCategory !== 'S').length
  // Switched off appears only while something is, or while it is the open tab.
  // On sale and Never sold need a working branch: the server filters them only with one.
  const tabs = CATALOG_TABS.filter(
    (entry) =>
      (entry.id !== 'switchedOff' || tab === 'switchedOff' || tabCount(entry.id) > 0) &&
      (!BRANCH_ONLY_TABS.has(entry.id) || branchId !== null),
  )

  /** Puts an archived item back on sale (P.14), then reads both lists again. */
  const reactivate = async (product: ProductDto) => {
    setActionProblem(null)
    try {
      await reactivateProduct(product.id, product.version)
      archived.retry()
      archivedCount.retry()
      active.retry()
      if (filteredPath) filtered.retry()
      if (onSaleCountPath) onSaleCount.retry()
      if (switchedOffCountPath) switchedOffCount.retry()
      if (neverSoldCountPath) neverSoldCount.retry()
    } catch (error) {
      const refusal = productRefusal(error)
      if (refusal) {
        setActionProblem(t(refusal.key))
        return
      }
      const message = describeApiFailure(error)
      setActionProblem(t(message.key, message.values))
    }
  }

  const price = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const unitWord = (code: string) =>
    t(`createInvoice.units.${code}`, {
      defaultValue: t(`reference.unitShort.${code}`, { defaultValue: code }),
    })

  const unavailable = demoModulesEnabled() ? null : (
    <Notice badge={t('moduleUnavailable.badge')} body={t('catalogReal.toolsUnavailable')} />
  )

  // A company with no products yet, and nothing being searched, gets the Figma "Empty State":
  // the ways to start a catalogue instead of an empty table.
  if (
    loaded &&
    !archivedTab &&
    page === 0 &&
    !search &&
    !query.trim() &&
    items.length === 0 &&
    archivedTotal === 0
  ) {
    return <CatalogEmptyState notice={unavailable} />
  }

  return (
    <CatalogShell
      crumbs={[]}
      title={t('catalogReal.title')}
      subtitle={t('catalogReal.subtitle')}
      actions={
        // The list and the item form are on the server; menu upload has none yet, so it opens its
        // prototype (under the sample-data ribbon) while prototypes are on.
        demoModulesEnabled() || canManage ? (
          <>
            {demoModulesEnabled() ? (
              <Link
                to="/catalog/upload"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={uploadIcon} alt="" className="size-[18px]" />
                {t('catalog.uploadAMenu')}
              </Link>
            ) : null}
            {canManage && hasTemplate ? (
              <Link
                to="/catalog/build"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={sparkleIcon} alt="" className="size-[18px]" />
                {t('catalog.buildFromTemplate')}
              </Link>
            ) : null}
            {canManage ? (
              <Link
                to="/catalog/new"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={plusIcon} alt="" className="size-4" />
                {t('catalog.newItem')}
              </Link>
            ) : null}
          </>
        ) : undefined
      }
    >
      {unavailable}

      {actionProblem ? (
        <p
          role="alert"
          className="rounded-md bg-danger-100 px-5 py-3 text-sm font-medium text-danger-700"
        >
          {actionProblem}
        </p>
      ) : null}

      {activeLoaded && !search && !archivedTab ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={kpiItemsIcon}
            label={t('catalogReal.kpi.things')}
            value={String(onSaleTotal)}
            // TODO(backend): the list counts only what is on the page it returns, so across
            // several pages the split of goods and services is this page's (INCOME.md P.1).
            note={
              kpiPaged
                ? t('catalogReal.kpi.thingsPagedNote', {
                    goods: onSale.length - services,
                    services,
                  })
                : t('catalogReal.kpi.thingsNote', {
                    goods: onSale.length - services,
                    services,
                  })
            }
          />
          <Kpi
            icon={kpiGroupsIcon}
            label={t('catalogReal.kpi.services')}
            value={String(services)}
            note={kpiPaged ? t('catalogReal.kpi.onThisPage') : t('catalogReal.kpi.servicesNote')}
          />
          <Kpi
            icon={kpiEarningIcon}
            label={t('catalogReal.kpi.notStandard')}
            value={String(notStandard)}
            note={kpiPaged ? t('catalogReal.kpi.onThisPage') : t('catalogReal.kpi.notStandardNote')}
          />
          <Kpi
            icon={kpiAttentionIcon}
            highlight={attention > 0}
            tone={attention > 0 ? 'pending' : undefined}
            label={t('catalogReal.kpi.attention')}
            value={String(attention)}
            note={
              kpiPaged
                ? t('catalogReal.kpi.onThisPage')
                : attention > 0
                  ? t('catalogReal.kpi.attentionNote')
                  : t('catalogReal.kpi.attentionNone')
            }
          />
        </div>
      ) : null}

      <section
        aria-labelledby="catalog-products"
        className="overflow-hidden rounded-md bg-surface-card"
      >
        <h2 id="catalog-products" className="sr-only">
          {t('catalogReal.products')}
        </h2>
        {(loaded && items.length > 0) || archivedTab || archivedTotal > 0 ? (
          <TabStrip tabs={tabs} value={tab} onChange={setTab} count={tabBadge} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] w-[345px] max-w-full items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 max-md:w-full">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('catalogReal.search')}
              aria-label={t('catalogReal.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              funnel
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={tabs.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: tabBadge(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu
              value={sort}
              onChange={setSort}
              options={CATALOG_SORTS.map((entry) => ({
                value: entry.value,
                labelKey: entry.labelKey,
              }))}
              width={220}
            />
          </div>
        </div>

        {products.read.status === 'loading' ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : products.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={products.read.error} retry={products.retry} />
          </div>
        ) : rows.length === 0 && !(tab === 'attention' && flaggedElsewhere.length > 0) ? (
          <p className="px-5 pb-10 pt-5 text-center text-sm font-medium text-text-quaternary">
            {items.length > 0
              ? t('catalogReal.noneInTab')
              : search
                ? t('catalogReal.noMatch')
                : t('catalogReal.empty')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse md:min-w-[720px]">
                <thead>
                  <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                    <th className="h-[46px] px-4 text-start font-semibold md:px-5">
                      {t('catalogReal.col.item')}
                    </th>
                    <th className="hidden h-[46px] px-4 text-start font-semibold md:table-cell">
                      {t('catalogReal.col.kind')}
                    </th>
                    <th className="h-[46px] px-4 text-end font-semibold">
                      {t('catalogReal.col.price')}
                    </th>
                    <th className="hidden h-[46px] px-5 text-start font-semibold md:table-cell">
                      {t('catalogReal.col.tax')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => {
                    const service = kindOf(product) === 'service'
                    const odd = needsAttention(product, flagged)
                    const flag = product.zeroRatingAttention ?? flagOf(product.id)
                    const offHere = product.availableHere === false
                    return (
                      <tr
                        key={product.id}
                        className={[
                          'border-b border-surface-background last:border-0',
                          odd ? 'bg-pending-100/30' : '',
                          offHere ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        <td className="px-4 py-4 align-top md:px-5">
                          <div className="flex items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
                              <img
                                src={service ? serviceIcon : productIcon}
                                alt=""
                                className="size-[18px]"
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">
                                <Link
                                  to={`/catalog/${encodeURIComponent(product.id)}`}
                                  className="hover:underline"
                                >
                                  <bdi>{product.name}</bdi>
                                </Link>
                              </p>
                              <p
                                className="mt-1 text-xs font-medium text-text-quaternary"
                                dir="ltr"
                              >
                                {product.code}
                              </p>
                              {flag ? (
                                <p className="mt-1 max-w-[420px] text-xs font-medium leading-[1.4] text-pending-700">
                                  {t(`zeroRating.warning.${flag.code}`, {
                                    hsCode: flag.hsCode ?? t('zeroRating.noHsCode'),
                                    date: formatDisplayDate(flagDate(product), i18n.language),
                                  })}
                                </p>
                              ) : null}
                              {offHere ? (
                                <span className="mt-1.5 inline-flex h-[22px] items-center rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-tertiary">
                                  {t('catalogReal.notOnSaleHere')}
                                </span>
                              ) : null}
                              {!product.active && canManage ? (
                                <button
                                  type="button"
                                  onClick={() => void reactivate(product)}
                                  className="mt-2 inline-flex h-[32px] items-center rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-25"
                                >
                                  {t('catalog.rowMenu.switchOn')}
                                </button>
                              ) : null}
                              {/* Below md the Kind and Tax columns fold in here, so the price
                                  stays on screen at 390 px. */}
                              <p className="mt-1 text-xs font-medium text-text-quaternary md:hidden">
                                {t(service ? 'catalogReal.kind.service' : 'catalogReal.kind.goods')}
                                {' · '}
                                <span className="tabular-nums">
                                  {product.defaultTaxRate === null ? '0' : product.defaultTaxRate}%
                                </span>{' '}
                                {t(`catalogReal.category.${product.defaultTaxCategory}`, {
                                  defaultValue: t('catalogReal.category.other'),
                                })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-4 align-top md:table-cell">
                          <span
                            className={[
                              'inline-flex h-[22px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.5px]',
                              service
                                ? 'bg-surface-background text-text-tertiary'
                                : 'bg-primary-50 text-primary-800',
                            ].join(' ')}
                          >
                            {t(service ? 'catalogReal.kind.service' : 'catalogReal.kind.goods')}
                          </span>
                          <p className="mt-1.5 text-xs font-medium text-text-quaternary">
                            {t('catalogReal.soldBy', { unit: unitWord(product.defaultUnitCode) })}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-top text-end">
                          {(product.effectivePrice ?? product.defaultUnitPrice) > 0 ? (
                            <p className="text-sm font-semibold text-text-primary tabular-nums">
                              <span className="me-1">
                                <Rial />
                              </span>
                              {price(product.effectivePrice ?? product.defaultUnitPrice)}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold text-pending-700">
                              {t('catalogReal.noPrice')}
                            </p>
                          )}
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t('catalogReal.beforeVat')}
                          </p>
                        </td>
                        <td className="hidden px-5 py-4 align-top md:table-cell">
                          <p className="text-sm font-semibold text-text-primary tabular-nums">
                            {product.defaultTaxRate === null ? '0' : product.defaultTaxRate}%
                          </p>
                          <p
                            className={[
                              'mt-1 text-xs font-medium',
                              OMAN_VAT_CATEGORIES.has(product.defaultTaxCategory)
                                ? 'text-text-quaternary'
                                : 'text-pending-700',
                            ].join(' ')}
                          >
                            {t(`catalogReal.category.${product.defaultTaxCategory}`, {
                              defaultValue: t('catalogReal.category.other'),
                            })}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {tab === 'attention' && flaggedElsewhere.length > 0 ? (
              <div className="border-t border-surface-background px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  {t('zeroRating.flagged')}
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {flaggedElsewhere.map((row) => (
                    <li key={row.productId} className="text-sm font-medium text-text-primary">
                      <Link
                        to={`/catalog/${encodeURIComponent(row.productId)}`}
                        className="hover:underline"
                      >
                        <bdi>{row.productName}</bdi>
                      </Link>{' '}
                      <span className="text-xs text-text-quaternary" dir="ltr">
                        {row.productCode}
                      </span>
                      <p className="text-xs leading-[1.4] text-pending-700">
                        {t(`zeroRating.warning.${row.code}`, {
                          hsCode: row.hsCode ?? t('zeroRating.noHsCode'),
                          date: formatDisplayDate(row.judgedOn, i18n.language),
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
              <p className="text-sm font-medium text-text-quaternary">
                {total !== null && total > rows.length
                  ? t('catalogReal.showingOf', { shown: rows.length, total })
                  : t('catalogReal.showingAll', { count: rows.length })}
              </p>
              {paged ? (
                <Pager
                  page={page + 1}
                  pageCount={pageCount}
                  onChange={(next) => setPage(Math.min(Math.max(next, 1), pageCount) - 1)}
                  labels={{
                    nav: t('appList.pager.label'),
                    previous: t('appList.pager.previous'),
                    next: t('appList.pager.next'),
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </section>
    </CatalogShell>
  )
}
