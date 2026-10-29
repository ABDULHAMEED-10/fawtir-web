import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, type SelectOption } from '../../components/ui'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  getProduct,
  productSearchPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'

/** How long typing pauses before the catalogue is searched, as the invoice's picker waits. */
const SEARCH_DELAY_MS = 250

/**
 * The optional catalogue pick on a purchase-order line (S2): the description stays free text, and
 * a product picked here names what the line buys, so goods received on it raise the product's
 * stock. Searched on the server as the invoice's product picker searches; nothing is fetched until
 * the list is opened. The search asks for each row's sizes and options (`include=variants`, backend
 * #808, INCOME.md P.24, not deployed yet), so a pick needs no other read; a server without it
 * answers them as null, and the one-product read then follows the pick as before.
 */
export function OrderProductPick({
  line,
  productId,
  productName,
  onPick,
  onFailure,
}: {
  line: number
  productId: string | null
  productName: string
  onPick: (product: ProductDto) => void
  onFailure: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)

  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  const { branch } = useWorkingBranch()
  const path =
    query === null ? null : productSearchPath(query, undefined, 0, branch?.id, ['variants'])
  const found = useApiRead<Page<ProductDto>>(path, () => searchProducts(path!))
  const products = found.read.status === 'ready' ? found.read.data.items : []
  const options: SelectOption[] = products.map((product) => ({
    value: product.id,
    label: product.name,
    hint: t('purchaseOrder.stock.pickHint', {
      code: product.code,
      price: formatAmount(product.effectivePrice ?? product.defaultUnitPrice, 'OMR', i18n.language),
      unit: product.defaultUnitCode,
    }),
  }))
  const emptyText =
    found.read.status === 'failed'
      ? t(describeApiFailure(found.read.error).key)
      : found.read.status === 'loading' || query === null
        ? t('productPicker.searching')
        : t('productPicker.none')

  return (
    <Combobox
      value={productId ?? ''}
      onChange={(id) => {
        const listed = products.find((candidate) => candidate.id === id)
        if (!listed) return
        // The row already carries its sizes and options (null from an older server).
        if (Array.isArray(listed.variants)) {
          onPick(listed)
          return
        }
        getProduct(id).then(
          (product) => onPick({ ...product, effectivePrice: listed.effectivePrice }),
          (error) => onFailure(t(describeApiFailure(error).key)),
        )
      }}
      options={options}
      onSearch={setTyped}
      searchPlaceholder={t('productPicker.search')}
      ariaLabel={t('purchaseOrder.stock.pick', { line })}
      emptyText={emptyText}
      renderTrigger={() => (
        <span className="inline-flex h-7 max-w-[220px] items-center rounded-sm border border-border-subtle bg-white px-2 text-[11px] font-semibold text-primary-700 transition-colors hover:border-primary-300">
          <span className="truncate">
            {productId ? productName : t('purchaseOrder.stock.fromCatalogue')}
          </span>
        </span>
      )}
    />
  )
}
