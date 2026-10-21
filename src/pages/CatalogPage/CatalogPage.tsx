import { useTranslation } from 'react-i18next'
import { CatalogShell } from './CatalogShell'
import { useApiRead } from '../../hooks'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { productSearchPath, searchProducts, type ProductDto } from '../../api/catalog/products'
import type { Page } from '../../api'
import { Link } from 'react-router-dom'
import { demoModulesEnabled } from '../../lib/demoModules'
import plusIcon from '../../assets/catalog/plus-white.svg'
import uploadIcon from '../../assets/catalog/upload-ink.svg'

/** One page large enough to see a small catalogue whole; the footer says when there are more. */
const CATALOG_PAGE_SIZE = 100

/**
 * Catalog: the company's own products from `GET /v1/products`, the same records an invoice line
 * is raised from. The screen used to draw a sample coffee shop's menu, groups, sales counts and
 * stock; the menu upload, price rules, bundles and per-item history behind it have no server yet
 * and are labelled as not available on their own routes.
 */
export function CatalogPage() {
  const { t, i18n } = useTranslation()
  const path = productSearchPath('', CATALOG_PAGE_SIZE)
  const products = useApiRead<Page<ProductDto>>(path, () => searchProducts(path))
  const price = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })

  return (
    <CatalogShell
      branch
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
      <section aria-labelledby="catalog-products" className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
        <h2 id="catalog-products" className="text-lg font-semibold text-text-primary">
          {t('catalogReal.products')}
        </h2>
        {products.read.status === 'loading' ? (
          <LoadingNotice />
        ) : products.read.status === 'failed' ? (
          <ApiReadFailure error={products.read.error} retry={products.retry} />
        ) : products.read.data.items.length === 0 ? (
          <p className="text-sm font-medium text-text-tertiary">{t('catalogReal.empty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-border-subtle">
                  <tr>
                    {(['code', 'name', 'unit', 'price', 'tax'] as const).map((column) => (
                      <th
                        key={column}
                        className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary"
                      >
                        {t(`catalogReal.col.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.read.data.items.map((product) => (
                    <tr key={product.id} className="border-b border-surface-background last:border-0">
                      <td className="px-3 py-3 text-sm font-medium text-text-secondary" dir="ltr">
                        {product.code}
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-text-primary">{product.name}</td>
                      <td className="px-3 py-3 text-sm font-medium text-text-secondary">{product.defaultUnitCode}</td>
                      <td className="px-3 py-3 text-sm font-medium text-text-primary">
                        {t('catalogReal.omr', { amount: price(product.defaultUnitPrice) })}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-text-secondary">
                        {product.defaultTaxRate === null
                          ? product.defaultTaxCategory
                          : `${product.defaultTaxCategory} · ${product.defaultTaxRate}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {products.read.data.total !== null && products.read.data.total > products.read.data.items.length ? (
              <p className="text-sm font-medium text-text-tertiary">
                {t('catalogReal.more', {
                  shown: products.read.data.items.length,
                  total: products.read.data.total,
                })}
              </p>
            ) : null}
          </>
        )}
      </section>
    </CatalogShell>
  )
}
