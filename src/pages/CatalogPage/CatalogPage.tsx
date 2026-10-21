import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi } from './CatalogShell'
import { useApiRead } from '../../hooks'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { Rial } from '../../components/ui'
import { productSearchPath, searchProducts, type ProductDto } from '../../api/catalog/products'
import type { Page } from '../../api'
import { Link } from 'react-router-dom'
import { demoModulesEnabled } from '../../lib/demoModules'
import { itemTypeOfUnit, OMAN_VAT_CATEGORIES } from '../../lib/invoiceDraft'
import plusIcon from '../../assets/catalog/plus-white.svg'
import uploadIcon from '../../assets/catalog/upload-ink.svg'
import searchIcon from '../../assets/invoices/search.svg'
import productIcon from '../../assets/catalog/kind-product.svg'
import serviceIcon from '../../assets/catalog/kind-service.svg'
import kpiItemsIcon from '../../assets/catalog/kpi-items.svg'
import kpiGroupsIcon from '../../assets/catalog/kpi-groups.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'

/** One page large enough to see a small catalogue whole; the footer says when there are more. */
const CATALOG_PAGE_SIZE = 100
/** How long typing pauses before the search goes to the server. */
const SEARCH_DELAY_MS = 250

/** Goods or service: the product's own flag once the API carries it (P.1), else its unit. */
const kindOf = (product: ProductDto) =>
  product.itemType
    ? product.itemType === 'SERVICE'
      ? 'service'
      : 'goods'
    : itemTypeOfUnit(product.defaultUnitCode)

/** No price, or a VAT category Oman does not use (CL-04-OM): the product needs a look. */
const needsAttention = (product: ProductDto) =>
  !(product.defaultUnitPrice > 0) || !OMAN_VAT_CATEGORIES.has(product.defaultTaxCategory)

/**
 * Catalog: the company's own products from `GET /v1/products`, the same records an invoice line
 * is raised from.
 *
 * Styled as the Catalog frame (Figma "Catalog -> Main Screen"): figure cards, a search, the dark
 * table head and item rows with their kind, price and VAT in words. Every figure is worked out
 * from the products the server returned; the frame's groups, stock and sales columns have no
 * field on the product yet (docs/backend-guides/INCOME.md, rows P.1 to P.10), so they are not
 * drawn rather than invented.
 */
export function CatalogPage() {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [query])

  const path = productSearchPath(search, CATALOG_PAGE_SIZE)
  const products = useApiRead<Page<ProductDto>>(path, () => searchProducts(path))
  const items = products.read.status === 'ready' ? products.read.data.items : []
  const total = products.read.status === 'ready' ? (products.read.data.total ?? items.length) : null
  const services = items.filter((product) => kindOf(product) === 'service').length
  const attention = items.filter(needsAttention).length
  const notStandard = items.filter((product) => product.defaultTaxCategory !== 'S').length

  const price = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const unitWord = (code: string) =>
    t(`createInvoice.units.${code}`, {
      defaultValue: t(`reference.unitShort.${code}`, { defaultValue: code }),
    })

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
      {demoModulesEnabled() ? null : (
        <Notice badge={t('moduleUnavailable.badge')} body={t('catalogReal.toolsUnavailable')} />
      )}

      {products.read.status === 'ready' && !search ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={kpiItemsIcon}
            label={t('catalogReal.kpi.things')}
            value={String(total ?? 0)}
            note={t('catalogReal.kpi.thingsNote', {
              goods: items.length - services,
              services,
            })}
          />
          <Kpi
            icon={kpiGroupsIcon}
            label={t('catalogReal.kpi.services')}
            value={String(services)}
            note={t('catalogReal.kpi.servicesNote')}
          />
          <Kpi
            icon={kpiEarningIcon}
            label={t('catalogReal.kpi.notStandard')}
            value={String(notStandard)}
            note={t('catalogReal.kpi.notStandardNote')}
          />
          <Kpi
            icon={kpiAttentionIcon}
            highlight={attention > 0}
            tone={attention > 0 ? 'pending' : undefined}
            label={t('catalogReal.kpi.attention')}
            value={String(attention)}
            note={
              attention > 0
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
        <div className="p-5">
          <label className="flex h-[46px] w-full max-w-[420px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('catalogReal.search')}
              aria-label={t('catalogReal.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
        </div>

        {products.read.status === 'loading' ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : products.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={products.read.error} retry={products.retry} />
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 pb-10 pt-5 text-center text-sm font-medium text-text-quaternary">
            {search ? t('catalogReal.noMatch') : t('catalogReal.empty')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                    <th className="h-[46px] px-5 text-start font-semibold">
                      {t('catalogReal.col.item')}
                    </th>
                    <th className="h-[46px] px-4 text-start font-semibold">
                      {t('catalogReal.col.kind')}
                    </th>
                    <th className="h-[46px] px-4 text-end font-semibold">
                      {t('catalogReal.col.price')}
                    </th>
                    <th className="h-[46px] px-5 text-start font-semibold">
                      {t('catalogReal.col.tax')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((product) => {
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
                        <td className="px-5 py-4 align-top">
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
                                {product.name}
                              </p>
                              <p
                                className="mt-1 text-xs font-medium text-text-quaternary"
                                dir="ltr"
                              >
                                {product.code}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
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
                        <td className="px-4 py-4 align-top text-end">
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
                        <td className="px-5 py-4 align-top">
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
            <p className="border-t border-surface-background px-5 py-4 text-sm font-medium text-text-quaternary">
              {total !== null && total > items.length
                ? t('catalogReal.more', { shown: items.length, total })
                : t('catalogReal.showingAll', { count: items.length })}
            </p>
          </>
        )}
      </section>
    </CatalogShell>
  )
}
