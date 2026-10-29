import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductDto } from '../../api/catalog/products'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { CatalogShell, Pill } from './CatalogShell'
import type { useItemRecord } from './itemRecordHooks'

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
