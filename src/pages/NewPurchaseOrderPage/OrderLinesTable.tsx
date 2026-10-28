import { useTranslation } from 'react-i18next'
import { Select, withRial } from '../../components/ui'
import { selectAllOnFocus, unitOptions } from '../../components/invoice'
import type { ReferenceDataDto } from '../../api/reference/referenceData'
import type { ItemType } from '../../lib/invoiceDraft'
import { emptyLine, lineProblem, type LineDraft, type LineProblem } from '../../lib/purchaseOrders'
import { formatAmount } from '../../lib/format'
import { lineFromProduct } from '../../lib/productLine'
import type { ProductDto } from '../../api/catalog/products'
import { OrderProductPick } from './OrderProductPick'
import plusIcon from '../../assets/bill-capture/plus.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const SHELL = 'border-primary-300 bg-surface-tab-bar'
const READONLY = 'border-border-subtle bg-surface-background'
const INPUT =
  'h-[46px] rounded-sm border text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder'

/**
 * The line table shared by New purchase order (Figma 163:27317) and Record a bill (163:27781),
 * on the product owner's line rules: the item is free text, each line says whether it is goods
 * or a service, the unit sits on the row and its list follows that choice ("Other" last), the
 * price excludes VAT at three decimals, and the tax rate is read as text. No pickers, no popups.
 */
export function OrderLinesTable({
  lines,
  onChange,
  currency,
  vatRate,
  taxCategory,
  reference,
  problems,
  language,
  minLines = 1,
  catalogue = false,
  onPickFailure,
}: {
  lines: LineDraft[]
  onChange: (next: LineDraft[]) => void
  currency: string
  /** The supplier's tax rate, as a percent string; every line is priced at it. */
  vatRate: string
  /** What the rate is called ("Standard rate - 5%"), shown as the VAT cell's title. */
  taxCategory: string
  reference: ReferenceDataDto | null
  problems: (LineProblem | null)[]
  language: string
  minLines?: number
  /**
   * Offer a catalogue pick on each line (S2, purchase orders only): the line then names the
   * product it buys, its size or option, and how many of its unit one ordered unit holds.
   */
  catalogue?: boolean
  onPickFailure?: (message: string) => void
}) {
  const { t } = useTranslation()

  const update = (id: string | undefined, patch: Partial<LineDraft>) =>
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  const setType = (line: LineDraft, itemType: ItemType) => {
    const options = unitOptions(itemType, t, undefined, reference)
    update(line.id, { itemType, unit: options[0]?.value ?? 'EA' })
  }

  // Picking fills the line as the invoice's picker does (name, unit, price before VAT); the
  // description stays free text and the supplier's rate stays the line's VAT.
  const pick = (line: LineDraft, product: ProductDto) => {
    const filled = lineFromProduct(reference?.taxCategories ?? [], product, true)
    const variants = (product.variants ?? []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price,
    }))
    update(line.id, {
      productId: product.id,
      productName: product.name,
      description: filled.description,
      unit: filled.unit,
      unitPrice: filled.unitPrice,
      ...(filled.itemType ? { itemType: filled.itemType } : {}),
      variants,
      variantId: null,
      keepCount: product.keepCount === true,
      stockUnit: product.defaultUnitCode,
      stockUnitsPerOrderUnit: '1',
    })
  }

  const pickVariant = (line: LineDraft, variantId: string) => {
    const variant = line.variants?.find((entry) => entry.id === variantId)
    if (!variant) return
    update(line.id, {
      variantId,
      description: variant.name,
      unitPrice: variant.price.toFixed(3),
    })
  }

  const unlink = (line: LineDraft) =>
    update(line.id, {
      productId: null,
      productName: undefined,
      variants: undefined,
      variantId: null,
      keepCount: undefined,
      stockUnit: undefined,
      stockUnitsPerOrderUnit: undefined,
    })

  const lineNet = (line: LineDraft) =>
    lineProblem(line) === null ? Number(line.quantity) * Number(line.unitPrice) : 0

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
              <th className="pb-2 text-start font-semibold">{t('purchaseOrder.col.item')}</th>
              <th className="pb-2 text-end font-semibold">{t('purchaseOrder.col.quantity')}</th>
              <th className="pb-2 text-end font-semibold">{t('createInvoice.items.excl')}</th>
              <th className="pb-2 text-end font-semibold">{t('purchaseOrder.col.vat')}</th>
              <th className="pb-2 text-end font-semibold">{t('purchaseOrder.col.lineTotal')}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const problem = problems[index]
              const kind: ItemType = line.itemType ?? 'goods'
              return (
                <tr
                  key={line.id ?? index}
                  className="border-b border-surface-background last:border-0"
                >
                  <td className="py-2 pe-2 align-top">
                    <input
                      value={line.description}
                      maxLength={500}
                      onChange={(event) => update(line.id, { description: event.target.value })}
                      placeholder={t('purchaseOrder.description')}
                      aria-label={t('purchaseOrder.lineDescription', { line: index + 1 })}
                      aria-invalid={problem === 'description'}
                      className={[INPUT, SHELL, 'w-full min-w-[220px] px-3'].join(' ')}
                    />
                    <span
                      role="group"
                      aria-label={t('createInvoice.items.typeOfLine', { line: index + 1 })}
                      className="mt-1.5 inline-flex h-7 items-center rounded-sm border border-border-subtle bg-white p-0.5"
                    >
                      {(['goods', 'service'] as const).map((option) => {
                        const active = option === kind
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setType(line, option)}
                            aria-pressed={active}
                            className={[
                              'inline-flex h-6 items-center justify-center rounded-[3px] px-2 text-[11px] font-semibold transition-colors',
                              active
                                ? 'bg-primary-700 text-white'
                                : 'text-text-tertiary hover:text-text-secondary',
                            ].join(' ')}
                          >
                            {t(`createInvoice.items.${option}`)}
                          </button>
                        )
                      })}
                    </span>
                    {catalogue ? (
                      <span className="ms-1.5 mt-1.5 inline-flex flex-wrap items-center gap-1.5 align-top">
                        <OrderProductPick
                          line={index + 1}
                          productId={line.productId ?? null}
                          productName={line.productName ?? ''}
                          onPick={(product) => pick(line, product)}
                          onFailure={(message) => onPickFailure?.(message)}
                        />
                        {line.productId ? (
                          <button
                            type="button"
                            onClick={() => unlink(line)}
                            className="text-[11px] font-semibold text-text-tertiary transition-colors hover:text-text-secondary"
                          >
                            {t('purchaseOrder.stock.unlink')}
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                    {catalogue && line.productId && (line.variants?.length ?? 0) > 0 ? (
                      <div className="mt-1.5 w-full max-w-[260px]">
                        <Select
                          compact
                          quiet
                          value={line.variantId ?? ''}
                          onChange={(id) => pickVariant(line, id)}
                          placeholder={t('purchaseOrder.stock.chooseVariant')}
                          options={(line.variants ?? []).map((variant) => ({
                            value: variant.id,
                            label: variant.name,
                          }))}
                          ariaLabel={t('purchaseOrder.stock.variant', { line: index + 1 })}
                        />
                      </div>
                    ) : null}
                    {catalogue && line.productId && line.keepCount ? (
                      <label className="mt-1.5 flex items-center gap-2 text-xs font-medium text-text-tertiary">
                        <input
                          value={line.stockUnitsPerOrderUnit ?? '1'}
                          inputMode="decimal"
                          onFocus={selectAllOnFocus}
                          onChange={(event) =>
                            update(line.id, { stockUnitsPerOrderUnit: event.target.value })
                          }
                          aria-label={t('purchaseOrder.stock.unitsPerOrderUnitLine', {
                            line: index + 1,
                          })}
                          aria-invalid={problem === 'stockUnits'}
                          className={[INPUT, SHELL, 'h-9 w-[76px] px-2 text-end'].join(' ')}
                        />
                        <span>
                          {t('purchaseOrder.stock.unitsPerOrderUnit', {
                            unit: t(`reference.unitShort.${line.stockUnit ?? 'EA'}`, {
                              defaultValue: line.stockUnit ?? '',
                            }),
                          })}
                        </span>
                      </label>
                    ) : null}
                  </td>
                  <td className="px-1 py-2 align-top">
                    <div className="flex items-center gap-1">
                      <input
                        value={line.quantity}
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
                        onChange={(event) => update(line.id, { quantity: event.target.value })}
                        aria-label={t('purchaseOrder.lineQuantity', { line: index + 1 })}
                        aria-invalid={problem === 'quantity'}
                        className={[INPUT, SHELL, 'w-[76px] px-3 text-end'].join(' ')}
                      />
                      <div className="w-[92px] shrink-0">
                        <Select
                          compact
                          value={line.unit}
                          onChange={(unit) => update(line.id, { unit })}
                          options={unitOptions(kind, t, line.unit, reference).map((option) => ({
                            ...option,
                            shortLabel: t(`reference.unitShort.${option.value}`, {
                              defaultValue: option.value,
                            }),
                          }))}
                          ariaLabel={t('purchaseOrder.lineUnit', { line: index + 1 })}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-1 py-2 align-top">
                    <input
                      value={line.unitPrice}
                      inputMode="decimal"
                      onFocus={selectAllOnFocus}
                      onChange={(event) => update(line.id, { unitPrice: event.target.value })}
                      onBlur={(event) => {
                        const value = Number(event.target.value)
                        if (Number.isFinite(value) && event.target.value.trim() !== '') {
                          update(line.id, { unitPrice: Math.max(0, value).toFixed(3) })
                        }
                      }}
                      aria-label={t('purchaseOrder.lineUnitPrice', { line: index + 1 })}
                      aria-invalid={problem === 'unitPrice'}
                      className={[INPUT, SHELL, 'w-[104px] px-3 text-end'].join(' ')}
                    />
                  </td>
                  <td className="px-1 py-2 align-top">
                    <span
                      title={taxCategory}
                      className={[
                        'flex h-[46px] w-[64px] items-center justify-end rounded-sm border px-2 text-sm font-medium text-text-secondary',
                        READONLY,
                      ].join(' ')}
                    >
                      {vatRate}%
                    </span>
                  </td>
                  <td className="px-1 py-2 align-top">
                    <span
                      className={[
                        'flex h-[46px] w-[118px] items-center justify-end gap-1 rounded-sm border px-3 text-sm font-semibold text-text-secondary tabular-nums',
                        READONLY,
                      ].join(' ')}
                    >
                      <img src={omrRowIcon} alt="" className="h-auto w-3.5 shrink-0" />
                      {formatAmount(lineNet(line), currency, language)}
                    </span>
                  </td>
                  <td className="py-2 ps-1 align-top">
                    <button
                      type="button"
                      disabled={lines.length <= minLines}
                      onClick={() => onChange(lines.filter((other) => other.id !== line.id))}
                      aria-label={t('purchaseOrder.removeLine', { line: index + 1 })}
                      className="inline-flex size-[46px] items-center justify-center rounded-sm hover:bg-surface-background disabled:opacity-40"
                    >
                      <img src={deleteIcon} alt="" className="size-5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {problems.some((problem) => problem !== null) ? (
        <p role="alert" className="mt-2 text-xs font-medium text-warning-700">
          {t(`purchaseOrder.error.${problems.find((problem) => problem !== null)}`)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onChange([...lines, emptyLine(vatRate)])}
        className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-sm border border-dashed border-border-default bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-primary-300"
      >
        <img src={plusIcon} alt="" className="size-4" />
        {t('purchaseOrder.addLine')}
      </button>
    </>
  )
}

/** The totals block under the lines, right-aligned as the design draws it. */
export function LinesTotals({
  net,
  vat,
  vatRate,
  total,
  totalLabel,
  currency,
  language,
}: {
  net: number
  vat: number
  vatRate: string
  total: number
  totalLabel: string
  currency: string
  language: string
}) {
  const { t } = useTranslation()
  const money = (value: number) => formatAmount(value, currency, language)
  return (
    <dl className="ms-auto mt-6 w-full max-w-[340px]">
      <div className="flex items-center justify-between gap-4 py-1.5">
        <dt className="text-sm font-medium text-text-tertiary">{t('purchaseOrder.net')}</dt>
        <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
          {money(net)}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-1.5">
        <dt className="text-sm font-medium text-text-tertiary">
          {t('purchaseOrder.vatAt', { rate: vatRate })}
        </dt>
        <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
          {money(vat)}
        </dd>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
        <dt className="text-base font-semibold text-text-primary">{withRial(totalLabel)}</dt>
        <dd className="flex items-center gap-1.5 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
          <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
          {money(total)}
        </dd>
      </div>
    </dl>
  )
}
