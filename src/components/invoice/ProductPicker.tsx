import { useEffect, useState } from 'react'
import { selectAllOnFocus } from './numericInput'
import { useTranslation } from 'react-i18next'
import {
  taxCategoryOptions,
  unitOptions,
  useReferenceData,
} from '../../lib/reference/referenceData'
import { unitOptions as lineUnitOptions } from './unitOptions'
import { Combobox, Input, Modal, Select, type SelectOption } from '../ui'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  createProduct,
  productSearchPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'
import { newProductFrom, suggestProductCode, taxCategoryOf } from '../../lib/productLine'
import { can, useSession } from '../../lib/session/session'
import { ApiError } from '../../api/errors'
import chevronIcon from '../../assets/create-invoice/chevron.svg'

/** How long typing pauses before the catalogue is searched. */
const SEARCH_DELAY_MS = 250

/**
 * The description cell of an invoice line: a product from the catalogue (decision D7: a line
 * names a product), searched on the server, with "Create “…”" for one that is not there yet.
 *
 * Nothing is fetched until the list is opened, so a form with many lines asks nothing on load.
 */
export function ProductPicker({
  productId,
  label,
  onPick,
}: {
  productId: string | null
  /** What the line says now: the picked product's name, or text from before there was a product. */
  label: string
  onPick: (product: ProductDto) => void
}) {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  const session = useSession()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  const path = query === null ? null : productSearchPath(query)
  const found = useApiRead<Page<ProductDto>>(path, () => searchProducts(path!))
  const products = found.read.status === 'ready' ? found.read.data.items : []

  const taxLabel = (code: string | undefined) =>
    code ? t(`reference.taxCategory.${code}`, { defaultValue: code }) : undefined
  const options: SelectOption[] = products.map((product) => ({
    value: product.id,
    label: product.name,
    hint: t('productPicker.hint', {
      code: product.code,
      price: formatAmount(product.defaultUnitPrice, 'OMR', i18n.language),
      unit: product.defaultUnitCode,
      tax:
        taxLabel(
          taxCategoryOf(
            reference?.taxCategories ?? [],
            product.defaultTaxCategory,
            product.defaultTaxRate,
          )?.code,
        ) ?? product.defaultTaxCategory,
    }),
  }))

  const emptyText =
    found.read.status === 'failed'
      ? t(describeApiFailure(found.read.error).key)
      : found.read.status === 'loading' || query === null
        ? t('productPicker.searching')
        : t('productPicker.none')

  return (
    <>
      <Combobox
        value={productId ?? ''}
        onChange={(id) => {
          const product = products.find((candidate) => candidate.id === id)
          if (product) onPick(product)
        }}
        options={options}
        onSearch={setTyped}
        searchPlaceholder={t('productPicker.search')}
        ariaLabel={t('createInvoice.items.description')}
        emptyText={emptyText}
        renderTrigger={({ open }) => (
          <span className="flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
            <span
              className={[
                'min-w-0 flex-1 truncate text-sm font-medium',
                label ? 'text-text-secondary' : 'text-text-placeholder',
              ].join(' ')}
            >
              {label || t('productPicker.placeholder')}
            </span>
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className={['size-6 shrink-0', open ? '-rotate-90' : 'rotate-90'].join(' ')}
            />
          </span>
        )}
        footer={
          can(session, 'product.manage')
            ? ({ query: text, close }) => (
                <button
                  type="button"
                  onClick={() => {
                    close()
                    setCreating(text.trim())
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-25"
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    +
                  </span>
                  {text.trim()
                    ? t('productPicker.createNamed', { name: text.trim() })
                    : t('productPicker.create')}
                </button>
              )
            : undefined
        }
      />
      {creating !== null ? (
        <QuickCreateProduct
          initialName={creating}
          onClose={() => setCreating(null)}
          onCreated={(product) => {
            setCreating(null)
            onPick(product)
          }}
        />
      ) : null}
    </>
  )
}

/**
 * The fewest fields a product needs to go on a line. Everything else about it (description,
 * classification) is edited in the catalogue.
 */
function QuickCreateProduct({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string
  onClose: () => void
  onCreated: (product: ProductDto) => void
}) {
  const { t } = useTranslation()
  const reference = useReferenceData()
  const [name, setName] = useState(initialName)
  const [code, setCode] = useState(() => (initialName ? suggestProductCode(initialName) : ''))
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('EA')
  const [taxCode, setTaxCode] = useState('S5')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ field: 'code' | null; message: string } | null>(null)

  const valid =
    name.trim() !== '' && code.trim() !== '' && price.trim() !== '' && Number(price) >= 0

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    setFailure(null)
    try {
      onCreated(
        await createProduct(
          newProductFrom(reference?.taxCategories ?? [], { code, name, unit, price, taxCode }),
        ),
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PRODUCT_CODE_DUPLICATE') {
        setFailure({ field: 'code', message: t('productPicker.codeTaken') })
      } else {
        const message = describeApiFailure(error)
        setFailure({ field: null, message: t(message.key, message.values) })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('productPicker.newTitle')}
      subtitle={t('productPicker.newSubtitle')}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid || saving}
            className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? t('productPicker.saving') : t('productPicker.saveAndUse')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          bordered
          label={t('productPicker.name')}
          requiredMark
          value={name}
          maxLength={500}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          bordered
          label={t('productPicker.code')}
          requiredMark
          value={code}
          maxLength={100}
          hint={t('productPicker.codeHint')}
          error={failure?.field === 'code' ? failure.message : undefined}
          onChange={(event) => setCode(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            bordered
            label={t('productPicker.price')}
            requiredMark
            inputMode="decimal"
            onFocus={selectAllOnFocus}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            {t('productPicker.unit')}
            <Select
              value={unit}
              onChange={setUnit}
              options={
                // The platform's unit list; the composer's goods list (with Other) until it answers.
                reference?.units.length
                  ? unitOptions(reference, t, unit)
                  : lineUnitOptions('goods', t, unit)
              }
              ariaLabel={t('productPicker.unit')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            {t('productPicker.tax')}
            <Select
              value={taxCode}
              onChange={setTaxCode}
              options={taxCategoryOptions(reference, t)}
              ariaLabel={t('productPicker.tax')}
            />
          </label>
        </div>
        {failure && failure.field === null ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {failure.message}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
