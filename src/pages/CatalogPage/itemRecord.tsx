import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { getProduct, productPath, type ProductDto } from '../../api/catalog/products'
import {
  CATALOG_GROUPS_PATH,
  catalogNameOf,
  getCatalogGroups,
  type CatalogGroupsDto,
} from '../../api/catalog/groups'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { CatalogShell, Pill } from './CatalogShell'

/** Names a kind (and its group) from `GET /v1/catalog/groups`, in the reader's language. */
export function useKindNames() {
  const { i18n } = useTranslation()
  const read = useApiRead<CatalogGroupsDto>(CATALOG_GROUPS_PATH, getCatalogGroups)
  const groups = read.read.status === 'ready' ? read.read.data.groups : []
  const kindOf = (kindId: string | null | undefined) => {
    if (!kindId) return null
    for (const group of groups) {
      const kind = group.kinds.find((entry) => entry.id === kindId)
      if (kind) {
        return {
          group: catalogNameOf(group, i18n.language),
          kind: catalogNameOf(kind, i18n.language),
        }
      }
    }
    return null
  }
  return { groups, kindOf }
}

/**
 * The item the three read-only tabs belong to (`GET /v1/products/{id}`, the same read the item
 * form makes, so it is asked once), with its group and kind named.
 */
export function useItemRecord(id: string) {
  const path = productPath(id)
  const read = useApiRead<ProductDto>(path, () => getProduct(id))
  const { kindOf } = useKindNames()
  const product = read.read.status === 'ready' ? read.read.data : null
  const names = kindOf(product?.kindId)
  return { read, product, group: names?.group ?? '', kind: names?.kind ?? '' }
}

/** "On sale" or "Off sale", and the units sold when the page knows them. */
export function ItemPills({ product, sold }: { product: ProductDto; sold?: number | null }) {
  const { t } = useTranslation()
  return (
    <>
      {product.active ? (
        <Pill tone="success">{t('item.onSale')}</Pill>
      ) : (
        <Pill tone="neutral">{t('catalogReal.tab.archived')}</Pill>
      )}
      {sold !== undefined && sold !== null ? (
        <Pill tone="brand">
          {sold > 0
            ? t('item.soldTimes', { count: sold.toLocaleString('en-US') })
            : t('item.soldNone')}
        </Pill>
      ) : null}
    </>
  )
}

/** The page frame while the item is read, or when it could not be. */
export function ItemReadState({
  read,
  children,
}: {
  read: ReturnType<typeof useItemRecord>['read']
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (read.read.status === 'ready') return <>{children}</>
  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }]}
      title={t('catalog.title')}
    >
      {read.read.status === 'failed' ? (
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      ) : (
        <LoadingNotice />
      )}
    </CatalogShell>
  )
}
