import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { useApiRead } from '../../hooks'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { FilterMenu, Pager, Rial, SortMenu } from '../../components/ui'
import { productSearchPath, searchProducts, type ProductDto } from '../../api/catalog/products'
import { pageCountOf, type Page } from '../../api'
import { Link } from 'react-router-dom'
import { CatalogEmptyState } from './CatalogEmptyState'
import { demoModulesEnabled } from '../../lib/demoModules'
import { OMAN_VAT_CATEGORIES } from '../../lib/invoiceDraft'
import {
  CATALOG_SORTS,
  CATALOG_TABS,
  catalogRows,
  kindOf,
  matchesCatalogTab,
  needsAttention,
  type CatalogSort,
  type CatalogTab,
} from './catalogList'
import plusIcon from '../../assets/catalog/plus-white.svg'
import uploadIcon from '../../assets/catalog/upload-ink.svg'
import searchIcon from '../../assets/invoices/search.svg'
import productIcon from '../../assets/catalog/kind-product.svg'
import serviceIcon from '../../assets/catalog/kind-service.svg'
import kpiItemsIcon from '../../assets/catalog/kpi-items.svg'
import kpiGroupsIcon from '../../assets/catalog/kpi-groups.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'

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
 * from the products the server returned; the frame's groups, stock and sales columns have no
 * field on the product yet (docs/backend-guides/INCOME.md, rows P.1 to P.10), so they are not
 * drawn rather than invented.
 */
export function CatalogPage() {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  // The search and its page move together: a new search starts again from its first page.
  const [{ search, page }, setPaging] = useState({ search: '', page: 0 })
  const setPage = (next: number) => setPaging((current) => ({ ...current, page: next }))
  const [tab, setTab] = useState<CatalogTab>('all')
  const [sort, setSort] = useState<CatalogSort>('name')
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = query.trim()
      setPaging((current) => (current.search === next ? current : { search: next, page: 0 }))
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [query])

  const path = productSearchPath(search, CATALOG_PAGE_SIZE, page)
  const products = useApiRead<Page<ProductDto>>(path, () => searchProducts(path))
  const loaded = products.read.status === 'ready' ? products.read.data : null
  const items = useMemo(() => loaded?.items ?? [], [loaded])
  const total = loaded ? (loaded.total ?? items.length) : null
  const pageCount = loaded ? pageCountOf(loaded) : 1
  const paged = pageCount > 1
  // Tabs and sorting work over the page the server sent: the product list has no server-side
  // filter for kind or VAT category, and no sort parameter this screen relies on.
  const rows = useMemo(
    () => catalogRows(items, tab, sort, i18n.language),
    [items, tab, sort, i18n.language],
  )
  const tabCount = (id: CatalogTab) =>
    items.filter((product) => matchesCatalogTab(product, id)).length
  const services = items.filter((product) => kindOf(product) === 'service').length
  const attention = items.filter(needsAttention).length
  const notStandard = items.filter((product) => product.defaultTaxCategory !== 'S').length

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
  if (loaded && page === 0 && !search && !query.trim() && items.length === 0) {
    return <CatalogEmptyState notice={unavailable} />
  }

  return (
    <CatalogShell
      crumbs={[]}
      title={t('catalogReal.title')}
      subtitle={t('catalogReal.subtitle')}
      actions={
        // The product list is the integrated part; menu upload and the item editor have no server
        // yet, so they open their prototypes (under the sample-data ribbon) while prototypes are on.
        demoModulesEnabled() ? (
          <>
            <Link
              to="/catalog/upload"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={uploadIcon} alt="" className="size-[18px]" />
              {t('catalog.uploadAMenu')}
            </Link>
            <Link
              to="/catalog/new"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('catalog.newItem')}
            </Link>
          </>
        ) : undefined
      }
    >
      {unavailable}

      {products.read.status === 'ready' && !search ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={kpiItemsIcon}
            label={t('catalogReal.kpi.things')}
            value={String(total ?? 0)}
            // TODO(backend): the list counts only what is on the page it returns, so across
            // several pages the split of goods and services is this page's (INCOME.md P.1).
            note={
              paged
                ? t('catalogReal.kpi.thingsPagedNote', {
                    goods: items.length - services,
                    services,
                  })
                : t('catalogReal.kpi.thingsNote', {
                    goods: items.length - services,
                    services,
                  })
            }
          />
          <Kpi
            icon={kpiGroupsIcon}
            label={t('catalogReal.kpi.services')}
            value={String(services)}
            note={paged ? t('catalogReal.kpi.onThisPage') : t('catalogReal.kpi.servicesNote')}
          />
          <Kpi
            icon={kpiEarningIcon}
            label={t('catalogReal.kpi.notStandard')}
            value={String(notStandard)}
            note={paged ? t('catalogReal.kpi.onThisPage') : t('catalogReal.kpi.notStandardNote')}
          />
          <Kpi
            icon={kpiAttentionIcon}
            highlight={attention > 0}
            tone={attention > 0 ? 'pending' : undefined}
            label={t('catalogReal.kpi.attention')}
            value={String(attention)}
            note={
              paged
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
        {loaded && items.length > 0 ? (
          <TabStrip tabs={CATALOG_TABS} value={tab} onChange={setTab} count={tabCount} />
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
              options={CATALOG_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: tabCount(entry.id),
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
        ) : rows.length === 0 ? (
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
                    const odd = needsAttention(product)
                    return (
                      <tr
                        key={product.id}
                        className={[
                          'border-b border-surface-background last:border-0',
                          odd ? 'bg-pending-100/30' : '',
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
                                <bdi>{product.name}</bdi>
                              </p>
                              <p
                                className="mt-1 text-xs font-medium text-text-quaternary"
                                dir="ltr"
                              >
                                {product.code}
                              </p>
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
                          {product.defaultUnitPrice > 0 ? (
                            <p className="text-sm font-semibold text-text-primary tabular-nums">
                              <span className="me-1">
                                <Rial />
                              </span>
                              {price(product.defaultUnitPrice)}
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
